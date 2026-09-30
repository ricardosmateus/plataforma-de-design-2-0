/* ATV-TAR-CRIA-008/009, ATV-GERAR-023 — os tipos de tarefa que são
   matriz, e a Matriz CSD sem campos no modal.

   O caso que abriu este arquivo: o modal da Matriz CSD passou a não
   pedir título nem descrição, e a primeira versão mandava descrição
   vazia — que o esquema recusa (`min(1)`). A prova com DOM não via,
   porque parava no que a TELA envia. Estes testes passam pelo esquema
   de verdade. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TIPOS_VALIDOS, comTextoPadrao, conteudoTarefa } from '../src/rotas/tarefas.js';

const NOVOS = ['swot', 'impacto_esforco', 'comparativa'];
const valida = (corpo: unknown) => conteudoTarefa.safeParse(comTextoPadrao(corpo));

test('os três tipos-matriz são válidos para criar tarefa', () => {
  for (const t of NOVOS) assert.ok((TIPOS_VALIDOS as readonly string[]).includes(t), t);
});

test('Matriz CSD sem título nem descrição passa: o servidor preenche (ATV-TAR-CRIA-008)', () => {
  const r = valida({ tipo: 'matriz_csd', titulo: '', descricao: '' });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  assert.equal(r.success && r.data.titulo, 'Matriz CSD');
  assert.ok(r.success && r.data.descricao.length > 0);
});

test('Matriz CSD com texto próprio mantém o texto de quem escreveu', () => {
  const r = valida({ tipo: 'matriz_csd', titulo: 'CSD do onboarding', descricao: 'O que sabemos do cadastro.' });
  assert.equal(r.success && r.data.titulo, 'CSD do onboarding');
});

/* Revisto em 30/09/2026: os tipos-matriz também não pedem campos no
   modal, então o servidor precisa de texto padrão para cada um — senão
   a descrição vazia levaria 400, o mesmo defeito que a Matriz CSD quase
   teve. */
test('SWOT, Impacto × Esforço e Comparativa sem campos passam: o servidor preenche', () => {
  const titulos: Record<string, string> = { swot: 'Matriz SWOT', impacto_esforco: 'Impacto × Esforço', comparativa: 'Tabela comparativa' };
  for (const t of NOVOS) {
    const r = valida({ tipo: t, titulo: '', descricao: '' });
    assert.ok(r.success, t + ' recusou vazio: ' + JSON.stringify(!r.success && r.error.issues));
    assert.equal(r.success && r.data.titulo, titulos[t]);
    assert.ok(r.success && r.data.descricao.length > 0, t + ' sem descrição');
  }
});

test('tipos-matriz com texto próprio mantêm o texto de quem escreveu', () => {
  for (const t of NOVOS) {
    const r = valida({ tipo: t, titulo: 'Análise', descricao: 'Do concorrente principal.' });
    assert.equal(r.success && r.data.titulo, 'Análise', t);
  }
});

test('a rota de gerar NÃO aceita os tipos-matriz (ATV-GERAR-023)', () => {
  const fonte = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  const m = fonte.match(/const TIPOS_GERAVEIS = \[([^\]]*)\]/);
  assert.ok(m, 'TIPOS_GERAVEIS não encontrado');
  for (const t of NOVOS) assert.ok(!(m?.[1] ?? '').includes(`'${t}'`), t + ' é gerável');
  assert.ok(!/z\.enum\(TIPOS_VALIDOS/.test(fonte), 'a rota de gerar voltou a aceitar TIPOS_VALIDOS inteiro');
});

test('schema.prisma e as migrações conhecem os três tipos', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const enumTipo = schema.match(/enum TipoTarefa \{([^}]*)\}/);
  assert.ok(enumTipo);
  const dir = new URL('../prisma/migrations/', import.meta.url);
  const sql = readdirSync(dir).map((d) => { try { return readFileSync(new URL(d + '/migration.sql', dir), 'utf8'); } catch { return ''; } }).join('\n');
  for (const t of NOVOS) {
    assert.match(enumTipo?.[1] ?? '', new RegExp(`\\b${t}\\b`), t + ' fora do enum');
    assert.match(sql, new RegExp(`"TipoTarefa" ADD VALUE[^;]*'${t}'`), t + ' sem migração');
  }
});
