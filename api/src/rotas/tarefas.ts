/* ============================================================
   Rotas de tarefas (atividade)
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/atividade-lista.md

     §0              não existe tabela `atividades` — a atividade É
                      a idéia; `tarefas` prende direto no id dela.
     ATV-ACESSO       a primeira leitura da lista cria a tarefa-
                      semente a partir do título/descrição da idéia.
     ATV-TAR-CRIA     criar tarefa — sempre no fim, sempre pendente.
     ATV-TAR-ORDEM    reordenar — dado gravado, não visual.
     ATV-TAR-CONCLUIR concluir/reabrir — só muda `status`.
     ATV-TAR-EXCLUI   excluir — apaga a linha de verdade, sem
                      arquivamento.
     BOARD-ACESSO     `tipo` decide que tela o "Acessar tarefa"
                      abre — campo estável, nunca o texto do
                      título (board-lista.md §1.1).

   Mesma corrente de isolamento de `ideias.ts`
   (empresa → projeto → idéia), com um quarto elo quando a rota
   recebe id de tarefa: a tarefa precisa pertencer à idéia já
   validada. A função vive aqui, e não importada de `ideias.ts`,
   pelo mesmo motivo já registrado lá: duplicação pequena e
   deliberada em vez de acoplamento entre módulos de rota.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* Mesmos limites de idéia (ATV-TAR-CRIA-001, decisão A18) —
   consistência entre módulos, não coincidência. */
const TIPOS_VALIDOS = ['pesquisa', 'matriz_csd'] as const;
type TipoTarefa = (typeof TIPOS_VALIDOS)[number];

const conteudoTarefa = z.object({
  titulo: z
    .string({ required_error: 'Informe o título da tarefa.' })
    .trim()
    .min(1, 'Informe o título da tarefa.')
    .max(260, 'O título deve ter no máximo 260 caracteres.'),
  descricao: z
    .string({ required_error: 'Informe a descrição da tarefa.' })
    .trim()
    .min(1, 'Informe a descrição da tarefa.')
    .max(280, 'A descrição deve ter no máximo 280 caracteres.'),
  /* BOARD-ACESSO-002: opcional no corpo, mas nunca ausente na
     linha — quem não escolher cai em `pesquisa`, porque toda tarefa
     tem um espaço de trabalho (decisão A31). */
  tipo: z
    .enum(TIPOS_VALIDOS, {
      errorMap: () => ({ message: 'Escolha um tipo válido para a tarefa.' }),
    })
    .optional(),
});

const STATUS_VALIDOS = ['pendente', 'concluida'] as const;
type StatusTarefa = (typeof STATUS_VALIDOS)[number];

const mudancaDeStatus = z.object({
  status: z.enum(STATUS_VALIDOS, {
    errorMap: () => ({ message: 'Escolha um status válido para a tarefa.' }),
  }),
});

/* ATV-TAR-ORDEM-002/003: um único jeito de gravar posição, seja o
   gesto arrastar ou as setas de teclado — a posição-alvo (índice,
   0-based) entre as tarefas da mesma idéia. */
const mudancaDeOrdem = z.object({
  ordem: z
    .number({ required_error: 'Informe a nova posição da tarefa.' })
    .int('A posição deve ser um número inteiro.')
    .min(0, 'A posição não pode ser negativa.'),
});

const paramsAtividade = z.object({
  empresaId: z.string().uuid(),
  projetoId: z.string().uuid(),
  ideiaId: z.string().uuid(),
});
const paramsTarefa = paramsAtividade.extend({ tarefaId: z.string().uuid() });

/* Mesma função de auth das outras rotas — reproduzida, não
   importada, pelo mesmo motivo registrado em ideias.ts/projetos.ts. */
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

/* Mesma allowlist explícita de ideias.ts — ATV-TAR-CRIA-004 aponta
   para IDEIA-CRIA-PAPEL, os mesmos três papéis. */
function podeEscrever(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro' || papel === 'especialista';
}

type IdeiaAtiva = {
  id: string;
  titulo: string;
  descricao: string;
};

type Contexto =
  | { ok: false; code: number; corpo: unknown }
  | {
      ok: true;
      usuarioId: string;
      papel: string;
      empresaId: string;
      projetoId: string;
      ideia: IdeiaAtiva;
      /* Presente só quando a rota recebe id de tarefa. */
      tarefaId: string | null;
    };

/* A corrente inteira — empresa → projeto → idéia — e, quando
   pedido, o quarto elo (tarefa pertence à idéia). Tudo o que falha
   depois da autenticação devolve 404 com a mesma mensagem, mesmo
   raciocínio de IDEIA-ISO-004: não contar a quem está adivinhando
   ids se a coisa não existe ou só não é dele. */
async function abrirContexto(req: FastifyRequest, comTarefa: boolean): Promise<Contexto> {
  const naoEncontrado = { ok: false as const, code: 404, corpo: erro(null, 'Idéia não encontrada.') };

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

  const base = comTarefa ? paramsTarefa.safeParse(req.params) : paramsAtividade.safeParse(req.params);
  if (!base.success) return naoEncontrado;
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

  /* Elo 2 — o projeto existe, está ativo e é desta empresa. */
  const projeto = await db.projeto.findFirst({
    where: { id: projetoId, empresaId, arquivadoEm: null },
  });
  if (!projeto) return naoEncontrado;

  /* Elo 3 — a idéia existe, está ativa e é deste projeto. */
  const ideia = await db.ideia.findFirst({
    where: { id: ideiaId, projetoId, arquivadoEm: null },
    select: { id: true, titulo: true, descricao: true },
  });
  if (!ideia) return naoEncontrado;

  let tarefaId: string | null = null;
  if (comTarefa) {
    /* `base.data` já tem `tarefaId` porque veio de `paramsTarefa`. */
    tarefaId = (base.data as z.infer<typeof paramsTarefa>).tarefaId;
  }

  return { ok: true, usuarioId, papel: vinculo.papel, empresaId, projetoId, ideia, tarefaId };
}

/* Elo 4 — a tarefa pertence à idéia já validada. Recebe `ideiaId` do
   contexto, nunca do request diretamente. */
async function buscarTarefa(ideiaId: string, id: string) {
  return db.tarefa.findFirst({ where: { id, ideiaId } });
}

type LinhaTarefa = {
  id: string;
  titulo: string;
  descricao: string;
  status: StatusTarefa;
  tipo: TipoTarefa;
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
    tipo: t.tipo,
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

export async function rotasTarefas(app: FastifyInstance) {
  const PREFIXO = '/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas';

  /* ---------- Listar (encontra ou cria) — ATV-ACESSO-002/003 ----------
     Mesmo padrão de `acharOuCriarConversa` (ia.ts): a primeira leitura
     é quem cria, para não precisar de uma rota própria só para o
     primeiro acesso. Da segunda vez em diante só devolve o que já
     existe (ATV-ACESSO-003) — a tarefa-semente não se repete. */
  app.get(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    let tarefas = await db.tarefa.findMany({
      where: { ideiaId: ctx.ideia.id },
      orderBy: { ordem: 'asc' },
    });

    if (tarefas.length === 0) {
      /* ATV-ACESSO-002: a tarefa-semente copia título/descrição da
         idéia NO MOMENTO do acesso — cópia, não vínculo vivo
         (ATV-ACESSO-005). Dali em diante é uma tarefa comum. */
      const semente = await db.tarefa.create({
        data: {
          ideiaId: ctx.ideia.id,
          titulo: ctx.ideia.titulo,
          descricao: ctx.ideia.descricao,
          status: 'pendente',
          /* A tarefa-semente nasce como pesquisa: é o primeiro
             movimento de qualquer atividade — descobrir. Explícito
             aqui, e não herdado do default do banco, para a regra
             ficar legível no código que a aplica. */
          tipo: 'pesquisa',
          ordem: 0,
        },
      });
      tarefas = [semente];
    }

    return resposta.send({ tarefas: tarefas.map(tarefaParaResposta) });
  });

  /* ---------- Criar — ATV-TAR-CRIA-001 a 004 ---------- */
  app.post(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar tarefas.'));
    }

    const dados = conteudoTarefa.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    /* ATV-TAR-CRIA-002: sempre no fim — maior `ordem` existente + 1.
       Se a lista ainda não existe (ninguém chamou o GET ainda),
       começa em 0; na prática isso não deve acontecer, porque a
       tela sempre carrega a lista (e portanto cria a semente) antes
       de oferecer "Nova tarefa", mas o cálculo cobre o caso mesmo
       assim. */
    const ultima = await db.tarefa.findFirst({
      where: { ideiaId: ctx.ideia.id },
      orderBy: { ordem: 'desc' },
    });
    const novaOrdem = ultima ? ultima.ordem + 1 : 0;

    /* ATV-TAR-CRIA-003: nasce sempre pendente — `status` não vem do
       cliente, nem por engano. */
    const tarefa = await db.tarefa.create({
      data: {
        ideiaId: ctx.ideia.id,
        titulo: dados.data.titulo,
        descricao: dados.data.descricao,
        status: 'pendente',
        tipo: dados.data.tipo ?? 'pesquisa',
        ordem: novaOrdem,
      },
    });

    return resposta.code(201).send({ tarefa: tarefaParaResposta(tarefa) });
  });

  /* ---------- Reordenar — ATV-TAR-ORDEM-001 a 005 ----------
     `ordem` no corpo é a posição-alvo (índice, 0-based) entre as
     tarefas da mesma idéia — o mesmo número, venha o gesto de
     arrastar ou das setas (ATV-TAR-ORDEM-003). O servidor renumera
     a lista inteira numa transação, e só grava as linhas cuja
     posição de fato mudou. */
  app.patch(`${PREFIXO}/:tarefaId/ordem`, async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite reordenar tarefas.'));
    }

    const dados = mudancaDeOrdem.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    const existente = await buscarTarefa(ctx.ideia.id, ctx.tarefaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

    const todas = await db.tarefa.findMany({
      where: { ideiaId: ctx.ideia.id },
      orderBy: { ordem: 'asc' },
    });

    const semAMovida = todas.filter((t) => t.id !== existente.id);
    const alvo = Math.min(Math.max(dados.data.ordem, 0), semAMovida.length);
    semAMovida.splice(alvo, 0, existente);

    /* ATV-TAR-ORDEM-005: soltar na mesma posição não é alteração.
       Aqui isso aparece como "nenhuma linha muda de `ordem`" — e
       nesse caso não escrevemos nada, para não bater `atualizado_em`
       à toa num gesto que não mudou nada. */
    const mudancas = semAMovida
      .map((t, i) => ({ id: t.id, ordemNova: i, ordemAtual: t.ordem }))
      .filter((m) => m.ordemNova !== m.ordemAtual);

    if (mudancas.length > 0) {
      await db.$transaction(
        mudancas.map((m) => db.tarefa.update({ where: { id: m.id }, data: { ordem: m.ordemNova } })),
      );
    }

    const atualizadas = await db.tarefa.findMany({
      where: { ideiaId: ctx.ideia.id },
      orderBy: { ordem: 'asc' },
    });

    return resposta.send({ tarefas: atualizadas.map(tarefaParaResposta) });
  });

  /* ---------- Concluir / reabrir — ATV-TAR-CONCLUIR-001/002 ---------- */
  app.patch(`${PREFIXO}/:tarefaId/status`, async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite concluir tarefas.'));
    }

    const dados = mudancaDeStatus.safeParse(req.body);
    if (!dados.success) {
      return resposta.code(400).send(erro('status', 'Escolha um status válido para a tarefa.'));
    }

    const existente = await buscarTarefa(ctx.ideia.id, ctx.tarefaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

    /* Soltar no mesmo estado não é alteração — mesmo raciocínio de
       IDEIA-MOV-003. */
    if (existente.status === dados.data.status) {
      return resposta.send({ tarefa: tarefaParaResposta(existente) });
    }

    /* ATV-TAR-CONCLUIR-001: só `status` muda. Nenhuma outra tarefa é
       tocada, a idéia não é movida — isso continua sendo
       exclusividade do botão "Concluir atividade" (ATV-TAR-CONCLUIR-004,
       IDEIA-MOV-014). */
    const tarefa = await db.tarefa.update({
      where: { id: existente.id },
      data: { status: dados.data.status },
    });

    return resposta.send({ tarefa: tarefaParaResposta(tarefa) });
  });

  /* ---------- Editar — ATV-TAR-EDITA ----------
     Vai além do que atividade-lista.md §5 deixou decidido (P9: editar
     tarefa segue "em aberto"). O que NÃO estava em aberto é a tela
     mentir: o protótipo escrevia o texto novo no card, dizia "Tarefa
     editada com sucesso" e não gravava nada — a edição sumia na
     primeira navegação. Entre não gravar e afirmar que gravou, gravar
     é a única saída honesta.

     Mesmos limites de campo da criação (`conteudoTarefa`) e mesmos
     papéis de escrita (ATV-TAR-CRIA-004).

     `tipo` fica de fora mesmo vindo no corpo, e `status`/`ordem`
     também: editar texto nunca move, conclui nem troca o espaço de
     trabalho do card — mesmo raciocínio do PUT de `ideias.ts`. Trocar
     `tipo` aqui mudaria para que tela o "Acessar tarefa" leva
     (BOARD-ACESSO-002) e deixaria o quadro já criado órfão; se um dia
     isso for pedido, é rota própria, como `ordem` e `status` são. */
  app.put(`${PREFIXO}/:tarefaId`, async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite editar tarefas.'));
    }

    const existente = await buscarTarefa(ctx.ideia.id, ctx.tarefaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

    const dados = conteudoTarefa.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    const tarefa = await db.tarefa.update({
      where: { id: existente.id },
      data: { titulo: dados.data.titulo, descricao: dados.data.descricao },
    });

    return resposta.send({ tarefa: tarefaParaResposta(tarefa) });
  });

  /* ---------- Excluir — ATV-TAR-EXCLUI-001 a 003 ----------
     Apaga a linha de verdade — não é arquivamento como em idéias
     (`ideias.ts`, `IDEIA-EXCL-001`). `Tarefa` não tem `arquivado_em`
     de propósito: a lista de tarefas de uma atividade é um espaço
     de trabalho descartável, não um registro que precise ficar
     recuperável (decisão A22). */
  app.delete(`${PREFIXO}/:tarefaId`, async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite excluir tarefas.'));
    }

    const existente = await buscarTarefa(ctx.ideia.id, ctx.tarefaId!);
    /* Já excluída cai aqui e devolve 404, não 200 — um segundo DELETE
       significa que a tela está operando sobre um estado que já não
       existe (mesmo raciocínio de IDEIA-EXCL-002/ideias-exclusao.md §2). */
    if (!existente) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));

    /* ATV-ACESSO-004: mesmo a tarefa-semente pode ser excluída, sem
       tratamento especial — se a lista ficar vazia, o próximo GET
       (ATV-ACESSO-002/003) cria uma semente nova a partir da idéia. */
    await db.tarefa.delete({ where: { id: existente.id } });

    return resposta.code(200).send({ ok: true });
  });
}
