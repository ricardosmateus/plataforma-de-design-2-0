/* ============================================================
   Decidir a leitura — o Claude propõe, o JEV confere (BOARD-PESQUISA-103)
   ============================================================
   Plano: planejamento-jev-board.md §1.3

   1. O planejador planeja, com o contexto da tarefa.
   2a. Com interpretações: o JEV escolhe uma.
   2b. Sem interpretações: o JEV confere o plano contra a tarefa.
       ≥ META_DECISAO → segue com o plano.
       <  META_DECISAO → o planejador REPLANEJA com as lentes fixas:
         · com interpretações: o JEV escolhe;
         · sem: fica o plano (o 1º ou o 2º) que o JEV julgar mais fiel.

   As chamadas entram por parâmetro: é o que deixa todos os caminhos
   testáveis sem rede e sem gasto. Falha de uma chamada do JEV NUNCA
   derruba a pesquisa (IA-AVAL-003): fica o plano que já existe.
   ============================================================ */

import type { PlanoInvestigacao, Interpretacao } from './planejador.js';
import { META_DECISAO, type Escolha } from './desambiguar.js';

export type Decisao = {
  modo: 'escolha' | 'plano-fiel' | 'replanejado-escolha' | 'replanejado-plano' | 'sem-conferencia';
  /* O plano com que a busca segue: as perguntas da leitura escolhida,
     ou o plano mais fiel. */
  plano: PlanoInvestigacao;
  escolhida: Interpretacao | null;
  escolha: Escolha | null;
  aderencia: number | null;
  replanejou: boolean;
};

export type Dependencias = {
  planejar: () => Promise<PlanoInvestigacao | null>;
  replanejar: (perguntasAnteriores: string[]) => Promise<PlanoInvestigacao | null>;
  escolher: (leituras: Interpretacao[]) => Promise<Escolha | null>;
  conferir: (perguntas: string[]) => Promise<number | null>;
};

function comLeitura(plano: PlanoInvestigacao, escolhida: Interpretacao): PlanoInvestigacao {
  return { ...plano, perguntas: escolhida.perguntas };
}

async function escolherEntre(plano: PlanoInvestigacao, d: Dependencias, modo: Decisao['modo'], replanejou: boolean): Promise<Decisao> {
  const leituras = plano.interpretacoes ?? [];
  const escolha = await d.escolher(leituras);
  const escolhida = escolha ? leituras.find((l) => l.id === escolha.id) ?? null : null;
  /* JEV mudo ou escolha fora das opções: a primeira leitura, que é a
     que o planejador já pôs em `perguntas`. A busca nunca para por isso. */
  return {
    modo,
    plano: escolhida ? comLeitura(plano, escolhida) : plano,
    escolhida: escolhida ?? leituras[0] ?? null,
    escolha,
    aderencia: null,
    replanejou,
  };
}

export async function decidirLeitura(d: Dependencias): Promise<Decisao | null> {
  const p1 = await d.planejar();
  if (!p1) return null;
  if ((p1.interpretacoes ?? []).length >= 2) return escolherEntre(p1, d, 'escolha', false);

  const a1 = await d.conferir(p1.perguntas.map((q) => q.pergunta));
  if (a1 === null) return { modo: 'sem-conferencia', plano: p1, escolhida: null, escolha: null, aderencia: null, replanejou: false };
  if (a1 >= META_DECISAO) return { modo: 'plano-fiel', plano: p1, escolhida: null, escolha: null, aderencia: a1, replanejou: false };

  const p2 = await d.replanejar(p1.perguntas.map((q) => q.pergunta));
  if (!p2) return { modo: 'plano-fiel', plano: p1, escolhida: null, escolha: null, aderencia: a1, replanejou: true };
  if ((p2.interpretacoes ?? []).length >= 2) return escolherEntre(p2, d, 'replanejado-escolha', true);

  const a2 = await d.conferir(p2.perguntas.map((q) => q.pergunta));
  const melhor = a2 !== null && a2 > a1 ? { plano: p2, aderencia: a2 } : { plano: p1, aderencia: a1 };
  return { modo: 'replanejado-plano', plano: melhor.plano, escolhida: null, escolha: null, aderencia: melhor.aderencia, replanejou: true };
}
