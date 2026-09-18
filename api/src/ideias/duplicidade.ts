/* ============================================================
   Detecção de duplicidade — IDEIA-DUPL-001/002
   ============================================================
   Regras: Regras_de_negocio/modulos/ideias/ideias-criacao.md

   Isto NÃO é unicidade (a decisão I10 continua valendo: duas idéias
   do mesmo projeto podem ter o mesmo título — repetição é legítima
   em brainstorm). É um aviso: ao salvar, se título e descrição
   juntos se parecerem muito com uma idéia que já existe, a pessoa
   fica sabendo antes de criar/editar — e decide, ela mesma, se quer
   mesmo assim. Ninguém é impedido de salvar.

   Comparação sem biblioteca nova, no mesmo espírito do resto do
   projeto: normaliza (sem acento, minúsculo) e mede sobreposição de
   palavras entre os dois textos — mesma idéia geral de
   `normalizarTexto` em `ia/verificacao.ts`, reproduzida aqui e não
   importada, pelo motivo já registrado em outros módulos: nenhum dos
   dois tem por que depender do outro existir.
   ============================================================ */

export type IdeiaComparavel = {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
};

export type ConteudoComparavel = { titulo: string; descricao: string };

/* Confere sem acento nem caixa — "Página" e "pagina" não podem
   escapar da comparação só por causa de um acento. */
function normalizarTexto(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* Palavras com 3+ caracteres: descarta pontuação solta e os
   conectivos mais comuns do português ("de", "da", "do", "em", "um"
   têm 2 letras) — sem isso, dois textos quaisquer sobre o mesmo
   projeto já dividiriam um punhado de preposições, e a interseção
   subiria por coincidência de gramática, não de conteúdo. */
function palavras(t: string): Set<string> {
  const partes = normalizarTexto(t).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 3);
  return new Set(partes);
}

/* Índice de Jaccard: quanto do vocabulário dos dois textos é
   compartilhado. 0 quando não há nada em comum (inclusive quando um
   dos dois lados está vazio) — nunca divide por zero. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersecao = 0;
  for (const p of a) if (b.has(p)) intersecao++;
  const uniao = a.size + b.size - intersecao;
  return uniao === 0 ? 0 : intersecao / uniao;
}

/* Título e descrição pesam DIFERENTE (IDEIA-DUPL-002: "título e
   descrição juntos" — juntos, não em partes iguais). Cada campo mede
   a própria semelhança; o que muda é quanto cada um decide.

   Recalibrado em 16/09/2026, e o motivo é aritmético. Com 0.5/0.5 e
   limiar 0.6, o título sozinho chegava no máximo a 0.5 — ou seja,
   **título idêntico nunca alcançava o limiar por si só**. O alerta
   passava a exigir semelhança de descrição ≥ 0.2 SEMPRE, e Jaccard
   pune reescrita com força (vocabulário diferente para a mesma
   idéia derruba o índice para perto de zero). Resultado medido nas
   152 idéias reais do projeto Startup/iHouseLog: em 11.476 pares,
   o alerta disparava ZERO vezes — só sobrevivia a cópia literal,
   que é justamente o caso que ninguém comete sem perceber.

   Com 0.7/0.3 e o mesmo limiar 0.6, título idêntico vale 0.7 e
   dispara sozinho — que é o comportamento que a regra descreve. Os
   mesmos 11.476 pares reais continuam com ZERO falsos alertas, então
   subir o peso do título não trocou silêncio por ruído.

   O que continua fora do alcance: título sinônimo ("Seguro
   encomendas" x "Seguro para encomendas" passa; "Locker" x "Armário
   inteligente" não). Sobreposição de palavras não enxerga sinônimo —
   isso exigiria embeddings, e está registrado como pendência. */
const PESO_TITULO = 0.7;
const PESO_DESCRICAO = 0.3;

/* Ponto em que a semelhança deixa de ser coincidência de vocabulário
   e passa a valer um aviso. Deliberadamente conservador — um alerta
   que dispara demais rápido vira ruído que a pessoa aprende a
   ignorar, e aí a regra perde o efeito. Constante isolada de
   propósito: é o primeiro número a ajustar se o uso real mostrar
   avisos demais (baixar não adianta) ou de menos (subir). */
export const LIMIAR_DUPLICATA = 0.6;

function pontuacao(candidata: ConteudoComparavel, existente: ConteudoComparavel): number {
  const simTitulo = jaccard(palavras(candidata.titulo), palavras(existente.titulo));
  const simDescricao = jaccard(palavras(candidata.descricao), palavras(existente.descricao));
  return PESO_TITULO * simTitulo + PESO_DESCRICAO * simDescricao;
}

/**
 * Procura, entre `existentes`, a idéia mais parecida com `candidata`.
 * `existentes` já deve vir filtrada pelo chamador — mesmo princípio
 * das outras rotas do módulo: quem decide o que é candidato é quem
 * busca no banco (idéias ativas do projeto), não esta função.
 *
 * `ignorarId` existe só para o caso de edição: a idéia sendo editada
 * não pode ser comparada com ela mesma, ou toda edição "bateria" com
 * o próprio registro original.
 *
 * Devolve a mais parecida entre as que passam do limiar, ou `null`
 * se nenhuma passar. Em empate, fica a primeira da lista — a ordem é
 * responsabilidade de quem chama.
 */
export function encontrarDuplicata(
  candidata: ConteudoComparavel,
  existentes: IdeiaComparavel[],
  ignorarId?: string | null,
): IdeiaComparavel | null {
  let melhor: IdeiaComparavel | null = null;
  let melhorPontuacao = 0;

  for (const existente of existentes) {
    if (ignorarId && existente.id === ignorarId) continue;

    const p = pontuacao(candidata, existente);
    if (p >= LIMIAR_DUPLICATA && p > melhorPontuacao) {
      melhor = existente;
      melhorPontuacao = p;
    }
  }

  return melhor;
}
