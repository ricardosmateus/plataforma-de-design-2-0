/* ============================================================
   Rotas de projetos
   ============================================================
   Regras: Regras_de_negocio/modulos/projetos/projetos-listagem.md
           Regras_de_negocio/modulos/projetos/projetos-criacao.md
           Regras_de_negocio/modulos/projetos/projetos-exclusao.md

   Quatro endpoints, todos aninhados em /empresas/:empresaId — listar,
   criar, editar e excluir. Nenhum deles existe sem o outro: por
   PROJ-ISO-003/004, toda rota reconfirma o vínculo ativo com a
   empresa do :empresaId ANTES de tocar em qualquer linha de
   `projetos`, mesmo as que recebem o id do próprio projeto. Não
   existe rota aqui que aceite só o id do projeto sem também
   confirmar a empresa — é a regra que este arquivo existe para não
   deixar ser esquecida numa rota nova.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import {
  CATALOGO_TIPOS,
  TIPOS_VALIDOS,
  type TipoProjeto,
} from '../projetos/catalogo.js';
import { encontrarMesmoNome } from '../projetos/duplicidade.js';
import * as sessao from '../seguranca/sessao.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* O catálogo mora em `projetos/catalogo.ts` desde que a rota de
   temas passou a precisar do mesmo rótulo. É o catálogo, e não o
   `POST`, que decide o que aparece no card (PROJ-CRIA-002). */

const criacao = z.object({
  tipo: z.enum(TIPOS_VALIDOS as [TipoProjeto, ...TipoProjeto[]], {
    errorMap: () => ({ message: 'Escolha um tipo de projeto válido.' }),
  }),
  /* O nome escolhido na lista da modal. Opcional: quem não escolher
     cai no rótulo do catálogo, que é como a tela funcionava antes da
     lista existir — nenhuma chamada antiga quebra por isto. */
  nome: z
    .string()
    .trim()
    .min(1, 'Dê um nome ao projeto.')
    .max(80, 'O nome do projeto deve ter no máximo 80 caracteres.')
    .optional(),
  /* PROJ-CRIA-012: `true` só depois que a pessoa viu a modal "Este
     projeto já existe" e escolheu continuar. Sem ele, um nome
     repetido na empresa volta como 409 em vez de criar. */
  confirmarDuplicado: z.boolean().optional(),
});

const paramsComEmpresa = z.object({ empresaId: z.string().uuid() });
const paramsComProjeto = z.object({ empresaId: z.string().uuid(), id: z.string().uuid() });

/* Mesma função de auth das rotas de empresa — reproduzida aqui, não
   importada, porque nenhuma das duas tem motivo pra depender da
   outra existir. Se um dia isso duplicar demais, é a hora de mover
   para um módulo `seguranca/quemPede.ts` comum. */
async function quemPede(req: FastifyRequest): Promise<string | null> {
  const acesso = req.cookies[sessao.COOKIE_ACESSO];
  if (!acesso) return null;

  const conteudo = await sessao.lerAcesso(acesso);
  if (!conteudo) return null;

  const viva = await db.sessao.findFirst({
    where: { id: conteudo.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  if (!viva) return null;

  return conteudo.usuarioId;
}

function projetoParaResposta(
  p: { id: string; tipo: TipoProjeto; nome: string | null; criadoEm: Date },
  papel: string,
) {
  const info = CATALOGO_TIPOS[p.tipo];
  return {
    id: p.id,
    tipo: p.tipo,
    /* O nome escolhido vence o rótulo do tipo; sem ele, o catálogo
       responde como sempre respondeu. A `descricao` continua vindo do
       catálogo em todo caso: ela descreve o TIPO, não o nome. */
    nome: p.nome ?? info.nome,
    descricao: info.descricao,
    papel,
    criado_em: p.criadoEm.toISOString(),
  };
}

/* ------------------------------------------------------------
   O vínculo que autoriza tudo — PROJ-ISO-003.
   ------------------------------------------------------------
   Mesmos três filtros usados em rotasEmpresas: vínculo revogado,
   contrato vencido, empresa arquivada. Sem vínculo ativo aqui, a
   pessoa não tem o direito de saber se a empresa existe — por isso
   toda rota abaixo devolve 404, nunca 403, quando esta função
   devolve null.
   ------------------------------------------------------------ */
async function vinculoAtivo(usuarioId: string, empresaId: string) {
  return db.empresaMembro.findFirst({
    where: {
      empresaId,
      usuarioId,
      revogadoEm: null,
      OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
      empresa: { arquivadoEm: null },
    },
  });
}

/* PROJ-CRIA-004/PROJ-EXCL-002: proprietário e membro operam,
   especialista só visualiza. */
function podeOperar(papel: string): boolean {
  return papel === 'proprietario' || papel === 'membro';
}

export async function rotasProjetos(app: FastifyInstance) {
  /* ---------- Listagem — PROJ-LIST-001 a 006 ---------- */
  app.get('/empresas/:empresaId/projetos', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComEmpresa.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const projetos = await db.projeto.findMany({
      where: { empresaId: params.data.empresaId, arquivadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    return resposta.send({
      projetos: projetos.map((p) => projetoParaResposta(p, vinculo.papel)),
    });
  });

  /* ---------- Criação — PROJ-CRIA-001 a 007 ---------- */
  app.post('/empresas/:empresaId/projetos', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComEmpresa.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }
    if (!podeOperar(vinculo.papel)) {
      return resposta.code(403).send(erro(null, 'Só proprietário ou membro podem criar projetos.'));
    }

    const dados = criacao.safeParse(req.body);
    if (!dados.success) {
      const falha = dados.error.issues[0];
      return resposta.code(400).send(erro('tipo', falha?.message ?? 'Escolha um tipo de projeto válido.'));
    }

    /* PROJ-CRIA-012: nome repetido na empresa não é bloqueado
       (PROJ-CRIA-003), mas precisa de um "sim" de quem cria. A
       conferência mora aqui, e não só na tela, porque a lista que a
       tela tem pode estar velha — outro membro pode ter criado o
       mesmo projeto depois que a página abriu. */
    if (!dados.data.confirmarDuplicado) {
      const nomeNovo = dados.data.nome ?? CATALOGO_TIPOS[dados.data.tipo].nome;
      const existentes = await db.projeto.findMany({
        where: { empresaId: params.data.empresaId, arquivadoEm: null },
        select: { nome: true, tipo: true, criadoEm: true },
      });
      const repetido = encontrarMesmoNome(existentes, nomeNovo);
      if (repetido) {
        const empresa = await db.empresa.findUnique({
          where: { id: params.data.empresaId },
          select: { nome: true },
        });
        return resposta.code(409).send({
          ...erro(null, `O projeto "${nomeNovo}" já existe na empresa ${empresa?.nome ?? ''}.`.trim()),
          codigo: 'projeto_duplicado',
          duplicado: {
            nome: nomeNovo,
            empresa: empresa?.nome ?? null,
            quantidade: repetido.quantidade,
            criado_em: repetido.maisRecente.toISOString(),
          },
        });
      }
    }

    const projeto = await db.projeto.create({
      data: {
        empresaId: params.data.empresaId,
        tipo: dados.data.tipo,
        nome: dados.data.nome ?? null,
        criadoPor: usuarioId,
      },
    });

    return resposta.code(201).send({ projeto: projetoParaResposta(projeto, vinculo.papel) });
  });

  /* ---------- Edição — PROJ-CRIA-005 ---------- */
  app.put('/empresas/:empresaId/projetos/:id', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComProjeto.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }
    if (!podeOperar(vinculo.papel)) {
      return resposta.code(403).send(erro(null, 'Só proprietário ou membro podem editar projetos.'));
    }

    const dados = criacao.safeParse(req.body);
    if (!dados.success) {
      const falha = dados.error.issues[0];
      return resposta.code(400).send(erro('tipo', falha?.message ?? 'Escolha um tipo de projeto válido.'));
    }

    /* PROJ-ISO-004: o projeto só existe, para esta chamada, se
       pertencer à empresa do :empresaId. Um id de projeto válido mas
       de outra empresa cai no mesmo 404 de "não existe". */
    const existente = await db.projeto.findFirst({
      where: { id: params.data.id, empresaId: params.data.empresaId, arquivadoEm: null },
    });
    if (!existente) {
      return resposta.code(404).send(erro(null, 'Projeto não encontrado.'));
    }

    const projeto = await db.projeto.update({
      where: { id: existente.id },
      data: { tipo: dados.data.tipo, nome: dados.data.nome ?? null },
    });

    return resposta.send({ projeto: projetoParaResposta(projeto, vinculo.papel) });
  });

  /* ---------- Excluir — PROJ-EXCL-001 a 005 ---------- */
  app.delete('/empresas/:empresaId/projetos/:id', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComProjeto.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* Mesma ordem de EMP-EXCL: vínculo primeiro (404 pra quem não
       tinha o direito de saber que a empresa existe), papel depois
       (403 só pra quem já sabia). */
    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }
    if (!podeOperar(vinculo.papel)) {
      return resposta.code(403).send(erro(null, 'Só proprietário ou membro podem excluir projetos.'));
    }

    const existente = await db.projeto.findFirst({
      where: { id: params.data.id, empresaId: params.data.empresaId, arquivadoEm: null },
    });
    if (!existente) {
      return resposta.code(404).send(erro(null, 'Projeto não encontrado.'));
    }

    /* Arquivar, não apagar — PROJ-EXCL-001, mesmo mecanismo de E1. */
    await db.projeto.update({
      where: { id: existente.id },
      data: { arquivadoEm: new Date() },
    });

    return resposta.code(200).send({ ok: true });
  });
}
