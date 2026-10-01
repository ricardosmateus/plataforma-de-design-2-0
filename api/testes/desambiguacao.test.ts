/* Etapa 3 — o gabarito de desambiguação e a pergunta ao JEV.
   O acerto do JEV é medido por scripts/avaliar-desambiguacao.ts (com
   rede); aqui, o que não depende de rede: o gabarito ser consistente e
   o lote ser o formato que o JEV entende. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBIGUOS, CLAROS, casosConfirmados, CONTEXTO_IHOUSELOG } from '../corpus/desambiguacao.js';
import { loteDeDesambiguacao, leituraEscolhida, CHAVE_LEITURA } from '../src/pesquisa/desambiguar.js';

test('gabarito: ids únicos; a leitura certa existe; pelo menos duas leituras por caso', () => {
  const ids = new Set<string>();
  for (const c of [...AMBIGUOS, ...CLAROS]) {
    assert.ok(!ids.has(c.id), `id repetido: ${c.id}`);
    ids.add(c.id);
  }
  for (const c of AMBIGUOS) {
    assert.ok(c.leituras.length >= 2, c.id);
    assert.ok(c.leituras.some((l) => l.id === c.certa), `${c.id}: a leitura certa não está entre as opções`);
    assert.equal(new Set(c.leituras.map((l) => l.id)).size, c.leituras.length, `${c.id}: id de leitura repetido`);
  }
});

test('gabarito: nenhum caso com dúvida pendente — todos contam na régua (confirmados em 01/10/2026)', () => {
  assert.equal(casosConfirmados().length, AMBIGUOS.length);
  assert.ok(AMBIGUOS.length >= 20, 'a régua precisa de 20 a 30 casos');
  assert.equal(AMBIGUOS.filter((c) => c.confirmadoPor).length, 8);
});

test('gabarito: a armadilha real está lá ("Nome dos clientes/usuários" era naming)', () => {
  const c = AMBIGUOS.find((x) => x.id === 'nome-clientes')!;
  assert.match(c.leituras.find((l) => l.id === c.certa)!.leitura, /nome para chamar os usuários/);
});

test('lote: uma pergunta de escolha, as leituras como opções, tarefa e empresa no estado', () => {
  const c = AMBIGUOS[0]!;
  const l = loteDeDesambiguacao({ tarefa: c.tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras: c.leituras });
  assert.deepEqual(Object.keys(l.questions), [CHAVE_LEITURA]);
  const q = l.questions[CHAVE_LEITURA]!;
  assert.equal(q.type, 'choice');
  assert.deepEqual(Object.keys((q as { criteria: Record<string, string> }).criteria), c.leituras.map((x) => x.id));
  assert.equal(l.state.tarefa, c.tarefa);
  assert.equal(l.state.empresa, CONTEXTO_IHOUSELOG);
});

test('escolha: lê a opção e a probabilidade dela; resposta que não é escolha é nula', () => {
  assert.deepEqual(
    leituraEscolhida({ [CHAVE_LEITURA]: { type: 'choice', choice: 'a', probabilities: { a: 0.7, b: 0.3 }, confidence: 0.8 } }),
    { id: 'a', probabilidade: 0.7, confianca: 0.8 },
  );
  assert.equal(leituraEscolhida({ [CHAVE_LEITURA]: { type: 'noul', noul: 0.9 } }), null);
  assert.equal(leituraEscolhida({}), null);
  assert.equal(leituraEscolhida(null), null);
});

/* ---- Régua v2 (fase 3a) ---- */
import { CONTEXTOS, SOBRE_A_EMPRESA } from '../corpus/desambiguacao.js';

test('régua v2: todo caso ambíguo tem contexto interno', () => {
  for (const c of AMBIGUOS) assert.ok(CONTEXTOS[c.id], `${c.id} sem contexto`);
});

test('régua v2: seis neutros — três inseguros na 1ª rodada e três seguros', () => {
  const neutros = Object.entries(CONTEXTOS).filter(([, c]) => c.neutro).map(([id]) => id).sort();
  assert.deepEqual(neutros, ['concorrentes', 'correios', 'mercado-livre', 'mood-board', 'shopee', 'sindicos']);
});

test('régua v2: o texto da leitura certa NUNCA aparece copiado no contexto (régua fácil por construção)', () => {
  const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const c of AMBIGUOS) {
    const ctx = CONTEXTOS[c.id]!;
    const tudo = normal([ctx.projeto, ctx.atividade, ctx.descricaoDaTarefa ?? '', ...ctx.tarefasIrmas, ...SOBRE_A_EMPRESA].join(' | '));
    const certa = normal(c.leituras.find((l) => l.id === c.certa)!.leitura);
    assert.ok(!tudo.includes(certa), `${c.id}: a leitura certa está copiada no contexto`);
    /* E nenhum trecho longo dela: 6 palavras seguidas já seriam cola. */
    const palavras = certa.split(/\s+/);
    for (let i = 0; i + 6 <= palavras.length; i++) {
      const trecho = palavras.slice(i, i + 6).join(' ');
      assert.ok(!tudo.includes(trecho), `${c.id}: "${trecho}" está no contexto`);
    }
  }
});

test('lote com contexto: os campos que a rota vai preencher; sem contexto, o lote da 1ª rodada', () => {
  const c = AMBIGUOS.find((x) => x.id === 'preco')!;
  const com = loteDeDesambiguacao({ tarefa: c.tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras: c.leituras, contexto: { ...CONTEXTOS[c.id]!, sobreAEmpresa: SOBRE_A_EMPRESA } });
  assert.equal(com.state.atividade, 'Modelo de negócio');
  assert.deepEqual(com.state.outras_tarefas_da_mesma_atividade, CONTEXTOS[c.id]!.tarefasIrmas);
  assert.deepEqual(com.state.o_que_a_empresa_ja_validou, SOBRE_A_EMPRESA);
  const sem = loteDeDesambiguacao({ tarefa: c.tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras: c.leituras });
  assert.deepEqual(Object.keys(sem.state).sort(), ['empresa', 'tarefa']);
});
