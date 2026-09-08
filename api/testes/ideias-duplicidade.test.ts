/* ============================================================
   Testes da detecção de duplicidade de idéias
   ============================================================
   Regras: Regras_de_negocio/modulos/ideias/ideias-criacao.md
           §1.4 (IDEIA-DUPL)

   Não tocam o banco: exercitam a função pura que decide "isto se
   parece o bastante com uma idéia que já existe" — a mesma que a
   rota chama antes de gravar (POST/PUT de ideias.ts). Quem filtra o
   que entra na comparação (idéias ativas, exclusão da própria idéia
   ao editar) é o CHAMADOR — aqui já chega pronto, de propósito.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { encontrarDuplicata, type IdeiaComparavel } from '../src/ideias/duplicidade.js';

function ideia(parcial: Partial<IdeiaComparavel> & Pick<IdeiaComparavel, 'id'>): IdeiaComparavel {
  return { titulo: '', descricao: '', status: 'ideias', ...parcial };
}

describe('IDEIA-DUPL — encontrarDuplicata', () => {
  test('título e descrição idênticos: encontra a duplicata', () => {
    const candidata = {
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    };
    const existente = ideia({
      id: 'e1',
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada);
    assert.equal(achada.id, 'e1');
  });

  test('conteúdo bem diferente: não encontra nada', () => {
    const candidata = { titulo: 'Melhorar onboarding', descricao: 'Reduzir passos do cadastro inicial' };
    const existente = ideia({
      id: 'e1',
      titulo: 'Pesquisar concorrentes de preço',
      descricao: 'Levantar tabela de preços dos três principais concorrentes',
    });

    assert.equal(encontrarDuplicata(candidata, [existente]), null);
  });

  test('acento e caixa não escondem a semelhança', () => {
    const candidata = {
      titulo: 'PÁGINA DE CHECKOUT MAIS RÁPIDA',
      descricao: 'Reduzir o tempo de carregamento no checkout',
    };
    const existente = ideia({
      id: 'e1',
      titulo: 'pagina de checkout mais rapida',
      descricao: 'reduzir o tempo de carregamento no checkout',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada);
    assert.equal(achada.id, 'e1');
  });

  test('palavras na mesma bagagem, em outra ordem, ainda contam como parecidas', () => {
    const candidata = {
      titulo: 'de canal hipótese Testar',
      descricao: 'anúncios pagos trazem clientes qualificados validar se',
    };
    const existente = ideia({
      id: 'e1',
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada);
    assert.equal(achada.id, 'e1');
  });

  test('poucas palavras em comum (abaixo do limiar) não dispara o aviso', () => {
    const candidata = {
      titulo: 'Testar novo canal de vendas',
      descricao: 'Explorar parceria com marketplace regional para vender mais',
    };
    const existente = ideia({
      id: 'e1',
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    });

    /* As duas falam de "canal", mas quase nada mais — não é o mesmo
       assunto, é coincidência de vocabulário. */
    assert.equal(encontrarDuplicata(candidata, [existente]), null);
  });

  test('editar: ignorarId exclui a própria idéia da comparação', () => {
    const candidata = {
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    };
    const propria = ideia({
      id: 'e1',
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    });

    /* Sem excluir, a idéia bateria consigo mesma toda vez que fosse
       editada sem mudar o texto — não é isso que a regra quer pegar. */
    assert.equal(encontrarDuplicata(candidata, [propria], 'e1'), null);
  });

  test('editar: outra idéia diferente da que está sendo editada continua valendo', () => {
    const candidata = {
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    };
    const propria = ideia({ id: 'e1', titulo: 'Outra coisa qualquer', descricao: 'Nada a ver' });
    const outraParecida = ideia({
      id: 'e2',
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    });

    const achada = encontrarDuplicata(candidata, [propria, outraParecida], 'e1');
    assert.ok(achada);
    assert.equal(achada.id, 'e2');
  });

  test('mais de uma parecida: devolve a de maior semelhança', () => {
    const candidata = {
      titulo: 'Testar hipótese de canal pago',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    };
    const parcial = ideia({ id: 'parcial', titulo: 'Testar canal', descricao: 'Ainda sem detalhe nenhum' });
    const quaseIgual = ideia({
      id: 'quase-igual',
      titulo: 'Testar hipótese de canal pago',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados novos',
    });

    const achada = encontrarDuplicata(candidata, [parcial, quaseIgual]);
    assert.ok(achada);
    assert.equal(achada.id, 'quase-igual');
  });

  test('lista vazia (ex.: projeto sem nenhuma idéia ativa) nunca encontra nada', () => {
    const candidata = { titulo: 'Qualquer coisa', descricao: 'Qualquer descrição' };
    assert.equal(encontrarDuplicata(candidata, []), null);
  });

  test('idéia arquivada só fica de fora se o chamador não a incluir na lista', () => {
    /* Esta função não sabe o que é "arquivada" — quem filtra é a
       rota, buscando só `arquivadoEm: null` (ideias-criacao.md §1.4).
       O teste aqui documenta o contrato: se não está na lista, não
       compara — e por isso uma arquivada nunca dispara o aviso. */
    const candidata = {
      titulo: 'Testar hipótese de canal',
      descricao: 'Validar se anúncios pagos trazem clientes qualificados',
    };
    assert.equal(encontrarDuplicata(candidata, []), null);
  });
});
