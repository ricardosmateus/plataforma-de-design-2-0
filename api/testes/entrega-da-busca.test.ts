/* BOARD-PESQUISA-088 a 091 — a busca que não pesquisou.

   O caso real (30/09/2026, tarefa 93a6236f…, sessão 586f381f…): a busca
   devolveu uma negociação de escopo, com ZERO fontes, e a rota a
   registrou como `entregue`, "Pronto.", seis afirmações — quatro vezes.
   O começo, os itens e a pergunta final abaixo são do dado gravado em
   produção; o miolo foi resumido (o registro corta em 1.500 caracteres). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliarSeRespondeu, textoDaBusca, MENSAGEM_NAO_PESQUISOU } from '../src/pesquisa/entrega.js';
import { lerRespostaJuiz } from '../src/ia/avaliacao/claude-juiz.js';

const NEGOCIACAO_REAL = `Preciso esclarecer o escopo antes de proceder. A iHouseLog é uma logtech que conecta e-commerces a condomínios como pontos de coleta. Sua pergunta mistura três demandas muito diferentes:

1. **Pesquisa de mercado** (dores de condomínios, como e-commerces comunicam, identidades visuais de concorrentes) — isso eu faço bem.

2. **Mood board com 20-30 referências visuais** (cores, tipografias, estilos inspiradores) — isso é **design**, não pesquisa de mercado. Não consigo coletar e estruturar imagens.

3. **Entrega formatada como apresentação visual** — web search e web fetch retornam texto, não arquivos que você possa abrir como apresentação.

O que **posso entregar agora**:

- ✅ Responder as 4 perguntas com fontes.

**Você quer que eu vá direto nas 4 perguntas e trago a descrição das identidades visuais em texto — para você depois montar o mood board com um designer?**`;

test('a negociação real, sem fonte, NÃO é resultado', () => {
  const v = avaliarSeRespondeu(NEGOCIACAO_REAL, []);
  assert.equal(v.respondeu, false);
  assert.equal(!v.respondeu && v.mensagem, MENSAGEM_NAO_PESQUISOU);
});

test('o mesmo texto COM fonte é resultado — houve pesquisa', () => {
  assert.equal(avaliarSeRespondeu(NEGOCIACAO_REAL, [{ url: 'https://exemplo.com' }]).respondeu, true);
});

test('resposta sem fonte que só afirma continua resultado (PES-006 marca, não esconde)', () => {
  const r = 'A Loggi usa azul como cor principal na marca.\n\nNão encontrei o manual de marca publicado.';
  assert.equal(avaliarSeRespondeu(r, []).respondeu, true);
});

test('resposta sem fonte que termina devolvendo uma pergunta não é resultado', () => {
  const r = 'Existem várias empresas de logística urbana no Brasil.\n\nQuer que eu foque em alguma região específica?';
  const v = avaliarSeRespondeu(r, []);
  assert.equal(v.respondeu, false);
  assert.equal(!v.respondeu && v.motivo, 'pergunta-de-volta');
});

test('resposta COM fonte que termina perguntando o que faltou continua resultado (lacuna)', () => {
  const r = 'A Loggi opera em 4 mil cidades.\n\nO que não achei: quantos lockers ela tem em condomínios?';
  assert.equal(avaliarSeRespondeu(r, [{ url: 'https://exemplo.com' }]).respondeu, true);
});

test('abrir com "Antes de prosseguir" ou "Não consigo coletar" é esclarecimento', () => {
  assert.equal(avaliarSeRespondeu('Antes de prosseguir, preciso saber o público.', []).respondeu, false);
  assert.equal(avaliarSeRespondeu('Não consigo coletar imagens pela busca.', []).respondeu, false);
});

test('texto vazio fica para classificarResultado (vazio), não é tratado aqui', () => {
  assert.equal(avaliarSeRespondeu('   ', []).respondeu, true);
});

test('o que vai à busca: perguntas PRIMEIRO, tarefa só como contexto, sem licença para negociar', () => {
  const t = textoDaBusca('Colete 20-30 referências visuais. Entrega: mood board.', [{ pergunta: 'Quais cores a Loggi usa?' }, { pergunta: 'Qual a tipografia da Shopee?' }]);
  assert.ok(t.startsWith('Responda, com fonte, cada uma destas perguntas:\n1. Quais cores a Loggi usa?\n2. Qual a tipografia da Shopee?'));
  assert.ok(t.indexOf('mood board') > t.indexOf('2. Qual a tipografia'), 'a tarefa veio antes das perguntas');
  assert.match(t, /Não devolva pedido de esclarecimento/);
  assert.equal(textoDaBusca('a """ b', []).includes('a """ b'), false, 'aspas triplas da tarefa fecharam o bloco');
});

test('o prompt da busca não autoriza mais pedir esclarecimento (BOARD-PESQUISA-091)', () => {
  const fonte = readFileSync(new URL('../src/pesquisa/provedor-claude-busca.ts', import.meta.url), 'utf8');
  assert.ok(!/peca esclarecimento sobre o/i.test(fonte), 'a licença para negociar voltou');
  assert.match(fonte, /Nunca devolva pedido de esclarecimento/);
});

test('a rota confere a resposta antes de classificar, e cobra pelo que o provedor cobrou (B7)', () => {
  const rota = readFileSync(new URL('../src/rotas/pesquisa.ts', import.meta.url), 'utf8');
  const a = rota.indexOf('const veredito = avaliarSeRespondeu(');
  const b = rota.indexOf('classificarResultado({ itens: achados', a);
  assert.ok(a > 0 && b > a, 'a guarda não roda antes da classificação');
  assert.ok(!/custoBusca\.totalMicros > 0 && resultado !== 'falhou'/.test(rota), 'a busca que não pesquisou deixaria de ser cobrada');
});

test('juiz Claude: lê o JSON inteiro (sem prefill), com cercas, e a continuação antiga', () => {
  const inteiro = '{"answers":{"c1":{"type":"noul","noul":0.9}}}';
  assert.ok(lerRespostaJuiz(inteiro));
  assert.ok(lerRespostaJuiz('```json\n' + inteiro + '\n```'));
  assert.ok(lerRespostaJuiz('Aqui está:\n' + inteiro));
  assert.ok(lerRespostaJuiz('"c1":{"type":"noul","noul":0.9}}}'), 'continuação do prefill antigo');
  assert.equal(lerRespostaJuiz('não sei'), null);
  assert.equal(lerRespostaJuiz('{"outra":1}'), null);
});
