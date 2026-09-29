/* Testes da avaliação de conteúdo de IA — a metade pura, sem rede.

   Regras: ia-avaliacao.md (IA-AVAL)

   O que se prova aqui é o que NÃO pode depender de o avaliador se
   comportar: que o lote não leva dado de pessoa (IA-AVAL-015), que
   resposta quebrada é FALHA e não nota (IA-AVAL-004), que a nota
   geral nunca passa de C1 + 10 (IA-AVAL-008) e que as faixas são as
   de IA-AVAL-009. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarLoteIdeias, idPergunta, ID_C9, type ContextoAvaliacaoIdeias } from '../src/ia/avaliacao/perguntas.js';
import {
  validarRespostas,
  avaliarEtapas,
  calcularGeral,
  faixaDe,
  naoAvaliado,
} from '../src/ia/avaliacao/normalizar.js';

const base: ContextoAvaliacaoIdeias = {
  projetoNome: 'Identidade Visual',
  empresaNome: 'Padaria Grão Fino',
  empresaDescricao: 'Padaria artesanal de bairro em Curitiba, fermentação natural.',
  validadas: ['Público principal são famílias do bairro'],
  existentes: ['Pesquisar referências de padarias artesanais'],
  orientacao: null,
  etapas: [
    { titulo: 'Definir a paleta de cores', descricao: 'Escolher 3 a 5 cores. Entrega: paleta com HEX.' },
    { titulo: 'Planejar o projeto', descricao: 'Organizar as próximas atividades.' },
  ],
};

/* Uma resposta "perfeita" no formato do JEV, para o lote dado. */
function respostasPara(lote: ReturnType<typeof montarLoteIdeias>, ajuste: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(lote.questions)) {
    if (p.type === 'noul') r[id] = { type: 'noul', noul: 0.9 };
    if (p.type === 'choice') r[id] = { type: 'choice', choice: 'sustentada', probabilities: { sustentada: 0.9, sem_base: 0.1, contradiz: 0 }, confidence: 0.9 };
    if (p.type === 'score') r[id] = { type: 'score', score: p.criteria.length - 1, confidence: 0.9 };
  }
  return { ...r, ...ajuste };
}

describe('montarLoteIdeias', () => {
  test('C1–C7 por etapa, C8 com existentes, C9 uma vez, sem C10 sem orientação', () => {
    const lote = montarLoteIdeias(base);
    for (const i of [0, 1]) {
      for (const c of ['c1', 'c2', 'c3', 'c4', 'c6', 'c7', 'c8']) assert.ok(lote.questions[idPergunta(i, c)], `${c} da etapa ${i}`);
      assert.equal(lote.questions[idPergunta(i, 'c10')], undefined);
    }
    assert.ok(lote.questions[ID_C9]);
  });

  test('sem existentes não pergunta C8; com orientação pergunta C10', () => {
    const lote = montarLoteIdeias({ ...base, existentes: [], orientacao: 'as cores já existem' });
    assert.equal(lote.questions[idPergunta(0, 'c8')], undefined);
    assert.ok(lote.questions[idPergunta(0, 'c10')]);
    assert.equal((lote.state.pedido as { orientacao: string }).orientacao, 'as cores já existem');
  });

  test('etapa única não tem C9 (não há ordem a julgar)', () => {
    const lote = montarLoteIdeias({ ...base, etapas: [base.etapas[0]!] });
    assert.equal(lote.questions[ID_C9], undefined);
  });

  test('IA-AVAL-015: o state só tem pedido, evidências, existentes e etapas', () => {
    const lote = montarLoteIdeias(base);
    assert.deepEqual(Object.keys(lote.state).sort(), ['etapas', 'evidencias', 'existentes', 'pedido']);
    assert.doesNotMatch(JSON.stringify(lote.state), /@|usuario|email/i);
  });

  test('sem descrição de empresa, diz isso em vez de mandar vazio', () => {
    const lote = montarLoteIdeias({ ...base, empresaDescricao: null });
    assert.match(JSON.stringify(lote.state), /sem descrição cadastrada/);
  });
});

describe('validarRespostas — IA-AVAL-004', () => {
  const lote = montarLoteIdeias(base);

  test('resposta completa passa', () => {
    assert.ok(validarRespostas(lote, respostasPara(lote)));
  });

  test('pergunta sem resposta é falha', () => {
    const r = respostasPara(lote);
    delete (r as Record<string, unknown>)[idPergunta(1, 'c3')];
    assert.equal(validarRespostas(lote, r), null);
  });

  test('tipo trocado é falha', () => {
    assert.equal(validarRespostas(lote, respostasPara(lote, { [idPergunta(0, 'c3')]: { type: 'score', score: 1 } })), null);
  });

  test('probabilidade fora de 0..1 é falha', () => {
    assert.equal(validarRespostas(lote, respostasPara(lote, { [idPergunta(0, 'c4')]: { type: 'noul', noul: 1.3 } })), null);
  });

  test('escolha fora das opções é falha', () => {
    assert.equal(
      validarRespostas(lote, respostasPara(lote, { [idPergunta(0, 'c1')]: { type: 'choice', choice: 'talvez', probabilities: {}, confidence: 1 } })),
      null,
    );
  });

  test('nota acima do último nível é falha', () => {
    assert.equal(validarRespostas(lote, respostasPara(lote, { [ID_C9]: { type: 'score', score: 7, confidence: 1 } })), null);
  });

  test('não é objeto é falha', () => {
    assert.equal(validarRespostas(lote, null), null);
    assert.equal(validarRespostas(lote, 'oi'), null);
  });
});

describe('nota geral — IA-AVAL-008/009', () => {
  test('pesos 40/30/15/15', () => {
    assert.equal(calcularGeral(100, 100, 100, [100]), 100);
    assert.equal(calcularGeral(50, 100, 100, [100]), 60); // 20+30+15+15 = 80, teto 60
    assert.equal(calcularGeral(80, 60, 100, [40]), 71); // 32+18+15+6
  });

  test('nunca passa de C1 + 10', () => {
    assert.equal(calcularGeral(20, 100, 100, [100]), 30);
  });

  test('faixas', () => {
    assert.equal(faixaDe(80), 'alta');
    assert.equal(faixaDe(79), 'revisar');
    assert.equal(faixaDe(50), 'revisar');
    assert.equal(faixaDe(49), 'baixa');
    assert.equal(faixaDe(null), 'nao_avaliado');
    assert.equal(naoAvaliado().faixa, 'nao_avaliado');
  });
});

describe('avaliarEtapas', () => {
  const lote = montarLoteIdeias(base);

  test('uma avaliação por etapa, com avaliador e modelo', () => {
    const r = validarRespostas(lote, respostasPara(lote))!;
    const a = avaliarEtapas(lote, r, 'jev', 'jev-1.13.0', 2);
    assert.equal(a.length, 2);
    assert.equal(a[0]!.avaliador, 'jev');
    assert.equal(a[0]!.modelo, 'jev-1.13.0');
    assert.equal(a[0]!.criterios.c1!.pct, 90);
    assert.equal(a[0]!.criterios.c2!.pct, 100);
    assert.ok(a[0]!.criterios.c9);
  });

  test('C6 é perguntado como "genérica?" e vale como "específica"', () => {
    const r = validarRespostas(lote, respostasPara(lote, {
      [idPergunta(0, 'c6')]: { type: 'noul', noul: 0.05 },
      [idPergunta(1, 'c6')]: { type: 'noul', noul: 0.96 },
    }))!;
    const a = avaliarEtapas(lote, r, 'jev', null, 2);
    assert.equal(a[0]!.criterios.c6!.pct, 95);
    assert.equal(a[1]!.criterios.c6!.pct, 4);
    assert.ok(a[1]!.geral! < a[0]!.geral!);
  });

  test('alertas: fato inventado, contradição e duplicata', () => {
    const r = validarRespostas(lote, respostasPara(lote, {
      [idPergunta(0, 'c4')]: { type: 'noul', noul: 0.97 },
      [idPergunta(0, 'c8')]: { type: 'noul', noul: 0.72 },
      [idPergunta(0, 'c1')]: { type: 'choice', choice: 'contradiz', probabilities: { sustentada: 0.1, sem_base: 0.2, contradiz: 0.7 }, confidence: 0.7 },
    }))!;
    const [a] = avaliarEtapas(lote, r, 'claude', 'claude-haiku-4-5', 2);
    assert.deepEqual(a!.alertas.map((x) => x.codigo).sort(), ['contradiz_evidencia', 'duplicata_semantica', 'inventa_fato']);
    assert.equal(a!.criterios.c1!.pct, 10);
    assert.ok(a!.geral! <= 20, 'teto de C1 + 10');
    assert.equal(a!.faixa, 'baixa');
  });

  test('confiança abaixo de 0,5 marca como incerta, mas a nota vale', () => {
    const r = validarRespostas(lote, respostasPara(lote, {
      [idPergunta(0, 'c2')]: { type: 'score', score: 3, confidence: 0.3 },
    }))!;
    const [a] = avaliarEtapas(lote, r, 'jev', null, 2);
    assert.equal(a!.incerta, true);
    assert.equal(typeof a!.geral, 'number');
  });

  test('dúvida só sobre a ordem da lista (C9) não torna a etapa incerta', () => {
    const r = validarRespostas(lote, respostasPara(lote, { [ID_C9]: { type: 'score', score: 1.4, confidence: 0.39 } }))!;
    const [a] = avaliarEtapas(lote, r, 'jev', null, 2);
    assert.equal(a!.incerta, false);
    assert.equal(a!.criterios.c9!.pct, 47);
  });

  test('resposta do Claude sem confiança nem probabilidades ainda vira nota', () => {
    const r = validarRespostas(lote, respostasPara(lote, {
      [idPergunta(0, 'c1')]: { type: 'choice', choice: 'sustentada' },
      [idPergunta(0, 'c2')]: { type: 'score', score: 4 },
    }))!;
    const [a] = avaliarEtapas(lote, r, 'claude', null, 2);
    assert.equal(a!.criterios.c1!.pct, 100);
    assert.equal(a!.criterios.c1!.confianca, null);
    assert.equal(a!.incerta, false);
  });
});
