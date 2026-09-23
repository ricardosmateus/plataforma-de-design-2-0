/* PROJ-CRIA-012 — aviso de projeto com o mesmo nome na empresa.
   `encontrarMesmoNome` (projetos/duplicidade.ts) é quem decide se a
   rota devolve o 409 que abre a modal de confirmação. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoNome, encontrarMesmoNome } from '../src/projetos/duplicidade.js';

const d = (s: string) => new Date(s);

test('mesmo nome já existente é encontrado', () => {
  const r = encontrarMesmoNome(
    [{ nome: 'Logotipo', tipo: 'startup', criadoEm: d('2026-09-10T12:00:00Z') }],
    'Logotipo',
  );
  assert.deepEqual(r, { quantidade: 1, maisRecente: d('2026-09-10T12:00:00Z') });
});

test('acento, maiúsculas e espaços não escondem a repetição', () => {
  assert.equal(chaveDoNome('  Logótipo '), 'logotipo');
  assert.equal(chaveDoNome('Landing   Page'), 'landing page');
  const r = encontrarMesmoNome(
    [{ nome: 'landing page', tipo: 'startup', criadoEm: d('2026-09-10T12:00:00Z') }],
    'Landing Page',
  );
  assert.equal(r?.quantidade, 1);
});

test('nome diferente não avisa', () => {
  const r = encontrarMesmoNome(
    [{ nome: 'Logotipo', tipo: 'startup', criadoEm: d('2026-09-10T12:00:00Z') }],
    'Rebranding',
  );
  assert.equal(r, null);
});

test('projeto antigo sem nome conta pelo rótulo do tipo', () => {
  const r = encontrarMesmoNome(
    [{ nome: null, tipo: 'startup', criadoEm: d('2026-08-30T12:00:00Z') }],
    'Startup',
  );
  assert.equal(r?.quantidade, 1);
});

test('vários iguais: conta todos e mostra a data do mais recente', () => {
  const r = encontrarMesmoNome(
    [
      { nome: 'Logotipo', tipo: 'startup', criadoEm: d('2026-09-01T12:00:00Z') },
      { nome: 'Site', tipo: 'startup', criadoEm: d('2026-09-20T12:00:00Z') },
      { nome: 'Logotipo', tipo: 'startup', criadoEm: d('2026-09-15T12:00:00Z') },
    ],
    'Logotipo',
  );
  assert.deepEqual(r, { quantidade: 2, maisRecente: d('2026-09-15T12:00:00Z') });
});

test('empresa sem projetos, ou nome vazio, não avisa', () => {
  assert.equal(encontrarMesmoNome([], 'Logotipo'), null);
  assert.equal(
    encontrarMesmoNome([{ nome: 'Logotipo', tipo: 'startup', criadoEm: d('2026-09-01T12:00:00Z') }], '   '),
    null,
  );
});
