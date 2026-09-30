/* BOARD-VISUAL-001 a 005 — leitura visual de um site (subfase 1b-1).

   ATENÇÃO: os trechos abaixo foram ESCRITOS nos padrões comuns de
   site (variáveis CSS, Google Fonts, SVG embutido no cabeçalho), não
   copiados de um site real — o ambiente em que foram escritos não
   alcança a web. `scripts/ler-sites.ts` salva HTML e CSS reais em
   testes/fixtures/sites/; os próximos testes devem nascer de lá. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarCor, corNeutra, coresDoCss, coresDoSvg, fontesDoCss, fontesDoGoogle,
  themeColor, folhasDeEstilo, svgsDeLogo, montarEvidencia, CORES_MAX, FOLHAS_MAX,
} from '../src/referencias/leitura-visual.js';

test('cor: hex curto, longo, com alfa e rgb viram o mesmo formato', () => {
  assert.equal(normalizarCor('#1AF'), '#11aaff');
  assert.equal(normalizarCor('#1A73E8'), '#1a73e8');
  assert.equal(normalizarCor('#1a73e8cc'), '#1a73e8');
  assert.equal(normalizarCor('rgb(26, 115, 232)'), '#1a73e8');
  assert.equal(normalizarCor('rgba(26 115 232 / .5)'), '#1a73e8');
  assert.equal(normalizarCor('red'), null, 'nome de cor não é marca');
});

test('neutras: branco, preto e cinza; azul não', () => {
  for (const h of ['#ffffff', '#000000', '#777777', '#f5f5f7']) assert.equal(corNeutra(h), true, h);
  assert.equal(corNeutra('#1a73e8'), false);
});

test('variável CSS pesa mais que ocorrência solta — é assim que a paleta é declarada', () => {
  const m = coresDoCss(':root{--cor-primaria:#00b2ff;--texto:#1d1d1f}.btn{background:#ff5a00;color:#fff}');
  assert.equal(m.get('#00b2ff')!.vezes, 3);
  assert.deepEqual([...m.get('#00b2ff')!.origens], ['variavel']);
  assert.equal(m.get('#ff5a00')!.vezes, 1);
  assert.ok(m.has('#ffffff'));
});

test('comentário de CSS não conta cor', () => {
  assert.equal(coresDoCss('/* color: #123456 */ a{color:#00b2ff}').has('#123456'), false);
});

test('SVG: fill, stroke e stop-color, em atributo ou em style', () => {
  const svg = '<svg><path fill="#00B2FF"/><path style="fill:#FF5A00"/><stop stop-color="#222"/></svg>';
  assert.deepEqual(coresDoSvg(svg).sort(), ['#00b2ff', '#222222', '#ff5a00']);
});

test('fontes: a primeira da pilha conta; @font-face pesa mais; var() fica de fora', () => {
  const m = fontesDoCss('@font-face{font-family:"Sora";src:url(x.woff2)} body{font-family:Inter, -apple-system, sans-serif} h1{font-family:var(--titulo)}');
  assert.equal(m.get('Sora')!.vezes, 2);
  assert.ok(m.has('Inter'));
  assert.equal(m.has('-apple-system'), false, 'só a primeira da pilha');
  assert.equal([...m.keys()].some((k) => k.startsWith('var(')), false);
});

test('Google Fonts: css e css2, várias famílias, espaço como +', () => {
  const html = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;family=Roboto+Mono&display=swap" rel="stylesheet">'
    + '<link href="https://fonts.googleapis.com/css?family=Montserrat:400,700|Open+Sans" rel="stylesheet">';
  assert.deepEqual(fontesDoGoogle(html).sort(), ['Inter', 'Montserrat', 'Open Sans', 'Roboto Mono']);
});

test('theme-color: a cor que o site declara para o navegador', () => {
  assert.equal(themeColor('<meta name="theme-color" content="#00B2FF">'), '#00b2ff');
  assert.equal(themeColor('<meta content="#FF5A00" name="msapplication-TileColor">'), '#ff5a00');
  assert.equal(themeColor('<meta name="description" content="#fff">'), null);
});

test('folhas de estilo: absolutas, sem Google Fonts, sem repetir, no máximo FOLHAS_MAX', () => {
  const html = ['/a.css', '/a.css', 'https://cdn.x.com/b.css', '/c.css', '/d.css'].map((h) => `<link rel="stylesheet" href="${h}">`).join('')
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">';
  const f = folhasDeEstilo(html, 'https://www.exemplo.com.br/');
  assert.equal(f.length, FOLHAS_MAX);
  assert.equal(f[0], 'https://www.exemplo.com.br/a.css');
  assert.equal(f.some((u) => u.includes('googleapis')), false);
});

test('logotipo SVG: embutido com "logo" na classe e <img src=".svg"> com logo no alt', () => {
  const html = '<header><svg class="header__logo" viewBox="0 0 10 10"><path fill="#00b2ff"/></svg><svg class="icone-busca"><path fill="#000"/></svg>'
    + '<img src="/static/marca.svg" alt="Logo da Empresa"><img src="/foto.svg" alt="Caminhão"></header>';
  const s = svgsDeLogo(html, 'https://www.exemplo.com.br/');
  assert.equal(s.embutidos.length, 1, 'só o que diz ser logo');
  assert.deepEqual(s.enderecos, ['https://www.exemplo.com.br/static/marca.svg']);
});

test('evidência: theme-color primeiro, cor do logotipo depois, neutras por último', () => {
  const e = montarEvidencia({
    site: 'https://www.exemplo.com.br/',
    html: '<meta name="theme-color" content="#ff5a00"><style>body{color:#111;background:#fff}.x{color:#6b21a8}</style>',
    folhas: [':root{--primaria:#00b2ff}'],
    svgs: ['<svg class="logo"><path fill="#00b2ff"/></svg>'],
    logo: null,
    agora: new Date('2026-09-30T12:00:00Z'),
  });
  assert.equal(e.cores[0]!.hex, '#ff5a00');
  assert.equal(e.cores[1]!.hex, '#00b2ff');
  assert.deepEqual(e.cores[1]!.origens.sort(), ['svg', 'variavel']);
  const primeiraNeutra = e.cores.findIndex((c) => c.neutra);
  assert.ok(e.cores.slice(primeiraNeutra).every((c) => c.neutra), 'neutra no meio das cores da marca');
  assert.deepEqual(e.coresDoLogo, ['#00b2ff']);
  assert.equal(e.lidoEm, '2026-09-30T12:00:00.000Z');
});

test('evidência: fonte carregada antes da de sistema; caixa diferente é a mesma fonte', () => {
  const e = montarEvidencia({
    site: 's', html: '<link href="https://fonts.googleapis.com/css2?family=Sora" rel="stylesheet">',
    folhas: ['body{font-family:Arial}', 'h1{font-family:"sora"}', 'p{font-family:Sora}'], svgs: [], logo: null,
  });
  assert.equal(e.fontes[0]!.familia.toLowerCase(), 'sora');
  assert.equal(e.fontes.filter((f) => f.familia.toLowerCase() === 'sora').length, 1);
  assert.equal(e.fontes[e.fontes.length - 1]!.sistema, true);
});

test('site que não abriu: evidência vazia, com o aviso — nada inventado', () => {
  const e = montarEvidencia({ site: 's', html: '', folhas: [], svgs: [], logo: null, avisos: ['O site não abriu.'] });
  assert.deepEqual(e.cores, []);
  assert.deepEqual(e.fontes, []);
  assert.deepEqual(e.avisos, ['O site não abriu.']);
});

test('tetos: no máximo CORES_MAX cores', () => {
  const css = Array.from({ length: 40 }, (_, i) => `.c${i}{color:#${(0x100000 + i * 4000).toString(16).slice(0, 6)}}`).join('');
  assert.ok(montarEvidencia({ site: 's', html: '', folhas: [css], svgs: [], logo: null }).cores.length <= CORES_MAX);
});
