/* ============================================================
   As respostas do time — BOARD-PESQUISA-097 a 101 (PURO)
   ============================================================
   Plano: planejamento-jev-board.md, Fase 6 (adiantada como etapa 2)

   O pedido do Ricardo (30/09/2026): "só depois do resultado podemos
   fazer perguntas orientando o usuário, e no fim do quadro um botão
   dispara a IA com as respostas que ele preencheu nos post-its — uma
   nova pesquisa, mas com todo o contexto anterior."

   As respostas viajam num campo PRÓPRIO, ao lado da pergunta: a
   pergunta tem 500 caracteres e continua sendo o texto da tarefa (é
   ela que a regra "já foi investigada" compara e que é gravada). As
   respostas entram no CONTEXTO do planejador e da busca.
   ============================================================ */

export const CONVITE = 'Responda aqui...';
export const RESPOSTAS_MAX = 6;
export const PERGUNTA_MAX = 300;
export const RESPOSTA_MAX = 600;

export type RespostaDoTime = { pergunta: string; resposta: string };

function limpo(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Só o que a pessoa de fato respondeu. O post-it nasce com a
 * descrição "Responda aqui..." (o convite); sem trocar isso, não há
 * resposta — e mandar o convite como se fosse resposta seria a mesma
 * família do defeito de 14/09/2026, em que "Responda aqui..." virou
 * duas investigações pagas (BOARD-PESQUISA-061/062).
 */
export function respostasValidas(lista: unknown): RespostaDoTime[] {
  if (!Array.isArray(lista)) return [];
  const saida: RespostaDoTime[] = [];
  const vistas = new Set<string>();
  for (const item of lista) {
    if (saida.length >= RESPOSTAS_MAX) break;
    const r = item as { pergunta?: unknown; resposta?: unknown };
    const pergunta = limpo(r?.pergunta, PERGUNTA_MAX);
    const resposta = limpo(typeof r?.resposta === 'string' ? r.resposta.split(CONVITE).join(' ') : '', RESPOSTA_MAX);
    if (!pergunta || !resposta || vistas.has(pergunta.toLowerCase())) continue;
    vistas.add(pergunta.toLowerCase());
    saida.push({ pergunta, resposta });
  }
  return saida;
}

/** O bloco que vai ao planejador e à busca. Vazio quando não há resposta. */
export function textoDasRespostas(respostas: RespostaDoTime[]): string {
  if (!respostas.length) return '';
  return [
    'Respostas do time às perguntas deixadas pela pesquisa anterior desta tarefa. Use como contexto e como restrição:',
    'não pergunte de novo o que já foi respondido, e aprofunde a partir do que o time disse.',
    ...respostas.map((r) => `- Pergunta: ${r.pergunta}\n  Resposta: ${r.resposta}`),
  ].join('\n');
}
