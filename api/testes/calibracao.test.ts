/* Testes da calibração da avaliação — IA-AVAL-014.

   A calibração decide os limites que a tela vai usar. Se ela errar
   a conta, o selo mostra "alta" para o que a pessoa acha ruim. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analisar, lerMarcacoes, faixaComCortes, melhoresCortes, type LinhaAvaliada, type Marcacao } from '../src/ia/avaliacao/calibracao.js';

const linha = (id: string, geral: number | null, crit: Record<string, number> = {}): LinhaAvaliada => ({
  id,
  geral,
  faixa: geral === null ? 'nao_avaliado' : geral >= 80 ? 'alta' : geral >= 50 ? 'revisar' : 'baixa',
  avaliador: 'jev',
  criterios: Object.fromEntries(Object.entries(crit).map(([k, pct]) => [k, { pct, confianca: null }])),
});

describe('faixas', () => {
  test('cortes', () => {
    assert.equal(faixaComCortes(80, { alta: 80, revisar: 50 }), 'alta');
    assert.equal(faixaComCortes(79, { alta: 80, revisar: 50 }), 'revisar');
    assert.equal(faixaComCortes(49, { alta: 80, revisar: 50 }), 'baixa');
  });

  test('concordância e matriz com os cortes atuais', () => {
    const r = analisar(
      [linha('a', 90), linha('b', 70), linha('c', 20), linha('d', 85)],
      [
        { id: 'a', faixa: 'alta' },
        { id: 'b', faixa: 'baixa' },
        { id: 'c', faixa: 'baixa' },
        { id: 'd', faixa: 'revisar' },
      ],
    );
    assert.equal(r.n, 4);
    assert.equal(r.concordancia, 0.5);
    assert.equal(r.matriz.alta.alta, 1);
    assert.equal(r.matriz.alta.revisar, 1);
    assert.equal(r.matriz.revisar.baixa, 1);
  });

  test('sugere cortes que concordam mais, e empate fica nos atuais', () => {
    const pares = [90, 88, 72, 70].map((g, i) => ({
      l: { ...linha(String(i), g), geral: g },
      m: { id: String(i), faixa: (g >= 88 ? 'alta' : 'revisar') as Marcacao['faixa'] },
    }));
    const s = melhoresCortes(pares)!;
    assert.equal(s.acerto, 1);
    assert.ok(s.alta > 72 && s.alta <= 88);
    const perfeitos = melhoresCortes([{ l: { ...linha('x', 90), geral: 90 }, m: { id: 'x', faixa: 'alta' } }])!;
    assert.deepEqual([perfeitos.alta, perfeitos.revisar], [80, 50]);
  });

  test('sem nota e sem marcação são contados à parte', () => {
    const r = analisar([linha('a', null), linha('b', 60), linha('c', 60)], [{ id: 'a', faixa: 'alta' }, { id: 'b', faixa: 'revisar' }]);
    assert.equal(r.semNota, 1);
    assert.equal(r.semMarcacao, 1);
    assert.equal(r.n, 1);
  });

  test('amostra pequena gera aviso', () => {
    const r = analisar([linha('a', 90)], [{ id: 'a', faixa: 'alta' }]);
    assert.match(r.avisos.join(' '), /Amostra pequena/);
  });
});

describe('alertas', () => {
  test('C4 contra "inventa fato": precisão, revocação e limiar sugerido', () => {
    const linhas = [linha('a', 50, { c4: 96 }), linha('b', 60, { c4: 56 }), linha('c', 90, { c4: 9 }), linha('d', 90, { c4: 60 })];
    const marc: Marcacao[] = [
      { id: 'a', faixa: 'baixa', inventaFato: true },
      { id: 'b', faixa: 'revisar', inventaFato: false },
      { id: 'c', faixa: 'alta', inventaFato: false },
      { id: 'd', faixa: 'alta', inventaFato: false },
    ];
    const c4 = analisar(linhas, marc).alertas.find((a) => a.criterio === 'c4')!;
    assert.equal(c4.n, 4);
    assert.equal(c4.atual!.acerto, 0.5);
    assert.equal(c4.atual!.precisao, 0.333);
    assert.equal(c4.atual!.revocacao, 1);
    assert.equal(c4.sugerido!.acerto, 1);
    assert.ok(c4.sugerido!.limiar >= 60 && c4.sugerido!.limiar < 96);
  });

  test('C6 volta a ser "genérica" (100 − específica)', () => {
    const r = analisar([linha('a', 60, { c6: 8 }), linha('b', 90, { c6: 74 })], [
      { id: 'a', faixa: 'revisar', generica: true },
      { id: 'b', faixa: 'alta', generica: false },
    ]);
    const c6 = r.alertas.find((a) => a.criterio === 'c6')!;
    assert.equal(c6.atual!.acerto, 1);
  });

  test('campo não marcado não entra na conta', () => {
    const r = analisar([linha('a', 60, { c8: 90 })], [{ id: 'a', faixa: 'revisar' }]);
    assert.equal(r.alertas.find((a) => a.criterio === 'c8')!.n, 0);
  });
});

describe('lerMarcacoes', () => {
  test('aceita { marcacoes: [...] } e descarta item inválido', () => {
    const m = lerMarcacoes({ marcacoes: [{ id: 'a', faixa: 'alta', generica: false }, { id: 'b', faixa: 'ótima' }, { faixa: 'alta' }] });
    assert.deepEqual(m, [{ id: 'a', faixa: 'alta', generica: false }]);
  });

  test('arquivo sem lista é erro', () => {
    assert.throws(() => lerMarcacoes({ outra: 1 }), /marcacoes/);
  });
});

import { CENARIOS, idCaso } from '../src/ia/avaliacao/gabarito.js';
import { interpretarRevisao, mensagemRevisor } from '../src/ia/avaliacao/revisor-claude.js';
import { montarLoteIdeias } from '../src/ia/avaliacao/perguntas.js';
import { tabelaDivergencias, secaoRelatorio } from '../src/ia/avaliacao/calibracao.js';

describe('gabarito', () => {
  test('toda etapa "duplicada" tem idéia existente para repetir', () => {
    for (const c of CENARIOS) {
      if (c.casos.some((k) => k.rotulo === 'duplicada')) assert.ok(c.contexto.existentes.length, c.id);
    }
  });

  test('cada cenário vira um lote válido, com ids únicos', () => {
    const ids = new Set<string>();
    for (const c of CENARIOS) {
      const lote = montarLoteIdeias({ ...c.contexto, etapas: c.casos });
      assert.ok(Object.keys(lote.questions).length >= c.casos.length * 6);
      c.casos.forEach((_, i) => ids.add(idCaso(c.id, i)));
    }
    assert.equal(ids.size, CENARIOS.reduce((n, c) => n + c.casos.length, 0));
  });

  test('há casos de cada defeito', () => {
    const rotulos = new Set(CENARIOS.flatMap((c) => c.casos.map((k) => k.rotulo)));
    for (const r of ['boa', 'generica', 'inventa_fato', 'duplicada', 'fora_do_projeto']) assert.ok(rotulos.has(r as never), r);
  });
});

describe('revisor Claude', () => {
  test('interpreta revisões na ordem e ignora as inválidas', () => {
    const r = interpretarRevisao(
      '{"revisoes":[{"i":0,"faixa":"alta","generica":false},{"i":1,"faixa":"péssima"},{"i":2,"faixa":"baixa","inventaFato":true}]}',
      3,
    );
    assert.deepEqual(r[0], { faixa: 'alta', generica: false, inventaFato: false, duplicada: false });
    assert.equal(r[1], null);
    assert.equal(r[2]!.inventaFato, true);
  });

  test('texto que não é JSON devolve tudo nulo, sem lançar', () => {
    assert.deepEqual(interpretarRevisao('desculpe', 2), [null, null]);
  });

  test('a mensagem leva ficha, existentes e as etapas numeradas', () => {
    const c = CENARIOS[0]!;
    const m = mensagemRevisor({ ...c.contexto, etapas: c.casos.slice(0, 2) });
    assert.match(m, /Curitiba/);
    assert.match(m, /Pesquisar referências/);
    assert.match(m, /^1\. /m);
  });
});

describe('relatório', () => {
  test('divergências listam faixa e alerta errados', () => {
    const t = tabelaDivergencias([
      {
        titulo: 'Planejar o projeto',
        rotulo: 'generica',
        esperado: { faixa: 'revisar', generica: true, inventaFato: false, duplicada: false },
        linha: { id: 'x', geral: 87, faixa: 'alta', avaliador: 'jev', criterios: { c4: { pct: 56, confianca: null }, c6: { pct: 8, confianca: null } } },
      },
    ]);
    assert.match(t, /faixa alta \(esperado revisar\)/);
    assert.match(t, /alertou inventa fato \(56%\)/);
    assert.doesNotMatch(t, /genérica/);
  });

  test('sem divergências, diz isso', () => {
    assert.match(tabelaDivergencias([]), /acertou todas/);
  });

  test('seção do relatório tem faixa e alertas', () => {
    const r = analisar([linha('a', 90)], [{ id: 'a', faixa: 'alta' }]);
    const md = secaoRelatorio(r, 'Gabarito', 'teste');
    assert.match(md, /## Gabarito/);
    assert.match(md, /### Alertas/);
    assert.match(md, /\| JEV \\ Referência/);
  });
});
