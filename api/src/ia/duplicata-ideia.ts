/* ============================================================
   Ideia repetida — a pergunta ao JEV e a leitura da escolha (PURO)
   ============================================================
   Plano: planejamento-jev-assistente.md, frente A. Este arquivo não
   chama ninguém: a régua (scripts/avaliar-duplicata.ts) e, depois, a
   confirmação de ideia do assistente usam o MESMO lote — o que for
   medido é o que vai para o usuário.
   ============================================================ */

import type { Lote } from './avaliacao/perguntas.js';
import type { Resposta } from './avaliacao/normalizar.js';

export const CHAVE_DUPLICATA = 'mesma_ideia';
export const NENHUMA_DUPLICATA = 'nenhuma';

export const INSTRUCAO_DUPLICATA =
  'A ideia NOVA é a MESMA ideia que alguma das existentes? A mesma ideia é o mesmo serviço ou solução, ' +
  'para o mesmo problema e o mesmo público — mesmo dita com outras palavras, ou com um recorte diferente (outra cidade, outro andar do prédio). ' +
  'Ideias do MESMO TEMA que propõem coisas DIFERENTES (outro público, outro serviço, outra solução para o mesmo problema) NÃO são a mesma: ' +
  'nesse caso, escolha "nenhuma". Na dúvida, "nenhuma": avisar de uma duplicata que não existe atrapalha quem está criando.';

export type IdeiaParaComparar = { id: string; titulo: string; descricao: string };

export function loteDeDuplicata(p: { contextoEmpresa: string; nova: { titulo: string; descricao: string }; existentes: IdeiaParaComparar[] }): Lote {
  return {
    state: {
      empresa: p.contextoEmpresa,
      ideia_nova: { titulo: p.nova.titulo, descricao: p.nova.descricao },
      ideias_existentes: p.existentes.map((i) => ({ id: i.id, titulo: i.titulo, descricao: i.descricao })),
    },
    questions: {
      [CHAVE_DUPLICATA]: {
        type: 'choice',
        instructions: INSTRUCAO_DUPLICATA,
        criteria: {
          ...Object.fromEntries(p.existentes.map((i) => [i.id, `É a mesma ideia que "${i.titulo}"`])),
          [NENHUMA_DUPLICATA]: 'Não é a mesma ideia que nenhuma das existentes',
        },
      },
    },
  };
}

export type EscolhaDuplicata = { id: string; probabilidade: number };

export function escolhaDuplicata(respostas: Record<string, Resposta> | null | undefined): EscolhaDuplicata | null {
  const r = respostas?.[CHAVE_DUPLICATA];
  if (!r || r.type !== 'choice') return null;
  const p = r.probabilities?.[r.choice];
  return { id: r.choice, probabilidade: typeof p === 'number' && Number.isFinite(p) ? p : 1 };
}
