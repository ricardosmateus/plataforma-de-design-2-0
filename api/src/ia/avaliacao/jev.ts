/* ============================================================
   Avaliação — o JEV (TypeSafe System One), avaliador principal
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-002/004
   API:     POST {TYPESAFE_BASE_URL}/v1/systemone
            Authorization: Bearer TYPESAFE_API_KEY
            corpo { state, model, questions } → { model, answers, usage }
            (https://docs.typesafe.ai/api.md, conferido em 29/09/2026)

   Fetch sem SDK, no mesmo molde de `gerar-ideias.ts`. O `fetch` e a
   configuração entram por parâmetro: é o que deixa os caminhos de
   falha testáveis sem rede (testes/avaliacao-rede.test.ts).

   Toda falha vira `{ ok: false, motivo }` — nunca exceção. Quem
   decide o que fazer com a falha (chamar o Claude) é `avaliar.ts`.
   ============================================================ */

import { lerUso } from '../../creditos/precos.js';
import { validarRespostas } from './normalizar.js';
import type { Lote } from './perguntas.js';
import { ehTimeout, type Buscar, type Chamada, type ResultadoAvaliador } from './chamada.js';

export type ConfigJev = {
  chave: string | undefined;
  baseUrl: string;
  modelo: string;
  timeoutMs: number;
};

export async function avaliarComJev(lote: Lote, cfg: ConfigJev, buscar: Buscar = fetch): Promise<ResultadoAvaliador> {
  /* IA-AVAL-004: chave ausente é falha do JEV — segue para o Claude. */
  if (!cfg.chave) return { ok: false, motivo: 'sem-configuracao', chamada: null };

  let resposta: Response;
  try {
    resposta = await buscar(`${cfg.baseUrl.replace(/\/+$/, '')}/v1/systemone`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.chave}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ state: lote.state, model: cfg.modelo, questions: lote.questions }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    return { ok: false, motivo: ehTimeout(e) ? 'timeout' : 'rede', chamada: null };
  }

  /* 401/422/429/529 e afins: a chamada não rodou, não há uso a
     repassar. O corpo do erro não sai daqui (pode ter detalhe de
     infraestrutura). */
  if (!resposta.ok) {
    return { ok: false, motivo: 'http', chamada: { fornecedor: 'jev', modelo: cfg.modelo, uso: null, cobrou: false } };
  }

  let corpo: { model?: unknown; answers?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  try {
    corpo = (await resposta.json()) as typeof corpo;
  } catch {
    /* 2xx com corpo ilegível: a chamada rodou (e, portanto, foi
       cobrada), mas não há `usage` para medir. Fica registrada sem
       tokens — o buraco aparece em vez de ser inventado. */
    return { ok: false, motivo: 'formato', chamada: { fornecedor: 'jev', modelo: cfg.modelo, uso: null, cobrou: true } };
  }

  const modelo = typeof corpo.model === 'string' && corpo.model ? corpo.model : cfg.modelo;
  const chamada: Chamada = {
    fornecedor: 'jev',
    modelo,
    uso: lerUso({ input_tokens: corpo.usage?.input_tokens, output_tokens: corpo.usage?.output_tokens }),
    cobrou: true,
    requisicaoId: resposta.headers.get('x-request-id') ?? resposta.headers.get('request-id') ?? undefined,
  };

  const respostas = validarRespostas(lote, corpo.answers);
  if (!respostas) return { ok: false, motivo: 'formato', chamada };

  return { ok: true, respostas, modelo, chamada };
}
