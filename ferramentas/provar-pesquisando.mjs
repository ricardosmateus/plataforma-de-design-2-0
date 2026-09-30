/* Uso: node ferramentas/provar-pesquisando.mjs [raiz] [caminho do ia.js]
   Se o jsdom não estiver no projeto: JSDOM_DE=<pasta com node_modules/jsdom>/ node … */
/* Prova: o botão "Pesquisar" gira enquanto HOUVER investigação em
   andamento, e só volta quando os quadros já estão no board
   (BOARD-PESQUISA-092). board.html, js/ia.js e js/pesquisa.js de verdade;
   a API é substituída, com um stream SSE que demora como uma busca. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const raiz = process.argv[2] || new URL('..', import.meta.url).pathname;
const IA = process.argv[3] || raiz + '/js/ia.js';
const html = readFileSync(raiz + '/board.html', 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const pesquisaJs = readFileSync(raiz + '/js/pesquisa.js', 'utf8');
const iaJs = readFileSync(IA, 'utf8');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function stream(w, eventos, atraso) {
  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(c) {
      for (const [ev, dados] of eventos) {
        await espera(atraso);
        c.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(dados)}\n\n`));
      }
      c.close();
    },
  });
  return { ok: true, status: 200, body: corpo };
}

const FIM = {
  investigacao_id: 'i1', consulta_id: 'c1', resultado: 'entregue',
  resposta: 'A Loggi usa azul como cor principal.\n\nA Shopee usa laranja.',
  fontes: [{ url: 'https://exemplo.com', titulo: 'Exemplo' }],
  afirmacoes: [{ texto: 'A Loggi usa azul como cor principal.', fonteIds: [0], semFonte: false, inicio: 0, id: 'a1' }],
  perguntas: [{ pergunta: 'Quais cores?', porque: 'x' }], matriz: null, custo_micros: 0, custo_formatado: 'R$ 0,00', erro: null,
};

async function montar() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://app.test/board?empresa=e&projeto=p&ideia=i&tarefa=t1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.ReadableStream = ReadableStream; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.console.log = () => {}; w.console.info = () => {}; w.console.warn = () => {};
  w.API = {
    chamar(caminho, op = {}) {
      if (/\/pesquisa\/sessoes\?tarefaId=/.test(caminho)) return Promise.resolve({ sessoes: [{ id: 's1' }] });
      if (/\/investigacao$/.test(caminho)) return Promise.resolve({ investigacao: null });
      return Promise.resolve({});
    },
    fluxo(caminho) {
      if (/\/investigar$/.test(caminho)) return Promise.resolve(stream(w, [['passo', { texto: 'Planejando.' }], ['aguardando', { investigacao_id: 'i1', perguntas: [] }]], 50));
      if (/\/buscar$/.test(caminho)) return Promise.resolve(stream(w, [['passo', { texto: 'Buscando.' }], ['fim', FIM]], 400));
      return Promise.reject(new Error('rota inesperada ' + caminho));
    },
  };
  await espera(30);
  w.eval(iaJs); w.eval(pesquisaJs);
  await espera(50);
  return w;
}

const rotulo = (w) => w.document.getElementById('btnGerarIALabel').textContent.trim();
const quadros = (w) => w.document.querySelectorAll('.ideas-panel').length;
let f = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok     ' : 'FALHOU ') + n + (c ? '' : '  ' + x)); if (!c) f++; };

/* A — pelo botão: gira até os quadros existirem, e nunca "volta" antes. */
let w = await montar();
/* O board carregado põe a descrição da tarefa no painel; é ela que o botão envia. */
w.document.querySelector('.explainer-text').textContent = 'Quais cores a Loggi usa?';
const linha = [];
const obs = setInterval(() => linha.push({ r: rotulo(w), q: quadros(w) }), 20);
w.document.getElementById('btnGerarIA').click();
await espera(250);
ok('A: durante a busca, o botão diz "Pesquisando..."', rotulo(w) === 'Pesquisando...', rotulo(w));
await espera(1400);
clearInterval(obs);
ok('A: no fim, os quadros estão no board e o botão voltou', quadros(w) > 0 && rotulo(w) === 'Pesquisar', `q=${quadros(w)} r=${rotulo(w)}`);
const voltouAntes = linha.some((s, i) => i > 3 && s.r === 'Pesquisar' && s.q === 0);
ok('A: o botão NUNCA voltou a "Pesquisar" antes de os quadros aparecerem', !voltouAntes);

/* B — investigação que NÃO nasce do botão (como "Investigar de novo" na narração). */
w = await montar();
w.PesquisaPainel.pesquisarNoQuadro('Quais cores a Loggi usa?');
await espera(250);
ok('B: investigação vinda da narração também faz o botão girar', rotulo(w) === 'Pesquisando...', rotulo(w));
ok('B: enquanto gira, o botão não aceita outro clique', w.document.getElementById('btnGerarIA').disabled === true);
await espera(1400);
ok('B: no fim, quadros no board e botão de volta', quadros(w) > 0 && rotulo(w) === 'Pesquisar', `q=${quadros(w)} r=${rotulo(w)}`);

console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
