/* Testes da avaliação da TAREFA gerada na atividade — F6.

   Regras: ia-avaliacao.md (IA-AVAL-018 a 023); atividade-lista.md
           (ATV-GERAR-018/019)
   Plano:  planejamento-jev-tarefas.md

   O que se prova aqui:
   - o lote pergunta o que o TIPO pede, um julgamento por pergunta
     (IA-AVAL-006), sem dado de pessoa (IA-AVAL-015);
   - a pergunta que não se responde por fonte não sai "alta"
     (IA-AVAL-021), e só ela, com nota do JEV em `visivel`, segura a
     pesquisa (ATV-GERAR-018/019);
   - o orquestrador genérico (A1) faz o mesmo caminho de falha para a
     tarefa e para as etapas da Visão, e `apenas` separa o JEV do
     Claude sem chamar o que não devia. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarLoteTarefa, type ContextoAvaliacaoTarefa } from '../src/ia/avaliacao/perguntas-tarefa.js';
import { montarLoteIdeias, LIMITES as TETOS_DO_LOTE, type Lote } from '../src/ia/avaliacao/perguntas.js';
import {
  avaliarTarefa,
  proximoAposGerar,
  validarRespostas,

  LIMITES_TAREFA,
  type Resposta,
  type Avaliacao,
} from '../src/ia/avaliacao/normalizar.js';
import { avaliarTarefaGerada, avaliarLote, type DependenciasAvaliacao } from '../src/ia/avaliacao/avaliar.js';

const base: ContextoAvaliacaoTarefa = {
  tipo: 'pesquisa',
  projetoNome: 'Identidade Visual',
  empresaNome: 'Padaria Grão Fino',
  empresaDescricao: 'Padaria artesanal de bairro em Curitiba, fermentação natural.',
  atividadeTitulo: 'Entender o mercado de padarias artesanais',
  atividadeDescricao: 'Mapear quem vende pão de fermentação natural na região.',
  validadas: ['Público principal são famílias do bairro'],
  existentes: [],
  orientacao: null,
  tarefa: {
    titulo: 'Levantar padarias de fermentação natural em Curitiba',
    descricao: 'Quais padarias vendem pão de fermentação natural em Curitiba, onde ficam e quanto custa o pão de 500 g?',
  },
};

/* ---------- respostas no formato do JEV ---------- */
const noul = (p: number): Resposta => ({ type: 'noul', noul: p });
const choice = (sust: number, conf = 0.9): Resposta => ({
  type: 'choice',
  choice: sust >= 0.5 ? 'sustentada' : 'sem_base',
  probabilities: { sustentada: sust, sem_base: 1 - sust, contradiz: 0 },
  confidence: conf,
});
const score = (s: number, conf = 0.9): Resposta => ({ type: 'score', score: s, confidence: conf });

/* Respostas "boas" para qualquer lote; `sobre` troca as que o caso pede. */
function respostasPara(lote: Lote, sobre: Record<string, Resposta> = {}): Record<string, Resposta> {
  const boas: Record<string, Resposta> = {
    c1: choice(0.95), c2: score(4), c3: noul(0.97), c4: noul(0.03), c6: noul(0.05),
    c8: noul(0.04), c10: noul(0.95), t1: noul(0.95), t2: noul(0.05),
    t3: noul(0.9), t4: noul(0.9), t5: noul(0.9), t6: noul(0.9),
  };
  const saida: Record<string, Resposta> = {};
  for (const id of Object.keys(lote.questions)) {
    const r = sobre[id] ?? boas[id];
    if (!r) throw new Error(`teste sem resposta para a pergunta ${id}`);
    saida[id] = r;
  }
  return saida;
}

describe('montarLoteTarefa — o que se pergunta', () => {
  test('Pesquisa: comuns + t1 e t2; sem c8 nem c10 quando não há o que comparar', () => {
    const lote = montarLoteTarefa(base);
    assert.deepEqual(Object.keys(lote.questions).sort(), ['c1', 'c2', 'c3', 'c4', 'c6', 't1', 't2']);
  });

  test('c8 entra com tarefas existentes; c10 entra com orientação', () => {
    const lote = montarLoteTarefa({ ...base, existentes: ['Pesquisar preços'], orientacao: 'Foque no centro da cidade' });
    assert.ok(lote.questions.c8);
    assert.ok(lote.questions.c10);
  });

  test('Matriz CSD pergunta t3 e t4; Referência pergunta t5 e t6; nenhum dos dois pergunta t1', () => {
    const m = montarLoteTarefa({ ...base, tipo: 'matriz_csd' });
    const r = montarLoteTarefa({ ...base, tipo: 'referencias_visuais' });
    assert.ok(m.questions.t3 && m.questions.t4 && !m.questions.t1);
    assert.ok(r.questions.t5 && r.questions.t6 && !r.questions.t1);
  });

  test('IA-AVAL-006: nenhuma pergunta de tipo `noul` junta dois julgamentos com "E"', () => {
    for (const tipo of ['pesquisa', 'matriz_csd', 'referencias_visuais'] as const) {
      const lote = montarLoteTarefa({ ...base, tipo, existentes: ['x'], orientacao: 'y' });
      for (const [id, p] of Object.entries(lote.questions)) {
        assert.ok(!/ E /.test(p.instructions), `${tipo}/${id} junta dois julgamentos: ${p.instructions}`);
      }
    }
  });

  test('IA-AVAL-015: o state não leva campo de pessoa', () => {
    const json = JSON.stringify(montarLoteTarefa(base).state);
    assert.ok(!/usuario|email|e-mail|userId/i.test(json));
  });

  test('os tetos da Visão valem aqui (existentes cortadas em TETOS_DO_LOTE.EXISTENTES)', () => {
    const muitas = Array.from({ length: TETOS_DO_LOTE.EXISTENTES + 20 }, (_, i) => `Tarefa ${i}`);
    const lote = montarLoteTarefa({ ...base, existentes: muitas });
    assert.equal((lote.state.existentes as string[]).length, TETOS_DO_LOTE.EXISTENTES);
  });

  test('resposta sem t1 é FALHA do avaliador, não nota (IA-AVAL-004)', () => {
    const lote = montarLoteTarefa(base);
    const r = respostasPara(lote);
    delete r.t1;
    assert.equal(validarRespostas(lote, r), null);
  });
});

describe('avaliarTarefa — a nota', () => {
  const lote = montarLoteTarefa(base);

  test('tarefa boa sai "alta", sem alerta', () => {
    const a = avaliarTarefa(lote, respostasPara(lote), 'jev', 'jev-1.13.0');
    assert.equal(a.faixa, 'alta');
    assert.deepEqual(a.alertas, []);
    assert.ok(a.criterios.t1 && a.criterios.t2);
  });

  test('IA-AVAL-021: pergunta que não se responde por fonte nunca sai "alta"', () => {
    const a = avaliarTarefa(lote, respostasPara(lote, { t1: noul(0.2) }), 'jev', 'jev-1.13.0');
    assert.notEqual(a.faixa, 'alta');
    assert.ok(a.alertas.some((x) => x.codigo === 'nao_pesquisavel'));
  });

  test('fato inventado trava em "baixa", como na Visão', () => {
    const a = avaliarTarefa(lote, respostasPara(lote, { c4: noul(0.9) }), 'jev', 'jev-1.13.0');
    assert.equal(a.faixa, 'baixa');
    assert.ok(a.alertas.some((x) => x.codigo === 'inventa_fato'));
  });

  test('t2 alto vira alerta "já respondida", mas não pesa na nota', () => {
    const sem = avaliarTarefa(lote, respostasPara(lote), 'jev', 'jev-1.13.0');
    const com = avaliarTarefa(lote, respostasPara(lote, { t2: noul(0.9) }), 'jev', 'jev-1.13.0');
    assert.equal(com.geral, sem.geral);
    assert.ok(com.alertas.some((x) => x.codigo === 'ja_respondida'));
  });

  test('duplicata de tarefa existente limita a "revisar"', () => {
    const l = montarLoteTarefa({ ...base, existentes: ['Pesquisar padarias de Curitiba'] });
    const a = avaliarTarefa(l, respostasPara(l, { c8: noul(0.9) }), 'jev', 'jev-1.13.0');
    assert.notEqual(a.faixa, 'alta');
    assert.ok(a.alertas.some((x) => x.codigo === 'duplicata_semantica'));
  });

  test('sem c1, c2 ou c3 a tarefa sai "não avaliado"', () => {
    const r = respostasPara(lote);
    delete r.c2;
    assert.equal(avaliarTarefa(lote, r, 'jev', 'jev-1.13.0').faixa, 'nao_avaliado');
  });
});

describe('proximoAposGerar — ATV-GERAR-018/019', () => {
  const lote = montarLoteTarefa(base);
  const ruim = avaliarTarefa(lote, respostasPara(lote, { t1: noul(0.1) }), 'jev', 'jev-1.13.0');
  const boa = avaliarTarefa(lote, respostasPara(lote), 'jev', 'jev-1.13.0');
  const peloClaude: Avaliacao = { ...ruim, avaliador: 'claude' };

  test('só segura com as três condições: visivel + JEV + t1 baixo', () => {
    assert.equal(proximoAposGerar('pesquisa', 'visivel', ruim), 'revisar');
  });
  test('em sombra, nunca segura', () => {
    assert.equal(proximoAposGerar('pesquisa', 'sombra', ruim), 'pesquisar');
  });
  test('nota do Claude não segura (chega depois da resposta)', () => {
    assert.equal(proximoAposGerar('pesquisa', 'visivel', peloClaude), 'pesquisar');
  });
  test('sem nota (JEV falhou), vale o caminho de hoje', () => {
    assert.equal(proximoAposGerar('pesquisa', 'visivel', null), 'pesquisar');
  });
  test('pergunta boa pesquisa', () => {
    assert.equal(proximoAposGerar('pesquisa', 'visivel', boa), 'pesquisar');
  });
  test('Referência e Matriz não mudam', () => {
    assert.equal(proximoAposGerar('referencias_visuais', 'visivel', ruim), 'abrir');
    assert.equal(proximoAposGerar('matriz_csd', 'visivel', ruim), 'classificar');
  });
  test('o limite de t1 é o do código, não um número solto no teste', () => {
    const noLimite = avaliarTarefa(lote, respostasPara(lote, { t1: noul(1 - LIMITES_TAREFA.naoPesquisavel / 100) }), 'jev', 'x');
    assert.equal(proximoAposGerar('pesquisa', 'visivel', noLimite), 'pesquisar');
  });
});

/* ---------- o orquestrador, com rede falsa ---------- */

type Rota = 'jev' | 'claude';
function redeFalsa(comportamento: Partial<Record<Rota, 'ok' | 500 | 'rede'>>, lote: Lote) {
  const chamadas: Rota[] = [];
  const buscar = (async (url: string | URL) => {
    const rota: Rota = String(url).includes('typesafe') ? 'jev' : 'claude';
    chamadas.push(rota);
    const modo = comportamento[rota] ?? 500;
    if (modo === 'rede') throw new TypeError('fetch failed');
    if (modo === 500) return new Response('erro', { status: 500 });
    const answers = respostasPara(lote);
    if (rota === 'jev') {
      return Response.json({ model: 'jev-1.13.0', answers, usage: { input_tokens: 900, output_tokens: 60 } });
    }
    const corpo = JSON.stringify({ answers }).slice('{"answers":{'.length);
    return Response.json({ content: [{ type: 'text', text: corpo }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 300 } });
  }) as typeof fetch;
  return { buscar, chamadas };
}

/* `semChave` e não `chave = 'teste'`: passar `undefined` a um parâmetro
   com padrão ATIVA o padrão, e o teste de chave ausente mandava chave. */
function deps(buscar: typeof fetch, semChave = false): DependenciasAvaliacao {
  return {
    jev: { chave: semChave ? undefined : 'teste', baseUrl: 'https://api.typesafe.ai', modelo: 'jev-1.13.0', timeoutMs: 1000 },
    claude: { chave: 'teste', modelo: 'claude-teste', timeoutMs: 1000 },
    buscar,
  };
}

describe('avaliarTarefaGerada — o caminho de falha (IA-AVAL-002 a 004, 019)', () => {
  const lote = montarLoteTarefa(base);

  test('JEV responde: avaliador "jev", uma chamada só', async () => {
    const rede = redeFalsa({ jev: 'ok' }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar));
    assert.equal(r.avaliador, 'jev');
    assert.equal(r.resultado.faixa, 'alta');
    assert.deepEqual(rede.chamadas, ['jev']);
  });

  test('apenas "jev": JEV falha e o Claude NÃO é chamado na requisição', async () => {
    const rede = redeFalsa({ jev: 500, claude: 'ok' }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar), { apenas: 'jev' });
    assert.equal(r.avaliador, 'nenhum');
    assert.equal(r.falhaJev, 'http');
    assert.equal(r.falhaClaude, null);
    assert.deepEqual(rede.chamadas, ['jev']);
  });

  test('apenas "claude": o segundo plano não chama o JEV de novo', async () => {
    const rede = redeFalsa({ jev: 'ok', claude: 'ok' }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar), { apenas: 'claude' });
    assert.equal(r.avaliador, 'claude');
    assert.deepEqual(rede.chamadas, ['claude']);
  });

  test('caminho completo: JEV fora do ar → Claude avalia', async () => {
    const rede = redeFalsa({ jev: 'rede', claude: 'ok' }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar));
    assert.equal(r.avaliador, 'claude');
    assert.equal(r.falhaJev, 'rede');
  });

  test('chave do JEV ausente é falha, e nem tenta a rede do JEV', async () => {
    const rede = redeFalsa({ claude: 'ok' }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar, true));
    assert.equal(r.falhaJev, 'sem-configuracao');
    assert.deepEqual(rede.chamadas, ['claude']);
  });

  test('os dois falham: "não avaliado", sem lançar (IA-AVAL-003)', async () => {
    const rede = redeFalsa({ jev: 500, claude: 500 }, lote);
    const r = await avaliarTarefaGerada(base, deps(rede.buscar));
    assert.equal(r.avaliador, 'nenhum');
    assert.equal(r.resultado.faixa, 'nao_avaliado');
  });
});

describe('avaliarLote — a assinatura antiga da Visão, depois da refatoração (A1)', () => {
  const ctx = {
    projetoNome: 'Identidade Visual', empresaNome: 'Padaria', empresaDescricao: null,
    validadas: [], existentes: [], orientacao: null,
    etapas: [{ titulo: 'Definir a paleta', descricao: 'Escolher 3 a 5 cores.' }, { titulo: 'Criar o logo', descricao: 'Três versões.' }],
  };
  const lote = montarLoteIdeias(ctx);
  const respostasEtapas = (): Record<string, Resposta> => {
    const s: Record<string, Resposta> = {};
    for (const [id, p] of Object.entries(lote.questions)) {
      s[id] = p.type === 'choice' ? choice(0.95) : p.type === 'score' ? score(p.criteria.length - 1) : noul(id.endsWith('c7') || id.endsWith('c3') ? 0.95 : 0.05);
    }
    return s;
  };

  test('JEV ok: uma avaliação por etapa, no formato de sempre', async () => {
    const buscar = (async () => Response.json({ model: 'jev-1.13.0', answers: respostasEtapas(), usage: { input_tokens: 1, output_tokens: 1 } })) as typeof fetch;
    const r = await avaliarLote(lote, 2, deps(buscar));
    assert.equal(r.avaliador, 'jev');
    assert.equal(r.avaliacoes.length, 2);
    assert.ok(r.avaliacoes.every((a) => a.avaliador === 'jev'));
  });

  test('os dois falham: "não avaliado" para cada etapa', async () => {
    const buscar = (async () => new Response('x', { status: 500 })) as typeof fetch;
    const r = await avaliarLote(lote, 2, deps(buscar));
    assert.equal(r.avaliador, 'nenhum');
    assert.equal(r.avaliacoes.length, 2);
    assert.ok(r.avaliacoes.every((a) => a.faixa === 'nao_avaliado'));
    assert.equal(r.falhaJev, 'http');
    assert.equal(r.falhaClaude, 'http');
  });
});

import { tetoAvaliacaoUsdMicros, tetoAvaliacaoPartes } from '../src/ia/avaliacao/avaliar.js';

describe('tetoAvaliacaoPartes — a reserva separada (IA-AVAL-019)', () => {
  const lote = montarLoteTarefa(base);
  test('as partes somam o teto de sempre', () => {
    const modelo = 'claude-sonnet-4-5';
    const partes = tetoAvaliacaoPartes(lote, 'jev-1.13.0', modelo);
    const total = tetoAvaliacaoUsdMicros(lote, 'jev-1.13.0', modelo);
    assert.ok(partes && total !== null, 'claude-sonnet-4-5 precisa estar em precos.ts, senão este teste não prova nada');
    assert.equal(partes.jev + partes.claude, total);
  });
  test('JEV sem preço cadastrado reserva zero (medido, não cobrado — T5)', () => {
    const partes = tetoAvaliacaoPartes(lote, 'jev-1.13.0', 'claude-sonnet-4-5');
    assert.ok(partes);
    assert.equal(partes.jev, 0);
  });
});
