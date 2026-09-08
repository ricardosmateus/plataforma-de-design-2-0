/* ============================================================
   Leitura guiada — leitura da resposta do modelo
   ============================================================
   Testa `interpretar()`, onde moram as duas regras que sustentam a
   leitura guiada:

     1. o modelo só referencia recortes que já existem — nunca
        escreve o texto de um trecho, só o título de uma seção;
     2. nenhum recorte desaparece por o modelo ter esquecido de
        citá-lo — cai em "Outros trechos".

   Sem rede e sem banco: é lógica pura.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretar,
  OUTROS_TRECHOS,
  TETO_TITULO,
  type RecorteNumerado,
} from '../src/ia/enriquecimento-leitura.js';

const recorte = (n: number): RecorteNumerado => ({ n, recorteId: 'recorte-' + n });

const RECORTES = [recorte(1), recorte(2), recorte(3)];

describe('interpretar — o que o modelo devolve', () => {
  test('JSON limpo vira lista de seções', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"Tamanho do mercado","recortes":[1,3]},{"titulo":"Concorrência","recortes":[2]}]}',
      RECORTES,
    );
    assert.equal(r?.length, 2);
    assert.equal(r?.[0]?.titulo, 'Tamanho do mercado');
    assert.deepEqual(r?.[0]?.recorteIds, ['recorte-1', 'recorte-3']);
    assert.equal(r?.[1]?.titulo, 'Concorrência');
    assert.deepEqual(r?.[1]?.recorteIds, ['recorte-2']);
  });

  test('cercas de código não atrapalham', () => {
    const r = interpretar(
      '```json\n{"secoes":[{"titulo":"Mercado","recortes":[1]}]}\n```',
      RECORTES,
    );
    assert.equal(r?.[0]?.titulo, 'Mercado');
  });

  test('texto em volta do JSON é tolerado', () => {
    const r = interpretar(
      'Claro! {"secoes":[{"titulo":"Mercado","recortes":[2]}]} Espero ter ajudado.',
      RECORTES,
    );
    assert.deepEqual(r?.[0]?.recorteIds, ['recorte-2']);
  });
});

describe('nada some — o recorte esquecido', () => {
  test('recorte não citado por nenhuma seção cai em "Outros trechos"', () => {
    const r = interpretar('{"secoes":[{"titulo":"Mercado","recortes":[1]}]}', RECORTES);
    assert.equal(r?.length, 2);
    assert.equal(r?.[1]?.titulo, OUTROS_TRECHOS);
    assert.deepEqual(r?.[1]?.recorteIds, ['recorte-2', 'recorte-3']);
  });

  test('modelo não organiza nada útil: tudo cai em "Outros trechos", mesmo assim é lista válida', () => {
    const r = interpretar('{"secoes":[]}', RECORTES);
    assert.notEqual(r, null);
    assert.equal(r?.length, 1);
    assert.equal(r?.[0]?.titulo, OUTROS_TRECHOS);
    assert.deepEqual(r?.[0]?.recorteIds, ['recorte-1', 'recorte-2', 'recorte-3']);
  });

  test('todos os recortes citados: sem seção "Outros trechos" sobrando', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"Tudo","recortes":[1,2,3]}]}',
      RECORTES,
    );
    assert.equal(r?.length, 1);
    assert.equal(r?.some((s) => s.titulo === OUTROS_TRECHOS), false);
  });
});

describe('a regra que a página promete — um trecho, um lugar na leitura', () => {
  test('recorte citado em duas seções fica só na PRIMEIRA', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"A","recortes":[1]},{"titulo":"B","recortes":[1,2]}]}',
      RECORTES,
    );
    assert.deepEqual(r?.[0]?.recorteIds, ['recorte-1']);
    assert.deepEqual(r?.[1]?.recorteIds, ['recorte-2']);
  });
});

describe('o que se descarta', () => {
  test('número de recorte inventado é ignorado', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"Mercado","recortes":[99,1]}]}',
      RECORTES,
    );
    assert.deepEqual(r?.[0]?.recorteIds, ['recorte-1']);
  });

  test('seção sem título é descartada inteira', () => {
    const r = interpretar(
      '{"secoes":[{"recortes":[1]},{"titulo":"Mercado","recortes":[2]}]}',
      RECORTES,
    );
    assert.equal(r?.filter((s) => s.titulo !== OUTROS_TRECHOS).length, 1);
    assert.equal(r?.[0]?.titulo, 'Mercado');
  });

  test('seção sem nenhum recorte válido não vira seção vazia', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"Fantasma","recortes":[99]},{"titulo":"Mercado","recortes":[1]}]}',
      RECORTES,
    );
    assert.equal(r?.some((s) => s.titulo === 'Fantasma'), false);
  });

  test('item malformado não derruba os bons', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":123,"recortes":[1]},{"titulo":"Mercado","recortes":"não é lista"},{"titulo":"Bom","recortes":[2]}]}',
      RECORTES,
    );
    assert.equal(r?.filter((s) => s.titulo !== OUTROS_TRECHOS).length, 1);
    assert.equal(r?.[0]?.titulo, 'Bom');
  });

  test('título longo é cortado, não rejeitado', () => {
    const longo = 'a'.repeat(200);
    const r = interpretar(
      JSON.stringify({ secoes: [{ titulo: longo, recortes: [1] }] }),
      RECORTES,
    );
    assert.equal(r?.[0]?.titulo.length, TETO_TITULO);
  });
});

describe('resposta quebrada', () => {
  test('lista cortada no meio recupera as seções completas', () => {
    const r = interpretar(
      '{"secoes":[{"titulo":"Mercado","recortes":[1]},{"titulo":"Concorrência","recortes":[2',
      RECORTES,
    );
    assert.equal(r?.some((s) => s.titulo === 'Mercado'), true);
  });

  test('sem JSON nenhum devolve null — preserva a leitura antiga', () => {
    assert.equal(interpretar('Não consegui organizar.', RECORTES), null);
  });

  test('JSON válido sem a lista também é ilegível', () => {
    assert.equal(interpretar('{"resposta":"ok"}', RECORTES), null);
  });
});
