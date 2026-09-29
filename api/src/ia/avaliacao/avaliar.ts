/* ============================================================
   Avaliação — o orquestrador: JEV → Claude → "não avaliado"
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-002/003/004/013
   Plano:   planejamento-jev-avaliacao.md §2

   NUNCA LANÇA. A avaliação é uma camada sobre um conteúdo que já foi
   gerado e pago; se ela quebrar, o conteúdo segue como "não
   avaliado" (IA-AVAL-003). O contrário — perder as idéias porque a
   nota falhou — seria trocar o produto pela nota do produto.

   Devolve também TODAS as chamadas feitas (a do JEV que falhou
   depois de cobrar, a do Claude), porque todas custaram e são
   repassadas ao usuário (IA-AVAL-013/017).
   ============================================================ */

import { custoUsdMicros, precoDe, tetoUsdMicros } from '../../creditos/precos.js';
import { avaliarComClaude, maxTokensJuiz, mensagemJuiz, SISTEMA_JUIZ, type ConfigClaude } from './claude-juiz.js';
import { avaliarComJev, type ConfigJev } from './jev.js';
import { avaliarEtapas, naoAvaliado, type Avaliacao, type Avaliador } from './normalizar.js';
import { montarLoteIdeias, type ContextoAvaliacaoIdeias, type Lote } from './perguntas.js';
import type { Buscar, Chamada, MotivoFalha } from './chamada.js';

export type DependenciasAvaliacao = {
  jev: ConfigJev;
  claude: ConfigClaude;
  buscar?: Buscar;
};

export type ResultadoAvaliacao = {
  avaliador: Avaliador;
  modelo: string | null;
  /* Uma por etapa, na ordem de `etapas`. */
  avaliacoes: Avaliacao[];
  chamadas: Chamada[];
  falhaJev: MotivoFalha | null;
  falhaClaude: MotivoFalha | null;
};

export async function avaliarLote(lote: Lote, quantidade: number, deps: DependenciasAvaliacao): Promise<ResultadoAvaliacao> {
  const chamadas: Chamada[] = [];
  const buscar = deps.buscar ?? fetch;
  let falhaJev: MotivoFalha | null = null;
  let falhaClaude: MotivoFalha | null = null;

  try {
    /* ---- 1. JEV, o principal (IA-AVAL-002) ---- */
    const jev = await avaliarComJev(lote, deps.jev, buscar);
    if (jev.chamada) chamadas.push(jev.chamada);
    if (jev.ok) {
      return {
        avaliador: 'jev',
        modelo: jev.modelo,
        avaliacoes: avaliarEtapas(lote, jev.respostas, 'jev', jev.modelo, quantidade),
        chamadas,
        falhaJev,
        falhaClaude,
      };
    }
    falhaJev = jev.motivo;

    /* ---- 2. Claude, a reserva (IA-AVAL-004) ---- */
    const claude = await avaliarComClaude(lote, deps.claude, buscar);
    if (claude.chamada) chamadas.push(claude.chamada);
    if (claude.ok) {
      return {
        avaliador: 'claude',
        modelo: claude.modelo,
        avaliacoes: avaliarEtapas(lote, claude.respostas, 'claude', claude.modelo, quantidade),
        chamadas,
        falhaJev,
        falhaClaude,
      };
    }
    falhaClaude = claude.motivo;
  } catch {
    /* Defesa final: nada daqui pode derrubar a rota. */
    falhaJev ??= 'rede';
    falhaClaude ??= 'rede';
  }

  /* ---- 3. Nenhum respondeu (IA-AVAL-003) ---- */
  return {
    avaliador: 'nenhum',
    modelo: null,
    avaliacoes: Array.from({ length: quantidade }, () => naoAvaliado()),
    chamadas,
    falhaJev,
    falhaClaude,
  };
}

/** F1 — as etapas do "Gerar com ajuda da IA". */
export function avaliarIdeias(ctx: ContextoAvaliacaoIdeias, deps: DependenciasAvaliacao): Promise<ResultadoAvaliacao> {
  if (!ctx.etapas.length) {
    return Promise.resolve({ avaliador: 'nenhum', modelo: null, avaliacoes: [], chamadas: [], falhaJev: null, falhaClaude: null });
  }
  return avaliarLote(montarLoteIdeias(ctx), ctx.etapas.length, deps);
}

/* ------------------------------------------------------------
   Custo — IA-AVAL-013/017
   ------------------------------------------------------------ */

/* Saída do JEV é curta (~17 tokens por resposta no teste de 29/09);
   30 por pergunta dá folga para o teto. */
const TOKENS_SAIDA_JEV_POR_PERGUNTA = 30;

/**
 * Teto em MICRO-DÓLAR a reservar para a avaliação de um lote: o JEV
 * MAIS o Claude, porque os dois podem rodar (o JEV falha depois de
 * cobrar, o Claude entra). `null` quando o modelo do Claude não tem
 * preço — a mesma recusa que a rota já faz para a geração.
 *
 * O JEV sem preço cadastrado entra com teto ZERO: não se reserva o
 * que não se sabe cobrar. O consumo dele é medido mesmo assim e fica
 * marcado `precoDesconhecido` (IA-AVAL-017).
 */
export function tetoAvaliacaoUsdMicros(lote: Lote, modeloJev: string, modeloClaude: string): number | null {
  const n = Object.keys(lote.questions).length;
  const claude = tetoUsdMicros(modeloClaude, SISTEMA_JUIZ + '\n' + mensagemJuiz(lote), maxTokensJuiz(n));
  if (claude === null) return null;
  const jev = precoDe(modeloJev)
    ? (tetoUsdMicros(modeloJev, JSON.stringify(lote), TOKENS_SAIDA_JEV_POR_PERGUNTA * n) ?? 0)
    : 0;
  return claude + jev;
}

/**
 * Custo real das chamadas que o fornecedor cobrou. As que não têm
 * preço (JEV hoje) voltam em `semPreco` — medidas, não cobradas, e
 * nunca estimadas.
 */
export function custoDasChamadas(chamadas: Chamada[]): { usdMicros: number; semPreco: Chamada[] } {
  let usdMicros = 0;
  const semPreco: Chamada[] = [];
  for (const c of chamadas) {
    if (!c.cobrou || !c.uso) continue;
    const usd = custoUsdMicros(c.modelo, c.uso);
    if (usd === null) semPreco.push(c);
    else usdMicros += usd;
  }
  return { usdMicros, semPreco };
}
