/* ============================================================
   Recortes — leitura da resposta do modelo
   ============================================================
   Sem `import`, pelo mesmo motivo de `taxonomia-vocabulario.ts`:
   esta é a parte do módulo que é decisão pura (o que da resposta
   vale, e o que se descarta). Separada de rede e banco, ela roda em
   teste sem subir nada — e as duas regras que sustentam a página do
   tema ficam verificáveis de graça:

     1. um bloco pertence a UMA categoria (não se mistura tema);
     2. categoria fora das oferecidas é descartada (a idéia não
        ganha pasta que a classificação não lhe deu).
   ============================================================ */

/* Teto de blocos por idéia. Uma atividade real tem dezenas de
   registros, não centenas; o teto existe para uma atividade
   patológica não virar um prompt de 50 mil tokens rodando em
   segundo plano, sem ninguém olhando. */
export const TETO_BLOCOS = 80;

/* Um bloco muito curto ("Sim.", "R$ 4,2 bi") não é um trecho que se
   lê sozinho numa página de tema — é um pedaço solto de um quadro.
   Fica de fora: a página é para ler, não para catalogar. */
export const MINIMO_UTIL = 40;

/* Mesma regra de ia.ts: o quadro "Perguntas em aberto" é a lista do
   que a pesquisa NÃO respondeu. Recortá-lo para um tema faria uma
   pergunta aparecer na página como se fosse achado — o contrário do
   que a página promete. */
export const QUADRO_DE_PERGUNTAS = /perguntas?\s+em\s+aberto/i;

export type Bloco = {
  n: number;
  texto: string;
  tarefaId: string;
  quadroId: string;
  registroId: string;
};

/* ------------------------------------------------------------
   interpretar
   ------------------------------------------------------------
   Devolve `registroId → categoria`, ou `null`.

   A diferença entre os dois é o que decide, lá fora, se os recortes
   que já existiam são substituídos:

     Map (mesmo VAZIO) → deu para ler a lista. Zero itens válidos é
       uma resposta legítima: a atividade pode não ter bloco nenhum
       que se enquadre nos temas dela.

     null → não deu para ler lista nenhuma. Não é "nada se enquadra",
       é "não sei o que ele respondeu" — e as duas não podem terminar
       na mesma escrita, porque uma esvazia a página do tema.

   Uma lista com itens ruins no meio não é resposta ilegível: é
   resposta parcial, e descartar os itens bons junto seria jogar fora
   trabalho já pago ao provedor.
   ------------------------------------------------------------ */
export function interpretar(
  bruto: string,
  blocos: Bloco[],
  permitidas: string[],
): Map<string, string> | null {
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let dados: unknown;
  try {
    dados = JSON.parse(limpo);
  } catch {
    /* O modelo às vezes para no meio da lista (max_tokens) e o JSON
       fica sem fechar. Fechar à mão recupera os itens completos, em
       vez de perder a chamada inteira por causa do último. */
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

  const lista = (dados as { blocos?: unknown })?.blocos;
  if (!Array.isArray(lista)) return null;

  const porNumero = new Map(blocos.map((b) => [b.n, b]));
  const permitido = new Set(permitidas);
  const saida = new Map<string, string>();

  /* Primeira atribuição vence. O modelo não deveria repetir um `n`,
     mas se repetir é AQUI que a mistura para — antes do banco, para
     a UNIQUE em `registro_id` não ser a primeira a descobrir. Um
     erro que só a constraint pega vira exceção em segundo plano e
     derruba a segmentação inteira; pego aqui, custa um item. */
  const jaVisto = new Set<number>();

  for (const item of lista) {
    const n = (item as { n?: unknown })?.n;
    const c = (item as { c?: unknown })?.c;
    if (typeof n !== 'number' || typeof c !== 'string') continue;
    if (jaVisto.has(n)) continue;

    const bloco = porNumero.get(n);
    /* Bloco inexistente: o modelo inventou um número. Categoria fora
       das oferecidas: inventou um tema. Nos dois casos o item some,
       e não há como isso virar texto na tela. */
    if (!bloco || !permitido.has(c)) continue;

    jaVisto.add(n);
    saida.set(bloco.registroId, c);
  }

  return saida;
}


/* ------------------------------------------------------------
   Quais registros viram bloco
   ------------------------------------------------------------
   Separada de `blocosDaIdeia` (que lê o banco) pelo mesmo motivo de
   `transicao.ts`: isto é decisão, não execução, e decisão que só o
   teste de integração cobre é decisão sem teste.

   `MINIMO_UTIL` continua valendo, com o piso de sempre — mas o piso
   agora é POR QUADRO, e não por idéia inteira.

   Por que mudou: com o piso valendo para a idéia, bastava UM
   registro longo em qualquer tarefa para a lista `curtos` inteira
   ser descartada. Na prática isso significava que uma atividade com
   uma tarefa respondida por pesquisa (prosa longa) engolia em
   silêncio o post-it curto que respondia a OUTRA tarefa — e o
   sintoma era o pior possível: o conteúdo no quadro, nada na página
   do tema, nenhum log, e a impressão de que "só funciona quando vem
   da pesquisa".

   O quadro é o recorte certo do piso porque é a superfície que a
   pessoa montou de uma vez: um quadro feito só de post-its curtos
   É o conteúdo dele, enquanto um post-it solto ao lado de prosa
   longa no MESMO quadro continua sendo o pedaço solto que
   `MINIMO_UTIL` existe para deixar de fora.

   `TETO_BLOCOS` passa a valer sobre o total que de fato vai ao
   modelo — antes cada lista tinha o seu, e a soma podia passar do
   teto que o teto existia para garantir.
   ------------------------------------------------------------ */
export type RegistroCru = { id: string; titulo: string; descricao: string | null };
export type QuadroCru = {
  id: string;
  titulo: string | null;
  tarefaId: string;
  colunas: { registros: RegistroCru[] }[];
};

export function escolherBlocos(quadros: QuadroCru[]): Bloco[] {
  const escolhidos: Bloco[] = [];

  for (const q of quadros) {
    if (QUADRO_DE_PERGUNTAS.test(q.titulo ?? '')) continue;

    const bons: Bloco[] = [];
    const curtos: Bloco[] = [];

    for (const coluna of q.colunas) {
      for (const r of coluna.registros) {
        /* Título e descrição viajam juntos: no quadro de documento
           o título é o cabeçalho da seção, e separá-los deixaria o
           trecho começando no meio de uma frase. */
        const texto = (r.descricao ? `${r.titulo}\n\n${r.descricao}` : r.titulo).trim();
        if (!texto) continue;

        /* `n` nasce zerado de propósito: a numeração é o contrato
           com a resposta do modelo e precisa ser 1..N contígua na
           lista que de fato for usada. Só no fim se sabe qual é. */
        const bloco: Bloco = {
          n: 0,
          texto,
          tarefaId: q.tarefaId,
          quadroId: q.id,
          registroId: r.id,
        };

        (texto.length >= MINIMO_UTIL ? bons : curtos).push(bloco);
      }
    }

    for (const b of bons.length ? bons : curtos) {
      if (escolhidos.length >= TETO_BLOCOS) break;
      escolhidos.push(b);
    }
  }

  return escolhidos.map((b, i) => ({ ...b, n: i + 1 }));
}
