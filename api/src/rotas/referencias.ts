/* ============================================================
   Rotas das referências visuais de uma tarefa — BOARD-REF
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md, BOARD-REF
           Regras_de_negocio/modulos/atividades/atividade-lista.md, ATV-TAR-CRIA-007

   A tarefa `referencias_visuais` junta sites, documentos e imagens.
   O board dela mostra um quadro só, "Referências", e cada referência
   é um card com ⋮ para abrir ou excluir (BOARD-REF-001, revisto em
   23/09/2026).

   Rotas próprias, e não o PUT do quadro, por dois motivos:
     1. o PUT apaga e regrava tudo a cada autosave (BOARD-SALVA-001);
        uma imagem já enviada ao bucket não pode depender disso;
     2. enviar imagem e documento é multipart, e o quadro é JSON.

   A corrente de isolamento (empresa -> projeto -> idéia -> tarefa) é
   a MESMA de board.ts, importada de lá: é o mesmo módulo.
   ============================================================ */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { db } from '../db.js';
import { env } from '../env.js';
import { abrirContexto, podeEscrever, type Contexto } from './board.js';
import { armazenamentoLogotipo } from '../armazenamento/logotipo.js';
import {
  MAX_POR_TIPO,
  IMAGEM_TAMANHO_MAXIMO,
  DOCUMENTO_TAMANHO_MAXIMO,
  formatoDocumento,
  normalizarUrlSite,
  normalizarNome,
  formatoPelosBytes,
} from '../referencias/regras.js';
import { existentesDaTarefa } from '../referencias/coleta.js';
import { concorrentesConhecidos, tetoDaBusca, executarBusca } from '../referencias/busca-com-ia.js';
import { iaConfigurada } from '../ia/provedor.js';
import { modeloDaBusca } from '../pesquisa/provedor-claude-busca.js';
import { reservar, SaldoInsuficiente } from '../creditos/reserva.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

type ContextoOk = Extract<Contexto, { ok: true }>;

/* O que toda escrita confere antes de tocar em qualquer coisa. Devolve
   o erro pronto, ou null quando pode seguir. */
function recusaDeEscrita(ctx: ContextoOk): { code: number; corpo: Erro } | null {
  if (!podeEscrever(ctx.papel)) {
    return { code: 403, corpo: erro(null, 'Seu papel não permite editar as referências.') };
  }
  /* BOARD-LEITURA: tarefa concluída não se mexe. A tela já esconde os
     botões; o servidor recusa por conta própria. */
  if (ctx.tarefaStatus === 'concluida') {
    return { code: 409, corpo: erro(null, 'Tarefa concluída. Reabra a tarefa para mudar as referências.') };
  }
  if (ctx.tarefaTipo !== 'referencias_visuais') {
    return { code: 409, corpo: erro(null, 'Esta tarefa não é de referências visuais.') };
  }
  return null;
}

function paraResposta(r: { id: string; tipo: string; url: string; nome: string; criadoEm?: Date; criado_em?: Date }) {
  return { id: r.id, tipo: r.tipo, url: r.url, nome: r.nome, criado_em: r.criadoEm ?? r.criado_em };
}

async function contarDoTipo(tarefaId: string, tipo: 'site' | 'imagem' | 'documento') {
  return db.referenciaVisual.count({ where: { tarefaId, tipo } });
}

const corpoSite = z.object({
  url: z.string().optional(),
  nome: z.string().optional(),
});

const paramsReferencia = z.object({ referenciaId: z.string().uuid() });

/* O que muda entre enviar imagem e enviar documento. O resto — ler
   o multipart, conferir papel e status, contar o teto, subir para o
   bucket e gravar a linha — é o mesmo caminho, de propósito: dois
   caminhos para "enviar arquivo de referência" divergiriam no
   primeiro ajuste. */
type RegraArquivo = {
  tipo: 'imagem' | 'documento';
  campo: string;
  limite: number;
  muitoGrande: string;
  formatoRecusado: string;
  vazio: string;
  indisponivel: string;
  falhaEnvio: string;
  limiteTexto: string;
  /* Devolve o Content-Type a gravar, ou null quando o arquivo não é
     do formato aceito. */
  conferir: (nomeArquivo: string, dados: Uint8Array) => string | null;
  /* Documento baixa com o nome original; imagem é mostrada no card. */
  guardarNomeOriginal: boolean;
};

const ARQUIVO: Record<'imagem' | 'documento', RegraArquivo> = {
  imagem: {
    tipo: 'imagem',
    campo: 'imagem',
    limite: IMAGEM_TAMANHO_MAXIMO,
    muitoGrande: 'Imagem maior que 5MB.',
    formatoRecusado: 'Formato não aceito. Envie PNG, JPG, WEBP ou GIF.',
    vazio: 'Escolha uma imagem.',
    indisponivel: 'Envio de imagens indisponível no momento. Você ainda pode adicionar sites.',
    falhaEnvio: 'Não foi possível enviar a imagem. Tente de novo.',
    limiteTexto: `Limite de ${MAX_POR_TIPO} imagens nesta tarefa.`,
    conferir: (_nome, dados) => formatoPelosBytes(dados),
    guardarNomeOriginal: false,
  },
  documento: {
    tipo: 'documento',
    campo: 'documento',
    limite: DOCUMENTO_TAMANHO_MAXIMO,
    muitoGrande: 'Documento maior que 20MB.',
    formatoRecusado: 'Formato não aceito. Envie PDF, Word, Excel, PowerPoint, TXT, CSV, MD ou RTF.',
    vazio: 'Escolha um documento.',
    indisponivel: 'Envio de documentos indisponível no momento. Você ainda pode adicionar sites.',
    falhaEnvio: 'Não foi possível enviar o documento. Tente de novo.',
    limiteTexto: `Limite de ${MAX_POR_TIPO} documentos nesta tarefa.`,
    conferir: (nome, dados) => formatoDocumento(nome, dados)?.mime ?? null,
    guardarNomeOriginal: true,
  },
};

async function receberArquivo(req: FastifyRequest, resposta: FastifyReply, regra: RegraArquivo) {
  const ctx = await abrirContexto(req);
  if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
  const recusa = recusaDeEscrita(ctx);
  if (recusa) return resposta.code(recusa.code).send(recusa.corpo);

  if (!req.isMultipart()) {
    return resposta.code(400).send(erro(regra.campo, 'Envie o arquivo pelo formulário.'));
  }

  let nome = '';
  let arquivo: { dados: Buffer; tipo: string; nomeOriginal: string } | undefined;
  let recusado: Erro | undefined;

  /* O limite do plugin (servidor.ts) é o do logotipo, 2MB. Aqui ele
     sobe para o da referência, só nesta rota. */
  for await (const part of req.parts({ limits: { fileSize: regra.limite + 1024, files: 1 } })) {
    if (part.type === 'file') {
      /* Passar do limite faz o toBuffer() lançar (throwFileSizeLimit
         é o padrão do plugin); sem este try o erro sairia em inglês,
         pelo tratador genérico do Fastify. */
      let dados: Buffer;
      try {
        dados = await part.toBuffer();
      } catch {
        recusado = recusado ?? erro(regra.campo, regra.muitoGrande);
        continue;
      }
      if (part.fieldname !== regra.campo || arquivo || recusado) continue;
      if (dados.byteLength > regra.limite || part.file.truncated) {
        recusado = erro(regra.campo, regra.muitoGrande);
        continue;
      }
      const nomeOriginal = String(part.filename ?? '');
      const tipo = regra.conferir(nomeOriginal, dados);
      if (!tipo) {
        recusado = erro(regra.campo, regra.formatoRecusado);
        continue;
      }
      arquivo = { dados, tipo, nomeOriginal };
    } else if (part.fieldname === 'nome') {
      nome = String(part.value ?? '');
    }
  }

  if (recusado) return resposta.code(400).send(recusado);
  if (!arquivo) return resposta.code(400).send(erro(regra.campo, regra.vazio));

  /* Sem armazenamento configurado, recusa ANTES de gravar qualquer
     coisa — mesmo desenho de EMP-CRIA-005. */
  if (env.S3_DRIVER === 'none') {
    return resposta.code(400).send(erro(regra.campo, regra.indisponivel));
  }

  if ((await contarDoTipo(ctx.tarefaId, regra.tipo)) >= MAX_POR_TIPO) {
    return resposta.code(409).send(erro(null, regra.limiteTexto));
  }

  let url: string;
  try {
    url = await armazenamentoLogotipo.enviar(arquivo.dados, arquivo.tipo, 'referencias',
      regra.guardarNomeOriginal ? { nomeDownload: arquivo.nomeOriginal } : {});
  } catch (e) {
    req.log.error({ err: e }, `falha ao enviar ${regra.tipo} de referência`);
    return resposta.code(502).send(erro(regra.campo, regra.falhaEnvio));
  }

  /* Sem nome informado, o documento fica com o nome do arquivo — é
     assim que a pessoa o reconhece. */
  const nomeFinal = normalizarNome(nome) ||
    (regra.guardarNomeOriginal ? normalizarNome(arquivo.nomeOriginal) : '');

  const criada = await db.referenciaVisual.create({
    data: {
      tarefaId: ctx.tarefaId,
      tipo: regra.tipo,
      url,
      nome: nomeFinal,
      criadoPor: ctx.usuarioId,
    },
  });
  return resposta.code(201).send({ referencia: paraResposta(criada) });
}

export async function rotasReferencias(app: FastifyInstance) {
  const PREFIXO =
    '/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/referencias';

  /* ---------- Listar — BOARD-REF-001 ----------
     Lista vazia é resposta válida: o quadro aparece vazio,
     convidando a adicionar. Mais antigas primeiro, como a pessoa as
     juntou. */
  app.get(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);

    const lista = await db.referenciaVisual.findMany({
      where: { tarefaId: ctx.tarefaId },
      orderBy: { criadoEm: 'asc' },
    });
    return resposta.send({ referencias: lista.map(paraResposta) });
  });

  /* ---------- Adicionar site — BOARD-REF-002 ---------- */
  app.post(PREFIXO, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    const recusa = recusaDeEscrita(ctx);
    if (recusa) return resposta.code(recusa.code).send(recusa.corpo);

    const corpo = corpoSite.safeParse(req.body ?? {});
    if (!corpo.success) return resposta.code(400).send(erro('url', 'Dados inválidos.'));

    const url = normalizarUrlSite(corpo.data.url);
    if (!url.ok) return resposta.code(400).send(erro('url', url.mensagem));

    if ((await contarDoTipo(ctx.tarefaId, 'site')) >= MAX_POR_TIPO) {
      return resposta.code(409).send(erro(null, `Limite de ${MAX_POR_TIPO} sites nesta tarefa.`));
    }

    const criada = await db.referenciaVisual.create({
      data: {
        tarefaId: ctx.tarefaId,
        tipo: 'site',
        url: url.url,
        nome: normalizarNome(corpo.data.nome),
        criadoPor: ctx.usuarioId,
      },
    });
    return resposta.code(201).send({ referencia: paraResposta(criada) });
  });

  /* ---------- Enviar imagem (BOARD-REF-003) e documento (BOARD-REF-008) ----------
     Um arquivo só por envio, com um nome opcional. Formato conferido
     pelos BYTES do arquivo, não pelo que o navegador declara — no
     documento, pela extensão E pelos bytes (ver referencias/regras.ts). */
  app.post(`${PREFIXO}/imagem`, (req, resposta) => receberArquivo(req, resposta, ARQUIVO.imagem));
  app.post(`${PREFIXO}/documento`, (req, resposta) => receberArquivo(req, resposta, ARQUIVO.documento));

  /* ---------- Pesquisar com a IA — BOARD-REF-010 ----------
     O botão "Pesquisar" do board, numa tarefa de Referência. Faz o
     mesmo que "Gerar com ajuda da IA" faz na criação (BOARD-REF-009),
     sobre a tarefa que JÁ existe: busca concorrentes, sites, logotipos
     e documentos de marca e ACRESCENTA os cards. O que a tarefa já tem
     (mesmo domínio de site, mesmo nome de card) não entra de novo, e
     os concorrentes que já estão nos cards de site entram como
     conhecidos — a busca continua de onde a tarefa parou. */
  app.post(`${PREFIXO}/buscar`, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    const recusa = recusaDeEscrita(ctx);
    if (recusa) return resposta.code(recusa.code).send(recusa.corpo);

    const modelo = iaConfigurada() ? modeloDaBusca() : null;
    if (!modelo) {
      return resposta.code(503).send(erro(null, 'A busca na web ainda não está configurada neste ambiente.'));
    }

    const tarefa = await db.tarefa.findUnique({
      where: { id: ctx.tarefaId },
      select: {
        descricao: true,
        ideia: { select: { titulo: true, projeto: { select: { empresaId: true, empresa: { select: { nome: true, descricao: true } } } } } },
      },
    });
    if (!tarefa) return resposta.code(404).send(erro(null, 'Tarefa não encontrada.'));
    const empresa = tarefa.ideia.projeto.empresa;

    const ja = await existentesDaTarefa(ctx.tarefaId);
    const nomesNosCards = (await db.referenciaVisual.findMany({
      where: { tarefaId: ctx.tarefaId, tipo: 'site' },
      orderBy: { criadoEm: 'asc' },
      select: { nome: true },
    })).map((r) => r.nome).filter(Boolean);

    const pedido = {
      empresaNome: empresa.nome,
      empresaDescricao: empresa.descricao ?? null,
      atividadeTitulo: tarefa.ideia.titulo,
      tarefaDescricao: tarefa.descricao,
      concorrentesConhecidos: await concorrentesConhecidos(tarefa.ideia.projeto.empresaId, empresa.nome, nomesNosCards),
    };

    const teto = tetoDaBusca(modelo, pedido);
    if (teto === null) {
      return resposta.code(503).send(erro(null, 'A busca está indisponível no momento. Tente mais tarde.'));
    }
    const operacaoId = randomUUID();
    try {
      await reservar(ctx.usuarioId, teto, operacaoId, 'pesquisa');
    } catch (e) {
      if (e instanceof SaldoInsuficiente) {
        return resposta.code(402).send(erro(null, 'Saldo insuficiente para pesquisar as referências. Adicione créditos para continuar.'));
      }
      throw e;
    }

    const r = await executarBusca({
      usuarioId: ctx.usuarioId,
      tarefaId: ctx.tarefaId,
      modelo,
      pedido,
      tetoReservado: teto,
      operacaoId,
      ja,
    });

    return resposta.code(200).send({
      referencias: r.coleta.criadas.map(paraResposta),
      resumo: { concorrentes: r.concorrentes, sites: r.coleta.sites, imagens: r.coleta.imagens, documentos: r.coleta.documentos },
      avisos: r.coleta.avisos.slice(0, 12),
    });
  });

  /* ---------- Excluir — BOARD-REF-004 ----------
     Apaga a linha e, se for imagem, o arquivo no bucket. O arquivo sai
     DEPOIS da linha: se o bucket falhar, sobra um arquivo sem dono (um
     custo de centavos), nunca um card apontando para imagem quebrada. */
  app.delete(`${PREFIXO}/:referenciaId`, async (req, resposta) => {
    const ctx = await abrirContexto(req);
    if (!ctx.ok) return resposta.code(ctx.code).send(ctx.corpo);
    const recusa = recusaDeEscrita(ctx);
    if (recusa) return resposta.code(recusa.code).send(recusa.corpo);

    const p = paramsReferencia.safeParse(req.params);
    const naoEncontrada = erro(null, 'Referência não encontrada.');
    if (!p.success) return resposta.code(404).send(naoEncontrada);

    const ref = await db.referenciaVisual.findFirst({
      where: { id: p.data.referenciaId, tarefaId: ctx.tarefaId },
    });
    if (!ref) return resposta.code(404).send(naoEncontrada);

    await db.referenciaVisual.delete({ where: { id: ref.id } });

    if (ref.tipo === 'imagem' || ref.tipo === 'documento') {
      armazenamentoLogotipo.apagar(ref.url).catch((e) => {
        req.log.warn({ err: e, url: ref.url }, 'arquivo de referência ficou no bucket');
      });
    }
    return resposta.code(204).send();
  });
}
