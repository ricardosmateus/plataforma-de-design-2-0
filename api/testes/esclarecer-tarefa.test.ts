/* ATV-TAR-CRIA-010 — "Deixar mais clara com IA". A regra de "curta ou
   vaga" tem uma cópia em atividade.html; ferramentas/provar-esclarecer.mjs
   testa a cópia com OS MESMOS casos (CASOS_VAGUEZA). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ehDescricaoVaga, instrucaoEsclarecer } from '../src/ia/esclarecer-tarefa.js';

export const CASOS_VAGUEZA: Array<[string, boolean]> = [
  ['Concorrentes', true],
  ['Preço', true],
  ['Pesquisar outras logitechs que atuam aqui no brasil.', true],
  ['Mapear barreiras do morador para usar armários de coleta em condomínios', true],
  ['Quantas lojas físicas a Centauro tem no Brasil?', false],
  ['O que se sabe, com fonte, sobre Pergunta 2: Logotipos atuais das logtechs brasileiras?', false],
  ['Quais são as razões pelas quais moradores de condomínios residenciais verticais no Sudeste recusam ou evitam usar armários inteligentes para receber encomendas? Para definir como comunicar o serviço.', false],
  ['', false],
  ['   ', false],
];

test('curta ou vaga: os casos reais (tarefas escritas por pessoas e geradas)', () => {
  for (const [t, esperado] of CASOS_VAGUEZA) assert.equal(ehDescricaoVaga(t), esperado, JSON.stringify(t));
});

test('a instrução: reescrever ESTA tarefa, não propor outra; manter os nomes da pessoa', () => {
  const t = instrucaoEsclarecer('Concorrentes', 'Pesquisar outras logitechs');
  assert.match(t, /Título: Concorrentes/);
  assert.match(t, /Descrição: Pesquisar outras logitechs/);
  assert.match(t, /NÃO proponha outra tarefa/);
  assert.match(t, /Mantenha os nomes que a pessoa usou/);
  assert.match(instrucaoEsclarecer('', 'x'), /Título: \(sem título\)/);
});

test('a cópia da regra na tela é IGUAL à do servidor (os mesmos números)', () => {
  const tela = readFileSync(new URL('../../atividade.html', import.meta.url), 'utf8');
  assert.match(tela, /return n < 8 \|\| \(texto\.indexOf\('\?'\) < 0 && n < 15\);/, 'a regra da tela mudou sem a do servidor (ou o contrário)');
});

const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');

test('a rota: o mesmo contexto do gerador, reserva antes, libera no finally, cobra e registra', () => {
  const r = rota.slice(rota.indexOf("'/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/esclarecer'"));
  assert.ok(r.length > 100, 'a rota de esclarecer não existe');
  const ctx = r.indexOf('await contextoDaTarefa(ctx, corpo.data.tipo, null)');
  const reserva = r.indexOf('await reservar(ctx.usuarioId, teto, op,');
  const chamada = r.indexOf('r = await pedirTarefa(mensagem)');
  const libera = r.indexOf('await liberar(ctx.usuarioId, teto, op,');
  const consome = r.indexOf('await consumir(ctx.usuarioId, emReais(usd), op,');
  assert.ok(ctx > 0 && ctx < reserva && reserva < chamada && chamada < libera && libera < consome, `${ctx} ${reserva} ${chamada} ${libera} ${consome}`);
  assert.match(r.slice(chamada - 120, libera), /finally \{/);
  assert.match(r, /registrar\(\{/);
  assert.ok(!/criarTarefaNoFim/.test(r.slice(0, r.indexOf('});'))), 'esclarecer não pode criar tarefa');
});

test('o gerador, a sugestão e o roteiro leem o MESMO contexto (uma função só)', () => {
  /* Três rotas: gerar, esclarecer (ATV-TAR-CRIA-010) e roteiro (BOARD-CONVERSA-004). */
  assert.equal((rota.match(/await contextoDaTarefa\(ctx,/g) ?? []).length, 3);
  /* A mensagem do gerador é montada num lugar só, dentro de
     contextoDaTarefa. (A rota da Matriz tem a dela, com outro propósito.) */
  assert.equal((rota.match(/montarMensagemTarefa\(\{/g) ?? []).length, 1, 'a montagem do contexto foi duplicada');
});
