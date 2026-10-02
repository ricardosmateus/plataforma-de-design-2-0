/* ATV-GERAR-025 — o detector de nomes de empresa não informados, com
   os TEXTOS REAIS que a régua do gerador produziu em 01/10/2026. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomesNaoInformados, nomesProprios } from '../src/ia/nomes-nao-informados.js';

const MENSAGEM_DA_REGUA = 'Empresa: iHouseLog. Projeto: iHouseLog — Startup. Atividade: Identidade da marca. Tarefas: Definir o nome da marca; Paleta de cores. O que a empresa já sabe: Receita: o e-commerce paga por entrega concluída no ponto de coleta.';

test('o caso real: os nomes que ninguém informou são achados', () => {
  const gerado = 'Quais tipografias usam empresas de logística tech (Loggi, Juntos Entregamos), plataformas que conectam negócios a condomínios ou edifícios (Loft, Nestio), e apps de entrega com pontos de coleta (Amazon Lockers, Correios, Mercado Livre)?';
  assert.deepEqual(nomesNaoInformados(gerado, MENSAGEM_DA_REGUA).sort(),
    ['Amazon Lockers', 'Correios', 'Juntos Entregamos', 'Loft', 'Loggi', 'Mercado Livre', 'Nestio']);
});

test('nome informado na mensagem passa, com ou sem acento e caixa', () => {
  const permitido = MENSAGEM_DA_REGUA + ' Concorrentes já conhecidos: Loggi, Mercado Livre, Amazon.';
  const gerado = 'Como a Loggi, o Mercado Livre e a Amazon Lockers usam pontos de coleta no Brasil?';
  assert.deepEqual(nomesNaoInformados(gerado, permitido), []);
});

test('tarefas reais SEM nome de empresa não acusam nada (começo de frase, siglas, geografia)', () => {
  for (const t of [
    'Quais são as razões pelas quais moradores de condomínios residenciais verticais no Sudeste recusam ou evitam usar armários inteligentes para receber encomendas? Para definir como comunicar o serviço e remover obstáculos de adoção.',
    'Quais sistemas de autenticação (QR code, senha, biometria, app, cartão) os armários inteligentes de condomínios usam hoje? Quem fabrica e quanto custam? Para decidir como o morador abre o armário na iHouseLog.',
    'Quais são os principais argumentos contra e a favor da aprovação de pontos de coleta em assembleias de condomínios? Foco: condomínios verticais em capitais do Sudeste.',
    'Analisar sites, logotipos, paletas e tipografia de 5 a 7 startups de logística tech e plataformas B2B2C. Foco: como comunicam confiança.',
  ]) assert.deepEqual(nomesNaoInformados(t, MENSAGEM_DA_REGUA), [], t);
});

/* Limite conhecido, de propósito: nome no COMEÇO da frase ("Loggi opera
   em…") não é achado — ali a maiúscula é gramática. Tarefas geradas
   começam por verbo ou por "Quais", então o custo é pequeno. */
test('sequências de nome: "Mercado Livre" é um nome só; conector no meio é parte dele', () => {
  assert.deepEqual(nomesProprios('Compare o Mercado Livre e a Casas Bahia.'), ['Mercado Livre', 'Casas Bahia']);
  assert.deepEqual(nomesProprios('Dados do Reclame Aqui sobre a Loja de Departamento Fulana.'), ['Reclame Aqui', 'Loja de Departamento Fulana']);
});

/* ---- O ponto cego e a reação (ATV-GERAR-025, opção A) ---- */
import { readFileSync } from 'node:fs';
import { instrucaoSemNomes, escolherProposta } from '../src/ia/nomes-nao-informados.js';

test('"iFood", "eBay": minúscula seguida de maiúscula é nome — o ponto cego da 1ª medição', () => {
  const gerado = 'Quais fontes usam Loggi, Shopee, iFood e plataformas B2B de logística em seus sites e apps? iFood lidera o delivery.';
  assert.deepEqual(nomesNaoInformados(gerado, MENSAGEM_DA_REGUA).sort(), ['Loggi', 'Shopee', 'iFood']);
  assert.deepEqual(nomesNaoInformados('Como a iHouseLog se compara?', MENSAGEM_DA_REGUA), [], 'a própria empresa está na mensagem');
});

test('a instrução da segunda tentativa: os nomes, e pedir a categoria', () => {
  const t = instrucaoSemNomes(['Loggi', 'Nestio']);
  assert.match(t, /citou empresas que esta mensagem não traz: Loggi, Nestio/);
  assert.match(t, /descreva o TIPO de empresa/);
  assert.match(t, /quem escolhe as empresas é a pesquisa, com fonte/);
});

test('fica a proposta com MENOS nomes; empate ou falha, a primeira', () => {
  const com = { titulo: 'Tipografia', descricao: 'Quais fontes usam Loggi e Nestio?' };
  const sem = { titulo: 'Tipografia', descricao: 'Quais fontes usam as logtechs brasileiras?' };
  assert.deepEqual(escolherProposta(com, sem, MENSAGEM_DA_REGUA), { proposta: sem, trocou: true, nomesQueFicaram: [] });
  assert.equal(escolherProposta(com, com, MENSAGEM_DA_REGUA).trocou, false, 'empate: fica a primeira');
  assert.equal(escolherProposta(com, null, MENSAGEM_DA_REGUA).proposta, com, 'segunda falhou: fica a primeira');
});

test('a rota: refaz só em Pesquisa, antes da avaliação, com reserva própria, e cobra a segunda', () => {
  const rota = readFileSync(new URL('../src/rotas/gerar-tarefa.ts', import.meta.url), 'utf8');
  const refaz = rota.indexOf("if (proposta && tipo === 'pesquisa') {");
  const avalia = rota.indexOf('const ctxAvaliacao: ContextoAvaliacaoTarefa | null = proposta');
  assert.ok(refaz > 0 && refaz < avalia, 'a segunda tentativa tem de vir ANTES da avaliação — o JEV avalia a proposta final');
  const bloco = rota.slice(refaz, avalia);
  assert.match(bloco, /await reservar\(ctx\.usuarioId, teto, op, 'assistente'\)/);
  assert.match(bloco, /e instanceof SaldoInsuficiente/, 'sem saldo, a primeira proposta fica — sem erro');
  assert.match(rota, /await liberar\(ctx\.usuarioId, refeita\.teto, refeita\.op, 'assistente'\)/);
  assert.match(rota, /await consumir\(ctx\.usuarioId, emReais\(usd\), refeita\.op, 'assistente'\)/);
});
