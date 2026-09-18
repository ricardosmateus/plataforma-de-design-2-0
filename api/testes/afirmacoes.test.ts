/* Testes de `afirmacoesDosBlocos` — puros, sem rede.

   É esta função que decide o que a pessoa vai ler como "afirmação
   com fonte". Uma afirmação marcada como sustentada quando não está
   é o pior defeito possível neste produto — quem lê vai decidir
   dinheiro em cima dela (PES-006). */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { afirmacoesDosBlocos, type BlocoCitado } from '../src/pesquisa/provedor-claude-busca.js';
import type { Fonte } from '../src/pesquisa/provedor.js';

const FONTES: Fonte[] = [
  { url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto' },
  { url: 'https://pt.wikipedia.org/wiki/Loggi', titulo: 'Wikipédia' },
];

function bloco(texto: string, urls: string[] = [], inicio = 0): BlocoCitado {
  return {
    texto,
    citacoes: urls.map((url) => ({ url, cited_text: 'trecho de ' + url })),
    inicio,
  };
}

const LONGA = 'A Loggi conta com mais de 1.700 pontos de coleta espalhados pelo Brasil.';

describe('a fonte vem da origem, não de uma segunda leitura', () => {
  test('bloco citado vira afirmação com o índice da fonte', () => {
    const [a] = afirmacoesDosBlocos([bloco(LONGA, ['https://www.loggi.com/loggiponto/'])], FONTES);
    assert.equal(a!.texto, LONGA);
    assert.deepEqual(a!.fonteIds, [0]);
    assert.equal(a!.semFonte, false);
  });

  test('o trecho citado viaja junto — é ele que sobrevive à página sair do ar', () => {
    const [a] = afirmacoesDosBlocos([bloco(LONGA, ['https://pt.wikipedia.org/wiki/Loggi'])], FONTES);
    assert.equal(a!.trechos.length, 1);
    assert.match(a!.trechos[0]!, /wikipedia/);
  });

  test('índice, não URL copiada — a lista é a única verdade sobre as fontes', () => {
    const [a] = afirmacoesDosBlocos([bloco(LONGA, ['https://pt.wikipedia.org/wiki/Loggi'])], FONTES);
    assert.deepEqual(a!.fonteIds, [1]);
  });

  test('duas citações da mesma fonte contam uma vez', () => {
    const b = bloco(LONGA, ['https://www.loggi.com/loggiponto/', 'https://www.loggi.com/loggiponto/']);
    const [a] = afirmacoesDosBlocos([b], FONTES);
    assert.deepEqual(a!.fonteIds, [0]);
  });

  test('citação de URL que não está na lista é ignorada, não inventa fonte', () => {
    const [a] = afirmacoesDosBlocos([bloco(LONGA, ['https://outra.com/x'])], FONTES);
    assert.deepEqual(a!.fonteIds, []);
    assert.equal(a!.semFonte, true);
  });
});

describe('PES-006 — afirmação sem fonte é marcada, nunca escondida', () => {
  test('bloco sem citação entra na lista, marcado', () => {
    /* Sumir com ela seria pior do que mostrá-la: quem lê acharia que
       a resposta inteira tem fonte. */
    const as = afirmacoesDosBlocos([bloco(LONGA)], FONTES);
    assert.equal(as.length, 1);
    assert.equal(as[0]!.semFonte, true);
  });

  test('a resposta mista mostra as duas, e dá para contar', () => {
    const as = afirmacoesDosBlocos(
      [
        bloco(LONGA, ['https://www.loggi.com/loggiponto/'], 0),
        bloco('Não há dados recentes sobre quantas outras operam nesse modelo.', [], 80),
      ],
      FONTES,
    );
    assert.equal(as.length, 2);
    assert.equal(as.filter((a) => a.semFonte).length, 1);
  });
});

describe('o que NÃO é afirmação', () => {
  test('cabeçalho não vira afirmação sem fonte', () => {
    /* Cabeçalho é rótulo do que vem abaixo. Marcá-lo "sem fonte"
       encheria a tela de aviso onde não há nada a sustentar — é o
       cuidado que faltou em 14/09/2026, quando cabeçalho virou
       "pergunta em aberto". */
    const as = afirmacoesDosBlocos(
      [bloco('### 2. A Loggi opera serviço de ponto de coleta em condomínios residenciais?')],
      FONTES,
    );
    assert.deepEqual(as, []);
  });

  test('cola curta não vira afirmação', () => {
    assert.deepEqual(afirmacoesDosBlocos([bloco('Além disso:'), bloco('Em 2024.')], FONTES), []);
  });

  test('bloco vazio não vira nada', () => {
    assert.deepEqual(afirmacoesDosBlocos([bloco('   ')], FONTES), []);
  });
});

describe('a posição é preservada — é ela que casa afirmação e quadro', () => {
  test('cada afirmação guarda onde começa dentro da resposta', () => {
    const as = afirmacoesDosBlocos(
      [bloco(LONGA, [], 0), bloco('Outra frase longa o suficiente para contar como afirmação.', [], 140)],
      FONTES,
    );
    assert.deepEqual(as.map((a) => a.inicio), [0, 140]);
  });
});

describe('provedor sem citações estruturadas', () => {
  test('lista vazia, e vazio significa "não sei de onde veio cada frase"', () => {
    /* Não significa "toda frase tem fonte". A diferença importa: um
       provedor futuro sem citações não pode fazer a tela afirmar
       procedência que ninguém verificou. */
    assert.deepEqual(afirmacoesDosBlocos([], FONTES), []);
  });
});
