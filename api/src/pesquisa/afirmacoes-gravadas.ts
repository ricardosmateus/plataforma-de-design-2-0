/* ============================================================
   As afirmações gravadas, e a decisão de quem leu — Fase 2
   ============================================================
   Único lugar do código que lê `pesquisa_afirmacoes` e escreve a
   curadoria.

   ------------------------------------------------------------
   O QUE ESTA TABELA CONSERTA
   ------------------------------------------------------------
   O rascunho da Fase 2 vivia só no navegador, entre o fim da busca e
   o "Salvar". Recarregar a página no meio o perdia — e o que se
   perdia não era conforto: era o recorte por afirmação de uma busca
   JÁ PAGA. Quem voltava recebia a prosa inteira e todas as fontes
   empilhadas no primeiro quadro, porque a recuperação não tinha como
   saber onde cada fonte entrava (a limitação registrada em
   `BOARD-PESQUISA-031`).

   Com as afirmações gravadas, reabrir a tarefa reabre o rascunho no
   ponto em que ele parou.

   ------------------------------------------------------------
   NOTA — o cast que existiu por vinte minutos
   ------------------------------------------------------------
   Terceira vez no mesmo dia (14/09/2026) que código novo precisou
   esperar uma migração, e terceira vez que a espera foi coberta por
   um cast único, nomeado e datado, com os pontos de chamada tipados
   contra uma interface escrita à mão. A migração
   `20260914134646_rascunho_gravado` rodou e ele saiu.

   Três por três é o argumento a favor do padrão: ele é dívida que se
   paga no mesmo dia. Um `any` espalhado pelos arquivos teria sido a
   alternativa, e é a que fica.
   ============================================================ */

import { db } from '../db.js';

export type AfirmacaoGravada = {
  id: string;
  inicio: number;
  texto: string;
  semFonte: boolean;
  /* `null` = ninguém decidiu ainda. É o estado que faz a tela saber
     que há rascunho pendente. */
  removida: boolean | null;
  /* Índices dentro da lista de fontes DA CONSULTA — a mesma forma
     que o evento `fim` do stream entrega ao vivo. O banco guarda
     chave; a API devolve índice, porque é o que a tela já sabe ler,
     e porque um id de linha na mão do cliente é superfície a mais
     sem nada em troca. */
  fonteIds: number[];
  trechos: string[];
};

/* ------------------------------------------------------------
   Leitura
   ------------------------------------------------------------ */
export async function afirmacoesDaConsulta(
  consultaId: string,
  /* A ordem das fontes como a API vai devolvê-las. É contra ELA que
     os índices são calculados — não contra a ordem do banco. Passar
     a lista em vez de reconsultar é o que garante que os dois lados
     falem dos mesmos números. */
  idsFontesNaOrdem: string[],
): Promise<AfirmacaoGravada[]> {
  try {
    const linhas = await db.pesquisaAfirmacao.findMany({
      where: { consultaId },
      orderBy: { inicio: 'asc' },
      include: { fontes: true },
    });

    const posicao = new Map(idsFontesNaOrdem.map((id, i) => [id, i]));

    return linhas.map((l) => {
      const ligacoes = (l.fontes ?? []).filter((f) => posicao.has(f.fonteId));
      return {
        id: l.id,
        inicio: l.inicio,
        texto: l.texto,
        semFonte: l.semFonte,
        removida: l.removidaPeloUsuario,
        fonteIds: ligacoes.map((f) => posicao.get(f.fonteId)!),
        trechos: ligacoes.map((f) => f.trecho ?? ''),
      };
    });
  } catch (e) {
    /* Sem o recorte, a tela ainda tem a resposta e as fontes. É pior
       do que com ele, e muito melhor do que uma página que não abre.
       Mesmo princípio de `investigacao.ts`. */
    console.warn('[afirmacoes] não consegui ler o recorte:', e);
    return [];
  }
}

/* ------------------------------------------------------------
   A decisão de quem leu
   ------------------------------------------------------------
   Duas escritas, e não uma por afirmação: o que a pessoa fez foi UM
   gesto sobre a lista inteira, e gravá-lo como um gesto é o que
   impede um estado intermediário em que metade da lista foi decidida
   e a outra metade não — que é indistinguível, na leitura, de um
   rascunho ainda pendente.

   `mantidas` são ids; tudo que não está nela sai. A lista vem do
   cliente, então ela é FILTRADA pela consulta: um id de outra
   investigação não marca nada, porque o `where` exige as duas
   coisas. */
export async function registrarCuradoria(
  consultaId: string,
  mantidas: string[],
): Promise<{ ficaram: number; sairam: number }> {
  const ids = [...new Set(mantidas)];

  const fora = await db.pesquisaAfirmacao.updateMany({
    where: ids.length ? { consultaId, id: { notIn: ids } } : { consultaId },
    data: { removidaPeloUsuario: true },
  });

  const dentro = ids.length
    ? await db.pesquisaAfirmacao.updateMany({
        where: { consultaId, id: { in: ids } },
        data: { removidaPeloUsuario: false },
      })
    : { count: 0 };

  return { ficaram: dentro.count, sairam: fora.count };
}

/* ------------------------------------------------------------
   O texto que sobreviveu — Fase 3a
   ------------------------------------------------------------
   O que o caderno pode ler quando alguém pergunta sobre a
   investigação.

   Antes da curadoria, vale a resposta inteira: ninguém decidiu nada
   ainda, e esconder metade seria inventar uma decisão.

   Depois dela, valem só as afirmações que ficaram. Se a pessoa
   apagou uma frase, ela disse que aquilo não presta — devolver o
   texto original ao modelo contrabandearia de volta, para dentro da
   resposta seguinte, exatamente o que ela tirou. */
export function textoCurado(resposta: string | null, lista: AfirmacaoGravada[]): string {
  const bruto = String(resposta ?? '');
  if (!lista.length || temRascunhoPendente(lista)) return bruto;

  const ficaram = lista.filter((a) => a.removida === false);
  if (!ficaram.length) return '';

  return ficaram
    .slice()
    .sort((a, b) => a.inicio - b.inicio)
    .map((a) => a.texto)
    .join('\n\n');
}

/* Há rascunho esperando? É uma pergunta sobre o mesmo campo que
   guarda a decisão — sem coluna auxiliar dizendo a mesma coisa por
   outro caminho (BOARD-PESQUISA-002). */
export function temRascunhoPendente(lista: AfirmacaoGravada[]): boolean {
  return lista.some((a) => a.removida === null);
}
