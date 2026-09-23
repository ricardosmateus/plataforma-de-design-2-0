/* ============================================================
   Rota: "Gerar com ajuda da IA" no modal "Nova tarefa" — ATV-GERAR
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/atividade-lista.md,
           ATV-GERAR-010 a 016; board-lista.md, BOARD-REF-009

   POST .../ideias/:ideiaId/tarefas/gerar   { tipo, orientacao? }

   O clique é a autorização do gasto (mesma leitura de D12 no
   planejamento da pesquisa: "ele já clicou"). A rota:

     1. reserva o teto ANTES de chamar qualquer provedor — a proposta
        e, na Referência, a busca (IA-CUSTO-002);
     2. pede ao Senior Product Designer a tarefa do tipo escolhido;
     3. cria a tarefa (no fim da lista, pendente — ATV-TAR-CRIA);
     4. na Referência, busca concorrentes, sites, logotipos e
        documentos e grava os cards (referencias/coleta.ts);
     5. acerta a reserva pelo custo real.

   Pesquisa e Matriz CSD param no passo 3 aqui. A Pesquisa é
   executada pelo board, que já sabe pesquisar (a resposta diz
   `proximo: 'pesquisar'`): uma segunda pesquisa no servidor seria um
   segundo caminho para o mesmo resultado. A Matriz CSD ainda não tem
   onde guardar conteúdo (matriz_csd.html não fala com a API) — ver
   ATV-GERAR-015.
   ============================================================ */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { db } from '../db.js';
import { env } from '../env.js';
import { iaConfigurada } from '../ia/provedor.js';
import { ORIENTACAO_MAX } from '../ia/gerar-ideias.js';
import {
  SISTEMA_TAREFA,
  MAX_TOKENS_PROPOSTA,
  montarMensagemTarefa,
  interpretarTarefa,
  pedirTarefa,
  type TipoGeravel,
} from '../ia/gerar-tarefa.js';
import {
  SISTEMA_MATRIZ,
  MAX_TOKENS_MATRIZ,
  TITULO_COLUNA,
  montarMensagemMatriz,
  interpretarMatriz,
  completarComTarefas,
  pedirMatriz,
} from '../ia/classificar-matriz.js';
import { modeloDaBusca } from '../pesquisa/provedor-claude-busca.js';
import { pacoteParaTexto } from '../pesquisa/contexto-interno.js';
import { nomeDoTipo } from '../projetos/catalogo.js';
import { type ResultadoColeta } from '../referencias/coleta.js';
import { concorrentesConhecidos, tetoDaBusca, executarBusca } from '../referencias/busca-com-ia.js';
import { registrar } from '../creditos/registro.js';
import { tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { abrirContexto, podeEscrever, criarTarefaNoFim, tarefaParaResposta, TIPOS_VALIDOS } from './tarefas.js';
import { pacoteInternoDa } from './pesquisa.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

const corpoGerar = z.object({
  tipo: z.enum(TIPOS_VALIDOS, { errorMap: () => ({ message: 'Escolha um tipo válido para a tarefa.' }) }),
  orientacao: z.string().max(ORIENTACAO_MAX, `A orientação deve ter no máximo ${ORIENTACAO_MAX} caracteres.`).optional(),
});

function emReais(usdMicros: number): number {
  return comissaoSobre(usdParaMicrosBrl(usdMicros, cotacaoParaMilesimos(env.COTACAO_USD_BRL))).totalMicros;
}

export async function rotasGerarTarefa(app: FastifyInstance) {
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/gerar', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* ATV-GERAR-011: gerar é criar tarefa — mesma régua de quem cria à mão. */
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar tarefas.'));
    }
    if (!iaConfigurada()) {
      return resposta.code(503).send(erro(null, 'O assistente de IA ainda não está configurado neste ambiente.'));
    }
    const corpo = corpoGerar.safeParse(req.body ?? {});
    if (!corpo.success) {
      const p = corpo.error.issues[0];
      return resposta.code(400).send(erro(typeof p?.path?.[0] === 'string' ? p.path[0] : null, p?.message ?? 'Dados inválidos.'));
    }
    const tipo = corpo.data.tipo as TipoGeravel;
    const ehReferencia = tipo === 'referencias_visuais';

    const modeloBusca = ehReferencia ? modeloDaBusca() : null;
    if (ehReferencia && !modeloBusca) {
      return resposta.code(503).send(erro(null, 'A busca na web ainda não está configurada neste ambiente.'));
    }

    /* ---- O contexto: a empresa inteira + o lugar onde a pessoa está ---- */
    const projeto = await db.projeto.findFirst({
      where: { id: ctx.projetoId, empresaId: ctx.empresaId },
      select: { nome: true, tipo: true, empresa: { select: { nome: true, descricao: true } } },
    });
    if (!projeto) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    const [tarefas, pacote, concorrentes] = await Promise.all([
      db.tarefa.findMany({
        where: { ideiaId: ctx.ideia.id },
        orderBy: { ordem: 'asc' },
        select: { titulo: true, tipo: true, status: true },
      }),
      pacoteInternoDa({ empresaId: ctx.empresaId, projetoId: ctx.projetoId, tarefaId: null, ideiaId: ctx.ideia.id }),
      concorrentesConhecidos(ctx.empresaId, projeto.empresa.nome),
    ]);

    const mensagem = montarMensagemTarefa({
      tipo,
      empresaNome: projeto.empresa.nome,
      empresaDescricao: projeto.empresa.descricao ?? null,
      projetoNome: projeto.nome ?? nomeDoTipo(projeto.tipo),
      atividadeTitulo: ctx.ideia.titulo,
      atividadeDescricao: ctx.ideia.descricao,
      tarefas: tarefas.map((t) => ({ titulo: t.titulo, tipo: t.tipo, status: t.status })),
      conhecimento: pacoteParaTexto(pacote),
      concorrentesConhecidos: concorrentes,
      orientacao: corpo.data.orientacao ?? null,
    });

    /* ---- Reserva de TUDO antes de chamar qualquer coisa ----
       A busca é reservada junto com a proposta: descobrir falta de
       saldo depois de a tarefa existir deixaria uma Referência vazia
       que a pessoa não pediu assim. */
    const opProposta = randomUUID();
    const opBusca = randomUUID();
    const tetoPropostaUsd = tetoUsdMicros(env.IA_MODELO as string, SISTEMA_TAREFA + '\n' + mensagem, MAX_TOKENS_PROPOSTA);
    const pedidoBusca = {
      empresaNome: projeto.empresa.nome,
      empresaDescricao: projeto.empresa.descricao ?? null,
      atividadeTitulo: ctx.ideia.titulo,
      tarefaDescricao: 'x'.repeat(280),
      concorrentesConhecidos: concorrentes,
    };
    const tetoBuscaReais = ehReferencia ? tetoDaBusca(modeloBusca as string, pedidoBusca) : 0;
    if (tetoPropostaUsd === null || tetoBuscaReais === null) {
      return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
    }
    const tetoProposta = emReais(tetoPropostaUsd);
    const tetoBusca = tetoBuscaReais;

    try {
      await reservar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para gerar a tarefa. Adicione créditos para continuar.'));
      }
      throw e;
    }
    if (ehReferencia) {
      try {
        await reservar(ctx.usuarioId, tetoBusca, opBusca, 'pesquisa');
      } catch (e) {
        await liberar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
        if (e instanceof SaldoInsuficiente) {
          return resposta.code(402).send(erro(null, 'Saldo insuficiente para buscar as referências. Adicione créditos para continuar.'));
        }
        throw e;
      }
    }

    /* ---- 2. A proposta ---- */
    const r = await pedirTarefa(mensagem);
    const proposta = r.ok ? interpretarTarefa(r.bruto) : null;
    if (r.uso && r.modelo) {
      registrar({
        usuarioId: ctx.usuarioId,
        empresaId: ctx.empresaId,
        projetoId: ctx.projetoId,
        ideiaId: ctx.ideia.id,
        tipo: 'assistente',
        resultado: proposta ? 'entregue' : 'descartado',
        modelo: r.modelo,
        uso: r.uso,
        requisicaoId: r.requisicaoId,
        operacaoId: opProposta,
      });
    }
    await liberar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');

    if (!proposta) {
      /* Nada criado, nada cobrado (IA-CUSTO-003) — nem a busca, que
         nem começou. */
      if (ehReferencia) await liberar(ctx.usuarioId, tetoBusca, opBusca, 'pesquisa');
      const msg = !r.ok && r.motivo === 'rede'
        ? 'Não foi possível falar com o provedor de IA. Tente de novo.'
        : 'Não foi possível gerar a tarefa agora. Tente de novo em instantes.';
      return resposta.code(503).send(erro(null, msg));
    }
    if (r.uso && r.modelo) {
      const usd = custoUsdMicros(r.modelo, r.uso);
      if (usd !== null && usd > 0) await consumir(ctx.usuarioId, emReais(usd), opProposta, 'assistente');
    }

    /* ---- 3. A tarefa ---- */
    const tarefa = await criarTarefaNoFim(ctx.ideia.id, { titulo: proposta.titulo, descricao: proposta.descricao, tipo });

    /* ---- 4. Referência: a busca e os cards ---- */
    let coleta: ResultadoColeta | null = null;
    let concorrentesAchados = 0;
    if (ehReferencia) {
      const r2 = await executarBusca({
        usuarioId: ctx.usuarioId,
        tarefaId: tarefa.id,
        modelo: modeloBusca as string,
        pedido: { ...pedidoBusca, tarefaDescricao: proposta.descricao },
        tetoReservado: tetoBusca,
        operacaoId: opBusca,
      });
      coleta = r2.coleta;
      concorrentesAchados = r2.concorrentes;
    }

    return resposta.code(201).send({
      tarefa: tarefaParaResposta(tarefa),
      /* O que a tela faz em seguida. */
      proximo: tipo === 'pesquisa' ? 'pesquisar' : ehReferencia ? 'abrir' : 'classificar',
      referencias: coleta
        ? { concorrentes: concorrentesAchados, sites: coleta.sites, imagens: coleta.imagens, documentos: coleta.documentos }
        : null,
      avisos: coleta ? coleta.avisos.slice(0, 12) : [],
    });
  });

  /* ---------- "Gerar classificação com IA" — MATRIZ-IA-001 a 006 ----------
     A matriz é de uma tarefa `matriz_csd`; o que ela classifica são as
     OUTRAS tarefas da mesma atividade (e até 3 extras que o
     especialista ache que faltam). A rota NÃO grava: devolve os cards
     com a coluna de cada um, e a tela os põe na matriz e salva pelo
     mesmo PUT do quadro que o gesto manual usa — um dono só para o
     conteúdo da matriz. */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/matriz/classificar', async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite editar a matriz.'));
    }
    const tarefa = await db.tarefa.findFirst({ where: { id: ctx.tarefaId as string, ideiaId: ctx.ideia.id } });
    if (!tarefa) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));
    if (tarefa.tipo !== 'matriz_csd') {
      return resposta.code(409).send(erro(null, 'Esta tarefa não é uma Matriz CSD.'));
    }
    if (tarefa.status === 'concluida') {
      return resposta.code(409).send(erro(null, 'Tarefa concluída. Reabra a tarefa para mudar a matriz.'));
    }
    if (!iaConfigurada()) {
      return resposta.code(503).send(erro(null, 'O assistente de IA ainda não está configurado neste ambiente.'));
    }

    const projeto = await db.projeto.findFirst({
      where: { id: ctx.projetoId, empresaId: ctx.empresaId },
      select: { nome: true, tipo: true, empresa: { select: { nome: true, descricao: true } } },
    });
    if (!projeto) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    const [outras, pacote, quadros] = await Promise.all([
      db.tarefa.findMany({
        where: { ideiaId: ctx.ideia.id, NOT: { id: tarefa.id } },
        orderBy: { ordem: 'asc' },
        select: { titulo: true, descricao: true, tipo: true, status: true },
      }),
      pacoteInternoDa({ empresaId: ctx.empresaId, projetoId: ctx.projetoId, tarefaId: tarefa.id }),
      db.quadro.findMany({
        where: { tarefaId: tarefa.id },
        include: { colunas: { include: { registros: { select: { titulo: true } } } } },
      }),
    ]);
    const jaNaMatriz = quadros.flatMap((q) => q.colunas.flatMap((c) => c.registros.map((r) => r.titulo)));

    const mensagem = montarMensagemMatriz({
      empresaNome: projeto.empresa.nome,
      empresaDescricao: projeto.empresa.descricao ?? null,
      projetoNome: projeto.nome ?? nomeDoTipo(projeto.tipo),
      atividadeTitulo: ctx.ideia.titulo,
      atividadeDescricao: ctx.ideia.descricao,
      tarefas: outras,
      conhecimento: pacoteParaTexto(pacote),
      jaNaMatriz,
    });

    const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, SISTEMA_MATRIZ + '\n' + mensagem, MAX_TOKENS_MATRIZ);
    if (tetoUsd === null) {
      return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
    }
    const teto = emReais(tetoUsd);
    const op = randomUUID();
    try {
      await reservar(ctx.usuarioId, teto, op, 'assistente');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para classificar a matriz. Adicione créditos para continuar.'));
      }
      throw e;
    }

    const r = await pedirMatriz(mensagem);
    const doModelo = r.ok ? interpretarMatriz(r.bruto, Math.min(outras.length, 40)) : [];
    /* MATRIZ-IA-003: sem resposta útil do modelo, nada é devolvido nem
       cobrado — completar só pelo status seria uma classificação que a
       IA não fez, com o nome dela. */
    const cards = doModelo.length ? completarComTarefas(doModelo, outras, jaNaMatriz) : [];
    const entregue = cards.length > 0;

    if (r.uso && r.modelo) {
      registrar({
        usuarioId: ctx.usuarioId,
        empresaId: ctx.empresaId,
        projetoId: ctx.projetoId,
        ideiaId: ctx.ideia.id,
        tipo: 'assistente',
        resultado: entregue ? 'entregue' : 'descartado',
        modelo: r.modelo,
        uso: r.uso,
        requisicaoId: r.requisicaoId,
        operacaoId: op,
      });
    }
    await liberar(ctx.usuarioId, teto, op, 'assistente');
    if (entregue && r.uso && r.modelo) {
      const usd = custoUsdMicros(r.modelo, r.uso);
      if (usd !== null && usd > 0) await consumir(ctx.usuarioId, emReais(usd), op, 'assistente');
    }

    if (!entregue) {
      if (doModelo.length) return resposta.code(200).send({ cards: [], colunas: TITULO_COLUNA });
      const msg = !r.ok && r.motivo === 'rede'
        ? 'Não foi possível falar com o provedor de IA. Tente de novo.'
        : 'Não foi possível classificar agora. Tente de novo em instantes.';
      return resposta.code(503).send(erro(null, msg));
    }
    return resposta.code(200).send({
      cards: cards.map((c) => ({ titulo: c.titulo, descricao: c.descricao, coluna: c.coluna, extra: c.tarefa === null })),
      colunas: TITULO_COLUNA,
    });
  });
}
