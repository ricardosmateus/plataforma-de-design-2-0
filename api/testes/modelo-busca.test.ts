/* Testes de `escolherModeloDaBusca` e do preço que falta — puros.

   POR QUE ESTE ARQUIVO EXISTE
   Em 15/09/2026 o modelo da síntese e o do planejador passaram a
   poder ser diferentes (`IA_MODELO_BUSCA`). Isso abriu duas portas
   estreitas, e as duas dão para o mesmo lugar: uma busca que
   acontece e ninguém consegue cobrar.

   1. Variável em branco vira modelo vazio.
   2. Modelo fora da tabela de preços vira busca de graça — sem
      teto, sem reserva e sem consumo lançado, porque `custoDe`
      também devolve `null`. As buscas encadeadas (US$ 0,01 cada)
      somem junto. É a mesma família de "consumidor não medido" que
      `DIN-009` fechou. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escolherModeloDaBusca } from '../src/pesquisa/provedor-claude-busca.js';
import { tetoBuscaUsdMicros, tetoUsdMicros } from '../src/creditos/precos.js';

describe('qual modelo sintetiza a busca', () => {
  test('sem IA_MODELO_BUSCA, cai no padrão — o comportamento de antes', () => {
    assert.equal(escolherModeloDaBusca(undefined, 'claude-haiku-4-5'), 'claude-haiku-4-5');
  });

  test('com IA_MODELO_BUSCA, ele ganha', () => {
    assert.equal(
      escolherModeloDaBusca('claude-sonnet-4-5', 'claude-haiku-4-5'),
      'claude-sonnet-4-5',
    );
  });

  test('em branco NÃO é um modelo — cai no padrão', () => {
    /* `IA_MODELO_BUSCA=` passa pelo zod `.optional()` como string
       vazia, e `'' ?? padrao` devolve `''`. O provedor nasceria com
       modelo vazio e só falharia na primeira chamada, depois de a
       pessoa ter clicado em "Buscar agora". */
    assert.equal(escolherModeloDaBusca('', 'claude-haiku-4-5'), 'claude-haiku-4-5');
    assert.equal(escolherModeloDaBusca('   ', 'claude-haiku-4-5'), 'claude-haiku-4-5');
  });

  test('nenhum dos dois: `null`, e quem chama decide', () => {
    assert.equal(escolherModeloDaBusca(undefined, undefined), null);
    assert.equal(escolherModeloDaBusca('', '  '), null);
  });
});

describe('modelo sem preço não pode virar busca', () => {
  const PERGUNTA = 'A Loggi opera ponto de coleta em condomínios?';

  test('a tabela devolve `null` para modelo desconhecido', () => {
    /* É deste `null` que nascia a busca de graça: ele virava
       estimativa 0, e estimativa 0 não reserva nada. */
    assert.equal(tetoBuscaUsdMicros('modelo-que-nao-existe', PERGUNTA, 2048, 5, 3, 4000), null);
    assert.equal(tetoUsdMicros('modelo-que-nao-existe', PERGUNTA, 900), null);
  });

  test('e devolve número para os modelos que a instalação usa', () => {
    for (const m of ['claude-haiku-4-5', 'claude-sonnet-4-5']) {
      const teto = tetoBuscaUsdMicros(m, PERGUNTA, 2048, 5, 3, 4000);
      assert.ok(teto !== null && teto > 0, m + ' ficou sem preço');
    }
  });

  test('um snapshot com data continua tendo preço', () => {
    /* `claude-haiku-4-5-20251001` é o que está no `.env` de verdade.
       Casar por prefixo é o que impede trocar de snapshot de derrubar
       o preço para `null` sem ninguém perceber. */
    assert.notEqual(tetoBuscaUsdMicros('claude-haiku-4-5-20251001', PERGUNTA, 2048, 5, 3, 4000), null);
    assert.notEqual(tetoBuscaUsdMicros('claude-sonnet-4-5-20250929', PERGUNTA, 2048, 5, 3, 4000), null);
  });

  test('Sonnet custa mais que Haiku pela MESMA busca — a conta da decisão D3', () => {
    /* Medido em 15/09/2026: trocar a síntese para Sonnet quase dobra
       a investigação (~R$ 0,69 → ~R$ 1,33). O número exato depende
       da pergunta; o que este teste trava é a direção, para que
       ninguém troque achando que sai igual. */
    const haiku = tetoBuscaUsdMicros('claude-haiku-4-5', PERGUNTA, 2048, 5, 3, 4000)!;
    const sonnet = tetoBuscaUsdMicros('claude-sonnet-4-5', PERGUNTA, 2048, 5, 3, 4000)!;
    assert.ok(sonnet > haiku * 2, `sonnet=${sonnet} haiku=${haiku}`);
  });
});
