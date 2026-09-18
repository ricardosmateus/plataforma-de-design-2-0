/* Prova da Fase 1a com DOM real.
   O servidor é falso; o cliente é o de verdade. O que se prova é o
   que a Fase 1a acrescentou: ler o stream SSE sem perder quadro,
   narrar as etapas conforme chegam, mostrar o plano e a estimativa,
   e continuar oferecendo saída quando o planejador recusa. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const apiJs = fs.readFileSync(`${BASE}/api.js`, 'utf8');
const iaJs = fs.readFileSync(`${BASE}/ia.js`, 'utf8');
const pesqJs = fs.readFileSync(`${BASE}/pesquisa.js`, 'utf8');

const MARCACAO = `
  <div id="paneAssistente">
    <div class="assistant-thread" id="iaThread" aria-live="polite"></div>
    <textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button>
  </div>
  <div id="panePesquisa"><div id="pesquisaCorpo"></div>
    <textarea id="pesquisaInput"></textarea><span id="pesquisaAviso"></span><button id="pesquisaEnviar"></button></div>
  <button id="tabAssistente"></button><button id="tabPesquisa"></button>
`;

/* Monta a resposta SSE a partir de pedaços de bytes já fatiados —
   é assim que se testa a fronteira de quadro, que é onde o leitor
   ingênuo quebra. */
function respostaSSE(pedacos) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < pedacos.length
            ? { done: false, value: enc.encode(pedacos[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
}

const quadro = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;

function montar({ fluxo, rotas }) {
  const dom = new JSDOM(`<!doctype html><body>${MARCACAO}</body>`, {
    url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;

  const chamadas = [];
  window.fetch = async (url, opcoes) => {
    const caminho = String(url).replace('http://localhost:3333', '');
    const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
    chamadas.push({ caminho, corpo });
    const r = (rotas && rotas(caminho, corpo)) || { status: 200, corpo: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corpo ?? {},
    };
  };

  const quadros = [];
  window.criarQuadroResultado = (t, itens) => { quadros.push({ t, n: itens.length }); return {}; };
  window.criarQuadroDocumento = (t) => { quadros.push({ t, doc: true }); return {}; };
  window.dispararAutosave = () => {};
  const toasts = [];
  window.mostrarMensagem = (m) => toasts.push(m);
  window.EmpresaAtual = { id: 'e1' };
  window.ProjetoAtual = { id: 'p1' };

  for (const js of [apiJs, iaJs, pesqJs]) {
    const tag = window.document.createElement('script');
    tag.textContent = js;
    window.document.body.appendChild(tag);
  }

  /* `fluxo` é stubbado depois dos scripts, sobre o objeto real. */
  if (fluxo) window.API.fluxo = fluxo(chamadas);

  return { window, chamadas, quadros, toasts, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 80) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : '\n        ' + detalhe}`);
  if (!ok) falhas++;
};

const SESSAO = { status: 200, corpo: { sessoes: [{ id: 's1' }] } };
const rotasBase = (c) => (c.startsWith('/pesquisa/sessoes?') ? SESSAO : { status: 200, corpo: {} });

/* ---------------------------------------------------------------
   1. Caminho feliz — e o quadro chegando PARTIDO entre leituras
   --------------------------------------------------------------- */
{
  const inteiro =
    quadro('passo', { texto: 'Li o que a empresa já sabe: 3 trecho(s) validado(s) em 6 categoria(s).' }) +
    quadro('passo', { texto: 'Não vou perguntar 2 coisa(s) que a empresa já validou.' }) +
    quadro('passo', { texto: 'Escrevi 4 pergunta(s) verificável(is).' }) +
    quadro('plano', {
      perguntas: [
        { pergunta: 'Quais marcas de periféricos gamer vendem no Brasil?' },
        { pergunta: 'Qual a participação da Logitech no Brasil?' },
      ],
    }) +
    /* Desde 14/09/2026 o stream de `investigar` termina AQUI, no
       portão do gasto. O que vem depois é o segundo stream, o de
       `buscar`, e ele só sai se alguém clicar — o portão em si está
       provado em `provar-fase2b.mjs`. */
    quadro('aguardando', {
      investigacao_id: 'inv-1a',
      estimativa_micros: 1230000,
      estimativa_formatada: 'R$ 1,23',
    });

  const depoisDoSim =
    quadro('passo', { texto: 'Busquei — 5 fonte(s).' }) +
    quadro('fim', {
      consulta_id: 'c1',
      resultado: 'entregue',
      resposta: 'A Logitech compete com Razer e HyperX no Brasil.',
      fontes: [{ url: 'https://a.com', titulo: 'A' }, { url: 'https://b.com', titulo: 'B' }],
    });

  /* Corta no meio de um `data:` de propósito: um `read()` não
     respeita fronteira de quadro, e tratar cada pedaço como um
     evento é o erro que só aparece em produção, com rede lenta. */
  const meio = Math.floor(inteiro.length / 2);
  const pedacos = [inteiro.slice(0, 37), inteiro.slice(37, meio), inteiro.slice(meio)];

  const t = montar({
    rotas: rotasBase,
    fluxo: (chamadas) => async (caminho, opcoes) => {
      chamadas.push({ caminho, corpo: opcoes.corpo });
      return respostaSSE(caminho.endsWith('/buscar') ? [depoisDoSim] : pedacos);
    },
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Pesquisar outras logitechs que atuam aqui no brasil.');
  await esperar();

  /* 15/09/2026: não há mais um "Buscar agora" a clicar. O clique em
     "Pesquisar" roda planejar E buscar, e é isso que se confere aqui:
     as duas chamadas saíram de um gesto só, e nenhum botão de
     confirmação apareceu no meio. */
  const noPortao = t.thread.textContent;
  conferir('1c0. a busca saiu sem uma segunda confirmação',
    t.chamadas.some((c) => c.caminho.endsWith('/buscar')) &&
      ![...t.thread.querySelectorAll('[data-narracao-saida]')]
        .some((b) => /Buscar agora|Agora não/.test(b.textContent)),
    noPortao.slice(-300));
  await esperar(250);

  /* 15/09/2026: o rascunho da Fase 2 saiu. O resultado vai direto
     para o board, e é isso que se confere aqui — nenhum dialog no
     meio do caminho. */
  conferir('1e0. o resultado foi direto ao board, sem dialog',
    !t.window.document.querySelector('dialog.rascunho') && t.quadros.length > 0,
    JSON.stringify(t.quadros));
  await esperar();

  const txt = t.thread.textContent;
  conferir('1a. chamou a rota em etapas, não a de dois passos',
    t.chamadas.some((c) => c.caminho.endsWith('/investigar')) &&
    !t.chamadas.some((c) => c.caminho.endsWith('/planejar')),
    JSON.stringify(t.chamadas.map((c) => c.caminho)));

  conferir('1b. os quadros partidos entre leituras foram remontados (nenhum passo perdido)',
    /Li o que a empresa já sabe/.test(txt) &&
    /Não vou perguntar 2/.test(txt) &&
    /Escrevi 4 pergunta/.test(txt) &&
    /Busquei — 5 fonte/.test(txt), txt);

  conferir('1c. o plano apareceu com as perguntas, antes da busca',
    /Vou buscar:/.test(txt) && /Quais marcas de periféricos/.test(txt), txt.slice(0, 600));

  /* 15/09/2026: o preço SAIU da jornada, por decisão do Ricardo.
     Valor num lugar só: Configurações → Créditos de uso → Histórico
     de uso. */
  conferir('1d. nenhum preço em lugar nenhum da narração',
    !/R\$/.test(noPortao) && !/volta para o saldo/.test(noPortao), noPortao);

  conferir('1e. o ganho de ler o conhecimento interno ficou visível',
    /Não vou perguntar/.test(txt), txt);

  conferir('1f. o resultado virou quadro no board', t.quadros.length > 0, JSON.stringify(t.quadros));

  conferir('1g. a narração fechou dizendo quantos quadros nasceram',
    /Montei \d+ quadro/.test(txt), txt.slice(-300));

  conferir('1h. sem barra de progresso e sem percentual',
    !/%/.test(txt) && !/progress/i.test(t.thread.innerHTML), txt);
}

/* ---------------------------------------------------------------
   2. O planejador recusa — e BOARD-PESQUISA-012 continua valendo
   --------------------------------------------------------------- */
{
  const fluxoSSE =
    quadro('passo', { texto: 'A empresa ainda não tem conhecimento finalizado para esta categoria — vou da estaca zero.' }) +
    quadro('parado', {
      mensagem: 'Definir a proposta de valor é decisão do time, não fato externo.',
      saidas: [{ nivel: 'busca', rotulo: 'Buscar assim mesmo', explicacao: 'Procuro em fontes públicas. Custa crédito.' }],
    });

  const t = montar({
    rotas: (c) => {
      if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
      if (c.endsWith('/consultar')) {
        return { status: 200, corpo: { resultado: 'entregue', resposta: 'Achei algo.', fontes: [{ url: 'https://x.com', titulo: 'X' }] } };
      }
      return { status: 200, corpo: {} };
    },
    fluxo: (chamadas) => async (caminho, opcoes) => {
      chamadas.push({ caminho, corpo: opcoes.corpo });
      return respostaSSE([fluxoSSE]);
    },
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Definir nossa proposta de valor');
  await esperar();

  const botao = t.thread.querySelector('[data-narracao-saida="busca"]');
  conferir('2a. a recusa do planejador veio com o botão de saída',
    !!botao && /decisão do time/.test(t.thread.textContent), t.thread.textContent.slice(0, 400));

  botao.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar(100);

  const consultas = t.chamadas.filter((c) => c.caminho.endsWith('/consultar'));
  conferir('2b. clicar caiu no caminho direto, com nivelConfirmado',
    consultas.length === 1 && consultas[0].corpo.nivelConfirmado === 'busca',
    JSON.stringify(t.chamadas.map((c) => c.caminho + ' ' + JSON.stringify(c.corpo || {}))));

  conferir('2c. não replanejou o que uma pessoa acabou de decidir',
    t.chamadas.filter((c) => c.caminho.endsWith('/investigar')).length === 1, '');

  conferir('2d. continuou na MESMA entrada da narração',
    new Set([...t.thread.querySelectorAll('section[data-narracao]')].map((s) => s.getAttribute('data-narracao'))).size === 1,
    t.thread.innerHTML.slice(0, 300));
}

/* ---------------------------------------------------------------
   2b. Falha e vazio continuam sendo coisas diferentes (PES-008)
   --------------------------------------------------------------- */
{
  for (const [nome, corpoFim, marca] of [
    ['falhou', { resultado: 'falhou' }, /não completou/],
    ['vazio', { resultado: 'vazio' }, /não encontrei nada/],
  ]) {
    const t = montar({
      rotas: rotasBase,
      fluxo: () => async () => respostaSSE([quadro('fim', corpoFim)]),
    });
    await t.window.PesquisaPainel.pesquisarNoQuadro('Quantas lojas a Centauro tem');
    await esperar();
    conferir(`2b. "${nome}" tem texto próprio na narração`,
      marca.test(t.thread.textContent), t.thread.textContent);
  }
}

/* ---------------------------------------------------------------
   3. A conexão cai no meio — sem `fim`, sem `erro`
   --------------------------------------------------------------- */
{
  const t = montar({
    rotas: rotasBase,
    fluxo: () => async () => respostaSSE([quadro('passo', { texto: 'Li o que a empresa já sabe: 1 trecho.' })]),
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Pesquisar concorrentes');
  await esperar();

  conferir('3. stream cortado no meio vira aviso, não narração girando para sempre',
    /conexão caiu no meio/i.test(t.thread.textContent), t.thread.textContent);
}

/* ---------------------------------------------------------------
   4. Erro ANTES do stream (402) chega como erro normal
   --------------------------------------------------------------- */
{
  const t = montar({
    rotas: rotasBase,
    fluxo: () => async () => {
      const e = new Error('Créditos insuficientes para esta investigação. Recarregue para continuar.');
      e.status = 402;
      e.dados = {};
      throw e;
    },
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Pesquisar concorrentes');
  await esperar();

  conferir('4. 402 antes do stream vira falha legível na narração',
    /Créditos insuficientes/.test(t.thread.textContent), t.thread.textContent);
}

/* ---------------------------------------------------------------
   5. A narração continua fora do contexto do modelo
   --------------------------------------------------------------- */
{
  const t = montar({
    rotas: (c) => {
      if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
      if (c.endsWith('/ia/conversa')) return { status: 200, corpo: { mensagens: [], ia_disponivel: true } };
      if (c.endsWith('/ia/perguntas')) return { status: 200, corpo: { mensagem: { id: '2', autor: 'ia', texto: 'olá' } } };
      return { status: 200, corpo: {} };
    },
    fluxo: () => async () =>
      respostaSSE([
        quadro('passo', { texto: 'Li o que a empresa já sabe: 3 trechos.' }) +
        quadro('fim', { resultado: 'entregue', resposta: 'Resposta.', fontes: [] }),
      ]),
  });

  t.window.IaAssistente.carregar();
  await esperar();
  await t.window.PesquisaPainel.pesquisarNoQuadro('Pesquisar concorrentes');
  await esperar();

  t.window.document.getElementById('assistantInput').value = 'e aí?';
  t.window.document.getElementById('iaEnviar').dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar();

  const pergunta = t.chamadas.find((c) => c.caminho.endsWith('/ia/perguntas'));
  conferir('5. nenhuma etapa da investigação foi ao modelo (IA-CONV-NARRA-003)',
    pergunta && !/Li o que a empresa|Busquei|Investigando/.test(JSON.stringify(pergunta.corpo)),
    JSON.stringify(pergunta && pergunta.corpo));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
