/* Corpus do roteador — `src/pesquisa/roteador.ts`
   ============================================================
   Puro: sem banco, sem rede, sem provedor.

   POR QUE ESTE ARQUIVO EXISTE
   ---------------------------------------------------------
   O roteador é um portão de custo: ele decide se uma tarefa vira
   busca paga, consulta de lugares, recusa por termos de uso, ou
   nada. Mexer nele sem medida é trocar um falso negativo por um
   falso positivo e só descobrir na fatura — ou pior, num usuário
   que desiste porque o botão não faz nada.

   O corpus é a medida. Ele não afirma que a heurística está certa:
   ele afirma **onde ela está hoje**, nas duas direções.

   AS DUAS ASSERÇÕES, E POR QUE A SEGUNDA IMPORTA MAIS
   ---------------------------------------------------------
   1. Todo caso SEM a marca `quebrado` precisa continuar passando.
      É a proteção contra regressão.

   2. Todo caso COM a marca `quebrado` precisa continuar falhando —
      e falhar do jeito registrado. Parece absurdo até se ver o que
      acontece sem isso: alguém conserta a heurística na Fase 1, o
      caso passa a funcionar, e ninguém fica sabendo. A marca é uma
      dívida declarada; o teste é o cobrador. Quando ele acusar
      "isto foi consertado", a ação é tirar a marca, não mexer no
      código.

   O ESTADO DE HOJE: 14 de 18
   ---------------------------------------------------------
   Os quatro que falham são a mesma falha, quatro vezes: a tarefa
   diz um verbo de levantamento e nomeia um alvo externo, mas o
   alvo é nome próprio ou categoria de produto, e `SUJEITO_EXTERNO`
   é uma lista fechada de substantivos genéricos ("concorrentes",
   "players", "mercado"). Nome próprio não está na lista, então não
   passa — e "Pesquisar outras logitechs" cai em `conhecimento`,
   que hoje é recusa.

   A Fase 0 NÃO conserta isso. Ela tira o beco sem saída
   (BOARD-PESQUISA-012): a pessoa passa a poder dizer "busca assim
   mesmo". A heurística só muda na Fase 1, quando um modelo barato
   substitui o portão — e é este corpus que vai dizer se a troca
   melhorou ou só mudou de erro.

   Ver `planejamento-pesquisa-v2.md`, limites L1 e L2. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planejarConsulta, type Nivel } from '../src/pesquisa/roteador.js';

type Caso = {
  frase: string;
  esperado: Nivel;
  porque: string;
  /* Presente = falha hoje, de propósito registrado. O texto diz o
     que o roteador devolve no lugar do esperado. */
  quebrado?: { veio: Nivel; motivo: string };
};

const CORPUS: Caso[] = [
  /* ---- Levantamento com alvo externo: onde a heurística cega ---- */
  {
    frase: 'Pesquisar outras logitechs que atuam aqui no brasil.',
    esperado: 'busca',
    porque: 'a tarefa que motivou o plano — marca nomeada, verbo de levantamento',
    quebrado: { veio: 'conhecimento', motivo: '"logitechs" não está em SUJEITO_EXTERNO (lista fechada de genéricos)' },
  },
  {
    frase: 'Pesquisar concorrentes da Logitech no Brasil',
    esperado: 'busca',
    porque: 'mesma pergunta, com a palavra genérica que a lista conhece',
  },
  {
    frase: 'Levantar quem vende mouse gamer no Brasil',
    esperado: 'busca',
    porque: 'verbo de levantamento + categoria de produto',
    quebrado: { veio: 'conhecimento', motivo: '"mouse gamer" é produto, não substantivo genérico de concorrência' },
  },
  {
    frase: 'Mapear players de periféricos no mercado brasileiro',
    esperado: 'busca',
    porque: 'tem "players" e "mercado", ambos na lista',
  },
  {
    frase: 'Pesquisar a Nike e a Adidas',
    esperado: 'busca',
    porque: 'duas marcas nomeadas, nada mais',
    quebrado: { veio: 'conhecimento', motivo: 'nome próprio sozinho não aciona FATO nem ATRIBUTO_PUBLICO' },
  },
  {
    frase: 'Descobrir quantas lojas a Centauro tem',
    esperado: 'busca',
    porque: '"quantas" aciona FATO',
  },
  {
    frase: 'Listar fabricantes de teclado mecânico',
    esperado: 'busca',
    porque: 'verbo + categoria de produto',
    quebrado: { veio: 'conhecimento', motivo: '"fabricantes" não está na lista; "teclado mecânico" é produto' },
  },
  {
    frase: 'Pesquisar o slogan dos concorrentes',
    esperado: 'busca',
    porque: 'ATRIBUTO_PUBLICO — já funcionava',
  },

  /* ---- Reflexão interna: tem que CONTINUAR em conhecimento ----
     Estes são o outro lado da medida. Uma correção que faça os
     quatro de cima passarem e quebrar um destes não é correção:
     é gastar dinheiro do usuário para buscar na web o que só
     existe dentro da cabeça dele. */
  { frase: 'Definir nossa proposta de valor', esperado: 'conhecimento', porque: 'criação interna' },
  { frase: 'Criar um slogan para a marca', esperado: 'conhecimento', porque: 'criação — o veto de VERBO_CRIACAO tem que segurar' },
  { frase: 'Mapear certezas, suposições e dúvidas', esperado: 'conhecimento', porque: 'reflexão interna, apesar do verbo de levantamento' },
  { frase: 'Escrever a visão do produto', esperado: 'conhecimento', porque: 'criação' },
  { frase: 'Levantar informação sobre a nossa suposição mais crítica', esperado: 'conhecimento', porque: 'reflexão, com verbo enganoso' },
  { frase: 'Definir as personas do produto', esperado: 'conhecimento', porque: 'criação interna' },
  { frase: 'Priorizar o backlog da próxima sprint', esperado: 'conhecimento', porque: 'trabalho interno' },

  /* ---- Lugares ---- */
  { frase: 'Quantas unidades da Centauro tem no meu bairro', esperado: 'lugares', porque: 'proximidade' },
  { frase: 'Quais as lojas dele no google maps', esperado: 'lugares', porque: 'mapa + lugar físico' },

  /* ---- Navegação: recusa por termos de uso (PES-005) ---- */
  { frase: 'Entrar no LinkedIn deles e ver os funcionários', esperado: 'navegacao', porque: 'destino específico' },
];

describe('roteador — o corpus que mede o portão de custo', () => {
  const saudaveis = CORPUS.filter((c) => !c.quebrado);
  const quebrados = CORPUS.filter((c) => c.quebrado);

  test('o corpus tem os dois lados — senão ele não mede nada', () => {
    /* Um corpus só de casos que deveriam virar busca premiaria uma
       heurística que manda tudo para busca. */
    const niveis = new Set(CORPUS.map((c) => c.esperado));
    assert.ok(niveis.has('busca') && niveis.has('conhecimento'), 'faltou um dos dois lados');
    assert.ok(niveis.has('lugares') && niveis.has('navegacao'), 'faltou lugares ou navegação');
  });

  test(`os ${saudaveis.length} casos que funcionam continuam funcionando`, () => {
    for (const c of saudaveis) {
      const p = planejarConsulta(c.frase, []);
      assert.equal(
        p.nivel,
        c.esperado,
        `REGRESSÃO em "${c.frase}"\n` +
          `  esperado ${c.esperado}, veio ${p.nivel}\n` +
          `  o caso existe porque: ${c.porque}`,
      );
    }
  });

  test(`os ${quebrados.length} casos quebrados continuam quebrados — do jeito registrado`, () => {
    for (const c of quebrados) {
      const p = planejarConsulta(c.frase, []);
      assert.equal(
        p.nivel,
        c.quebrado!.veio,
        `"${c.frase}" mudou de comportamento.\n` +
          `  Estava indo para ${c.quebrado!.veio} (${c.quebrado!.motivo}).\n` +
          `  Agora vai para ${p.nivel}.\n` +
          (p.nivel === c.esperado
            ? '  ISTO FOI CONSERTADO. Tire a marca `quebrado` deste caso no corpus.'
            : '  Mudou para um terceiro nível — nem o errado de antes, nem o certo. Investigar.'),
      );
    }
  });

  test('a heurística acerta 14 dos 18 — o número que a Fase 1 tem que subir', () => {
    const acertos = CORPUS.filter((c) => planejarConsulta(c.frase, []).nivel === c.esperado).length;
    assert.equal(
      acertos,
      saudaveis.length,
      `o corpus diz ${saudaveis.length} acertos e mediu ${acertos} — as marcas \`quebrado\` estão desatualizadas`,
    );
  });
});

describe('roteador — quando ele admite que não sabe (PES-007)', () => {
  test('sinal de navegação E de lugar na mesma frase não decide sozinho', () => {
    /* É o único caso de `decidido: false` que existe hoje, e é o
       que o 409 de `consultar` serve para resolver. Dois níveis
       caros disputando a mesma pergunta é exatamente onde errar
       sai caro. */
    const p = planejarConsulta('Entrar no site deles e ver as unidades perto de mim', []);
    assert.equal(p.decidido, false, 'a disputa navegação × lugares tem que chegar indecisa');
  });

  test('tudo que é claro chega decidido — indecisão não pode virar o padrão', () => {
    for (const c of CORPUS) {
      const p = planejarConsulta(c.frase, []);
      assert.equal(p.decidido, true, `"${c.frase}" chegou indecisa, e não deveria`);
    }
  });
});

describe('roteador — referência sem dono (PES-004)', () => {
  test('"ele" sem ninguém citado antes fica por resolver, não vira chute', () => {
    const p = planejarConsulta('Quantas lojas ele tem no Brasil', []);
    assert.ok(p.naoResolvidas.length > 0, 'a referência tinha que ficar registrada como não resolvida');
  });

  test('"ele" com foco definido vira o nome real', () => {
    const p = planejarConsulta('Quantas lojas ele tem no Brasil', [], { apelido: 'ele', nome: 'Centauro' });
    assert.equal(p.naoResolvidas.length, 0, 'com foco, não sobra referência solta');
    assert.ok(p.pergunta.includes('Centauro'), `a pergunta resolvida devia citar o nome: "${p.pergunta}"`);
  });
});
