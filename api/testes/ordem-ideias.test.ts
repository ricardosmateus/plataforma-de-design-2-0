/* IDEIA-ORDEM — reorganizar cards dentro da mesma coluna.
   `conferirNovaOrdem` decide se a ordem pedida pode ser gravada;
   `posicaoNoTopo` decide onde entra o card que chega de outra coluna;
   `compararOrdem` é a ordem de exibição. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conferirNovaOrdem, posicaoNoTopo, compararOrdem } from '../src/ideias/ordem.js';

test('permutação exata da coluna é aceita', () => {
  assert.deepEqual(conferirNovaOrdem(['a', 'b', 'c'], ['c', 'a', 'b']), { ok: true });
});

test('id repetido é recusado', () => {
  assert.deepEqual(conferirNovaOrdem(['a', 'b', 'c'], ['a', 'a', 'b']), { ok: false, motivo: 'repetida' });
});

test('coluna mudou no meio do caminho: faltando, sobrando ou trocada', () => {
  assert.deepEqual(conferirNovaOrdem(['a', 'b', 'c'], ['a', 'b']), { ok: false, motivo: 'desatualizada' });
  assert.deepEqual(conferirNovaOrdem(['a', 'b'], ['a', 'b', 'c']), { ok: false, motivo: 'desatualizada' });
  assert.deepEqual(conferirNovaOrdem(['a', 'b', 'c'], ['a', 'b', 'x']), { ok: false, motivo: 'desatualizada' });
});

test('card que chega entra acima de todos; coluna vazia começa em zero', () => {
  assert.equal(posicaoNoTopo([]), 0);
  assert.equal(posicaoNoTopo([0, 1, 2]), -1);
  assert.equal(posicaoNoTopo([-1790000000000, 3]), -1790000000001);
});

test('ordem de exibição: posição crescente, empate pela mais nova', () => {
  const d = (ms: number) => new Date(ms);
  const lista = [
    { id: 'etapa3', posicao: -100, criadoEm: d(1000) },
    { id: 'reorg', posicao: 0, criadoEm: d(5000) },
    { id: 'etapa1', posicao: -100, criadoEm: d(1002) },
    { id: 'etapa2', posicao: -100, criadoEm: d(1001) },
  ];
  assert.deepEqual(
    lista.sort(compararOrdem).map((i) => i.id),
    ['etapa1', 'etapa2', 'etapa3', 'reorg'],
  );
});
