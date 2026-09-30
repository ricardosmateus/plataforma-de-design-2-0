/* Uso: node ferramentas/provar-gerar-fica.mjs [arquivo]  — sem arquivo, prova js/orquestrador-gateway.js.
   Contraprova de 30/09/2026: contra o gateway anterior, falham exatamente
   Pesquisa, Matriz (navegavam sozinhas), Erro 503 e Erro de rede (erro escondido). */
/* Prova: "Gerar com ajuda da IA" só cria e fica na atividade (ATV-GERAR-021);
   o erro aparece dentro do modal (ATV-GERAR-022). Roda contra o arquivo passado. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const arquivo = process.argv[2] || new URL('../js/orquestrador-gateway.js', import.meta.url).pathname;
const codigo = readFileSync(arquivo, 'utf8');

const HTML = `<!doctype html><body>
<dialog id="taskModal"><form id="taskForm">
  <input id="taskTitle"><textarea id="taskDesc"></textarea><input type="hidden" id="taskTipo" value="pesquisa">
  <div id="taskTipoLateral"><button type="button">Pesquisa</button></div>
  <p class="np-gerando" id="taskGerandoAviso" role="status" hidden></p>
  <button type="submit">Salvar</button><button type="button" id="generateWithAIBtn">Gerar com ajuda da IA</button>
</form></dialog><div id="lista"></div></body>`;

async function cenario(nome, resposta, verificar) {
  const navegou = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e.message))) navegou.push(e.message); else if (process.env.DEBUG) console.log('  [jsdomError]', e.message, e.detail && e.detail.stack ? e.detail.stack.split('\n').slice(0,3).join(' | ') : ''); });
  const dom = new JSDOM(HTML, { url: 'https://app.test/atividade?empresa=e&projeto=p&ideia=i', runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const toasts = []; let fechou = 0;
  w.mostrarMensagemAtividade = (m) => toasts.push(m);
  w.closeTaskModal = () => { fechou++; w.document.getElementById('taskModal').close(); };
  w.AtividadeAcoes = {
    gerar: () => resposta(),
    urlDoBoard: (id) => 'https://app.test/board?tarefa=' + id,
    urlDaMatriz: (id) => 'https://app.test/matriz?tarefa=' + id,
  };
  w.console.log = (...a) => process.env.DEBUG && console.log('  [pagina]', ...a); w.console.info = () => {}; w.console.error = (...a) => process.env.DEBUG && console.log('  [erro]', ...a);
  w.document.getElementById('taskModal').showModal();
  w.eval(codigo);
  /* O gateway se conecta no DOMContentLoaded e CLONA o botão: clicar
     antes disso acerta o nó antigo, que já não tem o ouvinte. */
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await new Promise((r) => setTimeout(r, 0));
  w.document.getElementById('generateWithAIBtn').click();
  await new Promise((r) => setTimeout(r, 20));
  const aviso = w.document.getElementById('taskGerandoAviso');
  const estado = {
    navegou: navegou.length > 0, fechou, toasts,
    avisoVisivel: !aviso.hidden, avisoErro: aviso.hasAttribute('data-erro'), avisoTexto: aviso.textContent,
    modalAberto: w.document.getElementById('taskModal').open, w,
  };
  const falhas = verificar(estado);
  console.log((falhas.length ? 'FALHOU ' : 'ok     ') + nome + (falhas.length ? '  → ' + falhas.join('; ') : ''));
  return falhas.length;
}

const ok = (id, titulo, proximo, extra = {}) => () => Promise.resolve({ tarefa: { id, titulo }, proximo, ...extra });
const erro = (e) => () => Promise.reject(e);
let f = 0;
const chk = (conds) => Object.entries(conds).filter(([, v]) => !v).map(([k]) => k);

f += await cenario('Pesquisa: cria, fecha o modal e NÃO navega', ok('t1', 'Levantar concorrentes', 'pesquisar'),
  (s) => chk({ 'não navegou': !s.navegou, 'fechou o modal': s.fechou === 1, 'toast com o título': s.toasts.some((t) => t.includes('Levantar concorrentes')) }));
f += await cenario('Matriz CSD: cria, fecha o modal e NÃO navega', ok('t2', 'Organizar o que se sabe', 'classificar'),
  (s) => chk({ 'não navegou': !s.navegou, 'fechou o modal': s.fechou === 1 }));
f += await cenario('Referência: cria, fecha e mostra o resumo', ok('t3', 'Referências', 'abrir', { referencias: { sites: 2, imagens: 1, documentos: 0 } }),
  (s) => chk({ 'não navegou': !s.navegou, 'resumo das referências': s.toasts.some((t) => t.includes('2 sites')) }));
f += await cenario('Erro 503: a mensagem do servidor aparece DENTRO do modal', erro({ status: 503, dados: { mensagem: 'Não foi possível gerar a tarefa agora. Tente de novo em instantes.' } }),
  (s) => chk({ 'modal continua aberto': s.modalAberto, 'aviso visível': s.avisoVisivel, 'aviso marcado como erro': s.avisoErro, 'texto do servidor': s.avisoTexto.includes('em instantes') }));
f += await cenario('Erro de rede: mensagem de conexão dentro do modal', erro({ rede: true }),
  (s) => chk({ 'aviso visível': s.avisoVisivel, 'texto de conexão': s.avisoTexto.includes('conexão') }));
f += await cenario('Fechar o modal limpa o erro', erro({ dados: { mensagem: 'falhou' } }),
  (s) => { s.w.document.getElementById('taskModal').close(); const a = s.w.document.getElementById('taskGerandoAviso');
           return chk({ 'aviso escondido': a.hidden, 'sem marca de erro': !a.hasAttribute('data-erro') }); });
console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
