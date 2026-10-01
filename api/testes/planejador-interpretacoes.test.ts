/* BOARD-PESQUISA-102 — o planejador propondo leituras. O que o prompt
   pede, o código garante: menos de duas não é ambiguidade; no máximo 3
   leituras e 3 perguntas por leitura; ids dados pelo código; e, sem
   `perguntas`, as da primeira leitura (a busca não muda até a 3d). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarPlano, SISTEMA_PLANEJADOR, MAX_INTERPRETACOES, MAX_PERGUNTAS_POR_LEITURA } from '../src/pesquisa/planejador.js';
import { textoDoContextoDaTarefa } from '../src/pesquisa/desambiguar.js';

const q = (t: string) => ({ pergunta: t, porque: 'x' });

test('o prompt pede interpretações só quando o contexto não resolve, e não deixa escolher', () => {
  assert.match(SISTEMA_PLANEJADOR, /9\. Preencha "interpretacoes" SÓ quando/);
  assert.match(SISTEMA_PLANEJADOR, /MESMO com tudo o que está no contexto/);
  assert.match(SISTEMA_PLANEJADOR, /NÃO escolha entre elas/);
  assert.match(SISTEMA_PLANEJADOR, /"interpretacoes": \[/);
});

test('plano comum: interpretações vazias, nada muda', () => {
  const p = interpretarPlano(JSON.stringify({ perguntas: [q('Quais empresas operam lockers?')], ja_sabido: [], nao_da_para_buscar: null, matriz: null, interpretacoes: [] }))!;
  assert.deepEqual(p.interpretacoes, []);
  assert.equal(p.perguntas.length, 1);
});

test('duas leituras: ids a e b dados pelo código, cada uma com as suas perguntas', () => {
  const p = interpretarPlano(JSON.stringify({
    perguntas: [q('Quem são os concorrentes diretos?')],
    interpretacoes: [
      { id: 'zz', leitura: 'Concorrentes diretos', perguntas: [q('Quem são os concorrentes diretos?')] },
      { leitura: 'Concorrentes indiretos', perguntas: [q('Quais marketplaces têm pontos de retirada?')] },
    ],
  }))!;
  assert.deepEqual(p.interpretacoes!.map((i) => i.id), ['a', 'b']);
  assert.equal(p.interpretacoes![1]!.perguntas[0]!.pergunta, 'Quais marketplaces têm pontos de retirada?');
});

test('uma leitura só NÃO é ambiguidade: o campo fica vazio', () => {
  const p = interpretarPlano(JSON.stringify({ perguntas: [q('P?')], interpretacoes: [{ leitura: 'Só uma', perguntas: [q('P?')] }] }))!;
  assert.deepEqual(p.interpretacoes, []);
});

test('tetos: no máximo 3 leituras e 3 perguntas em cada; leitura sem pergunta não conta', () => {
  const muitas = Array.from({ length: 5 }, (_, i) => ({ leitura: `L${i}`, perguntas: Array.from({ length: 6 }, (_, j) => q(`P${i}-${j}?`)) }));
  const p = interpretarPlano(JSON.stringify({ perguntas: [q('X?')], interpretacoes: [{ leitura: 'vazia', perguntas: [] }, ...muitas] }))!;
  assert.equal(p.interpretacoes!.length, MAX_INTERPRETACOES);
  assert.ok(p.interpretacoes!.every((i) => i.perguntas.length === MAX_PERGUNTAS_POR_LEITURA));
  assert.equal(p.interpretacoes![0]!.leitura, 'L0', 'a leitura vazia entrou');
});

test('sem "perguntas", vale a primeira leitura — a busca de hoje não muda', () => {
  const p = interpretarPlano(JSON.stringify({
    perguntas: [],
    interpretacoes: [
      { leitura: 'A', perguntas: [q('Pergunta da A?')] },
      { leitura: 'B', perguntas: [q('Pergunta da B?')] },
    ],
  }))!;
  assert.deepEqual(p.perguntas.map((x) => x.pergunta), ['Pergunta da A?']);
});

test('plano sem perguntas e sem interpretações continua ilegível (null), como antes', () => {
  assert.equal(interpretarPlano(JSON.stringify({ perguntas: [], interpretacoes: [] })), null);
});

test('o contexto da tarefa em texto: o que o planejador vai receber na 3b', () => {
  const t = textoDoContextoDaTarefa({ projeto: 'P', atividade: 'Modelo de negócio', tarefasIrmas: ['Preço', 'Margem'], sobreAEmpresa: ['Fato 1'] });
  assert.match(t, /^CONTEXTO DA TAREFA NA PLATAFORMA\n/);
  assert.match(t, /Atividade em que a tarefa está: Modelo de negócio/);
  assert.match(t, /Outras tarefas da mesma atividade: Preço; Margem/);
  assert.match(t, /- Fato 1/);
  assert.equal(textoDoContextoDaTarefa(undefined), '');
});
