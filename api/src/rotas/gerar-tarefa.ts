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

   Avaliação (IA-AVAL-018/019, planejamento-jev-tarefas.md §2): com
   AVALIACAO_MODO_TAREFA ligado, o JEV julga a proposta ENTRE o passo 2
   e o 3, na requisição. Se ele falhar, a tarefa sai sem nota e o
   Claude avalia DEPOIS da resposta, com reserva própria — esperar até
   30 s por uma nota atrasaria a tarefa e a pesquisa que vem atrás.

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
  TITULO_MAX,
  DESCRICAO_MAX,
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
import { abrirContexto, podeEscrever, criarTarefaNoFim, tarefaParaResposta } from './tarefas.js';

/* Só os tipos que o Senior Product Designer sabe propor. Até
   30/09/2026 isto era TIPOS_VALIDOS inteiro — com SWOT, Impacto ×
   Esforço e Comparativa na lista de tarefas, a rota passaria a aceitar
   "gerar" para tipos que o prompt não conhece. A tela já não mostra o
   botão fora da Pesquisa (ATV-GERAR-023); a rota não depende disso. */
const TIPOS_GERAVEIS = ['pesquisa', 'matriz_csd', 'referencias_visuais'] as const;
import { pacoteInternoDa } from './pesquisa.js';
import { avaliarTarefaGerada, custoDasChamadas, tetoAvaliacaoPartes, type ResultadoAvaliacaoDe } from '../ia/avaliacao/avaliar.js';
import { avaliacaoTarefaLigada, modoAvaliacaoTarefa, dependenciasDoAmbiente } from '../ia/avaliacao/config.js';
import { montarLoteTarefa, type ContextoAvaliacaoTarefa } from '../ia/avaliacao/perguntas-tarefa.js';
import { proximoAposGerar, type Avaliacao } from '../ia/avaliacao/normalizar.js';
import type { Chamada } from '../ia/avaliacao/chamada.js';
import { nomesNaoInformados, instrucaoSemNomes, escolherProposta } from '../ia/nomes-nao-informados.js';
import { instrucaoEsclarecer } from '../ia/esclarecer-tarefa.js';
import { SISTEMA_ROTEIRO, MAX_TOKENS_ROTEIRO, montarMensagemRoteiro, conferirRoteiro } from '../ia/roteiro-conversa.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* ATV-TAR-CRIA-010: os tipos cuja descrição a sugestão esclarece.
   Decisão do Ricardo: todos os que têm descrição — hoje, só a
   Pesquisa (os outros nascem sem campos). Um tipo novo com descrição
   entra aqui. */
const TIPOS_ESCLARECIVEIS = ['pesquisa'] as const;
const corpoEsclarecer = z.object({
  tipo: z.enum(TIPOS_ESCLARECIVEIS, { errorMap: () => ({ message: 'Este tipo de tarefa não tem descrição para esclarecer.' }) }),
  titulo: z.string().trim().max(260).default(''),
  descricao: z.string().trim().min(1, 'Escreva a descrição antes de pedir a sugestão.').max(280),
});

const corpoGerar = z.object({
  tipo: z.enum(TIPOS_GERAVEIS, { errorMap: () => ({ message: 'Este tipo de tarefa não é gerado com ajuda da IA.' }) }),
  orientacao: z.string().max(ORIENTACAO_MAX, `A orientação deve ter no máximo ${ORIENTACAO_MAX} caracteres.`).optional(),
});

function emReais(usdMicros: number): number {
  return comissaoSobre(usdParaMicrosBrl(usdMicros, cotacaoParaMilesimos(env.COTACAO_USD_BRL))).totalMicros;
}

/* ATV-GERAR-018 só vale quando a TELA souber o que fazer com
   `proximo: 'revisar'` — isso é a Fase 4. Até lá, mesmo com o modo em
   `visivel`, a rota responde como hoje: uma resposta que a tela não
   conhece seria uma pesquisa que não começa sem ninguém saber por quê. */
const FASE_4_LIGADA = false;

type ContaAvaliacao = { usuarioId: string; empresaId: string; projetoId: string; ideiaId: string };

/* IA-AVAL-013/017: cada ida ao avaliador é uma linha `avaliacao`, na
   operação que a pagou. Sem preço (o JEV hoje) fica medido, não
   cobrado — `registrar` marca `precoDesconhecido`. */
function registrarChamadas(conta: ContaAvaliacao, chamadas: Chamada[], avaliador: string, operacaoId: string): void {
  for (const c of chamadas) {
    if (!c.cobrou || !c.uso) continue;
    registrar({
      ...conta,
      tipo: 'avaliacao',
      resultado: c.fornecedor === avaliador ? 'entregue' : 'descartado',
      modelo: c.modelo,
      uso: c.uso,
      requisicaoId: c.requisicaoId,
      operacaoId,
      cobravel: true,
    });
  }
}

/* Grava a nota. Falhar aqui não desfaz a tarefa (IA-AVAL-003). */
async function gravarNota(
  tarefaId: string,
  projetoId: string,
  a: Avaliacao,
  operacaoId: string,
  log: { error: (o: object, m: string) => void },
): Promise<void> {
  try {
    await db.avaliacaoIa.create({
      data: {
        alvoTipo: 'tarefa',
        alvoId: tarefaId,
        projetoId,
        avaliador: a.avaliador,
        modelo: a.modelo,
        geral: a.geral,
        faixa: a.faixa,
        incerta: a.incerta,
        criterios: a.criterios,
        alertas: a.alertas,
        operacaoId,
      },
    });
  } catch (e) {
    log.error({ err: e, operacaoId, tarefaId }, 'avaliação da tarefa: falha ao gravar a nota (a tarefa foi criada)');
  }
}

type ContextoAberto = Extract<Awaited<ReturnType<typeof abrirContexto>>, { ok: true }>;

/* A empresa inteira + o lugar onde a pessoa está: o que o gerador lê
   para propor uma tarefa, e o que a sugestão do modal lê para
   esclarecer uma (ATV-TAR-CRIA-010). Um lugar só, para as duas saberem
   sempre a mesma coisa. */
async function contextoDaTarefa(ctx: ContextoAberto, tipo: TipoGeravel, orientacao: string | null) {
  const projeto = await db.projeto.findFirst({
    where: { id: ctx.projetoId, empresaId: ctx.empresaId },
    select: { nome: true, tipo: true, empresa: { select: { nome: true, descricao: true } } },
  });
  if (!projeto) return null;

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
    orientacao,
  });
  /* `conhecimento`: o que a empresa já sabe, em texto — o roteiro da
     conversa (BOARD-CONVERSA-004) o usa sem montar nada de novo. */
  return { projeto, concorrentes, mensagem, tarefas, conhecimento: pacoteParaTexto(pacote) };
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

    /* ---- O contexto: a empresa inteira + o lugar onde a pessoa está ----
       Montado por `contextoDaTarefa`, o mesmo da sugestão do modal
       (ATV-TAR-CRIA-010): a sugestão sabe o mesmo que o gerador. */
    const contexto = await contextoDaTarefa(ctx, tipo, corpo.data.orientacao ?? null);
    if (!contexto) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));
    const { projeto, concorrentes, mensagem, tarefas } = contexto;

    /* ---- Avaliação (IA-AVAL-018) — o que vai ao avaliador ----
       Evidências com o MESMO recorte da Visão: idéias finalizadas do
       projeto (IA-AVAL-020). Material de consulta não confirma fato
       (IA-CONHEC-005). */
    const avaliar = avaliacaoTarefaLigada();
    const depsAvaliacao = avaliar ? dependenciasDoAmbiente() : null;
    const validadas = avaliar
      ? await db.ideia.findMany({
          where: { projetoId: ctx.projetoId, arquivadoEm: null, status: 'finalizado' },
          orderBy: { criadoEm: 'desc' },
          select: { titulo: true },
        })
      : [];
    const baseAvaliacao: Omit<ContextoAvaliacaoTarefa, 'tarefa'> = {
      tipo,
      projetoNome: projeto.nome ?? nomeDoTipo(projeto.tipo),
      empresaNome: projeto.empresa.nome,
      empresaDescricao: projeto.empresa.descricao ?? null,
      atividadeTitulo: ctx.ideia.titulo,
      atividadeDescricao: ctx.ideia.descricao,
      validadas: validadas.map((i: { titulo: string }) => i.titulo),
      existentes: tarefas.map((t: { titulo: string }) => t.titulo),
      orientacao: corpo.data.orientacao ?? null,
    };

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
    /* ATV-GERAR-016 revista (T3): a reserva soma a avaliação. O JEV
       entra na operação da proposta (fecha na requisição); o Claude
       numa operação PRÓPRIA, porque pode rodar depois da resposta
       (IA-AVAL-019). Pior caso: título e descrição no tamanho máximo. */
    const opAvalClaude = randomUUID();
    let tetoJevUsd = 0;
    let tetoClaudeUsd = 0;
    if (avaliar && depsAvaliacao) {
      const piorCaso = montarLoteTarefa({
        ...baseAvaliacao,
        tarefa: { titulo: 'x'.repeat(TITULO_MAX), descricao: 'x'.repeat(DESCRICAO_MAX) },
      });
      const partes = tetoAvaliacaoPartes(piorCaso, depsAvaliacao.jev.modelo, env.IA_MODELO as string);
      if (partes === null) {
        return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
      }
      tetoJevUsd = partes.jev;
      tetoClaudeUsd = partes.claude;
    }
    const tetoProposta = emReais(tetoPropostaUsd + tetoJevUsd);
    const tetoAvalClaude = tetoClaudeUsd > 0 ? emReais(tetoClaudeUsd) : 0;
    const tetoBusca = tetoBuscaReais;

    try {
      await reservar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para gerar a tarefa. Adicione créditos para continuar.'));
      }
      throw e;
    }
    if (tetoAvalClaude > 0) {
      try {
        await reservar(ctx.usuarioId, tetoAvalClaude, opAvalClaude, 'assistente');
      } catch (e) {
        await liberar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
        if (e instanceof SaldoInsuficiente) {
          return resposta.code(402).send(erro(null, 'Saldo insuficiente para gerar a tarefa. Adicione créditos para continuar.'));
        }
        throw e;
      }
    }
    if (ehReferencia) {
      try {
        await reservar(ctx.usuarioId, tetoBusca, opBusca, 'pesquisa');
      } catch (e) {
        await liberar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
        if (tetoAvalClaude > 0) await liberar(ctx.usuarioId, tetoAvalClaude, opAvalClaude, 'assistente');
        if (e instanceof SaldoInsuficiente) {
          return resposta.code(402).send(erro(null, 'Saldo insuficiente para buscar as referências. Adicione créditos para continuar.'));
        }
        throw e;
      }
    }

    /* ---- 2. A proposta ---- */
    const r = await pedirTarefa(mensagem);
    let proposta = r.ok ? interpretarTarefa(r.bruto) : null;

    /* ---- 2a. Nomes de empresa não informados (ATV-GERAR-025) ----
       O prompt manda citar só as empresas que a mensagem traz; medido
       na régua, 5 de 24 tarefas citavam outras. Os nomes não fazem
       falta — a pesquisa descobre as empresas com o site verificado —,
       então tenta UMA vez de novo, pedindo a categoria. Reserva própria,
       só quando precisa: o caminho normal não muda. Sem saldo para a
       segunda tentativa, fica a primeira proposta, sem erro. */
    let refeita: { r: Awaited<ReturnType<typeof pedirTarefa>>; op: string; teto: number; trocou: boolean } | null = null;
    if (proposta && tipo === 'pesquisa') {
      const nomes = nomesNaoInformados(`${proposta.titulo}. ${proposta.descricao}`, mensagem);
      if (nomes.length) {
        const mensagem2 = `${mensagem}\n\n${instrucaoSemNomes(nomes)}`;
        const op = randomUUID();
        /* `tetoPropostaUsd` já foi conferido (sem preço, a rota responde
           503 antes de chegar aqui): é a reserva de segurança. */
        const teto = emReais(tetoUsdMicros(env.IA_MODELO as string, SISTEMA_TAREFA + '\n' + mensagem2, MAX_TOKENS_PROPOSTA) ?? tetoPropostaUsd);
        let reservou = false;
        try {
          await reservar(ctx.usuarioId, teto, op, 'assistente');
          reservou = true;
        } catch (e) {
          if (!(e instanceof SaldoInsuficiente)) throw e;
          req.log.warn({ nomes }, 'gerar tarefa: nomes não informados, sem saldo para refazer');
        }
        if (reservou) {
          const r2 = await pedirTarefa(mensagem2);
          const escolha = escolherProposta(proposta, r2.ok ? interpretarTarefa(r2.bruto) : null, mensagem);
          proposta = escolha.proposta;
          refeita = { r: r2, op, teto, trocou: escolha.trocou };
          req.log.warn({ nomes, trocou: escolha.trocou, ficaram: escolha.nomesQueFicaram }, 'gerar tarefa: nomes não informados');
        }
      }
    }
    const conta: ContaAvaliacao = { usuarioId: ctx.usuarioId, empresaId: ctx.empresaId, projetoId: ctx.projetoId, ideiaId: ctx.ideia.id };

    /* ---- 2b. A avaliação pelo JEV, na requisição (IA-AVAL-019) ----
       Só o JEV aqui: o Claude, se preciso, roda depois da resposta. */
    const ctxAvaliacao: ContextoAvaliacaoTarefa | null = proposta ? { ...baseAvaliacao, tarefa: proposta } : null;
    const loteAvaliacao = ctxAvaliacao ? montarLoteTarefa(ctxAvaliacao) : null;
    const avaliacaoJev: ResultadoAvaliacaoDe<Avaliacao> | null =
      ctxAvaliacao && loteAvaliacao && avaliar && depsAvaliacao
        ? await avaliarTarefaGerada(ctxAvaliacao, depsAvaliacao, { apenas: 'jev' }, loteAvaliacao)
        : null;
    if (avaliar) {
      /* `warn`: em sombra, esta linha é o único sinal de que rodou. */
      req.log.warn(
        { tipo, avaliador: avaliacaoJev?.avaliador ?? null, falhaJev: avaliacaoJev?.falhaJev ?? null, faixa: avaliacaoJev?.resultado.faixa ?? null },
        'gerar tarefa: avaliação',
      );
    }

    /* T3 (30/09/2026) — ATV-GERAR-016 segue IA-AVAL-017: o que o
       provedor cobrou é repassado, inclusive a proposta fora do formato
       (fica `descartado` no Histórico). */
    if (r.uso && r.modelo) {
      registrar({
        ...conta,
        tipo: 'assistente',
        resultado: proposta ? 'entregue' : 'descartado',
        modelo: r.modelo,
        uso: r.uso,
        requisicaoId: r.requisicaoId,
        operacaoId: opProposta,
        cobravel: true,
      });
    }
    if (avaliacaoJev) registrarChamadas(conta, avaliacaoJev.chamadas, avaliacaoJev.avaliador, opProposta);

    await liberar(ctx.usuarioId, tetoProposta, opProposta, 'assistente');
    {
      let usd = 0;
      if (r.uso && r.modelo) usd += custoUsdMicros(r.modelo, r.uso) ?? 0;
      if (avaliacaoJev) usd += custoDasChamadas(avaliacaoJev.chamadas).usdMicros;
      if (usd > 0) await consumir(ctx.usuarioId, emReais(usd), opProposta, 'assistente');
    }

    /* A segunda tentativa (ATV-GERAR-025): o que o provedor cobrou é
       repassado, tenha ela sido usada ou não (IA-AVAL-017), com a
       operação dela. */
    if (refeita) {
      if (refeita.r.uso && refeita.r.modelo) {
        registrar({
          ...conta,
          tipo: 'assistente',
          resultado: refeita.trocou ? 'entregue' : 'descartado',
          modelo: refeita.r.modelo,
          uso: refeita.r.uso,
          requisicaoId: refeita.r.requisicaoId,
          operacaoId: refeita.op,
          cobravel: true,
        });
      }
      await liberar(ctx.usuarioId, refeita.teto, refeita.op, 'assistente');
      const usd = refeita.r.uso && refeita.r.modelo ? custoUsdMicros(refeita.r.modelo, refeita.r.uso) ?? 0 : 0;
      if (usd > 0) await consumir(ctx.usuarioId, emReais(usd), refeita.op, 'assistente');
    }

    /* O Claude só vai rodar se o JEV falhou numa proposta que existe.
       Em qualquer outro caso a reserva dele volta agora. */
    const claudeDepois = !!(proposta && avaliar && depsAvaliacao && avaliacaoJev && avaliacaoJev.avaliador === 'nenhum' && tetoAvalClaude > 0);
    if (tetoAvalClaude > 0 && !claudeDepois) await liberar(ctx.usuarioId, tetoAvalClaude, opAvalClaude, 'assistente');

    if (!proposta) {
      /* Saída que era muda: o 503 chegava sem dizer POR QUÊ. `formato`
         leva o começo do que o modelo respondeu — é o que diz se o JSON
         veio quebrado, cortado ou com texto em volta. */
      req.log.warn(
        {
          tipo,
          motivo: r.ok ? 'formato' : r.motivo,
          status: !r.ok ? (r.status ?? null) : null,
          inicioDaResposta: r.ok ? r.bruto.slice(0, 300) : null,
          requisicaoId: r.requisicaoId ?? null,
        },
        'gerar tarefa: a proposta falhou',
      );
      /* Nada criado. A proposta, se o provedor cobrou, já foi
         consumida acima (T3); a busca nem começou. */
      if (ehReferencia) await liberar(ctx.usuarioId, tetoBusca, opBusca, 'pesquisa');
      const msg = !r.ok && r.motivo === 'rede'
        ? 'Não foi possível falar com o provedor de IA. Tente de novo.'
        : 'Não foi possível gerar a tarefa agora. Tente de novo em instantes.';
      return resposta.code(503).send(erro(null, msg));
    }

    /* ---- 3. A tarefa ---- */
    const tarefa = await criarTarefaNoFim(ctx.ideia.id, { titulo: proposta.titulo, descricao: proposta.descricao, tipo });

    /* ---- 3b. A nota ----
       JEV respondeu: grava agora. JEV falhou: o Claude avalia em
       segundo plano, grava a nota dele (ou "não avaliado") e acerta a
       reserva própria. Nada disto segura a resposta nem a pesquisa. */
    if (avaliacaoJev && avaliacaoJev.avaliador === 'jev') {
      await gravarNota(tarefa.id, ctx.projetoId, avaliacaoJev.resultado, opProposta, req.log);
    } else if (claudeDepois && ctxAvaliacao && loteAvaliacao && depsAvaliacao) {
      const log = req.log;
      void (async () => {
        try {
          const rc = await avaliarTarefaGerada(ctxAvaliacao, depsAvaliacao, { apenas: 'claude' }, loteAvaliacao);
          registrarChamadas(conta, rc.chamadas, rc.avaliador, opAvalClaude);
          await gravarNota(tarefa.id, ctx.projetoId, rc.resultado, opAvalClaude, log);
          await liberar(ctx.usuarioId, tetoAvalClaude, opAvalClaude, 'assistente');
          const usd = custoDasChamadas(rc.chamadas).usdMicros;
          if (usd > 0) await consumir(ctx.usuarioId, emReais(usd), opAvalClaude, 'assistente');
          log.warn({ tarefaId: tarefa.id, avaliador: rc.avaliador, falhaClaude: rc.falhaClaude }, 'gerar tarefa: avaliação em segundo plano');
        } catch (e) {
          /* A reserva precisa voltar mesmo se algo acima lançou. */
          log.error({ err: e, tarefaId: tarefa.id }, 'gerar tarefa: avaliação em segundo plano falhou');
          await liberar(ctx.usuarioId, tetoAvalClaude, opAvalClaude, 'assistente').catch(() => {});
        }
      })();
    }

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
      /* ATV-GERAR-018/019: `revisar` só com JEV + t1 baixo + `visivel`
         — e só quando a Fase 4 ensinar a tela a tratá-lo. */
      proximo: proximoAposGerar(
        tipo,
        FASE_4_LIGADA ? modoAvaliacaoTarefa() : 'sombra',
        avaliacaoJev && avaliacaoJev.avaliador === 'jev' ? avaliacaoJev.resultado : null,
      ),
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

  /* ============================================================
     "Deixar mais clara com IA" — ATV-TAR-CRIA-010
     ============================================================
     A pessoa escreveu uma tarefa curta ou vaga no modal; a IA sugere a
     mesma tarefa, mais clara. NÃO cria nada: devolve o texto, e a tela
     o mostra ao lado do original para a pessoa usar, editar ou ignorar.
     Cobrada como qualquer chamada (IA-AVAL-017), com reserva própria. */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/esclarecer', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar tarefas.'));
    }
    if (!iaConfigurada()) {
      return resposta.code(503).send(erro(null, 'O assistente de IA ainda não está configurado neste ambiente.'));
    }
    const corpo = corpoEsclarecer.safeParse(req.body ?? {});
    if (!corpo.success) {
      const p = corpo.error.issues[0];
      return resposta.code(400).send(erro(typeof p?.path?.[0] === 'string' ? p.path[0] : null, p?.message ?? 'Dados inválidos.'));
    }

    const contexto = await contextoDaTarefa(ctx, corpo.data.tipo, null);
    if (!contexto) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));
    const mensagem = `${contexto.mensagem}\n\n---\n\n${instrucaoEsclarecer(corpo.data.titulo, corpo.data.descricao)}`;

    const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, SISTEMA_TAREFA + '\n' + mensagem, MAX_TOKENS_PROPOSTA);
    if (tetoUsd === null) {
      return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
    }
    const teto = emReais(tetoUsd);
    const op = randomUUID();
    try {
      await reservar(ctx.usuarioId, teto, op, 'assistente');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para sugerir. Adicione créditos para continuar.'));
      }
      throw e;
    }

    /* A reserva volta mesmo se a chamada lançar. */
    let r: Awaited<ReturnType<typeof pedirTarefa>>;
    try {
      r = await pedirTarefa(mensagem);
    } finally {
      await liberar(ctx.usuarioId, teto, op, 'assistente');
    }
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
        operacaoId: op,
        cobravel: true,
      });
      const usd = custoUsdMicros(r.modelo, r.uso) ?? 0;
      if (usd > 0) await consumir(ctx.usuarioId, emReais(usd), op, 'assistente');
    }
    if (!proposta) {
      return resposta.code(502).send(erro(null, 'Não consegui sugerir uma descrição agora. Tente de novo.'));
    }
    /* Os limites do modal: o que volta tem de caber nos campos. */
    return resposta.send({ titulo: proposta.titulo.slice(0, 260), descricao: proposta.descricao.slice(0, 280) });
  });

  /* ============================================================
     "Montar roteiro com IA" — BOARD-CONVERSA-004 (fase E2)
     ============================================================
     Escreve o roteiro de uma tarefa "Conversa com usuários" a partir
     dela e do contexto da atividade (o mesmo do gerador). Não grava o
     quadro: devolve o texto, e o board o escreve no "Roteiro" — que a
     pessoa edita à vontade. O que volta é CONFERIDO (as quatro seções,
     na ordem) antes de sair. Cobrado como qualquer chamada. */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/roteiro', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite editar tarefas.'));
    }
    if (!iaConfigurada()) {
      return resposta.code(503).send(erro(null, 'O assistente de IA ainda não está configurado neste ambiente.'));
    }
    const { tarefaId } = req.params as { tarefaId: string };
    const tarefa = await db.tarefa.findFirst({
      where: { id: tarefaId, ideiaId: ctx.ideia.id },
      select: { titulo: true, descricao: true, tipo: true, status: true },
    });
    if (!tarefa) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));
    if (tarefa.tipo !== 'conversa_usuarios') {
      return resposta.code(400).send(erro(null, 'Só uma Conversa com usuários tem roteiro.'));
    }
    /* BOARD-LEITURA-003: tarefa concluída não muda. */
    if (tarefa.status === 'concluida') {
      return resposta.code(409).send(erro(null, 'Tarefa concluída não recebe roteiro novo. Reabra a tarefa para editar.'));
    }

    const contexto = await contextoDaTarefa(ctx, 'pesquisa', null);
    if (!contexto) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));
    const mensagem = montarMensagemRoteiro({
      empresaNome: contexto.projeto.empresa.nome,
      empresaDescricao: contexto.projeto.empresa.descricao ?? null,
      projetoNome: contexto.projeto.nome ?? nomeDoTipo(contexto.projeto.tipo),
      atividade: ctx.ideia.titulo,
      tarefaTitulo: tarefa.titulo,
      tarefaDescricao: tarefa.descricao,
      conhecimento: contexto.conhecimento,
    });

    const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, SISTEMA_ROTEIRO + '\n' + mensagem, MAX_TOKENS_ROTEIRO);
    if (tetoUsd === null) {
      return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
    }
    const teto = emReais(tetoUsd);
    const op = randomUUID();
    try {
      await reservar(ctx.usuarioId, teto, op, 'assistente');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para montar o roteiro. Adicione créditos para continuar.'));
      }
      throw e;
    }

    let r: Awaited<ReturnType<typeof pedirTarefa>>;
    try {
      r = await pedirTarefa(mensagem, SISTEMA_ROTEIRO, MAX_TOKENS_ROTEIRO);
    } finally {
      await liberar(ctx.usuarioId, teto, op, 'assistente');
    }
    const roteiro = r.ok ? conferirRoteiro(r.bruto) : null;
    if (r.uso && r.modelo) {
      registrar({
        usuarioId: ctx.usuarioId,
        empresaId: ctx.empresaId,
        projetoId: ctx.projetoId,
        ideiaId: ctx.ideia.id,
        tipo: 'assistente',
        resultado: roteiro ? 'entregue' : 'descartado',
        modelo: r.modelo,
        uso: r.uso,
        requisicaoId: r.requisicaoId,
        operacaoId: op,
        cobravel: true,
      });
      const usd = custoUsdMicros(r.modelo, r.uso) ?? 0;
      if (usd > 0) await consumir(ctx.usuarioId, emReais(usd), op, 'assistente');
    }
    if (!roteiro) {
      req.log.warn({ motivo: r.ok ? 'sem-as-secoes' : r.motivo }, 'roteiro: não montado');
      return resposta.code(502).send(erro(null, 'Não consegui montar o roteiro agora. Tente de novo.'));
    }
    if (roteiro.induzem.length) req.log.warn({ induzem: roteiro.induzem }, 'roteiro: perguntas que induzem a resposta');
    return resposta.send({ texto: roteiro.texto });
  });
}
