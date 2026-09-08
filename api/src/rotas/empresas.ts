/* ============================================================
   Rotas de empresas
   ============================================================
   Regras: Regras_de_negocio/modulos/empresas/empresas-listagem.md
           Regras_de_negocio/modulos/empresas/empresas-criacao.md
           Regras_de_negocio/modulos/empresas/empresas-edicao.md
           Regras_de_negocio/modulos/empresas/empresas-exclusao.md

   Quatro endpoints: listar, criar, editar e excluir.

   O GET responde à pergunta que decide o estado da tela — "você tem
   empresa?" — e por EMP-LIST-009 a página não tem o direito de
   responder sozinha.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import { env } from '../env.js';
import * as sessao from '../seguranca/sessao.js';
import {
  armazenamentoLogotipo,
  FORMATOS_ACEITOS,
  TAMANHO_MAXIMO,
  LogotipoIndisponivel,
} from '../armazenamento/logotipo.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* Prisma não exporta um tipo específico para erros de constraint —
   o padrão do próprio Prisma é checar `.code` na mão. Duck-typed em
   vez de `instanceof PrismaClientKnownRequestError` porque nada mais
   neste projeto importa esse tipo, e não vale trazer uma dependência
   de tipagem só para isto. */
function ehViolacaoDeUnicidade(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'P2002';
}

const criacao = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da empresa.').max(120),
  descricao: z.string().trim().max(600).optional().nullable(),
});

const paramsComId = z.object({ id: z.string().uuid() });

/* Minúsculo e sem acento — EMP-CRIA-002. Gravado pelo servidor,
   nunca recebido do cliente: a coluna nome_busca não pode ser
   manipulada para burlar a checagem de duplicidade. */
function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    // ̀-ͯ = marcas diacríticas combinantes (acentos, til,
    // cedilha) depois do NFD separar a letra da marca. Faixa em
    // escape de código, não em caractere literal — um acento colado
    // direto no código-fonte é invisível e fácil de digitar errado.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* ------------------------------------------------------------
   Quem está pedindo?
   ------------------------------------------------------------
   Só o token de acesso, sem tentar renovar pelo refresh. A
   renovação é responsabilidade do GET /auth/sessao: se ela
   acontecesse aqui também, duas rotas emitiriam cookies novos em
   paralelo na carga da mesma página e uma rotação anularia a
   outra — derrubando a sessão que as duas tentavam salvar.

   Devolve null quando o acesso não vale; a tela então chama
   /auth/sessao, que renova ou manda para o login.
   ------------------------------------------------------------ */
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

export async function rotasEmpresas(app: FastifyInstance) {
  /* ---------- Listagem — EMP-LIST-001, 009, 011 ---------- */
  app.get('/empresas', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    /* Conta suspensa não lista nada. A explicação de *por quê* é do
       login (ACS-LOGIN-012); aqui só se fecha a porta. */
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    /* Três filtros, três razões distintas para uma empresa não
       contar — vínculo revogado, contrato vencido, empresa
       arquivada (EMP-LIST-011). As três levam à mesma tela vazia. */
    const vinculos = await db.empresaMembro.findMany({
      where: {
        usuarioId,
        revogadoEm: null,
        OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
        empresa: { arquivadoEm: null },
      },
      include: { empresa: true },
      orderBy: { empresa: { criadoEm: 'desc' } },
    });

    return resposta.send({
      empresas: vinculos.map((v) => ({
        id: v.empresa.id,
        nome: v.empresa.nome,
        descricao: v.empresa.descricao,
        logotipo_url: v.empresa.logotipoUrl,
        papel: v.papel,
        criado_em: v.empresa.criadoEm.toISOString(),
      })),
    });
  });

  /* ---------- Criação — EMP-CRIA-001 a 005 ---------- */
  app.post('/empresas', async (req, resposta) => {
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

    if (!req.isMultipart()) {
      return resposta.code(400).send(erro(null, 'Envie os dados como multipart/form-data.'));
    }

    /* ------------------------------------------------------------
       Um envio só, três pedaços — nome, descrição, logotipo.
       ------------------------------------------------------------
       req.parts() trata campo e arquivo de forma uniforme, ao
       contrário de req.file(), que exige que exista um arquivo para
       devolver os outros campos junto. Aqui o logotipo é opcional
       (EMP-CRIA-003), então a leitura não pode depender dele existir.
       ------------------------------------------------------------ */
    let nomeRecebido: string | undefined;
    let descricaoRecebida: string | undefined;
    let arquivo: { buffer: Buffer; tipo: string } | undefined;
    let arquivoRecusado: Erro | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'logotipo' || arquivo || arquivoRecusado) {
          await part.toBuffer(); // drena e descarta — nunca deixar o stream pendurado
          continue;
        }

        const tipo = part.mimetype;
        const dados = await part.toBuffer();

        if (!(FORMATOS_ACEITOS as readonly string[]).includes(tipo)) {
          arquivoRecusado = erro('logotipo', 'Formato não aceito. Envie PNG, JPG ou SVG.');
          continue;
        }
        /* part.file.truncated cobre o corte no meio do envio quando
           o arquivo passa do limite registrado no plugin
           (servidor.ts); o tamanho do buffer cobre o caso comum. Os
           dois levam à mesma mensagem — o limite é o mesmo número. */
        if (dados.byteLength > TAMANHO_MAXIMO || part.file.truncated) {
          arquivoRecusado = erro('logotipo', 'Arquivo maior que 2MB.');
          continue;
        }

        arquivo = { buffer: dados, tipo };
      } else {
        if (part.fieldname === 'nome') nomeRecebido = String(part.value);
        if (part.fieldname === 'descricao') descricaoRecebida = String(part.value);
      }
    }

    /* Nome primeiro, sempre — EMP-CRIA-003/005: o formulário não
       tenta enviar nada ao armazenamento antes de saber que o nome
       está válido (empresas-criacao.md §2). */
    const dados = criacao.safeParse({ nome: nomeRecebido, descricao: descricaoRecebida });
    if (!dados.success) {
      const falha = dados.error.issues[0];
      return resposta.code(400).send(
        falha
          ? erro(String(falha.path[0] ?? 'nome'), falha.message)
          : erro('nome', 'Dados inválidos.'),
      );
    }

    if (arquivoRecusado) {
      return resposta.code(400).send(arquivoRecusado);
    }

    /* Sem armazenamento configurado, criar empresa sem logotipo
       continua funcionando (EMP-CRIA-005) — só o anexo é recusado,
       e antes de qualquer escrita no banco. */
    if (arquivo && env.S3_DRIVER === 'none') {
      return resposta.code(400).send(
        erro('logotipo', 'Envio de logotipo está indisponível no momento. Você pode criar a empresa sem logotipo.'),
      );
    }

    const nomeBusca = normalizar(dados.data.nome);

    /* A empresa e o vínculo de proprietário nascem juntos ou não
       nascem. Sem a transação, uma falha no meio deixaria uma
       empresa sem dono — invisível na listagem de todo mundo,
       inclusive de quem acabou de criá-la, e impossível de apagar
       pela interface. */
    let empresa;
    try {
      empresa = await db.$transaction(async (tx) => {
        const nova = await tx.empresa.create({
          data: {
            nome: dados.data.nome,
            nomeBusca,
            descricao: dados.data.descricao || null,
            criadoPor: usuarioId,
          },
        });

        await tx.empresaMembro.create({
          data: { empresaId: nova.id, usuarioId, papel: 'proprietario' },
        });

        return nova;
      });
    } catch (e) {
      /* Índice único parcial (criado_por, nome_busca) — a migração
         20260822180000_empresa_nome_unico.sql — é quem garante isto
         de verdade; esta captura só traduz a violação em algo que a
         tela sabe mostrar (EMP-CRIA-002). */
      if (ehViolacaoDeUnicidade(e)) {
        return resposta.code(400).send(erro('nome', 'Você já tem uma empresa com esse nome.'));
      }
      throw e;
    }

    /* Logotipo por último, e só se o resto deu certo. Se o envio
       falhar aqui, a empresa que acabou de nascer é desfeita — o
       vínculo cai junto por ON DELETE CASCADE — em vez de ficar uma
       empresa sem o logotipo que o usuário pediu explicitamente
       (EMP-CRIA-004, mesmo princípio de "nasce junto ou não nasce"
       usado acima para o vínculo). */
    if (arquivo) {
      try {
        const url = await armazenamentoLogotipo.enviar(arquivo.buffer, arquivo.tipo);
        empresa = await db.empresa.update({
          where: { id: empresa.id },
          data: { logotipoUrl: url },
        });
      } catch (e) {
        await db.empresa.delete({ where: { id: empresa.id } }).catch(() => {});

        const mensagem = e instanceof LogotipoIndisponivel
          ? e.message
          : 'Não foi possível enviar o logotipo agora. Tente novamente.';
        return resposta.code(400).send(erro('logotipo', mensagem));
      }
    }

    return resposta.code(201).send({
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        descricao: empresa.descricao,
        logotipo_url: empresa.logotipoUrl,
        papel: 'proprietario',
        criado_em: empresa.criadoEm.toISOString(),
      },
    });
  });

  /* ---------- Editar — EMP-EDIT-001 a 007 ---------- */
  app.put('/empresas/:id', async (req, resposta) => {
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

    const params = paramsComId.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* Mesmos três filtros do GET/DELETE — vínculo revogado, contrato
       vencido, empresa já arquivada — e pelo mesmo motivo de
       EMP-EXCL-005: 404 primeiro, para quem não tem vínculo nenhum
       não aprender que o id existe. Só quem já sabia (tem vínculo,
       mas não é dono) recebe 403. */
    const vinculo = await db.empresaMembro.findFirst({
      where: {
        empresaId: params.data.id,
        usuarioId,
        revogadoEm: null,
        OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
        empresa: { arquivadoEm: null },
      },
    });

    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* EMP-EDIT-005 — mesma régua de EMP-EXCL-002: quem edita o nome,
       a descrição ou o logotipo está mudando a identidade da empresa
       para todo mundo que tem vínculo com ela, não só ajustando o
       próprio jeito de ver. Um designer de apoio contratado por um
       cliente não deveria conseguir renomear a empresa do cliente. */
    if (vinculo.papel !== 'proprietario') {
      return resposta.code(403).send(erro(null, 'Só o proprietário pode editar a empresa.'));
    }

    if (!req.isMultipart()) {
      return resposta.code(400).send(erro(null, 'Envie os dados como multipart/form-data.'));
    }

    /* Mesma leitura de req.parts() da criação, com um campo a mais:
       `remover_logotipo`. Sem um sinal explícito de remoção não há
       como distinguir "não mexi no logotipo" de "quero tirar o
       logotipo que já existia" — os dois chegam aqui como "nenhum
       arquivo no envio". */
    let nomeRecebido: string | undefined;
    let descricaoRecebida: string | undefined;
    let removerLogotipo = false;
    let arquivo: { buffer: Buffer; tipo: string } | undefined;
    let arquivoRecusado: Erro | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'logotipo' || arquivo || arquivoRecusado) {
          await part.toBuffer();
          continue;
        }

        const tipo = part.mimetype;
        const dados = await part.toBuffer();

        if (!(FORMATOS_ACEITOS as readonly string[]).includes(tipo)) {
          arquivoRecusado = erro('logotipo', 'Formato não aceito. Envie PNG, JPG ou SVG.');
          continue;
        }
        if (dados.byteLength > TAMANHO_MAXIMO || part.file.truncated) {
          arquivoRecusado = erro('logotipo', 'Arquivo maior que 2MB.');
          continue;
        }

        arquivo = { buffer: dados, tipo };
      } else {
        if (part.fieldname === 'nome') nomeRecebido = String(part.value);
        if (part.fieldname === 'descricao') descricaoRecebida = String(part.value);
        if (part.fieldname === 'remover_logotipo') removerLogotipo = String(part.value) === 'true';
      }
    }

    /* EMP-EDIT-001/003 — mesma validação de nome e descrição da
       criação (empresas-criacao.md EMP-CRIA-001/003): não há motivo
       para a régua ser outra só porque a empresa já existe. */
    const dados = criacao.safeParse({ nome: nomeRecebido, descricao: descricaoRecebida });
    if (!dados.success) {
      const falha = dados.error.issues[0];
      return resposta.code(400).send(
        falha
          ? erro(String(falha.path[0] ?? 'nome'), falha.message)
          : erro('nome', 'Dados inválidos.'),
      );
    }

    if (arquivoRecusado) {
      return resposta.code(400).send(arquivoRecusado);
    }

    if (arquivo && env.S3_DRIVER === 'none') {
      return resposta.code(400).send(
        erro('logotipo', 'Envio de logotipo está indisponível no momento.'),
      );
    }

    const nomeBusca = normalizar(dados.data.nome);

    /* EMP-EDIT-004 — três casos para o logotipo, nesta ordem de
       prioridade: (1) veio arquivo novo → substitui; (2) não veio
       arquivo, mas `remover_logotipo` chegou → apaga o vínculo no
       banco (o arquivo antigo fica órfão no armazenamento — mesma
       escolha que a criação já faz ao não versionar/limpar arquivos,
       cada upload é um UUID novo, então não há "sobrescrever" para
       desfazer); (3) nenhum dos dois → mantém o que já estava, então
       a coluna nem entra no `data` do update. */
    let logotipoUrl: string | null | undefined;
    if (arquivo) {
      try {
        logotipoUrl = await armazenamentoLogotipo.enviar(arquivo.buffer, arquivo.tipo);
      } catch (e) {
        const mensagem = e instanceof LogotipoIndisponivel
          ? e.message
          : 'Não foi possível enviar o logotipo agora. Tente novamente.';
        return resposta.code(400).send(erro('logotipo', mensagem));
      }
    } else if (removerLogotipo) {
      logotipoUrl = null;
    }

    let empresa;
    try {
      empresa = await db.empresa.update({
        where: { id: params.data.id },
        data: {
          nome: dados.data.nome,
          nomeBusca,
          descricao: dados.data.descricao || null,
          ...(logotipoUrl !== undefined ? { logotipoUrl } : {}),
        },
      });
    } catch (e) {
      /* EMP-EDIT-002 — mesmo índice único parcial (criado_por,
         nome_busca) da criação. Como é um UPDATE na própria linha, o
         Postgres só acusa conflito se OUTRA empresa ativa da mesma
         conta já tiver esse nome — a própria empresa nunca colide
         consigo mesma, então "editar sem trocar o nome" nunca cai
         aqui por engano. */
      if (ehViolacaoDeUnicidade(e)) {
        return resposta.code(400).send(erro('nome', 'Você já tem uma empresa com esse nome.'));
      }
      throw e;
    }

    return resposta.code(200).send({
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        descricao: empresa.descricao,
        logotipo_url: empresa.logotipoUrl,
        papel: vinculo.papel,
        criado_em: empresa.criadoEm.toISOString(),
      },
    });
  });

  /* ---------- Excluir — EMP-EXCL-001 a 005 ---------- */
  app.delete('/empresas/:id', async (req, resposta) => {
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

    const params = paramsComId.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* Mesmos três filtros do GET — vínculo revogado, contrato
       vencido, empresa já arquivada — porque quem não passa neles
       não tem o direito de saber se a empresa existe (EMP-EXCL-005).
       É por isso que a checagem de vínculo vem ANTES da checagem de
       papel: 404 primeiro, 403 só para quem já sabia que a empresa
       existia. */
    const vinculo = await db.empresaMembro.findFirst({
      where: {
        empresaId: params.data.id,
        usuarioId,
        revogadoEm: null,
        OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
        empresa: { arquivadoEm: null },
      },
    });

    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    if (vinculo.papel !== 'proprietario') {
      return resposta.code(403).send(erro(null, 'Só o proprietário pode excluir a empresa.'));
    }

    /* Arquivar, não apagar — EMP-EXCL-001. Mesmo mecanismo de E1
       (empresas-listagem.md EMP-LIST-011): a linha continua no
       banco, some da listagem de todo mundo que tinha vínculo com
       ela, e o nome fica livre para reuso (EMP-CRIA-002). Nenhuma
       mudança nessas duas consultas foi necessária para isto
       funcionar — elas já filtravam por arquivado_em. */
    await db.empresa.update({
      where: { id: params.data.id },
      data: { arquivadoEm: new Date() },
    });

    return resposta.code(200).send({ ok: true });
  });
}
