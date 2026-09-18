/* Testes de `src/pesquisa/planejador.ts` — puros, sem rede.

   O que se prova é a leitura da resposta do modelo, que é onde o
   dinheiro escapa: cada pergunta que passa daqui vira uma busca a
   US$ 0,01 mais os tokens de leitura. Tolerância a formato é
   necessária; tolerância a conteúdo seria pagar por lixo. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretarPlano,
  perguntaDoPlanejador,
  comPerguntaDaTarefa,
  tarefaEhPergunta,
  ehAMesmaPergunta,
  SISTEMA_PLANEJADOR,
  MIN_PERGUNTAS,
  MAX_PERGUNTAS,
} from '../src/pesquisa/planejador.js';

const BOM = JSON.stringify({
  perguntas: [
    { pergunta: 'Quais marcas de periféricos gamer vendem no Brasil?', porque: 'concorrência direta' },
    { pergunta: 'Qual a participação de mercado da Logitech no Brasil?', porque: 'tamanho do líder' },
    { pergunta: 'Quais os preços médios de mouse gamer no varejo brasileiro?', porque: 'faixa de preço' },
  ],
  ja_sabido: ['A Razer lidera em mouses gamer — já está no Bloco A'],
  nao_da_para_buscar: null,
});

describe('o plano é lido com tolerância de formato', () => {
  test('JSON puro', () => {
    const p = interpretarPlano(BOM);
    assert.ok(p);
    assert.equal(p!.perguntas.length, 3);
    assert.equal(p!.jaSabido.length, 1);
    assert.equal(p!.naoDaParaBuscar, null);
  });

  test('dentro de cerca de crase', () => {
    assert.ok(interpretarPlano('```json\n' + BOM + '\n```'));
  });

  test('com uma frase de enfeite antes e depois', () => {
    assert.ok(interpretarPlano('Claro! Segue o plano:\n' + BOM + '\nEspero ter ajudado.'));
  });
});

describe('rigor de conteúdo — é aqui que o dinheiro escapa', () => {
  test('resposta ilegível vira falha, nunca plano vazio', () => {
    /* Um plano vazio seguiria adiante gastando busca sem ninguém ter
       decidido o quê. */
    assert.equal(interpretarPlano('desculpe, não entendi a tarefa'), null);
    assert.equal(interpretarPlano(''), null);
    assert.equal(interpretarPlano('{quebrado'), null);
  });

  test('zero perguntas E nenhum motivo é formato ruim, não recusa', () => {
    /* Tratar como recusa esconderia falha nossa atrás de uma
       mensagem de produto — e a pessoa levaria a culpa por uma
       tarefa que estava boa. */
    assert.equal(interpretarPlano('{"perguntas": [], "ja_sabido": []}'), null);
  });

  test('zero perguntas COM motivo é recusa legítima', () => {
    const p = interpretarPlano(JSON.stringify({
      perguntas: [],
      ja_sabido: [],
      nao_da_para_buscar: 'Definir a proposta de valor é decisão do time, não fato externo.',
    }));
    assert.ok(p);
    assert.equal(p!.perguntas.length, 0);
    assert.match(p!.naoDaParaBuscar!, /decisão do time/);
  });

  test('mais de 6 perguntas são cortadas no servidor, não pedidas ao modelo', () => {
    /* Pedir é instrução; cortar é garantia. Cada pergunta a mais é
       uma busca paga. */
    const muitas = { perguntas: [] as unknown[], ja_sabido: [], nao_da_para_buscar: null };
    for (let i = 0; i < 20; i++) muitas.perguntas.push({ pergunta: 'Pergunta número ' + i, porque: 'x' });
    const p = interpretarPlano(JSON.stringify(muitas));
    assert.equal(p!.perguntas.length, MAX_PERGUNTAS);
  });

  test('pergunta duplicada não vira duas buscas', () => {
    const p = interpretarPlano(JSON.stringify({
      perguntas: [
        { pergunta: 'Quantas lojas a Centauro tem?', porque: 'a' },
        { pergunta: 'quantas lojas a centauro tem', porque: 'b' },
        { pergunta: 'Qual o faturamento da Centauro?', porque: 'c' },
      ],
      ja_sabido: [], nao_da_para_buscar: null,
    }));
    assert.equal(p!.perguntas.length, 2);
  });

  test('pergunta vazia ou não-texto é descartada', () => {
    const p = interpretarPlano(JSON.stringify({
      perguntas: [
        { pergunta: '   ', porque: 'a' },
        { pergunta: 42, porque: 'b' },
        null,
        'texto solto',
        { pergunta: 'Uma boa?', porque: 'c' },
      ],
      ja_sabido: [], nao_da_para_buscar: null,
    }));
    assert.equal(p!.perguntas.length, 1);
    assert.equal(p!.perguntas[0]!.pergunta, 'Uma boa?');
  });

  test('campos faltando não derrubam o plano', () => {
    const p = interpretarPlano('{"perguntas":[{"pergunta":"E aí?"}]}');
    assert.ok(p);
    assert.equal(p!.perguntas[0]!.porque, '');
    assert.deepEqual(p!.jaSabido, []);
  });
});

describe('as instruções carregam o que a Fase 0 aprendeu', () => {
  test('nome próprio é dito como sinal forte de fato externo', () => {
    /* É exatamente onde a heurística de regex falhava: lista fechada
       de substantivos genéricos não cobre "logitechs". */
    assert.match(SISTEMA_PLANEJADOR, /[Nn]ome próprio/);
    assert.match(SISTEMA_PLANEJADOR, /logitechs/i);
  });

  test('manda não repetir o que o Bloco A já responde', () => {
    assert.match(SISTEMA_PLANEJADOR, /NÃO faça pergunta cuja resposta já está no BLOCO A/);
  });

  test('manda tratar o Bloco B como não validado', () => {
    assert.match(SISTEMA_PLANEJADOR, /nunca as trate como fato/);
  });

  test('na dúvida, prefere perguntar a recusar', () => {
    /* O planejador não pode virar um portão novo, mais esperto. */
    assert.match(SISTEMA_PLANEJADOR, /Na dúvida, prefira perguntar/);
  });

  test('o limite de perguntas está nas instruções e no código', () => {
    assert.match(SISTEMA_PLANEJADOR, new RegExp(`${MIN_PERGUNTAS} a ${MAX_PERGUNTAS} perguntas`));
  });

  test('uma pergunta é um plano legítimo — o piso de 3 saiu', () => {
    /* O piso forçava o modelo a preencher cota alargando o assunto.
       "A Loggi opera ponto de coleta em condomínios?" virou quatro
       perguntas sobre o mercado de logtech. */
    assert.equal(MIN_PERGUNTAS, 1);
    assert.match(SISTEMA_PLANEJADOR, /[Uu]ma só é um plano completo/);
  });

  test('manda não alargar o assunto, com exemplo', () => {
    assert.match(SISTEMA_PLANEJADOR, /Não alargue o assunto/);
    assert.match(SISTEMA_PLANEJADOR, /não vira "quais empresas fazem Y"/);
  });

  test('a ficha da empresa interpreta a tarefa, nunca a substitui', () => {
    assert.match(SISTEMA_PLANEJADOR, /NUNCA substitui a tarefa/);
  });
});

describe('o caso da Loggi — a pergunta da tarefa entra por construção', () => {
  const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';

  /* O plano que o modelo devolveu de verdade em 14/09/2026, e que
     não respondia nada do que foi perguntado. */
  const DESVIADO = {
    perguntas: [
      { pergunta: 'Principais empresas de logtech que atuam no Brasil', porque: 'a' },
      { pergunta: 'E-commerces com serviço de locker em condomínios', porque: 'b' },
      { pergunta: 'Custo de locker inteligente para condomínios', porque: 'c' },
      { pergunta: 'Maiores e-commerces do mundo com integração em condomínios', porque: 'd' },
    ],
    jaSabido: [],
    naoDaParaBuscar: null,
  };

  test('tarefa escrita como pergunta é reconhecida', () => {
    assert.equal(tarefaEhPergunta(TAREFA), true);
    assert.equal(tarefaEhPergunta('Pesquisar a Loggi e verificar o principal produto'), false);
  });

  test('parágrafo que por acaso acaba em "?" não conta como pergunta', () => {
    assert.equal(tarefaEhPergunta('x'.repeat(400) + '?'), false);
  });

  test('o plano desviado ganha a pergunta da tarefa em PRIMEIRO lugar', () => {
    /* Primeira, não última: a busca responde na ordem e o teto de
       saída corta o fim. */
    const p = comPerguntaDaTarefa(TAREFA, DESVIADO);
    assert.equal(p.perguntas[0]!.pergunta, TAREFA);
    assert.match(p.perguntas[0]!.porque, /própria tarefa/);
  });

  test('e o plano não passa do teto por causa disso', () => {
    const cheio = { ...DESVIADO, perguntas: Array.from({ length: MAX_PERGUNTAS }, (_, i) => ({ pergunta: 'P' + i, porque: '' })) };
    assert.equal(comPerguntaDaTarefa(TAREFA, cheio).perguntas.length, MAX_PERGUNTAS);
  });

  test('não duplica quando o modelo já fez a pergunta certa', () => {
    const bom = { ...DESVIADO, perguntas: [{ pergunta: TAREFA, porque: 'x' }] };
    assert.equal(comPerguntaDaTarefa(TAREFA, bom).perguntas.length, 1);
  });

  test('nem quando ele parafraseou — paráfrase não é segunda busca', () => {
    const quase = {
      ...DESVIADO,
      perguntas: [{ pergunta: 'A Loggi oferece serviço de ponto de coleta em condomínios residenciais ou comerciais?', porque: 'x' }],
    };
    assert.equal(comPerguntaDaTarefa(TAREFA, quase).perguntas.length, 1);
  });

  test('nem quando o modelo perguntou só a parte que FALTA', () => {
    /* Achado pela régua da Fase 4 em 15/09/2026, com chamada real.
       Tarefa composta: "Quais marcas vendem no Brasil E qual a
       participação da Logitech?", com as marcas já validadas no
       Bloco A. O modelo acertou — perguntou só o que faltava. A
       garantia, que só olhava `ehAMesmaPergunta(tarefa, p)`,
       reinjetou a tarefa inteira por cima: duas perguntas para uma
       coisa só, uma busca paga a mais.

       `ehAMesmaPergunta` divide as palavras comuns pelo tamanho do
       PRIMEIRO argumento. Com a tarefa longa na frente, quase nunca
       bate; com a pergunta estreita na frente, bate. Por isso a
       garantia agora olha nas duas direções. */
    const composta = 'Quais marcas de periféricos gamer vendem no Brasil e qual a participação da Logitech?';
    const soOqueFalta = {
      perguntas: [
        { pergunta: 'Qual é a participação de mercado da Logitech em periféricos gamer no Brasil?', porque: 'x' },
      ],
      jaSabido: ['As marcas que vendem no Brasil já estão validadas.'],
      naoDaParaBuscar: null,
    };
    const p = comPerguntaDaTarefa(composta, soOqueFalta);
    assert.equal(p.perguntas.length, 1, JSON.stringify(p.perguntas.map((q) => q.pergunta)));
  });

  test('MAS a deriva continua sendo corrigida — o conserto não afrouxou a garantia', () => {
    /* O risco de olhar nas duas direções seria uma pergunta
       DERIVADA passar por "já está no plano". Não passa: derivada
       não cabe dentro da tarefa, porque não compartilha as palavras
       dela. Este é o caso real de 14/09/2026. */
    const derivado = {
      perguntas: [
        { pergunta: 'Quais são as principais empresas de logtech que atuam no Brasil atualmente?', porque: 'x' },
      ],
      jaSabido: [],
      naoDaParaBuscar: null,
    };
    const p = comPerguntaDaTarefa(TAREFA, derivado);
    assert.equal(p.perguntas[0]!.pergunta, TAREFA);
    assert.equal(p.perguntas.length, 2);
  });

  test('tarefa que é instrução continua sendo expandida, sem frase crua no plano', () => {
    /* "Pesquisar a Loggi e verificar o produto" não é pergunta —
       ali expandir é o trabalho certo, e forçar a frase crua como
       termo de busca seria pior. */
    const instrucao = 'Pesquisar a Loggi que atua no brasil, verificar qual o seu principal produto';
    const p = comPerguntaDaTarefa(instrucao, DESVIADO);
    assert.equal(p.perguntas.length, DESVIADO.perguntas.length);
    assert.ok(!p.perguntas.some((q) => q.pergunta === instrucao));
  });
});

describe('duas perguntas são a mesma quando', () => {
  test('uma contém a outra', () => {
    assert.equal(ehAMesmaPergunta('A Loggi opera em condomínios?', 'Diga: A Loggi opera em condomínios?'), true);
  });
  test('quase todas as palavras de assunto batem', () => {
    assert.equal(
      ehAMesmaPergunta(
        'A Loggi opera serviço de ponto de coleta em condomínios residenciais?',
        'A Loggi oferece serviço de ponto de coleta em condomínios residenciais?',
      ),
      true,
    );
  });
  test('e NÃO são a mesma quando falam de coisas diferentes', () => {
    assert.equal(
      ehAMesmaPergunta(
        'A Loggi opera ponto de coleta em condomínios?',
        'Quais os maiores e-commerces do mundo?',
      ),
      false,
    );
  });
  test('palavra de cola sozinha não casa nada', () => {
    assert.equal(ehAMesmaPergunta('Ela faz?', 'Quais empresas fazem entrega no Brasil?'), false);
  });
});

describe('a montagem do pedido', () => {
  test('o contexto interno vem ANTES da tarefa', () => {
    /* A ordem importa: o modelo precisa saber o que a empresa já
       sabe antes de ler o que foi pedido, senão ele planeja e só
       depois descobre que metade já estava respondida. */
    const p = perguntaDoPlanejador('Pesquisar concorrentes', 'BLOCO A — ...');
    assert.ok(p.indexOf('BLOCO A') < p.indexOf('Pesquisar concorrentes'));
    assert.match(p, /TAREFA A INVESTIGAR/);
  });
});
