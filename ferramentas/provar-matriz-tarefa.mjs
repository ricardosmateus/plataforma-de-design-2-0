/* Uso: node ferramentas/provar-matriz-tarefa.mjs [raiz do projeto]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: tarefa SWOT / Impacto × Esforço / Comparativa abre o board com a
   matriz vazia do modelo e sem "Pesquisar" (BOARD-MATRIZ-TAREFA). Usa o
   board.html e o js/board.js de verdade, com a API substituída. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const html = readFileSync(raiz + '/board.html', 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const boardJs = readFileSync(raiz + '/js/board.js', 'utf8');

async function abrir(tarefa, quadros) {
  const vc = new VirtualConsole();
  const erros = [];
  vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(String(e.message))) erros.push(e.message); });
  const dom = new JSDOM(html, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=' + tarefa.id, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const puts = [];
  w.API = {
    chamar(caminho, op = {}) {
      if (op.metodo === 'PUT' && /\/quadros$/.test(caminho)) { puts.push(op.corpo); return Promise.resolve({ quadros: (op.corpo && op.corpo.quadros) || [] }); }
      if (caminho === '/empresas') return Promise.resolve({ empresas: [{ id: 'e', nome: 'Empresa' }] });
      if (/\/empresas\/e\/projetos$/.test(caminho)) return Promise.resolve({ projetos: [{ id: 'p', nome: 'Projeto' }] });
      if (/\/tarefas$/.test(caminho)) return Promise.resolve({ tarefas: [tarefa] });
      if (/\/quadros$/.test(caminho)) return Promise.resolve({ quadros });
      return Promise.resolve({});
    },
  };
  w.console.log = () => {}; w.console.info = () => {}; w.console.warn = () => {};
  await new Promise((r) => setTimeout(r, 30));
  w.eval(boardJs);
  await new Promise((r) => setTimeout(r, 2500));
  const d = w.document;
  const paineis = [...d.querySelectorAll('.ideas-panel')].map((p) => ({ tipo: p.dataset.tipo, modelo: p.dataset.modelo, colunas: [...p.querySelectorAll('.quadro-colunas .column .column-head')].map((h) => h.textContent.trim()) }));
  const ultimoPut = puts[puts.length - 1];
  return { paineis, puts, ultimoPut, pesquisarVisivel: !d.getElementById('btnGerarIA').hidden, erros };
}

let f = 0;
const ok = (nome, cond, extra = '') => { console.log((cond ? 'ok     ' : 'FALHOU ') + nome + (cond ? '' : '  ' + extra)); if (!cond) f++; };
const T = (tipo, status = 'pendente') => ({ id: 't1', titulo: 'Tarefa', descricao: 'Desc', status, tipo });
const temMatriz = (r, modelo) => r.paineis.some((p) => p.tipo === 'matriz' && p.modelo === modelo);
const gravouMatriz = (r, modelo) => !!r.ultimoPut && JSON.stringify(r.ultimoPut).includes('"modelo":"' + modelo + '"');

let r = await abrir(T('swot'), []);
ok('SWOT vazia: a matriz SWOT aparece', temMatriz(r, 'swot'), JSON.stringify(r.paineis) + ' ' + r.erros.slice(0, 2).join(' | '));
ok('SWOT vazia: quatro quadrantes com os títulos do modelo', JSON.stringify((r.paineis.find((p) => p.modelo === 'swot') || {}).colunas || []).includes('Forças'), JSON.stringify(r.paineis));
ok('SWOT vazia: a matriz é GRAVADA (PUT com modelo swot)', gravouMatriz(r, 'swot'), 'puts=' + r.puts.length);
ok('SWOT: "Pesquisar" não aparece', !r.pesquisarVisivel);

r = await abrir(T('impacto_esforco'), []);
ok('Impacto × Esforço vazia: matriz do modelo, gravada', temMatriz(r, 'impacto_esforco') && gravouMatriz(r, 'impacto_esforco'));

r = await abrir(T('comparativa'), []);
const comp = r.paineis.find((p) => p.modelo === 'comparativa');
ok('Comparativa vazia: colunas "Empresa A" e "Empresa B", gravada', !!comp && comp.colunas.join('|').includes('Empresa A') && comp.colunas.join('|').includes('Empresa B') && gravouMatriz(r, 'comparativa'), JSON.stringify(r.paineis));

const gravada = [{ id: 'q1', tipo: 'matriz', modelo: 'swot', titulo: 'Matriz SWOT', colunas: [{ titulo: 'Forças', registros: [{ id: 'r1', titulo: 'Marca forte', descricao: '' }] }, { titulo: 'Fraquezas', registros: [] }, { titulo: 'Oportunidades', registros: [] }, { titulo: 'Ameaças', registros: [] }] }];
r = await abrir(T('swot'), gravada);
ok('SWOT já preenchida: NÃO cria outra matriz por cima', r.paineis.filter((p) => p.tipo === 'matriz').length === 1 && r.puts.length === 0, 'matrizes=' + r.paineis.filter((p) => p.tipo === 'matriz').length + ' puts=' + r.puts.length);

r = await abrir(T('swot', 'concluida'), []);
ok('SWOT concluída e vazia: não cria nem grava nada', !temMatriz(r, 'swot') && r.puts.length === 0);

r = await abrir(T('pesquisa'), []);
ok('Pesquisa: nada muda — sem matriz, "Pesquisar" visível', r.paineis.filter((p) => p.tipo === 'matriz').length === 0 && r.pesquisarVisivel);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
