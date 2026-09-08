/* ============================================================
   O roteador, coberto pelos exemplos reais
   ============================================================
   As perguntas aqui são as que o usuário descreveu ao pedir o
   módulo (planejamento-pesquisa-concorrentes.md §1), escritas como
   ele escreveu. Teste de roteador com pergunta inventada por quem
   escreveu o roteador prova pouco: casa com a heurística porque
   nasceu dela.

   O par que importa está em "o mesmo 'quantas unidades'": as duas
   perguntas pedem o mesmo número, e uma custa dez vezes a outra.
   Se essa distinção quebrar, o custo do módulo muda sem ninguém ver.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { planejarConsulta, type Entidade } from '../src/pesquisa/roteador.js';

/* Uma sessão que já descobriu três concorrentes — o estado em que
   as perguntas 2 em diante do §1 acontecem. */
const SESSAO: Entidade[] = [
  { apelido: 'concorrente 01', nome: 'Cafeteria Grão Nobre' },
  { apelido: 'concorrente 02', nome: 'Rede Expresso Café' },
  { apelido: 'concorrente 03', nome: 'Casa do Café Ltda' },
];

/* De quem a conversa está tratando. Nas perguntas 2 em diante do §1
   o usuário diz "ele", não repete o apelido — é a sessão que sabe a
   quem isso se refere. */
const FOCO = SESSAO[0];

describe('os quatro exemplos do §1', () => {
  test('1 — "quem são meus concorrentes" não gasta busca', () => {
    const p = planejarConsulta('Quem são meus concorrentes?');
    assert.equal(p.nivel, 'conhecimento');
    assert.equal(p.decidido, true);
  });

  test('2 — fato sobre concorrente citado vai para busca com fonte', () => {
    const p = planejarConsulta(
      'quero saber mais sobre o concorrente 01, quantas unidades ele tem no Brasil, qual região',
      SESSAO,
    );
    assert.equal(p.nivel, 'busca');
    assert.equal(p.decidido, true);
  });

  test('3 — google maps no meu bairro vai para lugares', () => {
    const p = planejarConsulta(
      'busque no google maps quantas unidades do concorrente 02 tem aqui no meu bairro',
      SESSAO,
    );
    assert.equal(p.nivel, 'lugares');
    assert.equal(p.decidido, true);
  });

  test('4 — "entre no linkedin dele" é navegação', () => {
    const p = planejarConsulta('entre no linkedin do concorrente 01', SESSAO);
    assert.equal(p.nivel, 'navegacao');
  });

  test('4 — "acesse o site e veja a reclamação" é navegação', () => {
    const p = planejarConsulta(
      'acesse o site reclame aqui e pesquise qual a principal reclamação que ele recebe',
      SESSAO,
    );
    assert.equal(p.nivel, 'navegacao');
  });
});

describe('o mesmo "quantas unidades", dois níveis de custo', () => {
  test('no Brasil é busca — pergunta de fato, sem geografia', () => {
    const p = planejarConsulta('quantas unidades ele tem no Brasil', SESSAO, FOCO);
    assert.equal(p.nivel, 'busca');
  });

  test('no meu bairro é lugares — proximidade de quem pergunta', () => {
    const p = planejarConsulta('quantas unidades ele tem aqui no meu bairro', SESSAO, FOCO);
    assert.equal(p.nivel, 'lugares');
  });

  test('na minha região também é lugares', () => {
    const p = planejarConsulta('quais unidades existem na minha região', SESSAO);
    assert.equal(p.nivel, 'lugares');
  });

  test('"em que região do Brasil" NÃO é proximidade', () => {
    const p = planejarConsulta('em que região do Brasil ele atua', SESSAO, FOCO);
    assert.equal(p.nivel, 'busca');
  });
});

describe('referências resolvem contra a sessão — PES-004', () => {
  test('o apelido some e o nome real vai ao provedor', () => {
    const p = planejarConsulta('quantas unidades o concorrente 02 tem', SESSAO);
    assert.ok(
      p.pergunta.includes('Rede Expresso Café'),
      `a pergunta ainda cita o apelido: "${p.pergunta}"`,
    );
    assert.deepEqual(p.citadas, ['Rede Expresso Café']);
    assert.deepEqual(p.naoResolvidas, []);
  });

  test('"concorrente 2" casa com "concorrente 02" — zero à esquerda não separa', () => {
    const p = planejarConsulta('fale do concorrente 2', SESSAO);
    assert.deepEqual(p.citadas, ['Rede Expresso Café']);
  });

  test('referência inexistente é denunciada, não ignorada', () => {
    const p = planejarConsulta('quantas unidades o concorrente 05 tem', SESSAO);
    assert.deepEqual(p.naoResolvidas, ['concorrente 05']);
    assert.deepEqual(p.citadas, []);
  });

  test('sessão vazia: toda referência fica não resolvida', () => {
    const p = planejarConsulta('fale do concorrente 01', []);
    assert.deepEqual(p.naoResolvidas, ['concorrente 01']);
  });

  test('entidade citada pelo nome conta, mesmo sem apelido', () => {
    const p = planejarConsulta('o que dizem da Casa do Café Ltda', SESSAO);
    assert.deepEqual(p.citadas, ['Casa do Café Ltda']);
    assert.equal(p.nivel, 'busca');
  });
});

describe('o pronome também é referência — PES-004', () => {
  test('"ele" vira o nome do foco antes de sair para o provedor', () => {
    const p = planejarConsulta('quantas unidades ele tem no Brasil', SESSAO, FOCO);
    assert.ok(
      p.pergunta.includes('Cafeteria Grão Nobre'),
      `o pronome não foi resolvido: "${p.pergunta}"`,
    );
    assert.match(p.pergunta, /^(?!.*\bele\b).*$/i);
    assert.deepEqual(p.citadas, ['Cafeteria Grão Nobre']);
  });

  test('"dele" vira "de <nome>", não o nome solto', () => {
    const p = planejarConsulta('qual o faturamento dele', SESSAO, FOCO);
    assert.ok(
      p.pergunta.includes('de Cafeteria Grão Nobre'),
      `possessivo mal resolvido: "${p.pergunta}"`,
    );
  });

  test('sem foco, o pronome é denunciado — pergunta sem sujeito não sai', () => {
    const p = planejarConsulta('quantas unidades ele tem', SESSAO);
    assert.deepEqual(p.naoResolvidas, ['ele']);
  });
});

describe('quando a heurística não sabe, ela diz', () => {
  test('navegação e proximidade juntas não decidem sozinhas', () => {
    const p = planejarConsulta(
      'acesse o site deles e veja quais unidades tem perto de mim',
      SESSAO,
    );
    assert.equal(p.decidido, false);
  });

  test('pergunta clara decide sem pedir confirmação', () => {
    for (const pergunta of [
      'quem são meus concorrentes',
      'quantas unidades ele tem no Brasil',
      'quantas unidades tem no meu bairro',
      'entre no instagram dele',
    ]) {
      assert.equal(
        planejarConsulta(pergunta, SESSAO).decidido,
        true,
        `"${pergunta}" não deveria pedir confirmação`,
      );
    }
  });
});

describe('o verbo sozinho não é navegação', () => {
  test('"acesse os dados" não manda para o nível caro', () => {
    const p = planejarConsulta('acesse os dados de faturamento dele', SESSAO, FOCO);
    assert.notEqual(p.nivel, 'navegacao');
  });
});

/* ------------------------------------------------------------
   Descrição de tarefa, não pergunta de painel
   ------------------------------------------------------------
   A tela de atividade manda a DESCRIÇÃO da tarefa para cá, e
   descrição vem no imperativo: "Pesquisar o slogan dos concorrentes".
   Nenhuma palavra interrogativa, nenhuma entidade conhecida citada —
   caía em `conhecimento`, que é o único nível que não executa nada, e
   a tela pedia para reformular uma frase que já estava correta.

   O par de testes abaixo é o que segura a correção nos dois sentidos:
   levantamento tem que executar, criação tem que continuar recusando.
   Um sem o outro deixa passar meia regra. */
describe('tarefa escrita no imperativo', () => {
  test('levantar fato sobre concorrente vai para busca', () => {
    for (const descricao of [
      'Pesquisar Slogan dos concorrentes da ihouseLog',
      'Comparar o posicionamento dos concorrentes',
      'Mapear os players do mercado de gestão de casas',
      'Descobrir quem fundou a empresa',
    ]) {
      assert.equal(
        planejarConsulta(descricao).nivel,
        'busca',
        `"${descricao}" deveria executar busca`,
      );
    }
  });

  test('pedido de criar algo novo continua sem fonte externa', () => {
    for (const descricao of [
      'Criar um slogan para a marca ihouseLog',
      'Escrever 3 slogans alternativos',
      'Definir o posicionamento da marca',
    ]) {
      assert.equal(
        planejarConsulta(descricao).nivel,
        'conhecimento',
        `"${descricao}" não tem fonte externa possível`,
      );
    }
  });

  /* O veto de criação não pode ser cego ao contexto: aqui o verbo
     "criam" aparece dentro de uma pergunta sobre o que os OUTROS
     fizeram, que é justamente o tipo de fato que se busca. */
  test('criação citada dentro de um levantamento ainda é busca', () => {
    const p = planejarConsulta('Pesquisar como os concorrentes criam seus slogans');
    assert.equal(p.nivel, 'busca');
  });

  /* O verbo sozinho não basta, mesma disciplina de VERBOS_NAVEGACAO:
     este é o exemplo real que a skill do orquestrador registra como
     reflexão interna, não consulta. */
  test('verbo de levantamento sem sujeito externo não vira busca', () => {
    const p = planejarConsulta('levantar informação sobre a suposição mais crítica');
    assert.equal(p.nivel, 'conhecimento');
  });
});
