/* ============================================================
   O apelido não muda de dono — e as duas pontas concordam
   ============================================================
   A regra crítica está no primeiro bloco: numeração que renumera
   faz "concorrente 01" apontar para outra empresa, e a partir daí
   toda pergunta anterior significa outra coisa. Nada quebra, nada
   avisa — a resposta volta certa sobre a empresa errada.

   O último bloco cobre uma costura que nenhum dos dois arquivos vê
   sozinho: `entidades.ts` EMITE o apelido e `roteador.ts` o RESOLVE.
   Se os formatos divergirem, cada arquivo continua passando nos
   próprios testes e a referência para de funcionar no meio.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  planejarEntidades,
  mesmaEmpresa,
  type EntidadeConhecida,
} from '../src/pesquisa/entidades.js';
import { planejarConsulta } from '../src/pesquisa/roteador.js';

describe('a regra crítica — apelido atribuído é para sempre', () => {
  test('descoberta nova não renumera as antigas', () => {
    const antes = planejarEntidades(['Cafeteria Grão Nobre', 'Rede Expresso Café']);
    assert.deepEqual(
      antes.novas.map((e) => e.apelido),
      ['concorrente 01', 'concorrente 02'],
    );

    const depois = planejarEntidades(['Casa do Café'], antes.novas);
    assert.deepEqual(depois.novas, [{ apelido: 'concorrente 03', nome: 'Casa do Café' }]);
  });

  test('número removido não volta a ser usado', () => {
    /* A entidade 02 saiu da sessão; a próxima é 04, nunca 02 — o
       usuário pode ter citado "concorrente 02" numa pergunta antiga. */
    const sobraram: EntidadeConhecida[] = [
      { apelido: 'concorrente 01', nome: 'Cafeteria Grão Nobre' },
      { apelido: 'concorrente 03', nome: 'Casa do Café' },
    ];
    const p = planejarEntidades(['Padaria Aurora'], sobraram);
    assert.equal(p.novas[0]?.apelido, 'concorrente 04');
  });

  test('a ordem de chegada é preservada', () => {
    const p = planejarEntidades(['Primeira', 'Segunda', 'Terceira']);
    assert.deepEqual(
      p.novas.map((e) => e.nome),
      ['Primeira', 'Segunda', 'Terceira'],
    );
  });
});

describe('a mesma empresa, escrita de outro jeito', () => {
  test('sufixo jurídico não distingue ninguém', () => {
    assert.ok(mesmaEmpresa('Grão Nobre', 'Grão Nobre Ltda'));
    assert.ok(mesmaEmpresa('Expresso Café S/A', 'Expresso Café'));
    assert.ok(mesmaEmpresa('Casa do Café EIRELI', 'Casa do Café'));
  });

  test('nome comercial encurtado continua sendo a empresa', () => {
    assert.ok(mesmaEmpresa('Cafeteria Grão Nobre', 'Grão Nobre'));
    assert.ok(mesmaEmpresa('Café Central', 'Café Central Franquias'));
  });

  test('acento não separa', () => {
    assert.ok(mesmaEmpresa('Grão Nobre', 'Grao Nobre'));
  });

  test('não cria linha nova para quem já existe', () => {
    const conhecidas: EntidadeConhecida[] = [
      { apelido: 'concorrente 01', nome: 'Cafeteria Grão Nobre' },
    ];
    const p = planejarEntidades(['Grão Nobre Ltda'], conhecidas);
    assert.deepEqual(p.novas, []);
    assert.equal(p.repetidas[0]?.apelido, 'concorrente 01');
  });

  test('o provedor repetindo a empresa no mesmo lote não duplica', () => {
    const p = planejarEntidades(['Cafeteria Grão Nobre', 'Grão Nobre Ltda']);
    assert.equal(p.novas.length, 1);
    assert.equal(p.repetidas.length, 1);
  });
});

describe('parecido não é igual — o erro que não se vê', () => {
  test('mesma palavra genérica não junta empresas diferentes', () => {
    assert.equal(mesmaEmpresa('Padaria São João', 'Padaria São Pedro'), false);
    assert.equal(mesmaEmpresa('Café Central', 'Café Aurora'), false);
  });

  test('uma palavra só não engole um nome maior', () => {
    assert.equal(mesmaEmpresa('Café', 'Café Central'), false);
  });

  test('duas empresas diferentes viram dois apelidos', () => {
    const p = planejarEntidades(['Padaria São João', 'Padaria São Pedro']);
    assert.equal(p.novas.length, 2);
    assert.deepEqual(
      p.novas.map((e) => e.apelido),
      ['concorrente 01', 'concorrente 02'],
    );
  });
});

describe('borda', () => {
  test('nome vazio é ignorado, não vira entidade', () => {
    const p = planejarEntidades(['', '   ', 'Real Ltda']);
    assert.equal(p.novas.length, 1);
    assert.equal(p.novas[0]?.nome, 'Real Ltda');
  });

  test('sigla que some na normalização só casa consigo mesma', () => {
    assert.ok(mesmaEmpresa('3M', '3M'));
    assert.equal(mesmaEmpresa('3M', 'Oi'), false);
  });
});

describe('a costura: quem emite e quem resolve concordam', () => {
  test('todo apelido emitido é resolvido pelo roteador', () => {
    const { novas } = planejarEntidades([
      'Cafeteria Grão Nobre',
      'Rede Expresso Café',
      'Casa do Café',
    ]);

    for (const e of novas) {
      const numero = e.apelido.replace(/\D/g, '');

      /* Como o usuário escreve: com e sem zero à esquerda. */
      for (const citacao of [`concorrente ${numero}`, `concorrente ${Number(numero)}`]) {
        const p = planejarConsulta(`fale sobre o ${citacao}`, novas);
        assert.deepEqual(
          p.citadas,
          [e.nome],
          `"${citacao}" não resolveu para ${e.nome}`,
        );
        assert.deepEqual(p.naoResolvidas, []);
      }
    }
  });
});
