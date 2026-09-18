/* Testes de `src/pesquisa/saidas.ts` — puros, sem banco e sem rede.

   O que está sendo provado é BOARD-PESQUISA-012: *nenhum nível é
   beco sem saída para uma tarefa que a pessoa já criou*. Uma regra
   assim só vale se for verificável, e a verificação tem dois lados
   — toda recusa oferece caminho, e nenhum caminho oferecido leva a
   outra recusa. O segundo é o que costuma quebrar depois. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  executavelAgora,
  impedimentoDe,
  saidasDe,
  type Configurado,
} from '../src/pesquisa/saidas.js';
import type { Nivel } from '../src/pesquisa/roteador.js';

const NIVEIS: Nivel[] = ['conhecimento', 'busca', 'lugares', 'navegacao'];
const TUDO_LIGADO: Configurado = { busca: true, lugares: true };
const SO_BUSCA: Configurado = { busca: true, lugares: false };
const NADA: Configurado = { busca: false, lugares: false };

describe('BOARD-PESQUISA-012 — nenhum nível é beco sem saída', () => {
  test('com a busca ligada, todo nível que não executa oferece caminho', () => {
    for (const nivel of NIVEIS) {
      if (executavelAgora(nivel, TUDO_LIGADO)) continue;
      const saidas = saidasDe({ nivel, decidido: true }, TUDO_LIGADO);
      assert.ok(
        saidas.length > 0,
        `${nivel} recusou e não ofereceu nada — é o beco sem saída que a regra proíbe`,
      );
    }
  });

  test('toda recusa tem texto, e nenhum texto pede para reescrever a tarefa', () => {
    for (const nivel of NIVEIS) {
      const texto = impedimentoDe(nivel, NADA);
      assert.ok(texto, `${nivel} recusou em silêncio`);
      /* O defeito que originou a Fase 0: a tela mandava a pessoa
         consertar a tarefa para compensar um limite nosso. */
      assert.doesNotMatch(
        texto!,
        /reescrev|reformul|deixe a tarefa|torne a tarefa/i,
        `o texto de ${nivel} ainda empurra o trabalho para o usuário: "${texto}"`,
      );
    }
  });

  test('nenhuma saída oferecida leva a outra recusa', () => {
    /* A armadilha: oferecer "Buscar por proximidade" numa
       instalação sem provedor de lugares. O botão apareceria, a
       pessoa clicaria, e receberia 503 — duas recusas onde havia
       uma. */
    for (const configurado of [TUDO_LIGADO, SO_BUSCA, NADA]) {
      for (const nivel of NIVEIS) {
        for (const decidido of [true, false]) {
          for (const s of saidasDe({ nivel, decidido }, configurado)) {
            assert.ok(
              executavelAgora(s.nivel, configurado),
              `"${s.rotulo}" foi oferecida para ${nivel} mas ${s.nivel} não executa nesta configuração`,
            );
          }
        }
      }
    }
  });

  test('navegação nunca é oferecida como saída — é recusa permanente, não opção cara', () => {
    for (const configurado of [TUDO_LIGADO, SO_BUSCA, NADA]) {
      for (const nivel of NIVEIS) {
        for (const decidido of [true, false]) {
          const tem = saidasDe({ nivel, decidido }, configurado).some((s) => s.nivel === 'navegacao');
          assert.equal(tem, false, `navegação apareceu como saída de ${nivel} — PES-005 diz que não`);
        }
      }
    }
  });

  test('a saída nunca repete o nível que já foi tentado', () => {
    for (const nivel of NIVEIS) {
      const tem = saidasDe({ nivel, decidido: true }, TUDO_LIGADO).some((s) => s.nivel === nivel);
      assert.equal(tem, false, `${nivel} ofereceu ${nivel} como saída de si mesmo`);
    }
  });
});

describe('o caso do Ricardo — conhecimento deixa de ser porta fechada', () => {
  test('conhecimento oferece "Buscar assim mesmo" quando a busca está ligada', () => {
    const saidas = saidasDe({ nivel: 'conhecimento', decidido: true }, TUDO_LIGADO);
    assert.equal(saidas.length, 1);
    assert.equal(saidas[0]!.nivel, 'busca');
    assert.match(saidas[0]!.rotulo, /assim mesmo/i);
    /* O custo tem que estar dito antes do clique: PES-007. */
    assert.match(saidas[0]!.explicacao, /crédito/i);
  });

  test('o texto admite que a leitura pode estar errada', () => {
    /* Sem isso, o botão ao lado lê como teimosia: "não é busca,
       mas busque". Admitir a falibilidade é o que faz a oferta
       fazer sentido — e no caso que originou tudo isto, a
       heurística ESTAVA errada. */
    const texto = impedimentoDe('conhecimento', TUDO_LIGADO) ?? impedimentoDe('conhecimento', NADA)!;
    assert.match(texto, /posso estar errado/i);
  });
});

describe('proximidade só quando a pergunta é geográfica', () => {
  test('não é oferecida para uma tarefa de reflexão', () => {
    const saidas = saidasDe({ nivel: 'conhecimento', decidido: true }, TUDO_LIGADO);
    assert.equal(saidas.some((s) => s.nivel === 'lugares'), false);
  });

  test('é oferecida na disputa navegação × lugares, que é onde o 409 nasce', () => {
    const saidas = saidasDe({ nivel: 'navegacao', decidido: false }, TUDO_LIGADO);
    assert.deepEqual(saidas.map((s) => s.nivel), ['busca', 'lugares']);
  });

  test('navegação decidida oferece só busca — não havia sinal de lugar', () => {
    const saidas = saidasDe({ nivel: 'navegacao', decidido: true }, TUDO_LIGADO);
    assert.deepEqual(saidas.map((s) => s.nivel), ['busca']);
  });
});

describe('quando não há nada a oferecer, o silêncio é honesto', () => {
  test('sem provedor nenhum, busca recusa e não inventa opção', () => {
    assert.deepEqual(saidasDe({ nivel: 'busca', decidido: true }, NADA), []);
    assert.match(impedimentoDe('busca', NADA)!, /não está ligada/i);
  });

  test('nível que executa não tem impedimento', () => {
    assert.equal(impedimentoDe('busca', TUDO_LIGADO), null);
    assert.equal(impedimentoDe('lugares', TUDO_LIGADO), null);
  });
});
