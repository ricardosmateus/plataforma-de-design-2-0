/* Prova de que A PESQUISA CHEGA AO BANCO, com a board.html DE VERDADE.

   POR QUE ESTA PROVA EXISTE
   As outras onze substituem `criarQuadroResultado` e
   `criarQuadroDocumento` por stubs que guardam um objeto numa lista.
   Elas provam o que a pesquisa MANDA para o board, e param ali. O
   pedaço seguinte — o board montar o quadro, `lerDaTela()` serializar
   o canvas, o PUT sair com um corpo que o servidor aceite, e a volta
   reconstruir o que foi gravado — não tinha prova nenhuma.

   O defeito de 16/09/2026 nasceu exatamente nesse vão: numa tarefa
   concluída, `criarQuadroDocumento` montava os quadros na tela (faltava
   a guarda de `modoLeitura` que a irmã dela tinha), a narração dizia
   "Montei 3 quadros no board", e o autosave recusava em silêncio. A
   pessoa via o resultado, voltava, e o board estava vazio. Nenhuma das
   onze suítes podia falhar por isso: todas trocavam o board por stubs,
   e stub não tem modo leitura nem autosave.

   É a mesma forma do item 5 de §8.6 — o CORS que 237 conferências não
   podiam achar porque stub de `fetch` não tem política de mesma origem.
   A lição que fica: quando a prova substitui o vizinho, ela para de
   provar a fronteira com ele.

   COMO ELA FUNCIONA
   Carrega a board.html inteira em jsdom, com os scripts reais, e só
   troca a REDE. O que se confere é o corpo do PUT — o mesmo que o
   servidor valida com zod em `api/src/rotas/board.ts`. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = '/mnt/user-data/uploads/Plataforma de Design 2.0';
const E = '3f2de186-6b88-44ac-975c-7035a4c2ccbe';
const P = '5827cbd8-59f9-4525-b243-e2731cb5b000';
const I = '11111111-2222-3333-4444-555555555555';
const T = '99999999-8888-7777-6666-555555555555';

const TAREFA = 'Pesquisar os concorrentes da ihouselog na área de loghtecs';

/* Texto no formato que o provedor devolve: título numerado, parágrafo
   longo, e uma seção final sem fonte. */
const RESPOSTA = `## 1. Empresas que oferecem soluções de pontos de coleta em condomínios integrados a e-commerces

As fontes encontradas mencionam plataformas de pontos de coleta (Frenet, Mercado Livre, Correios, Pegaki), mas não identificaram empresas específicas que operem pontos de coleta exclusivamente em condomínios integrados a e-commerces, como o modelo da iHouseLog. O mercado brasileiro de logística de última milha cresceu de forma acelerada nos últimos anos, e diversos operadores passaram a oferecer redes de pontos de retirada.

## 2. Logtechs brasileiras com foco em condomínios

Não foram encontradas logtechs brasileiras cujo foco declarado seja a operação de armários inteligentes em condomínios residenciais integrados a marketplaces.

## 3. O que ficou faltando

Uma busca em bases de startups brasileiras poderia revelar operadores menores que não aparecem em resultados de busca genéricos.`;

const FONTES = [
  { url: 'https://www.frenet.com.br/pontos-de-coleta', titulo: 'Frenet', trecho: 'rede de pontos de coleta' },
  { url: 'https://www.pegaki.com.br/', titulo: 'Pegaki', trecho: 'pontos de retirada' },
];

const af = (texto, fonteIds) => ({
  texto,
  fonteIds,
  trechos: fonteIds.map((i) => FONTES[i].trecho),
  semFonte: fonteIds.length === 0,
  inicio: RESPOSTA.indexOf(texto.slice(0, 40)),
  removida: null,
  id: null,
});

const AFIRMACOES = [
  af('As fontes encontradas mencionam plataformas de pontos de coleta (Frenet, Mercado Livre, Correios, Pegaki), mas não identificaram empresas específicas que operem pontos de coleta exclusivamente em condomínios integrados a e-commerces, como o modelo da iHouseLog.', [0]),
  af('Não foram encontradas logtechs brasileiras cujo foco declarado seja a operação de armários inteligentes em condomínios residenciais integrados a marketplaces.', [1]),
];

const sse = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = sse([
  ['aberta', { investigacao_id: 'inv-g' }],
  ['plano', { perguntas: [{ pergunta: TAREFA, porque: 'É a tarefa.' }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-g', perguntas: [], estimativa_micros: 420000, estimativa_formatada: 'R$ 0,42' }],
]);
const STREAM_BUSCA = sse([
  ['aberta', { investigacao_id: 'inv-g' }],
  ['passo', { texto: 'Busquei 4 vez(es) · 2 fonte(s).' }],
  ['fim', {
    investigacao_id: 'inv-g', consulta_id: 'c-1', resultado: 'entregue',
    resposta: RESPOSTA, fontes: FONTES, afirmacoes: AFIRMACOES,
    perguntas: [{ pergunta: TAREFA }], ja_sabido: [],
  }],
]);

/* ---------- a página, com os <script src> embutidos ---------- */
const PAGINA = (() => {
  let html = fs.readFileSync(path.join(RAIZ, 'board.html'), 'utf8');
  html = html.replace(/<script src="(js\/[a-z-]+\.js)"><\/script>/g, (m, rel) => {
    const p = path.join(RAIZ, rel);
    return fs.existsSync(p) ? '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>' : '';
  });
  return html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
})();

const URL_BOARD = `http://localhost:8000/board.html?empresa=${E}&projeto=${P}&ideia=${I}&tarefa=${T}`;

/* O stub de rede tem de existir ANTES dos scripts da página, que
   chamam a API já no parse — por isso ele entra como o primeiro
   <script> do <head>, e não de fora. */
function montar({ status = 'pendente', quadrosDoServidor = [], putFalha = false } = {}) {
  const stub = `<script>
window.__puts = []; window.__naoCasados = [];
(function () {
  function resp(corpo, codigo) {
    var c = codigo || 200;
    return Promise.resolve({
      ok: c < 400, status: c,
      headers: { get: function () { return 'application/json'; } },
      json: function () { return Promise.resolve(corpo); },
      text: function () { return Promise.resolve(JSON.stringify(corpo)); }
    });
  }
  window.fetch = function (u, o) {
    var s = String(u), m = ((o || {}).method || 'GET').toUpperCase();
    if (m === 'PUT' && /\\/quadros$/.test(s)) {
      var corpo = null;
      try { corpo = JSON.parse((o || {}).body || '{}'); } catch (e) { corpo = { erroDeParse: true }; }
      window.__puts.push(corpo);
      if (${putFalha ? 'true' : 'false'}) return resp({ erro: { mensagem: 'falhou' } }, 500);
      return resp({ quadros: (corpo && corpo.quadros) || [] });
    }
    if (/\\/tarefas$/.test(s) && m === 'GET') {
      return resp({ tarefas: [{ id: '${T}', titulo: 'Concorrentes', descricao: ${JSON.stringify(TAREFA)}, status: '${status}', ordem: 0 }] });
    }
    if (/\\/quadros$/.test(s) && m === 'GET') return resp({ quadros: ${JSON.stringify(quadrosDoServidor)} });
    if (/\\/empresas$/.test(s)) return resp({ empresas: [{ id: '${E}', nome: 'iHouseLog' }] });
    if (/\\/projetos$/.test(s)) return resp({ projetos: [{ id: '${P}', nome: 'Projeto' }] });
    if (/\\/pesquisa\\/sessoes\\?/.test(s)) return resp({ sessoes: [{ id: 's1' }] });
    if (/\\/investigacao$/.test(s)) return resp({ investigacao: null });
    if (/\\/ia\\/conversa$/.test(s)) return resp({ mensagens: [], ia_disponivel: true });
    if (/\\/creditos/.test(s)) return resp({ saldo_micros: 10000000, saldo_formatado: 'R$ 10,00', lancamentos: [] });
    window.__naoCasados.push(m + ' ' + s);
    return resp({});
  };
})();
<\/script>`;

  const dom = new JSDOM(PAGINA.replace('<head>', '<head>' + stub), {
    url: URL_BOARD, runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  }
  return {
    window,
    doc: window.document,
    get puts() { return window.__puts; },
    get thread() { return window.document.getElementById('iaThread'); },
    paineis() { return window.document.querySelectorAll('#canvasStage .ideas-panel'); },
  };
}

function ligarStream(t) {
  t.window.API.fluxo = async (caminho) => {
    const texto = caminho.endsWith('/buscar') ? STREAM_BUSCA : STREAM_PLANO;
    let i = 0;
    const enc = new TextEncoder();
    return {
      ok: true, status: 200,
      body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(texto) } : { done: true }) }) },
    };
  };
}

const esperar = (ms = 200) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`);
  if (!ok) falhas++;
};

/* Os limites que `api/src/rotas/board.ts` impõe com zod. Um corpo que
   viola qualquer um deles é recusado com 400 — e o PUT é tudo ou nada,
   então UM card fora do limite custa o quadro inteiro. */
function forasDoLimite(corpo) {
  const maus = [];
  const quadros = (corpo && corpo.quadros) || [];
  if (quadros.length > 40) maus.push('quadros>' + 40);
  quadros.forEach((q, iq) => {
    if ((q.titulo || '').trim().length > 260) maus.push(`q${iq}.titulo>260`);
    if ((q.colunas || []).length > 12) maus.push(`q${iq}.colunas>12`);
    (q.colunas || []).forEach((c, ic) => {
      if ((c.titulo || '').trim().length > 60) maus.push(`q${iq}c${ic}.titulo>60`);
      if ((c.registros || []).length > 200) maus.push(`q${iq}c${ic}.registros>200`);
      (c.registros || []).forEach((r, ir) => {
        const tit = (r.titulo || '').trim();
        const desc = (r.descricao || '').trim();
        if (!tit) maus.push(`q${iq}c${ic}r${ir}.titulo VAZIO`);
        if (tit.length > 260) maus.push(`q${iq}c${ic}r${ir}.titulo>260`);
        if (desc.length > 50000) maus.push(`q${iq}c${ic}r${ir}.descricao>50000`);
        /* O limite de post-it vale só para o quadro de post-its: um
           documento existe justamente porque resposta longa não é
           anotação. */
        if (q.tipo !== 'documento' && desc.length > 280) {
          maus.push(`q${iq}c${ic}r${ir}.descricao>280 (${desc.length})`);
        }
      });
    });
  });
  return maus;
}

/* ============================================================
   1. Tarefa pendente: a pesquisa chega ao banco
   ============================================================ */
let gravado = null;
{
  const t = montar();
  await esperar(400);
  ligarStream(t);

  conferir('1a. o board terminou de carregar antes da pesquisa',
    t.window.BoardAcoes.pronto() === true, 'pronto() é falso');

  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(600);

  conferir('1b. os quadros nasceram no canvas', t.paineis().length > 0,
    String(t.paineis().length));
  conferir('1c. e UM PUT saiu — a gravação aconteceu', t.puts.length === 1,
    JSON.stringify(t.puts.length));

  gravado = t.puts[t.puts.length - 1];
  const nosQuadros = ((gravado || {}).quadros || []).length;
  conferir('1d. com todos os quadros da tela dentro do corpo',
    nosQuadros === t.paineis().length,
    `canvas=${t.paineis().length} corpo=${nosQuadros}`);

  /* A conferência que nenhuma prova fazia: o corpo é aceitável pelo
     servidor? O PUT é tudo ou nada — um card fora do limite derruba o
     quadro inteiro, e a tela continua mostrando o resultado como se
     tivesse gravado. */
  const maus = forasDoLimite(gravado);
  conferir('1e. e dentro dos limites que o servidor valida', maus.length === 0,
    maus.join(', '));

  conferir('1f. a narração disse quantos quadros montou',
    /Montei \d+ quadro/.test(t.thread.textContent), t.thread.textContent.slice(-300));
  conferir('1g. e NÃO disse que falhou em gravar',
    !/NÃO consegui gravar/.test(t.thread.textContent), t.thread.textContent.slice(-300));
}

/* ============================================================
   2. A volta: o que foi gravado carrega
   ============================================================
   "Fiz a pesquisa e voltei para a tarefa, e os quadros não carregaram."
   Esta seção é a pergunta dele, escrita como conferência. */
{
  const t = montar({ quadrosDoServidor: (gravado || {}).quadros || [] });
  await esperar(700);

  conferir('2a. reabrir a tarefa devolve os mesmos quadros',
    t.paineis().length === (((gravado || {}).quadros) || []).length && t.paineis().length > 0,
    `esperado=${(((gravado || {}).quadros) || []).length} veio=${t.paineis().length}`);

  const docs = [...t.paineis()].filter((p) => p.dataset.tipo === 'documento');
  conferir('2b. o quadro-documento volta como documento, com o texto',
    docs.length > 0 && docs.every((p) => {
      const c = p.querySelector('.doc-corpo');
      return c && c.textContent.trim().length > 0;
    }),
    `documentos=${docs.length}`);

  conferir('2c. e reabrir não regrava nada por conta própria',
    t.puts.length === 0, JSON.stringify(t.puts.length));
}

/* ============================================================
   3. Tarefa CONCLUÍDA não recebe resultado — e diz isso
   ============================================================
   O defeito de 16/09/2026. `criarQuadroResultado` já recusava em modo
   leitura (BOARD-LEITURA-003); `criarQuadroDocumento` não recusava, e
   como o autosave recusa, o resultado ficava na tela e sumia na volta.

   As três conferências abaixo têm de valer JUNTAS: não montar, não
   gravar, e DIZER. Montar sem gravar em silêncio é o defeito; recusar
   sem dizer seria um botão morto. */
{
  const t = montar({ status: 'concluida' });
  await esperar(400);
  ligarStream(t);

  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(600);

  conferir('3a. nenhum quadro foi montado na tela', t.paineis().length === 0,
    String(t.paineis().length));
  conferir('3b. e nenhum PUT saiu', t.puts.length === 0,
    JSON.stringify(t.puts.map((p) => (p.quadros || []).length)));
  conferir('3c. a narração NÃO diz que montou quadro nenhum',
    !/Montei \d+ quadro/.test(t.thread.textContent), t.thread.textContent.slice(-400));
  conferir('3d. e explica por quê, em vez de falhar calada',
    /concluída/i.test(t.thread.textContent), t.thread.textContent.slice(-400));
}

/* ============================================================
   4. Gravação que falha não passa por gravação que deu certo
   ============================================================
   Até 16/09/2026 a narração dizia "Montei 3 quadros no board" e
   disparava o autosave sem olhar no que dava. Um 500 do servidor, uma
   sessão expirada ou a rede caindo deixavam o board vazio na volta, e
   a única coisa que a pessoa tinha lido era a confirmação. */
{
  const t = montar({ putFalha: true });
  await esperar(400);
  ligarStream(t);

  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(800);

  conferir('4a. o PUT foi tentado', t.puts.length >= 1, String(t.puts.length));
  /* Os quadros ESTÃO na tela, e isso continua sendo dito: é verdade. */
  conferir('4b. a narração ainda diz que montou — porque montou',
    /Montei \d+ quadro/.test(t.thread.textContent), t.thread.textContent.slice(-400));
  conferir('4c. mas diz também que NÃO gravou',
    /NÃO consegui gravar/.test(t.thread.textContent), t.thread.textContent.slice(-500));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
