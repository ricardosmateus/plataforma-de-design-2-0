/* ATV-TAR-CRIA-011 — "Conversa com usuários", fase E1. O que esta fase
   garante, e o que ela deliberadamente AINDA NÃO faz (a E3 liga o
   gerador e o "Deixar mais clara com IA" para este tipo). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TIPOS_VALIDOS, comTextoPadrao, conteudoTarefa } from '../src/rotas/tarefas.js';

test('o tipo existe e pede título e descrição (sem texto padrão)', () => {
  assert.ok((TIPOS_VALIDOS as readonly string[]).includes('conversa_usuarios'));
  assert.equal(conteudoTarefa.safeParse(comTextoPadrao({ tipo: 'conversa_usuarios', titulo: '', descricao: '' })).success, false);
  assert.ok(conteudoTarefa.safeParse(comTextoPadrao({ tipo: 'conversa_usuarios', titulo: 'Por que evitam o armário', descricao: 'Entender por que moradores evitam o armário.' })).success);
});

test('o banco conhece o tipo: enum e migração', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match((schema.match(/enum TipoTarefa \{([^}]*)\}/) ?? [])[1] ?? '', /\bconversa_usuarios\b/);
  const dir = new URL('../prisma/migrations/', import.meta.url);
  const sql = readdirSync(dir).map((m) => { try { return readFileSync(new URL(m + '/migration.sql', dir), 'utf8'); } catch { return ''; } }).join('\n');
  assert.match(sql, /"TipoTarefa" ADD VALUE[^;]*'conversa_usuarios'/);
});

test('E3: a IA gera e esclarece este tipo — e o prompt conhece as regras dele', async () => {
  const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  const geraveis = (rota.match(/const TIPOS_GERAVEIS = \[([^\]]*)\]/) ?? [])[1] ?? '';
  const esclareciveis = (rota.match(/const TIPOS_ESCLARECIVEIS = \[([^\]]*)\]/) ?? [])[1] ?? '';
  assert.ok(geraveis.includes('conversa_usuarios'), 'o gerador não aceita conversa');
  assert.ok(esclareciveis.includes('conversa_usuarios'), 'o esclarecer não aceita conversa');
  const { SISTEMA_TAREFA } = await import('../src/ia/gerar-tarefa.js');
  assert.match(SISTEMA_TAREFA, /- "Conversa com usuários": o time vai CONVERSAR/, 'liberado na rota sem a regra no prompt');
  assert.match(SISTEMA_TAREFA, /COM QUEM conversar/);
});

test('E3: a Conversa NÃO é avaliada pelo JEV (os critérios de hoje são de outros tipos)', () => {
  const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  assert.match(rota, /const tipoAvaliavel: TipoTarefaAvaliavel \| null = tipo === 'conversa_usuarios' \? null : tipo;/);
  assert.match(rota, /const avaliar = tipoAvaliavel !== null && avaliacaoTarefaLigada\(\);/);
});
