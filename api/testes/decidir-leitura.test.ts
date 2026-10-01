/* BOARD-PESQUISA-103 — decidir a leitura: o Claude propõe, o JEV
   confere. Todos os caminhos, com as chamadas simuladas. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirLeitura, type Dependencias } from '../src/pesquisa/decidir-leitura.js';
import { instrucaoDeReplanejamento, SISTEMA_PLANEJADOR, type PlanoInvestigacao } from '../src/pesquisa/planejador.js';
import { loteDeAderencia, aderenciaDe, CHAVE_ADERENCIA, META_DECISAO } from '../src/pesquisa/desambiguar.js';

const q = (t: string) => ({ pergunta: t, porque: '' });
const plano = (perguntas: string[], leituras: Array<[string, string[]]> = []): PlanoInvestigacao => ({
  perguntas: perguntas.map(q), jaSabido: [], naoDaParaBuscar: null, matriz: null,
  interpretacoes: leituras.map(([leitura, ps], i) => ({ id: 'abc'[i]!, leitura, perguntas: ps.map(q) })),
});

function deps(over: Partial<Dependencias> & { chamadas?: string[] } = {}): Dependencias & { chamadas: string[] } {
  const chamadas = over.chamadas ?? [];
  return {
    chamadas,
    planejar: async () => { chamadas.push('planejar'); return plano(['P1?']); },
    replanejar: async () => { chamadas.push('replanejar'); return plano(['P2?']); },
    escolher: async () => { chamadas.push('escolher'); return { id: 'b', probabilidade: 0.9, confianca: null }; },
    conferir: async () => { chamadas.push('conferir'); return 0.9; },
    ...over,
  };
}

test('com interpretações: o JEV escolhe, e a busca segue com as perguntas da escolhida', async () => {
  const d = deps({ planejar: async () => plano(['A?'], [['Leitura A', ['A?']], ['Leitura B', ['B?']]]) });
  const r = (await decidirLeitura(d))!;
  assert.equal(r.modo, 'escolha');
  assert.equal(r.escolhida!.leitura, 'Leitura B');
  assert.deepEqual(r.plano.perguntas.map((x) => x.pergunta), ['B?']);
  assert.ok(!d.chamadas.includes('conferir'), 'conferiu um plano que tinha leituras para escolher');
});

test('sem interpretações e plano fiel (≥ 75%): segue, sem replanejar', async () => {
  const d = deps({ conferir: async () => META_DECISAO });
  const r = (await decidirLeitura(d))!;
  assert.equal(r.modo, 'plano-fiel');
  assert.ok(!d.chamadas.includes('replanejar'));
});

test('plano infiel: replaneja com as perguntas anteriores; com leituras novas, o JEV escolhe', async () => {
  let anteriores: string[] = [];
  const d = deps({
    conferir: async () => 0.4,
    replanejar: async (a) => { anteriores = a; return plano(['X?'], [['Como a Shopee entrega hoje', ['X?']], ['Shopee como parceira', ['Y?']]]); },
    escolher: async () => ({ id: 'a', probabilidade: 0.8, confianca: null }),
  });
  const r = (await decidirLeitura(d))!;
  assert.deepEqual(anteriores, ['P1?']);
  assert.equal(r.modo, 'replanejado-escolha');
  assert.equal(r.escolhida!.leitura, 'Como a Shopee entrega hoje');
  assert.equal(r.replanejou, true);
});

test('replanejado sem leituras: fica o plano que o JEV julgar mais fiel — o novo se for melhor, o antigo se não', async () => {
  let n = 0;
  const melhor = (await decidirLeitura(deps({ conferir: async () => (n++ === 0 ? 0.4 : 0.8) })))!;
  assert.equal(melhor.modo, 'replanejado-plano');
  assert.deepEqual(melhor.plano.perguntas.map((x) => x.pergunta), ['P2?']);
  n = 0;
  const pior = (await decidirLeitura(deps({ conferir: async () => (n++ === 0 ? 0.4 : 0.3) })))!;
  assert.deepEqual(pior.plano.perguntas.map((x) => x.pergunta), ['P1?'], 'trocou por um plano pior');
});

test('o JEV mudo nunca derruba a pesquisa (IA-AVAL-003)', async () => {
  const semConferir = (await decidirLeitura(deps({ conferir: async () => null })))!;
  assert.equal(semConferir.modo, 'sem-conferencia');
  assert.deepEqual(semConferir.plano.perguntas.map((x) => x.pergunta), ['P1?']);
  const semEscolher = (await decidirLeitura(deps({
    planejar: async () => plano(['A?'], [['A', ['A?']], ['B', ['B?']]]),
    escolher: async () => null,
  })))!;
  assert.equal(semEscolher.escolhida!.leitura, 'A', 'sem escolha, vale a primeira leitura');
  assert.deepEqual(semEscolher.plano.perguntas.map((x) => x.pergunta), ['A?']);
  assert.equal(await decidirLeitura(deps({ planejar: async () => null })), null);
});

test('o replanejamento: lentes fixas, as perguntas anteriores, e fidelidade às palavras da tarefa', () => {
  const t = instrucaoDeReplanejamento(['Qual o perfil do síndico?']);
  assert.match(t, /- Qual o perfil do síndico\?/);
  assert.match(t, /funciona HOJE, no mesmo ponto do problema/);
  assert.match(t, /concorrente ou alternativa/);
  assert.match(t, /parceiro ou cliente/);
  assert.match(t, /Fique fiel às PALAVRAS da tarefa/);
});

test('o prompt: um recorte não é outra leitura', () => {
  assert.match(SISTEMA_PLANEJADOR, /Um RECORTE não é outra leitura/);
});

test('a conferência: pergunta noul ao JEV, com as perguntas do plano no estado', () => {
  const l = loteDeAderencia({ tarefa: 'Síndicos', contextoEmpresa: 'E', perguntas: ['P?'] });
  assert.equal(l.questions[CHAVE_ADERENCIA]!.type, 'noul');
  assert.deepEqual(l.state.perguntas_do_plano, ['P?']);
  assert.equal(aderenciaDe({ [CHAVE_ADERENCIA]: { type: 'noul', noul: 0.42 } }), 0.42);
  assert.equal(aderenciaDe({}), null);
});
