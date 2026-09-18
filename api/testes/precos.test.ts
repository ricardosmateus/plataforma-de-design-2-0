/* Testes de `src/creditos/precos.ts` — puros, sem banco e sem rede. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  precoDe, custoUsdMicros, lerUso, TABELA, tokensEstimados, tetoUsdMicros,
  PRECO_BUSCA_USD_MICROS, custoBuscasUsdMicros, entradaEstimadaComBusca,
  entradaEstimadaComFerramentas, tetoBuscaUsdMicros, TOKENS_POR_RODADA_DE_BUSCA,
} from '../src/creditos/precos.js';
import {
  MAX_BUSCAS, MAX_LEITURAS, MAX_TOKENS_POR_PAGINA, MAX_TOKENS_SAIDA,
} from '../src/pesquisa/provedor-claude-busca.js';
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
    /* Era R$ 1,00 com a comissão de 5%; com 30% (DIN-008, 14/09/2026)
       o mesmo consumo sai por R$ 1,23. O custo do provedor não mudou:
       R$ 0,9485 nas cem chamadas. */
    assert.equal(formatarReais(total), 'R$ 1,23');
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

describe('a busca encadeada tem preço, e ele é a maior parte da conta', () => {
  test('US$ 0,01 por busca — preço de tabela, não estimativa', () => {
    assert.equal(PRECO_BUSCA_USD_MICROS, 10_000);
    assert.equal(custoBuscasUsdMicros(4), 40_000);
  });

  test('zero, nulo e negativo não viram cobrança', () => {
    assert.equal(custoBuscasUsdMicros(0), 0);
    assert.equal(custoBuscasUsdMicros(undefined), 0);
    assert.equal(custoBuscasUsdMicros(-3), 0);
  });

  test('na investigação da Loggi, a busca custou MAIS que os tokens', () => {
    /* Os números vieram da razão em 14/09/2026: 4 buscas,
       31.196 tokens de entrada, 982 de saída, em Haiku. Enquanto a
       busca não tinha preço, a plataforma cobrava menos da metade do
       que pagava — e os 30% de comissão incidiam sobre essa metade. */
    const tokens = custoUsdMicros('claude-haiku-4-5', {
      entrada: 31_196, saida: 982, cacheEscrita: 0, cacheLeitura: 0,
    }) as number;
    const buscas = custoBuscasUsdMicros(4);
    assert.ok(buscas > tokens, `buscas ${buscas} deveria passar de tokens ${tokens}`);
  });
});

describe('o teto de uma chamada COM ferramenta', () => {
  const PROMPT = 'x'.repeat(3000); // ~1000 tokens

  test('a entrada cresce com as rodadas, não só com o prompt', () => {
    /* O resultado da web volta para o contexto e o contexto inteiro
       é reenviado a cada rodada. Foi o que a estimativa antiga
       ignorava. */
    const semBusca = tokensEstimados(PROMPT);
    const comBusca = entradaEstimadaComBusca(PROMPT, 4);
    assert.ok(comBusca > semBusca * 10, `${comBusca} vs ${semBusca}`);
  });

  test('e bate com o que a razão registrou de verdade', () => {
    /* 4 buscas, prompt de ~1000 tokens: medido 31.196. O modelo não
       precisa acertar na mosca — precisa estar na mesma ordem de
       grandeza, porque é isso que separa uma reserva que protege de
       uma que não protege. */
    const estimado = entradaEstimadaComBusca(PROMPT, 4);
    assert.ok(estimado > 20_000 && estimado < 45_000, `estimou ${estimado}, mediu 31.196`);
  });

  test('sem busca nenhuma, cai no mesmo valor do teto simples', () => {
    assert.equal(entradaEstimadaComBusca(PROMPT, 0), tokensEstimados(PROMPT));
  });

  test('o teto com ferramenta é muito maior que o teto simples', () => {
    const simples = tetoUsdMicros('claude-haiku-4-5', PROMPT, 1024) as number;
    const comBusca = tetoBuscaUsdMicros('claude-haiku-4-5', PROMPT, 1024, 5) as number;
    assert.ok(comBusca > simples * 5, `${comBusca} vs ${simples}`);
  });

  test('e cobre o custo real daquela investigação', () => {
    /* A prova que importa: o teto RESERVADO tem que ser maior que o
       que a chamada de fato custou. Uma reserva menor que o consumo
       é uma reserva que não reserva. */
    const real =
      (custoUsdMicros('claude-haiku-4-5', { entrada: 31_196, saida: 982, cacheEscrita: 0, cacheLeitura: 0 }) as number) +
      custoBuscasUsdMicros(4);
    const teto = tetoBuscaUsdMicros('claude-haiku-4-5', PROMPT, 1024, 5) as number;
    assert.ok(teto >= real, `teto ${teto} menor que o real ${real}`);
  });

  test('modelo desconhecido continua sem teto — não se chuta preço', () => {
    assert.equal(tetoBuscaUsdMicros('modelo-que-nao-existe', PROMPT, 1024, 5), null);
  });
});

describe('página lida também entra na conta — Fase 1b', () => {
  const PROMPT = 'x'.repeat(3000); // ~1000 tokens

  test('ler páginas custa mais entrada do que só buscar', () => {
    /* `web_fetch` não cobra por uso, mas a página entra no contexto e
       volta a cada rodada. Ignorar isso seria repetir o defeito que
       já custou uma reserva que não reservava. */
    const soBusca = tetoBuscaUsdMicros('claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS) as number;
    const comLeitura = tetoBuscaUsdMicros(
      'claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS, MAX_LEITURAS, MAX_TOKENS_POR_PAGINA,
    ) as number;
    assert.ok(comLeitura > soBusca, `${comLeitura} deveria passar de ${soBusca}`);
  });

  test('leitura e busca contam como rodadas — as duas fazem o modelo responder de novo', () => {
    const so5 = entradaEstimadaComFerramentas(PROMPT, 5, TOKENS_POR_RODADA_DE_BUSCA);
    const oito = entradaEstimadaComFerramentas(PROMPT, 8, TOKENS_POR_RODADA_DE_BUSCA);
    assert.ok(oito > so5);
  });

  test('com leitura, o peso por rodada é o da PÁGINA — a reserva erra para cima', () => {
    /* Errar para cima só reserva um pouco a mais, e o troco volta em
       `liberar`. Errar para baixo deixa passar chamada sem saldo. */
    const teto = tetoBuscaUsdMicros(
      'claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS, MAX_LEITURAS, MAX_TOKENS_POR_PAGINA,
    ) as number;
    const comPesoDeBusca = tetoBuscaUsdMicros(
      'claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS, MAX_LEITURAS, TOKENS_POR_RODADA_DE_BUSCA,
    ) as number;
    assert.ok(teto > comPesoDeBusca);
  });

  test('sem leitura nenhuma, a conta é a mesma de antes', () => {
    const a = tetoBuscaUsdMicros('claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS) as number;
    const b = tetoBuscaUsdMicros('claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS, 0, MAX_TOKENS_POR_PAGINA) as number;
    assert.equal(a, b);
  });

  test('os tetos do provedor são os que a reserva usa — sem cópia', () => {
    /* Constante de custo repetida é reserva que diverge do provedor
       na primeira vez que alguém ajusta um dos dois lados. A rota
       importa estes valores em vez de copiá-los; este teste é o que
       acusa se alguém voltar a copiar. */
    assert.equal(MAX_BUSCAS, 5);
    assert.equal(MAX_LEITURAS, 3);
    assert.equal(MAX_TOKENS_POR_PAGINA, 4_000);
    assert.equal(MAX_TOKENS_SAIDA, 2_048);
  });

  test('o teto da investigação cabe no limite de R$ 3 (D2)', () => {
    /* Se o pior caso passasse do teto por investigação, toda
       investigação começaria sendo recusada por saldo. */
    const usd = tetoBuscaUsdMicros(
      'claude-haiku-4-5', PROMPT, MAX_TOKENS_SAIDA, MAX_BUSCAS, MAX_LEITURAS, MAX_TOKENS_POR_PAGINA,
    ) as number;
    const reais = (usd / 1e6) * 5.4 * 1.3;
    assert.ok(reais < 3, `pior caso deu R$ ${reais.toFixed(2)}, e o teto de D2 é R$ 3`);
    console.log(`      (pior caso da investigação: ~R$ ${reais.toFixed(2)})`);
  });
});
