/* ============================================================
   Onde está o logotipo de um site — BOARD-REF-009
   ============================================================
   Puro: recebe o HTML da página inicial e devolve, em ordem de
   preferência, os endereços que provavelmente são o logotipo. Quem
   baixa e confere os bytes é a rota; aqui só se lê texto.

   A ordem é o que se aprende abrindo sites de verdade:
     1. <img> cujo src, alt, class ou id fala em "logo" — é o
        logotipo do cabeçalho na maioria dos sites;
     2. apple-touch-icon — quase sempre a marca, quadrada, 180px;
     3. <link rel="icon"> em PNG com tamanho declarado;
     4. og:image — às vezes é a marca, às vezes um banner. Por
        último por isso.
   SVG fica de fora em todos: o armazenamento de referências não
   aceita SVG (BOARD-REF-003), então nem vale a pena baixar.
   ============================================================ */

export const HTML_MAX_LIDO = 600_000; // o <head> e o cabeçalho cabem com folga

function atributos(tag: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    const nome = (m[1] as string).toLowerCase();
    if (!(nome in saida)) saida[nome] = (m[3] ?? m[4] ?? m[5] ?? '').trim();
  }
  return saida;
}

function decodificar(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"');
}

function absoluta(href: string, base: URL): string | null {
  if (!href || href.startsWith('data:') || href.startsWith('javascript:')) return null;
  try {
    const u = new URL(decodificar(href), base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (/\.svg(\?|#|$)/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function maiorLado(sizes: string | undefined): number {
  if (!sizes) return 0;
  let maior = 0;
  for (const s of sizes.split(/\s+/)) {
    const m = /^(\d+)x(\d+)$/i.exec(s);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior;
}

export function candidatosDeLogo(html: string, paginaUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(paginaUrl);
  } catch {
    return [];
  }
  const texto = html.slice(0, HTML_MAX_LIDO);

  /* <base href> muda a resolução dos relativos. */
  const tagBase = /<base\b[^>]*>/i.exec(texto);
  if (tagBase) {
    const b = absoluta(atributos(tagBase[0]).href ?? '', base);
    if (b) base = new URL(b);
  }

  const imgs: string[] = [];
  for (const m of texto.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const src = a.src || a['data-src'] || '';
    const pista = [src, a.alt, a.class, a.id].join(' ');
    if (!/logo|marca|brand/i.test(pista)) continue;
    const u = absoluta(src, base);
    if (u) imgs.push(u);
  }

  const toque: Array<{ url: string; lado: number }> = [];
  const icones: Array<{ url: string; lado: number }> = [];
  let og: string | null = null;

  for (const m of texto.matchAll(/<link\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const rel = (a.rel ?? '').toLowerCase();
    const u = absoluta(a.href ?? '', base);
    if (!u) continue;
    if (rel.includes('apple-touch-icon')) toque.push({ url: u, lado: maiorLado(a.sizes) || 180 });
    else if (/\bicon\b/.test(rel) && /\.png(\?|#|$)/i.test(u)) {
      const lado = maiorLado(a.sizes);
      if (lado >= 64) icones.push({ url: u, lado });
    }
  }
  for (const m of texto.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const prop = (a.property ?? a.name ?? '').toLowerCase();
    if (prop === 'og:image' || prop === 'og:image:url') {
      og = og ?? absoluta(a.content ?? '', base);
    }
  }

  toque.sort((x, y) => y.lado - x.lado);
  icones.sort((x, y) => y.lado - x.lado);

  const ordem = [...imgs, ...toque.map((t) => t.url), ...icones.map((i) => i.url)];
  if (og) ordem.push(og);
  /* Sem nada declarado, o endereço convencional do ícone grande. */
  ordem.push(new URL('/apple-touch-icon.png', base).toString());

  return [...new Set(ordem)].slice(0, 6);
}
