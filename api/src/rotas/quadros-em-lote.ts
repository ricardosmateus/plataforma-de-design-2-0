/* ============================================================
   Gravar o board em LOTE — BOARD-SALVA-008 (PURO)
   ============================================================
   O PUT do board apaga e regrava tudo numa transação (BOARD-SALVA-003).
   Até 30/09/2026 regravava com `create` aninhado por quadro — e o
   Prisma transforma isso num INSERT por quadro, por coluna e por
   registro. Um resultado de pesquisa com vários quadros e dezenas de
   post-its virava dezenas de idas ao banco dentro de uma transação de
   5 s. Do servidor, ao lado do banco, cabia; de uma máquina longe dele
   (e com o banco acordando), estourava: P2028, "Transaction already
   closed", 500 — e o board NÃO era salvo. Visto em 30/09/2026 em três
   PUTs seguidos, tarefas fc51acc4 e 894bd2eb.

   Aqui se monta o que vai ao banco em TRÊS listas, com os ids gerados
   antes — então a gravação são três `createMany`, qualquer que seja o
   tamanho do board. Os ids são gerados por quem chama (`gerarId`),
   para este arquivo continuar puro e testável.
   ============================================================ */

export type QuadroRecebido = {
  titulo: string;
  tipo: 'postits' | 'documento' | 'matriz';
  modelo?: string | null;
  colunas: { titulo: string; registros: { titulo: string; descricao: string }[] }[];
};

export type Lotes = {
  quadros: { id: string; tarefaId: string; titulo: string; tipo: QuadroRecebido['tipo']; modelo: string | null; ordem: number }[];
  colunas: { id: string; quadroId: string; titulo: string; ordem: number }[];
  registros: { colunaId: string; titulo: string; descricao: string; ordem: number }[];
};

export function lotesDoBoard(tarefaId: string, quadros: QuadroRecebido[], gerarId: () => string): Lotes {
  const lotes: Lotes = { quadros: [], colunas: [], registros: [] };
  quadros.forEach((q, i) => {
    const quadroId = gerarId();
    lotes.quadros.push({
      id: quadroId,
      tarefaId,
      titulo: q.titulo,
      tipo: q.tipo,
      /* Só o tipo `matriz` guarda modelo (BOARD-PESQUISA-MATRIZ-006). */
      modelo: q.tipo === 'matriz' ? q.modelo ?? null : null,
      ordem: i,
    });
    q.colunas.forEach((c, j) => {
      const colunaId = gerarId();
      lotes.colunas.push({ id: colunaId, quadroId, titulo: c.titulo, ordem: j });
      c.registros.forEach((r, k) => {
        lotes.registros.push({ colunaId, titulo: r.titulo, descricao: r.descricao, ordem: k });
      });
    });
  });
  return lotes;
}
