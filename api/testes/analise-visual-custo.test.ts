/* BOARD-VISUAL-018 a 021 — o custo da análise visual e a junção com a
   busca. Preços REAIS de creditos/precos.ts; cotação 5,40 e comissão
   de 30% no conversor de teste. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tetoVisualUsdMicros, empresasQueCabem, juntarRespostas, TITULO_DA_SECAO_VISUAL, TETO_INVESTIGACAO_MICROS } from '../src/referencias/analise-visual-custo.js';

const emReais = (usd: number) => Math.round(usd * 5.4 * 1.3);
const HAIKU = 'claude-haiku-4-5';
const SONNET = 'claude-sonnet-4-5';

test('o pior caso cresce com o número de empresas; modelo sem preço não tem teto', () => {
  const t2 = tetoVisualUsdMicros(HAIKU, SONNET, 2)!;
  const t8 = tetoVisualUsdMicros(HAIKU, SONNET, 8)!;
  assert.ok(t8 > t2);
  assert.equal(tetoVisualUsdMicros(HAIKU, 'modelo-que-nao-existe', 8), null);
});

test('busca que gastou o típico (R$ 0,69): cabem as 8 empresas, e a soma não passa de R$ 3', () => {
  const c = empresasQueCabem({ reservadoBuscaMicros: 690_000, modeloEmpresas: HAIKU, modeloAnalise: SONNET, emReais });
  assert.equal(c.empresas, 8);
  assert.ok(690_000 + c.estimativaMicros <= TETO_INVESTIGACAO_MICROS);
});

test('busca que gastou mais: menos empresas, nunca acima do teto', () => {
  const c = empresasQueCabem({ reservadoBuscaMicros: 1_460_000, modeloEmpresas: HAIKU, modeloAnalise: SONNET, emReais });
  assert.ok(c.empresas >= 2 && c.empresas < 8, String(c.empresas));
  assert.ok(1_460_000 + c.estimativaMicros <= TETO_INVESTIGACAO_MICROS);
});

test('sem espaço para duas empresas: não roda (0), e a investigação entrega só o texto', () => {
  assert.deepEqual(empresasQueCabem({ reservadoBuscaMicros: 2_500_000, modeloEmpresas: HAIKU, modeloAnalise: SONNET, emReais }), { empresas: 0, estimativaMicros: 0 });
});

test('modelo sem preço: não roda', () => {
  assert.equal(empresasQueCabem({ reservadoBuscaMicros: 0, modeloEmpresas: HAIKU, modeloAnalise: 'sem-preco', emReais }).empresas, 0);
});

test('junção: a análise vem depois, numa seção própria; índices e posições deslocados', () => {
  const busca = {
    resposta: 'A Loggi cresceu 30%.',
    fontes: [{ url: 'https://a', inicios: [0] }, { url: 'https://b', inicios: [2] }],
    afirmacoes: [{ texto: 'A Loggi cresceu 30%.', fonteIds: [1], trechos: ['x'], semFonte: false, inicio: 0 }],
  };
  const textoVisual = 'Análise visual de 1 marca.\n\n| Critério | Loggi |';
  const tabela = textoVisual.indexOf('|'); // calculada, não digitada
  const visual = {
    resposta: textoVisual,
    fontes: [{ url: 'https://www.loggi.com/', titulo: 'Loggi — site oficial', trecho: 't', inicios: [tabela] }],
    afirmacoes: [{ texto: 'Loggi: #0055ff', fonteIds: [0], trechos: ['t'], semFonte: false, inicio: tabela }],
  };
  const j = juntarRespostas(busca, visual);
  assert.ok(j.resposta.startsWith('A Loggi cresceu 30%.\n\n' + TITULO_DA_SECAO_VISUAL + '\n\n'));
  assert.equal(j.fontes.length, 3);
  const av = j.afirmacoes[1]!;
  assert.deepEqual(av.fonteIds, [2], 'a afirmação visual tem de apontar para a fonte visual, depois das da busca');
  assert.equal(j.resposta.slice(av.inicio, av.inicio + 10), '| Critério', 'a posição da afirmação não acompanhou o texto');
  assert.equal(j.resposta.slice(j.fontes[2]!.inicios![0]!, j.fontes[2]!.inicios![0]! + 10), '| Critério');
  assert.deepEqual(j.afirmacoes[0], busca.afirmacoes[0], 'a busca não pode mudar');
  assert.deepEqual(j.fontes.slice(0, 2), busca.fontes);
});
