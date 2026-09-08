/* ============================================================
   Catálogo de tipos de projeto — PROJ-CRIA-006/007
   ============================================================
   Sem `import`, pelo mesmo motivo de `taxonomia-vocabulario.ts`:
   isto é decisão de negócio pura (quais tipos existem e como cada
   um se chama na tela), e separá-la de rede e banco deixa qualquer
   rota lê-la sem arrastar junto o arquivo de rotas inteiro.

   Foi extraído de `rotas/projetos.ts` quando a rota `/temas` passou
   a precisar do mesmo rótulo. A alternativa era uma rota importar
   da outra — e aí o nome do projeto passaria a depender da ordem em
   que os arquivos de rota se carregam, que é um acoplamento que não
   se justifica para uma tabela de duas colunas.

   Fechado de propósito: só entra tipo novo quando a tela que ele
   abre por dentro também existir (projetos-criacao.md §3). Rótulo e
   descrição vêm DAQUI, nunca do cliente (PROJ-CRIA-002).
   ============================================================ */

export const CATALOGO_TIPOS = {
  startup: {
    nome: 'Startup',
    descricao:
      'São empresas jovens e inovadoras que buscam resolver desafios específicos por meio de modelos de negócios que podem crescer rapidamente e se adaptar facilmente, caracterizando-se pela busca rápida de crescimento e dependência de financiamento externo.',
  },
} as const;

export type TipoProjeto = keyof typeof CATALOGO_TIPOS;

export const TIPOS_VALIDOS = Object.keys(CATALOGO_TIPOS) as TipoProjeto[];

/* O rótulo de um tipo, tolerante ao que vem do banco. O `tipo` é um
   enum do Postgres, então na prática ele sempre está no catálogo —
   mas um tipo removido daqui sem migration correspondente deixaria
   `undefined` vazando para a tela. Devolver o próprio valor é feio e
   verdadeiro; `undefined` seria só feio. */
export function nomeDoTipo(tipo: string): string {
  return (CATALOGO_TIPOS as Record<string, { nome: string }>)[tipo]?.nome ?? tipo;
}
