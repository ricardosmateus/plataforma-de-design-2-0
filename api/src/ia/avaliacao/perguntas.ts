/* ============================================================
   Avaliação do conteúdo de IA — as perguntas (PURO)
   ============================================================
   Regras:  Regras_de_negocio/modulos/ia/ia-avaliacao.md
   Plano:   planejamento-jev-avaliacao.md §3

   O Claude gera; aqui se monta o que o AVALIADOR (JEV, ou o Claude
   quando o JEV falha) vai julgar. Nenhuma rede, nenhum banco: o lote
   sai daqui igual para os dois avaliadores, e é por isso que as
   notas dos dois são comparáveis (IA-AVAL-002).

   IA-AVAL-006: uma pergunta, um julgamento. "É específica E tem
   entrega?" vira duas perguntas; quem combina é `normalizar.ts`.

   IA-AVAL-015: o `state` leva só o necessário. Nada de nome, e-mail
   ou id de usuário — só a ficha da empresa, títulos de idéias e o
   conteúdo avaliado.
   ============================================================ */

export type PerguntaNoul = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };
export type PerguntaChoice = { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type PerguntaScore = { type: 'score'; instructions: string; criteria: string[] };
export type Pergunta = PerguntaNoul | PerguntaChoice | PerguntaScore;

export type Lote = {
  state: Record<string, unknown>;
  questions: Record<string, Pergunta>;
};

export type EtapaAvaliavel = { titulo: string; descricao: string };

export type ContextoAvaliacaoIdeias = {
  projetoNome: string;
  empresaNome: string;
  empresaDescricao: string | null;
  /* Títulos das idéias em Finalizado — as verdades validadas
     (IA-CONHEC). São a evidência além da ficha da empresa. */
  validadas: string[];
  /* Títulos das idéias ativas ANTES desta geração, para C8. */
  existentes: string[];
  orientacao: string | null;
  etapas: EtapaAvaliavel[];
};

/* Tetos do que vai ao avaliador. O custo cresce com o `state`, e o
   julgamento não melhora com a 61ª idéia antiga. */
export const LIMITES = {
  VALIDADAS: 30,
  EXISTENTES: 60,
  DESCRICAO_EMPRESA: 1200,
} as const;

/* Os critérios da Fase 1 (F1 — Gerar idéias). Os códigos batem com
   a tabela de ia-avaliacao.md §1.2. */
export const CRITERIOS_POR_ETAPA = ['c1', 'c2', 'c3', 'c4', 'c6', 'c7', 'c8', 'c10'] as const;
export type CodigoCriterio = (typeof CRITERIOS_POR_ETAPA)[number] | 'c9';

export const OPCOES_C1 = {
  sustentada: 'Todas as afirmações de fato da etapa estão em `evidencias`, ou a etapa só descreve trabalho a fazer, sem afirmar fato nenhum',
  sem_base: 'A etapa afirma algum fato que `evidencias` não confirma nem contradiz',
  contradiz: 'A etapa afirma algum fato que contradiz `evidencias`',
} as const;

export const NIVEIS_C2 = [
  'Não tem relação com o trabalho pedido',
  'Relação fraca com o trabalho pedido',
  'Contribui em parte para o trabalho pedido',
  'Atende bem ao trabalho pedido',
  'Atende plenamente e é uma etapa necessária do trabalho pedido',
];

export const NIVEIS_C9 = [
  'A ordem não segue lógica nenhuma de dependência',
  'Várias etapas estão fora de ordem',
  'Uma etapa está fora de ordem',
  'A ordem respeita a dependência entre as etapas',
];

export function idPergunta(i: number, criterio: string): string {
  return `e${i}_${criterio}`;
}
export const ID_C9 = 'lista_c9';

function limpo(t: string | null | undefined, max = 2000): string {
  return String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Monta o lote da F1: uma chamada para a lista inteira (IA-AVAL-006).
 * Cada etapa recebe C1–C7 (+ C8 se o projeto já tem idéias, + C10 se
 * veio orientação); a lista recebe C9 uma vez.
 */
export function montarLoteIdeias(c: ContextoAvaliacaoIdeias): Lote {
  const orientacao = limpo(c.orientacao, 1000) || null;
  const existentes = c.existentes.map((t) => limpo(t, 200)).filter(Boolean).slice(0, LIMITES.EXISTENTES);
  const validadas = c.validadas.map((t) => limpo(t, 200)).filter(Boolean).slice(0, LIMITES.VALIDADAS);

  const state: Record<string, unknown> = {
    pedido: {
      projeto: limpo(c.projetoNome, 200),
      ...(orientacao ? { orientacao } : {}),
    },
    evidencias: {
      empresa: {
        nome: limpo(c.empresaNome, 200),
        descricao: limpo(c.empresaDescricao, LIMITES.DESCRICAO_EMPRESA) || '(sem descrição cadastrada)',
      },
      ideias_validadas: validadas,
    },
    existentes,
    etapas: c.etapas.map((e) => ({ titulo: limpo(e.titulo, 300), descricao: limpo(e.descricao, 400) })),
  };

  const questions: Record<string, Pergunta> = {};

  c.etapas.forEach((_, i) => {
    const e = `\`etapas.${i}\``;

    questions[idPergunta(i, 'c1')] = {
      type: 'choice',
      instructions: `As afirmações de fato (números, nomes, concorrentes, público, história da empresa) da etapa ${e} estão sustentadas por \`evidencias\`?`,
      criteria: { ...OPCOES_C1 },
    };
    questions[idPergunta(i, 'c2')] = {
      type: 'score',
      instructions: `Quanto a etapa ${e} atende ao trabalho pedido em \`pedido\`?`,
      criteria: [...NIVEIS_C2],
    };
    questions[idPergunta(i, 'c3')] = {
      type: 'noul',
      instructions: `A etapa ${e} pertence ao trabalho de um projeto de "${limpo(c.projetoNome, 200)}"?`,
    };
    questions[idPergunta(i, 'c4')] = {
      type: 'noul',
      instructions: `A etapa ${e} afirma fatos sobre a empresa (números, concorrentes, participação de mercado, público, história) que NÃO estão em \`evidencias\`?`,
    };
    questions[idPergunta(i, 'c6')] = {
      type: 'noul',
      instructions: `A etapa ${e} é genérica a ponto de servir a qualquer projeto, sem nada próprio de \`pedido.projeto\` nem da empresa?`,
    };
    questions[idPergunta(i, 'c7')] = {
      type: 'noul',
      instructions: `A descrição da etapa ${e} diz qual entrega concreta prova que a etapa terminou?`,
    };
    if (existentes.length) {
      questions[idPergunta(i, 'c8')] = {
        type: 'noul',
        instructions: `A etapa ${e} repete, com outras palavras, alguma idéia de \`existentes\`?`,
      };
    }
    if (orientacao) {
      questions[idPergunta(i, 'c10')] = {
        type: 'noul',
        instructions: `A etapa ${e} respeita \`pedido.orientacao\` (não contradiz nem ignora o que a pessoa pediu)?`,
      };
    }
  });

  if (c.etapas.length >= 2) {
    questions[ID_C9] = {
      type: 'score',
      instructions: 'A ordem de `etapas` respeita a dependência entre elas (o que decide antes do que produz, o que produz antes do que entrega)?',
      criteria: [...NIVEIS_C9],
    };
  }

  return { state, questions };
}
