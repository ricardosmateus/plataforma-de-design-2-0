/* ============================================================
   Desambiguar — a pergunta ao JEV e a leitura da escolha (PURO)
   ============================================================
   Plano: planejamento-jev-board.md, Fases 3 e 4 (decisão B1: segue
   com a leitura mais provável e DIZ o que assumiu — nunca pergunta
   antes à pessoa).

   Uma pergunta de ESCOLHA, com as leituras como opções e a tarefa e
   a empresa como estado. O JEV devolve a escolhida e a probabilidade
   de cada uma. Este arquivo não chama ninguém: a régua
   (scripts/avaliar-desambiguacao.ts) e, depois, a rota usam o mesmo
   lote — o que for medido é o que vai para o usuário.
   ============================================================ */

import type { Lote } from '../ia/avaliacao/perguntas.js';
import type { Resposta } from '../ia/avaliacao/normalizar.js';

export const CHAVE_LEITURA = 'leitura';

export type LeituraPossivel = { id: string; leitura: string };

export const INSTRUCAO_LEITURA =
  'A tarefa abaixo foi escrita de forma curta e pode ser lida de mais de um jeito. ' +
  'Para o time desta empresa, qual destas leituras é a que a tarefa mais provavelmente pede? ' +
  'Considere o que a empresa faz, o tipo de time que escreveu a tarefa (design de produto) e as palavras exatas da tarefa.';

/* O que a plataforma sabe sobre a tarefa (fase 3b/3a). Os nomes dos
   campos são os que a rota vai preencher — a régua usa os mesmos, para
   medir exatamente o que vai para o usuário. */
export type ContextoDaTarefa = {
  projeto?: string;
  atividade?: string;
  descricaoDaTarefa?: string;
  tarefasIrmas?: string[];
  sobreAEmpresa?: string[];
};

export function loteDeDesambiguacao(p: {
  tarefa: string;
  contextoEmpresa: string;
  leituras: LeituraPossivel[];
  contexto?: ContextoDaTarefa;
}): Lote {
  const c = p.contexto;
  const estado: Record<string, unknown> = { empresa: p.contextoEmpresa, tarefa: p.tarefa };
  if (c?.descricaoDaTarefa) estado.descricao_da_tarefa = c.descricaoDaTarefa;
  if (c?.projeto) estado.projeto = c.projeto;
  if (c?.atividade) estado.atividade = c.atividade;
  if (c?.tarefasIrmas?.length) estado.outras_tarefas_da_mesma_atividade = c.tarefasIrmas;
  if (c?.sobreAEmpresa?.length) estado.o_que_a_empresa_ja_validou = c.sobreAEmpresa;
  return {
    state: estado,
    questions: {
      [CHAVE_LEITURA]: {
        type: 'choice',
        instructions: INSTRUCAO_LEITURA,
        criteria: Object.fromEntries(p.leituras.map((l) => [l.id, l.leitura])),
      },
    },
  };
}

export type Escolha = { id: string; probabilidade: number; confianca: number | null };

/** A leitura escolhida, com a probabilidade dela. `null` se a resposta não for uma escolha válida. */
export function leituraEscolhida(respostas: Record<string, Resposta> | null | undefined): Escolha | null {
  const r = respostas?.[CHAVE_LEITURA];
  if (!r || r.type !== 'choice') return null;
  const p = r.probabilities?.[r.choice];
  return {
    id: r.choice,
    probabilidade: typeof p === 'number' && Number.isFinite(p) ? p : 1,
    confianca: r.confidence ?? null,
  };
}

/* ============================================================
   O contexto da tarefa, em texto — para o PLANEJADOR (fase 3b)
   ============================================================
   O JEV recebe o contexto em campos do estado; o planejador recebe
   texto. Os dois saem do mesmo `ContextoDaTarefa`, para o planejador
   propor as leituras sabendo o mesmo que o JEV vai saber ao escolher.
   Vai DEPOIS do pacote interno que a rota já monta (Blocos A e B). */
export function textoDoContextoDaTarefa(c: ContextoDaTarefa | undefined): string {
  if (!c) return '';
  const partes: string[] = [];
  if (c.projeto) partes.push(`Projeto: ${c.projeto}`);
  if (c.atividade) partes.push(`Atividade em que a tarefa está: ${c.atividade}`);
  if (c.tarefasIrmas?.length) partes.push(`Outras tarefas da mesma atividade: ${c.tarefasIrmas.join('; ')}`);
  if (c.sobreAEmpresa?.length) partes.push(`O que a empresa já validou:\n${c.sobreAEmpresa.map((f) => `- ${f}`).join('\n')}`);
  return partes.length ? `CONTEXTO DA TAREFA NA PLATAFORMA\n${partes.join('\n')}` : '';
}

/* ============================================================
   Só para a RÉGUA do planejador (scripts/avaliar-leituras.ts)
   ============================================================
   A leitura certa do gabarito e as leituras que o planejador propôs
   são frases diferentes. Quem diz se elas querem dizer o mesmo é o
   JEV — juiz falível, e por isso o script imprime as frases para
   leitura humana. Nada disto vai para o usuário. */
export const CHAVE_CORRESPONDENCIA = 'corresponde';
export const NENHUMA = 'nenhuma';

export function loteDeCorrespondencia(certa: string, propostas: LeituraPossivel[]): Lote {
  return {
    state: { leitura_de_referencia: certa },
    questions: {
      [CHAVE_CORRESPONDENCIA]: {
        type: 'choice',
        instructions:
          'Qual destas leituras propostas pede, na prática, a MESMA pesquisa que a leitura de referência? ' +
          'Se nenhuma pede a mesma pesquisa, escolha "nenhuma".',
        criteria: { ...Object.fromEntries(propostas.map((l) => [l.id, l.leitura])), [NENHUMA]: 'Nenhuma pede a mesma pesquisa' },
      },
    },
  };
}

export const CHAVE_PLANO_NA_LEITURA = 'plano_na_leitura';

export function lotePlanoNaLeitura(certa: string, perguntas: string[]): Lote {
  return {
    state: { leitura_de_referencia: certa, perguntas_do_plano: perguntas },
    questions: {
      [CHAVE_PLANO_NA_LEITURA]: {
        type: 'noul',
        instructions: 'Estas perguntas de pesquisa investigam o que a leitura de referência pede (e não outra coisa)?',
      },
    },
  };
}
