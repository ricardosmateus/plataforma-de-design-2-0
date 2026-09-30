/* ============================================================
   Leitura visual de um site — a parte de REDE
   ============================================================
   Regras: BOARD-VISUAL-001/004/006/009/010
   Tudo passa por `baixarSeguro` (rede/baixar.ts): as mesmas travas
   da Referência — nada de IP interno, no máximo 3 redirecionamentos,
   tamanho e tempo limitados. Nada é gravado: a imagem do logotipo vai
   para a análise (1b-2) em memória, e o link fica como fonte.

   Site que não abre NÃO vira dado inventado: volta com aviso, e quem
   monta o quadro escreve "não consegui ler o site".
   ============================================================ */

import { baixarSeguro } from '../rede/baixar.js';
import { HTML_MAX_LIDO } from './logotipo-do-site.js';
import { formatoPelosBytes, IMAGEM_TAMANHO_MAXIMO } from './regras.js';
import { dominioBase, folhasDeEstilo, logosDaMarca, montarEvidencia, mudouDeDominio, type CandidatoLogo, type EvidenciaVisual } from './leitura-visual.js';

const CSS_MAX = 800_000;
const SVG_MAX = 200_000;
const TENTATIVAS_DE_LOGO = 4;
const LOGO_MIN_BYTES = 300;

export type LeituraVisual = EvidenciaVisual & {
  /* Só em memória, para a análise com visão. Nunca gravado. */
  logoBytes: Buffer | null;
  /* O SVG do logotipo, quando ele é SVG: a análise o recebe como texto. */
  logoSvg: string | null;
  candidatos: CandidatoLogo[];
  /* O que veio da rede, para o script salvar como fixture. */
  bruto: { html: string; folhas: { url: string; css: string }[] };
};

export async function lerSiteVisual(site: string, nomesDaMarca: string[] = []): Promise<LeituraVisual> {
  const avisos: string[] = [];
  const vazio = (): LeituraVisual => ({
    ...montarEvidencia({ site, html: '', folhas: [], svgs: [], logo: null, avisos }),
    logoBytes: null, logoSvg: null, candidatos: [], bruto: { html: '', folhas: [] },
  });

  /* BOARD-VISUAL-010: página grande é lida pelo COMEÇO, não descartada. */
  const pagina = await baixarSeguro(site, { maxBytes: HTML_MAX_LIDO, aceitar: 'text/html', timeoutMs: 10_000, truncar: true });
  if (!pagina.ok || !/html/i.test(pagina.tipo ?? '')) {
    avisos.push(`O site não abriu (${pagina.ok ? 'não é HTML' : pagina.motivo}).`);
    return vazio();
  }
  const html = pagina.dados.toString('utf8');
  const urlFinal = pagina.urlFinal;
  if (pagina.truncado) avisos.push('A página é grande; li só o começo dela (o cabeçalho e o logotipo ficam lá).');

  /* BOARD-VISUAL-009: redirecionou para OUTRO domínio — os dados são
     desse outro, e isso tem de ser dito, não atribuído em silêncio. */
  const redirecionouPara = mudouDeDominio(site, urlFinal) ? dominioBase(urlFinal) : null;
  if (redirecionouPara) {
    avisos.push(`${dominioBase(site)} redireciona para ${redirecionouPara}: os dados abaixo são de ${redirecionouPara}.`);
  }

  const folhas: { url: string; css: string }[] = [];
  for (const url of folhasDeEstilo(html, urlFinal)) {
    const r = await baixarSeguro(url, { maxBytes: CSS_MAX, aceitar: 'text/css', timeoutMs: 8_000 });
    if (r.ok) folhas.push({ url, css: r.dados.toString('utf8') });
  }

  /* BOARD-VISUAL-006: o logotipo DESTA marca, pelos sinais do dado real.
     Os tokens da marca vêm do domínio PEDIDO: na Kangu, "kangu" — e é
     por isso que o logo do Mercado Livre não é tomado por ela. */
  /* Redirecionou para outro domínio: NENHUM logotipo é atribuído — o
     que está lá é de outra marca (o ícone do Mercado Livre, na Kangu). */
  const candidatos = redirecionouPara ? [] : logosDaMarca(html, site, nomesDaMarca);
  const svgs: string[] = [];
  let logoSvg: string | null = null;
  let logo: { url: string; formato: string } | null = null;
  let logoBytes: Buffer | null = null;

  for (const c of candidatos.slice(0, TENTATIVAS_DE_LOGO)) {
    if (c.tipo === 'svg-embutido' && c.svg) {
      svgs.push(c.svg);
      logoSvg ??= c.svg;
      continue;
    }
    if (c.tipo === 'svg-url' && c.url) {
      const r = await baixarSeguro(c.url, { maxBytes: SVG_MAX, aceitar: 'image/svg+xml', timeoutMs: 8_000 });
      if (r.ok && /<svg\b/i.test(r.dados.toString('utf8'))) {
        const texto = r.dados.toString('utf8');
        svgs.push(texto);
        logoSvg ??= texto;
      }
      continue;
    }
    if (c.tipo === 'imagem' && c.url && !logo) {
      const img = await baixarSeguro(c.url, { maxBytes: IMAGEM_TAMANHO_MAXIMO, aceitar: 'image/*', timeoutMs: 8_000 });
      if (!img.ok || img.dados.byteLength < LOGO_MIN_BYTES) continue;
      const formato = formatoPelosBytes(img.dados);
      if (!formato) continue;
      logo = { url: c.url, formato };
      logoBytes = img.dados;
    }
  }
  if (redirecionouPara) avisos.push('Nenhum logotipo foi atribuído: o site levou a outra marca.');
  else if (!logo && !logoSvg) avisos.push('Não achei o logotipo desta marca na página inicial.');
  if (!folhas.length && !/<style/i.test(html)) avisos.push('Não consegui ler o CSS do site; cores e fontes podem estar incompletas.');

  return {
    /* O endereço vai na primeira linha: é por ele que a folha de
       framework é reconhecida (ehFolhaDeFramework), igual às fixtures. */
    ...montarEvidencia({ site: urlFinal, html, folhas: folhas.map((f) => `/* ${f.url} */\n${f.css}`), svgs, logo, avisos, redirecionouPara }),
    logoBytes,
    logoSvg,
    candidatos,
    bruto: { html, folhas },
  };
}
