/* Uso: node ferramentas/provar-conversa.mjs [raiz do projeto]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: "Conversa com usuários" (ATV-TAR-CRIA-011, BOARD-CONVERSA-001
   a 003), fase E1, no board.html, js/board.js e atividade.html de
   verdade. A API e o AtividadeAcoes são substituídos. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const semExternos = (h) => h.replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const boardHtml = semExternos(readFileSync(raiz + '/board.html', 'utf8'));
const boardJs = readFileSync(raiz + '/js/board.js', 'utf8');
const atividadeHtml = semExternos(readFileSync(raiz + '/atividade.html', 'utf8'));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };

async function abrirBoard(tarefa, quadros) {
  const dom = new JSDOM(boardHtml, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=' + tarefa.id, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; const puts = [];
  w.API = { chamar(c, op = {}) {
    if (op.metodo === 'PUT' && /\/quadros$/.test(c)) { puts.push(op.corpo); return Promise.resolve({ quadros: (op.corpo && op.corpo.quadros) || [] }); }
    if (c === '/empresas') return Promise.resolve({ empresas: [{ id: 'e', nome: 'E' }] });
    if (/\/empresas\/e\/projetos$/.test(c)) return Promise.resolve({ projetos: [{ id: 'p', nome: 'P' }] });
    if (/\/tarefas$/.test(c)) return Promise.resolve({ tarefas: [tarefa] });
    if (/\/quadros$/.test(c)) return Promise.resolve({ quadros });
    return Promise.resolve({});
  } };
  w.console.log = () => {}; w.console.warn = () => {};
  await espera(30); w.eval(boardJs); await espera(2500);
  const d = w.document;
  const paineis = [...d.querySelectorAll('.ideas-panel')].map((p) => ({ titulo: (p.querySelector('.ideas-title') || {}).textContent, tipo: p.dataset.tipo, aviso: !!p.querySelector('.conversa-aviso') }));
  return { d, paineis, puts, pesquisarVisivel: !d.getElementById('btnGerarIA').hidden };
}
const T = (tipo, status = 'pendente') => ({ id: 't1', titulo: 'Por que evitam o armário', descricao: 'Entender por que moradores evitam o armário', status, tipo });

let r = await abrirBoard(T('conversa_usuarios'), []);
const roteiro = r.paineis.find((p) => p.titulo === 'Roteiro');
const ouvimos = r.paineis.find((p) => p.titulo === 'O que ouvimos');
ok('board vazio: nasce o "Roteiro" (documento)', !!roteiro && roteiro.tipo === 'documento', JSON.stringify(r.paineis));
ok('board vazio: nasce "O que ouvimos" (post-its)', !!ouvimos && ouvimos.tipo !== 'documento', JSON.stringify(r.paineis));
ok('o "Roteiro" vem com o esqueleto (Objetivo, Com quem conversar, Perguntas, O que evitar)',
  /Objetivo[\s\S]*Com quem conversar[\s\S]*Perguntas[\s\S]*O que evitar/.test((r.d.querySelector('.ideas-panel--doc .doc-corpo') || {}).textContent || ''));
ok('os dois quadros são GRAVADOS', !!r.puts.at(-1) && /"Roteiro"/.test(JSON.stringify(r.puts.at(-1))) && /"O que ouvimos"/.test(JSON.stringify(r.puts.at(-1))), `puts=${r.puts.length}`);
ok('sem "Pesquisar": o que se busca aqui não está na web', !r.pesquisarVisivel);
ok('o aviso de dados pessoais aparece em "O que ouvimos"', !!ouvimos && ouvimos.aviso && /sem nome, apartamento ou contato/.test(r.d.querySelector('.conversa-aviso').textContent));

r = await abrirBoard(T('conversa_usuarios'), [
  { id: 'q1', tipo: 'documento', titulo: 'Roteiro', colunas: [{ titulo: '', registros: [{ id: 'r1', titulo: '', descricao: 'Objetivo: entender o medo de perder a encomenda.' }] }] },
  { id: 'q2', tipo: 'postits', titulo: 'O que ouvimos', colunas: [{ titulo: '', registros: [{ id: 'r2', titulo: 'Medo de não achar a encomenda', descricao: 'Moradora, 3ª entrevista' }] }] },
]);
ok('board já preenchido: nada é criado nem gravado por cima', r.paineis.length === 2 && r.puts.length === 0, `paineis=${r.paineis.length} puts=${r.puts.length}`);
ok('…e o aviso volta a cada carga (ele não é gravado)', r.paineis.find((p) => p.titulo === 'O que ouvimos').aviso);

r = await abrirBoard(T('conversa_usuarios', 'concluida'), []);
ok('tarefa concluída e vazia: não cria nem grava nada', r.paineis.length === 0 && r.puts.length === 0);

r = await abrirBoard(T('pesquisa'), []);
ok('Pesquisa: nada muda — sem os quadros da conversa, "Pesquisar" visível', r.paineis.length === 0 && r.pesquisarVisivel);

/* ---- O modal ---- */
const dom = new JSDOM(atividadeHtml, { url: 'https://app.test/atividade?empresa=e&projeto=p&ideia=i', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window; const d = w.document; const $ = (id) => d.getElementById(id);
if (!w.HTMLDialogElement.prototype.showModal) { w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; }; }
const enviados = []; const sugestoes = [];
w.AtividadeAcoes = {
  criar: (t, dsc, tipo) => { enviados.push({ t, dsc, tipo }); return Promise.resolve({ id: 'x' }); },
  esclarecer: (tipo) => { sugestoes.push(tipo); return Promise.resolve({ descricao: 'x' }); },
};
await espera(30);
w.openTaskModal();
const botao = d.querySelector('#taskTipoLateral [data-tipo="conversa_usuarios"]');
ok('modal: "Conversa com usuários" na lateral', !!botao && botao.textContent.trim() === 'Conversa com usuários');
botao.click();
ok('modal: pede título e descrição', !$('taskTitleField').hidden && !$('taskDescField').hidden && $('taskTitleLabel').textContent === 'Título da conversa');
ok('modal: sem "Gerar com ajuda da IA" na E1', $('generateWithAIBtn').hidden);
$('taskDesc').value = 'Concorrentes'; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true }));
ok('modal: sem o "Deixar mais clara com IA" na E1, mesmo com descrição vaga', $('taskEsclarecer').hidden && $('taskEsclarecerBtn').hidden);
$('taskTitle').value = 'Por que evitam o armário';
$('taskDesc').value = 'Entender por que moradores evitam o armário de coleta, falando com quem já recebeu encomenda nele.';
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
await espera(10);
ok('modal: salvar envia o tipo conversa_usuarios, com o título e a descrição', JSON.stringify(enviados.at(-1)) === JSON.stringify({ t: 'Por que evitam o armário', dsc: 'Entender por que moradores evitam o armário de coleta, falando com quem já recebeu encomenda nele.', tipo: 'conversa_usuarios' }), JSON.stringify(enviados.at(-1)));
w.definirTipoTarefa('pesquisa');
$('taskDesc').value = 'Concorrentes'; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true }));
ok('a Pesquisa continua com o "Deixar mais clara com IA"', !$('taskEsclarecerBtn').hidden);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
