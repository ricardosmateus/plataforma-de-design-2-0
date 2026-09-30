/* BOARD-VISUAL-006 a 010 — contra o HTML e o CSS REAIS de 6 sites,
   lidos por `scripts/ler-sites.ts` em 30/09/2026 e guardados em
   testes/fixtures/sites/. Cada teste é um erro que a primeira versão
   cometeu nesses sites — e que os testes escritos à mão não pegavam,
   porque "fixture inventada é fixture limpa". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { logosDaMarca, montarEvidencia, mudouDeDominio, dominioBase, type EvidenciaVisual, type CandidatoLogo } from '../src/referencias/leitura-visual.js';

const PASTA = new URL('./fixtures/sites/', import.meta.url);

function ler(host: string, pedido: string): { logos: CandidatoLogo[]; e: EvidenciaVisual; final: string } {
  const dir = new URL(`${host}/`, PASTA);
  const html = readFileSync(new URL('pagina.html', dir), 'utf8');
  const folhas = readdirSync(dir).filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8'));
  const final = (JSON.parse(readFileSync(new URL('evidencia.json', dir), 'utf8')) as { site: string }).site;
  const logos = logosDaMarca(html, pedido);
  const e = montarEvidencia({ site: final, html, folhas, svgs: logos.filter((c) => c.svg).map((c) => c.svg as string), logo: null });
  return { logos, e, final };
}
const hexes = (e: EvidenciaVisual) => e.cores.map((c) => c.hex);
const fontes = (e: EvidenciaVisual) => e.fontes.map((f) => f.familia);

test('Loggi: o logotipo é o SVG no link da página inicial, e não a faixa de parceiros', () => {
  const { logos } = ler('www.loggi.com', 'https://www.loggi.com');
  assert.equal(logos[0]!.tipo, 'svg-embutido');
  assert.ok(logos[0]!.motivos.includes('link da página inicial'));
  assert.ok(!logos.some((c) => /parceir/i.test(c.url ?? '')), 'a faixa "Logos-Parceiros" voltou a ser candidata');
});

test('Loggi: cores da marca, sem Twitter, Tailwind nem cinza; fontes sem hash nem "Fallback"', () => {
  const { e } = ler('www.loggi.com', 'https://www.loggi.com');
  assert.ok(hexes(e).slice(0, 3).includes('#0055ff'));
  for (const h of ['#1da1f2', '#3b82f6']) assert.ok(!hexes(e).includes(h), h);
  assert.ok(!e.cores.some((c) => c.hex === '#bec7d6' && !c.neutra), 'cinza azulado como cor da marca');
  assert.deepEqual(fontes(e).slice(0, 2), ['Montserrat', 'Sora']);
  assert.ok(!fontes(e).some((f) => /fallback|\d{3}/i.test(f)), fontes(e).join(' | '));
});

/* A primeira versão deste teste exigia #dc0032 em PRIMEIRO — tirado da
   saída do código com defeito, que descartava o CSS da própria Jadlog.
   Lido de volta, o vermelho mais usado nele é #ba1e34 (17 vezes). O que
   importa é: os dois vermelhos da marca no topo, nada de Bootstrap. */
test('Jadlog: sem Bootstrap nas cores; os vermelhos da marca no topo', () => {
  const { e } = ler('www.jadlog.com.br', 'https://www.jadlog.com.br');
  assert.deepEqual(hexes(e).slice(0, 2).sort(), ['#ba1e34', '#dc0032']);
  for (const h of ['#337ab7', '#3c763d', '#d0e9c6', '#c4e3f3', '#faf2cc']) assert.ok(!hexes(e).includes(h), h);
});

test('Jadlog: a fonte pelo nome do ARQUIVO (Pluto Sans DPD), não pelo apelido; sem ícones nem !important', () => {
  const { e } = ler('www.jadlog.com.br', 'https://www.jadlog.com.br');
  assert.equal(fontes(e)[0], 'Pluto Sans DPD');
  assert.ok(!fontes(e).some((f) => /fonte(Titulo|Site|Menor)|glyphicons|important/i.test(f)), fontes(e).join(' | '));
});

test('Jadlog: o logotipo é o do cabeçalho', () => {
  const { logos } = ler('www.jadlog.com.br', 'https://www.jadlog.com.br');
  assert.match(logos[0]!.url ?? '', /logo_home/);
});

test('Intelipost: o logotipo é o da Intelipost, não o de um cliente do carrossel', () => {
  const { logos } = ler('www.intelipost.com.br', 'https://www.intelipost.com.br');
  assert.match(logos[0]!.url ?? '', /logo-Intelipost\.svg/);
  assert.ok(!logos.some((c) => /leroy|amazon|sephora|petlove/i.test(c.url ?? '')), 'logo de cliente virou candidato');
});

test('Intelipost: sem as cores do Contact Form 7 nem do WordPress; IBM Plex Sans uma vez, limpa', () => {
  const { e } = ler('www.intelipost.com.br', 'https://www.intelipost.com.br');
  assert.equal(hexes(e)[0], '#2ad04b');
  for (const h of ['#dc3232', '#46b450', '#ff6900', '#cf2e2e']) assert.ok(!hexes(e).includes(h), h);
  assert.equal(fontes(e).filter((f) => /ibm plex sans/i.test(f)).length, 1);
  assert.ok(!fontes(e).some((f) => /["']|important/.test(f)));
});

test('Mandaê: nenhuma cor da paleta de exemplo do WordPress', () => {
  const { e, logos } = ler('www.mandae.com.br', 'https://www.mandae.com.br');
  for (const h of ['#ff6900', '#cf2e2e', '#fcb900', '#0693e3', '#9b51e0', '#abb8c3', '#f78da7', '#7bdcb5', '#00d084', '#8ed1fc']) {
    assert.ok(!hexes(e).includes(h), h);
  }
  assert.match(logos[0]!.url ?? '', /logo-mandae_\.webp/);
});

test('Melhor Envio: logotipo SVG do cabeçalho; fonte Lato, não os nomes de arquivo do Google', () => {
  const { e, logos } = ler('melhorenvio.com.br', 'https://www.melhorenvio.com.br');
  assert.match(logos[0]!.url ?? '', /melhor-envio.*\.svg/);
  assert.equal(fontes(e)[0], 'Lato');
  assert.ok(!fontes(e).some((f) => /S6u/.test(f)));
});

test('Kangu: o site leva ao Mercado Livre, e isso é reconhecido', () => {
  const { final } = ler('www.mercadolivre.com.br', 'https://www.kangu.com.br');
  assert.equal(mudouDeDominio('https://www.kangu.com.br', final), true);
  assert.equal(dominioBase(final), 'mercadolivre.com.br');
  assert.equal(mudouDeDominio('https://loggi.com', 'https://www.loggi.com/'), false, 'www não é outro domínio');
});

test('Jadlog: o CSS DA MARCA não é tomado por framework só porque tem um seletor #cookieConsent', async () => {
  const { ehFolhaDeFramework } = await import('../src/referencias/leitura-visual.js');
  const principal = readFileSync(new URL('www.jadlog.com.br/estilo-2.css', PASTA), 'utf8');
  const bootstrap = readFileSync(new URL('www.jadlog.com.br/estilo-3.css', PASTA), 'utf8');
  assert.equal(ehFolhaDeFramework(principal), false, 'main.min.css da Jadlog descartado');
  assert.equal(ehFolhaDeFramework(bootstrap), true);
});

/* ESCRITO À MÃO, e marcado como tal: nenhum dos 6 sites reais exercita
   este caso — os logos de parceiros deles já saem por não terem o nome
   da marca no arquivo. A penalidade existe para o carrossel que TEM. */
test('carrossel com o nome da marca no arquivo continua fora (escrito à mão)', () => {
  const html = '<header><a href="/"><img src="/logo-acme.png" alt="Acme"></a></header>'
    + '<div class="swiper-slide"><img src="/parceiros/acme-e-cliente.png" alt="Acme com cliente"></div>';
  const logos = logosDaMarca(html, 'https://www.acme.com.br');
  assert.deepEqual(logos.map((c) => c.url), ['https://www.acme.com.br/logo-acme.png']);
});
