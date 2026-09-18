/* ============================================================
   Corpus de qualidade do planejador — Fase 4
   ============================================================
   Puro: os CASOS e a RÉGUA vivem aqui, sem rede. Quem faz a chamada
   real é `avaliar-planejador.ts`, na raiz da API.

   ------------------------------------------------------------
   POR QUE ESTE ARQUIVO EXISTE
   ------------------------------------------------------------
   Em 14/09/2026 apareceram três defeitos, todos em uso real, e
   nenhum deles tinha sido previsto — num deles eu tinha três
   hipóteses e as três estavam erradas. O que separou o conserto do
   palpite, nas três vezes, foi ter dado na mão.

   A Fase 4 é "qualidade e custo". Toda mudança dela — trocar
   modelo, mexer no prompt, cortar buscas, filtrar domínio — é uma
   aposta sobre qualidade. Sem régua, "melhorou?" é opinião de quem
   mexeu. Este corpus é a régua.

   Ele segue o mesmo desenho de `testes/roteador.test.ts`: não
   afirma que o planejador está certo, afirma **onde ele está
   hoje**, nas duas direções — e um caso marcado `quebrado` precisa
   continuar quebrado, para que consertá-lo sem querer não passe em
   branco.

   ------------------------------------------------------------
   POR QUE A RÉGUA NÃO É UM MODELO JUIZ
   ------------------------------------------------------------
   Seria fácil pedir a um modelo que desse nota. Um juiz custa
   dinheiro por rodada, deriva como qualquer modelo, e precisaria da
   própria avaliação para se saber confiável — régua que precisa de
   régua não mede nada.

   Então aqui só entra o que dá para conferir por contagem e
   comparação de texto. O que exige julgamento humano o runner
   IMPRIME, e quem lê julga. Uma régua honesta que mede metade é
   melhor do que uma nota inventada que parece medir tudo.
   ============================================================ */

import { ehAMesmaPergunta, tarefaEhPergunta, type PlanoInvestigacao } from '../src/pesquisa/planejador.js';

export type Espera = {
  /* A tarefa é interna e não tem fato externo por trás: o plano
     certo é não ter perguntas e dizer por quê. */
  recusa?: boolean;
  /* A tarefa já é uma pergunta verificável — ela tem de estar no
     plano. É a fidelidade que o defeito da Loggi quebrou. */
  contemATarefa?: boolean;
  /* Cada pergunta a mais é uma busca paga a mais. */
  maxPerguntas?: number;
  /* Termos que denunciam alargamento: se aparecerem, o planejador
     trocou a tarefa por outra. */
  proibidos?: string[];
  /* Termos sem os quais a pergunta não é sobre o que foi pedido. */
  exigidos?: string[];
  /* O Bloco A respondia parte da tarefa: ignorá-lo é pagar por
     busca que não precisava sair. */
  aproveitaJaSabido?: boolean;
};

/* Cobrado em TODO caso, sem precisar ser pedido: duas perguntas que
   perguntam a mesma coisa são duas buscas pagas para uma resposta.
   Acrescentado em 15/09/2026, depois de a primeira rodada real ter
   passado 5 de 5 **com uma duplicata na tela** — a régua não olhava
   para isso, e o que a régua não olha não existe. */
const SEM_DUPLICATA = 'nenhuma pergunta repete outra';

export type Caso = {
  nome: string;
  tarefa: string;
  empresa: { nome: string; descricao: string };
  categoria?: string;
  /* Verdade validada (Bloco A) e material de consulta (Bloco B). */
  recortes?: { texto: string; categoria: string }[];
  consulta?: { titulo: string; descricao: string }[];
  espera: Espera;
  /* Defeito conhecido e ainda não consertado. O runner cobra que
     ele continue falhando — ver o cabeçalho. */
  quebrado?: string;
  /* Por que este caso está no corpus. Sai no relatório. */
  porque: string;
};

/* ------------------------------------------------------------
   Os casos — todos vindos de uso real ou de defeito registrado
   ------------------------------------------------------------ */
const IHOUSELOG = {
  nome: 'iHouseLog',
  descricao:
    'Transforma condomínios em pontos de coleta e entrega, conectando os maiores e-commerces do mundo ao morador.',
};

const ACME = {
  nome: 'Acme Periféricos',
  descricao: 'Vende mouses e teclados gamer no Brasil, por e-commerce próprio.',
};

export const CORPUS: Caso[] = [
  {
    nome: 'loggi-fidelidade',
    porque:
      'O defeito de 14/09/2026: o planejador trocou uma pergunta sobre UMA empresa pela pesquisa de mercado que a ficha da iHouseLog sugeria. É o caso que originou a regra 5 do prompt.',
    tarefa: 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?',
    empresa: IHOUSELOG,
    categoria: 'Concorrentes',
    espera: {
      contemATarefa: true,
      maxPerguntas: 3,
      exigidos: ['loggi'],
      /* Os exatos alargamentos que ele produziu naquele dia. */
      proibidos: ['logtech', 'maiores e-commerces', 'volume de entregas', 'quanto custa'],
    },
  },
  {
    nome: 'logitechs-nao-recusa',
    porque:
      'O caso que abriu a Fase 0: tarefa legítima que a heurística antiga recusava. O planejador não pode recusá-la — e "outras" pede concorrentes, de propósito.',
    tarefa: 'Pesquisar outras logitechs que atuam aqui no brasil.',
    empresa: ACME,
    categoria: 'Concorrentes',
    espera: { recusa: false, exigidos: ['logitech'], maxPerguntas: 4 },
  },
  {
    nome: 'proposta-de-valor-e-interna',
    porque:
      'O outro lado do portão: tarefa genuinamente interna. Buscar aqui seria gastar para responder uma decisão do time.',
    tarefa: 'Definir a proposta de valor do nosso produto para o próximo trimestre.',
    empresa: ACME,
    espera: { recusa: true },
  },
  {
    nome: 'aproveita-o-que-a-empresa-sabe',
    porque:
      'O Bloco A responde metade da tarefa. Perguntar de novo é pagar por busca que não precisava sair — e `ja_sabido` é a prova visível de que ler o conhecimento interno economiza.',
    tarefa: 'Quais marcas de periféricos gamer vendem no Brasil e qual a participação da Logitech?',
    empresa: ACME,
    categoria: 'Concorrentes',
    recortes: [
      {
        categoria: 'Concorrentes',
        texto:
          'As marcas de periféricos gamer que vendem no Brasil são Logitech, Razer, HyperX, Redragon e Husky.',
      },
    ],
    espera: { aproveitaJaSabido: true, contemATarefa: false, maxPerguntas: 3 },
  },
  {
    nome: 'uma-pergunta-basta',
    porque:
      'Tarefa que já é uma pergunta verificável e fechada. Um plano de uma pergunta é completo e legítimo; inflar é cobrar busca a mais.',
    tarefa: 'Quantas lojas físicas a Centauro tem no Brasil?',
    empresa: ACME,
    espera: { contemATarefa: true, maxPerguntas: 2, exigidos: ['centauro'] },
  },
];

/* ------------------------------------------------------------
   A régua
   ------------------------------------------------------------ */
export type Item = { criterio: string; passou: boolean; detalhe: string };
export type Nota = { caso: Caso; itens: Item[]; passou: boolean };

function achatar(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function avaliarPlano(caso: Caso, plano: PlanoInvestigacao): Nota {
  const itens: Item[] = [];
  const e = caso.espera;
  const textos = plano.perguntas.map((p) => p.pergunta);
  const tudo = achatar(textos.join(' | '));

  /* Nas duas direções, pelo mesmo motivo que a garantia precisou
     olhar nas duas: `ehAMesmaPergunta` é assimétrica, e a duplicata
     que apareceu de verdade só é visível na direção "a estreita
     cabe dentro da larga". */
  let duplicata = '';
  for (let i = 0; i < textos.length && !duplicata; i++) {
    for (let j = i + 1; j < textos.length && !duplicata; j++) {
      const a = textos[i]!;
      const b = textos[j]!;
      if (ehAMesmaPergunta(a, b) || ehAMesmaPergunta(b, a)) {
        duplicata = `${i + 1} e ${j + 1}: “${a}” / “${b}”`;
      }
    }
  }
  itens.push({
    criterio: SEM_DUPLICATA,
    passou: !duplicata,
    detalhe: duplicata || `${textos.length} pergunta(s), todas distintas`,
  });

  if (e.recusa !== undefined) {
    const recusou = plano.perguntas.length === 0 && !!plano.naoDaParaBuscar;
    itens.push({
      criterio: e.recusa ? 'recusa a tarefa interna' : 'NÃO recusa a tarefa legítima',
      passou: recusou === e.recusa,
      detalhe: recusou ? 'recusou: ' + plano.naoDaParaBuscar : textos.length + ' pergunta(s)',
    });
  }

  if (e.contemATarefa) {
    /* Só faz sentido cobrar quando a tarefa É uma pergunta — é a
       mesma condição que o servidor usa para injetá-la. */
    const vale = tarefaEhPergunta(caso.tarefa);
    const achou = textos.some((t) => ehAMesmaPergunta(caso.tarefa, t));
    itens.push({
      criterio: 'a pergunta da tarefa está no plano',
      passou: !vale || achou,
      detalhe: achou ? 'sim' : 'não — o plano começa com: ' + (textos[0] ?? '(vazio)'),
    });
  }

  if (e.maxPerguntas !== undefined) {
    itens.push({
      criterio: `no máximo ${e.maxPerguntas} pergunta(s)`,
      passou: textos.length <= e.maxPerguntas,
      detalhe: textos.length + ' pergunta(s)',
    });
  }

  for (const termo of e.exigidos ?? []) {
    itens.push({
      criterio: `fala de “${termo}”`,
      passou: tudo.includes(achatar(termo)),
      detalhe: tudo.includes(achatar(termo)) ? 'sim' : 'nenhuma pergunta menciona',
    });
  }

  for (const termo of e.proibidos ?? []) {
    const alargou = tudo.includes(achatar(termo));
    itens.push({
      criterio: `não alarga para “${termo}”`,
      passou: !alargou,
      detalhe: alargou ? 'ALARGOU: ' + (textos.find((t) => achatar(t).includes(achatar(termo))) ?? '') : 'ok',
    });
  }

  if (e.aproveitaJaSabido) {
    itens.push({
      criterio: 'aproveita o que a empresa já validou',
      passou: plano.jaSabido.length > 0,
      detalhe: plano.jaSabido.length ? plano.jaSabido.join(' · ') : 'ja_sabido veio vazio',
    });
  }

  return { caso, itens, passou: itens.every((i) => i.passou) };
}
