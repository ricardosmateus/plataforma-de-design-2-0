/* ============================================================
   O foco, o teto e os três resultados
   ============================================================
   O bloco que importa é o primeiro. O foco é o que faz "ele"
   resolver na pergunta seguinte, e o modo de falha dele não é
   quebrar: é responder com segurança sobre a empresa errada.

   Os casos aqui saem do fluxo real do §1 — "quem são meus
   concorrentes" descobrindo cinco de uma vez, e o usuário
   aprofundando num deles depois.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirFoco,
  cabeNoTeto,
  classificarResultado,
  type Entidade,
} from '../src/pesquisa/sessao.js';

const NOBRE: Entidade = { apelido: 'concorrente 01', nome: 'Cafeteria Grão Nobre' };
const EXPRESSO: Entidade = { apelido: 'concorrente 02', nome: 'Rede Expresso Café' };
const CASA: Entidade = { apelido: 'concorrente 03', nome: 'Casa do Café' };

const CONHECIDAS = [NOBRE, EXPRESSO, CASA];

describe('o foco — quem "ele" vai significar na próxima pergunta', () => {
  test('citar uma empresa passa o assunto para ela', () => {
    const foco = decidirFoco(null, { citadas: [EXPRESSO.nome], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, EXPRESSO);
  });

  test('"quem são meus concorrentes" NÃO elege ninguém', () => {
    /* Cinco empresas de uma vez: nenhuma é o assunto. Eleger a
       última faria o "ele" seguinte apontar para quem o usuário nem
       leu. */
    const foco = decidirFoco(null, { citadas: [], descobertas: CONHECIDAS }, []);
    assert.equal(foco, null);
  });

  test('comparar duas empresas limpa o foco em vez de chutar', () => {
    const foco = decidirFoco(
      NOBRE,
      { citadas: [NOBRE.nome, EXPRESSO.nome], descobertas: [] },
      CONHECIDAS,
    );
    assert.equal(foco, null);
  });

  test('uma descoberta única vira o assunto', () => {
    const foco = decidirFoco(null, { citadas: [], descobertas: [CASA] }, []);
    assert.deepEqual(foco, CASA);
  });

  test('pergunta sem entidade nenhuma não muda o assunto', () => {
    const foco = decidirFoco(NOBRE, { citadas: [], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, NOBRE);
  });

  test('falha do provedor não troca o assunto', () => {
    /* A consulta caiu: nada citado, nada descoberto. Quem estava em
       pauta continua em pauta. */
    const foco = decidirFoco(EXPRESSO, { citadas: [], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, EXPRESSO);
  });

  test('o assunto muda quando o usuário pergunta, não quando o provedor responde', () => {
    /* Citou o 03 e a busca não trouxe nada. O assunto já é o 03. */
    const foco = decidirFoco(NOBRE, { citadas: [CASA.nome], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, CASA);
  });

  test('a sequência do §1, do começo ao aprofundamento', () => {
    /* 1. "quem são meus concorrentes" */
    let foco = decidirFoco(null, { citadas: [], descobertas: CONHECIDAS }, []);
    assert.equal(foco, null, 'a lista inicial não deveria eleger ninguém');

    /* 2. "quero saber mais sobre o concorrente 01" */
    foco = decidirFoco(foco, { citadas: [NOBRE.nome], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, NOBRE);

    /* 3. "quantas unidades ELE tem no Brasil" — sem citar de novo */
    foco = decidirFoco(foco, { citadas: [NOBRE.nome], descobertas: [] }, CONHECIDAS);
    assert.deepEqual(foco, NOBRE, 'o foco tem que sobreviver ao aprofundamento');
  });
});

describe('o teto da sessão — PES-007', () => {
  test('sessão sem teto próprio não barra nada', () => {
    assert.equal(cabeNoTeto(9_000_000, 5_000_000, null), true);
  });

  test('conta o gasto já feito MAIS a próxima consulta', () => {
    /* Gastou 8, o teto é 10, a próxima custa 3: não cabe. Olhar só o
       gasto diria que ainda há espaço. */
    assert.equal(cabeNoTeto(8_000_000, 3_000_000, 10_000_000), false);
  });

  test('bater exatamente no teto ainda cabe', () => {
    assert.equal(cabeNoTeto(7_000_000, 3_000_000, 10_000_000), true);
  });

  test('sessão nova com teto aceita a primeira consulta', () => {
    assert.equal(cabeNoTeto(0, 200_000, 10_000_000), true);
  });
});

describe('entregue, vazio e falhou são três coisas — PES-008', () => {
  test('achou: entregue', () => {
    assert.equal(classificarResultado({ itens: 4 }), 'entregue');
  });

  test('não achou nada: vazio, não falha', () => {
    assert.equal(classificarResultado({ itens: 0 }), 'vazio');
  });

  test('erro: falhou, não vazio', () => {
    assert.equal(classificarResultado({ itens: 0, erro: 'timeout' }), 'falhou');
  });

  test('erro com zero itens NÃO se disfarça de vazio', () => {
    /* O disfarce que a regra existe para impedir: a tela diria que o
       concorrente não tem unidade nenhuma, quando a busca é que caiu. */
    assert.notEqual(classificarResultado({ itens: 0, erro: 'cota excedida' }), 'vazio');
  });

  test('erro vence contagem, mesmo com itens parciais', () => {
    assert.equal(classificarResultado({ itens: 2, erro: 'resposta incompleta' }), 'falhou');
  });

  test('erro nulo ou vazio não conta como erro', () => {
    assert.equal(classificarResultado({ itens: 1, erro: null }), 'entregue');
  });
});
