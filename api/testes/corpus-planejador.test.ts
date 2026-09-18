/* Testes da RÉGUA do corpus de qualidade — puros, sem rede.

   POR QUE TESTAR A RÉGUA
   Uma régua que não foi medida não mede nada. Se `avaliarPlano`
   deixasse passar um plano que alargou a tarefa, o corpus daria
   verde num defeito — que é pior do que não ter corpus, porque
   ninguém mais olharia.

   Os planos aqui são FABRICADOS de propósito: um fiel e um
   derivado, este último reproduzindo o que o modelo fez de verdade
   em 14/09/2026. Nenhuma chamada sai daqui. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS, avaliarPlano, type Caso } from '../corpus/planejador.js';
import type { PlanoInvestigacao } from '../src/pesquisa/planejador.js';

const caso = (nome: string): Caso => {
  const c = CORPUS.find((x) => x.nome === nome);
  if (!c) throw new Error('caso não existe no corpus: ' + nome);
  return c;
};

const plano = (perguntas: string[], extra: Partial<PlanoInvestigacao> = {}): PlanoInvestigacao => ({
  perguntas: perguntas.map((p) => ({ pergunta: p, porque: '' })),
  jaSabido: [],
  naoDaParaBuscar: null,
  ...extra,
});

describe('o corpus está bem formado', () => {
  test('todo caso tem nome único, tarefa e um porquê', () => {
    const nomes = new Set(CORPUS.map((c) => c.nome));
    assert.equal(nomes.size, CORPUS.length, 'há nomes repetidos');
    for (const c of CORPUS) {
      assert.ok(c.tarefa.trim(), c.nome + ' sem tarefa');
      assert.ok(c.porque.trim().length > 30, c.nome + ' sem justificativa suficiente');
    }
  });

  test('todo caso cobra pelo menos um critério', () => {
    /* Caso sem espera é caso que sempre passa — ruído com cara de
       cobertura. */
    for (const c of CORPUS) {
      assert.ok(Object.keys(c.espera).length > 0, c.nome + ' não cobra nada');
    }
  });
});

describe('a régua reprova o defeito real de 14/09/2026', () => {
  const loggi = caso('loggi-fidelidade');

  test('o plano que o modelo produziu de verdade é REPROVADO', () => {
    /* Copiado do registro: cinco perguntas, nenhuma sobre a Loggi. */
    const derivado = plano([
      'Quais são as principais empresas de logtech que atuam no Brasil atualmente?',
      'Quais e-commerces oferecem serviço de entrega em pontos de coleta dentro de condomínios?',
      'Quanto custam soluções de locker inteligente para condomínios no Brasil?',
      'Quais são os maiores e-commerces do mundo com integração em condomínios residenciais?',
      'Qual é o volume de entregas por dia em um condomínio médio no Brasil?',
    ]);
    const nota = avaliarPlano(loggi, derivado);
    assert.equal(nota.passou, false);
  });

  test('e diz EM QUÊ reprovou, não só que reprovou', () => {
    const derivado = plano(['Quais são as principais empresas de logtech que atuam no Brasil?']);
    const nota = avaliarPlano(loggi, derivado);
    const falhos = nota.itens.filter((i) => !i.passou).map((i) => i.criterio);
    assert.ok(falhos.some((c) => /logtech/.test(c)), 'não acusou o alargamento: ' + falhos.join(', '));
    assert.ok(falhos.some((c) => /pergunta da tarefa/.test(c)), 'não acusou a infidelidade');
  });

  test('o plano fiel é APROVADO', () => {
    const fiel = plano([
      'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?',
      'O LoggiPonto aceita condomínio como ponto parceiro?',
    ]);
    const nota = avaliarPlano(loggi, fiel);
    assert.equal(nota.passou, true, JSON.stringify(nota.itens.filter((i) => !i.passou)));
  });

  test('inflar o plano reprova, mesmo com a tarefa dentro', () => {
    /* Cada pergunta a mais é uma busca paga a mais. */
    const inflado = plano([
      'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?',
      'a', 'b', 'c',
    ]);
    assert.equal(avaliarPlano(loggi, inflado).passou, false);
  });
});

describe('as duas direções da recusa', () => {
  test('tarefa interna: recusar aprova, planejar reprova', () => {
    const c = caso('proposta-de-valor-e-interna');
    const recusou = plano([], { naoDaParaBuscar: 'Definir proposta de valor é decisão do time.' });
    assert.equal(avaliarPlano(c, recusou).passou, true);
    assert.equal(avaliarPlano(c, plano(['Qual a proposta de valor da Acme?'])).passou, false);
  });

  test('tarefa legítima: recusar REPROVA', () => {
    /* É o defeito que a Fase 0 existiu para tirar da frente — e ele
       volta calado se ninguém medir. */
    const c = caso('logitechs-nao-recusa');
    const recusou = plano([], { naoDaParaBuscar: 'Isso é reflexão interna.' });
    assert.equal(avaliarPlano(c, recusou).passou, false);
  });
});

describe('o Bloco A', () => {
  test('ignorar o que a empresa já validou reprova', () => {
    const c = caso('aproveita-o-que-a-empresa-sabe');
    const semAproveitar = plano(['Quais marcas de periféricos gamer vendem no Brasil?']);
    assert.equal(avaliarPlano(c, semAproveitar).passou, false);
  });

  test('aproveitar aprova', () => {
    const c = caso('aproveita-o-que-a-empresa-sabe');
    const aproveitou = plano(['Qual a participação de mercado da Logitech no Brasil?'], {
      jaSabido: ['As marcas que vendem no Brasil já estão validadas.'],
    });
    assert.equal(avaliarPlano(c, aproveitou).passou, true,
      JSON.stringify(avaliarPlano(c, aproveitou).itens.filter((i) => !i.passou)));
  });
});

describe('a duplicata, que a primeira rodada real deixou passar', () => {
  /* 15/09/2026: a régua deu 5 de 5 com um plano que tinha duas
     perguntas para a mesma coisa. O que a régua não olha não
     existe — e uma busca paga a mais não aparece em lugar nenhum
     senão na fatura. */
  const c = caso('aproveita-o-que-a-empresa-sabe');

  test('o plano REAL que passou é agora reprovado', () => {
    const real = plano(
      [
        'Quais marcas de periféricos gamer vendem no Brasil e qual a participação da Logitech?',
        'Qual é a participação de mercado da Logitech em periféricos gamer no Brasil?',
      ],
      { jaSabido: ['As marcas ... Logitech, Razer, HyperX, Redragon e Husky'] },
    );
    const nota = avaliarPlano(c, real);
    assert.equal(nota.passou, false);
    assert.ok(
      nota.itens.some((i) => !i.passou && /repete/.test(i.criterio)),
      'não foi a duplicata que reprovou: ' + JSON.stringify(nota.itens.filter((i) => !i.passou)),
    );
  });

  test('e o plano enxuto, com uma pergunta só, passa', () => {
    const enxuto = plano(['Qual é a participação de mercado da Logitech em periféricos gamer no Brasil?'], {
      jaSabido: ['As marcas que vendem no Brasil já estão validadas.'],
    });
    assert.equal(avaliarPlano(c, enxuto).passou, true,
      JSON.stringify(avaliarPlano(c, enxuto).itens.filter((i) => !i.passou)));
  });

  test('a duplicata é pega nas DUAS direções', () => {
    /* `ehAMesmaPergunta` é assimétrica: a estreita cabe dentro da
       larga, mas não o contrário. Olhar só uma direção deixaria
       passar metade dos casos — que foi exatamente o que aconteceu. */
    const x: Caso = {
      nome: 'x', porque: 'a'.repeat(40), tarefa: 't', empresa: { nome: 'n', descricao: 'd' },
      espera: { maxPerguntas: 5 },
    };
    const larga = 'Quais marcas de periféricos gamer vendem no Brasil e qual a participação da Logitech?';
    const estreita = 'Qual é a participação de mercado da Logitech em periféricos gamer no Brasil?';
    assert.equal(avaliarPlano(x, plano([larga, estreita])).passou, false, 'larga antes de estreita');
    assert.equal(avaliarPlano(x, plano([estreita, larga])).passou, false, 'estreita antes de larga');
  });

  test('perguntas realmente diferentes não são acusadas', () => {
    const x: Caso = {
      nome: 'x', porque: 'a'.repeat(40), tarefa: 't', empresa: { nome: 'n', descricao: 'd' },
      espera: { maxPerguntas: 5 },
    };
    const nota = avaliarPlano(x, plano([
      'Quantas lojas físicas a Centauro tem no Brasil?',
      'Qual o faturamento anual da Decathlon no Brasil?',
    ]));
    assert.equal(nota.passou, true, JSON.stringify(nota.itens.filter((i) => !i.passou)));
  });
});

describe('a régua não é sensível a acento nem a caixa', () => {
  test('“condomínios” casa com “CONDOMINIOS”', () => {
    const c: Caso = {
      nome: 'x', porque: 'a'.repeat(40), tarefa: 'y', empresa: { nome: 'n', descricao: 'd' },
      espera: { exigidos: ['condomínios'] },
    };
    assert.equal(avaliarPlano(c, plano(['Quantos CONDOMINIOS?'])).passou, true);
  });
});
