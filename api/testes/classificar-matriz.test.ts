/* MATRIZ-IA — o que vai ao modelo e o que se aceita de volta, sem rede. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarMensagemMatriz,
  interpretarMatriz,
  completarComTarefas,
  EXTRAS_MAX,
} from '../src/ia/classificar-matriz.js';

const tarefas = [
  { titulo: 'Pesquisar os logotipos dos concorrentes', descricao: 'Quais logotipos usam Loggi e Clique Retire?', tipo: 'referencias_visuais', status: 'concluida' },
  { titulo: 'Buscar o manual de marca dos concorrentes', descricao: '', tipo: 'pesquisa', status: 'pendente' },
  { titulo: 'Validar com os nossos usuários', descricao: 'Entrevistar síndicos.', tipo: 'pesquisa', status: 'pendente' },
];

test('mensagem: projeto, atividade e as tarefas numeradas com tipo e status', () => {
  const m = montarMensagemMatriz({
    empresaNome: 'iHouseLog', empresaDescricao: 'Lockers.', projetoNome: 'Identidade Visual',
    atividadeTitulo: 'Logotipo', atividadeDescricao: null, tarefas, conhecimento: null, jaNaMatriz: ['Cor da marca'],
  });
  assert.match(m, /Projeto: Identidade Visual/);
  assert.match(m, /Atividade: Logotipo/);
  assert.match(m, /1\. \[Referência, concluída\] Pesquisar os logotipos dos concorrentes/);
  assert.match(m, /2\. \[Pesquisa, pendente\] Buscar o manual de marca/);
  assert.match(m, /Já está na matriz \(não repita\):\n- Cor da marca/);
});

test('interpretar: coluna por nome solto, uma tarefa = um card, extras com teto', () => {
  const bruto = JSON.stringify({ cards: [
    { tarefa: 1, coluna: 'Certeza', titulo: 'Logotipos dos concorrentes', descricao: 'Já levantados.' },
    { tarefa: 1, coluna: 'duvida', titulo: 'Repetido', descricao: 'x' },
    { tarefa: 2, coluna: 'dúvidas', titulo: 'Manual de marca', descricao: 'Ainda não achado.' },
    { tarefa: null, coluna: 'suposição', titulo: 'Síndicos preferem marca sóbria', descricao: 'Hipótese.' },
    ...Array.from({ length: 5 }, (_, i) => ({ tarefa: null, coluna: 'duvida', titulo: `Extra ${i}`, descricao: '' })),
    { tarefa: 9, coluna: 'certeza', titulo: 'Tarefa que não existe', descricao: '' },
    { coluna: 'outra', titulo: 'Coluna inválida' },
  ] });
  const c = interpretarMatriz(bruto, 3);
  assert.equal(c.filter((x) => x.tarefa === 1).length, 1);
  assert.equal(c[0]?.coluna, 'certeza');
  assert.equal(c.find((x) => x.tarefa === 2)?.coluna, 'duvida');
  assert.equal(c.find((x) => x.titulo.startsWith('Síndicos'))?.coluna, 'suposicao');
  assert.equal(c.filter((x) => x.tarefa === null).length, EXTRAS_MAX, 'extras param no teto (tarefa inexistente conta como extra)');
  assert.ok(!c.some((x) => x.titulo === 'Coluna inválida'));
});

test('completar: toda tarefa da atividade aparece, e nada do que já está na matriz repete', () => {
  const doModelo = [{ titulo: 'Logotipos dos concorrentes', descricao: 'ok', coluna: 'certeza' as const, tarefa: 1 }];
  const c = completarComTarefas(doModelo, tarefas, ['Validar com os nossos usuários']);
  const titulos = c.map((x) => x.titulo);
  assert.ok(titulos.includes('Logotipos dos concorrentes'));
  assert.ok(titulos.includes('Buscar o manual de marca dos concorrentes'), 'a esquecida entra');
  assert.equal(c.find((x) => x.tarefa === 2)?.coluna, 'duvida', 'pendente esquecida vai para Dúvidas');
  assert.ok(!titulos.includes('Validar com os nossos usuários'), 'o que já está na matriz não repete');
});

test('interpretar: resposta que não é JSON devolve lista vazia', () => {
  assert.deepEqual(interpretarMatriz('desculpe, não consigo', 3), []);
});
