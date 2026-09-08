/* ============================================================
   O que uma mudança de coluna significa para a taxonomia
   ============================================================
   Sem `import`, como `taxonomia-vocabulario.ts` e pelo mesmo
   motivo: esta é A regra crítica do módulo do grafo, e ela estava
   verificável apenas com um banco de pé. Regra importante que só o
   teste de integração cobre é, na prática, regra sem teste — o de
   integração é o primeiro a ser pulado quando o ambiente falha.

   Aqui a decisão é separada da execução. A rota continua fazendo a
   escrita; o que ela pergunta a este módulo é apenas "o que esta
   transição significa", e isso são nove combinações que cabem num
   teste que roda em milissegundos.
   ============================================================ */

export type StatusIdeia = 'ideias' | 'andamento' | 'finalizado';

export type PlanoDaTransicao = {
  /* Apagar assunto e tags. Vai junto com a escrita do status, nunca
     depois: enquanto as duas coisas não forem a mesma escrita,
     existe uma janela em que a página "Sobre a empresa" mostra
     conhecimento que já saiu de "finalizado". */
  limpar: boolean;

  /* Disparar a classificação. Fora do caminho da resposta: mover um
     card não pode esperar a IA nem falhar com ela. */
  classificar: boolean;
};

export function planejarTransicao(de: StatusIdeia, para: StatusIdeia): PlanoDaTransicao {
  /* Soltar o card na coluna onde já está não é transição. A rota já
     devolve 200 sem escrever nesse caso; a função responde o mesmo
     para não depender dessa ordem. */
  if (de === para) return { limpar: false, classificar: false };

  if (para === 'finalizado') return { limpar: false, classificar: true };

  /* Sair de "finalizado" para QUALQUER outra coluna limpa. Não é
     uma lista de destinos — é o complemento de "finalizado", e
     escrever assim garante que uma coluna nova adicionada ao quadro
     amanhã já nasça limpando. */
  if (de === 'finalizado') return { limpar: true, classificar: false };

  /* Entre "ideias" e "andamento" a taxonomia não existe dos dois
     lados: nada a limpar, nada a classificar. */
  return { limpar: false, classificar: false };
}
