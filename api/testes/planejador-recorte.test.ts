/* A regra do recorte, como ela saiu em 01/10/2026 ("trate o recorte
   numa das perguntas"), fez o planejador criar UMA PERGUNTA PARA CADA
   PARTE: no caso loggi-fidelidade da régua do planejador, "residenciais
   ou comerciais" virou duas perguntas a mais — duas buscas pagas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SISTEMA_PLANEJADOR } from '../src/pesquisa/planejador.js';

test('o recorte fica DENTRO da pergunta, nunca uma pergunta para cada parte', () => {
  assert.match(SISTEMA_PLANEJADOR, /deixe o recorte DENTRO dela/);
  assert.match(SISTEMA_PLANEJADOR, /nunca crie uma pergunta para cada parte/);
  assert.ok(!/trate o recorte numa das perguntas/.test(SISTEMA_PLANEJADOR), 'a redação que causou o defeito voltou');
});
