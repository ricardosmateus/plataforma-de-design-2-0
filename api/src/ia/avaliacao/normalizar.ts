/* ============================================================
   Avaliação do conteúdo de IA — das respostas à nota (PURO)
   ============================================================
   Regras:  Regras_de_negocio/modulos/ia/ia-avaliacao.md
   Plano:   planejamento-jev-avaliacao.md §3.3 e §5.2

   JEV e Claude respondem no MESMO formato (o do JEV), e este
   arquivo é o único lugar que transforma essas respostas em
   `Avaliacao`. Por isso a nota não depende de quem avaliou — só a
   etiqueta `avaliador` muda (IA-AVAL-010).

   Estrita no FORMATO: pergunta sem resposta, tipo trocado ou número
   fora de 0..1 fazem `validarRespostas` devolver `null`, e isso é
   FALHA do avaliador (IA-AVAL-004), não nota zero. Uma nota
   inventada a partir de resposta quebrada seria pior que nenhuma.
   ============================================================ */

import { ID_C9, idPergunta, type Lote, type Pergunta } from './perguntas.js';

export type Resposta =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number | null }
  | { type: 'score'; score: number; confidence: number | null };

export type Criterio = { pct: number; confianca: number | null };

export type CodigoAlerta = 'inventa_fato' | 'contradiz_evidencia' | 'duplicata_semantica';
export type Alerta = { codigo: CodigoAlerta; texto: string };

export type Avaliador = 'jev' | 'claude' | 'nenhum';
export type Faixa = 'alta' | 'revisar' | 'baixa' | 'nao_avaliado';

export type Avaliacao = {
  avaliador: Avaliador;
  modelo: string | null;
  geral: number | null;
  faixa: Faixa;
  incerta: boolean;
  criterios: Record<string, Criterio>;
  alertas: Alerta[];
};

/* IA-AVAL-008 — pesos e teto. Mudam só com calibração registrada
   (IA-AVAL-014). */
export const PESOS = { c1: 0.4, c2: 0.3, c3: 0.15, especificos: 0.15 } as const;
export const TETO_ACIMA_DE_C1 = 10;
export const LIMITE_ALERTA = 50;
export const CONFIANCA_MINIMA = 0.5;

/* Faixas de IA-AVAL-009. */
export function faixaDe(geral: number | null): Faixa {
  if (geral === null) return 'nao_avaliado';
  if (geral >= 80) return 'alta';
  if (geral >= 50) return 'revisar';
  return 'baixa';
}

export function naoAvaliado(): Avaliacao {
  return { avaliador: 'nenhum', modelo: null, geral: null, faixa: 'nao_avaliado', incerta: false, criterios: {}, alertas: [] };
}

const entre01 = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const pct = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100);

function lerUma(p: Pergunta, bruta: unknown): Resposta | null {
  const r = (bruta ?? {}) as Record<string, unknown>;
  if (r.type !== p.type) return null;

  if (p.type === 'noul') {
    return entre01(r.noul) ? { type: 'noul', noul: r.noul } : null;
  }

  const confianca = r.confidence === undefined || r.confidence === null ? null : entre01(r.confidence) ? r.confidence : undefined;
  if (confianca === undefined) return null;

  if (p.type === 'choice') {
    const opcoes = Object.keys(p.criteria);
    if (typeof r.choice !== 'string' || !opcoes.includes(r.choice)) return null;
    const probs: Record<string, number> = {};
    const brutas = (r.probabilities ?? null) as Record<string, unknown> | null;
    if (brutas && typeof brutas === 'object') {
      for (const o of opcoes) {
        const v = brutas[o];
        if (v === undefined) continue;
        if (!entre01(v)) return null;
        probs[o] = v;
      }
    }
    /* Sem probabilidades, a escolha vale como certeza. É o que sobra
       de uma resposta que só disse o rótulo — e sai marcada com a
       confiança que vier (ou nenhuma). */
    if (!Object.keys(probs).length) probs[r.choice] = 1;
    return { type: 'choice', choice: r.choice, probabilities: probs, confidence: confianca };
  }

  const max = p.criteria.length - 1;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score) || r.score < 0 || r.score > max) return null;
  return { type: 'score', score: r.score, confidence: confianca };
}

/**
 * Confere que TODA pergunta do lote tem resposta válida. Qualquer
 * buraco devolve `null` — falha do avaliador (IA-AVAL-004).
 */
export function validarRespostas(lote: Lote, answers: unknown): Record<string, Resposta> | null {
  if (!answers || typeof answers !== 'object') return null;
  const mapa = answers as Record<string, unknown>;
  const saida: Record<string, Resposta> = {};
  for (const [id, p] of Object.entries(lote.questions)) {
    const r = lerUma(p, mapa[id]);
    if (!r) return null;
    saida[id] = r;
  }
  return saida;
}

function criterioDe(p: Pergunta, r: Resposta): Criterio {
  if (r.type === 'noul') return { pct: pct(r.noul), confianca: null };
  if (r.type === 'score') {
    const niveis = (p as { criteria: string[] }).criteria.length;
    return { pct: pct(r.score / (niveis - 1)), confianca: r.confidence };
  }
  return { pct: pct(r.probabilities.sustentada ?? 0), confianca: r.confidence };
}

/** Nota geral de IA-AVAL-008. `especificos` é a média do que houver. */
export function calcularGeral(c1: number, c2: number, c3: number, especificos: number[]): number {
  const esp = especificos.length ? especificos.reduce((a, b) => a + b, 0) / especificos.length : c3;
  const bruta = PESOS.c1 * c1 + PESOS.c2 * c2 + PESOS.c3 * c3 + PESOS.especificos * esp;
  return Math.round(Math.max(0, Math.min(100, Math.min(bruta, c1 + TETO_ACIMA_DE_C1))));
}

/**
 * Transforma as respostas validadas em uma `Avaliacao` por etapa, na
 * mesma ordem de `etapas`. C9 (ordem da lista) entra em todas como
 * informação, mas não pesa na nota de nenhuma — a ordem é da lista,
 * não da etapa.
 */
export function avaliarEtapas(
  lote: Lote,
  respostas: Record<string, Resposta>,
  avaliador: Exclude<Avaliador, 'nenhum'>,
  modelo: string | null,
  quantidade: number,
): Avaliacao[] {
  const c9 = lote.questions[ID_C9] && respostas[ID_C9] ? criterioDe(lote.questions[ID_C9], respostas[ID_C9]) : null;
  const saida: Avaliacao[] = [];

  for (let i = 0; i < quantidade; i++) {
    const ler = (cod: string): Criterio | null => {
      const id = idPergunta(i, cod);
      const p = lote.questions[id];
      const r = respostas[id];
      return p && r ? criterioDe(p, r) : null;
    };

    const c1 = ler('c1');
    const c2 = ler('c2');
    const c3 = ler('c3');
    if (!c1 || !c2 || !c3) {
      saida.push(naoAvaliado());
      continue;
    }
    const c4 = ler('c4');
    const generica = ler('c6');
    const c7 = ler('c7');
    const c8 = ler('c8');
    const c10 = ler('c10');

    /* C6 é perguntado ao contrário ("é genérica?") porque é assim que
       o julgamento fica atômico; na tela vale "específica". */
    const c6: Criterio | null = generica ? { pct: 100 - generica.pct, confianca: null } : null;

    const criterios: Record<string, Criterio> = { c1, c2, c3 };
    if (c4) criterios.c4 = c4;
    if (c6) criterios.c6 = c6;
    if (c7) criterios.c7 = c7;
    if (c8) criterios.c8 = c8;
    if (c10) criterios.c10 = c10;
    if (c9) criterios.c9 = c9;

    const especificos = [c6, c7, c10].filter((c): c is Criterio => !!c).map((c) => c.pct);
    const geral = calcularGeral(c1.pct, c2.pct, c3.pct, especificos);

    const alertas: Alerta[] = [];
    const r1 = respostas[idPergunta(i, 'c1')];
    if (r1?.type === 'choice' && (r1.probabilities.contradiz ?? 0) * 100 > LIMITE_ALERTA) {
      alertas.push({ codigo: 'contradiz_evidencia', texto: 'Contradiz o que está na ficha da empresa ou nas idéias validadas.' });
    }
    if (c4 && c4.pct > LIMITE_ALERTA) {
      alertas.push({ codigo: 'inventa_fato', texto: 'Afirma sobre a empresa algo que não está na ficha.' });
    }
    if (c8 && c8.pct > LIMITE_ALERTA) {
      alertas.push({ codigo: 'duplicata_semantica', texto: 'Parece repetir uma idéia que já existe no projeto.' });
    }

    /* Só a dúvida sobre a PRÓPRIA etapa. C9 é da lista: um JEV em
       dúvida sobre a ordem não torna incerta a nota de cada etapa
       (visto no teste real de 29/09: C9 com 0,39 marcava todas). */
    const incerta = [c1, c2].some((c) => c.confianca !== null && c.confianca < CONFIANCA_MINIMA);

    saida.push({ avaliador, modelo, geral, faixa: faixaDe(geral), incerta, criterios, alertas });
  }

  return saida;
}
