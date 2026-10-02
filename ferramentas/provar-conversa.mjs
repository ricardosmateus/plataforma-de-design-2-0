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

const ROTEIRO_DA_IA = 'Objetivo\nEntender o medo de perder a encomenda.\n\nCom quem conversar\nMoradores.\n\nPerguntas\n1. Como é a sua rotina?\n\nO que evitar\nIndução.';
async function abrirBoard(tarefa, quadros, opcoes = {}) {
  const dom = new JSDOM(boardHtml, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=' + tarefa.id, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; const puts = []; const posts = []; const mensagens = []; const confirmacoes = [];
  w.confirm = (m) => { confirmacoes.push(m); return !!opcoes.confirmar; };
  w.API = { chamar(c, op = {}) {
    if (op.metodo === 'POST' && /\/roteiro$/.test(c)) { posts.push(c); return opcoes.erroRoteiro ? Promise.reject(Object.assign(new Error('402'), { status: 402, dados: { mensagem: 'Saldo insuficiente para montar o roteiro.' } })) : Promise.resolve({ texto: ROTEIRO_DA_IA }); }
    if (op.metodo === 'PUT' && /\/quadros$/.test(c)) { puts.push(op.corpo); return Promise.resolve({ quadros: (op.corpo && op.corpo.quadros) || [] }); }
    if (c === '/empresas') return Promise.resolve({ empresas: [{ id: 'e', nome: 'E' }] });
    if (/\/empresas\/e\/projetos$/.test(c)) return Promise.resolve({ projetos: [{ id: 'p', nome: 'P' }] });
    if (/\/tarefas$/.test(c)) return Promise.resolve({ tarefas: [tarefa] });
    if (/\/quadros$/.test(c)) return Promise.resolve({ quadros });
    return Promise.resolve({});
  } };
  w.console.log = () => {}; w.console.warn = () => {};
  await espera(30);
  const mostrar = w.mostrarMensagem;
  w.mostrarMensagem = (m, t) => { mensagens.push([m, t]); if (mostrar) try { mostrar(m, t); } catch {} };
  w.eval(boardJs); await espera(2500);
  const d = w.document;
  const paineis = [...d.querySelectorAll('.ideas-panel')].map((p) => ({ titulo: (p.querySelector('.ideas-title') || {}).textContent, tipo: p.dataset.tipo, aviso: !!p.querySelector('.conversa-aviso') }));
  return { w, d, paineis, puts, posts, mensagens, confirmacoes, pesquisarVisivel: !d.getElementById('btnGerarIA').hidden,
    montarVisivel: !!d.getElementById('btnMontarRoteiro') && !d.getElementById('btnMontarRoteiro').hidden,
    corpoRoteiro: () => ((d.querySelector('.ideas-panel--doc .doc-corpo') || {}).textContent || '') };
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
ok('Pesquisa: sem o "Montar roteiro com IA"', !r.montarVisivel);

/* ---- E2: "Montar roteiro com IA" (BOARD-CONVERSA-004) ---- */
r = await abrirBoard(T('conversa_usuarios'), []);
ok('E2: "Montar roteiro com IA" aparece no lugar do "Pesquisar"', r.montarVisivel && !r.pesquisarVisivel);
let antes = r.puts.length;
r.d.getElementById('btnMontarRoteiro').click();
ok('E2: com o esqueleto intacto, não pergunta nada', r.confirmacoes.length === 0);
ok('E2: enquanto monta, "Montando roteiro…" e desativado', r.d.getElementById('btnMontarRoteiroLabel').textContent === 'Montando roteiro…' && r.d.getElementById('btnMontarRoteiro').disabled);
const bt = r.d.getElementById('btnMontarRoteiro');
ok('E2: o MESMO carregamento do "Pesquisar" — `is-pesquisando`, os dois ícones, aria-busy',
  bt.classList.contains('is-pesquisando') && !!bt.querySelector('svg.icon-busca') && !!bt.querySelector('svg.icon-girando') && bt.getAttribute('aria-busy') === 'true');
await espera(60);
ok('E2: chama a rota do roteiro da tarefa', r.posts.length === 1 && /\/tarefas\/t1\/roteiro$/.test(r.posts[0]), JSON.stringify(r.posts));
ok('E2: o roteiro da IA vai para o quadro "Roteiro"', r.corpoRoteiro() === ROTEIRO_DA_IA, r.corpoRoteiro().slice(0, 60));
ok('E2: …e é GRAVADO', r.puts.length > antes && JSON.stringify(r.puts.at(-1)).includes('Entender o medo de perder a encomenda'));
ok('E2: o botão volta ao normal — sem o carregamento', r.d.getElementById('btnMontarRoteiroLabel').textContent === 'Montar roteiro com IA' && !r.d.getElementById('btnMontarRoteiro').disabled && !r.d.getElementById('btnMontarRoteiro').classList.contains('is-pesquisando') && r.d.getElementById('btnMontarRoteiro').getAttribute('aria-busy') === 'false');

r = await abrirBoard(T('conversa_usuarios'), [
  { id: 'q1', tipo: 'documento', titulo: 'Roteiro', colunas: [{ titulo: '', registros: [{ id: 'r1', titulo: '', descricao: 'Meu roteiro, escrito à mão.' }] }] },
], { confirmar: false });
r.d.getElementById('btnMontarRoteiro').click();
await espera(60);
ok('E2: roteiro já editado — pergunta antes; "Cancelar" não chama nem substitui', r.confirmacoes.length === 1 && r.posts.length === 0 && r.corpoRoteiro() === 'Meu roteiro, escrito à mão.', `${r.confirmacoes.length} ${r.posts.length} ${r.corpoRoteiro()}`);

r = await abrirBoard(T('conversa_usuarios'), [], { erroRoteiro: true });
r.d.getElementById('btnMontarRoteiro').click();
await espera(60);
ok('E2: no erro, o carregamento também para', !r.d.getElementById('btnMontarRoteiro').classList.contains('is-pesquisando') && !r.d.getElementById('btnMontarRoteiro').disabled);
ok('E2: erro do servidor vira aviso de erro, e o roteiro não muda', r.mensagens.some(([m, t]) => t === 'erro' && /Saldo insuficiente/.test(m)) && /O que queremos aprender/.test(r.corpoRoteiro()), JSON.stringify(r.mensagens));

r = await abrirBoard(T('conversa_usuarios', 'concluida'), []);
ok('E2: tarefa concluída — sem o "Montar roteiro com IA"', !r.montarVisivel);

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
ok('modal (E3): com "Gerar com ajuda da IA"', !$('generateWithAIBtn').hidden);
$('taskDesc').value = 'Concorrentes'; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true }));
ok('modal (E3): descrição vaga — "Deixar mais clara com IA" no lugar do "Gerar"', !$('taskEsclarecer').hidden && !$('taskEsclarecerBtn').hidden && $('generateWithAIBtn').hidden);
$('taskEsclarecerBtn').click();
await espera(10);
ok('modal (E3): o esclarecer vai com o tipo conversa_usuarios', sugestoes.at(-1) === 'conversa_usuarios', JSON.stringify(sugestoes));
$('taskTitle').value = 'Por que evitam o armário';
$('taskDesc').value = 'Entender por que moradores evitam o armário de coleta, falando com quem já recebeu encomenda nele.';
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
await espera(10);
ok('modal: salvar envia o tipo conversa_usuarios, com o título e a descrição', JSON.stringify(enviados.at(-1)) === JSON.stringify({ t: 'Por que evitam o armário', dsc: 'Entender por que moradores evitam o armário de coleta, falando com quem já recebeu encomenda nele.', tipo: 'conversa_usuarios' }), JSON.stringify(enviados.at(-1)));
w.definirTipoTarefa('pesquisa');
$('taskDesc').value = 'Concorrentes'; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true }));
ok('a Pesquisa continua com o "Deixar mais clara com IA"', !$('taskEsclarecerBtn').hidden);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
