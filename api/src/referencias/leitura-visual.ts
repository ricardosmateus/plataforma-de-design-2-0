/* ============================================================
   Leitura visual de um site — cores, fontes e logotipo (PURO)
   ============================================================
   Regras: board-lista.md, BOARD-VISUAL-001 a 005
   Plano:  planejamento-jev-board.md §1.2, subfase 1b-1

   A pesquisa busca e lê TEXTO, e não tinha como olhar uma marca: no
   caso de 30/09/2026 ("Logotipos atuais das logtechs brasileiras")
   ela no máximo repetiria o que alguém escreveu sobre eles. Aqui se
   lê o que o PRÓPRIO SITE declara — `theme-color`, variáveis e cores
   do CSS, `font-family`, Google Fonts, e as cores de um logotipo SVG.

   Isto é a EVIDÊNCIA contra a qual a análise do Claude e a conferência
   do JEV são feitas (subfases 1b-2 e 1b-3). Por isso é código e não
   IA: um dado extraído por modelo precisaria ele mesmo de conferência.

   Nenhuma rede aqui. Quem baixa é `leitura-visual-rede.ts`, com as
   travas de `rede/baixar.ts`.
   ============================================================ */

export type OrigemCor = 'theme-color' | 'variavel' | 'css' | 'svg';
export type Cor = { hex: string; vezes: number; origens: OrigemCor[]; neutra: boolean };
export type OrigemFonte = 'google-fonts' | 'font-face' | 'css';
export type Fonte = { familia: string; vezes: number; origens: OrigemFonte[]; sistema: boolean };

export const CORES_MAX = 12;
export const FONTES_MAX = 6;
export const FOLHAS_MAX = 3;

/* ---------- Cor ---------- */

function doisDigitos(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** `#abc`, `#aabbcc`, `#aabbccdd` (o alfa é ignorado), `rgb()`/`rgba()`
 *  com vírgulas ou espaços. Nome de cor ("red") fica de fora de
 *  propósito: marca não se declara por nome, e "white" em todo site
 *  só encheria a lista. */
export function normalizarCor(valor: string): string | null {
  const v = valor.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,4})$/);
  if (m) {
    const [r, g, b] = (m[1] as string).split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return `#${m[1]}`;
  m = v.match(/^rgba?\(\s*(\d{1,3}(?:\.\d+)?)[\s,]+(\d{1,3}(?:\.\d+)?)[\s,]+(\d{1,3}(?:\.\d+)?)/);
  if (m) return `#${doisDigitos(Number(m[1]))}${doisDigitos(Number(m[2]))}${doisDigitos(Number(m[3]))}`;
  return null;
}

/** Cinza, branco e preto: presentes em todo site, não dizem nada da
 *  marca. Continuam na lista (o JEV pode precisar conferir "fundo
 *  branco"), mas depois das cores de verdade. */
export function corNeutra(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

const COR_NO_CSS = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

type Contagem<O> = Map<string, { vezes: number; origens: Set<O> }>;
function contar<O>(mapa: Contagem<O>, chave: string, origem: O, peso = 1): void {
  const atual = mapa.get(chave) ?? { vezes: 0, origens: new Set<O>() };
  atual.vezes += peso;
  atual.origens.add(origem);
  mapa.set(chave, atual);
}

export function coresDoCss(css: string, mapa: Contagem<OrigemCor> = new Map()): Contagem<OrigemCor> {
  const texto = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  /* Variável que guarda cor: é assim que os sites modernos declaram a
     paleta (`--primary: #1a73e8`). Pesa mais que uma ocorrência solta. */
  for (const m of texto.matchAll(/--[\w-]+\s*:\s*([^;}{]+)/g)) {
    for (const c of (m[1] as string).match(COR_NO_CSS) ?? []) {
      const hex = normalizarCor(c);
      if (hex) contar(mapa, hex, 'variavel', 3);
    }
  }
  for (const m of texto.matchAll(/(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-color)?|fill|stroke|outline-color)\s*:\s*([^;}{]+)/gi)) {
    for (const c of (m[1] as string).match(COR_NO_CSS) ?? []) {
      const hex = normalizarCor(c);
      if (hex) contar(mapa, hex, 'css');
    }
  }
  return mapa;
}

export function coresDoSvg(svg: string): string[] {
  const achadas = new Set<string>();
  for (const m of String(svg ?? '').matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) {
    const hex = normalizarCor(m[1] as string);
    if (hex) achadas.add(hex);
  }
  return [...achadas];
}

/* ---------- Fonte ---------- */

const FONTES_DE_SISTEMA = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica', 'helvetica neue', 'arial', 'apple color emoji',
  'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'inherit', 'initial', 'unset', 'revert',
]);

function limparFamilia(f: string): string {
  return f.trim().replace(/^["']|["']$/g, '').trim();
}

export function fontesDoCss(css: string, mapa: Contagem<OrigemFonte> = new Map()): Contagem<OrigemFonte> {
  const texto = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  /* @font-face declara a fonte que o site CARREGA — sinal mais forte
     que uma pilha de fallback. */
  for (const bloco of texto.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const m = (bloco[1] as string).match(/font-family\s*:\s*([^;]+)/i);
    if (m) {
      const f = limparFamilia(m[1] as string);
      if (f) contar(mapa, f, 'font-face', 2);
    }
  }
  const semFontFace = texto.replace(/@font-face\s*{[^}]*}/gi, '');
  for (const m of semFontFace.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    /* Só a PRIMEIRA da pilha: as outras são o que aparece se ela falhar. */
    const primeira = limparFamilia(((m[1] as string).split(',')[0]) ?? '');
    if (primeira && !primeira.startsWith('var(')) contar(mapa, primeira, 'css');
  }
  return mapa;
}

export function fontesDoGoogle(html: string): string[] {
  const achadas = new Set<string>();
  for (const m of String(html ?? '').matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    const consulta = (m[1] as string).replace(/&amp;/g, '&');
    for (const par of consulta.split('&')) {
      const [chave, valor] = par.split('=');
      if (chave !== 'family' || !valor) continue;
      for (const fam of decodeURIComponent(valor.replace(/\+/g, ' ')).split('|')) {
        const nome = (fam.split(':')[0] ?? '').trim();
        if (nome) achadas.add(nome);
      }
    }
  }
  return [...achadas];
}

/* ---------- HTML ---------- */

function atributo(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
}

export function themeColor(html: string): string | null {
  for (const m of String(html ?? '').matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const nome = (atributo(tag, 'name') ?? '').toLowerCase();
    if (nome === 'theme-color' || nome === 'msapplication-tilecolor') {
      const hex = normalizarCor(atributo(tag, 'content') ?? '');
      if (hex) return hex;
    }
  }
  return null;
}

export function cssEmbutido(html: string): string {
  const partes: string[] = [];
  for (const m of String(html ?? '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) partes.push(m[1] as string);
  for (const m of String(html ?? '').matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) partes.push(`x{${m[1]}}`);
  return partes.join('\n');
}

/** As folhas de estilo da página, na ordem em que aparecem, até
 *  FOLHAS_MAX. Só http(s): `data:` e caminho estranho ficam de fora. */
export function folhasDeEstilo(html: string, paginaUrl: string): string[] {
  const base = (() => { try { return new URL(paginaUrl); } catch { return null; } })();
  if (!base) return [];
  const saida: string[] = [];
  for (const m of String(html ?? '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (atributo(tag, 'rel') ?? '').toLowerCase();
    const comoEstilo = rel.split(/\s+/).includes('stylesheet') || ((atributo(tag, 'as') ?? '').toLowerCase() === 'style');
    const href = atributo(tag, 'href');
    if (!comoEstilo || !href || /fonts\.googleapis\.com/i.test(href)) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, '&'), base);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !saida.includes(u.href)) saida.push(u.href);
    } catch { /* href inválido */ }
    if (saida.length >= FOLHAS_MAX) break;
  }
  return saida;
}

/** O logotipo em SVG: `<svg>` embutido cujo class/id/aria-label fala
 *  em logo, ou `<img src="….svg">` com logo no src/alt/class. O SVG não
 *  vai à análise com visão (a API aceita PNG, JPEG, GIF e WEBP), mas
 *  as cores DELE são a melhor evidência que existe da marca. */
export function svgsDeLogo(html: string, paginaUrl: string): { embutidos: string[]; enderecos: string[] } {
  const embutidos: string[] = [];
  for (const m of String(html ?? '').matchAll(/<svg\b([^>]*)>[\s\S]*?<\/svg>/gi)) {
    if (/logo|marca|brand/i.test(m[1] as string)) embutidos.push(m[0]);
    if (embutidos.length >= 2) break;
  }
  const enderecos: string[] = [];
  const base = (() => { try { return new URL(paginaUrl); } catch { return null; } })();
  for (const m of String(html ?? '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = atributo(tag, 'src') ?? '';
    if (!/\.svg(\?|#|$)/i.test(src)) continue;
    const pista = `${src} ${atributo(tag, 'alt') ?? ''} ${atributo(tag, 'class') ?? ''} ${atributo(tag, 'id') ?? ''}`;
    if (!/logo|marca|brand/i.test(pista) || !base) continue;
    try { enderecos.push(new URL(src, base).href); } catch { /* src inválido */ }
    if (enderecos.length >= 2) break;
  }
  return { embutidos, enderecos };
}

/* ---------- A evidência ---------- */

export type EvidenciaVisual = {
  site: string;
  lidoEm: string;
  cores: Cor[];
  fontes: Fonte[];
  coresDoLogo: string[];
  logo: { url: string; formato: string } | null;
  avisos: string[];
};

/**
 * Junta tudo numa lista ordenada. Cores: `theme-color` primeiro, depois
 * as do logotipo SVG, depois por peso (variáveis pesam 3), neutras por
 * último. Fontes: carregadas (Google, @font-face) antes das de pilha,
 * as de sistema por último.
 */
export function montarEvidencia(e: {
  site: string;
  html: string;
  folhas: string[];
  svgs: string[];
  logo: { url: string; formato: string } | null;
  avisos?: string[];
  agora?: Date;
}): EvidenciaVisual {
  const cores: Contagem<OrigemCor> = new Map();
  const tema = themeColor(e.html);
  if (tema) contar(cores, tema, 'theme-color', 10);
  const coresDoLogo = [...new Set(e.svgs.flatMap(coresDoSvg))];
  for (const c of coresDoLogo) contar(cores, c, 'svg', 5);
  coresDoCss(cssEmbutido(e.html), cores);
  for (const f of e.folhas) coresDoCss(f, cores);

  const fontes: Contagem<OrigemFonte> = new Map();
  for (const f of fontesDoGoogle(e.html)) contar(fontes, f, 'google-fonts', 5);
  fontesDoCss(cssEmbutido(e.html), fontes);
  for (const f of e.folhas) fontesDoCss(f, fontes);

  const listaCores: Cor[] = [...cores.entries()]
    .map(([hex, v]) => ({ hex, vezes: v.vezes, origens: [...v.origens], neutra: corNeutra(hex) }))
    .sort((a, b) => Number(a.neutra) - Number(b.neutra) || b.vezes - a.vezes)
    .slice(0, CORES_MAX);

  /* A mesma família escrita com caixa diferente ("Inter" e "inter") é
     uma fonte só. */
  const porNome = new Map<string, { familia: string; vezes: number; origens: Set<OrigemFonte> }>();
  for (const [familia, v] of fontes) {
    const chave = familia.toLowerCase();
    const atual = porNome.get(chave);
    if (atual) { atual.vezes += v.vezes; v.origens.forEach((o) => atual.origens.add(o)); }
    else porNome.set(chave, { familia, vezes: v.vezes, origens: new Set(v.origens) });
  }
  const listaFontes: Fonte[] = [...porNome.values()]
    .map((v) => ({ familia: v.familia, vezes: v.vezes, origens: [...v.origens], sistema: FONTES_DE_SISTEMA.has(v.familia.toLowerCase()) }))
    .sort((a, b) => Number(a.sistema) - Number(b.sistema) || b.vezes - a.vezes)
    .slice(0, FONTES_MAX);

  return {
    site: e.site,
    lidoEm: (e.agora ?? new Date()).toISOString(),
    cores: listaCores,
    fontes: listaFontes,
    coresDoLogo,
    logo: e.logo,
    avisos: e.avisos ?? [],
  };
}
