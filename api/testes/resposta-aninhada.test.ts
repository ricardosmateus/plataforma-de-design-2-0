/* Testes de `contemResultadoDeFerramenta` — puros, sem rede.

   POR QUE ESTE ARQUIVO EXISTE
   O provedor corta a narração do modelo ("Vou buscar informações
   sobre...") pela POSIÇÃO do último resultado de ferramenta: o que
   vem depois é a resposta, o que vem antes é preparação. Enquanto os
   resultados chegavam no nível de cima, bastava varrer `content[]`.

   A partir de `web_search_20260209` a busca pode rodar com filtragem
   dinâmica — o modelo escreve código que enxuga os resultados antes
   do contexto — e aí os pares `server_tool_use` /
   `web_search_tool_result` chegam ANINHADOS dentro do bloco de
   execução de código.

   Varrer só o nível de cima acharia -1 e devolveria a resposta
   inteira, com a narração colada na frente. O defeito ressuscitaria
   sem ninguém ter mexido no corte — só a API teria mudado de forma.

   Estes testes travam as DUAS formas, para que ligar a filtragem não
   dependa de sorte. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { contemResultadoDeFerramenta } from '../src/pesquisa/provedor-claude-busca.js';

describe('a forma antiga, no nível de cima', () => {
  test('o resultado de busca é reconhecido', () => {
    assert.equal(contemResultadoDeFerramenta({ type: 'web_search_tool_result', content: [] }), true);
  });

  test('e o de leitura de página também', () => {
    assert.equal(contemResultadoDeFerramenta({ type: 'web_fetch_tool_result', content: [] }), true);
  });

  test('texto não é resultado', () => {
    assert.equal(contemResultadoDeFerramenta({ type: 'text', text: 'Vou buscar...' }), false);
  });

  test('o pedido de ferramenta não é o resultado dele', () => {
    /* `server_tool_use` é o modelo PEDINDO a busca. Cortar por ele
       deixaria de fora o resultado, que é o que separa preparação de
       resposta. */
    assert.equal(contemResultadoDeFerramenta({ type: 'server_tool_use', name: 'web_search' }), false);
  });
});

describe('a forma nova, aninhada pela filtragem dinâmica', () => {
  /* Como a documentação descreve: o bloco de execução de código
     carrega dentro dele os pares server_tool_use / resultado, cada um
     com um `caller`. */
  const comFiltragem = {
    type: 'code_execution_tool_result',
    content: [
      { type: 'server_tool_use', name: 'web_search', caller: 'exec-1' },
      {
        type: 'web_search_tool_result',
        caller: 'exec-1',
        content: [{ type: 'web_search_result', url: 'https://x.com', title: 'X' }],
      },
    ],
  };

  test('o resultado aninhado é encontrado', () => {
    assert.equal(contemResultadoDeFerramenta(comFiltragem), true);
  });

  test('bloco de execução SEM busca dentro não é confundido', () => {
    /* Nem todo código que roda buscou alguma coisa. */
    assert.equal(
      contemResultadoDeFerramenta({
        type: 'code_execution_tool_result',
        content: [{ type: 'code_execution_output', stdout: 'ok' }],
      }),
      false,
    );
  });

  test('funciona também um nível mais fundo', () => {
    assert.equal(
      contemResultadoDeFerramenta({ type: 'a', content: [{ type: 'b', content: comFiltragem }] }),
      true,
    );
  });
});

describe('o que não pode derrubar o servidor', () => {
  test('nulo, texto solto e número não quebram', () => {
    for (const x of [null, undefined, 'texto', 42, true]) {
      assert.equal(contemResultadoDeFerramenta(x), false);
    }
  });

  test('objeto que aponta para si mesmo não vira laço infinito', () => {
    /* Corpo torto não pode pendurar um servidor. O teto de
       profundidade é o que garante isso. */
    const ciclo: Record<string, unknown> = { type: 'x' };
    ciclo.content = ciclo;
    assert.equal(contemResultadoDeFerramenta(ciclo), false);
  });

  test('não sai caçando `type` em qualquer canto do objeto', () => {
    /* Varrer o objeto inteiro acharia um `type` solto num campo
       qualquer e cortaria a resposta no lugar errado — pior do que
       não cortar, porque some com conteúdo pago. */
    assert.equal(
      contemResultadoDeFerramenta({
        type: 'text',
        text: 'oi',
        metadata: { origem: { type: 'web_search_tool_result' } },
      }),
      false,
    );
  });
});
