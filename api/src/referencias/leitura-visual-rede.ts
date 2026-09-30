/* ============================================================
   Leitura visual de um site — a parte de REDE
   ============================================================
   Regras: BOARD-VISUAL-001/004
   Tudo passa por `baixarSeguro` (rede/baixar.ts): as mesmas travas
   da Referência — nada de IP interno, no máximo 3 redirecionamentos,
   tamanho e tempo limitados. Nada é gravado: a imagem do logotipo vai
   para a análise (1b-2) em memória, e o link fica como fonte.

   Site que não abre NÃO vira dado inventado: volta com aviso, e quem
   monta o quadro escreve "não consegui ler o site".
   ============================================================ */

import { baixarSeguro } from '../rede/baixar.js';
import { candidatosDeLogo, HTML_MAX_LIDO } from './logotipo-do-site.js';
import { formatoPelosBytes, IMAGEM_TAMANHO_MAXIMO } from './regras.js';
import { folhasDeEstilo, montarEvidencia, svgsDeLogo, type EvidenciaVisual } from './leitura-visual.js';

const CSS_MAX = 800_000;
const SVG_MAX = 200_000;
const TENTATIVAS_DE_LOGO = 3;
const LOGO_MIN_BYTES = 300;

export type LeituraVisual = EvidenciaVisual & {
  /* Só em memória, para a análise com visão. Nunca gravado. */
  logoBytes: Buffer | null;
  /* O que veio da rede, para o script salvar como fixture. */
  bruto: { html: string; folhas: { url: string; css: string }[] };
};

export async function lerSiteVisual(site: string): Promise<LeituraVisual> {
  const avisos: string[] = [];
  const pagina = await baixarSeguro(site, { maxBytes: HTML_MAX_LIDO, aceitar: 'text/html', timeoutMs: 10_000 });
  if (!pagina.ok || !/html/i.test(pagina.tipo ?? '')) {
    avisos.push(`O site não abriu (${pagina.ok ? 'não é HTML' : pagina.motivo}).`);
    return { ...montarEvidencia({ site, html: '', folhas: [], svgs: [], logo: null, avisos }), logoBytes: null, bruto: { html: '', folhas: [] } };
  }
  const html = pagina.dados.toString('utf8');
  const urlFinal = pagina.urlFinal;

  const folhas: { url: string; css: string }[] = [];
  for (const url of folhasDeEstilo(html, urlFinal)) {
    const r = await baixarSeguro(url, { maxBytes: CSS_MAX, aceitar: 'text/css', timeoutMs: 8_000 });
    if (r.ok) folhas.push({ url, css: r.dados.toString('utf8') });
  }

  const { embutidos, enderecos } = svgsDeLogo(html, urlFinal);
  const svgs = [...embutidos];
  for (const url of enderecos) {
    const r = await baixarSeguro(url, { maxBytes: SVG_MAX, aceitar: 'image/svg+xml', timeoutMs: 8_000 });
    if (r.ok) svgs.push(r.dados.toString('utf8'));
  }

  let logo: { url: string; formato: string } | null = null;
  let logoBytes: Buffer | null = null;
  for (const url of candidatosDeLogo(html, urlFinal).slice(0, TENTATIVAS_DE_LOGO)) {
    const img = await baixarSeguro(url, { maxBytes: IMAGEM_TAMANHO_MAXIMO, aceitar: 'image/*', timeoutMs: 8_000 });
    if (!img.ok || img.dados.byteLength < LOGO_MIN_BYTES) continue;
    const formato = formatoPelosBytes(img.dados);
    if (!formato) continue;
    logo = { url, formato };
    logoBytes = img.dados;
    break;
  }
  if (!logo && !svgs.length) avisos.push('Não achei o logotipo na página inicial.');
  if (!folhas.length && !/<style/i.test(html)) avisos.push('Não consegui ler o CSS do site; cores e fontes podem estar incompletas.');

  return {
    ...montarEvidencia({ site: urlFinal, html, folhas: folhas.map((f) => f.css), svgs, logo, avisos }),
    logoBytes,
    bruto: { html, folhas },
  };
}
