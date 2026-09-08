/* Testes de `src/creditos/precos.ts` — puros, sem banco e sem rede. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { precoDe, custoUsdMicros, lerUso, TABELA, tokensEstimados, tetoUsdMicros } from '../src/creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, formatarReais } from '../src/creditos/dinheiro.js';

const NADA = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };

describe('achar o preço do modelo', () => {
  test('casa pelo prefixo, ignorando a data do snapshot', () => {
    /* É o id que o .env usa hoje. Se isto quebrar, todo consumo
       passa a ser gravado sem preço. */
    assert.ok(precoDe('claude-haiku-4-5-20251001'));
    assert.equal(precoDe('claude-haiku-4-5-20251001')?.entrada, 1_000_000);
  });

  test('modelo desconhecido devolve null, não um palpite', () => {
    assert.equal(precoDe('gpt-nao-sei-o-que'), null);
    assert.equal(precoDe(''), null);
    assert.equal(custoUsdMicros('modelo-inventado', { ...NADA, entrada: 1000 }), null);
  });

  test('o prefixo mais específico ganha do mais genérico', () => {
    /* Se um dia entrar 'claude-sonnet' genérico na tabela, ele não
       pode capturar 'claude-sonnet-4-5' e cobrar o preço errado. */
    const p = precoDe('claude-sonnet-4-5-20250929');
    assert.equal(p?.saida, 15_000_000);
  });

  test('toda linha da tabela tem as quatro parcelas', () => {
    for (const [modelo, p] of Object.entries(TABELA)) {
      for (const campo of ['entrada', 'saida', 'cacheEscrita', 'cacheLeitura'] as const) {
        assert.ok(p[campo] > 0, `${modelo}.${campo} precisa de preço`);
      }
      assert.ok(p.saida > p.entrada, `${modelo}: saída deveria custar mais que entrada`);
      assert.ok(p.cacheLeitura < p.entrada, `${modelo}: ler do cache deveria ser mais barato`);
    }
  });
});

describe('calcular o custo', () => {
  test('um milhão de tokens de entrada custa exatamente o preço de tabela', () => {
    assert.equal(
      custoUsdMicros('claude-haiku-4-5', { ...NADA, entrada: 1_000_000 }),
      1_000_000, // US$ 1,00 em micro-dólares
    );
  });

  test('soma as quatro parcelas', () => {
    const custo = custoUsdMicros('claude-haiku-4-5', {
      entrada: 1_000_000,
      saida: 1_000_000,
      cacheEscrita: 1_000_000,
      cacheLeitura: 1_000_000,
    });
    assert.equal(custo, 1_000_000 + 5_000_000 + 1_250_000 + 100_000);
  });

  test('uso zerado custa zero, não null', () => {
    /* Zero e "não sei" são coisas diferentes e não podem se
       confundir na razão. */
    assert.equal(custoUsdMicros('claude-haiku-4-5', NADA), 0);
  });

  test('token negativo é tratado como zero, não como desconto', () => {
    assert.equal(custoUsdMicros('claude-haiku-4-5', { ...NADA, entrada: -5_000_000 }), 0);
  });

  test('a maior conta possível ainda cabe no inteiro seguro', () => {
    /* A guarda que justifica micro-dólar como unidade (ver o
       cabeçalho de precos.ts). Janela cheia no modelo mais caro. */
    const custo = custoUsdMicros('claude-opus-5', {
      entrada: 200_000, saida: 64_000, cacheEscrita: 200_000, cacheLeitura: 200_000,
    });
    assert.ok(custo !== null && Number.isSafeInteger(custo));
  });
});

describe('ler o usage da resposta do provedor', () => {
  test('lê os quatro campos da Anthropic', () => {
    assert.deepEqual(
      lerUso({
        input_tokens: 1500,
        output_tokens: 50,
        cache_creation_input_tokens: 800,
        cache_read_input_tokens: 1200,
      }),
      { entrada: 1500, saida: 50, cacheEscrita: 800, cacheLeitura: 1200 },
    );
  });

  test('campo ausente vira zero em vez de quebrar', () => {
    /* O consumo é registro paralelo: se a leitura falhar, o usuário
       não pode perder a resposta que já foi paga. */
    assert.deepEqual(lerUso({ input_tokens: 10 }), { ...NADA, entrada: 10 });
    assert.deepEqual(lerUso(undefined), NADA);
    assert.deepEqual(lerUso(null), NADA);
    assert.deepEqual(lerUso('lixo'), NADA);
    assert.deepEqual(lerUso({ input_tokens: 'muitos' }), NADA);
  });
});

describe('a conta inteira, ponta a ponta', () => {
  test('classificar uma idéia custa menos de um centavo — e sobrevive', () => {
    /* O caso que obrigou a razão a usar micro de real em vez de
       centavo. Se algum dia isto voltar a dar zero, a plataforma
       está classificando de graça sem saber. */
    const uso = lerUso({ input_tokens: 1500, output_tokens: 50 });
    const usd = custoUsdMicros('claude-haiku-4-5-20251001', uso);
    assert.ok(usd !== null);

    const custoBrl = usdParaMicrosBrl(usd, 5420);
    const c = comissaoSobre(custoBrl);

    assert.ok(c.custoMicros > 0, 'o custo não pode desaparecer no arredondamento');
    assert.ok(c.custoMicros < 10_000, 'e é mesmo menos de um centavo');
    assert.equal(formatarReais(c.totalMicros), 'R$ 0,01');
  });

  test('cem classificações somam um valor visível', () => {
    /* Uma a uma some; cem juntas aparecem. É exatamente por isso
       que arredondar cada uma para zero seria perder receita real. */
    const uso = lerUso({ input_tokens: 1500, output_tokens: 50 });
    const usd = custoUsdMicros('claude-haiku-4-5', uso) as number;
    const total = comissaoSobre(usdParaMicrosBrl(usd, 5420)).totalMicros * 100;
    assert.equal(formatarReais(total), 'R$ 1,00');
  });
});

describe('teto de custo — Fase 2 (IA-CUSTO-002)', () => {
  test('estima tokens por caractere, superestimando de propósito', () => {
    assert.equal(tokensEstimados(''), 0);
    assert.equal(tokensEstimados('abc'), 1);
    assert.equal(tokensEstimados('abcd'), 2); // arredonda para cima
    assert.equal(tokensEstimados('a'.repeat(300)), 100);
  });

  test('modelo desconhecido devolve null, nunca um teto chutado', () => {
    assert.equal(tetoUsdMicros('modelo-inventado', 'qualquer coisa', 1024), null);
  });

  test('o teto usa o texto de entrada estimado e o máximo de saída inteiro', () => {
    const teto = tetoUsdMicros('claude-haiku-4-5', 'x'.repeat(300), 1024);
    const esperado = custoUsdMicros('claude-haiku-4-5', {
      entrada: 100, saida: 1024, cacheEscrita: 0, cacheLeitura: 0,
    });
    assert.equal(teto, esperado);
  });

  test('o teto de uma chamada real é maior que o custo real dela', () => {
    /* É a garantia que sustenta o fluxo inteiro de reserva: o teto
       tem que cobrir o custo verdadeiro, não só coincidir com ele.
       Uma pergunta de 300 caracteres não gera 100 tokens de saída
       de verdade — gera muito menos que o `max_tokens` configurado. */
    const pergunta = 'Qual é o próximo passo do projeto de redesenho do checkout?';
    const teto = tetoUsdMicros('claude-sonnet-5', pergunta, 1024) as number;
    const usoReal = { entrada: tokensEstimados(pergunta), saida: 180, cacheEscrita: 0, cacheLeitura: 0 };
    const custoReal = custoUsdMicros('claude-sonnet-5', usoReal) as number;
    assert.ok(teto >= custoReal, 'o teto precisa cobrir uma saída bem menor que o máximo');
  });
});
