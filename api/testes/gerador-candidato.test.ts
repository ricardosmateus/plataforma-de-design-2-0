/* ATV-GERAR-024 — o prompt do gerador. O de produção (SISTEMA_TAREFA)
   é o que ganhou a régua em 01/10/2026; o anterior fica só para a
   régua comparar. O que importa: que eles sejam DIFERENTES e só no
   trecho da Pesquisa — um `replace` que não acha o texto devolveria o
   prompt anterior em silêncio, e a produção voltaria atrás sem ninguém
   notar. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SISTEMA_TAREFA, SISTEMA_TAREFA_ANTERIOR } from '../src/ia/gerar-tarefa.js';

test('o prompt de produção é o novo, e não o anterior (o replace achou o trecho)', () => {
  assert.notEqual(SISTEMA_TAREFA, SISTEMA_TAREFA_ANTERIOR);
  assert.ok(!SISTEMA_TAREFA_ANTERIOR.includes('UMA leitura só'));
});

test('em produção: uma leitura, o recorte, para que serve, só o que a Pesquisa entrega', () => {
  assert.match(SISTEMA_TAREFA, /UMA leitura só/);
  assert.match(SISTEMA_TAREFA, /O RECORTE/);
  assert.match(SISTEMA_TAREFA, /Para QUE serve/);
  assert.match(SISTEMA_TAREFA, /Só o que a Pesquisa ENTREGA/);
  assert.match(SISTEMA_TAREFA, /Nunca peça mood board pronto/);
});

test('em produção: a Pesquisa fica com o publicado; nomes só os informados', () => {
  assert.match(SISTEMA_TAREFA, /A web responde o que foi PUBLICADO/);
  assert.match(SISTEMA_TAREFA, /descobre-se conversando com elas/);
  assert.match(SISTEMA_TAREFA, /SÓ os que aparecem nesta mensagem/);
});

test('fora da Pesquisa, nada muda: Matriz CSD, Referência e o formato são os mesmos', () => {
  const resto = (s: string) => s.slice(s.indexOf('- "Matriz CSD"'));
  assert.equal(resto(SISTEMA_TAREFA), resto(SISTEMA_TAREFA_ANTERIOR));
  assert.ok(SISTEMA_TAREFA.startsWith(SISTEMA_TAREFA_ANTERIOR.slice(0, SISTEMA_TAREFA_ANTERIOR.indexOf('- "Pesquisa"'))));
});

test('a chamada usa o prompt de produção por padrão', () => {
  const fonte = readFileSync(new URL('../src/ia/gerar-tarefa.ts', import.meta.url), 'utf8');
  assert.match(fonte, /sistema: string = SISTEMA_TAREFA,/);
});
