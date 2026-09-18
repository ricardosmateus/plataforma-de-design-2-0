/* ============================================================
   O que a empresa já sabe — o contexto da investigação
   ============================================================
   Puro: recebe linhas já lidas do banco, devolve o pacote que vai
   ao planejador. Sem Prisma, sem rede. A regra de negócio aqui é
   cara demais para só poder ser conferida subindo o app.

   Regras: BOARD-PESQUISA-013/014/015 · IA-CONHEC-002/003/004/005 ·
   SOBRE-ORIGEM-002 · decisão D7 (14/09/2026).

   ------------------------------------------------------------
   POR QUE ISTO EXISTE
   ------------------------------------------------------------
   Até hoje a investigação recebia da empresa exatamente isto:
   `{ nome, descricao }`. Nada do que está em "Sobre a empresa"
   chegava — nem as pastas, nem os recortes das idéias finalizadas.
   Ela começava do zero toda vez, e por isso podia contradizer o
   que a própria empresa já validou, ou gastar buscando o que ela
   já sabe.

   ------------------------------------------------------------
   AS DUAS CATEGORIAS, E POR QUE OS ALCANCES SÃO DIFERENTES
   ------------------------------------------------------------
   A régua é a do assistente (`IA-CONHEC`), não uma nova:

   · VERDADE VALIDADA — recortes de idéias em `finalizado`. Alcance:
     a EMPRESA inteira. É o que `Sobre_a_empresa.html` já é
     (`TEMA-ISO-001`): conhecimento validado não pertence a um
     projeto, pertence à empresa.

   · MATERIAL DE CONSULTA — idéias ativas em `ideias` e `andamento`.
     Alcance: só o PROJETO da tarefa. Hipótese de outro projeto
     seria ruído, e espalharia o não-validado entre projetos que a
     pessoa mantém separados de propósito.

   Idéia arquivada não entra em categoria nenhuma (`IA-CONHEC-004`):
   foi descartada, e ressuscitá-la aqui desfaria a decisão de quem
   a arquivou.

   ------------------------------------------------------------
   D7: CATEGORIA + VIZINHAS DO DOMÍNIO
   ------------------------------------------------------------
   Mandar a base inteira afoga a pergunta e infla o custo; mandar
   só a categoria da idéia é cego para o que a empresa sabe ao
   lado — que costuma ser exatamente o que evita repetir pesquisa
   já feita. Uma tarefa em "Concorrentes" puxa também "Mercado",
   "Benchmark", "Personas" e as demais de Descoberta.

   O teto de tokens é o que fecha a conta: a seleção é ordenada
   (categoria da idéia primeiro, vizinhas depois) e corta quando
   enche. Cortar é normal e é dito em voz alta — `cortouPorTeto`
   viaja no pacote e vira passo na narração, porque uma
   investigação que leu metade do que existe não pode parecer que
   leu tudo.
   ============================================================ */

import { TAXONOMIA } from '../ia/taxonomia-vocabulario.js';
import { tokensEstimados } from '../creditos/precos.js';

/* ~3 mil tokens. O número vem do §3.3 do plano e é um teto de
   CUSTO, não de qualidade: a esta altura o contexto interno já
   custa mais que o planejamento inteiro se ficar solto. */
export const TETO_TOKENS_CONTEXTO = 3000;

export type RecorteEntrada = {
  categoria: string;
  texto: string;
  ideiaId: string;
  ideiaTitulo: string;
};

export type IdeiaAtiva = {
  id: string;
  titulo: string;
  descricao: string;
  status: 'ideias' | 'andamento';
};

export type TrechoValidado = {
  categoria: string;
  texto: string;
  ideiaTitulo: string;
};

export type PacoteInterno = {
  empresa: { nome: string; descricao: string | null };
  /* Categorias pedidas, em ordem de prioridade: a da idéia, depois
     as vizinhas do mesmo domínio. */
  categorias: string[];
  validada: TrechoValidado[];
  consulta: IdeiaAtiva[];
  /* Quantos recortes existiam nas categorias pedidas e ficaram de
     fora por falta de espaço. Zero é o caso normal. */
  cortados: number;
  cortouPorTeto: boolean;
  tokens: number;
};

/* ------------------------------------------------------------
   Vizinhas
   ------------------------------------------------------------
   O domínio é o agrupamento de `TAXONOMIA`. Categoria fora do
   vocabulário devolve lista vazia em vez de erro: `assunto` pode
   estar nulo (idéia não classificada) ou ter vindo de uma versão
   anterior da taxonomia, e uma investigação não é lugar de
   descobrir isso derrubando a rota. */
export function dominioDe(categoria: string | null | undefined): string | null {
  if (!categoria) return null;
  for (const [dominio, categorias] of Object.entries(TAXONOMIA)) {
    if ((categorias as readonly string[]).includes(categoria)) return dominio;
  }
  return null;
}

export function vizinhasDe(categoria: string | null | undefined): string[] {
  const dominio = dominioDe(categoria);
  if (!dominio) return [];
  const irmas = TAXONOMIA[dominio as keyof typeof TAXONOMIA] as readonly string[];
  return irmas.filter((c) => c !== categoria);
}

/* A ordem importa: é ela que decide quem sobrevive ao teto. */
export function categoriasDaInvestigacao(categoria: string | null | undefined): string[] {
  if (!categoria || !dominioDe(categoria)) return [];
  return [categoria, ...vizinhasDe(categoria)];
}

/* ------------------------------------------------------------
   O pacote
   ------------------------------------------------------------
   `recortes` e `ativas` chegam já filtrados pelo banco (empresa e
   projeto, não-arquivadas). O que se decide aqui é ORDEM e CORTE —
   e isso precisa ser determinístico, senão duas investigações
   iguais leem coisas diferentes e ninguém consegue explicar por
   quê. */
export function montarPacoteInterno(entrada: {
  empresa: { nome: string; descricao: string | null };
  categoriaDaIdeia: string | null;
  recortes: RecorteEntrada[];
  ativas: IdeiaAtiva[];
  tetoTokens?: number;
}): PacoteInterno {
  const teto = entrada.tetoTokens ?? TETO_TOKENS_CONTEXTO;
  const categorias = categoriasDaInvestigacao(entrada.categoriaDaIdeia);

  /* Sem categoria (idéia não classificada), a investigação não fica
     sem contexto interno: ela perde o recorte por tema e mantém o
     material de consulta do projeto, que não depende de taxonomia.
     Devolver pacote vazio aqui seria punir a investigação por uma
     classificação que ainda não rodou. */
  const ordem = new Map(categorias.map((c, i) => [c, i]));

  const candidatos = entrada.recortes
    .filter((r) => ordem.has(r.categoria))
    .sort((a, b) => {
      const d = (ordem.get(a.categoria) ?? 99) - (ordem.get(b.categoria) ?? 99);
      if (d !== 0) return d;
      /* Desempate estável: pelo título da idéia e depois pelo texto.
         Sem isto, a ordem viria do banco e mudaria entre cargas. */
      return a.ideiaTitulo.localeCompare(b.ideiaTitulo) || a.texto.localeCompare(b.texto);
    });

  const validada: TrechoValidado[] = [];
  let tokens = 0;
  let cortados = 0;

  for (const r of candidatos) {
    const custo = tokensEstimados(r.texto) + tokensEstimados(r.categoria + r.ideiaTitulo);
    if (tokens + custo > teto) {
      cortados++;
      continue;
    }
    tokens += custo;
    validada.push({ categoria: r.categoria, texto: r.texto, ideiaTitulo: r.ideiaTitulo });
  }

  /* O material de consulta não disputa o teto com a verdade
     validada: são poucos itens, curtos (título e descrição), e é
     justamente a hipótese em andamento que a investigação existe
     para confirmar ou derrubar. Deixá-lo cair primeiro tornaria a
     investigação cega para a própria pergunta que a motivou. */
  const consulta = entrada.ativas.slice();
  for (const i of consulta) tokens += tokensEstimados(i.titulo + i.descricao);

  return {
    empresa: entrada.empresa,
    categorias,
    validada,
    consulta,
    cortados,
    cortouPorTeto: cortados > 0,
    tokens,
  };
}

/* ------------------------------------------------------------
   O texto que vai ao modelo
   ------------------------------------------------------------
   Dois blocos SEPARADOS e rotulados, nunca uma lista só com um
   campo `status` no meio — é `IA-GARANT-001` valendo aqui também.
   O rótulo do segundo bloco diz, em palavras, que aquilo não é
   fato: o planejador precisa saber a diferença para escrever "a
   web confirma ou derruba a suposição S" em vez de tratá-la como
   verdade. */
export function pacoteParaTexto(p: PacoteInterno): string {
  const partes: string[] = [];

  partes.push(
    `EMPRESA: ${p.empresa.nome}` +
      (p.empresa.descricao ? `\nDescrição escrita pela própria conta: ${p.empresa.descricao}` : ''),
  );

  if (p.validada.length) {
    const porCategoria = new Map<string, TrechoValidado[]>();
    for (const t of p.validada) {
      const lista = porCategoria.get(t.categoria) ?? [];
      lista.push(t);
      porCategoria.set(t.categoria, lista);
    }
    const blocos = [...porCategoria.entries()].map(
      ([categoria, trechos]) =>
        `## ${categoria}\n` +
        trechos.map((t) => `- (de "${t.ideiaTitulo}") ${t.texto}`).join('\n'),
    );
    partes.push(
      'BLOCO A — VERDADE VALIDADA DA EMPRESA\n' +
        'Conhecimento que a empresa já finalizou. Pode ser tratado como fato.\n' +
        'NÃO gaste busca para reconfirmar o que está aqui.\n\n' +
        blocos.join('\n\n'),
    );
  } else {
    /* Bloco vazio aparece assim mesmo, dizendo que está vazio.
       Omitir a seção deixaria o modelo sem saber a diferença entre
       "não há verdade validada" e "esqueceram de mandar" — o mesmo
       raciocínio de `ia-assistente-conhecimento.md` §2. */
    partes.push(
      'BLOCO A — VERDADE VALIDADA DA EMPRESA\n' +
        '(vazio: esta empresa ainda não tem conhecimento finalizado nestas categorias)',
    );
  }

  if (p.consulta.length) {
    partes.push(
      'BLOCO B — MATERIAL DE CONSULTA DO PROJETO (NÃO VALIDADO)\n' +
        'Hipóteses em andamento. NÃO são fato. Servem para saber o que vale confirmar\n' +
        'ou derrubar com fonte externa.\n\n' +
        p.consulta.map((i) => `- ${i.titulo}\n  ${i.descricao}`).join('\n'),
    );
  }

  if (p.cortouPorTeto) {
    partes.push(
      `NOTA: ${p.cortados} trecho(s) validado(s) ficaram de fora por limite de tamanho. ` +
        'O Bloco A está incompleto.',
    );
  }

  return partes.join('\n\n---\n\n');
}
