/* ============================================================
   Coletar as referências que a IA achou — BOARD-REF-009
   ============================================================
   Recebe a lista de concorrentes que a busca devolveu (já filtrada
   por interpretarReferencias: só endereços que apareceram nos
   resultados) e transforma cada um em cards da tarefa:

     - o SITE vira referência de site;
     - o LOGOTIPO sai da página inicial do site (logotipo-do-site.ts),
       é baixado com as travas de rede/baixar.ts, conferido pelos bytes
       (BOARD-REF-003) e guardado no armazenamento;
     - cada DOCUMENTO é baixado, conferido por extensão e bytes
       (BOARD-REF-008) e guardado com o nome original.

   Os downloads correm em paralelo por concorrente; as linhas no banco
   são gravadas DEPOIS, em ordem (site, logotipo, documentos de cada
   concorrente), para o board mostrar cada concorrente agrupado.

   Nada aqui lança por causa de um item: o que falhar vira aviso, e o
   resto entra. Um logotipo que não baixou não pode derrubar os sites.
   ============================================================ */

import { db } from '../db.js';
import { env } from '../env.js';
import { armazenamentoLogotipo } from '../armazenamento/logotipo.js';
import { baixarSeguro } from '../rede/baixar.js';
import { candidatosDeLogo } from './logotipo-do-site.js';
import {
  normalizarUrlSite,
  normalizarNome,
  formatoPelosBytes,
  formatoDocumento,
  extensaoDoNome,
  nomeDoArquivoNaUrl,
  IMAGEM_TAMANHO_MAXIMO,
  DOCUMENTO_TAMANHO_MAXIMO,
  MAX_POR_TIPO,
} from './regras.js';
import type { ConcorrenteAchado } from '../ia/gerar-tarefa.js';

const HTML_MAX = 1_500_000;
const TENTATIVAS_DE_LOGO = 3;
/* Menor que isto não é logotipo: é um favicon de 16px ou um pixel de
   rastreamento que casou com "logo" no nome. */
const LOGO_MIN_BYTES = 800;

type Pronto =
  | { tipo: 'site'; url: string; nome: string }
  | { tipo: 'imagem' | 'documento'; url: string; nome: string };

export type ReferenciaCriada = { id: string; tipo: string; url: string; nome: string; criado_em: Date };

export type ResultadoColeta = {
  sites: number;
  imagens: number;
  documentos: number;
  avisos: string[];
  /* As linhas gravadas, na ordem — o board desenha os cards com elas
     sem precisar reler a lista (BOARD-REF-010). */
  criadas: ReferenciaCriada[];
};

/* O que a tarefa JÁ tem, para uma segunda busca não duplicar
   (BOARD-REF-010): domínio de site e nome de card (o logotipo se
   chama "Logotipo — Nome"; o documento, pelo título). */
export type JaExistentes = { hosts: Set<string>; nomes: Set<string>; porTipo: Record<string, number> };

function hostDe(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}
const chaveNome = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function existentesDaTarefa(tarefaId: string): Promise<JaExistentes> {
  const linhas = await db.referenciaVisual.findMany({ where: { tarefaId }, select: { tipo: true, url: true, nome: true } });
  const ja: JaExistentes = { hosts: new Set(), nomes: new Set(), porTipo: { site: 0, imagem: 0, documento: 0 } };
  for (const l of linhas) {
    ja.porTipo[l.tipo] = (ja.porTipo[l.tipo] ?? 0) + 1;
    if (l.nome) ja.nomes.add(chaveNome(l.nome));
    if (l.tipo === 'site') {
      const h = hostDe(l.url);
      if (h) ja.hosts.add(h);
    }
  }
  return ja;
}

async function logotipoDe(site: string, nome: string, avisos: string[]): Promise<Pronto | null> {
  const pagina = await baixarSeguro(site, { maxBytes: HTML_MAX, aceitar: 'text/html' });
  if (!pagina.ok || !/html/i.test(pagina.tipo ?? '')) {
    avisos.push(`Logotipo de ${nome}: o site não abriu.`);
    return null;
  }
  const candidatos = candidatosDeLogo(pagina.dados.toString('utf8'), pagina.urlFinal);
  for (const url of candidatos.slice(0, TENTATIVAS_DE_LOGO)) {
    const img = await baixarSeguro(url, { maxBytes: IMAGEM_TAMANHO_MAXIMO, aceitar: 'image/*' });
    if (!img.ok || img.dados.byteLength < LOGO_MIN_BYTES) continue;
    const formato = formatoPelosBytes(img.dados);
    if (!formato) continue;
    try {
      const guardada = await armazenamentoLogotipo.enviar(img.dados, formato, 'referencias');
      return { tipo: 'imagem', url: guardada, nome: `Logotipo — ${nome}` };
    } catch {
      avisos.push(`Logotipo de ${nome}: não foi possível guardar a imagem.`);
      return null;
    }
  }
  avisos.push(`Logotipo de ${nome}: não encontrado no site.`);
  return null;
}

async function documentoDe(doc: { titulo: string; url: string }, nome: string, avisos: string[]): Promise<Pronto | null> {
  const r = await baixarSeguro(doc.url, { maxBytes: DOCUMENTO_TAMANHO_MAXIMO, timeoutMs: 20_000 });
  if (!r.ok) {
    avisos.push(`${doc.titulo}: ${r.motivo === 'grande demais' ? 'maior que 20MB' : 'não baixou'}.`);
    return null;
  }
  let arquivo = nomeDoArquivoNaUrl(r.urlFinal) || nomeDoArquivoNaUrl(doc.url) || nome;
  /* Muito PDF é servido sem extensão no endereço ("/download?id=3").
     Os bytes decidem: começando com %PDF, o nome ganha .pdf. */
  if (!extensaoDoNome(arquivo) && r.dados.subarray(0, 5).toString('latin1') === '%PDF-') arquivo += '.pdf';
  const formato = formatoDocumento(arquivo, r.dados);
  if (!formato) {
    avisos.push(`${doc.titulo}: formato não aceito.`);
    return null;
  }
  try {
    const guardado = await armazenamentoLogotipo.enviar(r.dados, formato.mime, 'referencias', { nomeDownload: arquivo });
    return { tipo: 'documento', url: guardado, nome: doc.titulo };
  } catch {
    avisos.push(`${doc.titulo}: não foi possível guardar o arquivo.`);
    return null;
  }
}

export async function coletarReferencias(
  tarefaId: string,
  usuarioId: string,
  concorrentes: ConcorrenteAchado[],
  ja: JaExistentes = { hosts: new Set(), nomes: new Set(), porTipo: {} },
): Promise<ResultadoColeta> {
  const avisos: string[] = [];
  const guardarArquivos = env.S3_DRIVER !== 'none';
  if (!guardarArquivos) {
    avisos.push('Logotipos e documentos não foram guardados: o armazenamento de arquivos não está configurado.');
  }

  const porConcorrente = await Promise.all(
    concorrentes.map(async (c) => {
      const itens: Pronto[] = [];
      const site = c.site ? normalizarUrlSite(c.site) : null;
      const hostNovo = site && site.ok ? hostDe(site.url) : null;
      const siteJaExiste = !!hostNovo && ja.hosts.has(hostNovo);
      if (site && site.ok && !siteJaExiste) itens.push({ tipo: 'site', url: site.url, nome: c.nome });
      else if (!site || !site.ok) avisos.push(`${c.nome}: site oficial não encontrado.`);

      if (guardarArquivos) {
        /* O que a tarefa já tem não é baixado de novo. */
        const precisaLogo = site && site.ok && !ja.nomes.has(chaveNome(`Logotipo — ${c.nome}`));
        const docsNovos = c.documentos.filter((d) => !ja.nomes.has(chaveNome(d.titulo)));
        const [logo, ...docs] = await Promise.all([
          precisaLogo ? logotipoDe((site as { url: string }).url, c.nome, avisos) : Promise.resolve(null),
          ...docsNovos.map((d) => documentoDe(d, c.nome, avisos)),
        ]);
        if (logo) itens.push(logo);
        for (const d of docs) if (d) itens.push(d);
      }
      return itens;
    }),
  );

  const res: ResultadoColeta = { sites: 0, imagens: 0, documentos: 0, avisos, criadas: [] };
  const conta: Record<string, number> = { ...ja.porTipo };
  /* Em ordem, um criado depois do outro: `criadoEm` é a ordem do
     board (BOARD-REF-001, mais antigo primeiro). */
  for (const itens of porConcorrente) {
    for (const it of itens) {
      /* BOARD-REF-006: o teto de 60 por tipo vale para a IA também. O
         arquivo que já subiu e não coube vira aviso — e sobra no bucket,
         o mesmo custo de centavos de BOARD-REF-004. */
      if ((conta[it.tipo] ?? 0) >= MAX_POR_TIPO) {
        avisos.push(`${it.nome}: a tarefa já tem o máximo de ${MAX_POR_TIPO} itens deste tipo.`);
        continue;
      }
      conta[it.tipo] = (conta[it.tipo] ?? 0) + 1;
      const criada = await db.referenciaVisual.create({
        data: { tarefaId, tipo: it.tipo, url: it.url, nome: normalizarNome(it.nome), criadoPor: usuarioId },
      });
      res.criadas.push({ id: criada.id, tipo: criada.tipo, url: criada.url, nome: criada.nome, criado_em: criada.criadoEm });
      if (it.tipo === 'site') res.sites++;
      else if (it.tipo === 'imagem') res.imagens++;
      else res.documentos++;
    }
  }
  return res;
}
