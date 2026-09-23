/* ============================================================
   Rotas do quadro de trabalho de uma tarefa — board.html
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md

     BOARD-ACESSO   a tela pertence a UMA tarefa; quem chega aqui
                    veio de `atividade.html` pelo `tipo` dela.
     BOARD-QUADRO   quadro > coluna > registro, tudo preso à
                    tarefa (decisão A24).
     BOARD-SALVA    a tela grava o quadro inteiro de uma vez, e a
                    resposta é o quadro relido do banco.

   Mesma corrente de isolamento de `tarefas.ts` (empresa -> projeto
   -> idéia -> tarefa), reproduzida aqui em vez de importada — mesma
   decisão já registrada em `ideias.ts` e `tarefas.ts`: duplicação
   pequena e deliberada em vez de acoplamento entre módulos de
   rota. Um quadro nunca é alcançado sem que os quatro elos tenham
   passado.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* ------------------------------------------------------------
   O corpo do PUT — o quadro inteiro (BOARD-SALVA-001).
   ------------------------------------------------------------
   Tetos existem para que um payload absurdo seja recusado antes de
   virar transação, não porque a pessoa vá esbarrar neles: 40
   quadros de 12 colunas com 200 registros cada já é muito mais do
   que cabe num canvas legível.

   `titulo` de quadro e de coluna aceita vazio de propósito — o
   protótipo já oferece "deixe em branco para uma coluna sem
   título", e isso é escolha de layout. O do REGISTRO não: um
   post-it sem texto nenhum é um card que ninguém sabe ler.
   ------------------------------------------------------------ */
const registroEntrada = z.object({
  titulo: z
    .string({ required_error: 'Informe o título do registro.' })
    .trim()
    .min(1, 'Informe o título do registro.')
    .max(260, 'O título do registro deve ter no máximo 260 caracteres.'),
  descricao: z
    .string()
    .trim()
    /* Teto de sanidade, não limite de uso: quem restringe de verdade
       é a regra por tipo de quadro, logo abaixo. Um post-it continua
       preso aos 280; um documento não tem por que estar. */
    .max(50000, 'Texto grande demais para um registro.')
    .optional()
    .default(''),
});

const colunaEntrada = z.object({
  titulo: z
    .string()
    .trim()
    .max(60, 'O título da coluna deve ter no máximo 60 caracteres.')
    .optional()
    .default(''),
  registros: z
    .array(registroEntrada)
    .max(200, 'Coluna com registros demais.')
    .optional()
    .default([]),
});

/* ------------------------------------------------------------
   Dois tipos de quadro, duas regras de conteúdo
   ------------------------------------------------------------
   `postits` é o quadro de sempre: anotações curtas, uma por cartão,
   com os 280 caracteres que fazem um post-it ser um post-it.

   `documento` existe porque resposta longa de pesquisa não é anotação.
   Fatiada em cartões de 280 ela virava "Resposta (1/4)": ninguém lê
   como texto, ninguém usa como anotação, e as referências ficam
   separadas do trecho que sustentam. Aqui o texto corre inteiro, com
   as fontes no fim.

   A regra vive no tipo do quadro, e não no registro, porque é uma
   propriedade do que aquele quadro É — o registro sozinho não tem como
   saber se 3.000 caracteres ali são um documento legítimo ou um
   post-it que passou do ponto. */
const quadroEntrada = z
  .object({
    titulo: z
      .string()
      .trim()
      .max(260, 'O título do quadro deve ter no máximo 260 caracteres.')
      .optional()
      .default(''),
    tipo: z.enum(['postits', 'documento']).optional().default('postits'),
    colunas: z
      .array(colunaEntrada)
      .max(12, 'Quadro com colunas demais.')
      .optional()
      .default([]),
  })
  .superRefine((quadro, ctx) => {
    if (quadro.tipo !== 'postits') return;
    quadro.colunas.forEach((coluna, iCol) => {
      coluna.registros.forEach((registro, iReg) => {
        if (registro.descricao.length > 280) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['colunas', iCol, 'registros', iReg, 'descricao'],
            message: 'A descrição de um post-it deve ter no máximo 280 caracteres.',
          });
        }
      });
    });
  });

const corpoDoQuadro = z.object({
  quadros: z.array(quadroEntrada).max(40, 'Tarefa com quadros demais.'),
});

const paramsTarefa = z.object({
  empresaId: z.string().uuid(),
  projetoId: z.string().uuid(),
  ideiaId: z.string().uuid(),
  tarefaId: z.string().uuid(),
});

/* Mesma função de auth das outras rotas — reproduzida, não
   importada, pelo mesmo motivo registrado em tarefas.ts. */
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

/* BOARD-SALVA-004 aponta para ATV-TAR-CRIA-004: quem pode mexer
   nas tarefas é quem pode mexer no quadro delas. Não haveria razão
   para o quadro ter uma régua própria — ele é o trabalho da
   tarefa, não outra coisa. */
export function podeEscrever(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro' || papel === 'especialista';
}

/* Exportados para rotas/referencias.ts, que é do mesmo módulo (o
   board de uma tarefa) e precisa da MESMA corrente de isolamento — não
   de uma segunda cópia dela. `status` e `tipo` vão junto porque as
   referências recusam tarefa concluída e tarefa de outro tipo. */
export type Contexto =
  | { ok: false; code: number; corpo: unknown }
  | { ok: true; usuarioId: string; papel: string; tarefaId: string; tarefaStatus: string; tarefaTipo: string };

/* A corrente inteira — empresa -> projeto -> idéia -> tarefa. Tudo o
   que falha depois da autenticação devolve 404 com a mesma
   mensagem, mesmo raciocínio de IDEIA-ISO-004: não contar a quem
   está adivinhando ids se a coisa não existe ou só não é dele. */
export async function abrirContexto(req: FastifyRequest): Promise<Contexto> {
  const naoEncontrado = {
    ok: false as const,
    code: 404,
    corpo: erro(null, 'Tarefa não encontrada.'),
  };

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
      corpo: {
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      },
    };
  }

  const base = paramsTarefa.safeParse(req.params);
  if (!base.success) return naoEncontrado;
  const { empresaId, projetoId, ideiaId, tarefaId } = base.data;

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

  /* Elo 2 — o projeto existe, está ativo e é desta empresa. */
  const projeto = await db.projeto.findFirst({
    where: { id: projetoId, empresaId, arquivadoEm: null },
  });
  if (!projeto) return naoEncontrado;

  /* Elo 3 — a idéia existe, está ativa e é deste projeto. */
  const ideia = await db.ideia.findFirst({
    where: { id: ideiaId, projetoId, arquivadoEm: null },
    select: { id: true },
  });
  if (!ideia) return naoEncontrado;

  /* Elo 4 — a tarefa pertence à idéia já validada. */
  const tarefa = await db.tarefa.findFirst({
    where: { id: tarefaId, ideiaId: ideia.id },
    select: { id: true, status: true, tipo: true },
  });
  if (!tarefa) return naoEncontrado;

  return {
    ok: true,
    usuarioId,
    papel: vinculo.papel,
    tarefaId: tarefa.id,
    tarefaStatus: tarefa.status,
    tarefaTipo: tarefa.tipo,
  };
}

/* Sempre a mesma leitura, em ordem estável, para o GET e para a
   resposta do PUT — a tela redesenha a partir do que voltou, então
   as duas precisam devolver exatamente a mesma forma. */
async function lerQuadros(tarefaId: string) {
  const quadros = await db.quadro.findMany({
    where: { tarefaId },
    orderBy: { ordem: 'asc' },
    include: {
      colunas: {
        orderBy: { ordem: 'asc' },
        include: { registros: { orderBy: { ordem: 'asc' } } },
      },
    },
  });

  return quadros.map((q) => ({
    id: q.id,
    titulo: q.titulo,
    tipo: q.tipo,
    ordem: q.ordem,
    colunas: q.colunas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      ordem: c.ordem,
      registros: c.registros.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        descricao: r.descricao,
        ordem: r.ordem,
      })),
    })),
  }));
}

function primeiroErro(falha: z.ZodError): Erro {
  const problema = falha.issues[0];
  const campo = problema?.path?.[0];
  return erro(
    typeof campo === 'string' ? campo : null,
    problema?.message ?? 'Dados inválidos.'
  );
}

export async function rotasBoard(app: FastifyInstance) {
  const PREFIXO =
    '/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/quadros';

  /* ---------- Ler o quadro — BOARD-QUADRO-001 ----------
     Lista vazia é resposta válida e significa "tarefa sem quadro
     ainda", não erro. Diferente de `tarefas.ts`, aqui NÃO existe
     "encontra ou cria": um quadro-semente seria conteúdo que
     ninguém pediu, e a tela já sabe desenhar o estado vazio. */
  app.get(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    return resposta.send({ quadros: await lerQuadros(ctx.tarefaId) });
  });

  /* ---------- Gravar o quadro inteiro — BOARD-SALVA-001 a 004 ----------
     Um PUT que substitui tudo, em vez de uma rota por gesto
     (criar coluna, mover registro, renomear quadro...). Duas
     razões, e as duas vêm da tela:

     1. O canvas salva sozinho a cada gesto (o "Salvando..." do
        botão Voltar). Uma rota por gesto seria uma dúzia de rotas
        para o mesmo autosave.
     2. Arrastar um registro entre colunas muda duas colunas de uma
        vez. Gravar o estado inteiro torna isso um caso comum, não
        um caso especial.

     O preço é conhecido e aceito: duas pessoas no mesmo quadro ao
     mesmo tempo — a última gravação vence, sem aviso. É o mesmo
     que `ideias-movimentacao.md` §4 já aceitou para movimentação
     de idéias, pelo mesmo motivo (volume atual), e está registrado
     como pendência em board-lista.md. */
  app.put(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite editar o quadro.'));
    }

    const dados = corpoDoQuadro.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    /* Apaga e regrava numa transação só. Ids mudam a cada gravação
       — e por isso a tela SEMPRE redesenha a partir da resposta,
       nunca guarda id de registro entre um autosave e o seguinte
       (BOARD-SALVA-003). Cascade cuida de colunas e registros: não
       é preciso apagar os três níveis à mão. */
    await db.$transaction(async (tx) => {
      await tx.quadro.deleteMany({ where: { tarefaId: ctx.tarefaId } });

      for (let q = 0; q < dados.data.quadros.length; q++) {
        const quadro = dados.data.quadros[q]!;
        await tx.quadro.create({
          data: {
            tarefaId: ctx.tarefaId,
            titulo: quadro.titulo,
            tipo: quadro.tipo,
            ordem: q,
            colunas: {
              create: quadro.colunas.map((coluna, c) => ({
                titulo: coluna.titulo,
                ordem: c,
                registros: {
                  create: coluna.registros.map((registro, r) => ({
                    titulo: registro.titulo,
                    descricao: registro.descricao,
                    ordem: r,
                  })),
                },
              })),
            },
          },
        });
      }
    });

    /* Relê do banco em vez de devolver o que chegou: é o que
       garante que a tela e a tabela não divirjam nem por um id. */
    return resposta.send({ quadros: await lerQuadros(ctx.tarefaId) });
  });
}
