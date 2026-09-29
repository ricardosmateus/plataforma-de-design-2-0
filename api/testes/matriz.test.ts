/* BOARD-PESQUISA-MATRIZ — o lado do servidor.
   Puro: nada aqui fala com banco nem com rede. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarMatriz, instrucaoDeFormato, lerModeloMatriz, QUADRANTES } from '../src/pesquisa/matriz.js';
import { interpretarPlano } from '../src/pesquisa/planejador.js';

test('o nome da matriz na tarefa decide o formato', () => {
  assert.equal(detectarMatriz('Fazer a análise SWOT da iHouseLog'), 'swot');
  assert.equal(detectarMatriz('Monte a FOFA do projeto'), 'swot');
  assert.equal(
    detectarMatriz('Com base na análise, liste: 3-5 oportunidades que concorrentes ainda não exploram, 3-5 ameaças que a iHouseLog deve acompanhar.'),
    'swot',
  );
  assert.equal(detectarMatriz('Comparar força e fraqueza da iHouseLog vs concorrência'), 'swot');
  assert.equal(detectarMatriz('Preencher a Matriz CSD do app'), 'csd');
  assert.equal(detectarMatriz('Separar certezas, suposições e dúvidas sobre o público'), 'csd');
  assert.equal(detectarMatriz('Priorizar as ideias por impacto x esforço'), 'impacto_esforco');
  assert.equal(detectarMatriz('Monte uma tabela: tecnologia, cobertura geográfica, custo.'), 'comparativa');
  assert.equal(detectarMatriz('Criar uma tabela comparativa dos concorrentes'), 'comparativa');
});

test('tarefa que não pede matriz continua texto', () => {
  assert.equal(detectarMatriz('Pesquisar outras logtechs que atuam no Brasil'), null);
  assert.equal(detectarMatriz('A Loggi opera ponto de coleta em condomínios?'), null);
  assert.equal(detectarMatriz('Analisar a concorrência e as oportunidades de parceria'), null);
  assert.equal(detectarMatriz('Mapear as ameaças regulatórias do setor'), null);
});

test('o modelo só aceita os formatos conhecidos', () => {
  assert.equal(lerModeloMatriz('swot'), 'swot');
  assert.equal(lerModeloMatriz('FOFA'), 'swot');
  assert.equal(lerModeloMatriz('impacto-esforco'), 'impacto_esforco');
  assert.equal(lerModeloMatriz('pestel'), null);
  assert.equal(lerModeloMatriz(null), null);
  assert.equal(lerModeloMatriz(3), null);
});

test('o plano carrega a matriz lida pelo planejador', () => {
  const p = interpretarPlano(
    '{"perguntas":[{"pergunta":"Quais concorrentes a iHouseLog tem?","porque":"x"}],"ja_sabido":[],"nao_da_para_buscar":null,"matriz":"swot"}',
  );
  assert.equal(p?.matriz, 'swot');
  const sem = interpretarPlano('{"perguntas":[{"pergunta":"Quem são?","porque":"x"}],"ja_sabido":[]}');
  assert.equal(sem?.matriz, null);
  const invalida = interpretarPlano('{"perguntas":[{"pergunta":"Quem são?","porque":"x"}],"matriz":"inventada"}');
  assert.equal(invalida?.matriz, null);
});

test('a instrução pede os títulos que o navegador procura', () => {
  for (const [modelo, titulos] of Object.entries(QUADRANTES)) {
    const inst = instrucaoDeFormato(modelo as keyof typeof QUADRANTES);
    for (const t of titulos) assert.ok(inst.includes(`## ${t}`), `${modelo}: falta "## ${t}"`);
  }
  assert.match(instrucaoDeFormato('comparativa'), /\| Critério \|/);
});
