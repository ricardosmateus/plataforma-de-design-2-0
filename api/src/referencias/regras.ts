/* ============================================================
   Referências visuais — as regras puras (BOARD-REF)
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md, BOARD-REF

   Sem `import` de banco nem de rede, como `ideias/ordem.ts`: é o que
   decide se uma URL ou um arquivo podem entrar, testável sem Postgres
   e sem bucket. A rota (rotas/referencias.ts) só decide como gravar.
   ============================================================ */

/* Tetos por tarefa: nenhuma coleção de referências real chega perto,
   e um board com 300 imagens deixa de ser uma coleção para virar um
   depósito que ninguém consegue olhar. */
export const MAX_POR_TIPO = 60;
export const URL_MAX = 2000;
export const NOME_MAX = 120;
export const IMAGEM_TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB

/* PNG, JPG, WEBP e GIF. SVG fica de fora de propósito: é um documento
   que pode carregar script, e a imagem de referência é enviada por
   qualquer membro do projeto e aberta pelos outros. O logotipo da
   empresa aceita SVG porque quem envia é quem administra a empresa. */
export const FORMATOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type FormatoImagem = (typeof FORMATOS_IMAGEM)[number];

export type ResultadoUrl = { ok: true; url: string } | { ok: false; mensagem: string };

/* O endereço de um site de referência. Aceita o que a pessoa cola do
   jeito que cola — "nubank.com.br" sem https:// é o caso mais comum —
   e devolve a URL normalizada. Só http e https: `javascript:` num link
   do board seria script rodando no clique de outra pessoa. */
export function normalizarUrlSite(entrada: string | null | undefined): ResultadoUrl {
  const texto = String(entrada ?? '').trim();
  if (!texto) return { ok: false, mensagem: 'Informe o endereço do site.' };
  if (texto.length > URL_MAX) return { ok: false, mensagem: 'Endereço longo demais.' };

  const temEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto);
  const comEsquema = temEsquema ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return { ok: false, mensagem: 'Endereço inválido. Ex.: https://www.exemplo.com.br' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, mensagem: 'Use um endereço que comece com http:// ou https://.' };
  }
  /* "https://nubank" passa no URL() mas não é site nenhum: exige um
     ponto no nome, ou seja, um domínio de verdade. */
  if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) {
    return { ok: false, mensagem: 'Endereço inválido. Ex.: https://www.exemplo.com.br' };
  }
  return { ok: true, url: url.toString() };
}

export function normalizarNome(entrada: string | null | undefined): string {
  return String(entrada ?? '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);
}

/* O formato pelo CONTEÚDO do arquivo, não pelo que o navegador diz.
   O `Content-Type` do envio é escrito por quem envia; os primeiros
   bytes são o que o arquivo é. Um .png que é na verdade outra coisa
   não entra. */
export function formatoPelosBytes(dados: Uint8Array): FormatoImagem | null {
  const b = dados;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/* ------------------------------------------------------------
   Documentos — BOARD-REF-008
   ------------------------------------------------------------
   PDF, Word, Excel, PowerPoint, os equivalentes do LibreOffice, RTF
   e texto (TXT, CSV, MD). HTML e SVG ficam de fora pelo mesmo motivo
   da imagem: são documentos que carregam script, e quem abre é outra
   pessoa do projeto.

   O formato sai de DUAS conferências: a extensão do nome diz o que a
   pessoa afirma que o arquivo é, e os primeiros bytes precisam
   confirmar a família. Um .docx e um .xlsx são os dois um ZIP por
   dentro — os bytes sozinhos não separam os dois, a extensão
   sozinha seria só o que o navegador disse. */
export const DOCUMENTO_TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20MB

type FamiliaDocumento = 'pdf' | 'zip' | 'ole' | 'rtf' | 'texto';

const DOCUMENTOS: Record<string, { mime: string; familia: FamiliaDocumento }> = {
  pdf: { mime: 'application/pdf', familia: 'pdf' },
  doc: { mime: 'application/msword', familia: 'ole' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', familia: 'zip' },
  xls: { mime: 'application/vnd.ms-excel', familia: 'ole' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', familia: 'zip' },
  ppt: { mime: 'application/vnd.ms-powerpoint', familia: 'ole' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', familia: 'zip' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', familia: 'zip' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', familia: 'zip' },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', familia: 'zip' },
  rtf: { mime: 'application/rtf', familia: 'rtf' },
  txt: { mime: 'text/plain; charset=utf-8', familia: 'texto' },
  csv: { mime: 'text/csv; charset=utf-8', familia: 'texto' },
  md: { mime: 'text/markdown; charset=utf-8', familia: 'texto' },
};

export const EXTENSOES_DOCUMENTO = Object.keys(DOCUMENTOS);

export type FormatoDocumento = { extensao: string; mime: string };

export function extensaoDoNome(nome: string | null | undefined): string | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(nome ?? '').trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

function confereFamilia(familia: FamiliaDocumento, b: Uint8Array): boolean {
  switch (familia) {
    case 'pdf': // %PDF-
      return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
    case 'zip': // PK\x03\x04
      return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    case 'ole': // D0 CF 11 E0 A1 B1 1A E1 — .doc, .xls e .ppt antigos
      return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
        b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;
    case 'rtf': // {\rtf
      return b.length >= 5 && b[0] === 0x7b && b[1] === 0x5c && b[2] === 0x72 && b[3] === 0x74 && b[4] === 0x66;
    case 'texto':
      /* Texto não tem assinatura. O que separa texto de binário
         disfarçado de .txt é o byte zero, que texto não tem. */
      return b.length > 0 && b.indexOf(0) === -1;
  }
}

export function formatoDocumento(nomeArquivo: string | null | undefined, dados: Uint8Array): FormatoDocumento | null {
  const extensao = extensaoDoNome(nomeArquivo);
  if (!extensao) return null;
  const doc = DOCUMENTOS[extensao];
  if (!doc) return null;
  if (!confereFamilia(doc.familia, dados)) return null;
  return { extensao, mime: doc.mime };
}

/* O nome do arquivo que a URL traz — "Manual-de-Marca.pdf". */
export function nomeDoArquivoNaUrl(url: string): string {
  try {
    const ultimo = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(ultimo).slice(0, 150);
  } catch {
    return '';
  }
}
