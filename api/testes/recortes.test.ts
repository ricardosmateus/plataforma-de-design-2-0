/* ============================================================
   Recortes — leitura da resposta do modelo
   ============================================================
   Testa `interpretar()`, onde moram as duas regras que sustentam a
   página do tema:

     1. um bloco pertence a UMA categoria — é o que faz a página
        prometer "não misturamos os temas" e cumprir;
     2. só as categorias oferecidas valem — é o que impede a idéia
        de ganhar texto num tema que a classificação não lhe deu.

   Sem rede e sem banco: é lógica pura, e é a parte que precisa
   continuar valendo quando o modelo variar a forma de responder.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { interpretar, type Bloco } from '../src/ia/recortes-leitura.js';

const bloco = (n: number): Bloco => ({
  n,
  texto: 'texto do bloco ' + n,
  tarefaId: 'tarefa-' + n,
  quadroId: 'quadro-' + n,
  registroId: 'registro-' + n,
});

const BLOCOS = [bloco(1), bloco(2), bloco(3)];
const TEMAS = ['Mercado', 'Estratégia', 'Concorrentes'];

describe('interpretar — o que o modelo devolve', () => {
  test('JSON limpo vira registro → categoria', () => {
    const r = interpretar(
      '{"blocos":[{"n":1,"c":"Mercado"},{"n":3,"c":"Concorrentes"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 2);
    assert.equal(r?.get('registro-1'), 'Mercado');
    assert.equal(r?.get('registro-3'), 'Concorrentes');
  });

  test('bloco não citado simplesmente não entra', () => {
    const r = interpretar('{"blocos":[{"n":2,"c":"Estratégia"}]}', BLOCOS, TEMAS);
    assert.equal(r?.size, 1);
    assert.equal(r?.has('registro-1'), false);
  });

  test('cercas de código não atrapalham', () => {
    const r = interpretar(
      '```json\n{"blocos":[{"n":1,"c":"Mercado"}]}\n```',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.get('registro-1'), 'Mercado');
  });

  test('texto em volta do JSON é tolerado', () => {
    const r = interpretar(
      'Claro! {"blocos":[{"n":2,"c":"Mercado"}]} Espero ter ajudado.',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.get('registro-2'), 'Mercado');
  });
});

describe('a regra que a página promete — um bloco, um tema', () => {
  test('bloco repetido fica com a PRIMEIRA categoria', () => {
    const r = interpretar(
      '{"blocos":[{"n":1,"c":"Mercado"},{"n":1,"c":"Concorrentes"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 1);
    assert.equal(r?.get('registro-1'), 'Mercado');
  });

  test('o mesmo texto nunca sai em dois temas', () => {
    const r = interpretar(
      '{"blocos":[{"n":1,"c":"Mercado"},{"n":1,"c":"Estratégia"},{"n":1,"c":"Concorrentes"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.deepEqual([...(r ?? new Map()).values()], ['Mercado']);
  });
});

describe('vocabulário fechado — o que se descarta', () => {
  test('categoria fora das oferecidas é ignorada', () => {
    const r = interpretar(
      '{"blocos":[{"n":1,"c":"Personas"},{"n":2,"c":"Mercado"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 1);
    assert.equal(r?.get('registro-2'), 'Mercado');
  });

  test('número de bloco inventado é ignorado', () => {
    const r = interpretar(
      '{"blocos":[{"n":99,"c":"Mercado"},{"n":1,"c":"Mercado"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 1);
    assert.equal(r?.get('registro-1'), 'Mercado');
  });

  test('item malformado não derruba os bons', () => {
    const r = interpretar(
      '{"blocos":[{"n":"um","c":"Mercado"},{"c":"Mercado"},{"n":2},{"n":3,"c":"Mercado"}]}',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 1);
    assert.equal(r?.get('registro-3'), 'Mercado');
  });
});

describe('resposta quebrada', () => {
  test('lista cortada no meio recupera os itens completos', () => {
    /* max_tokens no meio da lista: o JSON fica sem fechar. Perder a
       chamada inteira por causa do último item seria desperdício de
       uma chamada já paga. */
    const r = interpretar(
      '{"blocos":[{"n":1,"c":"Mercado"},{"n":2,"c":"Estratégia"},{"n":3,"c":"Conc',
      BLOCOS,
      TEMAS,
    );
    assert.equal(r?.size, 2);
    assert.equal(r?.get('registro-1'), 'Mercado');
    assert.equal(r?.get('registro-2'), 'Estratégia');
  });

  test('sem JSON nenhum devolve null — não é "nada se enquadra"', () => {
    /* A diferença que decide se a página do tema é esvaziada: não
       saber o que o modelo respondeu não pode terminar na mesma
       escrita que "li a resposta, e nada se enquadrou". */
    assert.equal(interpretar('Não consegui classificar.', BLOCOS, TEMAS), null);
  });

  test('JSON válido sem a lista também é ilegível', () => {
    assert.equal(interpretar('{"resposta":"ok"}', BLOCOS, TEMAS), null);
  });

  test('lista vazia é resposta legítima — Map vazio, não null', () => {
    /* Nenhum bloco tratava dos temas. Omitir é a resposta certa —
       um trecho fora de tema polui a página para sempre. */
    const r = interpretar('{"blocos":[]}', BLOCOS, TEMAS);
    assert.notEqual(r, null);
    assert.equal(r?.size, 0);
  });
});
