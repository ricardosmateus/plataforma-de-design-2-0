/* Uso: node ferramentas/provar-esclarecer.mjs [raiz do projeto]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: "Deixar mais clara com IA" (ATV-TAR-CRIA-010) no atividade.html
   de verdade, com o AtividadeAcoes substituído. Desenho de 01/10/2026
   (Ricardo): o botão fica no rodapé, no lugar do "Gerar com ajuda da
   IA", e a sugestão entra direto na descrição. Os casos de vagueza são
   os do teste do servidor (api/testes/esclarecer-tarefa.test.ts). */
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
const SUGESTAO = 'Quais empresas no Brasil operam pontos de coleta em condomínios residenciais (concorrentes diretos) e quais marketplaces têm retirada própria (indiretos)? Para mapear com quem a iHouseLog disputa o e-commerce.';
let falhar = false;
w.AtividadeAcoes = { esclarecer: (tipo, titulo, descricao) => { chamadas.push({ tipo, titulo, descricao }); return falhar ? Promise.reject(new Error('Saldo insuficiente para sugerir.')) : Promise.resolve({ titulo, descricao: SUGESTAO }); } };
await espera(30);

const $ = (id) => d.getElementById(id);
if (!$('taskEsclarecerBtn') || !$('taskEsclarecerBtn').closest('.modal-footer')) {
  console.log('FALHOU o "Deixar mais clara com IA" não está no rodapé do modal deste atividade.html');
  console.log('\n1 falha(s)');
  process.exit(1);
}
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };
const digitar = (t) => { $('taskDesc').value = t; $('taskDesc').dispatchEvent(new w.Event('input', { bubbles: true })); };
const gerar = () => $('generateWithAIBtn');
w.openTaskModal();

for (const [t, vaga] of CASOS) {
  digitar(t);
  const certo = $('taskEsclarecer').hidden === !vaga && $('taskEsclarecerBtn').hidden === !vaga && gerar().hidden === vaga;
  ok(`${vaga ? 'vaga: aviso + "Deixar mais clara" no lugar do "Gerar"' : 'não vaga: "Gerar com ajuda da IA", sem aviso'} — ${JSON.stringify(t).slice(0, 44)}`, certo,
    `aviso ${!$('taskEsclarecer').hidden}, esclarecer ${!$('taskEsclarecerBtn').hidden}, gerar ${!gerar().hidden}`);
}

ok('o botão é ghost, no rodapé, com o ícone de IA; não há mais caixa nem link sublinhado',
  $('taskEsclarecerBtn').className === 'btn btn--ghost' && !!$('taskEsclarecerBtn').querySelector('svg') &&
  !$('taskSugestao') && !d.querySelector('.link--sublinhado#taskEsclarecerBtn'));

$('taskTitle').value = 'Concorrentes';
digitar('Concorrentes');
$('taskEsclarecerBtn').click();
ok('enquanto sugere: "Sugerindo…", desativado', $('taskEsclarecerRotulo').textContent === 'Sugerindo…' && $('taskEsclarecerBtn').disabled);
await espera(20);
ok('clique: chama o servidor com o tipo, o título e a descrição da pessoa', JSON.stringify(chamadas.at(-1)) === JSON.stringify({ tipo: 'pesquisa', titulo: 'Concorrentes', descricao: 'Concorrentes' }), JSON.stringify(chamadas.at(-1)));
ok('a sugestão entra DIRETO na descrição', $('taskDesc').value === SUGESTAO);
ok('…e, já não vaga, o aviso some e o "Gerar com ajuda da IA" volta', $('taskEsclarecer').hidden && $('taskEsclarecerBtn').hidden && !gerar().hidden);

digitar('Preço');
falhar = true;
$('taskEsclarecerBtn').click();
await espera(20);
ok('erro do servidor aparece DENTRO do modal; a descrição não muda; o botão volta', !$('taskEsclarecerErro').hidden && /Saldo insuficiente/.test($('taskEsclarecerErro').textContent) && $('taskDesc').value === 'Preço' && !$('taskEsclarecerBtn').disabled && $('taskEsclarecerRotulo').textContent === 'Deixar mais clara com IA');
digitar('Preço de entrega');
ok('…e o erro some quando a pessoa mexe na descrição', $('taskEsclarecerErro').hidden);
falhar = false;

w.definirTipoTarefa('matriz_csd');
ok('tipo sem descrição (Matriz CSD): nem aviso, nem "Deixar mais clara", nem "Gerar"', $('taskEsclarecer').hidden && $('taskEsclarecerBtn').hidden && gerar().hidden);
w.definirTipoTarefa('pesquisa');
digitar('Concorrentes');
const antes = chamadas.length;
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
ok('salvar sem usar a sugestão: nenhuma chamada a mais, nada perguntado', chamadas.length === antes);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
