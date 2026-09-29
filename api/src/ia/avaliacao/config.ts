/* A configuração da avaliação, lida do ambiente. Separada de
   `avaliar.ts` para que o orquestrador continue testável sem `.env`:
   os testes passam a configuração na mão. */

import { env } from '../../env.js';
import type { DependenciasAvaliacao } from './avaliar.js';

export function avaliacaoLigada(): boolean {
  return env.AVALIACAO_MODO !== 'desligada';
}

export function dependenciasDoAmbiente(): DependenciasAvaliacao {
  return {
    jev: {
      chave: env.TYPESAFE_API_KEY,
      baseUrl: env.TYPESAFE_BASE_URL,
      modelo: env.TYPESAFE_MODELO,
      timeoutMs: env.TYPESAFE_TIMEOUT_MS,
    },
    claude: {
      chave: env.IA_DRIVER === 'anthropic' ? env.IA_API_KEY : undefined,
      modelo: env.IA_MODELO,
      timeoutMs: env.AVALIACAO_CLAUDE_TIMEOUT_MS,
    },
  };
}
