/* ============================================================
   Rotas do assistente de IA
   ============================================================
   Regras: Regras_de_negocio/modulos/ia/ia-assistente-conhecimento.md
           Regras_de_negocio/modulos/ia/ia-assistente-isolamento.md
           Regras_de_negocio/modulos/ia/ia-assistente-conversa.md

   Duas rotas: ler a conversa e fazer uma pergunta.

   A corrente de isolamento é a mesma das idéias — empresa → projeto
   — e é percorrida ANTES de qualquer coisa (IA-ISO-003). Aqui ela
   importa mais que nas telas: um vazamento numa listagem aparece
   como dado alheio na tela; um vazamento aqui entra no raciocínio e
   sai parafraseado, sem parecer vazamento nenhum.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import { env } from '../env.js';
import * as sessao from '../seguranca/sessao.js';
import { montar, ehVerdadeValidada, type IdeiaContexto, type TarefaContexto, type Troca } from '../ia/contexto.js';
import { montarPacote, nomeDoArquivo } from '../ia/pacote.js';
import {
  verificar,
  semVerdadeValidada,
  verificarAcao,
  alegaAcaoSemProposta,
  type AcaoVerificada,
} from '../ia/verificacao.js';
import { provedorAtual, FalhaDoProvedor, iaConfigurada } from '../ia/provedor.js';
import { registrar } from '../creditos/registro.js';
import { tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { encontrarDuplicata } from '../ideias/duplicidade.js';
import { randomUUID } from 'node:crypto';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

const paramsProjeto = z.object({
  empresaId: z.string().uuid(),
  projetoId: z.string().uuid(),
});

const NOMES_TIPO: Record<string, string> = { startup: 'Startup' };

/* ------------------------------------------------------------
   Papel de quem escreve — IA-ACAO-004.
   ------------------------------------------------------------
   Confirmar uma ação proposta pelo assistente é, no fim, escrever no
   quadro — a MESMA coisa que criar/editar/mover uma idéia à mão. Por
   isso a régua de quem pode é a mesma de `ideias.ts`, reproduzida
   aqui e não importada, pelo mesmo motivo já registrado lá: nenhum
   dos dois módulos tem por que depender do outro existir. Allowlist
   explícita — um papel novo nasce sem permissão, não herda uma. */
function podeEscrever(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro' || papel === 'especialista';
}

/* Mesmos limites de IDEIA-CRIA-001/002, conferidos DE NOVO aqui — a
   validação que rodou em `verificarAcao` na hora da resposta já pode
   estar desatualizada quando a pessoa confirma minutos depois. */
const conteudoAcao = z.object({
  titulo: z.string().trim().min(1).max(260),
  descricao: z.string().trim().min(1).max(280),
  importancia: z.number().int().min(0).max(5),
});
const STATUS_VALIDOS_ACAO = ['ideias', 'andamento', 'finalizado'] as const;

async function quemPede(req: FastifyRequest): Promise<string | null> {
  const acesso = req.cookies[sessao.COOKIE_ACESSO];
  if (!acesso) return null;

  const dados = await sessao.lerAcesso(acesso);
  if (!dados) return null;

  const viva = await db.sessao.findFirst({
    where: { id: dados.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  if (!viva) return null;

  return dados.usuarioId;
}

type Contexto =
  | { ok: false; code: number; corpo: unknown }
  | {
      ok: true;
      usuarioId: string;
      papel: string;
      /* Necessário para atribuir o consumo de IA à empresa que o
         gerou — o saldo é do usuário (decisão C1), o extrato é
         atribuível. */
      empresaId: string;
      empresaNome: string;
      empresaDescricao: string | null;
      projetoId: string;
      projetoNome: string;
    };

/* Mesma corrente das rotas de idéias. Reproduzida aqui, e não
   importada de lá, pelo mesmo motivo já registrado em projetos.ts:
   nenhum dos dois módulos tem por que depender do outro existir. */
async function abrirContexto(req: FastifyRequest): Promise<Contexto> {
  const naoEncontrado = {
    ok: false as const,
    code: 404,
    corpo: erro(null, 'Projeto não encontrado.'),
  };

  const usuarioId = await quemPede(req);
  if (!usuarioId) return { ok: false, code: 401, corpo: erro(null, 'Sessão expirada.') };

  const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return { ok: false, code: 401, corpo: erro(null, 'Sessão expirada.') };
  if (usuario.suspensoEm) {
    return {
      ok: false,
      code: 403,
      corpo: { ...erro(null, 'Conta suspensa.'), suspensao: usuario.suspensaoMotivo ?? 'violacao' },
    };
  }

  const params = paramsProjeto.safeParse(req.params);
  if (!params.success) return naoEncontrado;

  const { empresaId, projetoId } = params.data;

  const vinculo = await db.empresaMembro.findFirst({
    where: {
      empresaId,
      usuarioId,
      revogadoEm: null,
      OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
      empresa: { arquivadoEm: null },
    },
    include: { empresa: true },
  });
  if (!vinculo) return naoEncontrado;

  const projeto = await db.projeto.findFirst({
    where: { id: projetoId, empresaId, arquivadoEm: null },
  });
  if (!projeto) return naoEncontrado;

  return {
    ok: true,
    usuarioId,
    papel: vinculo.papel,
    empresaId,
    empresaNome: vinculo.empresa.nome,
    /* Base legítima das sugestões num projeto em branco
       (IA-VAZIO-007). O nome não serve — nomes coincidem. */
    empresaDescricao: vinculo.empresa.descricao ?? null,
    projetoId: projeto.id,
    projetoNome: NOMES_TIPO[projeto.tipo] ?? projeto.tipo,
  };
}

/* IA-ISO-004 / decisão A7: as idéias que vão para o contexto saem
   DA MESMA consulta filtrada que a listagem usa. Não existe aqui uma
   consulta "otimizada" própria — é justamente nela que um `where` se
   perderia, e o vazamento resultante seria invisível. */
async function ideiasDoProjeto(projetoId: string): Promise<IdeiaContexto[]> {
  const linhas = await db.ideia.findMany({
    where: { projetoId, arquivadoEm: null },
    orderBy: { criadoEm: 'desc' },
  });
  return linhas.map((i: {
    id: string; titulo: string; descricao: string; importancia: number; status: string;
  }) => ({
    id: i.id,
    titulo: i.titulo,
    descricao: i.descricao,
    importancia: i.importancia,
    status: i.status as IdeiaContexto['status'],
  }));
}

/* IA-CONHEC-007/008 / IA-ISO-004: as tarefas do projeto que podem
   entrar no contexto, com o conteudo dos quadros achatado em texto.

   Fica aqui, e nao em `contexto.ts`, pelo mesmo motivo que
   `ideiasDoProjeto` fica: montar contexto nao pode ter consulta
   propria. O `where` desce pela relacao `ideia`, entao o escopo do
   projeto e do banco de dados, nao de uma checagem depois. */
const QUADRO_DE_PERGUNTAS = /perguntas?\s+em\s+aberto/i;

async function tarefasParaOContexto(projetoId: string): Promise<TarefaContexto[]> {
  const linhas = await db.tarefa.findMany({
    where: {
      ideia: { projetoId, arquivadoEm: null },
      OR: [
        /* Atividade finalizada: TUDO que esta dentro dela conta, tarefa
           pendente inclusive. Finalizar e o ato pelo qual a pessoa
           declara validado o que a atividade produziu, e ela finalizou
           sabendo o que havia la dentro — filtrar por status de tarefa
           aqui descartaria conteudo que ela acabou de validar. */
        { ideia: { status: 'finalizado' } },
        /* Atividade ainda aberta: so o que ja terminou, e como material
           de consulta (IA-CONHEC-008). */
        { status: 'concluida' },
      ],
    },
    orderBy: { criadoEm: 'desc' },
    /* Teto: o contexto tem tamanho, e trinta tarefas ja cobrem
       qualquer projeto real desta fase. */
    take: 30,
    include: {
      /* O status da ideia decide se o conteudo desta tarefa e verdade
         validada ou material de consulta — IA-CONHEC-007. */
      ideia: { select: { status: true } },
      quadros: {
        orderBy: { ordem: 'asc' },
        include: {
          colunas: {
            orderBy: { ordem: 'asc' },
            include: { registros: { orderBy: { ordem: 'asc' } } },
          },
        },
      },
    },
  });

  return linhas.map((t) => {
    const achados: string[] = [];
    const emAberto: string[] = [];

    for (const q of t.quadros) {
      const registros = q.colunas.flatMap((c) => c.registros);
      if (!registros.length) continue;

      /* O quadro "Perguntas em aberto" e a lista do que a pesquisa
         NAO respondeu. Despeja-lo junto dos achados, sob o mesmo
         rotulo "resultado", convida o modelo a ler uma pergunta como
         se fosse resposta — "Qual e a regiao de inicio?" viraria
         material para afirmar uma regiao. Vai separado e rotulado
         pelo que e: pendencia. */
      const alvo = QUADRO_DE_PERGUNTAS.test(q.titulo ?? '') ? emAberto : achados;

      if (alvo === achados) {
        alvo.push(q.titulo ? `[${q.titulo}]` : '[quadro sem título]');
      }
      for (const r of registros) {
        alvo.push(r.descricao ? `${r.titulo}: ${r.descricao}` : r.titulo);
      }
      alvo.push('');
    }

    const partes: string[] = [];
    if (achados.length) partes.push(achados.join('\n').trim());
    if (emAberto.length) {
      partes.push(
        'AINDA SEM RESPOSTA (perguntas que esta tarefa deixou em aberto —\n' +
          'não são achados, e nada aqui pode ser usado como informação):\n' +
          emAberto.join('\n').trim(),
      );
    }

    return {
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao,
      resultado: partes.join('\n\n').trim(),
      /* A MESMA funcao que decide a fronteira para idéia decide aqui.
         Se um dia `Finalizado` deixar de ser o corte, muda num lugar
         so — e continua valendo para atividade e conteudo juntos. */
      validada: ehVerdadeValidada(t.ideia.status),
    };
  });
}

async function acharOuCriarConversa(projetoId: string, usuarioId: string) {
  const existente = await db.iaConversa.findFirst({ where: { projetoId, usuarioId } });
  if (existente) return existente;
  return db.iaConversa.create({ data: { projetoId, usuarioId } });
}

function mensagemParaResposta(m: {
  id: string; autor: string; texto: string; fontes: unknown;
  semVerdadeValidada: boolean; criadoEm: Date;
  acaoTipo?: string | null; acaoDados?: unknown; acaoStatus?: string;
  acaoIdeiaId?: string | null;
}) {
  return {
    id: m.id,
    autor: m.autor,
    texto: m.texto,
    fontes: m.fontes ?? null,
    sem_verdade_validada: m.semVerdadeValidada,
    /* IA-ACAO-002: null na grande maioria das mensagens. Quando
       existe, a tela usa `status` para decidir entre mostrar os
       botões de confirmação ("pendente") ou só o resultado
       ("confirmada"/"descartada"). */
    acao: m.acaoTipo
      ? {
          tipo: m.acaoTipo,
          dados: m.acaoDados ?? null,
          status: m.acaoStatus,
          ideia_id: m.acaoIdeiaId ?? null,
        }
      : null,
    /* IA-ACAO-009: calculado NA LEITURA, não gravado — pega o caso em
       que o modelo alegou ter criado/editado/movido um card sem
       proposta nenhuma junto (ex.: "ok" → "Card criado!" sem
       acao_proposta). Como é derivado de `texto`/`acaoTipo`, cobre
       tanto mensagens novas quanto as que já estavam gravadas antes
       desta verificação existir — não precisa de migração. */
    alerta_acao_sem_proposta: m.autor === 'assistente' && alegaAcaoSemProposta(m.texto, !!m.acaoTipo),
    criado_em: m.criadoEm.toISOString(),
  };
}

export async function rotasIa(app: FastifyInstance) {
  /* ---------- Ler a conversa — IA-CONV-002 ---------- */
  /* ---------- Pacote de contexto — PACOTE-CONT-001 a 004 ----------
     Devolve um markdown para a pessoa levar a uma IA de sua escolha.

     Passa pela MESMA `abrirContexto()` e pela MESMA
     `ideiasDoProjeto()` que o assistente interno usa. Isso não é
     economia de código: é o que garante que o pacote enxergue
     exatamente o mesmo recorte que a pessoa enxerga na tela
     (IA-ISO-004). Uma consulta própria aqui seria o lugar perfeito
     para um `where` se perder — e o vazamento seria invisível,
     porque ninguém revisa um arquivo baixado.

     É `GET` e não `POST` de propósito: não muda nada no servidor, e
     assim o download é uma navegação comum, que o navegador já sabe
     tratar. */
  app.get('/empresas/:empresaId/projetos/:projetoId/ia/pacote', async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    const geradoEm = new Date();
    const markdown = montarPacote({
      empresaNome: ctx.empresaNome,
      empresaDescricao: ctx.empresaDescricao,
      projetoNome: ctx.projetoNome,
      ideias: await ideiasDoProjeto(ctx.projetoId),
      geradoEm,
    });

    const arquivo = nomeDoArquivo(ctx.empresaNome, ctx.projetoNome, geradoEm);

    return resposta
      .header('Content-Type', 'text/markdown; charset=utf-8')
      /* `attachment` é o que faz o navegador baixar em vez de exibir.
         O nome vai entre aspas porque pode conter hífens e ponto. */
      .header('Content-Disposition', `attachment; filename="${arquivo}"`)
      .send(markdown);
  });

  app.get('/empresas/:empresaId/projetos/:projetoId/ia/conversa', async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IA-CONV-003: a conversa é buscada pelo par (projeto, pessoa).
       Não existe caminho para ler a de outra pessoa — nem para o
       proprietário da empresa. */
    const conversa = await db.iaConversa.findFirst({
      where: { projetoId: ctx.projetoId, usuarioId: ctx.usuarioId },
    });

    if (!conversa) {
      /* Conversa nova é lista vazia, não erro. */
      return resposta.send({ mensagens: [], ia_disponivel: env.IA_DRIVER !== 'none' });
    }

    const mensagens = await db.iaMensagem.findMany({
      where: { conversaId: conversa.id },
      orderBy: { criadoEm: 'asc' },
    });

    return resposta.send({
      mensagens: mensagens.map(mensagemParaResposta),
      ia_disponivel: env.IA_DRIVER !== 'none',
    });
  });

  /* ---------- Perguntar ---------- */
  app.post('/empresas/:empresaId/projetos/:projetoId/ia/perguntas', async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IA-CUSTO-004: limite conferido no servidor, e ANTES de gastar
       chamada. Uma pergunta enorme é recusada, não enviada e cobrada. */
    const corpo = z
      .object({
        pergunta: z
          .string({ required_error: 'Escreva sua pergunta.' })
          .trim()
          .min(1, 'Escreva sua pergunta.')
          .max(env.IA_PERGUNTA_MAX, `A pergunta deve ter no máximo ${env.IA_PERGUNTA_MAX} caracteres.`),
      })
      .safeParse(req.body);

    if (!corpo.success) {
      return resposta.code(400).send(erro('pergunta', corpo.error.issues[0]?.message ?? 'Pergunta inválida.'));
    }

    const ideias = await ideiasDoProjeto(ctx.projetoId);
    /* Em paralelo com nada: sao duas leituras curtas e o custo aqui e
       de rede, nao de CPU. Juntas porque as duas descrevem o MESMO
       projeto no MESMO instante — buscar uma antes da outra abriria
       uma janela em que o contexto mistura dois momentos. */
    const tarefas = await tarefasParaOContexto(ctx.projetoId);
    const conversa = await acharOuCriarConversa(ctx.projetoId, ctx.usuarioId);

    /* IA-CONV-004 / decisão A12: só as últimas trocas entram. O teto
       é do servidor porque é ele que paga a conta — mandar a conversa
       inteira cresce custo sem limite e empurra o quadro para fora da
       janela do modelo. */
    const recentes = await db.iaMensagem.findMany({
      where: { conversaId: conversa.id },
      orderBy: { criadoEm: 'desc' },
      take: env.IA_HISTORICO_TROCAS * 2,
    });
    const historico: Troca[] = recentes
      .reverse()
      .map((m: { autor: string; texto: string }) => ({
        autor: m.autor === 'pessoa' ? ('pessoa' as const) : ('assistente' as const),
        texto: m.texto,
      }));

    const pedido = montar(
      {
        empresaNome: ctx.empresaNome,
        empresaDescricao: ctx.empresaDescricao,
        projetoNome: ctx.projetoNome,
        ideias,
        tarefas,
      },
      historico,
      corpo.data.pergunta,
    );

    /* ---- Fase 2 dos créditos: reservar ANTES de chamar (IA-CUSTO-002) ----
       O custo real só se conhece DEPOIS da resposta (é o `usage`
       dela); o saldo precisa ser conferido ANTES. `tetoTotalMicros`
       é um TETO superestimado — nunca o custo final — a partir do
       texto inteiro do pedido e do máximo de saída que o servidor
       permite. Sem provedor configurado não há o que reservar: a
       chamada abaixo vai recusar sozinha, sem custo nenhum. */
    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;

    if (iaConfigurada() && env.CREDITOS_COBRAR === 'sim') {
      const textoCompleto =
        pedido.sistema + '\n' + historico.map((t) => t.texto).join('\n') + '\n' + corpo.data.pergunta;
      const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, textoCompleto, env.IA_MAX_TOKENS);

      if (tetoUsd === null) {
        /* Modelo configurado mas sem preço na tabela de `precos.ts`
           — erro de configuração, não do usuário. Nunca se estima um
           teto chutado só para deixar a chamada passar. */
        return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
      }

      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

      try {
        await reservar(ctx.usuarioId, tetoTotalMicros, operacaoId, 'assistente');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          /* IA-CUSTO-002: recusado ANTES de chamar o provedor. Nunca
             se gasta chamada que não será cobrável. */
          return resposta
            .code(402)
            .send(erro(null, 'Saldo insuficiente para fazer esta pergunta. Adicione créditos para continuar.'));
        }
        throw e;
      }
    }

    let bruta;
    try {
      bruta = await provedorAtual().responder(pedido);
    } catch (e) {
      if (tetoTotalMicros > 0) {
        /* A chamada não aconteceu (ou não terminou) — devolve a
           reserva inteira. Nada foi cobrado. */
        await liberar(ctx.usuarioId, tetoTotalMicros, operacaoId, 'assistente');
      }
      if (e instanceof FalhaDoProvedor) {
        /* IA-CUSTO-003: falha do provedor não consome crédito e não
           grava nada. Cobrar por resposta que não veio é cobrar por
           nada — e gravar meia conversa deixaria a pergunta órfã no
           histórico. */
        return resposta.code(503).send(erro(null, e.message));
      }
      throw e;
    }

    /* ---- A camada que faz a regra valer — IA-GARANT-003/004 ---- */
    const veredito = verificar(bruta.fontes, ideias, tarefas);

    /* Fase 0 dos créditos: o custo é registrado AQUI, depois de
       saber se a resposta passou na verificação, mas antes de
       qualquer `return`. A chamada foi paga nos dois casos — a
       verificação acontece do nosso lado, o provedor já cobrou.

       Uma resposta descartada entra como `descartado`/`cobravel:
       false`: não se cobra do usuário por uma resposta que o próprio
       servidor recusou (IA-CUSTO-003), mas o dinheiro saiu, e a
       linha é o que torna esse desperdício visível. Sem ela, uma
       verificação falhando muito seria um vazamento invisível. */
    if (bruta.uso && bruta.modelo) {
      registrar({
        usuarioId: ctx.usuarioId,
        empresaId: ctx.empresaId,
        projetoId: ctx.projetoId,
        tipo: 'assistente',
        resultado: veredito.ok ? 'entregue' : 'descartado',
        modelo: bruta.modelo,
        uso: bruta.uso,
        requisicaoId: bruta.requisicaoId,
        operacaoId,
      });
    }

    /* ---- Fase 2: acertar a reserva pelo custo VERDADEIRO ----
       A reserva cobriu um TETO; agora que o `usage` real chegou, ela
       é devolvida por inteiro e o custo verdadeiro é debitado à
       parte — o efeito líquido é sempre o custo real, nunca o teto.
       Resposta descartada (IA-CUSTO-003): a reserva volta inteira e
       nada mais é cobrado — o gasto real com o provedor já ficou
       visível em `registrar()`, que rodou acima de qualquer jeito. */
    if (tetoTotalMicros > 0) {
      await liberar(ctx.usuarioId, tetoTotalMicros, operacaoId, 'assistente');

      if (veredito.ok && bruta.uso && bruta.modelo) {
        const usdReal = custoUsdMicros(bruta.modelo, bruta.uso);
        if (usdReal !== null) {
          const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
          const totalReal = comissaoSobre(usdParaMicrosBrl(usdReal, cotacao)).totalMicros;
          if (totalReal > 0) {
            await consumir(ctx.usuarioId, totalReal, operacaoId, 'assistente');
          }
        }
      }
    }

    if (!veredito.ok) {
      /* Fonte que não está no contexto: invenção ou vazamento.
         A resposta não é exibida, e nada é gravado. */
      req.log.error(
        { idsEstranhos: veredito.idsEstranhos, projetoId: ctx.projetoId },
        'resposta da IA citou idéia fora do projeto — descartada',
      );
      return resposta
        .code(503)
        .send(erro(null, 'A resposta do assistente não pôde ser verificada. Tente de novo.'));
    }

    const semVerdade = semVerdadeValidada(veredito.fontes);

    /* IA-ACAO-002/003: a proposta é conferida contra as MESMAS
       idéias do contexto, igual às fontes. Uma proposta que não
       fechar (id fora do projeto, campo fora do limite) vira `null`
       silenciosamente — não derruba a resposta, só não aparece botão
       de confirmar. */
    const acao: AcaoVerificada | null = verificarAcao(bruta.acaoProposta, ideias);

    /* Só grava depois de verificar: o histórico nunca guarda
       resposta que não passou pela checagem. */
    await db.iaMensagem.create({
      data: { conversaId: conversa.id, autor: 'pessoa', texto: corpo.data.pergunta },
    });

    const gravada = await db.iaMensagem.create({
      data: {
        conversaId: conversa.id,
        autor: 'assistente',
        texto: bruta.resposta,
        /* Guarda a procedência COMO FOI VERIFICADA agora
           (IA-GARANT-003). Não é recalculada depois: se a idéia sair
           de `Finalizado`, esta mensagem continua registrando o que
           valia quando foi dita. */
        fontes: veredito.fontes,
        semVerdadeValidada: semVerdade,
        acaoTipo: acao?.tipo ?? null,
        acaoDados: acao ?? undefined,
        acaoStatus: acao ? 'pendente' : 'nenhuma',
      },
    });

    await db.iaConversa.update({
      where: { id: conversa.id },
      data: { atualizadoEm: new Date() },
    });

    return resposta.send({
      mensagem: mensagemParaResposta(gravada),
      /* A tela usa isto para avisar que houve rebaixamento — o
         servidor marcou, mas não reescreveu o texto (IA-GARANT-005). */
      houve_rebaixamento: veredito.houveRebaixamento,
    });
  });

  /* ------------------------------------------------------------
     Confirmar / descartar uma ação proposta — IA-ACAO-004 a 006
     ------------------------------------------------------------
     A proposta em si nunca escreve nada (rota `/perguntas` acima só
     grava um "pendente"). Estas duas rotas são o ÚNICO caminho pelo
     qual uma proposta do assistente vira escrita real no quadro — e
     só correm depois de um clique explícito da pessoa. Nenhuma delas
     confia no que foi verificado na hora da resposta: o papel e o
     conteúdo são conferidos DE NOVO, porque minutos podem ter
     passado entre a proposta e o clique.
     ------------------------------------------------------------ */
  async function buscarMensagemPendente(req: FastifyRequest, ctx: Extract<Contexto, { ok: true }>) {
    const params = z.object({ mensagemId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return null;

    /* Só na PRÓPRIA conversa (IA-CONV-003) — a mesma privacidade que
       já vale para ler a conversa vale para agir sobre ela. */
    const conversa = await db.iaConversa.findFirst({
      where: { projetoId: ctx.projetoId, usuarioId: ctx.usuarioId },
    });
    if (!conversa) return null;

    return db.iaMensagem.findFirst({
      where: { id: params.data.mensagemId, conversaId: conversa.id, autor: 'assistente' },
    });
  }

  /* IDEIA-DUPL-001 também vale AQUI (corrigido 16/09/2026).
     ------------------------------------------------------------
     A regra diz "ao criar ou editar uma idéia" — não "ao criar pela
     tela do quadro". Esta rota gravava com `db.ideia.create` direto,
     sem passar pela checagem, então a porta da IA era um jeito de
     criar duplicata sem nunca ver o aviso. Pior que um furo comum:
     é justamente a IA que sugere criar idéias a partir de uma
     conversa longa, onde a chance de propor algo que já está no
     quadro é maior, não menor.

     Cópia local da busca em vez de importar a de `ideias.ts`: quem
     decide o que entra na comparação é sempre o chamador (contrato
     escrito em `duplicidade.ts`), e as duas rotas não têm por que
     depender uma da outra. São três linhas. */
  async function buscarPossivelDuplicata(
    projetoId: string,
    conteudo: { titulo: string; descricao: string },
    ignorarId?: string | null,
  ) {
    const ativas = await db.ideia.findMany({ where: { projetoId, arquivadoEm: null } });
    const achada = encontrarDuplicata(conteudo, ativas, ignorarId);
    return achada ? (ativas.find((i) => i.id === achada.id) ?? null) : null;
  }

  /* O reenvio depois do aviso. Mesmo nome e mesmo sentido do corpo
     de `ideias.ts`: ausente ou `false`, a checagem roda. O corpo
     inteiro é opcional porque "Confirmar" continua sendo um POST
     sem corpo nenhum. */
  const corpoConfirmar = z.object({ ignorar_duplicata: z.boolean().optional().default(false) });

  app.post('/empresas/:empresaId/projetos/:projetoId/ia/mensagens/:mensagemId/confirmar', async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    const mensagem = await buscarMensagemPendente(req, ctx);
    if (!mensagem) return resposta.code(404).send(erro(null, 'Mensagem não encontrada.'));

    if (mensagem.acaoStatus !== 'pendente') {
      return resposta.code(409).send(erro(null, 'Esta sugestão já foi respondida.'));
    }

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite alterar idéias.'));
    }

    const confirmacao = corpoConfirmar.safeParse(req.body ?? {});
    const ignorarDuplicata = confirmacao.success ? confirmacao.data.ignorar_duplicata : false;

    const dados = (mensagem.acaoDados ?? {}) as Record<string, unknown>;

    /* IDEIA-CRIA-003 continua valendo mesmo vindo do assistente: toda
       idéia nova nasce em "Minhas idéias", nunca direto em
       "Finalizado" — a fronteira de IA-CONHEC-002 seria contornada
       na hora se a IA pudesse fazer nascer uma idéia já validada. */
    if (mensagem.acaoTipo === 'criar_ideia') {
      const conteudo = conteudoAcao.safeParse(dados);
      if (!conteudo.success) {
        await db.iaMensagem.update({ where: { id: mensagem.id }, data: { acaoStatus: 'descartada' } });
        return resposta.code(422).send(erro(null, 'A sugestão não é mais válida. Recarregue a conversa.'));
      }

      /* IDEIA-DUPL-003: achou parecida e a pessoa ainda não disse
         "mesmo assim" -> NÃO grava nada e devolve 200 com a idéia
         parecida. A sugestão continua `pendente`, então os mesmos
         "Confirmar"/"Descartar" da conversa continuam valendo — é
         uma decisão a mais, não uma sugestão queimada. */
      if (!ignorarDuplicata) {
        const duplicata = await buscarPossivelDuplicata(ctx.projetoId, conteudo.data);
        if (duplicata) return resposta.send({ possivel_duplicata: ideiaParaResposta(duplicata) });
      }

      const ideia = await db.ideia.create({
        data: {
          projetoId: ctx.projetoId,
          titulo: conteudo.data.titulo,
          descricao: conteudo.data.descricao,
          importancia: conteudo.data.importancia,
          status: 'ideias',
          criadoPor: ctx.usuarioId,
        },
      });

      const atualizada = await db.iaMensagem.update({
        where: { id: mensagem.id },
        data: { acaoStatus: 'confirmada', acaoIdeiaId: ideia.id },
      });

      return resposta.send({ ideia: ideiaParaResposta(ideia), mensagem: mensagemParaResposta(atualizada) });
    }

    if (mensagem.acaoTipo === 'editar_ideia') {
      const ideiaId = typeof dados.ideiaId === 'string' ? dados.ideiaId : null;
      const conteudo = conteudoAcao.safeParse(dados);
      const existente = ideiaId
        ? await db.ideia.findFirst({ where: { id: ideiaId, projetoId: ctx.projetoId, arquivadoEm: null } })
        : null;

      if (!ideiaId || !conteudo.success || !existente) {
        await db.iaMensagem.update({ where: { id: mensagem.id }, data: { acaoStatus: 'descartada' } });
        return resposta.code(422).send(erro(null, 'A sugestão não é mais válida. Recarregue a conversa.'));
      }

      /* IDEIA-DUPL-008: ao editar, a própria idéia nunca é comparada
         com ela mesma — senão toda edição bateria com o registro
         original e o aviso viraria impossível de escapar. */
      if (!ignorarDuplicata) {
        const duplicata = await buscarPossivelDuplicata(ctx.projetoId, conteudo.data, existente.id);
        if (duplicata) return resposta.send({ possivel_duplicata: ideiaParaResposta(duplicata) });
      }

      /* Sem `status` no data: editar texto nunca move o card — mesma
         regra de `ideias.ts`. */
      const ideia = await db.ideia.update({
        where: { id: existente.id },
        data: {
          titulo: conteudo.data.titulo,
          descricao: conteudo.data.descricao,
          importancia: conteudo.data.importancia,
        },
      });

      const atualizada = await db.iaMensagem.update({
        where: { id: mensagem.id },
        data: { acaoStatus: 'confirmada', acaoIdeiaId: ideia.id },
      });

      return resposta.send({ ideia: ideiaParaResposta(ideia), mensagem: mensagemParaResposta(atualizada) });
    }

    if (mensagem.acaoTipo === 'mover_ideia') {
      const ideiaId = typeof dados.ideiaId === 'string' ? dados.ideiaId : null;
      const status = typeof dados.status === 'string'
        && (STATUS_VALIDOS_ACAO as readonly string[]).includes(dados.status)
        ? (dados.status as (typeof STATUS_VALIDOS_ACAO)[number])
        : null;
      const existente = ideiaId
        ? await db.ideia.findFirst({ where: { id: ideiaId, projetoId: ctx.projetoId, arquivadoEm: null } })
        : null;

      if (!ideiaId || !status || !existente) {
        await db.iaMensagem.update({ where: { id: mensagem.id }, data: { acaoStatus: 'descartada' } });
        return resposta.code(422).send(erro(null, 'A sugestão não é mais válida. Recarregue a conversa.'));
      }

      /* Soltar na coluna onde já está não é alteração — mesma regra
         de IDEIA-MOV-003. */
      const ideia = existente.status === status
        ? existente
        : await db.ideia.update({ where: { id: existente.id }, data: { status } });

      const atualizada = await db.iaMensagem.update({
        where: { id: mensagem.id },
        data: { acaoStatus: 'confirmada', acaoIdeiaId: ideia.id },
      });

      return resposta.send({ ideia: ideiaParaResposta(ideia), mensagem: mensagemParaResposta(atualizada) });
    }

    /* Tipo desconhecido — não deveria acontecer (o enum do banco já
       recusa), mas uma migração futura sem código correspondente
       não pode virar exceção não tratada. */
    return resposta.code(500).send(erro(null, 'Tipo de ação não reconhecido.'));
  });

  app.post('/empresas/:empresaId/projetos/:projetoId/ia/mensagens/:mensagemId/descartar', async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    const mensagem = await buscarMensagemPendente(req, ctx);
    if (!mensagem) return resposta.code(404).send(erro(null, 'Mensagem não encontrada.'));

    if (mensagem.acaoStatus !== 'pendente') {
      return resposta.code(409).send(erro(null, 'Esta sugestão já foi respondida.'));
    }

    /* Descartar não escreve no quadro — qualquer papel que enxerga a
       conversa pode dispensar a própria sugestão, sem a checagem de
       `podeEscrever` que a confirmação exige. */
    const atualizada = await db.iaMensagem.update({
      where: { id: mensagem.id },
      data: { acaoStatus: 'descartada' },
    });

    return resposta.send({ mensagem: mensagemParaResposta(atualizada) });
  });
}

/* Reproduzido de `ideias.ts` pelo mesmo motivo de sempre — este
   módulo não tem por que depender daquele existir. Usado só pelas
   rotas de confirmação, que precisam devolver a idéia no mesmo
   formato que o quadro já espera. */
function ideiaParaResposta(i: {
  id: string; titulo: string; descricao: string; importancia: number; status: string;
  criadoEm: Date; atualizadoEm: Date;
}) {
  return {
    id: i.id,
    titulo: i.titulo,
    descricao: i.descricao,
    importancia: i.importancia,
    status: i.status,
    criado_em: i.criadoEm.toISOString(),
    atualizado_em: i.atualizadoEm.toISOString(),
  };
}
