/* ============================================================
   Rotas de atividades (tarefas)
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/atividade-lista.md
           Documentacao/melhoria-validacao-tipos-tarefas.md

   Quatro endpoints, todos aninhados em
   /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas

   A corrente de isolamento é a mesma de idéias, com um elo a mais:
   empresa → projeto → idéia → tarefa (ATV-TAR-CRIA-004).

   Como em ideias.ts, a corrente vive em `abrirContexto()`, e toda
   rota começa chamando essa função.

   VALIDAÇÃO DE DESCRIÇÃO: durante a criação, a descrição é analisada
   para detectar se é compatível com o tipo selecionado. Descrições
   criativas (com palavras como "criar", "escrever", "design") são
   marcadas como "entregavel"-friendly; descrições verificáveis
   (com números, datas, questões concretas) são "pesquisa"-friendly.
   Incompatibilidades são avisos, não erros — a pessoa pode
   confirmar mesmo assim (opção de override).
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* Limites de ATV-TAR-CRIA-001, mesmos de idéias por consistência. */
const conteudoTarefa = z.object({
  titulo: z
    .string({ required_error: 'Informe o título da tarefa.' })
    .trim()
    .min(1, 'Informe o título da tarefa.')
    .max(60, 'O título deve ter no máximo 60 caracteres.'),
  descricao: z
    .string({ required_error: 'Informe a descrição da tarefa.' })
    .trim()
    .min(1, 'Informe a descrição da tarefa.')
    .max(280, 'A descrição deve ter no máximo 280 caracteres.'),
  /* Campo opcional para confirmar aviso de descrição incompatível
     (option de override do aviso) */
  ignorar_incompatibilidade: z.boolean().optional().default(false),
});

/* ============================================================
   Análise de descrição de tarefa (melhoria-validacao-tipos-tarefas.md)
   ============================================================
   Detecta se a descrição é mais verificável (pesquisa-friendly) ou
   criativa (entregavel-friendly), e recomenda um tipo. Não é bloqueio,
   é um aviso que a pessoa pode ignorar com `ignorar_incompatibilidade`. */
type AnaliseTarefa =
  | { tipo: 'verificavel'; recomendacoes?: string[] }
  | { tipo: 'criativo'; recomendacoes?: string[] };

function analisarDescricao(descricao: string): AnaliseTarefa {
  const indicadoresVerificavel = [
    /quantos?\b/i,      // Quantos/Quanto
    /qual\w*s?\b/i,     // Qual/Quais (concreto)
    /onde?\b/i,         // Onde
    /quando?\b/i,       // Quando
    /porcent/i,         // Percentual
    /prec/i,            // Preço
    /R\$\b/,            // Valor
    /\d+/,              // Números
    /pesquisar\b/i,     // Pesquisar
    /buscar\b/i,        // Buscar
    /dados\b/i,         // Dados
    /fonte\b/i,         // Fonte
  ];

  const indicadoresCriativo = [
    /criar\b/i,         // Criar
    /design\b/i,        // Design
    /escrever\b/i,      // Escrever
    /propor\b/i,        // Propor
    /slogan\b/i,        // Slogan
    /roteiro\b/i,       // Roteiro
    /wireframe\b/i,     // Wireframe
    /prototip/i,        // Prototipo
    /mockup\b/i,        // Mockup
    /brainstorm\b/i,    // Brainstorm
  ];

  let scoreVerificavel = 0;
  let scoreCriativo = 0;

  for (const padrao of indicadoresVerificavel) {
    if (padrao.test(descricao)) scoreVerificavel++;
  }

  for (const padrao of indicadoresCriativo) {
    if (padrao.test(descricao)) scoreCriativo++;
  }

  if (scoreCriativo > scoreVerificavel) {
    return { tipo: 'criativo' };
  }
  return { tipo: 'verificavel' };
}

const mudancaDeStatus = z.object({
  status: z.enum(['pendente', 'concluida'], {
    errorMap: () => ({ message: 'Status inválido.' }),
  }),
});

const mudancaDeOrdem = z.object({
  ordem: z.number().int('A ordem deve ser um número inteiro.'),
});

const paramsAtividade = z.object({
  empresaId: z.string().uuid(),
  projetoId: z.string().uuid(),
  ideiaId: z.string().uuid(),
});

const paramsTarefa = paramsAtividade.extend({ tarefaId: z.string().uuid() });

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

function podeEscrever(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro' || papel === 'especialista';
}

type Contexto =
  | { ok: false; code: number; corpo: unknown }
  | {
      ok: true;
      usuarioId: string;
      papel: string;
      empresaId: string;
      projetoId: string;
      ideiaId: string;
      /* Presente só quando a rota recebe id de tarefa. */
      tarefaId: string | null;
    };

async function abrirContexto(req: FastifyRequest, comTarefa: boolean): Promise<Contexto> {
  const naoEncontrado = { ok: false as const, code: 404, corpo: erro(null, 'Atividade não encontrada.') };

  const usuarioId = await quemPede(req);
  if (!usuarioId) {
    return { ok: false, code: 401, corpo: erro(null, 'Sessão expirada.') };
  }

  const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) {
    return { ok: false, code: 401, corpo: erro(null, 'Sessão expirada.') };
  }
  if (usuario.suspensoEm) {
    return {
      ok: false,
      code: 403,
      corpo: { ...erro(null, 'Conta suspensa.'), suspensao: usuario.suspensaoMotivo ?? 'violacao' },
    };
  }

  const base = paramsAtividade.safeParse(req.params);
  if (!base.success) return naoEncontrado;

  let tarefaId: string | null = null;
  if (comTarefa) {
    const comId = paramsTarefa.safeParse(req.params);
    if (!comId.success) return naoEncontrado;
    tarefaId = comId.data.tarefaId;
  }

  const { empresaId, projetoId, ideiaId } = base.data;

  /* Elo 1 — vínculo ativo com a empresa. */
  const vinculo = await db.empresaMembro.findFirst({
    where: {
      empresaId,
      usuarioId,
      revogadoEm: null,
      OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
      empresa: { arquivadoEm: null },
    },
  });
  if (!vinculo) return naoEncontrado;

  /* Elo 2 — o projeto existe, está ativo e é DESTA empresa. */
  const projeto = await db.projeto.findFirst({
    where: { id: projetoId, empresaId, arquivadoEm: null },
  });
  if (!projeto) return naoEncontrado;

  /* Elo 3 — a idéia pertence ao projeto já validado. */
  const ideia = await db.ideia.findFirst({
    where: { id: ideiaId, projetoId, arquivadoEm: null },
  });
  if (!ideia) return naoEncontrado;

  return { ok: true, usuarioId, papel: vinculo.papel, empresaId, projetoId, ideiaId, tarefaId };
}

async function buscarTarefa(ideiaId: string, tarefaId: string) {
  return db.tarefa.findFirst({ where: { id: tarefaId, ideiaId } });
}

type LinhaTarefa = {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  ordem: number;
  criadoEm: Date;
  atualizadoEm: Date;
};

function tarefaParaResposta(t: LinhaTarefa) {
  return {
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    status: t.status,
    ordem: t.ordem,
    criado_em: t.criadoEm.toISOString(),
    atualizado_em: t.atualizadoEm.toISOString(),
  };
}

function primeiroErro(falha: z.ZodError): Erro {
  const problema = falha.issues[0];
  const campo = problema?.path?.[0];
  return erro(typeof campo === 'string' ? campo : null, problema?.message ?? 'Dados inválidos.');
}

export async function rotasAtividades(app: FastifyInstance) {
  /* ---------- Listar/encontrar-ou-criar — ATV-ACESSO-002/003 ---------- */
  app.get('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* ATV-ACESSO-002: Se a idéia ainda não tem nenhuma tarefa,
       cria a tarefa-semente a partir do título/descrição da idéia. */
    let tarefas = await db.tarefa.findMany({
      where: { ideiaId: ctx.ideiaId },
      orderBy: { ordem: 'asc' },
    });

    if (tarefas.length === 0) {
      /* Buscar a idéia para copiar título e descrição */
      const ideia = await db.ideia.findUnique({
        where: { id: ctx.ideiaId },
        select: { titulo: true, descricao: true },
      });

      if (ideia) {
        /* Criar a tarefa-semente como a primeira tarefa */
        const semente = await db.tarefa.create({
          data: {
            ideiaId: ctx.ideiaId,
            titulo: ideia.titulo,
            descricao: ideia.descricao,
            status: 'pendente',
            ordem: 0,
          },
        });
        tarefas = [semente];
      }
    }

    return resposta.send({ tarefas: tarefas.map(tarefaParaResposta) });
  });

  /* ---------- Criar — ATV-TAR-CRIA-001 a 004 ---------- */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar tarefas.'));
    }

    const dados = conteudoTarefa.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    /* Analisar se a descrição é mais adequada para pesquisa ou entregável.
       Se não foi confirmado (`ignorar_incompatibilidade` está false),
       devolver um aviso em vez de criar. */
    const analise = analisarDescricao(dados.data.descricao);

    if (!dados.data.ignorar_incompatibilidade && analise.tipo === 'criativo') {
      /* Descrição parece criativa/reflexiva, mas usuário não confirmou.
         Devolver 202 (Accepted but needs confirmation) com recomendações. */
      return resposta.code(202).send({
        ok: false,
        aviso: 'Descrição detectada como criativa/reflexiva',
        tipo_detectado: 'criativo',
        mensagem:
          'A descrição "' + dados.data.titulo + '" parece pedir criatividade ou raciocínio.\n\n' +
          'Você pode:\n' +
          '① Manter mesmo assim (clique novamente com a tarefa ainda preenchida).\n' +
          '② Reformular a descrição como algo mais concreto (ex: "Pesquisar slogans bem-sucedidos em empresas similares").\n' +
          '③ Criar como entregável em vez de pesquisa.',
        recomendacoes: [
          'Se é um trabalho criativo (design, escrita, prototipagem), considere uma outra categoria de tarefa.',
          'Se é pesquisa, adicione detalhes como "buscar", "analisar", "comparar" fontes específicas.',
        ],
      });
    }

    /* ATV-TAR-CRIA-002: nova tarefa nasce no fim da lista. */
    const ultimaTarefa = await db.tarefa.findFirst({
      where: { ideiaId: ctx.ideiaId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });

    const proxima_ordem = (ultimaTarefa?.ordem ?? -1) + 1;

    /* ATV-TAR-CRIA-003: toda tarefa nasce com status pendente. */
    const tarefa = await db.tarefa.create({
      data: {
        ideiaId: ctx.ideiaId,
        titulo: dados.data.titulo,
        descricao: dados.data.descricao,
        status: 'pendente',
        ordem: proxima_ordem,
      },
    });

    return resposta.code(201).send({ tarefa: tarefaParaResposta(tarefa) });
  });

  /* ---------- Reordenar — ATV-TAR-ORDEM-001 a 005 ---------- */
  app.patch(
    '/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/ordem',
    async (req, resposta) => {
      const ctx = await abrirContexto(req, true);
      if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

      if (!podeEscrever(ctx.papel)) {
        return resposta.code(403).send(erro(null, 'Seu papel não permite reordenar tarefas.'));
      }

      const tarefa = await buscarTarefa(ctx.ideiaId, ctx.tarefaId!);
      if (!tarefa) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

      const dados = mudancaDeOrdem.safeParse(req.body);
      if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

      /* ATV-TAR-ORDEM-005: se a posição não mudou, retorna sem fazer nada. */
      if (tarefa.ordem === dados.data.ordem) {
        const todasTarefas = await db.tarefa.findMany({
          where: { ideiaId: ctx.ideiaId },
          orderBy: { ordem: 'asc' },
        });
        return resposta.send({ tarefas: todasTarefas.map(tarefaParaResposta) });
      }

      /* Renumerar as tarefas — se foi para cima, cai no meio e
         as do meio sobem; se foi para baixo, o oposto. Mantém a
         ordem simples e numerada de 0 em diante. */
      if (dados.data.ordem < tarefa.ordem) {
        /* Subindo: as tarefas entre a nova e a antiga posição aumentam de ordem */
        await db.tarefa.updateMany({
          where: {
            ideiaId: ctx.ideiaId,
            ordem: { gte: dados.data.ordem, lt: tarefa.ordem },
            id: { not: tarefa.id },
          },
          data: { ordem: { increment: 1 } },
        });
      } else {
        /* Descendo: as tarefas entre a antiga e a nova posição caem de ordem */
        await db.tarefa.updateMany({
          where: {
            ideiaId: ctx.ideiaId,
            ordem: { gt: tarefa.ordem, lte: dados.data.ordem },
            id: { not: tarefa.id },
          },
          data: { ordem: { decrement: 1 } },
        });
      }

      /* Atualizar a tarefa movida */
      await db.tarefa.update({
        where: { id: tarefa.id },
        data: { ordem: dados.data.ordem },
      });

      /* Retornar a lista completa reordenada */
      const todasTarefas = await db.tarefa.findMany({
        where: { ideiaId: ctx.ideiaId },
        orderBy: { ordem: 'asc' },
      });

      return resposta.send({ tarefas: todasTarefas.map(tarefaParaResposta) });
    },
  );

  /* ---------- Mudar status — ATV-TAR-CONCLUIR-001 a 004 ---------- */
  app.patch(
    '/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/status',
    async (req, resposta) => {
      const ctx = await abrirContexto(req, true);
      if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

      if (!podeEscrever(ctx.papel)) {
        return resposta.code(403).send(erro(null, 'Seu papel não permite mudar o status de tarefas.'));
      }

      const tarefa = await buscarTarefa(ctx.ideiaId, ctx.tarefaId!);
      if (!tarefa) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

      const dados = mudancaDeStatus.safeParse(req.body);
      if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

      /* ATV-TAR-CONCLUIR-001: só o status muda, nada mais. */
      const atualizada = await db.tarefa.update({
        where: { id: tarefa.id },
        data: { status: dados.data.status },
      });

      return resposta.send({ tarefa: tarefaParaResposta(atualizada) });
    },
  );
}
