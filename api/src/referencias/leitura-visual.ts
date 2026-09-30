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
  /* 36, e não 24: no dado real, #bec7d6 e #9fabbb (cinzas azulados
     da Loggi) passavam como cor da marca. */
  return Math.max(r, g, b) - Math.min(r, g, b) < 36;
}

const COR_NO_CSS = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/* BOARD-VISUAL-007: cores que vêm de FRAMEWORK ou de ícone de rede
   social, e não da marca. Vistas no dado real: a Jadlog tinha as dez
   primeiras posições tomadas pelo Bootstrap 3; a Loggi, o azul do
   Twitter. Só saem quando aparecem apenas no CSS — se a marca as
   declarar como `theme-color` ou no próprio logotipo, ficam. */
/* BOARD-VISUAL-007: a folha de estilo INTEIRA de um framework, tema
   genérico ou plugin não diz nada da marca. Reconhecida pelo começo do
   arquivo — o endereço vai na primeira linha como comentário, que é
   como `leitura-visual-rede.ts` e as fixtures a entregam. No dado real:
   Bootstrap 3 (Jadlog), Contact Form 7 (Intelipost, as cores de aviso
   #dc3232 e #46b450), hello-elementor e kk-star-ratings (Mandaê). */
const FOLHA_DE_FRAMEWORK = /bootstrap|getbootstrap|\/wp-includes\/|\/wp-content\/plugins\/|\/wp-content\/themes\/hello-|font-?awesome|jquery-?ui|swiper|slick|normalize\.css|animate\.css|cookie-?consent/i;
export function ehFolhaDeFramework(css: string): boolean {
  /* Só o ENDEREÇO e o COMENTÁRIO DE CABEÇALHO — nunca os seletores.
     A primeira versão olhava os 400 primeiros caracteres, e o CSS da
     PRÓPRIA Jadlog (`main.min.css`) começa com `#cookieConsent`: foi
     descartado inteiro, com a fonte e as cores dele. Pego pela
     contraprova, não por um teste. */
  const cabecalho = (String(css ?? '').match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)+/) ?? [''])[0];
  return FOLHA_DE_FRAMEWORK.test(cabecalho);
}

export const CORES_DE_FRAMEWORK = new Set([
  // Bootstrap 3
  '#337ab7', '#286090', '#204d74', '#23527c', '#2e6da4', '#122b40', '#5cb85c', '#449d44', '#398439', '#4cae4c',
  '#5bc0de', '#31b0d5', '#269abc', '#46b8da', '#f0ad4e', '#ec971f', '#d58512', '#eea236', '#d9534f', '#c9302c',
  '#ac2925', '#d43f3a', '#3c763d', '#dff0d8', '#d6e9c6', '#2b542c', '#31708f', '#d9edf7', '#bce8f1', '#245269',
  '#8a6d3b', '#fcf8e3', '#faebcc', '#66512c', '#a94442', '#f2dede', '#ebccd1', '#843534',
  // Bootstrap 4 e 5
  '#007bff', '#6c757d', '#28a745', '#17a2b8', '#ffc107', '#dc3545', '#343a40', '#0d6efd', '#6610f2', '#6f42c1',
  '#d63384', '#fd7e14', '#198754', '#20c997', '#0dcaf0',
  // redes sociais
  '#1da1f2', '#1877f2', '#3b5998', '#0077b5', '#0a66c2', '#e4405f', '#c13584', '#25d366', '#ff0000', '#bd081c',
]);

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
  for (const m of texto.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+)/g)) {
    /* BOARD-VISUAL-007: a paleta de exemplo do WordPress
       (`--wp--preset--color--vivid-red`…) está em todo site feito nele,
       e foi 100% das cores lidas da Mandaê. */
    /* E as do Tailwind (`--tw-ring-color` é #3b82f6 em todo site feito
       com ele — era a 5ª "cor" da Loggi). */
    if (/^--(wp--preset--|tw-)/.test(m[1] as string)) continue;
    for (const c of (m[2] as string).match(COR_NO_CSS) ?? []) {
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
  'courier', 'courier new', 'menlo', 'monaco', 'consolas', 'sf mono', 'liberation mono', 'times', 'times new roman', 'georgia',
]);

/* BOARD-VISUAL-008, do dado real: `fonteTitulo!important` (Jadlog) e
   `IBM Plex Sans"!important` (Intelipost) saíam como fontes. */
function limparFamilia(f: string): string {
  return f.replace(/\s*!\s*important\s*$/i, '').trim().replace(/^["']+|["']+$/g, '').trim();
}

/* "Montserrat Fallback" é o nome que o Next.js dá à fonte de reserva
   que ele gera — é a mesma Montserrat. */
function semSufixoDeReserva(f: string): string {
  return f.replace(/\s+fallback$/i, '');
}

/* Fonte de ÍCONES não é tipografia da marca (Glyphicons, no dado real). */
const FONTE_DE_ICONES = /glyphicons|font\s*awesome|fontawesome|icomoon|material\s*(icons|symbols)|dashicons|eicons|swiper-icons|slick|feather/i;

/* O @font-face dá APELIDO à fonte (`fonteTitulo`, na Jadlog) e o nome
   do arquivo diz qual ela é (`PlutoSansDPDLight.ttf`). Só vale quando
   o arquivo tem cara de nome: hash de build (`a34f9d1f…`) não é. */
export function nomeDaFonteNoArquivo(src: string): string | null {
  const m = src.match(/url\(\s*["']?([^"')?#]+)/i);
  if (!m) return null;
  let nome = decodeURIComponent((m[1] as string).split('/').pop() ?? '').replace(/\.(woff2?|ttf|otf|eot|svg)$/i, '');
  if (!/[a-z]{3}/i.test(nome) || /^[0-9a-f_-]{8,}$/i.test(nome) || /\d{3,}/.test(nome)) return null;
  nome = nome
    .replace(/[-_](regular|light|bold|medium|semibold|extrabold|black|thin|italic|book|heavy|\d{3})+$/i, '')
    .replace(/(Regular|ExtraLight|Light|ExtraBold|SemiBold|Bold|Medium|Black|Thin|Italic|Book|Heavy|Extra)+$/, '');
  nome = nome.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  /* Só letras: no dado real, `2fb5d94d8dca0cc5-s.p.woff2` (Loggi) e
     `S6uyw4BMUTPHjx4wXg.woff2` (Google, Melhor Envio) viravam "fontes". */
  return nome.length >= 3 && /^[A-Za-z]+( [A-Za-z]+)*$/.test(nome) ? nome : null;
}

export function fontesDoCss(css: string, mapa: Contagem<OrigemFonte> = new Map()): Contagem<OrigemFonte> {
  const texto = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  /* @font-face declara a fonte que o site CARREGA — sinal mais forte
     que uma pilha de fallback. */
  /* Apelido → nome do arquivo, para as declarações abaixo contarem
     na fonte de verdade. */
  const apelidos = new Map<string, string>();
  for (const bloco of texto.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const m = (bloco[1] as string).match(/font-family\s*:\s*([^;]+)/i);
    if (!m) continue;
    const declarada = semSufixoDeReserva(limparFamilia(m[1] as string));
    if (!declarada || FONTE_DE_ICONES.test(declarada)) continue;
    const src = (bloco[1] as string).match(/src\s*:\s*([^;]+)/i);
    const doArquivo = src ? nomeDaFonteNoArquivo(src[1] as string) : null;
    const semEspaco = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    const real = doArquivo && !semEspaco(doArquivo).includes(semEspaco(declarada)) && !semEspaco(declarada).includes(semEspaco(doArquivo))
      ? doArquivo
      : declarada;
    if (real !== declarada) apelidos.set(declarada.toLowerCase(), real);
    contar(mapa, real, 'font-face', 2);
  }
  const semFontFace = texto.replace(/@font-face\s*{[^}]*}/gi, '');
  for (const m of semFontFace.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    /* Só a PRIMEIRA da pilha: as outras são o que aparece se ela falhar. */
    let primeira = semSufixoDeReserva(limparFamilia(((m[1] as string).split(',')[0]) ?? ''));
    if (!primeira || primeira.startsWith('var(') || FONTE_DE_ICONES.test(primeira)) continue;
    primeira = apelidos.get(primeira.toLowerCase()) ?? primeira;
    contar(mapa, primeira, 'css');
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
  /* BOARD-VISUAL-009: o site pedido levou a OUTRO domínio (kangu.com.br
     → mercadolivre.com.br, no dado real). Os dados são desse outro. */
  redirecionouPara: string | null;
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
  redirecionouPara?: string | null;
}): EvidenciaVisual {
  const cores: Contagem<OrigemCor> = new Map();
  const tema = themeColor(e.html);
  if (tema) contar(cores, tema, 'theme-color', 10);
  const coresDoLogo = [...new Set(e.svgs.flatMap(coresDoSvg))];
  for (const c of coresDoLogo) contar(cores, c, 'svg', 5);
  const folhasDaMarca = e.folhas.filter((f) => !ehFolhaDeFramework(f));
  coresDoCss(cssEmbutido(e.html), cores);
  for (const f of folhasDaMarca) coresDoCss(f, cores);

  const fontes: Contagem<OrigemFonte> = new Map();
  for (const f of fontesDoGoogle(e.html)) contar(fontes, f, 'google-fonts', 5);
  /* TODO o CSS de uma vez: o apelido do @font-face pode ser declarado
     num <style> da página e usado noutra folha (Jadlog, dado real). */
  fontesDoCss([cssEmbutido(e.html), ...folhasDaMarca].join('\n'), fontes);

  const listaCores: Cor[] = [...cores.entries()]
    .filter(([hex, v]) => !(CORES_DE_FRAMEWORK.has(hex) && !v.origens.has('theme-color') && !v.origens.has('svg')))
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
    redirecionouPara: e.redirecionouPara ?? null,
    lidoEm: (e.agora ?? new Date()).toISOString(),
    cores: listaCores,
    fontes: listaFontes,
    coresDoLogo,
    logo: e.logo,
    avisos: e.avisos ?? [],
  };
}

/* ============================================================
   Qual é o logotipo DESTA marca — BOARD-VISUAL-006
   ============================================================
   Nasceu do dado real (30/09/2026, `scripts/ler-sites.ts` em 8 sites).
   `candidatosDeLogo` (Referência) pega o primeiro <img> com "logo" no
   nome — e em sites reais isso é, muitas vezes, o logo de OUTRA marca:
   a faixa "Logos-Parceiros" da Loggi, o "logo-leroy" no carrossel de
   clientes da Intelipost. E o logotipo de verdade da Loggi nem é <img>:
   é um <svg> dentro do link para a página inicial.

   Os sinais que o dado real mostrou, em ordem de força:
     · o NOME DA MARCA no src/alt/title (logo-Intelipost.svg, "Logo Mandaê");
     · estar dentro do LINK PARA A PÁGINA INICIAL (o padrão universal);
     · estar no <header>/<nav>;
     · "logo" no nome.
   E o sinal contrário: carrossel, parceiros, clientes, integrações.
   Só entra quem tem a marca no nome OU está no link da página inicial:
   um "logo" qualquer, sem nenhum dos dois, é de outra marca até prova
   em contrário.
   ============================================================ */

export type CandidatoLogo = {
  tipo: 'imagem' | 'svg-url' | 'svg-embutido';
  url: string | null;
  svg: string | null;
  pontos: number;
  motivos: string[];
};

export const PONTOS_MINIMOS_LOGO = 8;

function semAcentoMinusculo(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** "www.melhorenvio.com.br" → ["melhorenvio"]; mais os nomes informados. */
export function tokensDaMarca(paginaUrl: string, nomes: string[] = []): string[] {
  const saida = new Set<string>();
  try {
    const partes = new URL(paginaUrl).hostname.replace(/^www\./, '').split('.');
    const nome = partes[0];
    if (nome && nome.length >= 3) saida.add(nome);
  } catch { /* sem host */ }
  for (const n of nomes) {
    const t = semAcentoMinusculo(n).replace(/[^a-z0-9]/g, '');
    if (t.length >= 3) saida.add(t);
  }
  return [...saida];
}

/** kangu.com.br → mercadolivre.com.br é outro domínio; www.x.com → x.com não é. */
export function dominioBase(url: string): string | null {
  try {
    const partes = new URL(url).hostname.toLowerCase().replace(/^www\./, '').split('.');
    const n = partes.length;
    const segundoNivel = ['com', 'net', 'org', 'gov', 'edu', 'co', 'art'];
    if (n >= 3 && (partes[n - 1] as string).length === 2 && segundoNivel.includes(partes[n - 2] as string)) {
      return partes.slice(-3).join('.');
    }
    return partes.slice(-2).join('.');
  } catch { return null; }
}

export function mudouDeDominio(pedido: string, final: string): boolean {
  const a = dominioBase(pedido);
  const b = dominioBase(final);
  return !!a && !!b && a !== b;
}

function trechos(html: string, tag: string): Array<[number, number]> {
  const saida: Array<[number, number]> = [];
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
  for (const m of html.matchAll(re)) saida.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return saida;
}
function dentro(pos: number, faixas: Array<[number, number]>): boolean {
  return faixas.some(([a, b]) => pos >= a && pos <= b);
}

/** O elemento está dentro de um <a> que aponta para a página inicial? */
function noLinkDaPaginaInicial(html: string, pos: number, base: URL): boolean {
  const antes = html.slice(Math.max(0, pos - 1500), pos);
  const abre = antes.lastIndexOf('<a ');
  if (abre < 0 || antes.indexOf('</a>', abre) >= 0) return false;
  const href = atributo(antes.slice(abre, antes.indexOf('>', abre) + 1), 'href');
  if (href === null) return false;
  try {
    const u = new URL(href, base);
    return u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '') && /^\/?(index\.\w+)?$/.test(u.pathname) && !u.search;
  } catch { return false; }
}

const PISTA_DE_OUTRA_MARCA = /swiper|slide|carousel|carrossel|parceir|partner|client|integra|depoiment|testimonial|case-|cases|marquee|patrocin|sponsor/i;

/** De `/_next/image?url=ENDERECO&w=…`, o endereço real — é ele que tem o nome do arquivo. */
function enderecoReal(src: string): string {
  const m = src.match(/[?&]url=([^&]+)/);
  if (!m) return src;
  try { return decodeURIComponent(m[1] as string); } catch { return src; }
}

export function logosDaMarca(html: string, paginaUrl: string, nomes: string[] = []): CandidatoLogo[] {
  const base = (() => { try { return new URL(paginaUrl); } catch { return null; } })();
  if (!base || !html) return [];
  const tokens = tokensDaMarca(paginaUrl, nomes);
  const cabecalho = [...trechos(html, 'header'), ...trechos(html, 'nav')];
  const rodape = trechos(html, 'footer');
  const saida: CandidatoLogo[] = [];

  function pontuar(pos: number, texto: string, contexto: string): { pontos: number; motivos: string[] } {
    const motivos: string[] = [];
    let pontos = 0;
    const norm = semAcentoMinusculo(texto).replace(/[^a-z0-9]/g, '');
    if (tokens.some((t) => norm.includes(t))) { pontos += 10; motivos.push('nome da marca'); }
    if (noLinkDaPaginaInicial(html, pos, base!)) { pontos += 8; motivos.push('link da página inicial'); }
    if (dentro(pos, cabecalho)) { pontos += 4; motivos.push('cabeçalho'); }
    if (/logo|marca|brand/i.test(texto)) { pontos += 3; motivos.push('"logo" no nome'); }
    if (pos < html.length * 0.25) { pontos += 2; motivos.push('começo da página'); }
    if (dentro(pos, rodape)) { pontos -= 4; motivos.push('rodapé'); }
    if (PISTA_DE_OUTRA_MARCA.test(texto) || PISTA_DE_OUTRA_MARCA.test(contexto)) { pontos -= 10; motivos.push('carrossel, parceiros ou clientes'); }
    return { pontos, motivos };
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const pos = m.index ?? 0;
    let src = atributo(tag, 'src') ?? '';
    if (!src || src.startsWith('data:')) src = atributo(tag, 'data-lazy-src') ?? atributo(tag, 'data-src') ?? '';
    if (!src || src.startsWith('data:')) {
      const srcset = atributo(tag, 'srcset') ?? atributo(tag, 'srcSet') ?? '';
      src = (srcset.split(',')[0] ?? '').trim().split(/\s+/)[0] ?? '';
    }
    if (!src || src.startsWith('data:')) continue;
    const real = enderecoReal(src.replace(/&amp;/g, '&'));
    /* Só o NOME DO ARQUIVO, não o endereço inteiro: no dado real,
       `intelipost.com.br/…/Amazon-Logo.png` contava como da Intelipost
       porque o domínio tem o nome dela. */
    const arquivo = (real.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
    const texto = [arquivo, atributo(tag, 'alt'), atributo(tag, 'title'), atributo(tag, 'class'), atributo(tag, 'id')].join(' ');
    const { pontos, motivos } = pontuar(pos, texto, tag);
    if (pontos < PONTOS_MINIMOS_LOGO || !/nome da marca|link da página inicial/.test(motivos.join())) continue;
    /* BOARD-VISUAL-011: o nome da marca SOZINHO não faz de uma imagem o
       logotipo. No dado real, `Image-from-Loggi.webp` e
       `Despacho-Intelipost-1.jpg` são FOTOS — e iam para a análise com
       visão como se fossem a marca. Precisa também de "logo" no nome ou
       de estar no link da página inicial. */
    if (!motivos.includes('"logo" no nome') && !motivos.includes('link da página inicial')) continue;
    let url: string | null = null;
    try { url = new URL(src.replace(/&amp;/g, '&'), base).href; } catch { continue; }
    saida.push({ tipo: /\.svg(\?|#|$)/i.test(real) ? 'svg-url' : 'imagem', url, svg: null, pontos, motivos });
  }

  for (const m of html.matchAll(/<svg\b([^>]*)>[\s\S]*?<\/svg>/gi)) {
    const pos = m.index ?? 0;
    const atributos = m[1] as string;
    const texto = [atributos, (m[0].match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? ''].join(' ');
    const { pontos, motivos } = pontuar(pos, texto, atributos);
    if (pontos < PONTOS_MINIMOS_LOGO || !/nome da marca|link da página inicial/.test(motivos.join())) continue;
    saida.push({ tipo: 'svg-embutido', url: null, svg: m[0], pontos, motivos });
  }

  /* O ícone que o PRÓPRIO SITE declara (`apple-touch-icon`, ícone PNG)
     é quase sempre a marca. Entra no mínimo aceito: só vence quando
     nada com o nome da marca foi achado. */
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (atributo(tag, 'rel') ?? '').toLowerCase();
    if (!/apple-touch-icon|(^|\s)icon(\s|$)/.test(rel)) continue;
    const href = atributo(tag, 'href');
    if (!href || href.startsWith('data:')) continue;
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), base).href;
      const svg = /\.svg(\?|#|$)/i.test(url);
      if (!svg && /\.ico(\?|#|$)/i.test(url)) continue; // .ico não é PNG/JPEG/WEBP
      saida.push({ tipo: svg ? 'svg-url' : 'imagem', url, svg: null, pontos: PONTOS_MINIMOS_LOGO + (/apple/.test(rel) ? 1 : 0), motivos: ['ícone declarado pelo site'] });
    } catch { /* href inválido */ }
  }

  /* Mesma imagem em dois lugares (versão mobile e desktop) conta uma vez. */
  const vistos = new Set<string>();
  return saida
    .sort((a, b) => b.pontos - a.pontos)
    .filter((c) => {
      const chave = c.url ?? (c.svg ?? '').slice(0, 200);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}
