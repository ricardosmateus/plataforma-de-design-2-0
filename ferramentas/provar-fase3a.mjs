/* Prova de PERGUNTAR AO CADERNO (Fase 3a) com DOM real.

   Três regras, e a terceira é a que sustenta as outras duas:

   1. A pergunta ao caderno vai para a investigação, não para o
      assistente do projeto — e o contrário também vale.
   2. O modo é VISÍVEL enquanto durar, e sair dele custa um clique.
   3. A conversa com o caderno NÃO entra no contexto do assistente
      geral. Se entrasse, um achado da web — que só vale com a fonte
      colada — voltaria depois como coisa que a empresa sabe
      (IA-GERAL-005). É a mesma regra que a narração já obedece
      (IA-CONV-NARRA-003), e é estrutural: prova-se olhando o CORPO
      da requisição que sai, não o texto da tela. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const CONSULTA = 'c-900';
const A1 = 'Não há registro público de LoggiPonto instalado dentro de condomínio residencial.';
const RESPOSTA = `## LoggiPonto\n\n${A1}`;
const FONTES = [{ url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto' }];
const AFIRMACOES = [
  { id: 'af-9', texto: A1, fonteIds: [0], trechos: ['pontos oficiais'], semFonte: false, inicio: RESPOSTA.indexOf(A1), removida: null },
];

const RESPOSTA_CADERNO =
  'Isso não está nas fontes desta investigação. O que há é o registro de que a Loggi opera pontos comerciais [1].';

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-900' }],
  ['plano', { perguntas: [{ pergunta: TAREFA }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-900', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);
const STREAM_BUSCA = quadros([
  ['fim', {
    investigacao_id: 'inv-900', consulta_id: CONSULTA, resultado: 'entregue',
    resposta: RESPOSTA, fontes: FONTES, afirmacoes: AFIRMACOES,
  }],
]);

function montar({ investigacaoGuardada = null } = {}) {
  const dom = new JSDOM(
    `<!doctype html><body>
    <div id="paneAssistente"><div id="iaThread"></div>
      <div class="composer"><textarea id="assistantInput" placeholder="Pergunte ao assistente"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
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

  const rest = [];
  window.fetch = async (u, o) => {
    const caminho = String(u).replace('http://localhost:3333', '');
    rest.push({ caminho, corpo: o && o.body ? JSON.parse(o.body) : null, metodo: (o && o.method) || 'GET' });
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        if (caminho.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
        if (caminho.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
        if (caminho.endsWith('/perguntar')) {
          return { resposta: RESPOSTA_CADERNO, custo_micros: 21000, custo_formatado: 'R$ 0,02', material_cortado: false };
        }
        if (caminho.endsWith('/ia/conversa')) return { mensagens: [], ia_disponivel: true };
        if (caminho.endsWith('/ia/perguntas')) {
          return { mensagem: { id: 'm1', autor: 'ia', texto: 'Resposta do assistente do projeto.' } };
        }
        return {};
      },
      text: async () => '{}',
    };
  };

  const feitos = [];
  window.criarQuadroResultado = (t, itens) => { feitos.push({ titulo: t, itens }); return {}; };
  window.criarQuadroDocumento = (t, texto, fontes) => { feitos.push({ titulo: t, texto, fontes }); return {}; };
  window.dispararAutosave = () => {};
  window.mostrarMensagem = () => {};
  window.EmpresaAtual = { id: 'e1' };
  window.ProjetoAtual = { id: 'p1' };

  for (const js of [apiJs, iaJs, pesqJs]) {
    const tag = window.document.createElement('script');
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

  return { window, rest, quadros: feitos, doc: window.document, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 160) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`);
  if (!ok) falhas++;
};
const clicar = (t, b) => b && b.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
const saida = (t, r) => [...t.thread.querySelectorAll('[data-narracao-saida]')].find((b) => new RegExp(r).test(b.textContent));
const perguntas = (t) => t.rest.filter((c) => c.caminho.endsWith('/perguntar'));
const aoAssistente = (t) => t.rest.filter((c) => c.caminho.endsWith('/ia/perguntas'));

function escrever(t, texto) {
  t.doc.getElementById('assistantInput').value = texto;
  clicar(t, t.doc.getElementById('iaEnviar'));
}

/* Vai da tarefa até o quadro no board. Em 15/09/2026 este caminho
   perdeu as duas paradas que a Fase 2 tinha desenhado — o portão e o
   rascunho —, e virou um clique. O que vem DEPOIS do quadro, que é o
   assunto desta prova, não mudou. */
async function ateOQuadro(t) {
  t.window.IaAssistente.carregar();
  await esperar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(280);
}

/* ============================================================
   1. O botão aparece quando há o que perguntar
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);

  conferir('1a. o quadro nasceu', t.quadros.length > 0, JSON.stringify(t.quadros.map((q) => q.titulo)));
  conferir('1b. e a investigação oferece perguntar sobre as fontes',
    !!saida(t, 'Perguntar sobre estas fontes'), t.thread.textContent.slice(-400));
  /* Mostrar o botão não custa nada: quem custa é a pergunta. */
  conferir('1c. mostrar o botão não gastou nada', perguntas(t).length === 0,
    JSON.stringify(t.rest.map((x) => x.caminho)));
}

/* ============================================================
   2. O modo é visível, e sair dele custa um clique
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);
  clicar(t, saida(t, 'Perguntar sobre estas fontes'));
  await esperar();

  const marca = t.doc.getElementById('iaMarcaCaderno');
  conferir('2a. a marca do modo está na tela', !!marca, t.doc.body.innerHTML.slice(0, 200));
  conferir('2b. e diz de qual investigação se trata',
    !!marca && /Loggi/.test(marca.textContent), marca && marca.textContent);
  conferir('2c. o campo também muda de convite',
    /fontes desta investigação/i.test(t.doc.getElementById('assistantInput').placeholder),
    t.doc.getElementById('assistantInput').placeholder);

  const sair = t.doc.getElementById('iaSairCaderno');
  conferir('2d. há como sair', !!sair, 'sem botão de sair');
  clicar(t, sair);
  await esperar();
  conferir('2e. e sair tira a marca', !t.doc.getElementById('iaMarcaCaderno'), 'marca ficou');

  /* Saiu do modo: a pergunta volta a ser do assistente do projeto. */
  escrever(t, 'e o que a empresa já sabe sobre logística?');
  await esperar();
  conferir('2f. depois de sair, a pergunta volta ao assistente do projeto',
    aoAssistente(t).length === 1 && perguntas(t).length === 0,
    JSON.stringify(t.rest.map((x) => x.caminho)));
}

/* ============================================================
   3. A pergunta vai ao caderno, e a resposta se identifica
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);
  clicar(t, saida(t, 'Perguntar sobre estas fontes'));
  await esperar();

  escrever(t, 'e em condomínios comerciais?');
  await esperar();

  const p = perguntas(t);
  conferir('3a. a pergunta foi para a investigação', p.length === 1,
    JSON.stringify(t.rest.map((x) => x.caminho)));
  conferir('3b. para a consulta certa', p[0] && p[0].caminho.includes('/consultas/' + CONSULTA + '/'),
    p[0] && p[0].caminho);
  conferir('3c. e NÃO para o assistente do projeto', aoAssistente(t).length === 0,
    JSON.stringify(t.rest.map((x) => x.caminho)));

  const txt = t.thread.textContent;
  conferir('3d. a resposta apareceu', /não está nas fontes desta investigação/i.test(txt), txt.slice(-400));
  /* "Não está nas fontes" é resposta CERTA (PES-008), não erro: a
     tela não pode desenhá-la como falha. */
  conferir('3e. e não foi desenhada como erro',
    !t.thread.querySelector('.ia-erro'), t.thread.innerHTML.slice(-300));

  conferir('3f. a resposta diz que leu só as fontes da investigação',
    /Respondido com as fontes da investigação/.test(txt), txt.slice(-400));
  /* 15/09/2026: o custo saiu da resposta. Ele não ajudava a decidir
     nada — a decisão já tinha sido tomada — e espalhava o mesmo
     número por várias jornadas. Valor só em Créditos de uso. */
  conferir('3g. e o custo NÃO aparece na resposta', !/R\$/.test(txt), txt.slice(-300));

  conferir('3h. o modo continua ligado para a próxima pergunta',
    !!t.doc.getElementById('iaMarcaCaderno'), 'a marca sumiu sozinha');
}

/* ============================================================
   4. A REGRA QUE SUSTENTA AS OUTRAS:
      a conversa do caderno não vaza para o assistente geral
   ============================================================
   Prova-se olhando o CORPO da requisição, não o texto da tela: o
   servidor é quem guarda o histórico do assistente, então basta o
   cliente não mandar nada do caderno — e mandar a pergunta certa. */
{
  const t = montar();
  await ateOQuadro(t);
  clicar(t, saida(t, 'Perguntar sobre estas fontes'));
  await esperar();
  escrever(t, 'e em condomínios comerciais?');
  await esperar();

  clicar(t, t.doc.getElementById('iaSairCaderno'));
  await esperar();
  escrever(t, 'resuma o projeto para mim');
  await esperar();

  const geral = aoAssistente(t);
  conferir('4a. a pergunta ao assistente saiu', geral.length === 1,
    JSON.stringify(t.rest.map((x) => x.caminho)));

  const enviado = JSON.stringify(geral[0] && geral[0].corpo);
  conferir('4b. e leva SÓ a pergunta, nada do caderno',
    enviado === JSON.stringify({ pergunta: 'resuma o projeto para mim' }), enviado);
  conferir('4c. nenhum pedaço da resposta do caderno viajou junto',
    !/fontes desta investigação/i.test(enviado) && !/LoggiPonto/.test(enviado), enviado);
}

/* ============================================================
   5. A conversa de ontem volta ao reabrir a tarefa
   ============================================================ */
{
  const t = montar({
    investigacaoGuardada: {
      id: 'inv-900', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
      fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
      consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
      afirmacoes: AFIRMACOES.map((a) => ({ ...a, removida: false })),
      rascunho_pendente: false,
      perguntas: [{ pergunta: 'e em condomínios comerciais?', resposta: RESPOSTA_CADERNO }],
    },
  });
  t.window.IaAssistente.carregar();
  await esperar(260);

  const txt = t.thread.textContent;
  conferir('5a. a pergunta de ontem está lá', /condomínios comerciais/.test(txt), txt.slice(0, 400));
  conferir('5b. e a resposta também', /não está nas fontes/i.test(txt), txt.slice(0, 500));
  conferir('5c. marcada como vinda das fontes, não do assistente',
    /Respondido com as fontes da investigação/.test(txt), txt.slice(0, 500));
  conferir('5d. sem perguntar de novo (nem gastar de novo)', perguntas(t).length === 0,
    JSON.stringify(t.rest.map((x) => x.caminho)));

  /* A recuperação se repete enquanto a investigação corre; remontar a
     conversa a cada volta a duplicaria na tela. */
  const vezes = (txt.match(/condomínios comerciais/g) || []).length;
  conferir('5e. e sem duplicar a conversa', vezes === 1, 'apareceu ' + vezes + ' vezes');
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
