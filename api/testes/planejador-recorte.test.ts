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

/* A regra 10 (01/10/2026): na régua do planejador, "Pesquisar outras
   logitechs" perdeu o nome em 3 de 4 rodadas — "concorrentes da
   Logitech" virou "marcas de periféricos gamer", e a busca perde a
   âncora. */
test('o nome que a tarefa usa fica em pelo menos uma pergunta', () => {
  assert.match(SISTEMA_PLANEJADOR, /10\. Se a tarefa nomeia uma empresa, um produto ou uma marca/);
  assert.match(SISTEMA_PLANEJADOR, /ele é a âncora da busca/);
});
