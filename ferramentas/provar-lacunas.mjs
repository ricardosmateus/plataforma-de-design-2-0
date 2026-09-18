/* Prova das LACUNAS (Fase 3c, parte 2) com DOM real.

   A pergunta que ela responde: **o que esta investigação NÃO
   respondeu?** É a informação que decide se dá para confiar no
   resultado — e é a que some mais facilmente, porque o quadro nasce
   bonito com o que deu certo.

   O caso desta prova veio do dado real de 14/09/2026: numa resposta
   de quatro partes, duas traziam texto e nenhuma fonte, e uma delas
   o próprio provedor rotulou com "Falta: ...". Quem só olhasse o
   board veria quatro quadros cheios.

   Nada disto custa uma chamada de modelo: a lacuna é contagem sobre
   a estrutura que já está na mão. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'Como está o mercado de lockers em condomínios no Brasil?';
const CONSULTA = 'c-950';

/* Quatro partes: duas com fonte, uma com texto e sem fonte, uma que
   vai ficar vazia depois da curadoria. */
const A1 = 'Lockin oferece armários inteligentes para parceiros a partir de R$ 449 por mês.';
const A2 = 'Mercado Livre e Amazon lançaram pontos de coleta e entrega inteligentes no Brasil.';
const A3 = 'Não há ranking público das maiores logtechs por faturamento ou volume de operações.';
const A4 = 'O volume médio de entregas por condomínio varia muito e não há número consolidado.';

const RESPOSTA =
  `## 1. Custo de locker para condomínios\n\n${A1}\n\n` +
  `## 2. E-commerces com ponto de coleta\n\n${A2}\n\n` +
  `## 3. Principais logtechs do Brasil\n\n${A3}\n\n` +
  `## 4. Volume de entregas por condomínio\n\n${A4}`;

const FONTES = [
  { url: 'https://zibox.com.br/preco', titulo: 'Preço de armário', trecho: 'a partir de R$ 449' },
  { url: 'https://oihandover.com/pontos', titulo: 'Pontos de coleta', trecho: 'lançaram pontos' },
];

const af = (texto, fonteIds) => ({
  texto, fonteIds,
  trechos: fonteIds.map((i) => FONTES[i].trecho),
  semFonte: fonteIds.length === 0,
  inicio: RESPOSTA.indexOf(texto),
  removida: null,
});
const AFIRMACOES = [af(A1, [0]), af(A2, [1]), af(A3, []), af(A4, [])];

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-950' }],
  ['plano', { perguntas: [{ pergunta: TAREFA }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-950', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);
const STREAM_BUSCA = quadros([
  ['fim', {
    investigacao_id: 'inv-950', consulta_id: CONSULTA, resultado: 'entregue',
    resposta: RESPOSTA, fontes: FONTES, afirmacoes: AFIRMACOES,
    custo_micros: 400_000, custo_formatado: 'R$ 0,40',
  }],
]);

function montar({ investigacaoGuardada = null } = {}) {
  const dom = new JSDOM(
    `<!doctype html><body>
    <div id="paneAssistente"><div id="iaThread"></div>
      <div class="composer"><textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
    </div>
    <div id="panePesquisa"><div id="pesquisaCorpo"></div><textarea id="pesquisaInput"></textarea><span id="pesquisaAviso"></span><button id="pesquisaEnviar"></button></div>
    <button id="tabAssistente"></button><button id="tabPesquisa"></button></body>`,
    { url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1', runScripts: 'dangerously' },
  );
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  }

  const baixados = [];
  window.Blob = class {
    constructor(partes, opcoes) { this.texto = partes.join(''); this.type = (opcoes || {}).type; }
  };
  window.URL.createObjectURL = (b) => { baixados.push({ blob: b }); return 'blob:fake'; };
  window.URL.revokeObjectURL = () => {};
  const criarOriginal = window.document.createElement.bind(window.document);
  window.document.createElement = function (tag) {
    const el = criarOriginal(tag);
    if (String(tag).toLowerCase() === 'a') el.click = function () {};
    return el;
  };

  window.fetch = async (u) => ({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => {
      const s = String(u);
      if (s.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
      if (s.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
      if (s.endsWith('/ia/conversa')) return { mensagens: [], ia_disponivel: true };
      return {};
    },
    text: async () => '{}',
  });

  const feitos = [];
  window.criarQuadroResultado = (t, itens) => { feitos.push({ titulo: t, itens }); return {}; };
  window.criarQuadroDocumento = (t, texto, fontes) => { feitos.push({ titulo: t, texto, fontes }); return {}; };
  window.dispararAutosave = () => {};
  window.mostrarMensagem = () => {};
  window.EmpresaAtual = { id: 'e1' };
  window.ProjetoAtual = { id: 'p1' };

  for (const js of [apiJs, iaJs, pesqJs]) {
    const tag = criarOriginal('script');
    tag.textContent = js;
    window.document.body.appendChild(tag);
  }

  window.API.fluxo = async (caminho) => {
    const texto = caminho.endsWith('/buscar') ? STREAM_BUSCA : STREAM_PLANO;
    let i = 0;
    const enc = new TextEncoder();
    return { ok: true, status: 200,
      body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(texto) } : { done: true }) }) } };
  };

  return { window, baixados, quadros: feitos, doc: window.document, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 160) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`);
  if (!ok) falhas++;
};
const clicar = (t, b) => b && b.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
const saida = (t, r) => [...t.thread.querySelectorAll('[data-narracao-saida]')].find((b) => new RegExp(r).test(b.textContent));
const ultimo = (t) => t.baixados[t.baixados.length - 1];

/* Da tarefa ao quadro: um clique, desde 15/09/2026 — nem portão, nem
   rascunho. Tudo que a busca trouxe entra, inclusive o que veio sem
   fonte (que até então chegava desligado, BOARD-PESQUISA-035). */
async function ateOQuadro(t) {
  t.window.IaAssistente.carregar();
  await esperar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(280);
}

/* O outro caminho: reabrir uma investigação GUARDADA, com afirmações
   já marcadas como removidas. É assim que uma parte esvaziada por
   decisão de alguém chega hoje — a caixinha saiu, o dado ficou —, e é
   o que §2 e §5 precisam para provar que a lacuna sabe distinguir
   "veio sem fonte" de "ficou vazia depois". */
function guardadaCom(removidas) {
  return {
    id: 'inv-950', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
    fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
    consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
    afirmacoes: AFIRMACOES.map((a, i) => ({
      ...a, id: 'a' + (i + 1), removida: removidas.includes(i),
    })),
    rascunho_pendente: false, perguntas: [],
  };
}

async function doGuardadoAoQuadro(t) {
  t.window.IaAssistente.carregar();
  await esperar(280);
  /* 16/09/2026: abrir a tarefa NÃO remonta mais investigação
     terminada — os quadros já estão no board, e o resumo era eco. A
     remontagem passou a ser a pedido, que é o que "Ver a resposta que
     já existe" chama. A prova pede pela mesma porta. */
  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(280);
  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();
}

/* ============================================================
   1. A narração diz o que ficou sem fonte
   ============================================================
   Tudo mantido: as partes 3 e 4 têm texto e nenhuma fonte. */
{
  const t = montar();
  await ateOQuadro(t);

  const txt = t.thread.textContent;
  conferir('1a. o quadro nasceu com tudo', t.quadros.length > 0,
    JSON.stringify(t.quadros.map((q) => q.titulo)));

  conferir('1b. a narração conta quantas partes ficaram sem fonte',
    /2 de 4 parte\(s\) ficaram sem resposta com fonte/.test(txt), txt.slice(-500));
  conferir('1b2. com o motivo de cada uma, porque eles pedem coisas diferentes',
    /tem texto, mas nenhuma fonte/.test(txt), txt.slice(-500));
  conferir('1c. e diz QUAIS, pelo cabeçalho',
    /Principais logtechs do Brasil/.test(txt) && /Volume de entregas por condomínio/.test(txt),
    txt.slice(-500));
  conferir('1d. sem acusar as que tinham fonte',
    !/Custo de locker para condomínios/.test(txt.split('ficaram sem resposta')[1] || ''),
    txt.slice(-500));
}

/* ============================================================
   2. Silêncio é a boa notícia
   ============================================================
   Dizer "0 lacunas" transformaria a boa notícia em ruído. */
{
  /* As duas sem-fonte saíram por decisão de alguém: sobram só partes
     com fonte... e as duas partes que ficaram vazias. Então NÃO é o
     caso de silêncio — é o outro motivo. Serve para provar que os
     dois motivos são distinguidos. */
  const t = montar({ investigacaoGuardada: guardadaCom([2, 3]) });
  await doGuardadoAoQuadro(t);
  const txt = t.thread.textContent;

  conferir('2a. parte esvaziada pela curadoria também é lacuna',
    /2 de 4 parte\(s\)/.test(txt), txt.slice(-500));
  /* Os dois motivos pedem coisas diferentes: texto sem fonte é para
     conferir; parte vazia é para buscar de novo. */
  conferir('2b. e o motivo é dito em cada linha, não numa contagem',
    /não ficou nada no quadro/.test(txt), txt.slice(-500));
}

/* ============================================================
   3. Investigação sem lacuna não fala nada
   ============================================================ */
{
  const t = montar();
  /* Um stream em que TODAS as afirmações têm fonte. */
  t.window.API.fluxo = async (caminho) => {
    const limpo = quadros([
      ['fim', {
        investigacao_id: 'inv-950', consulta_id: CONSULTA, resultado: 'entregue',
        resposta: `## 1. Custo\n\n${A1}\n\n## 2. E-commerces\n\n${A2}`,
        fontes: FONTES,
        afirmacoes: [
          { ...af(A1, [0]), inicio: 12 },
          { ...af(A2, [1]), inicio: 12 + A1.length + 20 },
        ],
        custo_formatado: 'R$ 0,40',
      }],
    ]);
    const texto = caminho.endsWith('/buscar') ? limpo : STREAM_PLANO;
    let i = 0;
    const enc = new TextEncoder();
    return { ok: true, status: 200,
      body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(texto) } : { done: true }) }) } };
  };

  await ateOQuadro(t);
  conferir('3a. nenhuma frase de lacuna quando tudo tem fonte',
    !/ficaram sem resposta com fonte/.test(t.thread.textContent), t.thread.textContent.slice(-400));
  conferir('3b. e a narração fechou normalmente',
    /Pronto\./.test(t.thread.textContent), t.thread.textContent.slice(-300));
}

/* ============================================================
   4. As lacunas entram no relatório
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);
  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();
  const md = ultimo(t).blob.texto;

  conferir('4a. há uma seção própria', /## O que ficou em aberto/.test(md), md.slice(0, 2000));
  conferir('4b. com os títulos das partes', /Principais logtechs do Brasil/.test(md), md.slice(0, 2000));
  conferir('4c. e o motivo de cada uma',
    /nenhuma afirmação com fonte/.test(md), md.slice(0, 2000));
  /* Antes do caderno e depois das fontes: quem lê precisa saber o
     que falta antes de tirar conclusão do que tem. */
  conferir('4d. depois das fontes, no documento',
    md.indexOf('## Fontes') < md.indexOf('## O que ficou em aberto'), 'ordem das seções');
}

/* ============================================================
   5. O CASO QUE QUASE PASSOU: as posições depois da curadoria
   ============================================================
   `r.resposta` vira o texto REMONTADO depois do rascunho, mas o
   `inicio` de cada afirmação aponta para o texto original. Casar os
   dois erraria em silêncio — e o erro pareceria certo, porque as
   contagens continuam plausíveis. */
{
  /* A PRIMEIRA saiu — é a que mais desloca o resto. */
  const t = montar({ investigacaoGuardada: guardadaCom([0]) });
  await doGuardadoAoQuadro(t);
  const txt = t.thread.textContent;

  /* Parte 1 perdeu sua única afirmação → vazia.
     Partes 3 e 4 continuam sem fonte.
     Parte 2 continua com fonte. Logo: 3 de 4. */
  conferir('5a. a contagem usa as posições do texto original',
    /3 de 4 parte\(s\)/.test(txt), txt.slice(-500));
  conferir('5b. e a parte que ainda tem fonte não é acusada',
    !/E-commerces com ponto de coleta/.test(txt.split('ficaram sem resposta')[1] || ''),
    txt.slice(-500));
  conferir('5c. a parte esvaziada é nomeada certa',
    /Custo de locker para condomínios/.test(txt), txt.slice(-500));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
