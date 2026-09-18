/* Testes de `src/creditos/dinheiro.ts` — puros, sem banco e sem rede.
   Código que decide quanto alguém paga precisa ser provável em
   milissegundos, senão ninguém roda o teste. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MICROS_POR_REAL,
  COMISSAO_PONTOS_BASE,
  reaisParaMicros,
  microsParaCentavos,
  formatarReais,
  usdParaMicrosBrl,
  cotacaoParaMilesimos,
  comissaoSobre,
} from '../src/creditos/dinheiro.js';

describe('a unidade', () => {
  test('um real são um milhão de micros', () => {
    assert.equal(reaisParaMicros(1), 1_000_000);
    assert.equal(reaisParaMicros(10), 10_000_000);
  });

  test('o clássico do ponto flutuante não acontece aqui', () => {
    /* 0.1 + 0.2 !== 0.3 em ponto flutuante. Somando em micros,
       que é inteiro, o resto não existe. */
    assert.equal(reaisParaMicros(0.1) + reaisParaMicros(0.2), reaisParaMicros(0.3));
  });

  test('centavo arredonda para cima — nunca mostrar menos do que se cobra', () => {
    assert.equal(microsParaCentavos(10_000), 1);      // exatamente 1 centavo
    assert.equal(microsParaCentavos(10_001), 2);      // um pingo acima já sobe
    assert.equal(microsParaCentavos(1), 1);           // fração mínima vira 1
    assert.equal(microsParaCentavos(0), 0);
  });
});

describe('exibição', () => {
  test('formata com vírgula decimal e ponto de milhar', () => {
    assert.equal(formatarReais(reaisParaMicros(1234.5)), 'R$ 1.234,50');
    assert.equal(formatarReais(reaisParaMicros(0)), 'R$ 0,00');
    assert.equal(formatarReais(reaisParaMicros(10)), 'R$ 10,00');
    assert.equal(formatarReais(reaisParaMicros(1_000_000)), 'R$ 1.000.000,00');
  });

  test('saldo negativo aparece com sinal, não sumido', () => {
    /* Saldo negativo não deveria existir, mas se existir por bug a
       tela precisa DENUNCIAR, não esconder. */
    assert.equal(formatarReais(-reaisParaMicros(5.5)), '-R$ 5,50');
  });
});

describe('câmbio', () => {
  test('a cotação também é inteira, em milésimos', () => {
    assert.equal(cotacaoParaMilesimos(5.42), 5420);
  });

  test('converte micro-dólar em micro-real pela cotação dada', () => {
    // US$ 1,00 = 1.000.000 micro-dólares; a R$ 5,42 → R$ 5,42
    assert.equal(usdParaMicrosBrl(1_000_000, 5420), reaisParaMicros(5.42));
  });

  test('custo abaixo de um centavo sobrevive à conversão', () => {
    /* Classificar uma idéia custa ~US$ 0,00175. Este é O caso que
       derrubou a ideia de guardar tudo em centavo: em centavos isto
       vira 0 ou 1, os dois errados. */
    const micros = usdParaMicrosBrl(1_750, 5420);
    assert.equal(micros, 9_485);            // R$ 0,009485
    assert.ok(micros > 0, 'não pode virar zero');
    assert.ok(micros < 10_000, 'é mesmo menos de um centavo');
  });
});

describe('a comissão de 30%', () => {
  test('trinta por cento são 3000 pontos-base', () => {
    /* Subiu de 500 (5%) em 14/09/2026 — DIN-008. Este teste existe
       para a alíquota não mudar por descuido: mexer nela é decisão
       de negócio, e quebrar um teste é o jeito de ser avisado. */
    assert.equal(COMISSAO_PONTOS_BASE, 3000);
  });

  test('devolve custo, comissão e total separados — nunca só a soma', () => {
    const c = comissaoSobre(MICROS_POR_REAL); // custo de R$ 1,00
    assert.equal(c.custoMicros, 1_000_000);
    assert.equal(c.comissaoMicros, 300_000);  // R$ 0,30
    assert.equal(c.totalMicros, 1_300_000);   // R$ 1,30
  });

  test('o total é sempre custo + comissão, sem sobra nem falta', () => {
    for (const custo of [0, 1, 7, 9_485, 123_456, 1_000_000, 999_999_999]) {
      const c = comissaoSobre(custo);
      assert.equal(c.totalMicros, c.custoMicros + c.comissaoMicros, `falhou em ${custo}`);
    }
  });

  test('custo zero não gera comissão', () => {
    const c = comissaoSobre(0);
    assert.deepEqual(c, { custoMicros: 0, comissaoMicros: 0, totalMicros: 0 });
  });

  test('arredonda para baixo — a sobra de meio micro fica com o usuário', () => {
    /* 30% de 3 micros = 0,9. Para baixo: 0. */
    assert.equal(comissaoSobre(3).comissaoMicros, 0);
    /* 30% de 10 micros = 3,0 exato. */
    assert.equal(comissaoSobre(10).comissaoMicros, 3);
  });

  test('a comissão nunca ultrapassa 30% do custo', () => {
    for (const custo of [1, 3, 10, 19, 20, 21, 9_485, 1_000_000]) {
      const c = comissaoSobre(custo);
      assert.ok(
        c.comissaoMicros <= custo * 0.3,
        `comissão ${c.comissaoMicros} passou de 30% de ${custo}`,
      );
    }
  });

  test('custo negativo é erro, não um crédito silencioso', () => {
    /* Sem isto, um custo negativo viraria comissão negativa e
       DEVOLVERIA dinheiro. Falhar alto é o certo. */
    assert.throws(() => comissaoSobre(-1), RangeError);
    assert.throws(() => comissaoSobre(NaN), RangeError);
  });
});
