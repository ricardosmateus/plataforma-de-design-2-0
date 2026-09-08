/* ============================================================
   A regra crítica do grafo, coberta sem banco
   ============================================================
   "Se sair de finalizado, sai do mapa." As nove combinações de
   coluna estão aqui — inclusive as que não deveriam acontecer —
   porque o custo de cobrir todas é zero e a que escapa é sempre a
   que ninguém imaginou.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { planejarTransicao, type StatusIdeia } from '../src/ideias/transicao.js';

const COLUNAS: StatusIdeia[] = ['ideias', 'andamento', 'finalizado'];

describe('sair de finalizado limpa — a regra crítica', () => {
  for (const destino of ['ideias', 'andamento'] as StatusIdeia[]) {
    test(`finalizado → ${destino} limpa e não classifica`, () => {
      assert.deepEqual(planejarTransicao('finalizado', destino), {
        limpar: true,
        classificar: false,
      });
    });
  }

  test('nenhuma outra transição limpa', () => {
    for (const de of COLUNAS) {
      for (const para of COLUNAS) {
        if (de === 'finalizado' && para !== 'finalizado') continue;
        assert.equal(
          planejarTransicao(de, para).limpar,
          false,
          `${de} → ${para} não deveria limpar`,
        );
      }
    }
  });
});

describe('entrar em finalizado classifica', () => {
  for (const origem of ['ideias', 'andamento'] as StatusIdeia[]) {
    test(`${origem} → finalizado classifica e não limpa`, () => {
      assert.deepEqual(planejarTransicao(origem, 'finalizado'), {
        limpar: false,
        classificar: true,
      });
    });
  }

  test('nenhuma outra transição classifica', () => {
    for (const de of COLUNAS) {
      for (const para of COLUNAS) {
        if (para === 'finalizado' && de !== 'finalizado') continue;
        assert.equal(
          planejarTransicao(de, para).classificar,
          false,
          `${de} → ${para} não deveria classificar`,
        );
      }
    }
  });
});

describe('casos de borda', () => {
  test('soltar na mesma coluna não faz nada', () => {
    for (const c of COLUNAS) {
      assert.deepEqual(planejarTransicao(c, c), { limpar: false, classificar: false });
    }
  });

  test('entre ideias e andamento a taxonomia não é tocada', () => {
    assert.deepEqual(planejarTransicao('ideias', 'andamento'), {
      limpar: false,
      classificar: false,
    });
    assert.deepEqual(planejarTransicao('andamento', 'ideias'), {
      limpar: false,
      classificar: false,
    });
  });

  test('limpar e classificar nunca acontecem juntos', () => {
    /* Se um dia acontecessem, a ordem entre a escrita síncrona e o
       disparo assíncrono passaria a importar — e essa é exatamente
       a corrida que o módulo foi desenhado para não ter. */
    for (const de of COLUNAS) {
      for (const para of COLUNAS) {
        const p = planejarTransicao(de, para);
        assert.ok(!(p.limpar && p.classificar), `${de} → ${para}`);
      }
    }
  });

  test('uma coluna nova qualquer já nasce limpando ao sair de finalizado', () => {
    /* A regra é escrita como o complemento de "finalizado", não
       como lista de destinos. Este teste é o que impede alguém de
       trocar por uma lista sem perceber o efeito. */
    const inventada = 'em_revisao' as StatusIdeia;
    assert.deepEqual(planejarTransicao('finalizado', inventada), {
      limpar: true,
      classificar: false,
    });
  });
});
