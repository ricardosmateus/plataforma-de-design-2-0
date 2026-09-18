/* Testes de `tarefaSemConteudo` — puros, sem rede.

   O caso que originou tudo isto, medido em 14/09/2026: uma tarefa
   cuja descrição era `"Responda aqui..."` — o convite do post-it —
   virou DUAS investigações pagas, R$ 0,67. O planejador não recusou:
   com a tarefa vazia de sentido, preencheu o vazio com a ficha da
   empresa e escreveu cinco perguntas sobre o mercado de lockers.

   A guarda é aqui, e não no prompt, porque instrução não é garantia.
   Reconhecer um placeholder não precisa de modelo. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tarefaSemConteudo, avisoDeTarefaVazia } from '../src/pesquisa/planejador.js';

describe('o caso real de 14/09/2026', () => {
  test('"Responda aqui..." não é tarefa', () => {
    assert.equal(tarefaSemConteudo('Responda aqui...'), true);
  });

  test('nem com espaços em volta, nem sem as reticências', () => {
    assert.equal(tarefaSemConteudo('  Responda aqui  '), true);
    assert.equal(tarefaSemConteudo('RESPONDA AQUI…'), true);
  });

  test('o texto de falha de carga do board também não é tarefa', () => {
    /* `tarefaIndisponivel` escreve isso em `.explainer-text`, e é
       de lá que o botão "Investigar" lê. Sem esta linha, uma falha
       de rede viraria investigação paga. */
    assert.equal(
      tarefaSemConteudo('Não foi possível ler esta tarefa agora. Recarregue a página.'),
      true,
    );
  });

  test('"Sem título" e "Sem descrição" idem', () => {
    assert.equal(tarefaSemConteudo('Sem título'), true);
    assert.equal(tarefaSemConteudo('Sem descrição'), true);
  });
});

describe('o vazio em suas várias formas', () => {
  test('string vazia e só espaço', () => {
    assert.equal(tarefaSemConteudo(''), true);
    assert.equal(tarefaSemConteudo('   \n  '), true);
  });

  test('pontuação sozinha não é tarefa em língua nenhuma', () => {
    assert.equal(tarefaSemConteudo('...'), true);
    assert.equal(tarefaSemConteudo('---'), true);
    assert.equal(tarefaSemConteudo('???'), true);
  });
});

describe('o que NÃO pode ser barrado', () => {
  /* Barrar tarefa boa é pior do que deixar passar placeholder: uma
     custa centavos, a outra é o botão morto que a Fase 0 existiu
     para tirar da frente. */
  test('tarefa curta de verdade passa', () => {
    assert.equal(tarefaSemConteudo('Loggi?'), false);
    assert.equal(tarefaSemConteudo('Preço do locker'), false);
  });

  test('tarefa que CONTÉM o convite, mas diz mais, passa', () => {
    assert.equal(
      tarefaSemConteudo('Responda aqui quantas lojas a Centauro tem no Brasil'),
      false,
    );
  });

  test('a tarefa real da Loggi passa', () => {
    assert.equal(
      tarefaSemConteudo(
        'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?',
      ),
      false,
    );
  });

  test('número sozinho passa — é conteúdo', () => {
    assert.equal(tarefaSemConteudo('2026'), false);
  });
});

describe('o aviso mostra o que encontrou', () => {
  test('cita o texto do campo, para a pessoa reconhecer o problema', () => {
    const m = avisoDeTarefaVazia('Responda aqui...');
    assert.match(m, /Responda aqui/);
    assert.match(m, /Escreva o que você quer descobrir/);
  });

  test('e diz que não custou nada', () => {
    /* A recusa acontece antes de qualquer chamada. Quem viu um
       "não deu" precisa saber se pagou por ele. */
    assert.match(avisoDeTarefaVazia('Responda aqui...'), /Nada foi cobrado/);
    assert.match(avisoDeTarefaVazia(''), /Nada foi cobrado/);
  });

  test('campo vazio tem texto próprio, sem aspas de nada', () => {
    const m = avisoDeTarefaVazia('   ');
    assert.match(m, /não tem descrição/);
    assert.doesNotMatch(m, /“/);
  });
});
