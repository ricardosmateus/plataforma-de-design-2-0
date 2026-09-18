/* Prova da Fase 0 com DOM real.
   Carrega js/api.js, js/ia.js e js/pesquisa.js num jsdom, com a rede
   stubbada, e percorre os caminhos que a Fase 0 mudou. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const apiJs = fs.readFileSync(`${BASE}/api.js`, 'utf8');
const iaJs = fs.readFileSync(`${BASE}/ia.js`, 'utf8');
const pesqJs = fs.readFileSync(`${BASE}/pesquisa.js`, 'utf8');

const MARCACAO = `
  <div class="assistant-pane" id="paneAssistente">
    <div class="assistant-thread" id="iaThread" aria-live="polite"></div>
    <textarea id="assistantInput"></textarea>
    <span id="iaAviso"></span>
    <button id="iaEnviar">Enviar</button>
  </div>
  <div id="panePesquisa">
    <div id="pesquisaCorpo"></div>
    <textarea id="pesquisaInput"></textarea>
    <span id="pesquisaAviso"></span>
    <button id="pesquisaEnviar">Pesquisar</button>
  </div>
  <button id="tabAssistente"></button>
  <button id="tabPesquisa"></button>
`;

function montar(rotas) {
  const dom = new JSDOM(`<!doctype html><body>${MARCACAO}</body>`, {
    url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1',
    runScripts: 'dangerously',
  });
  const { window } = dom;

  const chamadas = [];
  window.fetch = async (url, opcoes) => {
    const caminho = String(url).replace('http://localhost:3333', '');
    const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
    chamadas.push({ caminho, corpo });
    const r = rotas(caminho, corpo, chamadas) || { status: 200, corpo: {} };
    /* Rota de stream: devolve um corpo legível, como `fetch` devolve
       de verdade. Sem isto, `API.fluxo` recebe uma resposta sem
       `body` e o erro que aparece na tela é um TypeError — que não
       prova nada sobre o produto. */
    if (r.sse) {
      let i = 0;
      const enc = new TextEncoder();
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(r.sse) } : { done: true }) }) },
      };
    }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: () => 'application/json' },
      json: async () => r.corpo ?? {},
      text: async () => JSON.stringify(r.corpo ?? {}),
    };
  };

  // o que o board oferece ao painel de pesquisa
  const quadros = [];
  window.criarQuadroResultado = (t, itens) => { quadros.push({ tipo: 'postits', t, n: itens.length }); return {}; };
  window.criarQuadroDocumento = (t) => { quadros.push({ tipo: 'documento', t }); return {}; };
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

  return { window, chamadas, quadros, toasts, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const SESSAO = { status: 200, corpo: { sessoes: [{ id: 's1' }] } };
const evento = (nome, dados) => `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
const SAIDA_BUSCA = {
  nivel: 'busca',
  rotulo: 'Buscar assim mesmo',
  explicacao: 'Procuro em fontes públicas e trago as fontes junto. Custa crédito.',
};
const RESULTADO = {
  status: 200,
  corpo: {
    resultado: 'ok',
    resposta: 'A Logitech compete com Razer e HyperX no Brasil.',
    fontes: [{ url: 'https://a.com', titulo: 'A' }, { url: 'https://b.com', titulo: 'B' }],
  },
};

let falhas = 0;
function conferir(nome, ok, detalhe) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : '\n        ' + detalhe}`);
  if (!ok) falhas++;
}

/* ---------------------------------------------------------------
   1. O caso do Ricardo: conhecimento deixa de ser porta fechada
   --------------------------------------------------------------- */
{
  const IMPEDIMENTO =
    'Li esta tarefa como reflexão, não como um fato para procurar em fonte externa. ' +
    'Posso estar errado — a leitura é por palavra-chave, e nome próprio costuma escapar dela.';

  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    /* A recusa do planejador chega como evento `parado` no stream,
       não como corpo de uma rota de dois passos: desde a Fase 1a é
       `investigar` que atende o botão da tarefa. */
    if (c.endsWith('/investigar')) {
      return {
        sse:
          evento('aberta', { investigacao_id: 'inv-f0' }) +
          evento('passo', { texto: 'Li a tarefa como "resposta direta".' }) +
          evento('parado', { mensagem: IMPEDIMENTO, saidas: [SAIDA_BUSCA] }),
      };
    }
    if (c.endsWith('/consultar')) return RESULTADO;
    return { status: 200, corpo: {} };
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Pesquisar outras logitechs que atuam aqui no brasil.');
  await esperar();

  const txt = t.thread.textContent;
  conferir('1a. a investigação abriu uma entrada no assistente',
    /Investigando/.test(txt), t.thread.innerHTML.slice(0, 200));
  conferir('1b. a entrada mostra a tarefa que a pessoa escreveu',
    /outras logitechs/.test(txt), txt.slice(0, 200));
  conferir('1c. narrou como leu a tarefa, antes de recusar',
    /Li a tarefa como "resposta direta"/.test(txt), txt.slice(0, 300));
  conferir('1d. o texto novo substituiu o "reescreva a tarefa"',
    /Posso estar errado/.test(txt) && !/[Rr]eescreva/.test(txt), txt.slice(0, 400));

  const botao = t.thread.querySelector('[data-narracao-saida="busca"]');
  conferir('1e. o botão "Buscar assim mesmo" está na tela', !!botao, t.thread.innerHTML.slice(0, 400));
  conferir('1f. a explicação diz que custa crédito antes do clique',
    /Custa crédito/.test(txt), txt.slice(-300));

  // --- clicar ---
  botao.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar(80);

  const consultas = t.chamadas.filter((c) => c.caminho.endsWith('/consultar'));
  conferir('1g. o clique chamou consultar exatamente uma vez', consultas.length === 1,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
  conferir('1h. e mandou nivelConfirmado: busca — o mecanismo que existia e nunca era usado',
    consultas[0] && consultas[0].corpo.nivelConfirmado === 'busca',
    JSON.stringify(consultas[0] && consultas[0].corpo));
  conferir('1i. não replanejou: uma pessoa já decidiu',
    t.chamadas.filter((c) => c.caminho.endsWith('/investigar')).length === 1,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));

  const depois = t.thread.textContent;
  conferir('1j. a narração continuou na MESMA entrada, dizendo o que foi escolhido',
    /Você escolheu: Buscar assim mesmo/.test(depois) &&
    t.thread.querySelectorAll('[data-narracao]').length > 0 &&
    new Set([...t.thread.querySelectorAll('section[data-narracao]')].map((s) => s.getAttribute('data-narracao'))).size === 1,
    depois.slice(0, 400));
  conferir('1k. narrou as fontes e o quadro — fatos consumados',
    /2 fontes/.test(depois) && /quadro/.test(depois), depois.slice(0, 500));
  conferir('1l. o quadro entrou no board', t.quadros.length > 0, JSON.stringify(t.quadros));
  conferir('1m. nenhuma barra de progresso, nenhum percentual',
    !/%/.test(depois) && !/progress/i.test(t.thread.innerHTML), depois);
}

/* ---------------------------------------------------------------
   2. O 409 de nível ambíguo ganha interface (limite L3)
   --------------------------------------------------------------- */
{
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    if (c.endsWith('/investigar')) {
      return {
        sse:
          evento('aberta', { investigacao_id: 'inv-f0b' }) +
          evento('parado', {
            mensagem: 'Não entro em sites específicos como LinkedIn ou Instagram.',
            saidas: [SAIDA_BUSCA, { nivel: 'lugares', rotulo: 'Buscar por proximidade', explicacao: 'Unidades e endereços perto de você.' }],
          }),
      };
    }
    return { status: 200, corpo: {} };
  });

  await t.window.PesquisaPainel.pesquisarNoQuadro('Entrar no site deles e ver as unidades perto de mim');
  await esperar();

  const botoes = [...t.thread.querySelectorAll('[data-narracao-saida]')];
  conferir('2a. a ambiguidade virou duas opções, não um pedido para reescrever',
    botoes.length === 2, t.thread.textContent.slice(0, 400));
  conferir('2b. as duas opções são as que executam de verdade',
    botoes.map((b) => b.getAttribute('data-narracao-saida')).join(',') === 'busca,lugares',
    botoes.map((b) => b.getAttribute('data-narracao-saida')).join(','));
  conferir('2c. navegação não é oferecida — PES-005 vale mesmo aqui',
    !botoes.some((b) => b.getAttribute('data-narracao-saida') === 'navegacao'), '');

  // dois cliques = uma busca só
  botoes[0].dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  botoes[1].dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar(80);
  conferir('2d. um segundo clique não dispara uma segunda busca paga',
    t.chamadas.filter((c) => c.caminho.endsWith('/consultar')).length === 1,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
}

/* ---------------------------------------------------------------
   3. Falha e vazio continuam sendo coisas diferentes (PES-008)
   --------------------------------------------------------------- */
{
  /* `falhou` e `vazio` chegam no `fim` do stream de busca — e nem um
     nem outro abre rascunho: não há o que curar em "não achei". */
  for (const [nome, resultado, marca] of [
    ['falhou', 'falhou', /não completou/],
    ['vazio', 'vazio', /não encontrei nada/],
  ]) {
    const t = montar((c) => {
      if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
      if (c.endsWith('/investigar')) {
        return {
          sse:
            evento('aberta', { investigacao_id: 'inv-f0c' }) +
            evento('plano', { perguntas: [{ pergunta: 'Quantas lojas a Centauro tem?' }] }) +
            evento('aguardando', { investigacao_id: 'inv-f0c', estimativa_micros: 90000, estimativa_formatada: 'R$ 0,09' }),
        };
      }
      if (c.endsWith('/buscar')) {
        return { sse: evento('fim', { investigacao_id: 'inv-f0c', resultado, resposta: '', fontes: [] }) };
      }
      return { status: 200, corpo: {} };
    });
    /* 15/09/2026: não há mais um "Buscar agora" para clicar — o clique
       em "Pesquisar" já roda a pesquisa inteira. A busca sai sozinha
       atrás do plano, e o que se confere aqui continua sendo o mesmo:
       cada fim de investigação tem texto próprio na narração. */
    await t.window.PesquisaPainel.pesquisarNoQuadro('Quantas lojas a Centauro tem');
    await esperar(260);
    conferir(`3. "${nome}" tem texto próprio na narração`, marca.test(t.thread.textContent), t.thread.textContent);
  }
}

/* ---------------------------------------------------------------
   4. A REGRA QUE SUSTENTA AS OUTRAS (IA-CONV-NARRA-003):
      narração não é mensagem e não vai ao modelo
   --------------------------------------------------------------- */
{
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    if (c.endsWith('/investigar')) {
      return {
        sse:
          evento('aberta', { investigacao_id: 'inv-f0d' }) +
          evento('plano', { perguntas: [{ pergunta: 'Quantas lojas a Centauro tem?' }] }) +
          evento('aguardando', { investigacao_id: 'inv-f0d', estimativa_micros: 90000, estimativa_formatada: 'R$ 0,09' }),
      };
    }
    if (c.endsWith('/ia/conversa')) return { status: 200, corpo: { mensagens: [], ia_disponivel: true } };
    if (c.endsWith('/ia/perguntas')) {
      /* forma real da resposta: UMA mensagem, a do assistente */
      return { status: 200, corpo: { mensagem: { id: '2', autor: 'ia', texto: 'olá' } } };
    }
    return { status: 200, corpo: {} };
  });

  t.window.IaAssistente.carregar();
  await esperar();
  await t.window.PesquisaPainel.pesquisarNoQuadro('Quantas lojas a Centauro tem');
  await esperar();

  conferir('4a. a narração está na tela', /Investigando/.test(t.thread.textContent), '');

  // agora a pessoa pergunta ao assistente
  t.window.document.getElementById('assistantInput').value = 'e aí, o que você acha?';
  t.window.document.getElementById('iaEnviar').dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar(80);

  const pergunta = t.chamadas.find((c) => c.caminho.endsWith('/ia/perguntas'));
  const enviado = JSON.stringify(pergunta && pergunta.corpo);
  conferir('4b. a pergunta ao assistente saiu', !!pergunta, JSON.stringify(t.chamadas.map((c) => c.caminho)));
  conferir('4c. NADA da narração foi junto para o modelo',
    !/Investigando|Busquei|Montei|quadro no board/.test(enviado), enviado);
  conferir('4d. e a narração continua visível na tela depois da resposta',
    /Investigando/.test(t.thread.textContent) && /olá/.test(t.thread.textContent),
    t.thread.textContent.slice(0, 300));

  /* A ORDEM DA CONVERSA (16/09/2026). Mensagens e narrações vivem em
     listas separadas — regra de IA-CONV-NARRA-003, e ela não muda. Mas
     a TELA desenhava todas as mensagens e DEPOIS todas as narrações, o
     que empurrava a investigação para o fim toda vez que alguém
     mandava uma mensagem nova: a pergunta de agora aparecia ANTES da
     investigação de antes, e a conversa deixava de fazer sentido de
     cima para baixo.

     Aqui a narração aconteceu PRIMEIRO; a pergunta e a resposta vieram
     depois. É isso que a tela tem de mostrar. */
  const filhos = [...t.thread.children];
  const iNarracao = filhos.findIndex((el) => el.classList.contains('ia-narracao'));
  const iPergunta = filhos.findIndex((el) => /o que você acha/.test(el.textContent || ''));
  const iResposta = filhos.findIndex((el) => /olá/.test(el.textContent || ''));
  const mapa = filhos.map((el) => (el.classList.contains('ia-narracao')
    ? '[narração]' : '[' + (el.textContent || '').trim().slice(0, 20) + ']')).join(' ');

  conferir('4e. os três estão na tela como itens próprios',
    iNarracao >= 0 && iPergunta >= 0 && iResposta >= 0, mapa);
  conferir('4f. e na ordem em que aconteceram: narração, pergunta, resposta',
    iNarracao < iPergunta && iPergunta < iResposta, mapa);
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
