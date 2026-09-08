/* ============================================================
   Taxonomia — leitura da resposta do modelo
   ============================================================
   Testa `interpretar()`, que é onde mora a decisão de negócio do
   módulo: o vocabulário é FECHADO. Sem rede e sem banco — é lógica
   pura, e é justamente a parte que precisa continuar valendo quando
   o modelo variar a forma de responder.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { interpretar, CATEGORIAS } from '../src/ia/taxonomia-vocabulario.js';

describe('interpretar — o que o modelo devolve', () => {
  test('JSON limpo vira assunto e tags', () => {
    const r = interpretar('{"assunto":"Personas","tags":["UX","Mercado"]}');
    assert.deepEqual(r, { assunto: 'Personas', tags: ['UX', 'Mercado'] });
  });

  test('cercas de código não atrapalham', () => {
    const r = interpretar('```json\n{"assunto":"MVP","tags":[]}\n```');
    assert.deepEqual(r, { assunto: 'MVP', tags: [] });
  });

  test('texto em volta do JSON é tolerado', () => {
    const r = interpretar('Claro! {"assunto":"Roadmap","tags":["Backlog"]} Espero ter ajudado.');
    assert.equal(r?.assunto, 'Roadmap');
  });

  test('caixa e acento diferentes ainda casam com a categoria', () => {
    const r = interpretar('{"assunto":"jornada do usuario","tags":["ux"]}');
    assert.deepEqual(r, { assunto: 'Jornada do Usuário', tags: ['UX'] });
  });
});

describe('interpretar — vocabulário fechado', () => {
  test('categoria inventada, sem tag válida, invalida a classificação', () => {
    /* Preferir nenhuma pasta a uma pasta que não existe: é isso que
       impede o mapa de virar uma lista de sinônimos. */
    assert.equal(interpretar('{"assunto":"Growth Hacking","tags":[]}'), null);
    assert.equal(interpretar('{"assunto":"Growth Hacking","tags":["Growth"]}'), null);
  });

  test('assunto inválido é resgatado pela primeira tag válida', () => {
    const r = interpretar('{"assunto":"Meio de transporte","tags":["Mercado","UX"]}');
    assert.deepEqual(r, { assunto: 'Mercado', tags: ['UX'] });
  });

  test('assunto ausente ou nulo também é resgatado pela tag', () => {
    assert.deepEqual(interpretar('{"tags":["UX"]}'), { assunto: 'UX', tags: [] });
    assert.deepEqual(interpretar('{"assunto":null,"tags":["UX"]}'), { assunto: 'UX', tags: [] });
  });

  test('tag inventada é descartada sem derrubar o assunto', () => {
    const r = interpretar('{"assunto":"UX","tags":["Growth Hacking","Acessibilidade"]}');
    assert.deepEqual(r, { assunto: 'UX', tags: ['Acessibilidade'] });
  });

  test('tag igual ao assunto não se repete', () => {
    const r = interpretar('{"assunto":"UX","tags":["UX","UI"]}');
    assert.deepEqual(r, { assunto: 'UX', tags: ['UI'] });
  });

  test('no máximo três tags', () => {
    const r = interpretar(
      '{"assunto":"Estratégia","tags":["KPIs","Posicionamento","Mercado","Benchmark","MVP"]}',
    );
    assert.equal(r?.tags.length, 3);
  });

  test('toda categoria devolvida pertence à taxonomia', () => {
    const r = interpretar('{"assunto":"APIs","tags":["Arquitetura","Integrações"]}');
    assert.ok(r);
    for (const c of [r.assunto, ...r.tags]) {
      assert.ok(CATEGORIAS.includes(c), `${c} fora da taxonomia`);
    }
  });
});

describe('interpretar — respostas imprestáveis', () => {
  for (const [nome, entrada] of [
    ['texto solto', 'Acho que isso é sobre personas.'],
    ['JSON quebrado', '{"assunto":"UX", tags:'],
    ['vazio', ''],
    ['assunto ausente e sem tags', '{"tags":[]}'],
    ['assunto nulo e tags inválidas', '{"assunto":null,"tags":["Growth"]}'],
    ['assunto não é texto', '{"assunto":42,"tags":[]}'],
  ] as const) {
    test(`${nome} devolve null`, () => {
      assert.equal(interpretar(entrada), null);
    });
  }

  test('tags fora de lista não quebram a leitura', () => {
    const r = interpretar('{"assunto":"UI","tags":"UX"}');
    assert.deepEqual(r, { assunto: 'UI', tags: [] });
  });
});
