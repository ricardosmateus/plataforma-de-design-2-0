/* ============================================================
   Testes da verificação de procedência do assistente
   ============================================================
   Regras: Regras_de_negocio/modulos/ia/ia-assistente-conhecimento.md
           §1.2 (IA-GARANT)

   Não tocam o banco nem o provedor: exercitam exatamente a camada
   que faz a regra valer — a que confere, contra as idéias que de
   fato foram ao contexto, o que o modelo alegou ter usado.

   É deliberado que estes testes rodem sem provedor: a garantia não
   pode depender de quem respondeu. Rodam com `npm run teste`.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { verificar, semVerdadeValidada, verificarAcao, alegaAcaoSemProposta } from '../src/ia/verificacao.js';
import { blocos, ehVerdadeValidada, instrucoes, formatoDaResposta, type IdeiaContexto, type TarefaContexto } from '../src/ia/contexto.js';

const IDEIAS: IdeiaContexto[] = [
  { id: 'val-1', titulo: 'Preço é R$ 49', descricao: 'validado com clientes', importancia: 5, status: 'finalizado' },
  { id: 'hip-1', titulo: 'Talvez cobrar por uso', descricao: 'ainda estudando', importancia: 3, status: 'ideias' },
  { id: 'hip-2', titulo: 'Parceria com X', descricao: 'em conversa', importancia: 2, status: 'andamento' },
];

/* Estreita o tipo do veredito e falha o teste se a resposta tiver
   sido recusada — evita o `?.` espalhado por toda asserção. */
function aceito(v: ReturnType<typeof verificar>) {
  assert.equal(v.ok, true, 'esperava veredito aceito');
  if (!v.ok) throw new Error('inalcançável');
  return v;
}

describe('IA-GARANT-003 — o que o modelo alega é conferido contra o banco', () => {
  test('hipótese citada como verdade é rebaixada', () => {
    const v = aceito(verificar([{ ideiaId: 'hip-1', categoria: 'validada' }], IDEIAS));
    assert.equal(v.fontes.length, 1);
    assert.equal(v.fontes[0]?.rebaixada, true);
    assert.equal(v.fontes[0]?.categoriaReal, 'hipotese');
    assert.equal(v.houveRebaixamento, true);
  });

  test('verdade citada como verdade passa intacta', () => {
    const v = aceito(verificar([{ ideiaId: 'val-1', categoria: 'validada' }], IDEIAS));
    assert.equal(v.fontes[0]?.rebaixada, false);
    assert.equal(v.houveRebaixamento, false);
  });

  test('verdade citada como hipótese NÃO é promovida', () => {
    /* O rebaixamento só vale numa direção. Promover seria o servidor
       decidindo elevar algo a verdade — e essa decisão é da pessoa,
       ao mover o card para Finalizado. */
    const v = aceito(verificar([{ ideiaId: 'val-1', categoria: 'hipotese' }], IDEIAS));
    assert.equal(v.fontes[0]?.categoriaAlegada, 'hipotese');
    assert.equal(v.fontes[0]?.rebaixada, false);
  });

  test('categoria malformada é lida como alegação de verdade', () => {
    /* Leitura severa de propósito: tratar malformado como "hipótese"
       transformaria um bug de formato em passe livre. */
    for (const bruta of [{ ideiaId: 'hip-1', categoria: 'sei-la' }, { ideiaId: 'hip-1' }]) {
      const v = aceito(verificar([bruta], IDEIAS));
      assert.equal(v.fontes[0]?.categoriaAlegada, 'validada');
      assert.equal(v.fontes[0]?.rebaixada, true);
    }
  });

  test('id repetido entra uma vez só', () => {
    const v = aceito(verificar(
      [{ ideiaId: 'val-1', categoria: 'validada' }, { ideiaId: 'val-1', categoria: 'validada' }],
      IDEIAS,
    ));
    assert.equal(v.fontes.length, 1);
  });
});

describe('IA-GARANT-004 — fonte fora do contexto derruba a resposta', () => {
  test('id que o modelo não recebeu recusa a resposta inteira', () => {
    /* Invenção ou vazamento. Nenhum dos dois pode chegar à tela. */
    const v = verificar([{ ideiaId: 'de-outra-empresa', categoria: 'validada' }], IDEIAS);
    assert.equal(v.ok, false);
    if (v.ok) throw new Error('inalcançável');
    assert.deepEqual(v.idsEstranhos, ['de-outra-empresa']);
  });

  test('uma fonte legítima não salva a resposta se houver outra estranha', () => {
    const v = verificar(
      [{ ideiaId: 'val-1', categoria: 'validada' }, { ideiaId: 'fantasma', categoria: 'validada' }],
      IDEIAS,
    );
    assert.equal(v.ok, false);
  });
});

describe('entradas malformadas não derrubam a resposta', () => {
  test('itens sem id são ignorados', () => {
    const v = aceito(verificar([{ naoTemId: true }, null, 'texto'], IDEIAS));
    assert.equal(v.fontes.length, 0);
  });

  test('fontes que não são lista viram lista vazia', () => {
    assert.equal(aceito(verificar('não é lista', IDEIAS)).fontes.length, 0);
    assert.equal(aceito(verificar(undefined, IDEIAS)).fontes.length, 0);
  });
});

describe('IA-VAZIO — ausência de verdade é reconhecida', () => {
  test('resposta só com hipóteses é marcada como sem verdade validada', () => {
    const v = aceito(verificar([{ ideiaId: 'hip-1', categoria: 'validada' }], IDEIAS));
    assert.equal(semVerdadeValidada(v.fontes), true);
  });

  test('resposta com pelo menos uma verdade não é marcada', () => {
    const v = aceito(verificar([{ ideiaId: 'val-1', categoria: 'validada' }], IDEIAS));
    assert.equal(semVerdadeValidada(v.fontes), false);
  });

  test('resposta sem fontes conta como sem verdade validada', () => {
    assert.equal(semVerdadeValidada([]), true);
  });
});

describe('IA-GARANT-001 — os dois blocos chegam separados ao modelo', () => {
  test('verdades e hipóteses ficam em blocos distintos, nessa ordem', () => {
    const b = blocos(IDEIAS);
    assert.ok(b.includes('BLOCO A'));
    assert.ok(b.includes('BLOCO B'));
    assert.ok(b.indexOf('val-1') < b.indexOf('BLOCO B'), 'verdade deve estar no bloco A');
    assert.ok(b.indexOf('hip-1') > b.indexOf('BLOCO B'), 'hipótese deve estar no bloco B');
  });

  test('projeto sem verdade nenhuma mostra o bloco A vazio, e não o omite', () => {
    /* Omitir deixaria o modelo sem distinguir "não há verdade
       validada" de "esqueceram de mandar" — e é aí que ele inventa. */
    const b = blocos(IDEIAS.filter((i) => i.status !== 'finalizado'));
    assert.ok(b.includes('BLOCO A'));
    assert.ok(b.includes('ainda não tem nenhuma idéia validada'));
  });
});

describe('IA-VAZIO-007 — a base das sugestões é o que a conta escreveu', () => {
  test('a descrição da empresa entra nas instruções quando existe', () => {
    const s = instrucoes({
      empresaNome: 'iHouseLog',
      empresaDescricao: 'Empresa de coleta de encomendas em condomínios.',
      projetoNome: 'Startup',
      ideias: [],
      tarefas: [],
    });
    assert.ok(s.includes('coleta de encomendas'));
  });

  test('sem descrição, manda perguntar em vez de supor', () => {
    /* O nome sozinho não autoriza deduzir ramo nem concorrentes:
       nomes coincidem, e afirmação confiante sobre negócio
       desconhecido é pior que nenhuma resposta. */
    const s = instrucoes({
      empresaNome: 'Nike',
      empresaDescricao: null,
      projetoNome: 'Startup',
      ideias: [],
      tarefas: [],
    });
    assert.ok(s.includes('ainda não escreveu uma descrição'));
    assert.ok(s.includes('pergunte sobre o'));
  });

  test('as instruções proíbem deduzir a partir do nome', () => {
    const s = instrucoes({ empresaNome: 'X', empresaDescricao: null, projetoNome: 'Startup', ideias: [], tarefas: [] });
    assert.ok(s.includes('NÃO deduza ramo'));
  });

  test('projeto em branco manda tomar a iniciativa, não calar', () => {
    const s = instrucoes({ empresaNome: 'X', empresaDescricao: null, projetoNome: 'Startup', ideias: [], tarefas: [] });
    assert.ok(s.includes('PROJETO EM BRANCO'));
    assert.ok(s.includes('NÃO pare aí'));
    assert.ok(s.includes('SUGERIR'));
  });
});

describe('a fronteira da verdade mora num lugar só', () => {
  test('apenas finalizado é verdade validada', () => {
    assert.equal(ehVerdadeValidada('finalizado'), true);
    assert.equal(ehVerdadeValidada('ideias'), false);
    assert.equal(ehVerdadeValidada('andamento'), false);
  });
});

describe('IA-ACAO-002 — a proposta de ação é conferida antes de virar "pendente"', () => {
  test('null é o caso comum: nada foi pedido', () => {
    assert.equal(verificarAcao(null, IDEIAS), null);
    assert.equal(verificarAcao(undefined, IDEIAS), null);
  });

  test('criar_ideia válida passa, com importância ausente virando 0', () => {
    const a = verificarAcao({ tipo: 'criar_ideia', titulo: 'Landing page', descricao: 'Página de captura' }, IDEIAS);
    assert.deepEqual(a, {
      tipo: 'criar_ideia',
      titulo: 'Landing page',
      descricao: 'Página de captura',
      importancia: 0,
    });
  });

  test('criar_ideia com título vazio ou longo demais é descartada', () => {
    assert.equal(
      verificarAcao({ tipo: 'criar_ideia', titulo: '   ', descricao: 'x' }, IDEIAS),
      null,
    );
    assert.equal(
      verificarAcao({ tipo: 'criar_ideia', titulo: 'a'.repeat(61), descricao: 'x' }, IDEIAS),
      null,
    );
  });

  test('criar_ideia com importância fora de 0..5 é descartada', () => {
    assert.equal(
      verificarAcao({ tipo: 'criar_ideia', titulo: 'X', descricao: 'Y', importancia: 6 }, IDEIAS),
      null,
    );
    assert.equal(
      verificarAcao({ tipo: 'criar_ideia', titulo: 'X', descricao: 'Y', importancia: -1 }, IDEIAS),
      null,
    );
  });

  test('editar_ideia com id que veio do contexto passa', () => {
    const a = verificarAcao(
      { tipo: 'editar_ideia', ideiaId: 'hip-1', titulo: 'Novo título', descricao: 'Nova descrição', importancia: 4 },
      IDEIAS,
    );
    assert.deepEqual(a, {
      tipo: 'editar_ideia',
      ideiaId: 'hip-1',
      titulo: 'Novo título',
      descricao: 'Nova descrição',
      importancia: 4,
    });
  });

  test('editar_ideia com id fora do contexto é descartada — mesmo princípio de IA-GARANT-004', () => {
    /* Um id inventado ou vazado não pode virar candidato a escrita,
       mesmo como proposta pendente — só chegar perto do quadro já é
       o que não pode acontecer. */
    const a = verificarAcao(
      { tipo: 'editar_ideia', ideiaId: 'de-outro-projeto', titulo: 'X', descricao: 'Y' },
      IDEIAS,
    );
    assert.equal(a, null);
  });

  test('mover_ideia válida passa', () => {
    const a = verificarAcao({ tipo: 'mover_ideia', ideiaId: 'hip-1', status: 'finalizado' }, IDEIAS);
    assert.deepEqual(a, { tipo: 'mover_ideia', ideiaId: 'hip-1', status: 'finalizado' });
  });

  test('mover_ideia com status inválido é descartada', () => {
    assert.equal(
      verificarAcao({ tipo: 'mover_ideia', ideiaId: 'hip-1', status: 'arquivado' }, IDEIAS),
      null,
    );
  });

  test('tipo desconhecido ou ausente é descartado, não derruba a resposta', () => {
    assert.equal(verificarAcao({ tipo: 'excluir_ideia', ideiaId: 'hip-1' }, IDEIAS), null);
    assert.equal(verificarAcao({}, IDEIAS), null);
    assert.equal(verificarAcao('não é objeto', IDEIAS), null);
  });
});

describe('IA-ACAO-001 — o assistente propõe, nunca decide sozinho', () => {
  test('as instruções deixam a fronteira explícita: propor sim, executar não', () => {
    const s = instrucoes({ empresaNome: 'X', empresaDescricao: null, projetoNome: 'Startup', ideias: [], tarefas: [] });
    assert.ok(s.includes('NUNCA decide'));
    assert.ok(s.includes('PROPOR'));
    assert.ok(s.includes('só a pessoa confirma'));
  });

  test('o contrato de resposta descreve o formato de acao_proposta', () => {
    const f = formatoDaResposta();
    assert.ok(f.includes('acao_proposta'));
    assert.ok(f.includes('criar_ideia'));
    assert.ok(f.includes('editar_ideia'));
    assert.ok(f.includes('mover_ideia'));
  });
});

describe('IA-ACAO-009 — instruções proíbem alegar ação sem proposta', () => {
  test('proíbe explicitamente os verbos no passado ("criei", "movi", "editei")', () => {
    const s = instrucoes({ empresaNome: 'X', empresaDescricao: null, projetoNome: 'Startup', ideias: [], tarefas: [] });
    assert.ok(s.includes('NUNCA diz'));
    assert.ok(s.includes('"criei"'));
    assert.ok(s.includes('"movi"'));
    assert.ok(s.includes('"editei"'));
  });

  test('orienta a repropor a mesma ação quando a pessoa só confirma em texto ("ok")', () => {
    const s = instrucoes({ empresaNome: 'X', empresaDescricao: null, projetoNome: 'Startup', ideias: [], tarefas: [] });
    assert.ok(s.includes('"ok"'));
    assert.ok(s.includes('responda propondo a MESMA ação de novo'));
  });
});

describe('IA-ACAO-009 — alegaAcaoSemProposta pega a alegação falsa que passou pela instrução', () => {
  test('com proposta de verdade junto, nunca alerta — mesmo se o texto usar "criei"', () => {
    /* A resposta legítima também pode usar linguagem parecida
       ("Vou criar..."); o que importa é ter (ou não) uma proposta de
       verdade, nunca só o texto. */
    assert.equal(alegaAcaoSemProposta('Criei a proposta abaixo, confirme para valer.', true), false);
  });

  test('"Card criado!" sem proposta nenhuma dispara o alerta', () => {
    assert.equal(alegaAcaoSemProposta('Card criado! Agora é só preencher.', false), true);
  });

  test('"Idéia criada com sucesso" sem proposta dispara o alerta', () => {
    assert.equal(alegaAcaoSemProposta('Idéia criada com sucesso no quadro.', false), true);
  });

  test('"Já movi o card" e "editei a descrição" sem proposta disparam o alerta', () => {
    assert.equal(alegaAcaoSemProposta('Já movi o card para Finalizado.', false), true);
    assert.equal(alegaAcaoSemProposta('Editei a descrição para você.', false), true);
  });

  test('acentuação e caixa não escondem a alegação', () => {
    assert.equal(alegaAcaoSemProposta('IDÉIA CRIADA. Confira lá.', false), true);
    assert.equal(alegaAcaoSemProposta('ideia criada. confira lá.', false), true);
  });

  test('resposta comum, sem alegação de ação nenhuma, não dispara', () => {
    assert.equal(alegaAcaoSemProposta('Posso criar esta idéia para você, confirme abaixo.', false), false);
    assert.equal(alegaAcaoSemProposta('Vale a pena mapear seus concorrentes primeiro.', false), false);
  });
});


/* ============================================================
   IA-CONHEC-003 — resultado de tarefa concluída é material de
   consulta, e a fronteira de IA-CONHEC-002 continua fechada
   ============================================================ */

const TAREFAS: TarefaContexto[] = [
  {
    id: 't-1',
    titulo: 'Meio de transporte de encomendas',
    descricao: 'Qual meio de transporte a iHouseLog deve usar para iniciar.',
    resultado: '[Resultado da pesquisa]\nRegião de início: São Paulo, zona sul.',
    /* Atividade ainda ABERTA: a tarefa acabou, a atividade não. */
    validada: false,
  },
];

/* A mesma tarefa, agora dentro de uma atividade que a pessoa
   finalizou — IA-CONHEC-007. */
const TAREFAS_VALIDADAS: TarefaContexto[] = [
  { ...TAREFAS[0]!, id: 't-fim', validada: true },
];

describe('IA-CONHEC-003 — tarefa concluída entra como material de consulta', () => {
  test('tarefa citada que estava no contexto é aceita, como hipótese', () => {
    const v = verificar([{ tarefaId: 't-1', categoria: 'hipotese' }], [], TAREFAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.fontes.length, 1);
    assert.equal(v.fontes[0]!.tipo, 'tarefa');
    assert.equal(v.fontes[0]!.id, 't-1');
    assert.equal(v.fontes[0]!.ideiaId, null);
    assert.equal(v.fontes[0]!.categoriaReal, 'hipotese');
    assert.equal(v.fontes[0]!.rebaixada, false);
  });

  test('tarefa alegada como VERDADE é rebaixada — nunca vira fato do projeto', () => {
    const v = verificar([{ tarefaId: 't-1', categoria: 'validada' }], [], TAREFAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.fontes[0]!.categoriaReal, 'hipotese');
    assert.equal(v.fontes[0]!.rebaixada, true);
    assert.equal(v.houveRebaixamento, true);
  });

  test('tarefa não é verdade validada nem quando é a única fonte (IA-VAZIO-001)', () => {
    const v = verificar([{ tarefaId: 't-1', categoria: 'hipotese' }], [], TAREFAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(semVerdadeValidada(v.fontes), true);
  });

  test('IA-GARANT-004 vale igual para tarefa: id fora do contexto derruba a resposta', () => {
    const v = verificar([{ tarefaId: 't-inventada', categoria: 'hipotese' }], [], TAREFAS);
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.motivo, 'fonte-fora-do-projeto');
    assert.deepEqual(v.idsEstranhos, ['t-inventada']);
  });

  test('entrada com os dois ids é lida como tarefa — a leitura mais conservadora', () => {
    const ideias: IdeiaContexto[] = [
      { id: 'i-1', titulo: 'V', descricao: 'd', importancia: 3, status: 'finalizado' },
    ];
    const v = verificar(
      [{ ideiaId: 'i-1', tarefaId: 't-1', categoria: 'validada' }],
      ideias,
      TAREFAS,
    );
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.fontes[0]!.tipo, 'tarefa');
    assert.equal(v.fontes[0]!.categoriaReal, 'hipotese');
  });

  test('o bloco C leva o conteúdo do quadro ao modelo', () => {
    const texto = blocos([], TAREFAS);
    assert.match(texto, /BLOCO C — TAREFAS CONCLUÍDAS EM ATIVIDADES AINDA ABERTAS/);
    assert.match(texto, /tarefa: t-1/);
    assert.match(texto, /São Paulo, zona sul/);
    assert.match(texto, /NÃO é fato do projeto/);
  });

  test('sem tarefa concluída, o bloco C diz que está vazio', () => {
    assert.match(blocos([], []), /nenhuma tarefa concluída/);
  });
});

describe('IA-CONHEC-007 — finalizar a atividade valida o conteúdo dela', () => {
  test('tarefa de atividade finalizada pode ser afirmada como verdade', () => {
    const v = verificar([{ tarefaId: 't-fim', categoria: 'validada' }], [], TAREFAS_VALIDADAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.fontes[0]!.categoriaReal, 'validada');
    assert.equal(v.fontes[0]!.rebaixada, false);
  });

  test('e conta como verdade validada da resposta (IA-VAZIO-001)', () => {
    const v = verificar([{ tarefaId: 't-fim', categoria: 'validada' }], [], TAREFAS_VALIDADAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(semVerdadeValidada(v.fontes), false);
  });

  test('mas a de atividade AINDA ABERTA continua sendo rebaixada', () => {
    const v = verificar([{ tarefaId: 't-1', categoria: 'validada' }], [], TAREFAS);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.fontes[0]!.categoriaReal, 'hipotese');
    assert.equal(v.fontes[0]!.rebaixada, true);
  });

  test('o conteúdo validado entra no bloco A, não no C', () => {
    const texto = blocos([], TAREFAS_VALIDADAS);
    assert.match(texto, /Conteúdo das atividades finalizadas/);
    assert.match(texto, /tarefa: t-fim/);
    /* E o bloco C fica vazio: não há tarefa fora de atividade finalizada. */
    assert.match(texto, /nenhuma tarefa concluída fora de atividade finalizada/);
  });

  test('as duas famílias não se misturam num contexto com as duas', () => {
    const texto = blocos([], [...TAREFAS_VALIDADAS, ...TAREFAS]);
    const iA = texto.indexOf('t-fim');
    const iC = texto.indexOf('t-1');
    const iBlocoC = texto.indexOf('=== BLOCO C');
    assert.ok(iA < iBlocoC, 'a validada vem antes do bloco C');
    assert.ok(iC > iBlocoC, 'a de consulta vem dentro do bloco C');
  });
});
