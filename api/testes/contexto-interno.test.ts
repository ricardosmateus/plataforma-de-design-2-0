/* Testes de `src/pesquisa/contexto-interno.ts` — puros, sem banco.

   O que se prova aqui são as regras que custam dinheiro e confiança:
   os dois alcances (BOARD-PESQUISA-015), as duas categorias sem
   mistura (BOARD-PESQUISA-014), o teto de D7, e o determinismo — duas
   investigações iguais têm que ler exatamente a mesma coisa, senão
   ninguém consegue explicar por que uma achou e a outra não. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dominioDe,
  vizinhasDe,
  categoriasDaInvestigacao,
  montarPacoteInterno,
  pacoteParaTexto,
  TETO_TOKENS_CONTEXTO,
  type RecorteEntrada,
  type IdeiaAtiva,
} from '../src/pesquisa/contexto-interno.js';

const EMPRESA = { nome: 'Acme', descricao: 'Vende periféricos.' };

function recorte(categoria: string, texto: string, titulo = 'Idéia X'): RecorteEntrada {
  return { categoria, texto, ideiaId: 'i-' + titulo, ideiaTitulo: titulo };
}

describe('D7 — a categoria da idéia e as vizinhas do domínio', () => {
  test('o domínio vem da taxonomia fechada, não de adivinhação', () => {
    assert.equal(dominioDe('Concorrentes'), 'Descoberta');
    assert.equal(dominioDe('Roadmap'), 'Produto');
    assert.equal(dominioDe('KPIs'), 'Negócio');
  });

  test('categoria fora do vocabulário não derruba nada — devolve vazio', () => {
    /* `assunto` pode estar nulo (classificação não rodou) ou vir de
       uma versão anterior da taxonomia. Uma investigação não é lugar
       de descobrir isso com um 500. */
    assert.deepEqual(vizinhasDe('Concorrência'), []);
    assert.deepEqual(vizinhasDe(null), []);
    assert.deepEqual(categoriasDaInvestigacao(undefined), []);
  });

  test('vizinhas são as irmãs do mesmo domínio, sem repetir a própria', () => {
    const v = vizinhasDe('Concorrentes');
    assert.ok(v.includes('Mercado') && v.includes('Benchmark') && v.includes('Personas'));
    assert.ok(!v.includes('Concorrentes'));
    assert.ok(!v.includes('Roadmap'), 'Roadmap é de outro domínio e não devia entrar');
  });

  test('a categoria da idéia vem PRIMEIRO — é ela que sobrevive ao teto', () => {
    assert.equal(categoriasDaInvestigacao('Mercado')[0], 'Mercado');
  });
});

describe('BOARD-PESQUISA-014 — as duas categorias, sem mistura', () => {
  const pacote = montarPacoteInterno({
    empresa: EMPRESA,
    categoriaDaIdeia: 'Concorrentes',
    recortes: [recorte('Concorrentes', 'A Razer lidera em mouses gamer.', 'Estudo de concorrência')],
    ativas: [{ id: 'a1', titulo: 'Suposição: o público é gamer casual', descricao: 'A confirmar.', status: 'andamento' }],
  });

  test('validada e consulta chegam em listas separadas', () => {
    assert.equal(pacote.validada.length, 1);
    assert.equal(pacote.consulta.length, 1);
  });

  test('o texto marca o bloco B como NÃO VALIDADO, em palavras', () => {
    const txt = pacoteParaTexto(pacote);
    assert.match(txt, /BLOCO A — VERDADE VALIDADA/);
    assert.match(txt, /BLOCO B — MATERIAL DE CONSULTA DO PROJETO \(NÃO VALIDADO\)/);
    assert.match(txt, /NÃO são fato/);
  });

  test('o bloco A vazio aparece dizendo que está vazio', () => {
    /* Omitir a seção deixaria o modelo sem saber a diferença entre
       "não há verdade validada" e "esqueceram de mandar". */
    const vazio = montarPacoteInterno({
      empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes: [], ativas: [],
    });
    assert.match(pacoteParaTexto(vazio), /BLOCO A[\s\S]*\(vazio:/);
  });

  test('o bloco A diz ao planejador para não regastar buscando o que já está lá', () => {
    assert.match(pacoteParaTexto(pacote), /NÃO gaste busca para reconfirmar/);
  });
});

describe('o teto de D7 corta, e diz que cortou', () => {
  const muitos: RecorteEntrada[] = [];
  for (let i = 0; i < 200; i++) {
    muitos.push(recorte('Concorrentes', 'x'.repeat(300), 'Idéia ' + String(i).padStart(3, '0')));
  }

  const pacote = montarPacoteInterno({
    empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes: muitos, ativas: [],
  });

  test('respeita o teto de tokens', () => {
    assert.ok(pacote.tokens <= TETO_TOKENS_CONTEXTO, `estourou: ${pacote.tokens}`);
    assert.ok(pacote.validada.length > 0, 'cortou tudo, o que seria inútil');
    assert.ok(pacote.validada.length < muitos.length);
  });

  test('o corte é declarado — investigação que leu metade não pode parecer completa', () => {
    assert.equal(pacote.cortouPorTeto, true);
    assert.ok(pacote.cortados > 0);
    assert.match(pacoteParaTexto(pacote), /ficaram de fora por limite de tamanho/);
  });

  test('sem corte, nada é dito — nota de corte só quando houve corte', () => {
    const curto = montarPacoteInterno({
      empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes',
      recortes: [recorte('Concorrentes', 'curto')], ativas: [],
    });
    assert.equal(curto.cortouPorTeto, false);
    assert.doesNotMatch(pacoteParaTexto(curto), /ficaram de fora/);
  });

  test('material de consulta não disputa o teto com a verdade validada', () => {
    /* A hipótese em andamento é justamente o que a investigação
       existe para confirmar. Deixá-la cair primeiro tornaria a
       investigação cega para a própria pergunta que a motivou. */
    const p = montarPacoteInterno({
      empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes: muitos,
      ativas: [{ id: 'a1', titulo: 'Suposição crítica', descricao: 'A confirmar.', status: 'andamento' }],
    });
    assert.equal(p.consulta.length, 1, 'a hipótese foi cortada pelo teto e não devia');
  });
});

describe('a prioridade do corte é a da categoria da idéia', () => {
  test('quando falta espaço, a categoria da idéia fica e a vizinha sai', () => {
    const recortes = [
      /* 12 mil caracteres ~ 4 mil tokens: sozinha a vizinha ja
         estoura o teto de 3 mil. */
      recorte('Mercado', 'v'.repeat(12000), 'Vizinha'),
      recorte('Concorrentes', 'p'.repeat(600), 'Principal'),
    ];
    const p = montarPacoteInterno({
      empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes, ativas: [],
    });
    assert.deepEqual(p.validada.map((t) => t.categoria), ['Concorrentes']);
    assert.equal(p.cortados, 1);
  });
});

describe('determinismo — duas investigações iguais leem a mesma coisa', () => {
  test('a ordem não depende da ordem em que o banco devolveu', () => {
    const base = [
      recorte('Mercado', 'm1', 'B'),
      recorte('Concorrentes', 'c1', 'A'),
      recorte('Concorrentes', 'c2', 'C'),
    ];
    const a = montarPacoteInterno({ empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes: base, ativas: [] });
    const b = montarPacoteInterno({ empresa: EMPRESA, categoriaDaIdeia: 'Concorrentes', recortes: [...base].reverse(), ativas: [] });
    assert.deepEqual(
      a.validada.map((t) => t.categoria + '/' + t.texto),
      b.validada.map((t) => t.categoria + '/' + t.texto),
    );
  });
});

describe('idéia sem classificação não fica sem contexto', () => {
  test('perde o recorte por tema, mantém o material de consulta do projeto', () => {
    /* Devolver pacote vazio aqui seria punir a investigação por uma
       classificação que ainda não rodou. */
    const p = montarPacoteInterno({
      empresa: EMPRESA,
      categoriaDaIdeia: null,
      recortes: [recorte('Concorrentes', 'algo')],
      ativas: [{ id: 'a1', titulo: 'H1', descricao: 'd', status: 'ideias' }],
    });
    assert.deepEqual(p.categorias, []);
    assert.equal(p.validada.length, 0);
    assert.equal(p.consulta.length, 1);
    assert.match(pacoteParaTexto(p), /BLOCO B/);
  });
});
