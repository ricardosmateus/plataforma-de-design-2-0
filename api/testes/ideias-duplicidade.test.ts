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

  /* ----------------------------------------------------------
     O caso que a suíte NÃO cobria até 16/09/2026
     ----------------------------------------------------------
     Todos os testes acima repetem texto quase igual nos DOIS
     campos — e por isso passavam mesmo com a calibração que
     deixava o alerta mudo na prática. O caso real de duplicidade
     não é copiar e colar: é escrever de novo, com outras
     palavras, uma idéia que a pessoa esqueceu que já tinha
     escrito. O título volta igual (é o nome que ela dá à coisa);
     a descrição sai reescrita.

     Com peso 0.5/0.5 estes três davam 0.53, 0.57 e 0.50 — todos
     abaixo do limiar de 0.6. É a regressão que estes testes
     travam.
     ---------------------------------------------------------- */
  test('mesmo título, descrição reescrita com outras palavras: ainda é duplicata', () => {
    const candidata = {
      titulo: 'Reciclagem',
      descricao: 'Juntar as caixas de papelão que sobram das entregas e mandar para reciclagem.',
    };
    const existente = ideia({
      id: 'reciclagem',
      titulo: 'Reciclagem',
      descricao: 'Recolher as embalagens dos ecommerces para reciclar.',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada, 'título idêntico precisa bastar — ver PESO_TITULO em duplicidade.ts');
    assert.equal(achada.id, 'reciclagem');
  });

  test('mesmo título, descrição muito mais curta que a original: ainda é duplicata', () => {
    const candidata = { titulo: 'Assinatura do serviço', descricao: 'Modelo de assinatura mensal.' };
    const existente = ideia({
      id: 'assinatura',
      titulo: 'Assinatura do serviço',
      descricao: 'Criar um tipo de assinatura do serviço da iHouseLog.',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada, 'Jaccard pune diferença de tamanho; o título precisa carregar a decisão');
    assert.equal(achada.id, 'assinatura');
  });

  test('título idêntico e descrição sem NENHUMA palavra em comum: ainda é duplicata', () => {
    const candidata = {
      titulo: 'Integração com e-commerces',
      descricao: 'Receber pedidos direto das grandes lojas online.',
    };
    const existente = ideia({
      id: 'integracao',
      titulo: 'Integração com e-commerces',
      descricao: 'Conectar com Shopee e Mercado Livre.',
    });

    const achada = encontrarDuplicata(candidata, [existente]);
    assert.ok(achada, 'o pior caso: semelhança de descrição = 0, e mesmo assim precisa avisar');
    assert.equal(achada.id, 'integracao');
  });

  /* O contrapeso do teste acima: subir o peso do título não pode
     transformar o alerta em ruído. Estes dois pares saíram das 152
     idéias reais do projeto iHouseLog/Startup — compartilham uma
     palavra forte do domínio e NÃO são a mesma idéia. Se algum dia
     começarem a disparar, o limiar foi longe demais. */
  test('palavra de domínio em comum não basta: “Amazon” x “Amazon prime” não é duplicata', () => {
    const candidata = {
      titulo: 'Amazon prime',
      descricao: 'Fazer parcerias com a amazon para incluir nossos serviços dentro da assinatura amazon prime',
    };
    const existente = ideia({
      id: 'amazon',
      titulo: 'Amazon',
      descricao: 'Pesquisar em relação o e-commerce da Amazon Brasil. Entender sobre a logística deles.',
    });

    assert.equal(encontrarDuplicata(candidata, [existente]), null);
  });

  test('mesmo formato de título não basta: apresentação para síndicos x para e-commerces', () => {
    const candidata = {
      titulo: 'Apresentação iHouseLog para e-commerces',
      descricao: 'Criar uma apresentação para explicar o que é a ihouseLog e para o que ela serve.',
    };
    const existente = ideia({
      id: 'sindicos',
      titulo: 'Apresentação iHouseLog para Síndicos',
      descricao: 'Criar uma apresentação para que possamos mostrar aos síndicos como funciona a iHouseLog.',
    });

    assert.equal(encontrarDuplicata(candidata, [existente]), null);
  });
});
