/* BOARD-REF-009 — as travas do download e a leitura do logotipo. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipPrivado, urlVisitavel } from '../src/rede/baixar.js';
import { candidatosDeLogo } from '../src/referencias/logotipo-do-site.js';

test('IP privado, loopback, link-local e reservado são recusados', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'não é ip']) {
    assert.equal(ipPrivado(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.69', '2606:4700::6810:84e5']) {
    assert.equal(ipPrivado(ip), false, ip);
  }
});

test('URL: só http(s), porta padrão, sem usuário, sem host interno', () => {
  assert.ok(urlVisitavel('https://www.nubank.com.br/'));
  assert.ok(urlVisitavel('http://exemplo.com:80/a.pdf'));
  for (const u of ['ftp://exemplo.com', 'file:///etc/passwd', 'https://exemplo.com:8080/',
    'https://user:senha@exemplo.com/', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/',
    'http://169.254.169.254/latest/meta-data', 'http://servico.internal/', 'lixo']) {
    assert.equal(urlVisitavel(u), null, u);
  }
});

test('logotipo: <img> com "logo" vem primeiro, SVG fica de fora', () => {
  const html = `<html><head>
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/fav32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/fav192.png">
    <meta property="og:image" content="https://cdn.exemplo.com/banner.jpg">
  </head><body>
    <img src="/img/logo.svg" alt="Logo">
    <img class="site-logo" src="assets/marca.png" alt="Exemplo">
    <img src="/foto.jpg" alt="Equipe">
  </body></html>`;
  const c = candidatosDeLogo(html, 'https://www.exemplo.com.br/');
  assert.equal(c[0], 'https://www.exemplo.com.br/assets/marca.png');
  assert.equal(c[1], 'https://www.exemplo.com.br/apple-icon.png');
  assert.equal(c[2], 'https://www.exemplo.com.br/fav192.png');
  assert.ok(c.includes('https://cdn.exemplo.com/banner.jpg'));
  assert.ok(!c.some((u) => u.endsWith('.svg')), 'sem SVG');
  assert.ok(!c.includes('https://www.exemplo.com.br/fav32.png'), 'ícone pequeno não entra');
  assert.ok(!c.includes('https://www.exemplo.com.br/foto.jpg'), 'imagem sem pista de logo não entra');
});

test('logotipo: sem nada declarado, tenta o apple-touch-icon convencional; javascript: nunca', () => {
  const c = candidatosDeLogo('<img class="logo" src="javascript:alert(1)">', 'https://a.com.br/pagina');
  assert.deepEqual(c, ['https://a.com.br/apple-touch-icon.png']);
});
