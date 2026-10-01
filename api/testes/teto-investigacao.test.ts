/* BOARD-PESQUISA-093 a 096 — o teto de R$ 3 por investigação (D2).
   Até 01/10/2026 ele só existia em comentário: três trechos da rota
   diziam que o teto "continua valendo", e nenhuma linha o aplicava. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cabeNoTeto, TETO_INVESTIGACAO_MICROS, MENSAGEM_TETO_BUSCA, MENSAGEM_TETO_CADERNO } from '../src/pesquisa/teto.js';
import { TETO_INVESTIGACAO_MICROS as TETO_DA_VISUAL } from '../src/referencias/analise-visual-custo.js';

test('R$ 3, e um lugar só: a análise visual usa o mesmo teto', () => {
  assert.equal(TETO_INVESTIGACAO_MICROS, 3_000_000);
  assert.equal(TETO_DA_VISUAL, TETO_INVESTIGACAO_MICROS);
});

test('a busca de hoje (Haiku, ~R$ 1,46) cabe; a do Sonnet (~R$ 3,68) não', () => {
  assert.equal(cabeNoTeto({ gastoMicros: 0, estimativaMicros: 1_460_000 }).cabe, true);
  assert.equal(cabeNoTeto({ gastoMicros: 0, estimativaMicros: 3_680_000 }).cabe, false);
});

test('o caderno soma o que já foi gasto: exatamente no teto cabe, um centavo a mais não', () => {
  assert.equal(cabeNoTeto({ gastoMicros: 2_900_000, estimativaMicros: 100_000 }).cabe, true);
  assert.equal(cabeNoTeto({ gastoMicros: 2_900_000, estimativaMicros: 110_000 }).cabe, false);
  assert.equal(cabeNoTeto({ gastoMicros: 2_900_000, estimativaMicros: 0 }).disponivelMicros, 100_000);
});

test('gasto acima do teto ou inválido não vira espaço negativo nem NaN', () => {
  assert.deepEqual(cabeNoTeto({ gastoMicros: 5_000_000, estimativaMicros: 1 }), { cabe: false, disponivelMicros: 0 });
  assert.equal(cabeNoTeto({ gastoMicros: Number.NaN, estimativaMicros: 1_000_000 }).cabe, true);
});

test('as mensagens não mostram valor (DIN-013: valor só no Histórico de uso)', () => {
  for (const m of [MENSAGEM_TETO_BUSCA, MENSAGEM_TETO_CADERNO]) assert.ok(!/R\$|\d/.test(m), m);
});

const rota = readFileSync(new URL('../src/rotas/pesquisa.ts', import.meta.url), 'utf8');
function trecho(inicio: string, fim: string): string {
  const a = rota.indexOf(inicio);
  assert.ok(a >= 0, `não achei: ${inicio}`);
  return rota.slice(a, rota.indexOf(fim, a) + fim.length);
}

test('planejar: o teto é conferido ANTES de a busca ser oferecida (aguardarConfirmacao)', () => {
  const t = trecho('const estimativaBusca = comissaoSobre(usdParaMicrosBrl(tetoBuscaUsd, cotacao)).totalMicros;', 'await aguardarConfirmacao(invId, {');
  assert.match(t, /cabeNoTeto\(\{ gastoMicros: 0, estimativaMicros: estimativaBusca \}\)/);
});

test('buscar: o teto é conferido ANTES do stream e de qualquer reserva', () => {
  const buscar = rota.slice(rota.indexOf("app.post('/pesquisa/sessoes/:sessaoId/investigar/:invId/buscar'"));
  const teto = buscar.indexOf('cabeNoTeto(');
  assert.ok(teto > 0);
  assert.ok(teto < buscar.indexOf('resposta.hijack()'), 'teto depois do stream');
  assert.ok(teto < buscar.indexOf('await reservar('), 'teto depois da reserva');
});

test('caderno: soma o gasto da investigação pelo consultaId e confere ANTES de reservar', () => {
  const caderno = rota.slice(rota.indexOf("app.post('/pesquisa/sessoes/:sessaoId/consultas/:consultaId/perguntar'"));
  const soma = caderno.indexOf('db.consumoPesquisa.aggregate({');
  const teto = caderno.indexOf('cabeNoTeto({ gastoMicros, estimativaMicros: estimativa })');
  const reserva = caderno.indexOf('await reservar(');
  assert.ok(soma > 0 && soma < teto && teto < reserva, `soma ${soma}, teto ${teto}, reserva ${reserva}`);
  assert.match(caderno.slice(soma, teto), /where: \{ consultaId \}/);
  assert.match(caderno, /registrarPesquisa\(\{ \.\.\.consumo, operacaoId: operacao \}\)/);
  assert.match(caderno.slice(0, caderno.indexOf('registrarPesquisa(')), /consultaId,/, 'o consumo do caderno deixou de levar o consultaId — a soma não o veria');
});
