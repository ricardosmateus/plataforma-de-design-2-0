/* ATV-GERAR-024 — o prompt candidato do gerador. O que importa aqui é
   que ele seja de fato DIFERENTE do atual, e só no trecho da Pesquisa:
   um `replace` que não acha o texto devolve o prompt original em
   silêncio, e a régua compararia o prompt com ele mesmo. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SISTEMA_TAREFA, SISTEMA_TAREFA_CANDIDATO } from '../src/ia/gerar-tarefa.js';

test('o candidato é diferente do atual (o replace achou o trecho)', () => {
  assert.notEqual(SISTEMA_TAREFA_CANDIDATO, SISTEMA_TAREFA);
});

test('os três acréscimos estão lá', () => {
  assert.match(SISTEMA_TAREFA_CANDIDATO, /UMA leitura só/);
  assert.match(SISTEMA_TAREFA_CANDIDATO, /O RECORTE/);
  assert.match(SISTEMA_TAREFA_CANDIDATO, /Só o que a Pesquisa ENTREGA/);
  assert.match(SISTEMA_TAREFA_CANDIDATO, /Nunca peça mood board pronto/);
});

test('fora da Pesquisa, nada muda: Matriz CSD, Referência e o formato são os mesmos', () => {
  const resto = (s: string) => s.slice(s.indexOf('- "Matriz CSD"'));
  assert.equal(resto(SISTEMA_TAREFA_CANDIDATO), resto(SISTEMA_TAREFA));
  assert.ok(SISTEMA_TAREFA_CANDIDATO.startsWith(SISTEMA_TAREFA.slice(0, SISTEMA_TAREFA.indexOf('- "Pesquisa"'))));
});

test('em produção, o prompt continua o atual (o candidato só entra pela régua)', () => {
  const fonte = readFileSync(new URL('../src/ia/gerar-tarefa.ts', import.meta.url), 'utf8');
  assert.match(fonte, /sistema: string = SISTEMA_TAREFA,/);
});
