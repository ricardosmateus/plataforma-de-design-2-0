/* BOARD-VISUAL-012 a 016 — análise visual de marcas (subfase 1b-2, puro).
   A evidência vem das fixtures REAIS (testes/fixtures/sites/), passada
   por `montarEvidencia`; o que é simulado é só a resposta do Sonnet. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { montarEvidencia, type EvidenciaVisual } from '../src/referencias/leitura-visual.js';
import { pedidoVisual, mensagemDaMarca, interpretarAnalise, montarRespostaVisual, type MarcaAnalisada } from '../src/referencias/analise-visual.js';

function evidenciaReal(host: string): EvidenciaVisual {
  const dir = new URL(`./fixtures/sites/${host}/`, import.meta.url);
  const html = readFileSync(new URL('pagina.html', dir), 'utf8');
  const folhas = readdirSync(dir).filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8'));
  return montarEvidencia({ site: `https://${host}/`, html, folhas, svgs: [], logo: null, agora: new Date('2026-09-30T15:00:00Z') });
}

test('gatilho: logo, cores da marca, tipografia, mood board — sim', () => {
  for (const t of [
    'O que se sabe, com fonte, sobre Pergunta 2: Logotipos atuais das logtechs brasileiras?',
    'Colete 20–30 referências visuais. Entrega: mood board com cores, estilos e tipografias.',
    'Compare a identidade visual da Loggi e da Jadlog',
    'Qual a paleta de cores das marcas de logística?',
  ]) assert.equal(pedidoVisual(t), true, t);
});

test('gatilho: "fonte" no sentido de origem NÃO dispara', () => {
  for (const t of [
    'O que se sabe, com fonte, sobre o mercado de entregas em condomínios?',
    'Quais as fontes de receita da Loggi?',
    'Pesquise concorrentes diretos com fonte confiável',
  ]) assert.equal(pedidoVisual(t), false, t);
});

test('mensagem: imagem do logotipo como anexo quando é PNG/JPEG/WEBP', () => {
  const evidencia = { ...evidenciaReal('www.jadlog.com.br'), logo: { url: 'https://x/logo.png', formato: 'image/png' } };
  const b = mensagemDaMarca({ nome: 'Jadlog', evidencia, logoBytes: Buffer.from('png-de-teste'), logoSvg: null });
  assert.equal(b[0]!.type, 'image');
  assert.match((b[1] as { text: string }).text, /^DADOS:\n.*"Pluto Sans DPD"/s);
});

test('mensagem: logotipo SVG vai como código; sem logotipo, só os dados', () => {
  const evidencia = evidenciaReal('www.loggi.com');
  const comSvg = mensagemDaMarca({ nome: 'Loggi', evidencia, logoBytes: null, logoSvg: '<svg><path fill="#0055ff"/></svg>' });
  assert.match((comSvg[0] as { text: string }).text, /^Código SVG do logotipo:/);
  const semNada = mensagemDaMarca({ nome: 'Loggi', evidencia, logoBytes: null, logoSvg: null });
  assert.equal(semNada.length, 1);
});

test('trava: cor e fonte fora da evidência real saem — e ficam registradas', () => {
  const ev = evidenciaReal('www.jadlog.com.br');
  const a = interpretarAnalise(JSON.stringify({
    tipo_de_marca: 'só nome', estilo: 'Letras em caixa baixa.',
    cores: ['#BA1E34', '#123456'], cores_explicacao: 'Vermelho.',
    tipografia: ['pluto sans dpd', 'Helvetica Neue Condensed'], tipografia_explicacao: 'Sem serifa.',
    comunica: 'Rapidez.',
  }), ev)!;
  assert.deepEqual(a.cores, ['#ba1e34']);
  assert.deepEqual(a.tipografia, ['Pluto Sans DPD']);
  assert.deepEqual(a.descartadas, { cores: ['#123456'], fontes: ['Helvetica Neue Condensed'] });
});

test('trava: JSON com cerca ou com texto em volta é lido; lixo é nulo', () => {
  const ev = evidenciaReal('www.loggi.com');
  assert.ok(interpretarAnalise('Aqui está:\n```json\n{"tipo_de_marca":"só nome","cores":["#0055ff"]}\n```', ev));
  assert.equal(interpretarAnalise('não consegui ver a imagem', ev), null);
});

function marcas(): MarcaAnalisada[] {
  const loggi = evidenciaReal('www.loggi.com');
  const jadlog = evidenciaReal('www.jadlog.com.br');
  const frenet = montarEvidencia({ site: 'https://www.frenet.com.br', html: '', folhas: [], svgs: [], logo: null, avisos: ['O site não abriu (respondeu 403).'] });
  return [
    { nome: 'Loggi', siteInformado: 'https://www.loggi.com/', evidencia: loggi, analise: interpretarAnalise('{"tipo_de_marca":"só nome","estilo":"Caixa baixa | arredondada.","cores":["#0055ff"],"tipografia":["Montserrat"],"comunica":"Proximidade."}', loggi) },
    { nome: 'Jadlog', siteInformado: 'https://www.jadlog.com.br/', evidencia: jadlog, analise: interpretarAnalise('{"tipo_de_marca":"só nome","estilo":"Sólida.","cores":["#ba1e34","#999999"],"tipografia":["Pluto Sans DPD"],"comunica":"Robustez."}', jadlog) },
    { nome: 'Frenet', siteInformado: 'https://www.frenet.com.br/', evidencia: frenet, analise: null },
  ];
}

test('resposta: a tabela que o board transforma em comparativa (cabeçalho, traços, uma linha por critério)', () => {
  const { resposta } = montarRespostaVisual(marcas());
  const tabela = resposta.split('\n').filter((l) => /^\|.*\|$/.test(l));
  assert.equal(tabela[0], '| Critério | Loggi | Jadlog | Frenet |');
  assert.match(tabela[1]!, /^\| --- \|/);
  assert.deepEqual(tabela.slice(2).map((l) => l.split('|')[1]!.trim()), ['Logotipo', 'Cores', 'Tipografia', 'O que comunica']);
  for (const l of tabela) assert.equal(l.split('|').length, 6, `célula com "|" quebrou a tabela: ${l}`);
});

test('resposta: o site que não abriu continua na tabela, dizendo isso (BOARD-VISUAL-005)', () => {
  const { resposta } = montarRespostaVisual(marcas());
  const logotipo = resposta.split('\n').find((l) => l.startsWith('| Logotipo |'))!;
  assert.match(logotipo.split('|')[4]!, /não abriu/);
});

test('resposta: o descarte da trava aparece em "O que não deu para ler", não some', () => {
  const { resposta } = montarRespostaVisual(marcas());
  assert.match(resposta, /## O que não deu para ler/);
  assert.match(resposta, /Jadlog: cor citada pela análise e ausente do site, descartada: #999999/);
});

test('fontes: o site de cada empresa, na ordem; cada afirmação aponta para a sua', () => {
  const { fontes, afirmacoes } = montarRespostaVisual(marcas());
  assert.deepEqual(fontes.map((f) => f.titulo), ['Loggi — site oficial', 'Jadlog — site oficial', 'Frenet — site oficial']);
  assert.match(fontes[1]!.trecho, /Pluto Sans DPD/);
  assert.equal(afirmacoes.length, 2, 'empresa sem análise não vira afirmação');
  assert.deepEqual(afirmacoes.map((a) => fontes[a.fonteIds[0]!]!.titulo), ['Loggi — site oficial', 'Jadlog — site oficial']);
  assert.ok(afirmacoes.every((a) => !a.semFonte));
});
