/* Testes da avaliação — a metade de rede, com `fetch` falso.

   Regras: ia-avaliacao.md, IA-AVAL-002/003/004/013

   Provam a ordem JEV → Claude → "não avaliado", que TODA falha do
   JEV (sem chave, rede, timeout, HTTP de erro, formato) leva ao
   Claude, que nada lança, e que as chamadas cobradas voltam para a
   rota repassar o custo. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarIdeias, custoDasChamadas, tetoAvaliacaoUsdMicros, type DependenciasAvaliacao } from '../src/ia/avaliacao/avaliar.js';
import { montarLoteIdeias, type ContextoAvaliacaoIdeias } from '../src/ia/avaliacao/perguntas.js';

const ctx: ContextoAvaliacaoIdeias = {
  projetoNome: 'Identidade Visual',
  empresaNome: 'Padaria Grão Fino',
  empresaDescricao: 'Padaria artesanal em Curitiba.',
  validadas: [],
  existentes: [],
  orientacao: null,
  etapas: [
    { titulo: 'Definir a paleta de cores', descricao: 'Entrega: paleta com HEX.' },
    { titulo: 'Desenhar o logotipo', descricao: 'Entrega: 3 opções em vetor.' },
  ],
};
const lote = montarLoteIdeias(ctx);

function answersBons() {
  const r: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(lote.questions)) {
    if (p.type === 'noul') r[id] = { type: 'noul', noul: 0.2 };
    if (p.type === 'choice') r[id] = { type: 'choice', choice: 'sustentada', probabilities: { sustentada: 0.95, sem_base: 0.05, contradiz: 0 }, confidence: 0.9 };
    if (p.type === 'score') r[id] = { type: 'score', score: p.criteria.length - 1.2, confidence: 0.8 };
  }
  return r;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

const respostaJev = () => json({ model: 'jev-1.13.0', answers: answersBons(), usage: { input_tokens: 700, output_tokens: 120 } });
const respostaClaude = () =>
  json({
    content: [{ type: 'text', text: JSON.stringify({ answers: answersBons() }).slice('{"answers":{'.length) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1500, output_tokens: 900 },
  });

type Rota = (url: string, init?: RequestInit) => Promise<Response> | Response;
function falso(jev: Rota, claude: Rota) {
  const chamadas: string[] = [];
  const buscar = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    chamadas.push(u.includes('typesafe') ? 'jev' : 'claude');
    return u.includes('typesafe') ? jev(u, init) : claude(u, init);
  }) as typeof fetch;
  return { buscar, chamadas };
}

function deps(buscar: typeof fetch, chaveJev: string | null = 'k'): DependenciasAvaliacao {
  return {
    jev: { chave: chaveJev ?? undefined, baseUrl: 'https://api.typesafe.ai', modelo: 'jev-latest', timeoutMs: 50 },
    claude: { chave: 'c', modelo: 'claude-haiku-4-5', timeoutMs: 50 },
    buscar,
  };
}

describe('ordem JEV → Claude → não avaliado', () => {
  test('JEV responde: avaliador jev, Claude nem é chamado', async () => {
    const f = falso(respostaJev, () => { throw new Error('não devia chamar'); });
    const r = await avaliarIdeias(ctx, deps(f.buscar));
    assert.equal(r.avaliador, 'jev');
    assert.equal(r.modelo, 'jev-1.13.0');
    assert.deepEqual(f.chamadas, ['jev']);
    assert.equal(r.avaliacoes.length, 2);
    assert.equal(typeof r.avaliacoes[0]!.geral, 'number');
    assert.equal(r.chamadas[0]!.cobrou, true);
    assert.equal(r.chamadas[0]!.uso!.entrada, 700);
  });

  test('o pedido ao JEV leva Bearer, model e questions', async () => {
    let visto: { url: string; init?: RequestInit } | null = null;
    const f = falso((url, init) => { visto = { url, init }; return respostaJev(); }, respostaClaude);
    await avaliarIdeias(ctx, deps(f.buscar));
    assert.equal(visto!.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal((visto!.init!.headers as Record<string, string>).authorization, 'Bearer k');
    const corpo = JSON.parse(String(visto!.init!.body));
    assert.equal(corpo.model, 'jev-latest');
    assert.ok(corpo.questions && corpo.state);
  });

  const falhasJev: Array<[string, Rota, string | null, string]> = [
    ['sem chave', respostaJev, null, 'sem-configuracao'],
    ['erro de rede', () => { throw new TypeError('fetch failed'); }, 'k', 'rede'],
    ['timeout', () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }, 'k', 'timeout'],
    ['HTTP 529', () => json({ error: 'overloaded' }, 529), 'k', 'http'],
    ['HTTP 401', () => json({ error: 'bad key' }, 401), 'k', 'http'],
    ['resposta incompleta', () => json({ model: 'jev-1.13.0', answers: {}, usage: { input_tokens: 700, output_tokens: 5 } }), 'k', 'formato'],
  ];

  for (const [nome, rota, chave, motivo] of falhasJev) {
    test(`JEV com ${nome}: o Claude avalia`, async () => {
      const f = falso(rota, respostaClaude);
      const r = await avaliarIdeias(ctx, deps(f.buscar, chave));
      assert.equal(r.avaliador, 'claude');
      assert.equal(r.falhaJev, motivo);
      assert.equal(r.avaliacoes.length, 2);
      assert.equal(r.avaliacoes[0]!.avaliador, 'claude');
    });
  }

  test('JEV fora do formato DEPOIS de cobrar: a chamada dele volta como cobrada', async () => {
    const f = falso(() => json({ model: 'jev-1.13.0', answers: {}, usage: { input_tokens: 700, output_tokens: 5 } }), respostaClaude);
    const r = await avaliarIdeias(ctx, deps(f.buscar));
    assert.deepEqual(r.chamadas.map((c) => [c.fornecedor, c.cobrou]), [['jev', true], ['claude', true]]);
  });

  test('os dois falham: não avaliado, sem lançar', async () => {
    const f = falso(() => json({}, 500), () => json({}, 500));
    const r = await avaliarIdeias(ctx, deps(f.buscar));
    assert.equal(r.avaliador, 'nenhum');
    assert.deepEqual(r.avaliacoes.map((a) => a.faixa), ['nao_avaliado', 'nao_avaliado']);
    assert.equal(r.falhaJev, 'http');
    assert.equal(r.falhaClaude, 'http');
  });

  test('Claude cortado no teto é falha, mas a chamada foi cobrada', async () => {
    const f = falso(
      () => json({}, 500),
      () => json({ content: [{ type: 'text', text: '"e0_c1":{' }], stop_reason: 'max_tokens', usage: { input_tokens: 1500, output_tokens: 3000 } }),
    );
    const r = await avaliarIdeias(ctx, deps(f.buscar));
    assert.equal(r.avaliador, 'nenhum');
    assert.equal(r.falhaClaude, 'cortada');
    assert.equal(r.chamadas.at(-1)!.cobrou, true);
  });

  test('fetch que lança algo estranho não derruba nada', async () => {
    const buscar = (async () => { throw 42; }) as unknown as typeof fetch;
    const r = await avaliarIdeias(ctx, deps(buscar));
    assert.equal(r.avaliador, 'nenhum');
  });

  test('sem etapas, nenhuma chamada', async () => {
    const f = falso(respostaJev, respostaClaude);
    const r = await avaliarIdeias({ ...ctx, etapas: [] }, deps(f.buscar));
    assert.deepEqual(f.chamadas, []);
    assert.deepEqual(r.avaliacoes, []);
  });
});

describe('custo — IA-AVAL-013/017', () => {
  test('teto soma o Claude; JEV sem preço entra com zero', () => {
    const t = tetoAvaliacaoUsdMicros(lote, 'jev-latest', 'claude-haiku-4-5');
    assert.ok(t !== null && t > 0);
  });

  test('Claude sem preço: teto nulo (recusa, nunca palpite)', () => {
    assert.equal(tetoAvaliacaoUsdMicros(lote, 'jev-latest', 'modelo-inexistente'), null);
  });

  test('custo real: só o que foi cobrado; JEV sem preço volta em semPreco', () => {
    const c = custoDasChamadas([
      { fornecedor: 'jev', modelo: 'jev-1.13.0', uso: { entrada: 700, saida: 120, cacheEscrita: 0, cacheLeitura: 0 }, cobrou: true },
      { fornecedor: 'claude', modelo: 'claude-haiku-4-5', uso: { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 }, cobrou: true },
      { fornecedor: 'claude', modelo: 'claude-haiku-4-5', uso: null, cobrou: false },
    ]);
    assert.equal(c.usdMicros, 1_000_000);
    assert.equal(c.semPreco.length, 1);
    assert.equal(c.semPreco[0]!.fornecedor, 'jev');
  });
});
