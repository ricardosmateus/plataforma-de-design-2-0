/* ============================================================
   Rotas de idéias
   ============================================================
   Regras: Regras_de_negocio/modulos/ideias/ideias-quadro.md
           Regras_de_negocio/modulos/ideias/ideias-movimentacao.md
           Regras_de_negocio/modulos/ideias/ideias-criacao.md
           Regras_de_negocio/modulos/ideias/ideias-exclusao.md

   Cinco endpoints, todos aninhados em
   /empresas/:empresaId/projetos/:projetoId.

   A diferença em relação a `projetos.ts` é o elo a mais na corrente.
   Lá bastava confirmar o vínculo com a empresa; aqui é preciso
   confirmar vínculo com a empresa E que o projeto pertence a ela E
   que a idéia pertence ao projeto (IDEIA-ISO-003/004).

   Por isso a corrente NÃO é repetida rota a rota como em
   `projetos.ts`: ela vive em `abrirContexto()`, e toda rota começa
   chamando essa função. Com três elos e cinco rotas seriam quinze
   verificações copiadas à mão — e bastaria uma cópia incompleta,
   numa rota adicionada meses depois, para abrir um vazamento entre
   empresas. Uma porta só é justamente o que IDEIA-ISO-004 pede.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';
import { encontrarDuplicata } from '../ideias/duplicidade.js';
import { planejarTransicao } from '../ideias/transicao.js';
import { conferirNovaOrdem, posicaoNoTopo, ORDEM_MAX } from '../ideias/ordem.js';
import { CATEGORIAS } from '../ia/taxonomia-vocabulario.js';
import {
  classificarIdeiaEmSegundoPlano,
  limparTaxonomia,
} from '../ia/taxonomia.js';
import { segmentarIdeiaEmSegundoPlano } from '../ia/recortes.js';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { iaConfigurada } from '../ia/provedor.js';
import { montarMensagem, interpretarIdeias, pedirIdeias, MAX_TOKENS_GERACAO, SISTEMA, ORIENTACAO_MAX } from '../ia/gerar-ideias.js';
import { nomeDoTipo } from '../projetos/catalogo.js';
import { registrar } from '../creditos/registro.js';
import { tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* Limites de IDEIA-CRIA-001, validados aqui e não só pelo maxlength
   do campo (IDEIA-CRIA-005). `.trim()` antes do `.min(1)` é o que
   recusa título feito só de espaços (IDEIA-CRIA-006). */
const conteudo = z.object({
  titulo: z
    .string({ required_error: 'Informe o título da idéia.' })
    .trim()
    .min(1, 'Informe o título da idéia.')
    .max(260, 'O título deve ter no máximo 260 caracteres.'),
  descricao: z
    .string({ required_error: 'Informe a descrição da idéia.' })
    .trim()
    .min(1, 'Informe a descrição da idéia.')
    .max(280, 'A descrição deve ter no máximo 280 caracteres.'),
  /* Opcional, e 0 é valor legítimo — "sem prioridade definida"
     (IDEIA-CRIA-002). Não confundir com "prioridade mínima". */
  importancia: z
    .number()
    .int('A importância deve ser um número inteiro.')
    .min(0, 'A importância vai de 0 a 5.')
    .max(5, 'A importância vai de 0 a 5.')
    .optional()
    .default(0),
  /* IDEIA-DUPL-003: quando o alerta de duplicidade já apareceu para
     a pessoa e ela escolheu "Manter a criação"/"Manter a edição", o
     reenvio vem com esta flag em `true` — é o único jeito de pular a
     checagem. Ausente ou `false`, a checagem sempre roda. */
  ignorar_duplicata: z.boolean().optional().default(false),
});

/* A correção manual passa pela MESMA porta que a IA: o vocabulário
   é fechado para as duas. Deixar a pessoa digitar categoria livre
   reabriria pela interface exatamente o problema que o vocabulário
   fechado existe para evitar — "Concorrentes", "Concorrência" e
   "Análise de concorrentes" como três pastas. */
const taxonomiaManualBody = z.object({
  assunto: z
    .string({ required_error: 'Escolha a pasta.' })
    .refine((v) => CATEGORIAS.includes(v), 'Essa pasta não existe na taxonomia.'),
  tags: z
    .array(z.string())
    .max(3, 'No máximo três tags.')
    .optional()
    .default([])
    .refine((ts) => ts.every((t) => CATEGORIAS.includes(t)), 'Há tag fora da taxonomia.'),
});

const STATUS_VALIDOS = ['ideias', 'andamento', 'finalizado'] as const;
type StatusIdeia = (typeof STATUS_VALIDOS)[number];

const mudancaDeStatus = z.object({
  status: z.enum(STATUS_VALIDOS, {
    errorMap: () => ({ message: 'Escolha uma coluna válida do quadro.' }),
  }),
});

/* IDEIA-GERAR-011: o corpo do "gerar" é opcional inteiro — quem não
   escreveu orientação manda `{}` (ou nada), e a geração sai como
   sempre saiu. */
const corpoGerar = z.object({
  orientacao: z
    .string()
    .max(ORIENTACAO_MAX, `A orientação deve ter no máximo ${ORIENTACAO_MAX} caracteres.`)
    .optional()
    .nullable(),
});

/* IDEIA-ORDEM-003: a coluna inteira, na ordem nova. */
const novaOrdem = z.object({
  status: z.enum(STATUS_VALIDOS, {
    errorMap: () => ({ message: 'Escolha uma coluna válida do quadro.' }),
  }),
  ids: z.array(z.string().uuid()).min(1).max(ORDEM_MAX),
});

const paramsQuadro = z.object({
  empresaId: z.string().uuid(),
  projetoId: z.string().uuid(),
});
const paramsIdeia = paramsQuadro.extend({ id: z.string().uuid() });

/* Mesma função de auth das outras rotas — reproduzida, não
   importada, pelo mesmo motivo registrado em projetos.ts. */
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

/* ------------------------------------------------------------
   Papéis — allowlist explícita, nunca negação.
   ------------------------------------------------------------
   Hoje os três papéis existentes podem escrever, então
   `podeEscrever` parece sempre verdadeira. Ela existe assim mesmo,
   listando os papéis um a um, para que um papel NOVO (um "leitor",
   por exemplo) nasça sem permissão em vez de herdá-la por descuido.
   Escrever `papel !== 'leitor'` faria o contrário: todo papel futuro
   entraria escrevendo até alguém lembrar de proibir.
   ------------------------------------------------------------ */
function podeEscrever(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro' || papel === 'especialista';
}

/* IDEIA-EXCL-002: o especialista não exclui, nem o que ele criou. */
function podeExcluir(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro';
}

type Contexto =
  | { ok: false; code: number; corpo: unknown }
  | {
      ok: true;
      usuarioId: string;
      papel: string;
      empresaId: string;
      projetoId: string;
      /* Presente só quando a rota recebe id de idéia. Vem daqui, já
         validado como uuid, para que nenhuma rota precise reler
         `req.params` por fora da checagem. */
      ideiaId: string | null;
    };

/* ------------------------------------------------------------
   A corrente inteira — IDEIA-ISO-003/004.
   ------------------------------------------------------------
   Percorre, nesta ordem: sessão viva → conta não suspensa →
   parâmetros bem formados → vínculo ativo com a empresa → projeto
   ativo pertencente a essa empresa.

   Tudo o que falha depois da autenticação devolve 404 com a mesma
   mensagem. É deliberado: distinguir "empresa não existe" de
   "existe mas não é sua" contaria a quem está tentando adivinhar
   ids exatamente o que ele quer saber.

   O elo da idéia em si não entra aqui porque três das cinco rotas
   não recebem id de idéia. Ele é checado por `buscarIdeia()`, logo
   abaixo, que recebe o contexto já validado.
   ------------------------------------------------------------ */
async function abrirContexto(req: FastifyRequest, comIdeia: boolean): Promise<Contexto> {
  const naoEncontrado = { ok: false as const, code: 404, corpo: erro(null, 'Projeto não encontrado.') };

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

  /* Dois parses em vez de um ternário: o ternário produziria uma
     união de tipos, e ler `.id` dela devolve `unknown`. Assim cada
     ramo mantém o tipo certo sem `as` nenhum. */
  const base = paramsQuadro.safeParse(req.params);
  if (!base.success) return naoEncontrado;

  let ideiaId: string | null = null;
  if (comIdeia) {
    const comId = paramsIdeia.safeParse(req.params);
    if (!comId.success) return naoEncontrado;
    ideiaId = comId.data.id;
  }

  const { empresaId, projetoId } = base.data;

  /* Elo 1 — vínculo ativo com a empresa. Mesmos três filtros das
     outras rotas: vínculo revogado, contrato vencido, empresa
     arquivada. */
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

  /* Elo 2 — o projeto existe, está ativo e é DESTA empresa.
     O `empresaId` no where é o ponto todo: sem ele, um id de projeto
     de outra empresa passaria, e o vínculo verificado acima estaria
     autorizando acesso a um projeto que nada tem a ver com ele. */
  const projeto = await db.projeto.findFirst({
    where: { id: projetoId, empresaId, arquivadoEm: null },
  });
  if (!projeto) return naoEncontrado;

  return { ok: true, usuarioId, papel: vinculo.papel, empresaId, projetoId, ideiaId };
}

/* Elo 3 — a idéia pertence ao projeto já validado (IDEIA-ISO-003c).
   Recebe `projetoId` do contexto, nunca do request diretamente. */
async function buscarIdeia(projetoId: string, id: string) {
  return db.ideia.findFirst({ where: { id, projetoId, arquivadoEm: null } });
}

/* IDEIA-DUPL-001/002: compara com toda idéia ATIVA do projeto — as
   três colunas, nunca arquivada (ideias-criacao.md §1.4). `ignorarId`
   só é usado na edição, para a idéia não "bater" com ela mesma. */
async function buscarPossivelDuplicata(
  projetoId: string,
  conteudo: { titulo: string; descricao: string },
  ignorarId?: string | null,
) {
  const ativas = await db.ideia.findMany({ where: { projetoId, arquivadoEm: null } });
  const achada = encontrarDuplicata(conteudo, ativas, ignorarId);
  /* `encontrarDuplicata` só enxerga id/título/descrição/status — o
     necessário para comparar. A resposta pro cliente, porém, precisa
     do registro inteiro (importância, datas), então volta a `ativas`
     para buscar a linha completa pelo id encontrado. */
  return achada ? (ativas.find((i: LinhaIdeia) => i.id === achada.id) ?? null) : null;
}

type LinhaIdeia = {
  id: string;
  titulo: string;
  descricao: string;
  importancia: number;
  status: StatusIdeia;
  /* Opcionais porque `encontrarDuplicata` monta objetos parciais —
     a taxonomia não participa da comparação de duplicidade. */
  assunto?: string | null;
  tags?: string[];
  taxonomiaManual?: boolean;
  /* Opcional pelo mesmo motivo da taxonomia: `encontrarDuplicata`
     monta objetos parciais. Linha do banco sempre traz. */
  posicao?: number;
  criadoEm: Date;
  atualizadoEm: Date;
};

function ideiaParaResposta(i: LinhaIdeia) {
  return {
    id: i.id,
    titulo: i.titulo,
    descricao: i.descricao,
    importancia: i.importancia,
    status: i.status,
    /* Só existem em idéia finalizada; fora disso vêm null/[] pela
       limpeza da transição. O cliente pode confiar nisso. */
    assunto: i.assunto ?? null,
    tags: i.tags ?? [],
    taxonomia_manual: i.taxonomiaManual ?? false,
    /* IDEIA-ORDEM-001: a tela ordena por isto (e por criado_em no
       empate), então precisa receber. */
    posicao: i.posicao ?? 0,
    criado_em: i.criadoEm.toISOString(),
    atualizado_em: i.atualizadoEm.toISOString(),
  };
}

function primeiroErro(falha: z.ZodError): Erro {
  const problema = falha.issues[0];
  const campo = problema?.path?.[0];
  return erro(typeof campo === 'string' ? campo : null, problema?.message ?? 'Dados inválidos.');
}

export async function rotasIdeias(app: FastifyInstance) {
  /* ---------- Quadro — IDEIA-QUADRO-001 a 008 ---------- */
  app.get('/empresas/:empresaId/projetos/:projetoId/ideias', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IDEIA-ORDEM-001: a ordem da coluna é a posição; no empate (as
       etapas geradas numa mesma transação), a mais nova primeiro. */
    const ideias = await db.ideia.findMany({
      where: { projetoId: ctx.projetoId, arquivadoEm: null },
      orderBy: [{ posicao: 'asc' }, { criadoEm: 'desc' }],
    });

    /* `papel` vai uma vez na raiz, não repetido em cada idéia: é o
       mesmo valor para todas, e repetir seria peso à toa em cada
       card (ideias-quadro.md §2). */
    return resposta.send({ ideias: ideias.map(ideiaParaResposta), papel: ctx.papel });
  });

  /* ---------- Criar — IDEIA-CRIA-001 a 010 ---------- */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar idéias.'));
    }

    const dados = conteudo.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    /* IDEIA-DUPL-001/003: acha uma idéia ativa parecida e a pessoa
       ainda não confirmou que quer mesmo assim? Devolve QUAL idéia é
       essa, e não cria nada — a criação de verdade só acontece se
       vier `ignorar_duplicata` no reenvio, ou se não houver parecida
       nenhuma. Resposta de sucesso (não erro): não é uma falha, é uma
       decisão pendente, mesmo raciocínio de `acao_proposta` em
       ia/contexto.ts. */
    if (!dados.data.ignorar_duplicata) {
      const duplicata = await buscarPossivelDuplicata(ctx.projetoId, dados.data);
      if (duplicata) {
        return resposta.send({ possivel_duplicata: ideiaParaResposta(duplicata) });
      }
    }

    /* IDEIA-CRIA-003: toda idéia nasce em "Minhas idéias". O status
       não vem do cliente na criação — nem por engano, nem de
       propósito. Para mudar de coluna existe o PATCH. */
    const ideia = await db.ideia.create({
      data: {
        projetoId: ctx.projetoId,
        titulo: dados.data.titulo,
        descricao: dados.data.descricao,
        importancia: dados.data.importancia,
        status: 'ideias',
        criadoPor: ctx.usuarioId,
      },
    });

    return resposta.code(201).send({ ideia: ideiaParaResposta(ideia) });
  });

  /* ---------- Gerar com ajuda da IA — IDEIA-GERAR-001 a 010 ----------
     Skill: Skills/senior-product-designer.skill

     Um clique, e o quadro ganha as etapas do trabalho do projeto. A
     ordem das garantias é a de sempre: corrente e papel antes de
     tudo, reserva antes de chamar, custo registrado antes de decidir,
     cobrança só do que foi entregue. */
  app.post('/empresas/:empresaId/projetos/:projetoId/ideias/gerar', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IDEIA-GERAR-002: gerar é criar idéias — mesma régua de quem cria
       à mão (IDEIA-CRIA-004), recusada de novo aqui (IDEIA-CRIA-010). */
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite criar idéias.'));
    }

    /* Sem provedor, a recusa sai ANTES de qualquer reserva, com o
       mesmo texto do assistente — não é erro de quem clicou. */
    if (!iaConfigurada()) {
      return resposta.code(503).send(erro(null, 'O assistente de IA ainda não está configurado neste ambiente.'));
    }

    /* Validado antes da reserva: texto longo demais é erro de quem
       pediu, não pode custar nada. */
    const corpo = corpoGerar.safeParse(req.body ?? {});
    if (!corpo.success) {
      return resposta
        .code(400)
        .send(erro('orientacao', corpo.error.issues[0]?.message ?? 'Orientação inválida.'));
    }

    const projeto = await db.projeto.findFirst({
      where: { id: ctx.projetoId, empresaId: ctx.empresaId },
      select: { nome: true, tipo: true, empresa: { select: { nome: true, descricao: true } } },
    });
    if (!projeto) return resposta.code(404).send(erro(null, 'Projeto não encontrado.'));

    /* Todas as ativas: as mais recentes vão ao modelo (para ele saber
       onde o projeto está); TODAS entram na checagem de duplicidade. */
    const ativas = await db.ideia.findMany({
      where: { projetoId: ctx.projetoId, arquivadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    /* IDEIA-GERAR-001: o NOME escolhido na modal ("Identidade Visual")
       define o trabalho. Sem ele, o rótulo do tipo — como no resto da
       plataforma (PROJ-CRIA-002). */
    const mensagem = montarMensagem({
      empresaNome: projeto.empresa.nome,
      empresaDescricao: projeto.empresa.descricao ?? null,
      projetoNome: projeto.nome ?? nomeDoTipo(projeto.tipo),
      existentes: ativas.map((i: LinhaIdeia) => ({ titulo: i.titulo, status: i.status })),
      orientacao: corpo.data.orientacao ?? null,
    });

    /* ---- Reserva ANTES de chamar (IA-CUSTO-002) ---- */
    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;
    if (env.CREDITOS_COBRAR === 'sim') {
      const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, SISTEMA + '\n' + mensagem, MAX_TOKENS_GERACAO);
      if (tetoUsd === null) {
        return resposta.code(503).send(erro(null, 'O assistente está indisponível no momento. Tente mais tarde.'));
      }
      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;
      try {
        await reservar(ctx.usuarioId, tetoTotalMicros, operacaoId, 'assistente');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          return resposta
            .code(402)
            .send(erro(null, 'Saldo insuficiente para gerar idéias. Adicione créditos para continuar.'));
        }
        throw e;
      }
    }

    const r = await pedirIdeias(mensagem);
    const geradas = r.ok ? interpretarIdeias(r.bruto) : [];

    /* IDEIA-GERAR-005: comparadas com TODAS as ativas do projeto e com
       as que já passaram nesta mesma resposta. Parecida não é gravada
       — e é contada, para a tela dizer quantas ficaram de fora em vez
       de sumir com elas em silêncio. */
    const comparaveis = ativas.map((i: LinhaIdeia) => ({
      id: i.id, titulo: i.titulo, descricao: i.descricao, status: i.status,
    }));
    const aceitas: typeof geradas = [];
    let parecidas = 0;
    for (const g of geradas) {
      if (encontrarDuplicata(g, comparaveis)) { parecidas++; continue; }
      aceitas.push(g);
      comparaveis.push({ id: 'nova-' + aceitas.length, titulo: g.titulo, descricao: g.descricao, status: 'ideias' });
    }

    /* Custo registrado antes de decidir (a chamada já foi paga). Só é
       `entregue` o que virou ao menos uma idéia no quadro. */
    const entregue = aceitas.length > 0;
    if (r.uso && r.modelo) {
      registrar({
        usuarioId: ctx.usuarioId,
        empresaId: ctx.empresaId,
        projetoId: ctx.projetoId,
        tipo: 'assistente',
        resultado: entregue ? 'entregue' : 'descartado',
        modelo: r.modelo,
        uso: r.uso,
        requisicaoId: r.requisicaoId,
        operacaoId,
      });
    }

    /* ---- Acerta a reserva pelo custo verdadeiro (IA-CUSTO-003) ---- */
    if (tetoTotalMicros > 0) {
      await liberar(ctx.usuarioId, tetoTotalMicros, operacaoId, 'assistente');
      if (entregue && r.uso && r.modelo) {
        const usdReal = custoUsdMicros(r.modelo, r.uso);
        if (usdReal !== null) {
          const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
          const totalReal = comissaoSobre(usdParaMicrosBrl(usdReal, cotacao)).totalMicros;
          if (totalReal > 0) await consumir(ctx.usuarioId, totalReal, operacaoId, 'assistente');
        }
      }
    }

    if (!entregue) {
      /* Nada gravado, nada cobrado. As duas mensagens pedem ações
         diferentes: tentar de novo ou desistir de gerar o que já está lá. */
      if (geradas.length > 0) {
        return resposta.code(200).send({ ideias: [], parecidas });
      }
      const mensagemFalha = !r.ok && r.motivo === 'rede'
        ? 'Não foi possível falar com o provedor de IA. Tente de novo.'
        : 'Não foi possível gerar idéias agora. Tente de novo em instantes.';
      return resposta.code(503).send(erro(null, mensagemFalha));
    }

    /* IDEIA-GERAR-006: a primeira etapa precisa aparecer no topo da
       ordenação padrão ("Mais recente"). Cada idéia nasce 1 ms mais
       velha que a anterior, na mesma transação — a ordem de execução
       é a ordem do quadro, sem número colado no título. */
    const agora = Date.now();
    const criadas = await db.$transaction(
      aceitas.map((g, i) =>
        db.ideia.create({
          data: {
            projetoId: ctx.projetoId,
            titulo: g.titulo,
            descricao: g.descricao,
            /* IDEIA-GERAR-007: sem nota. IDEIA-CRIA-002 — zero é "ainda
               não pensei nisso", e quem pensa é a pessoa. */
            importancia: 0,
            status: 'ideias',
            criadoPor: ctx.usuarioId,
            criadoEm: new Date(agora - i),
          },
        }),
      ),
    );

    return resposta.code(201).send({ ideias: criadas.map(ideiaParaResposta), parecidas });
  });

  /* ---------- Editar — IDEIA-CRIA-001/004 ---------- */
  app.put('/empresas/:empresaId/projetos/:projetoId/ideias/:id', async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite editar idéias.'));
    }

    const dados = conteudo.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    const existente = await buscarIdeia(ctx.projetoId, ctx.ideiaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    /* IDEIA-DUPL-001/003/007: mesma checagem da criação, agora
       ignorando a própria idéia sendo editada — senão ela bateria
       com o próprio registro original toda vez. */
    if (!dados.data.ignorar_duplicata) {
      const duplicata = await buscarPossivelDuplicata(ctx.projetoId, dados.data, existente.id);
      if (duplicata) {
        return resposta.send({ possivel_duplicata: ideiaParaResposta(duplicata) });
      }
    }

    /* Sem `status` no data: editar texto nunca move o card
       (ideias-criacao.md §2). Mover tem rota própria. */
    const ideia = await db.ideia.update({
      where: { id: existente.id },
      data: {
        titulo: dados.data.titulo,
        descricao: dados.data.descricao,
        importancia: dados.data.importancia,
      },
    });

    /* A classificação foi feita a partir do texto. Se o texto mudou
       e a idéia está finalizada, o assunto guardado descreve algo
       que não existe mais — e é a falha mais silenciosa deste
       módulo: a pasta continua lá, plausível, apontando para o
       conteúdo errado. Reescrever a importância não muda nada disso,
       por isso ela fica de fora da comparação. */
    const textoMudou =
      existente.titulo !== dados.data.titulo || existente.descricao !== dados.data.descricao;

    if (ideia.status === 'finalizado' && textoMudou) {
      void classificarIdeiaEmSegundoPlano(ideia.id).catch(() => {});
    }

    return resposta.send({ ideia: ideiaParaResposta(ideia) });
  });

  /* ---------- Mover de coluna — IDEIA-MOV-001 a 004 ---------- */
  /* ---------- Reorganizar dentro da coluna — IDEIA-ORDEM-001 a 008 ----------
     O corpo é a coluna INTEIRA na ordem nova. O servidor confere que
     ela é exatamente a coluna que existe agora (IDEIA-ORDEM-004) e
     grava 0..n-1. Só a posição muda: status, conteúdo e taxonomia
     ficam como estão, e nada é reclassificado. */
  app.put('/empresas/:empresaId/projetos/:projetoId/ideias/ordem', async (req, resposta) => {
    const ctx = await abrirContexto(req, false);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IDEIA-ORDEM-002: quem move entre colunas, reorganiza
       (IDEIA-MOV-004). */
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite reorganizar idéias.'));
    }

    const dados = novaOrdem.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    const atuais = await db.ideia.findMany({
      where: { projetoId: ctx.projetoId, status: dados.data.status, arquivadoEm: null },
      select: { id: true },
    });
    const conferencia = conferirNovaOrdem(
      atuais.map((i: { id: string }) => i.id),
      dados.data.ids,
    );
    if (!conferencia.ok) {
      if (conferencia.motivo === 'repetida') {
        return resposta.code(400).send(erro('ids', 'A mesma idéia apareceu duas vezes na ordem.'));
      }
      /* IDEIA-ORDEM-004: a coluna mudou desde que a tela carregou. */
      return resposta.code(409).send({
        ...erro(null, 'O quadro mudou enquanto você reorganizava. Atualizamos para você ver a ordem atual.'),
        codigo: 'ordem_desatualizada',
      });
    }

    await db.$transaction(
      dados.data.ids.map((id, indice) =>
        db.ideia.update({ where: { id }, data: { posicao: indice } }),
      ),
    );

    return resposta.send({ status: dados.data.status, ids: dados.data.ids });
  });

  app.patch('/empresas/:empresaId/projetos/:projetoId/ideias/:id/status', async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* IDEIA-MOV-004: quem escreve, move — inclusive o especialista.
       Mover é organizar, não destruir. */
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite mover idéias.'));
    }

    const dados = mudancaDeStatus.safeParse(req.body);
    if (!dados.success) {
      return resposta.code(400).send(erro('status', 'Escolha uma coluna válida do quadro.'));
    }

    const existente = await buscarIdeia(ctx.projetoId, ctx.ideiaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    /* IDEIA-MOV-003: soltar na coluna onde já está não é alteração.
       Devolve 200 sem escrever, para não mexer no `atualizado_em`
       por um gesto que não mudou nada.

       Com uma exceção: pedir "finalizado" a uma idéia JÁ finalizada.
       O quadro de idéias nunca manda isso — a tela corta o no-op antes
       de chamar (visao_do_projeto.html, mesma IDEIA-MOV-003). Quem
       manda é "Concluir atividade": a tela de atividade não conhece o
       status da idéia e oferece o botão sempre.

       Quem clica ali acabou de escrever no quadro e está dizendo que
       o conteúdo está pronto. Devolver 200 mudo fazia a tela anunciar
       "atividade concluída" enquanto o registro recém-criado continuava
       fora de "Sobre a empresa", sem gesto nenhum que o alcançasse —
       falso sucesso, que é pior que um erro: não dá o que corrigir.

       Só a segmentação roda. O que mudou foi o conteúdo do quadro, e
       assunto/tags saem do título e da descrição, que continuam os
       mesmos — reclassificar seria pagar pela resposta que já está
       gravada. A exceção é a idéia finalizada sem pasta: sem assunto a
       segmentação sai cedo por não ter onde encaixar os trechos, então
       ali quem destrava é a classificação, que encadeia a segmentação
       ao terminar (taxonomia.ts). */
    if (existente.status === dados.data.status) {
      if (dados.data.status === 'finalizado') {
        if (existente.assunto) {
          void segmentarIdeiaEmSegundoPlano(existente.id).catch(() => {});
        } else {
          void classificarIdeiaEmSegundoPlano(existente.id).catch(() => {});
        }
      }
      return resposta.send({ ideia: ideiaParaResposta(existente) });
    }

    const novoStatus = dados.data.status;

    /* A regra mora em `planejarTransicao`, não aqui: assim ela é
       testável sem banco. Esta rota decide como escrever, não o
       que a transição significa. */
    const plano = planejarTransicao(existente.status, novoStatus);

    /* IDEIA-ORDEM-006: quem chega numa coluna entra no topo dela, o
       mesmo lugar de uma idéia nova. Sem isto o card cairia onde a
       posição antiga dele calhasse na coluna nova — um lugar que não
       significa nada para quem arrastou. */
    const topo = await db.ideia.aggregate({
      where: { projetoId: ctx.projetoId, status: novoStatus, arquivadoEm: null },
      _min: { posicao: true },
    });
    const posicao = posicaoNoTopo(topo._min.posicao === null ? [] : [topo._min.posicao]);

    /* IDEIA-MOV-002: só o status muda. Título, descrição,
       importância e data de criação ficam como estão.

       A exceção é a taxonomia (Skill categorizacao-taxonomia): ela
       não é conteúdo que a pessoa escreveu, é consequência do
       status. Sair de "finalizado" apaga assunto e tags NA MESMA
       escrita que muda a coluna — não depois, não em outro pedido.
       É isso que garante que a página "Sobre a empresa" nunca
       mostre conhecimento que já saiu do finalizado. */
    /* Os recortes por tema saem junto, e dentro da MESMA transação:
       eles são o texto da idéia exposto nas páginas de tema da
       empresa. Apagá-los "logo depois" abriria uma janela em que
       /empresas/:id/temas/Concorrentes ainda serviria o parágrafo de
       uma idéia que já saiu de finalizado — a regra crítica desta
       rota, valendo para a projeção mais visível que ela tem. */
    const [ideia] = await db.$transaction([
      db.ideia.update({
        where: { id: existente.id },
        data: plano.limpar
          ? { status: novoStatus, posicao, ...limparTaxonomia() }
          : { status: novoStatus, posicao },
      }),
      ...(plano.limpar
        ? [db.recorteTaxonomia.deleteMany({ where: { ideiaId: existente.id } })]
        : []),
    ]);

    /* Entrar em "finalizado" dispara a classificação, mas a resposta
       não espera por ela: mover um card é gesto de interface, e a
       chamada ao modelo leva segundos e pode falhar. O `catch` vazio
       é intencional — a própria função já registra o que deu errado,
       e uma promessa rejeitada solta aqui derrubaria o processo. */
    if (plano.classificar) {
      void classificarIdeiaEmSegundoPlano(ideia.id).catch(() => {});
    }

    return resposta.send({ ideia: ideiaParaResposta(ideia) });
  });

  /* ---------- Corrigir a pasta à mão ----------
     O planejamento diz "a taxonomia que a IA propõe e o usuário
     confirma". Até aqui só existia a proposta: uma pasta errada só
     saía tirando a idéia de "finalizado" e devolvendo — o que apaga
     tudo e reclassifica no escuro, na esperança de sair diferente.

     Esta rota é a confirmação. E ela marca `taxonomiaManual`, sem o
     que a correção duraria até a próxima edição do texto. */
  app.patch('/empresas/:empresaId/projetos/:projetoId/ideias/:id/taxonomia', async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* Mesmo critério de mover um card: corrigir a pasta é organizar,
       não destruir. */
    if (!podeEscrever(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Seu papel não permite classificar idéias.'));
    }

    const dados = taxonomiaManualBody.safeParse(req.body);
    if (!dados.success) return resposta.code(400).send(primeiroErro(dados.error));

    const existente = await buscarIdeia(ctx.projetoId, ctx.ideiaId!);
    if (!existente) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    /* A taxonomia é consequência do status. Aceitar assunto numa
       idéia que não está finalizada criaria pela porta dos fundos o
       estado que a regra crítica existe para impedir. */
    if (existente.status !== 'finalizado') {
      return resposta
        .code(409)
        .send(erro(null, 'Só idéias finalizadas têm pasta.'));
    }

    const tags = dados.data.tags.filter((t) => t !== dados.data.assunto);

    const ideia = await db.ideia.update({
      where: { id: existente.id },
      data: { assunto: dados.data.assunto, tags, taxonomiaManual: true },
    });

    /* A pessoa mudou os temas da idéia; os recortes ainda apontam
       para os antigos. Refazê-los é o que impede a correção de valer
       só pela metade — pasta certa no mapa, texto no tema errado.

       Em segundo plano, como a classificação: quem corrigiu a pasta
       está olhando para um <select>, não pode esperar o modelo. */
    void segmentarIdeiaEmSegundoPlano(ideia.id).catch(() => {});

    return resposta.send({ ideia: ideiaParaResposta(ideia) });
  });

  /* ---------- Excluir — IDEIA-EXCL-001 a 004 ---------- */
  app.delete('/empresas/:empresaId/projetos/:projetoId/ideias/:id', async (req, resposta) => {
    const ctx = await abrirContexto(req, true);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    /* Corrente primeiro (404 para quem não tinha o direito de saber
       que isso existe), papel depois (403 só para quem já sabia) —
       mesma ordem de EMP-EXCL e PROJ-EXCL. */
    if (!podeExcluir(ctx.papel)) {
      return resposta.code(403).send(erro(null, 'Só proprietário ou membro podem excluir idéias.'));
    }

    const existente = await buscarIdeia(ctx.projetoId, ctx.ideiaId!);
    /* Já arquivada cai aqui e devolve 404, não 200: um segundo
       DELETE significa que a tela está operando sobre um estado que
       já não existe, e recarregar é a resposta certa
       (ideias-exclusao.md §2). */
    if (!existente) return resposta.code(404).send(erro(null, 'Idéia não encontrada.'));

    /* Arquivar, não apagar — IDEIA-EXCL-001, mesmo mecanismo de E1. */
    await db.ideia.update({
      where: { id: existente.id },
      data: { arquivadoEm: new Date() },
    });

    return resposta.code(200).send({ ok: true });
  });
}
