/* ============================================================
   Avaliação — o que as duas camadas de rede têm em comum
   ============================================================
   `Chamada` é a medição de UMA ida a um fornecedor. A rota soma as
   chamadas para cobrar (IA-AVAL-013) e grava cada uma em
   `consumos_ia` como `avaliacao` — inclusive a do JEV que falhou
   depois de cobrar (resposta fora do formato), porque o custo
   aconteceu (IA-AVAL-017).

   `cobrou` é a leitura honesta de "o fornecedor cobrou por isto?":
   verdadeiro quando a resposta HTTP foi 2xx (a chamada rodou, tem
   `usage`); falso em erro de rede, timeout e HTTP de erro, em que
   não há uso a repassar.
   ============================================================ */

import type { Uso } from '../../creditos/precos.js';
import type { Resposta } from './normalizar.js';

export type Fornecedor = 'jev' | 'claude';

export type Chamada = {
  fornecedor: Fornecedor;
  modelo: string;
  uso: Uso | null;
  cobrou: boolean;
  requisicaoId?: string;
};

export type MotivoFalha = 'sem-configuracao' | 'rede' | 'timeout' | 'http' | 'formato' | 'cortada';

export type ResultadoAvaliador =
  | { ok: true; respostas: Record<string, Resposta>; modelo: string; chamada: Chamada }
  | { ok: false; motivo: MotivoFalha; chamada: Chamada | null };

export type Buscar = typeof fetch;

export function usoVazio(): Uso {
  return { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
}

/* Timeout do AbortSignal chega como DOMException 'TimeoutError'
   (ou 'AbortError' em versões mais antigas). */
export function ehTimeout(e: unknown): boolean {
  const nome = (e as { name?: string })?.name;
  return nome === 'TimeoutError' || nome === 'AbortError';
}
