/* BOARD-PESQUISA-097 a 101 — as respostas do time em "Próximos passos",
   do lado do servidor. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { respostasValidas, textoDasRespostas, RESPOSTAS_MAX, RESPOSTA_MAX, CONVITE } from '../src/pesquisa/respostas-do-time.js';

test('só o que foi respondido: o convite sozinho não é resposta (o defeito de 14/09)', () => {
  assert.deepEqual(respostasValidas([
    { pergunta: 'Qual tipografia?', resposta: CONVITE },
    { pergunta: 'Qual cor?', resposta: '  ' },
    { pergunta: '', resposta: 'Azul.' },
    { pergunta: 'Qual símbolo?', resposta: `Uma seta.\n\n${CONVITE}` },
  ]), [{ pergunta: 'Qual símbolo?', resposta: 'Uma seta.' }]);
});

test('lixo não quebra: não-lista, itens estranhos, pergunta repetida', () => {
  assert.deepEqual(respostasValidas(undefined), []);
  assert.deepEqual(respostasValidas('x'), []);
  assert.deepEqual(respostasValidas([null, 3, { pergunta: 'A?', resposta: 'a' }, { pergunta: 'a?', resposta: 'b' }]), [{ pergunta: 'A?', resposta: 'a' }]);
});

test('limites: no máximo RESPOSTAS_MAX, e cada resposta cortada em RESPOSTA_MAX', () => {
  const muitas = Array.from({ length: 10 }, (_, i) => ({ pergunta: `P${i}?`, resposta: 'x'.repeat(5_000) }));
  const r = respostasValidas(muitas);
  assert.equal(r.length, RESPOSTAS_MAX);
  assert.equal(r[0]!.resposta.length, RESPOSTA_MAX);
});

test('o bloco de contexto: vazio sem resposta; com resposta, pede para não repetir a pergunta', () => {
  assert.equal(textoDasRespostas([]), '');
  const t = textoDasRespostas([{ pergunta: 'Qual tipografia?', resposta: 'Montserrat.' }]);
  assert.match(t, /não pergunte de novo o que já foi respondido/);
  assert.match(t, /- Pergunta: Qual tipografia\?\n {2}Resposta: Montserrat\./);
});

const rota = readFileSync(new URL('../src/rotas/pesquisa.ts', import.meta.url), 'utf8');

test('a rota aceita `respostas` ao lado da pergunta, sem mexer no limite de 500 da pergunta', () => {
  assert.match(rota, /respostas: z\.array\(z\.object\(\{ pergunta: z\.string\(\)\.max\(2_000\), resposta: z\.string\(\)\.max\(4_000\) \}\)\)\.max\(20\)\.optional\(\)/);
  assert.equal((rota.match(/pergunta: z\.string\(\)\.trim\(\)\.min\(1, 'Escreva a pergunta\.'\)\.max\(500\)/g) ?? []).length, 2);
});

test('as respostas chegam ao planejador (contexto) e à busca (texto gravado)', () => {
  const a = rota.indexOf('const respostasDoTime = respostasValidas(corpo.data.respostas);');
  const contexto = rota.indexOf("const contexto = pacoteParaTexto(pacote) + (blocoRespostas ? `\\n\\n${blocoRespostas}` : '');");
  const planejador = rota.indexOf('saidaPlano = await planejarComModelo({');
  const busca = rota.indexOf('blocoRespostas ? `${roteado.pergunta}\\n\\n${blocoRespostas}` : roteado.pergunta');
  assert.ok(a > 0 && a < contexto && contexto < planejador && planejador < busca, `${a} ${contexto} ${planejador} ${busca}`);
});
