/* ============================================================
   O teto por investigação — BOARD-PESQUISA-093 a 096 (PURO)
   ============================================================
   D2 (Ricardo, 14/09/2026): R$ 3 por investigação. O plano registrava
   `TETO_INVESTIGACAO_MICROS` como implementado, e três comentários da
   rota de pesquisa diziam que o teto "continua valendo" — mas nenhuma
   linha de código o aplicava (conferido em 01/10/2026). O caderno, que
   não tem portão, era o caminho por onde o gasto podia crescer sem
   limite, pergunta após pergunta.

   Um lugar só, usado pela busca, pela análise visual e pelo caderno.
   O valor NÃO aparece na mensagem para a pessoa: valor só no
   Histórico de uso (DIN-013, D11).
   ============================================================ */

export const TETO_INVESTIGACAO_MICROS = 3_000_000; // R$ 3,00

export function cabeNoTeto(p: { gastoMicros: number; estimativaMicros: number; tetoMicros?: number }): {
  cabe: boolean;
  disponivelMicros: number;
} {
  const teto = p.tetoMicros ?? TETO_INVESTIGACAO_MICROS;
  const gasto = Math.max(0, Number.isFinite(p.gastoMicros) ? p.gastoMicros : 0);
  const disponivel = Math.max(0, teto - gasto);
  return { cabe: Math.max(0, p.estimativaMicros) <= disponivel, disponivelMicros: disponivel };
}

export const MENSAGEM_TETO_BUSCA =
  'Esta busca pode passar do limite de gasto por investigação, então ela não foi feita. Nada foi cobrado pela busca.';
export const MENSAGEM_TETO_CADERNO =
  'Esta investigação chegou ao limite de gasto. Para continuar, faça uma pesquisa nova.';
