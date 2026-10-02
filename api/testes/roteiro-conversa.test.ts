/* BOARD-CONVERSA-004 — "Montar roteiro com IA" (fase E2). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conferirRoteiro, perguntasQueInduzem, montarMensagemRoteiro, SISTEMA_ROTEIRO, SECOES_DO_ROTEIRO } from '../src/ia/roteiro-conversa.js';

const BOM = `Objetivo
Entender por que moradores evitam o armário de coleta.

Com quem conversar
Moradores que já receberam encomenda no armário e voltaram a receber na portaria.

Perguntas
1. Como é a sua rotina quando chega uma encomenda?
2. Conte a última vez que uma encomenda foi para o armário. O que aconteceu?
3. Como você se sentiu ao buscar?

O que evitar
Não explique o armário antes de a pessoa contar como usa.`;

test('roteiro com as quatro seções, na ordem: passa como está', () => {
  assert.deepEqual(conferirRoteiro(BOM), { texto: BOM, induzem: [] });
});

test('sem uma seção, ou fora de ordem: não vai para o quadro', () => {
  assert.equal(conferirRoteiro(BOM.replace('O que evitar', 'Cuidados')), null);
  const trocado = BOM.replace('Objetivo\n', 'TMP\n').replace('Com quem conversar\n', 'Objetivo\n').replace('TMP\n', 'Com quem conversar\n');
  assert.equal(conferirRoteiro(trocado), null);
  assert.equal(conferirRoteiro(''), null);
  assert.equal(conferirRoteiro('x'.repeat(5000)), null);
});

test('marcação do modelo (#, **, cercas, dois-pontos no título) é limpa, e o roteiro passa', () => {
  const sujo = '```\n## **Objetivo:**\nEntender.\n\n## Com quem conversar\nMoradores.\n\n## Perguntas\n1. Como é?\n\n## O que evitar\nIndução.\n```';
  const r = conferirRoteiro(sujo);
  assert.ok(r, 'não passou');
  assert.ok(!/[#*`]/.test(r!.texto), r!.texto);
});

test('perguntas que induzem a resposta são marcadas', () => {
  assert.deepEqual(perguntasQueInduzem('1. Você usaria um armário no prédio?\n2. Como você recebe hoje?\n3. A senhora pagaria por isso?'),
    ['1. Você usaria um armário no prédio?', '3. A senhora pagaria por isso?']);
  assert.deepEqual(conferirRoteiro(BOM.replace('3. Como você se sentiu ao buscar?', '3. Você usaria de novo?'))!.induzem, ['3. Você usaria de novo?']);
});

test('as seções são as MESMAS do esqueleto do board (ROTEIRO_VAZIO)', () => {
  const board = readFileSync(new URL('../../board.html', import.meta.url), 'utf8');
  const bloco = board.slice(board.indexOf('var ROTEIRO_VAZIO = ['), board.indexOf("].join('\\n');", board.indexOf('var ROTEIRO_VAZIO = [')));
  for (const s of SECOES_DO_ROTEIRO) assert.ok(bloco.includes(`'${s}'`), `"${s}" não está no esqueleto do board`);
});

test('o prompt: as seções exatas, perguntas abertas, sem "você usaria"', () => {
  for (const s of SECOES_DO_ROTEIRO) assert.ok(SISTEMA_ROTEIRO.includes(`\n${s}\n`), s);
  assert.match(SISTEMA_ROTEIRO, /Toda pergunta é ABERTA/);
  assert.match(SISTEMA_ROTEIRO, /Nunca pergunte "você usaria/);
});

test('a mensagem leva a tarefa e o que a empresa já sabe', () => {
  const m = montarMensagemRoteiro({ empresaNome: 'iHouseLog', empresaDescricao: null, projetoNome: 'Startup', atividade: 'Entender o morador', tarefaTitulo: 'Por que evitam', tarefaDescricao: 'Entender o medo', conhecimento: '- fato' });
  assert.match(m, /Título: Por que evitam/);
  assert.match(m, /Descrição: Entender o medo/);
  assert.match(m, /O que a empresa já sabe:\n- fato/);
  assert.ok(!m.includes('Sobre a empresa:'), 'descrição vazia virou linha');
});

test('a rota: só Conversa, não em tarefa concluída, reserva → chama → libera (finally) → cobra; confere antes de devolver', () => {
  const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  const r = rota.slice(rota.indexOf("'/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/roteiro'"));
  assert.ok(r.length > 100, 'a rota do roteiro não existe');
  assert.match(r, /tarefa\.tipo !== 'conversa_usuarios'/);
  assert.match(r, /tarefa\.status === 'concluida'/);
  const reserva = r.indexOf('await reservar(ctx.usuarioId, teto, op,');
  const chamada = r.indexOf('r = await pedirTarefa(mensagem, SISTEMA_ROTEIRO, MAX_TOKENS_ROTEIRO)');
  const libera = r.indexOf('await liberar(ctx.usuarioId, teto, op,');
  const confere = r.indexOf('conferirRoteiro(r.bruto)');
  const consome = r.indexOf('await consumir(ctx.usuarioId, emReais(usd), op,');
  assert.ok(reserva > 0 && reserva < chamada && chamada < libera && libera < confere && confere < consome, `${reserva} ${chamada} ${libera} ${confere} ${consome}`);
  assert.match(r.slice(chamada - 120, libera), /finally \{/);
});
