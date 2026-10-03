/* Uso: node ferramentas/provar-leitura-quadros.mjs [raiz do projeto]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: BOARD-LEITURA-008 (02/10/2026). Tarefa concluída MOSTRA os
   quadros gravados — inclusive os de documento, que são os da pesquisa.
   O defeito: o carregamento redesenhava documentos pela função que cria
   quadro NOVO, e ela recusa em tarefa concluída. A pessoa via o board
   vazio, com 8 quadros no banco. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const boardHtml = readFileSync(raiz + '/board.html', 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const boardJs = readFileSync(raiz + '/js/board.js', 'utf8');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };

/* Os quadros como a pesquisa os grava (títulos do caso real de 02/10). */
const doc = (id, titulo, texto) => ({ id, tipo: 'documento', titulo, colunas: [{ titulo: '', registros: [{ id: id + 'r', titulo: '', descricao: texto }] }] });
const QUADROS = [
  doc('q1', 'Empresas encontradas', 'A Loggi opera pontos de coleta em capitais.'),
  doc('q2', '3. Diferenciais tecnológicos', 'Rastreio em tempo real e armários com QR code.'),
  doc('q3', 'Conclusão para sua decisão:', 'O mercado tem espaço para um serviço focado em condomínios.'),
  { id: 'q4', tipo: 'postits', titulo: 'Perguntas em aberto', colunas: [{ titulo: '', registros: [{ id: 'r4', titulo: 'Quanto a Loggi cobra?', descricao: 'Responda aqui...' }] }] },
];

async function abrir(status) {
  const dom = new JSDOM(boardHtml, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=t1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; const puts = [];
  w.API = { chamar(c, op = {}) {
    if (op.metodo === 'PUT' && /\/quadros$/.test(c)) { puts.push(op.corpo); return Promise.resolve({ quadros: (op.corpo && op.corpo.quadros) || [] }); }
    if (op.metodo === 'PATCH' || op.metodo === 'PUT') return Promise.resolve({ tarefa: { id: 't1', status: 'pendente' } });
    if (c === '/empresas') return Promise.resolve({ empresas: [{ id: 'e', nome: 'E' }] });
    if (/\/empresas\/e\/projetos$/.test(c)) return Promise.resolve({ projetos: [{ id: 'p', nome: 'P' }] });
    if (/\/tarefas$/.test(c)) return Promise.resolve({ tarefas: [{ id: 't1', titulo: 'Concorrentes', descricao: 'Quais empresas…', status, tipo: 'pesquisa' }] });
    if (/\/quadros$/.test(c)) return Promise.resolve({ quadros: QUADROS });
    return Promise.resolve({});
  } };
  w.console.log = () => {}; w.console.warn = () => {};
  await espera(30); w.eval(boardJs); await espera(2500);
  const d = w.document;
  return {
    w, d, puts,
    titulos: [...d.querySelectorAll('#canvasStage .ideas-panel')].map((p) => (p.querySelector('.ideas-title') || {}).textContent),
    docs: [...d.querySelectorAll('#canvasStage .doc-corpo')],
  };
}

let r = await abrir('concluida');
ok('tarefa concluída: os 4 quadros gravados aparecem (3 documentos e 1 de post-its)', r.titulos.length === 4, JSON.stringify(r.titulos));
ok('…com o texto de cada documento', r.docs.length === 3 && /A Loggi opera pontos de coleta/.test(r.docs[0].textContent), r.docs.map((x) => x.textContent).join(' | '));
ok('…e o texto NÃO é editável (nada é gravado em tarefa concluída)', r.docs.every((x) => x.getAttribute('contenteditable') === 'false'));
ok('…e abrir não grava nada', r.puts.length === 0, `${r.puts.length} PUT`);
ok('a trava de quadro NOVO continua: criar um resultado em tarefa concluída é recusado', r.w.criarQuadroResultado('Novo', [{ titulo: 'x', descricao: 'y' }]) === null && r.d.querySelectorAll('#canvasStage .ideas-panel').length === 4);

r.d.getElementById('confirmReopenBtn').click();
await espera(100);
ok('"Reabrir tarefa": o texto dos documentos volta a ser editável', r.docs.every((x) => x.getAttribute('contenteditable') === 'true'));

r = await abrir('pendente');
ok('tarefa pendente: os mesmos 4 quadros, com o texto editável', r.titulos.length === 4 && r.docs.every((x) => x.getAttribute('contenteditable') === 'true'));

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
