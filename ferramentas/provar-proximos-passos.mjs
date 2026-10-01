/* Uso: node ferramentas/provar-proximos-passos.mjs [raiz] [caminho do ia.js]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: "Próximos passos" (BOARD-PESQUISA-097 a 101) no board real —
   board.html, js/ia.js, js/pesquisa.js e js/board.js de verdade; a API é
   substituída, com um stream que demora como uma busca. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const IA = process.argv[3] || raiz + '/js/ia.js';
const html = readFileSync(raiz + '/board.html', 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const pesquisaJs = readFileSync(raiz + '/js/pesquisa.js', 'utf8');
const boardJs = readFileSync(raiz + '/js/board.js', 'utf8');
const iaJs = readFileSync(IA, 'utf8');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function stream(eventos, atraso) {
  const enc = new TextEncoder();
  return { ok: true, status: 200, body: new ReadableStream({ async start(c) {
    for (const [ev, d] of eventos) { await espera(atraso); c.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); }
    c.close();
  } }) };
}
const RESPOSTA = '## 1. Cores da marca\nA Loggi usa azul.\n\n## 2. Tipografia\nNão achei fonte para isso.\n\n## 3. Símbolo\n';
const FIM = {
  investigacao_id: 'i1', consulta_id: 'c1', resultado: 'entregue', resposta: RESPOSTA,
  fontes: [{ url: 'https://www.loggi.com/', titulo: 'Loggi', inicios: [0] }],
  afirmacoes: [
    { texto: 'A Loggi usa azul.', fonteIds: [0], trechos: ['azul'], semFonte: false, inicio: RESPOSTA.indexOf('A Loggi'), id: 'a1' },
    { texto: 'Não achei fonte para isso.', fonteIds: [], trechos: [], semFonte: true, inicio: RESPOSTA.indexOf('Não achei'), id: 'a2' },
  ],
  perguntas: [{ pergunta: 'Quais cores a Loggi usa?' }, { pergunta: 'Qual tipografia a Loggi usa?' }, { pergunta: 'Como é o símbolo da Loggi?' }],
  matriz: null, custo_micros: 0, custo_formatado: 'R$ 0,00', erro: null,
};

async function montar({ comBoardJs = false, quadros = [] } = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=t1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.ReadableStream = ReadableStream; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.console.log = () => {}; w.console.info = () => {}; w.console.warn = () => {};
  const fluxos = [];
  w.API = {
    chamar(caminho, op = {}) {
      if (op.metodo === 'PUT' && /\/quadros$/.test(caminho)) return Promise.resolve({ quadros: (op.corpo && op.corpo.quadros) || [] });
      if (caminho === '/empresas') return Promise.resolve({ empresas: [{ id: 'e', nome: 'E' }] });
      if (/\/empresas\/e\/projetos$/.test(caminho)) return Promise.resolve({ projetos: [{ id: 'p', nome: 'P' }] });
      if (/\/tarefas$/.test(caminho)) return Promise.resolve({ tarefas: [{ id: 't1', titulo: 'T', descricao: 'Logotipos das logtechs', status: 'pendente', tipo: 'pesquisa' }] });
      if (/\/quadros$/.test(caminho)) return Promise.resolve({ quadros });
      if (/\/pesquisa\/sessoes\?tarefaId=/.test(caminho)) return Promise.resolve({ sessoes: [{ id: 's1' }] });
      if (/\/investigacao$/.test(caminho)) return Promise.resolve({ investigacao: null });
      return Promise.resolve({});
    },
    fluxo(caminho, op) {
      fluxos.push({ caminho, corpo: op && op.corpo });
      if (/\/investigar$/.test(caminho)) return Promise.resolve(stream([['passo', { texto: 'Planejando.' }], ['aguardando', { investigacao_id: 'i1', perguntas: [] }]], 30));
      if (/\/buscar$/.test(caminho)) return Promise.resolve(stream([['fim', FIM]], 200));
      return Promise.reject(new Error(caminho));
    },
  };
  await espera(30);
  w.eval(iaJs); w.eval(pesquisaJs);
  if (comBoardJs) w.eval(boardJs);
  await espera(comBoardJs ? 1500 : 60);
  return { w, fluxos };
}
const proximos = (w) => [...w.document.querySelectorAll('.ideas-panel')].find((p) => (p.querySelector('.ideas-title') || {}).textContent === 'Próximos passos');
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };

let { w, fluxos } = await montar();
w.document.querySelector('.explainer-text').textContent = 'Logotipos das logtechs';
w.document.getElementById('btnGerarIA').click();
await espera(900);
const q = proximos(w);
ok('A: depois do resultado, nasce o quadro "Próximos passos"', !!q, [...w.document.querySelectorAll('.ideas-title')].map((t) => t.textContent).join(' | '));
const titulos = q ? [...q.querySelectorAll('.idea-title')].map((t) => t.textContent.trim()) : [];
ok('A: a pergunta é a do PLANO para a parte sem fonte (e não a da parte com fonte)', titulos.join('|') === 'Qual tipografia a Loggi usa?', titulos.join('|'));
ok('A: cada post-it nasce com "Responda aqui..."', q && [...q.querySelectorAll('.idea-desc')].every((d) => d.textContent.trim() === 'Responda aqui...'));
const botao = q && q.querySelector('.proximos-continuar');
ok('A: o botão está no fim do quadro', !!botao && botao.textContent === 'Continuar pesquisa com minhas respostas');

const antes = fluxos.length;
botao.click();
await espera(100);
ok('B: sem nenhuma resposta, o botão NÃO dispara pesquisa (nada é gasto)', fluxos.length === antes, `fluxos: ${fluxos.length - antes}`);

q.querySelectorAll('.idea-desc')[0].textContent = 'Usamos Montserrat no site novo.';
botao.click();
await espera(100);
const nova = fluxos.slice(antes).find((x) => /\/investigar$/.test(x.caminho));
ok('C: com resposta, dispara a investigação com refazer e as respostas', !!nova && nova.corpo.refazer === true, JSON.stringify(fluxos.slice(antes)));
ok('C: só a pergunta respondida vai, e sem o convite', JSON.stringify(nova.corpo.respostas) === JSON.stringify([{ pergunta: 'Qual tipografia a Loggi usa?', resposta: 'Usamos Montserrat no site novo.' }]), JSON.stringify(nova.corpo.respostas));
ok('C: a pergunta continua sendo a tarefa', nova.corpo.pergunta === 'Logotipos das logtechs');
ok('C: enquanto pesquisa, o "Pesquisar" gira', w.document.getElementById('btnGerarIALabel').textContent.trim() === 'Pesquisando...');
await espera(1200);

({ w } = await montar({ comBoardJs: true, quadros: [{ id: 'q9', tipo: 'postits', titulo: 'Próximos passos', colunas: [{ titulo: '', registros: [{ id: 'r1', titulo: 'Qual tipografia?', descricao: 'Responda aqui...' }] }] }] }));
ok('D: ao reabrir o board, o botão volta ao quadro gravado', !!(proximos(w) && proximos(w).querySelector('.proximos-continuar')));

({ w, fluxos } = await montar());
const semLacuna = { ...FIM, resposta: '## 1. Cores da marca\nA Loggi usa azul.\n', afirmacoes: [FIM.afirmacoes[0]] };
w.API.fluxo = (c, op) => { fluxos.push({ caminho: c, corpo: op && op.corpo }); return /\/investigar$/.test(c) ? Promise.resolve(stream([['aguardando', { investigacao_id: 'i1', perguntas: [] }]], 20)) : Promise.resolve(stream([['fim', semLacuna]], 50)); };
w.document.querySelector('.explainer-text').textContent = 'Logotipos das logtechs';
w.document.getElementById('btnGerarIA').click();
await espera(700);
ok('E: sem lacuna, NÃO nasce "Próximos passos" (pergunta para encher espaço é ruído)', !proximos(w));

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
