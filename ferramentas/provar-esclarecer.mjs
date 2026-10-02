/* Uso: node ferramentas/provar-esclarecer.mjs [raiz do projeto]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: "Deixar mais clara com IA" (ATV-TAR-CRIA-010) no atividade.html
   de verdade, com o AtividadeAcoes substituído. Usa os mesmos casos de
   vagueza do teste do servidor (api/testes/esclarecer-tarefa.test.ts). */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const html = readFileSync(raiz + '/atividade.html', 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const CASOS = [
  ['Concorrentes', true], ['Preço', true], ['Pesquisar outras logitechs que atuam aqui no brasil.', true],
  ['Mapear barreiras do morador para usar armários de coleta em condomínios', true],
  ['Quantas lojas físicas a Centauro tem no Brasil?', false],
  ['O que se sabe, com fonte, sobre Pergunta 2: Logotipos atuais das logtechs brasileiras?', false],
  ['Quais são as razões pelas quais moradores de condomínios residenciais verticais no Sudeste recusam ou evitam usar armários inteligentes para receber encomendas? Para definir como comunicar o serviço.', false],
  ['', false],
];

const vc = new VirtualConsole();
const dom = new JSDOM(html, { url: 'https://app.test/atividade?empresa=e&projeto=p&ideia=i', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window; const d = w.document;
if (!w.HTMLDialogElement.prototype.showModal) { w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; }; }
const chamadas = [];
let resposta = { titulo: 'Concorrentes', descricao: 'Quais empresas no Brasil operam pontos de coleta em condomínios residenciais (concorrentes diretos) e quais marketplaces têm retirada própria (indiretos)? Para mapear com quem a iHouseLog disputa o e-commerce.' };
let falhar = false;
w.AtividadeAcoes = { esclarecer: (tipo, titulo, descricao) => { chamadas.push({ tipo, titulo, descricao }); return falhar ? Promise.reject(new Error('Saldo insuficiente para sugerir.')) : Promise.resolve(resposta); } };
await espera(30);

if (!d.getElementById('taskEsclarecer')) {
  console.log('FALHOU o convite "Deixar mais clara com IA" não existe neste atividade.html');
  console.log('\n1 falha(s)');
  process.exit(1);
}
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };
const $ = (id) => d.getElementById(id);
const digitar = (t) => { $('taskDesc').value = t; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true })); };
w.openTaskModal();

for (const [t, vaga] of CASOS) {
  digitar(t);
  ok(`convite ${vaga ? 'aparece' : 'não aparece'}: ${JSON.stringify(t).slice(0, 50)}`, $('taskEsclarecer').hidden === !vaga);
}

$('taskTitle').value = 'Concorrentes';
digitar('Concorrentes');
$('taskEsclarecerBtn').click();
await espera(20);
ok('clique: chama o servidor com o tipo, o título e a descrição da pessoa', JSON.stringify(chamadas.at(-1)) === JSON.stringify({ tipo: 'pesquisa', titulo: 'Concorrentes', descricao: 'Concorrentes' }), JSON.stringify(chamadas.at(-1)));
ok('a sugestão aparece AO LADO; o texto da pessoa continua o dela', !$('taskSugestao').hidden && $('taskSugestaoTexto').textContent === resposta.descricao && $('taskDesc').value === 'Concorrentes');

$('taskSugestaoUsar').click();
ok('"Usar esta": a descrição passa a ser a sugestão, e o convite some (já não é vaga)', $('taskDesc').value === resposta.descricao && $('taskEsclarecer').hidden);

digitar('Preço');
$('taskEsclarecerBtn').click();
await espera(20);
$('taskSugestaoManter').click();
ok('"Manter a minha": o texto não muda e o convite some para este texto', $('taskDesc').value === 'Preço' && $('taskEsclarecer').hidden);
digitar('Preço de entrega');
ok('…e volta quando a pessoa muda a descrição', !$('taskEsclarecer').hidden);

falhar = true;
$('taskEsclarecerBtn').click();
await espera(20);
ok('erro do servidor aparece DENTRO do modal, e o botão volta', !$('taskEsclarecerErro').hidden && /Saldo insuficiente/.test($('taskEsclarecerErro').textContent) && !$('taskEsclarecerBtn').disabled);
falhar = false;

w.definirTipoTarefa('matriz_csd');
ok('tipo sem descrição (Matriz CSD): o convite não aparece', $('taskEsclarecer').hidden);
w.definirTipoTarefa('pesquisa');
digitar('Concorrentes');
const antes = chamadas.length;
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
ok('salvar sem usar a sugestão: nenhuma chamada a mais, nada perguntado', chamadas.length === antes);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
