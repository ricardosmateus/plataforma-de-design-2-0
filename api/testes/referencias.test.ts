/* BOARD-REF — o que pode entrar como referência visual.
   `normalizarUrlSite` decide se um endereço vira card de site;
   `formatoPelosBytes` decide se um arquivo é imagem de verdade. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarUrlSite,
  normalizarNome,
  formatoPelosBytes,
  formatoDocumento,
  extensaoDoNome,
  NOME_MAX,
} from '../src/referencias/regras.js';

test('endereço colado sem https:// ganha https://', () => {
  assert.deepEqual(normalizarUrlSite('nubank.com.br'), { ok: true, url: 'https://nubank.com.br/' });
  assert.deepEqual(normalizarUrlSite('  https://www.apple.com/br/  '), { ok: true, url: 'https://www.apple.com/br/' });
  assert.deepEqual(normalizarUrlSite('http://exemplo.com/a?b=1'), { ok: true, url: 'http://exemplo.com/a?b=1' });
});

test('esquema que não é http nem https é recusado', () => {
  for (const u of ['javascript:alert(1)', 'data:text/html,oi', 'ftp://exemplo.com', 'file:///etc/passwd']) {
    assert.equal(normalizarUrlSite(u).ok, false, u);
  }
});

test('vazio, sem domínio ou inválido é recusado', () => {
  for (const u of ['', '   ', 'nubank', 'https://nubank', 'https://.com', 'http://', 'a b.com']) {
    assert.equal(normalizarUrlSite(u).ok, false, JSON.stringify(u));
  }
  assert.equal(normalizarUrlSite(undefined).ok, false);
});

test('endereço longo demais é recusado', () => {
  assert.equal(normalizarUrlSite('https://exemplo.com/' + 'a'.repeat(2000)).ok, false);
});

test('nome: espaços normalizados e teto', () => {
  assert.equal(normalizarNome('  Site   da  Nubank '), 'Site da Nubank');
  assert.equal(normalizarNome(null), '');
  assert.equal(normalizarNome('x'.repeat(500)).length, NOME_MAX);
});

test('formato pelos bytes, não pelo nome do arquivo', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const gif = new TextEncoder().encode('GIF89a....');
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(formatoPelosBytes(png), 'image/png');
  assert.equal(formatoPelosBytes(jpg), 'image/jpeg');
  assert.equal(formatoPelosBytes(gif), 'image/gif');
  assert.equal(formatoPelosBytes(webp), 'image/webp');
});

test('SVG, HTML e arquivo vazio não são imagem aceita', () => {
  assert.equal(formatoPelosBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(formatoPelosBytes(new TextEncoder().encode('<html><script>x</script>')), null);
  assert.equal(formatoPelosBytes(new Uint8Array([])), null);
  /* RIFF que não é WEBP (um .wav, por exemplo) */
  assert.equal(formatoPelosBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])), null);
});

/* BOARD-REF-008 — documentos: extensão E bytes. */

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
const PDF = new TextEncoder().encode('%PDF-1.7\n...');

test('documento: extensão aceita e bytes da família certa', () => {
  assert.equal(formatoDocumento('briefing.pdf', PDF)?.extensao, 'pdf');
  assert.equal(formatoDocumento('Proposta.DOCX', ZIP)?.extensao, 'docx');
  assert.equal(formatoDocumento('planilha.xlsx', ZIP)?.mime,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(formatoDocumento('antigo.xls', OLE)?.extensao, 'xls');
  assert.equal(formatoDocumento('notas.txt', new TextEncoder().encode('oi, tudo bem?'))?.extensao, 'txt');
  assert.equal(formatoDocumento('dados.csv', new TextEncoder().encode('a;b\n1;2'))?.extensao, 'csv');
  assert.equal(formatoDocumento('texto.rtf', new TextEncoder().encode('{\\rtf1 oi}'))?.extensao, 'rtf');
});

test('documento: extensão que mente sobre os bytes é recusada', () => {
  assert.equal(formatoDocumento('briefing.pdf', ZIP), null);
  assert.equal(formatoDocumento('proposta.docx', PDF), null);
  assert.equal(formatoDocumento('binario.txt', new Uint8Array([0x41, 0, 0x42])), null);
  assert.equal(formatoDocumento('vazio.txt', new Uint8Array([])), null);
});

test('documento: HTML, SVG, executável e sem extensão ficam de fora', () => {
  const t = new TextEncoder().encode('<html><script>x</script>');
  assert.equal(formatoDocumento('pagina.html', t), null);
  assert.equal(formatoDocumento('logo.svg', t), null);
  assert.equal(formatoDocumento('instalador.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0])), null);
  assert.equal(formatoDocumento('semextensao', PDF), null);
  assert.equal(extensaoDoNome('a.tar.gz'), 'gz');
});
