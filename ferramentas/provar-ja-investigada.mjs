/* Prova de "esta tarefa já foi investigada" (Fase 4) com DOM real.

   O caso veio do dado: em 14/09/2026 a MESMA tarefa foi investigada
   DUAS vezes na mesma sessão — R$ 0,67 no total. Nada no caminho
   perguntava se já havia resposta. A recuperação ao abrir a página
   mostra a investigação anterior, mas quem clica no botão não passa
   por ela — e o botão é o caminho vivo.

   A regra que se prova: quando já existe resposta, **nada é gasto
   até alguém escolher**. E é escolha, não bloqueio: a resposta pode
   ter envelhecido ou ter vindo ruim, e refazer continua sendo uma
   opção (BOARD-PESQUISA-012 — nenhuma recusa é beco sem saída). */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const CONSULTA = 'c-777';
const A1 = 'Não há registro público de LoggiPonto em condomínio residencial.';
const RESPOSTA = `## LoggiPonto\n\n${A1}`;
const FONTES = [{ url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto', trecho: 'pontos oficiais' }];
const AFIRMACOES = [
  { id: 'af-1', texto: A1, fonteIds: [0], trechos: ['pontos oficiais'], semFonte: false, inicio: RESPOSTA.indexOf(A1), removida: false },
];

/* O 409 que a rota devolve quando a tarefa já tem resposta. */
const JA_INVESTIGADA = {
  status: 409,
  corpo: {
    campo: null,
    mensagem:
      'Esta tarefa já foi investigada em há 3 hora(s). Ver o que já existe não custa nada; investigar de novo custa.',
    ja_investigada: { investigacao_id: 'inv-antiga', pergunta: TAREFA, quando: new Date().toISOString() },
    saidas: [
      { nivel: 'ver-anterior', rotulo: 'Ver a resposta que já existe', explicacao: 'Não custa nada: a busca já foi feita e paga.' },
      { nivel: 'refazer', rotulo: 'Investigar de novo', explicacao: 'Uma investigação nova, do zero. Custa.' },
    ],
  },
};

const GUARDADA = {
  id: 'inv-antiga', estado: 'entregue', pergunta: TAREFA, passos: ['Busquei — 1 fonte.'],
  plano: { perguntas: [{ pergunta: TAREFA, porque: 'x' }], ja_sabido: [] },
  fecho: 'Pronto.', criado_em: new Date(Date.now() - 3 * 3600e3).toISOString(),
  encerrado_em: new Date(Date.now() - 3 * 3600e3).toISOString(),
  consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
  afirmacoes: AFIRMACOES, rascunho_pendente: false, perguntas: [],
  custo_formatado: 'R$ 0,38',
};

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-nova' }],
  ['plano', { perguntas: [{ pergunta: TAREFA }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-nova', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);

function montar({ jaInvestigada = true } = {}) {
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

  const rest = [];
  window.fetch = async (u, o) => {
    const caminho = String(u).replace('http://localhost:3333', '');
    rest.push({ caminho });
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        if (caminho.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
        /* A recuperação só devolve a guardada quando a prova quer —
           senão a tela já mostraria tudo antes do clique. */
        if (caminho.endsWith('/investigacao')) return { investigacao: window.__mostrarGuardada ? GUARDADA : null };
        if (caminho.endsWith('/ia/conversa')) return { mensagens: [], ia_disponivel: true };
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

  /* `API.fluxo` conta cada tentativa de investigar. É a lista dela —
     e não o texto da tela — que prova que nada foi gasto. */
  const fluxos = [];
  window.API.fluxo = async (caminho, opcoes) => {
    fluxos.push({ caminho, corpo: (opcoes || {}).corpo });

    /* Primeira tentativa sem `refazer`, com resposta já existente:
       a rota recusa antes do planejador. */
    if (jaInvestigada && !((opcoes || {}).corpo || {}).refazer) {
      window.__mostrarGuardada = true;
      const e = new Error(JA_INVESTIGADA.corpo.mensagem);
      e.status = 409;
      e.dados = JA_INVESTIGADA.corpo;
      throw e;
    }

    let i = 0;
    const enc = new TextEncoder();
    return { ok: true, status: 200,
      body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(STREAM_PLANO) } : { done: true }) }) } };
  };

  return { window, rest, fluxos, quadros: feitos, doc: window.document, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 160) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`);
  if (!ok) falhas++;
};
const clicar = (t, b) => b && b.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
const saida = (t, r) => [...t.thread.querySelectorAll('[data-narracao-saida]')].find((b) => new RegExp(r).test(b.textContent));

/* ============================================================
   1. A recusa acontece, e não gasta nada
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar();

  conferir('1a. uma tentativa saiu, e parou aí', t.fluxos.length === 1,
    JSON.stringify(t.fluxos.map((f) => f.caminho)));
  /* O planejador roda DENTRO do stream. Recusar antes dele é o que
     faz "não custou nada" ser verdade, e não um arredondamento. */
  conferir('1b. nenhum quadro nasceu', t.quadros.length === 0, JSON.stringify(t.quadros));

  const txt = t.thread.textContent;
  conferir('1c. a tela diz que já existe resposta', /já foi investigada/.test(txt), txt.slice(-400));
  conferir('1d. e diz QUANDO, em distância e não em data', /há 3 hora/.test(txt), txt.slice(-400));
  conferir('1e. dizendo qual das duas custa', /não custa nada/.test(txt) && /custa/.test(txt), txt.slice(-400));
}

/* ============================================================
   2. As duas saídas existem — recusa não é beco
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar();

  conferir('2a. dá para ver a que já existe', !!saida(t, 'Ver a resposta que já existe'),
    t.thread.textContent.slice(-400));
  /* A resposta pode ter envelhecido, ou ter vindo ruim. Quem decide
     é quem paga; o que não pode é decidir sem saber. */
  conferir('2b. e dá para investigar de novo', !!saida(t, 'Investigar de novo'),
    t.thread.textContent.slice(-400));
}

/* ============================================================
   3. "Ver a que já existe" não gasta
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar();

  clicar(t, saida(t, 'Ver a resposta que já existe'));
  await esperar(240);

  conferir('3a. nenhuma investigação nova saiu', t.fluxos.length === 1,
    JSON.stringify(t.fluxos.map((f) => f.corpo)));
  conferir('3b. e a investigação guardada apareceu',
    /Investigação anterior|Trazer o resultado/.test(t.thread.textContent),
    t.thread.textContent.slice(-500));

  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();
  conferir('3c. e o resultado de antes vira quadro, de graça',
    t.quadros.length > 0 && t.fluxos.length === 1,
    JSON.stringify({ quadros: t.quadros.length, fluxos: t.fluxos.length }));
}

/* ============================================================
   4. "Investigar de novo" gasta — e é uma investigação de verdade
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar();

  clicar(t, saida(t, 'Investigar de novo'));
  await esperar(240);

  /* Só as chamadas de PLANEJAR contam aqui: desde 15/09/2026 a busca
     sai atrás do plano sozinha, e ela também é um fluxo. */
  const planejamentos = t.fluxos.filter((f) => !f.caminho.endsWith('/buscar'));
  conferir('4a. uma segunda tentativa saiu', planejamentos.length === 2,
    JSON.stringify(t.fluxos.map((f) => f.caminho)));
  /* Sem `refazer: true` a rota recusaria de novo, e o botão viraria
     um laço: clica, recusa, clica, recusa. */
  conferir('4b. levando a confirmação de que é de propósito',
    planejamentos[1] && planejamentos[1].corpo && planejamentos[1].corpo.refazer === true,
    JSON.stringify(planejamentos[1] && planejamentos[1].corpo));
  conferir('4c. e com a mesma pergunta',
    planejamentos[1] && planejamentos[1].corpo.pergunta === TAREFA,
    JSON.stringify(planejamentos[1]));

  /* O gesto que autoriza o gasto é o clique em "Investigar de novo" —
     e ele basta. Desde 15/09/2026 não há uma segunda confirmação
     atrás dele. */
  conferir('4d. e a busca saiu sem perguntar de novo',
    t.fluxos.some((f) => f.caminho.endsWith('/buscar')) && !saida(t, 'Buscar agora'),
    t.thread.textContent.slice(-400));
  conferir('4e. e sem preço à vista', !/R\$/.test(t.thread.textContent),
    t.thread.textContent.slice(-400));
}

/* ============================================================
   5. Tarefa sem resposta anterior segue direto
   ============================================================ */
{
  const t = montar({ jaInvestigada: false });
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar();

  conferir('5a. sem investigação anterior, não pergunta nada',
    !/já foi investigada/.test(t.thread.textContent), t.thread.textContent.slice(-400));
  conferir('5b. e vai direto à busca',
    t.fluxos.some((f) => f.caminho.endsWith('/buscar')) && !saida(t, 'Buscar agora'),
    JSON.stringify(t.fluxos.map((f) => f.caminho)));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
