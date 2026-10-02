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

test('E1: a IA ainda não gera nem esclarece este tipo (a E3 liga os dois)', () => {
  const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  const geraveis = (rota.match(/const TIPOS_GERAVEIS = \[([^\]]*)\]/) ?? [])[1] ?? '';
  const esclareciveis = (rota.match(/const TIPOS_ESCLARECIVEIS = \[([^\]]*)\]/) ?? [])[1] ?? '';
  assert.ok(geraveis && !geraveis.includes('conversa_usuarios'), 'o gerador já aceita conversa — a E3 entrou sem o prompt?');
  assert.ok(esclareciveis && !esclareciveis.includes('conversa_usuarios'), 'o esclarecer já aceita conversa — a E3 entrou sem o prompt?');
});
