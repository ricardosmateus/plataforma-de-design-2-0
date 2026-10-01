/* ============================================================
   Análise visual — o custo e a junção com a busca (PURO)
   ============================================================
   Regras: BOARD-VISUAL-018 a 021
   Plano:  planejamento-jev-board.md §1.2, subfase 1b-2c

   A análise visual roda DEPOIS da busca em texto, na mesma
   investigação (decisão do Ricardo, 30/09/2026: "as duas, num
   resultado só"). Aqui:
   1. o PIOR CASO dela, para a reserva (reservar → chamar → liberar →
      consumir o real, o padrão de creditos/reserva.ts);
   2. QUANTAS EMPRESAS CABEM no teto da investigação, junto com a
      busca — em vez de passar do teto ou recusar;
   3. a JUNÇÃO das duas respostas, com as fontes e as afirmações da
      análise visual deslocadas para depois das da busca.
   ============================================================ */

import { custoUsdMicros, custoBuscasUsdMicros } from '../creditos/precos.js';
import { BUSCAS_EMPRESAS, EMPRESAS_MAX, MAX_TOKENS_ANALISE, MAX_TOKENS_EMPRESAS } from './analise-visual-rede.js';

/* D2 (14/09/2026): R$ 3 por investigação. O plano registra
   `TETO_INVESTIGACAO_MICROS` como implementado, mas a constante não
   foi achada no código em 30/09/2026 — então a análise visual traz o
   seu, com o mesmo valor, e respeita a soma: busca + visual ≤ teto. */
export const TETO_INVESTIGACAO_MICROS = 3_000_000;

/* O pior caso de entrada, medido pelo que vai em cada chamada:
   descoberta = prompt + resultados de até 5 buscas, que voltam ao
   contexto a cada rodada; análise = imagem do logotipo (~1,6 mil
   tokens no pior caso) + os dados extraídos + o prompt. */
export const ENTRADA_MAX_EMPRESAS = 30_000;
export const ENTRADA_MAX_ANALISE = 6_000;
export const MINIMO_DE_EMPRESAS = 2; // uma comparação precisa de duas

/** O teto, em US$ micros, de uma análise com `n` empresas. `null` se
 *  algum modelo não tiver preço — e aí ela não roda (sem preço não há
 *  teto, sem teto não há reserva). */
export function tetoVisualUsdMicros(modeloEmpresas: string, modeloAnalise: string, n: number): number | null {
  const descoberta = custoUsdMicros(modeloEmpresas, { entrada: ENTRADA_MAX_EMPRESAS, saida: MAX_TOKENS_EMPRESAS, cacheEscrita: 0, cacheLeitura: 0 });
  const porMarca = custoUsdMicros(modeloAnalise, { entrada: ENTRADA_MAX_ANALISE, saida: MAX_TOKENS_ANALISE, cacheEscrita: 0, cacheLeitura: 0 });
  if (descoberta === null || porMarca === null) return null;
  return descoberta + custoBuscasUsdMicros(BUSCAS_EMPRESAS) + n * porMarca;
}

/**
 * BOARD-VISUAL-018: a maior quantidade de empresas (até 8) que cabe no
 * teto JUNTO com o que a busca reservou. Menos de 2 não é comparação:
 * devolve 0, e a investigação entrega só a busca em texto.
 */
export function empresasQueCabem(p: {
  reservadoBuscaMicros: number;
  modeloEmpresas: string;
  modeloAnalise: string;
  emReais: (usdMicros: number) => number;
  tetoMicros?: number;
}): { empresas: number; estimativaMicros: number } {
  const teto = p.tetoMicros ?? TETO_INVESTIGACAO_MICROS;
  for (let n = EMPRESAS_MAX; n >= MINIMO_DE_EMPRESAS; n--) {
    const usd = tetoVisualUsdMicros(p.modeloEmpresas, p.modeloAnalise, n);
    if (usd === null) return { empresas: 0, estimativaMicros: 0 };
    const reais = p.emReais(usd);
    if (p.reservadoBuscaMicros + reais <= teto) return { empresas: n, estimativaMicros: reais };
  }
  return { empresas: 0, estimativaMicros: 0 };
}

type FonteJuntavel = { url: string; titulo?: string; trecho?: string; inicios?: number[] };
type AfirmacaoJuntavel = { texto: string; fonteIds: number[]; trechos: string[]; semFonte: boolean; inicio: number };

export const TITULO_DA_SECAO_VISUAL = '## Análise visual';

/**
 * BOARD-VISUAL-019: a resposta da busca, e depois dela a análise
 * visual numa seção própria. As fontes da análise vêm DEPOIS das da
 * busca, então os índices (`fonteIds`) andam o tamanho da lista da
 * busca, e as posições (`inicio`, `inicios`) andam o tamanho do texto
 * que veio antes — senão a afirmação apontaria para a fonte errada,
 * e a fonte cairia no quadro errado.
 */
export function juntarRespostas<F extends FonteJuntavel, A extends AfirmacaoJuntavel>(
  busca: { resposta: string; fontes: F[]; afirmacoes: A[] },
  visual: { resposta: string; fontes: FonteJuntavel[]; afirmacoes: AfirmacaoJuntavel[] },
): { resposta: string; fontes: FonteJuntavel[]; afirmacoes: AfirmacaoJuntavel[] } {
  const base = busca.resposta.replace(/\s+$/, '');
  const prefixo = `${base}${base ? '\n\n' : ''}${TITULO_DA_SECAO_VISUAL}\n\n`;
  const desloc = prefixo.length;
  const n = busca.fontes.length;
  return {
    resposta: prefixo + visual.resposta,
    fontes: [
      ...busca.fontes,
      ...visual.fontes.map((f) => ({ ...f, inicios: (f.inicios ?? []).map((i) => i + desloc) })),
    ],
    afirmacoes: [
      ...busca.afirmacoes,
      ...visual.afirmacoes.map((a) => ({ ...a, fonteIds: a.fonteIds.map((i) => i + n), inicio: a.inicio + desloc })),
    ],
  };
}
