/* ============================================================
   Leitura guiada — leitura da resposta do modelo
   ============================================================
   Regras: Documentacao/enriquecimento-tema.md

   Sem `import`, mesmo motivo de recortes-leitura.ts e
   taxonomia-vocabulario.ts: esta é a parte do módulo que é decisão
   pura — o que da resposta vale, o que se descarta — separada de
   rede e banco, testável sem subir nada.

   Duas regras sustentam a leitura guiada:

     1. o modelo só REFERENCIA recortes que já existem. Ele escreve
        o TÍTULO de uma seção (orientação de leitura) — nunca o
        texto de um trecho. O texto vem sempre do banco, nunca da
        resposta.
     2. nenhum recorte desaparece por o modelo ter esquecido de
        citá-lo. A pessoa escreveu aquilo; a leitura guiada não tem
        autoridade para decidir que não interessa. Um recorte não
        citado por nenhuma seção cai em "Outros trechos" — gerada
        aqui, nunca pelo modelo.
   ============================================================ */

/* Rótulo da seção final que recebe o que o modelo esqueceu. Fixo, e
   não algo que o modelo poderia escrever: se "Outros trechos" fosse
   um título que o modelo tem liberdade de propor, a garantia de que
   nada some ficaria refém da educação da resposta. */
export const OUTROS_TRECHOS = 'Outros trechos';

/* Um título de seção é orientação de leitura, não um resumo do
   conteúdo — cabe numa linha. Maior do que isto costuma ser o
   modelo tentando condensar o parágrafo inteiro ali, que é
   exatamente o que este contrato existe para não deixar acontecer. */
export const TETO_TITULO = 80;

export type RecorteNumerado = {
  n: number;
  recorteId: string;
};

export type Secao = {
  titulo: string;
  recorteIds: string[];
};

/* ------------------------------------------------------------
   interpretar
   ------------------------------------------------------------
   Devolve a lista de seções, ou `null`.

   Mesma distinção de recortes-leitura.ts e taxonomia-vocabulario.ts,
   e pela mesma razão: lista (mesmo vazia) e `null` decidem coisas
   opostas lá fora.

     lista → deu para ler a resposta. Substitui a leitura guiada que
       já existia — mesmo que essa lista acabe sendo só "Outros
       trechos" (o modelo não organizou nada de útil, mas ainda é
       verdade: nenhum trecho foi perdido, nenhum foi inventado).

     null → não deu para ler resposta nenhuma. Preserva a leitura
       antiga: um soluço de JSON não pode apagar uma leitura guiada
       que já funcionava.
   ------------------------------------------------------------ */
export function interpretar(
  bruto: string,
  recortes: RecorteNumerado[],
): Secao[] | null {
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let dados: unknown;
  try {
    dados = JSON.parse(limpo);
  } catch {
    /* O modelo às vezes para no meio da lista (max_tokens) e o JSON
       fica sem fechar. Fechar à mão recupera as seções completas,
       em vez de perder a chamada inteira por causa da última. */
    const i = limpo.indexOf('{');
    const corte = limpo.lastIndexOf('}');
    if (i === -1 || corte <= i) return null;

    const miolo = limpo.slice(i, corte + 1);
    try {
      dados = JSON.parse(miolo + ']}');
    } catch {
      try {
        dados = JSON.parse(miolo);
      } catch {
        return null;
      }
    }
  }

  const lista = (dados as { secoes?: unknown })?.secoes;
  if (!Array.isArray(lista)) return null;

  const porNumero = new Map(recortes.map((r) => [r.n, r.recorteId]));
  const secoes: Secao[] = [];

  /* Primeira seção que citar um recorte vence — mesma regra de
     "primeira atribuição vence" de recortes-leitura.ts, pela mesma
     razão: um trecho pertence a UM lugar na leitura, nunca a dois. */
  const usados = new Set<string>();

  for (const item of lista) {
    const tituloBruto = (item as { titulo?: unknown })?.titulo;
    const numeros = (item as { recortes?: unknown })?.recortes;
    if (typeof tituloBruto !== 'string' || !tituloBruto.trim()) continue;
    if (!Array.isArray(numeros)) continue;

    const recorteIds: string[] = [];
    for (const n of numeros) {
      if (typeof n !== 'number') continue;

      const id = porNumero.get(n);
      /* Número inexistente: o modelo inventou. Já usado: perdeu a
         corrida para a seção que citou primeiro. Nos dois casos o
         item some do JSON, sem derrubar a seção inteira. */
      if (!id || usados.has(id)) continue;

      usados.add(id);
      recorteIds.push(id);
    }

    /* Seção sem nenhum trecho válido não é seção — só um título
       solto, sem nada abaixo dele para a pessoa ler. */
    if (!recorteIds.length) continue;

    secoes.push({ titulo: tituloBruto.trim().slice(0, TETO_TITULO), recorteIds });
  }

  const esquecidos = recortes
    .filter((r) => !usados.has(r.recorteId))
    .map((r) => r.recorteId);

  if (esquecidos.length) {
    secoes.push({ titulo: OUTROS_TRECHOS, recorteIds: esquecidos });
  }

  return secoes;
}
