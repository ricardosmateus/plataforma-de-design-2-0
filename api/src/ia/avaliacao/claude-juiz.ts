/* ============================================================
   Avaliação — o Claude, avaliador de reserva
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-002/004

   Só roda quando o JEV falha. Recebe o MESMO lote (state +
   questions) e devolve as respostas no formato do JEV, para que
   `normalizar.ts` trate as duas iguais. Resposta pré-preenchida
   ('{"answers":{'), como em `gerar-ideias.ts`: o modelo não tem por
   onde escrever prosa.

   O Claude não tem a calibração do JEV: é pedido que dê
   probabilidades, mas elas valem como estimativa. Por isso a tela
   diz quem avaliou (IA-AVAL-010).
   ============================================================ */

import { lerUso, tokensEstimados } from '../../creditos/precos.js';
import { validarRespostas } from './normalizar.js';
import type { Lote } from './perguntas.js';
import { ehTimeout, type Buscar, type ResultadoAvaliador } from './chamada.js';

export type ConfigClaude = {
  chave: string | undefined;
  modelo: string | undefined;
  timeoutMs: number;
};

export const SISTEMA_JUIZ = `Você é um avaliador rigoroso. Você NÃO escreve texto: você responde perguntas objetivas sobre um conteúdo, com probabilidades calibradas.

Você recebe:
- "state": o conteúdo e as evidências. Campos são referenciados nas perguntas entre crases, como \`etapas.0\` (índice começa em 0).
- "questions": um mapa id -> pergunta, de três tipos:
  - "noul": pergunta de sim/não. Responda {"type":"noul","noul":P} com P = probabilidade de SIM, entre 0 e 1.
  - "choice": escolha uma opção de "criteria". Responda {"type":"choice","choice":"<chave>","probabilities":{"<chave>":p,...},"confidence":c}, com as probabilidades de TODAS as opções somando 1, e c entre 0 e 1.
  - "score": níveis ordenados em "criteria" (o primeiro é o nível 0). Responda {"type":"score","score":s,"confidence":c}, com s = nível esperado (pode ter casa decimal), entre 0 e o último nível.

Regras:
1. Julgue SOMENTE pelo que está em "state". Não use conhecimento externo sobre a empresa: o que não está nas evidências não está confirmado.
2. Responda TODAS as perguntas, com os mesmos ids.
3. Responda SOMENTE com JSON, sem texto antes ou depois: {"answers":{"<id>":{...},...}}`;

const PREFIXO = '{"answers":{';

/* ~45 tokens de saída por resposta, com folga. Cortar no meio do
   JSON viraria falha e custo sem nota. */
export function maxTokensJuiz(quantidadePerguntas: number): number {
  return Math.min(8000, 300 + 60 * quantidadePerguntas);
}

export function mensagemJuiz(lote: Lote): string {
  return JSON.stringify({ state: lote.state, questions: lote.questions });
}

export function tokensEntradaJuiz(lote: Lote): number {
  return tokensEstimados(SISTEMA_JUIZ + '\n' + mensagemJuiz(lote));
}

/**
 * Lê o JSON do juiz. Aceita, em ordem: o objeto inteiro (sem prefill,
 * o normal desde 30/09/2026), com cercas de código ou texto em volta; e
 * a continuação de `{"answers":{` (respostas antigas, testes antigos).
 */
export function lerRespostaJuiz(texto: string): unknown | null {
  const limpo = String(texto ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const tentativas = [limpo];
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i >= 0 && f > i) tentativas.push(limpo.slice(i, f + 1));
  tentativas.push(PREFIXO + limpo);
  for (const t of tentativas) {
    try {
      const o = JSON.parse(t) as { answers?: unknown };
      if (o && typeof o === 'object' && o.answers && typeof o.answers === 'object') return o;
    } catch {
      /* próxima forma */
    }
  }
  return null;
}

export async function avaliarComClaude(lote: Lote, cfg: ConfigClaude, buscar: Buscar = fetch): Promise<ResultadoAvaliador> {
  if (!cfg.chave || !cfg.modelo) return { ok: false, motivo: 'sem-configuracao', chamada: null };
  const modelo = cfg.modelo;

  let resposta: Response;
  try {
    resposta = await buscar('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.chave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokensJuiz(Object.keys(lote.questions).length),
        system: [{ type: 'text', text: SISTEMA_JUIZ, cache_control: { type: 'ephemeral' } }],
        /* Sem prefill desde 30/09/2026 — a mesma lição da proposta de
           tarefa (gerar-tarefa.ts), onde o modelo recomeçou o objeto
           dentro do começo imposto e esqueceu aspas. A leitura abaixo
           aceita as duas formas: o JSON inteiro e a continuação. */
        messages: [{ role: 'user', content: mensagemJuiz(lote) }],
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    return { ok: false, motivo: ehTimeout(e) ? 'timeout' : 'rede', chamada: null };
  }

  if (!resposta.ok) {
    return { ok: false, motivo: 'http', chamada: { fornecedor: 'claude', modelo, uso: null, cobrou: false } };
  }

  let corpo: { content?: Array<{ type?: string; text?: string }>; stop_reason?: string; usage?: unknown };
  try {
    corpo = (await resposta.json()) as typeof corpo;
  } catch {
    return { ok: false, motivo: 'formato', chamada: { fornecedor: 'claude', modelo, uso: null, cobrou: true } };
  }

  const chamada = {
    fornecedor: 'claude' as const,
    modelo,
    uso: lerUso(corpo.usage),
    cobrou: true,
    requisicaoId: resposta.headers.get('request-id') ?? undefined,
  };

  if (corpo.stop_reason === 'max_tokens') return { ok: false, motivo: 'cortada', chamada };

  const texto = (corpo.content ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');

  const dados = lerRespostaJuiz(texto);
  if (dados === null) return { ok: false, motivo: 'formato', chamada };

  const respostas = validarRespostas(lote, (dados as { answers?: unknown })?.answers);
  if (!respostas) return { ok: false, motivo: 'formato', chamada };

  return { ok: true, respostas, modelo, chamada };
}
