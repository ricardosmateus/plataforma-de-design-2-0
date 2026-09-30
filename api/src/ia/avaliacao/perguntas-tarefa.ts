/* ============================================================
   Avaliação — as perguntas da TAREFA gerada na atividade (PURO)
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-018/020/021; atividade-lista.md,
            ATV-GERAR-005
   Plano:   planejamento-jev-tarefas.md §3 e §4.3

   A tarefa do "Gerar com ajuda da IA" (modal "Nova tarefa") é UMA
   proposta — título e descrição — de um dos três tipos. O que o
   avaliador julga aqui é essa proposta, entre o Senior Product
   Designer propor e a rota gravar.

   IA-AVAL-020: critério que significa o mesmo que na Visão mantém o
   MESMO código (c1, c2, c3, c4, c6, c8, c10), para as notas das duas
   telas serem comparáveis. O que só existe aqui ganha código novo
   (t1–t6). c7 (entrega concreta) e c9 (ordem da lista) não entram:
   tarefa não é etapa com entrega, e não há lista.

   Fora do avaliador, de propósito: "nome das empresas por extenso".
   Regra de texto é verificável por código, e regra de sistema não
   vira percentual (planejamento-jev-avaliacao.md §2).

   IA-AVAL-015: o `state` leva só o necessário — sem nome, e-mail ou
   id de usuário.
   ============================================================ */

import { LIMITES, NIVEIS_C2, OPCOES_C1, limpo, type Lote, type Pergunta } from './perguntas.js';

export type TipoTarefaAvaliavel = 'pesquisa' | 'matriz_csd' | 'referencias_visuais';

export type ContextoAvaliacaoTarefa = {
  tipo: TipoTarefaAvaliavel;
  projetoNome: string;
  empresaNome: string;
  empresaDescricao: string | null;
  atividadeTitulo: string;
  atividadeDescricao: string | null;
  /* Títulos das idéias em Finalizado — só o validado confirma fato
     (IA-CONHEC-005). Material de consulta não entra em `evidencias`. */
  validadas: string[];
  /* Títulos das tarefas que JÁ existem na atividade, para c8. */
  existentes: string[];
  orientacao: string | null;
  tarefa: { titulo: string; descricao: string };
};

/* Os códigos, na ordem em que aparecem no lote. */
export const CRITERIOS_COMUNS_TAREFA = ['c1', 'c2', 'c3', 'c4', 'c6', 'c8', 'c10'] as const;
export const CRITERIO_DO_TIPO: Record<TipoTarefaAvaliavel, readonly string[]> = {
  pesquisa: ['t1', 't2'],
  matriz_csd: ['t3', 't4'],
  referencias_visuais: ['t5', 't6'],
};

const NOME_DO_TIPO: Record<TipoTarefaAvaliavel, string> = {
  pesquisa: 'Pesquisa',
  matriz_csd: 'Matriz CSD',
  referencias_visuais: 'Referência',
};

export function montarLoteTarefa(c: ContextoAvaliacaoTarefa): Lote {
  const orientacao = limpo(c.orientacao, 1000) || null;
  const existentes = c.existentes.map((t) => limpo(t, 200)).filter(Boolean).slice(0, LIMITES.EXISTENTES);
  const validadas = c.validadas.map((t) => limpo(t, 200)).filter(Boolean).slice(0, LIMITES.VALIDADAS);
  const titulo = limpo(c.tarefa.titulo, 300);
  const atividadeDescricao = limpo(c.atividadeDescricao, 600);

  const state: Record<string, unknown> = {
    pedido: {
      projeto: limpo(c.projetoNome, 200),
      atividade: { titulo: limpo(c.atividadeTitulo, 300), ...(atividadeDescricao ? { descricao: atividadeDescricao } : {}) },
      tipo: NOME_DO_TIPO[c.tipo],
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
    tarefa: { titulo, descricao: limpo(c.tarefa.descricao, 400) },
  };

  /* O título vai citado, como na Visão — ali ele evitou o JEV julgar a
     posição vizinha. Com uma tarefa só não há vizinha, mas o texto da
     pergunta fica o mesmo nas duas telas. */
  const t = `"${limpo(titulo, 120).replace(/"/g, "'")}" (\`tarefa\`)`;
  const q: Record<string, Pergunta> = {};

  q.c1 = {
    type: 'choice',
    instructions: `As afirmações de fato (números, nomes, concorrentes, público, história da empresa) da tarefa ${t} estão sustentadas por \`evidencias\`?`,
    criteria: { ...OPCOES_C1 },
  };
  q.c2 = {
    type: 'score',
    instructions: `Quanto a tarefa ${t} atende ao trabalho da atividade em \`pedido.atividade\`?`,
    criteria: [...NIVEIS_C2],
  };
  q.c3 = {
    type: 'noul',
    instructions: `A tarefa ${t} pertence ao trabalho de um projeto de "${limpo(c.projetoNome, 200)}"?`,
  };
  q.c4 = {
    type: 'noul',
    instructions: `A tarefa ${t} afirma fatos sobre a empresa (números, concorrentes, participação de mercado, público, história) que NÃO estão em \`evidencias\`?`,
  };
  q.c6 = {
    type: 'noul',
    instructions: `A tarefa ${t} é genérica a ponto de servir a qualquer atividade de qualquer projeto, sem nada próprio de \`pedido.atividade\` nem da empresa?`,
  };
  if (existentes.length) {
    q.c8 = {
      type: 'noul',
      instructions: `A tarefa ${t} repete, com outras palavras, alguma tarefa de \`existentes\`?`,
    };
  }
  if (orientacao) {
    q.c10 = {
      type: 'noul',
      instructions: `A tarefa ${t} respeita \`pedido.orientacao\` (não contradiz nem ignora o que a pessoa pediu)?`,
    };
  }

  if (c.tipo === 'pesquisa') {
    /* t1 — ATV-GERAR-005: a descrição é a pergunta que a busca vai
       responder. Perguntado no sentido POSITIVO ("pede fatos?") para o
       julgamento ser um só; a trava de IA-AVAL-021 lê o contrário. */
    q.t1 = {
      type: 'noul',
      instructions: `A descrição da tarefa ${t} pede fatos que uma fonte publicada responde (quais, quantos, onde, quanto custa, desde quando), e não uma opinião, recomendação ou raciocínio sobre o que a empresa deveria fazer?`,
    };
    /* t2 — regra 2 do prompt do Senior Product Designer. */
    q.t2 = {
      type: 'noul',
      instructions: `A pergunta da tarefa ${t} já está respondida pelo que está em \`evidencias.ideias_validadas\`?`,
    };
  } else if (c.tipo === 'matriz_csd') {
    /* IA-AVAL-006: "qual recorte E para que decisão" são dois
       julgamentos. Quem combina é normalizar.ts. */
    q.t3 = {
      type: 'noul',
      instructions: `A descrição da tarefa ${t} diz qual recorte da atividade a matriz vai organizar?`,
    };
    q.t4 = {
      type: 'noul',
      instructions: `A descrição da tarefa ${t} diz para que decisão a matriz vai servir?`,
    };
  } else {
    q.t5 = {
      type: 'noul',
      instructions: `A descrição da tarefa ${t} diz de quem são as referências (quais empresas ou marcas)?`,
    };
    q.t6 = {
      type: 'noul',
      instructions: `A descrição da tarefa ${t} diz o que se quer observar nas referências?`,
    };
  }

  return { state, questions: q };
}
