/* ============================================================
   Ordem dos cards dentro de uma coluna — IDEIA-ORDEM-001 a 008
   ============================================================
   Regras: Regras_de_negocio/modulos/ideias/ideias-movimentacao.md §6

   Sem `import` de banco, como `transicao.ts`: é a regra pura, e a rota
   só decide como escrever.

   Como a ordem é guardada: `ideias.posicao` (double). Menor = mais
   acima. Uma idéia nova nasce com o default do banco,
   -(epoch em ms) — quanto mais nova, mais negativa, então ela entra
   no topo da coluna sem ninguém precisar calcular nada, e o quadro que
   nunca foi reorganizado continua "mais recente primeiro", exatamente
   como era antes desta regra.

   Reorganizar grava a coluna inteira, 0..n-1, na ordem pedida. Mandar
   a coluna inteira (e não "fica entre A e B") é o que deixa o servidor
   conferir que a tela estava vendo o quadro de verdade: se alguém
   criou, moveu ou excluiu uma idéia nesse meio tempo, a lista não
   bate e a gravação é recusada, em vez de encaixar a ordem de uma
   tela velha num quadro que já é outro.
   ============================================================ */

/* Teto do pedido: nenhuma coluna real chega perto, e um corpo com
   milhares de ids seria abuso, não uso. */
export const ORDEM_MAX = 500;

export type ConferenciaOrdem =
  | { ok: true }
  | { ok: false; motivo: 'repetida' | 'desatualizada' };

/* A ordem pedida precisa ser uma permutação EXATA das idéias ativas
   da coluna: nem uma a mais, nem uma a menos, nenhuma repetida. */
export function conferirNovaOrdem(atuais: string[], pedida: string[]): ConferenciaOrdem {
  if (new Set(pedida).size !== pedida.length) return { ok: false, motivo: 'repetida' };
  if (pedida.length !== atuais.length) return { ok: false, motivo: 'desatualizada' };
  const conjunto = new Set(atuais);
  for (const id of pedida) {
    if (!conjunto.has(id)) return { ok: false, motivo: 'desatualizada' };
  }
  return { ok: true };
}

/* IDEIA-ORDEM-006: o card que CHEGA numa coluna (vindo de outra) entra
   no topo dela — o mesmo lugar de uma idéia nova. Coluna vazia: zero. */
export function posicaoNoTopo(posicoesDaColuna: number[]): number {
  if (posicoesDaColuna.length === 0) return 0;
  return Math.min(...posicoesDaColuna) - 1;
}

/* A ordem de exibição: posição crescente e, no empate, a mais nova
   primeiro. O empate existe de verdade — as etapas de "Gerar com ajuda
   da IA" nascem na mesma transação, com o mesmo `now()` no default, e
   é o `criado_em` (1 ms de diferença entre elas) que as mantém na
   ordem de execução. `visao_do_projeto.html` usa a mesma regra. */
export function compararOrdem(
  a: { posicao: number; criadoEm: Date },
  b: { posicao: number; criadoEm: Date },
): number {
  if (a.posicao !== b.posicao) return a.posicao - b.posicao;
  return b.criadoEm.getTime() - a.criadoEm.getTime();
}
