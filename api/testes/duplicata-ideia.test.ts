/* Frente A do JEV no assistente — o gabarito de ideias duplicadas e a
   pergunta ao JEV. O acerto do JEV é medido por
   scripts/avaliar-duplicata.ts (com rede); aqui, o que não depende dela. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASOS_DUPLICATA, casosConfirmadosDuplicata, CONTEXTO_EMPRESA_DUPLICATA } from '../corpus/ideias-duplicadas.js';
import { loteDeDuplicata, escolhaDuplicata, CHAVE_DUPLICATA, NENHUMA_DUPLICATA } from '../src/ia/duplicata-ideia.js';

test('gabarito: ids únicos; a certa é uma existente ou "nenhuma"; metade duplicata', () => {
  const ids = new Set(CASOS_DUPLICATA.map((c) => c.id));
  assert.equal(ids.size, CASOS_DUPLICATA.length);
  for (const c of CASOS_DUPLICATA) {
    assert.ok(c.certa === NENHUMA_DUPLICATA || c.existentes.some((e) => e.id === c.certa), c.id);
    assert.ok(c.existentes.length >= 3, `${c.id}: poucas opções`);
  }
  const conf = casosConfirmadosDuplicata();
  const dups = conf.filter((c) => c.certa !== NENHUMA_DUPLICATA).length;
  assert.ok(conf.length >= 20);
  assert.ok(Math.abs(dups - (conf.length - dups)) <= 2, `desequilibrado: ${dups} de ${conf.length}`);
});

/* O contrapeso de quem escreve sabendo as respostas (decisão P4): a
   régua não pode ser vencível contando palavras. Calculado em 02/10/2026:
   o melhor limite de sobreposição acerta 68% dos casos confirmados. */
const PARADAS = new Set('a o as os de da do das dos e em no na nos nas um uma para por com sem que se ao à é pelo pela mesmo mesma'.split(' '));
const palavras = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w)));
function sobreposicao(a: string, b: string): number {
  const A = palavras(a), B = palavras(b);
  const i = [...A].filter((x) => B.has(x)).length;
  return i / (A.size + B.size - i || 1);
}

test('gabarito: NÃO é vencível contando palavras (o melhor limite fica abaixo de 75%)', () => {
  const v = casosConfirmadosDuplicata().map((c) => {
    const nova = `${c.nova.titulo} ${c.nova.descricao}`;
    const js = c.existentes.map((e) => ({ id: e.id, j: sobreposicao(nova, `${e.titulo} ${e.descricao}`) }));
    const dup = c.certa !== NENHUMA_DUPLICATA;
    return { dup, j: dup ? js.find((x) => x.id === c.certa)!.j : Math.max(...js.map((x) => x.j)) };
  });
  let melhor = 0;
  for (const t of new Set(v.map((x) => x.j))) melhor = Math.max(melhor, v.filter((x) => (x.j >= t) === x.dup).length / v.length);
  assert.ok(melhor < 0.75, `contar palavras já acerta ${Math.round(melhor * 100)}%: a régua ficou fácil`);
  assert.ok(v.filter((x) => x.dup && x.j < 0.15).length >= 4, 'faltam duplicatas com poucas palavras em comum');
  assert.ok(v.filter((x) => !x.dup && x.j >= 0.3).length >= 2, 'faltam ideias diferentes com muitas palavras em comum');
});

test('lote: escolha entre as existentes e "nenhuma"; a nova e as existentes no estado', () => {
  const c = CASOS_DUPLICATA[0]!;
  const l = loteDeDuplicata({ contextoEmpresa: CONTEXTO_EMPRESA_DUPLICATA, nova: c.nova, existentes: c.existentes });
  const q = l.questions[CHAVE_DUPLICATA] as { type: string; criteria: Record<string, string>; instructions: string };
  assert.equal(q.type, 'choice');
  assert.deepEqual(Object.keys(q.criteria), [...c.existentes.map((e) => e.id), NENHUMA_DUPLICATA]);
  assert.match(q.instructions, /Na dúvida, "nenhuma"/);
  assert.deepEqual((l.state.ideia_nova as { titulo: string }).titulo, c.nova.titulo);
});

test('escolha: lê a opção e a probabilidade; resposta que não é escolha é nula', () => {
  assert.deepEqual(escolhaDuplicata({ [CHAVE_DUPLICATA]: { type: 'choice', choice: 'lockers', probabilities: { lockers: 0.8, nenhuma: 0.2 }, confidence: null } }), { id: 'lockers', probabilidade: 0.8 });
  assert.equal(escolhaDuplicata({ [CHAVE_DUPLICATA]: { type: 'noul', noul: 0.4 } }), null);
  assert.equal(escolhaDuplicata(null), null);
});
