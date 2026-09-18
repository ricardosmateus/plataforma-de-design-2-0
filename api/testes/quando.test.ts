/* Testes de `formatarQuando` — puros.

   Ele existe por causa de uma decisão de dinheiro: quando a tarefa
   já tem resposta, a pessoa precisa escolher entre ver a que existe
   (de graça) e investigar de novo (pago). O que decide não é a data
   absoluta — é a DISTÂNCIA. "há 20 minutos" e "há três meses" pedem
   decisões opostas, e um "14/09 às 18:32" obriga quem lê a fazer a
   conta antes de decidir. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatarQuando } from '../src/pesquisa/quando.js';

const AGORA = new Date('2026-09-15T12:00:00Z');
const atras = (ms: number) => new Date(+AGORA - ms);

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe('a distância em palavras', () => {
  test('segundos viram "agora há pouco"', () => {
    assert.equal(formatarQuando(atras(20_000), AGORA), 'agora há pouco');
  });

  test('minutos', () => {
    assert.match(formatarQuando(atras(20 * MIN), AGORA), /^há 20 minuto/);
  });

  test('horas', () => {
    assert.match(formatarQuando(atras(3 * HORA), AGORA), /^há 3 hora/);
  });

  test('dias', () => {
    assert.match(formatarQuando(atras(5 * DIA), AGORA), /^há 5 dia/);
  });

  test('meses', () => {
    assert.match(formatarQuando(atras(90 * DIA), AGORA), /^há 3 mês/);
  });
});

describe('as fronteiras, que é onde texto de data costuma mentir', () => {
  test('59 minutos ainda é minuto; 60 já é hora', () => {
    assert.match(formatarQuando(atras(59 * MIN), AGORA), /minuto/);
    assert.match(formatarQuando(atras(60 * MIN), AGORA), /hora/);
  });

  test('23 horas ainda é hora; 24 já é dia', () => {
    assert.match(formatarQuando(atras(23 * HORA), AGORA), /hora/);
    assert.match(formatarQuando(atras(24 * HORA), AGORA), /dia/);
  });
});

describe('o que não pode acontecer', () => {
  test('data no futuro não vira número negativo', () => {
    /* Relógio de servidor e de banco divergem por segundos. "há -1
       minuto" na cara de quem vai decidir gastar é o tipo de coisa
       que faz perder a confiança no resto da tela. */
    assert.equal(formatarQuando(new Date(+AGORA + 5 * MIN), AGORA), 'agora há pouco');
  });
});
