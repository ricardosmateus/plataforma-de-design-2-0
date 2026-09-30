/* BOARD-SALVA-008 — o board gravado em lote.
   O caso real (30/09/2026): três PUTs seguidos de resultado de pesquisa
   deram P2028 ("Transaction already closed… 5000 ms, 5184 ms passed"),
   500 — e o board não foi salvo. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lotesDoBoard, type QuadroRecebido } from '../src/rotas/quadros-em-lote.js';

function sequencia() { let n = 0; return () => `id-${++n}`; }

const board: QuadroRecebido[] = [
  { titulo: 'Resultado', tipo: 'postits', colunas: [
    { titulo: 'Achados', registros: [{ titulo: 'A', descricao: 'a' }, { titulo: 'B', descricao: 'b' }] },
    { titulo: 'Dúvidas', registros: [{ titulo: 'C', descricao: '' }] },
  ] },
  { titulo: 'Matriz SWOT', tipo: 'matriz', modelo: 'swot', colunas: [
    { titulo: 'Forças', registros: [{ titulo: 'Marca', descricao: '' }] },
    { titulo: 'Fraquezas', registros: [] },
  ] },
  { titulo: 'Documento', tipo: 'documento', modelo: 'swot', colunas: [] },
];

test('três lotes, com a contagem certa em cada nível', () => {
  const l = lotesDoBoard('t1', board, sequencia());
  assert.equal(l.quadros.length, 3);
  assert.equal(l.colunas.length, 4);
  assert.equal(l.registros.length, 4);
});

test('cada coluna aponta para o seu quadro, e cada registro para a sua coluna', () => {
  const l = lotesDoBoard('t1', board, sequencia());
  const quadroDe = new Map(l.quadros.map((q) => [q.id, q.titulo]));
  const colunaDe = new Map(l.colunas.map((c) => [c.id, c]));
  assert.deepEqual(l.colunas.map((c) => `${quadroDe.get(c.quadroId)}/${c.titulo}`),
    ['Resultado/Achados', 'Resultado/Dúvidas', 'Matriz SWOT/Forças', 'Matriz SWOT/Fraquezas']);
  assert.deepEqual(l.registros.map((r) => `${colunaDe.get(r.colunaId)!.titulo}/${r.titulo}`),
    ['Achados/A', 'Achados/B', 'Dúvidas/C', 'Forças/Marca']);
});

test('a ordem é a da tela, em cada nível', () => {
  const l = lotesDoBoard('t1', board, sequencia());
  assert.deepEqual(l.quadros.map((q) => q.ordem), [0, 1, 2]);
  assert.deepEqual(l.colunas.map((c) => c.ordem), [0, 1, 0, 1]);
  assert.deepEqual(l.registros.map((r) => r.ordem), [0, 1, 0, 0]);
});

test('modelo só fica no quadro-matriz (BOARD-PESQUISA-MATRIZ-006)', () => {
  const l = lotesDoBoard('t1', board, sequencia());
  assert.deepEqual(l.quadros.map((q) => q.modelo), [null, 'swot', null]);
});

test('todos os quadros são da tarefa; ids nunca repetem', () => {
  const l = lotesDoBoard('t9', board, sequencia());
  assert.ok(l.quadros.every((q) => q.tarefaId === 't9'));
  const ids = [...l.quadros.map((q) => q.id), ...l.colunas.map((c) => c.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('board vazio: três listas vazias (o PUT só apaga)', () => {
  assert.deepEqual(lotesDoBoard('t1', [], sequencia()), { quadros: [], colunas: [], registros: [] });
});

test('a rota grava em três createMany, sem create aninhado, com prazo maior que 5 s', () => {
  const rota = readFileSync(new URL('../src/rotas/board.ts', import.meta.url), 'utf8');
  const put = rota.slice(rota.indexOf('app.put(PREFIXO'));
  assert.match(put, /tx\.quadro\.createMany\(/);
  assert.match(put, /tx\.quadroColuna\.createMany\(/);
  assert.match(put, /tx\.registro\.createMany\(/);
  assert.ok(!/tx\.quadro\.create\(\{/.test(put), 'o create aninhado por quadro voltou');
  const prazo = put.match(/timeout:\s*([\d_]+)/);
  assert.ok(prazo && Number(prazo[1]!.replace(/_/g, '')) >= 15000, 'prazo da transação de volta aos 5 s do padrão');
});
