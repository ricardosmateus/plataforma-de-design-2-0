/* Prova da recuperação (Fase 1b) com DOM real.
   O caso que ela fecha: a aba fechou no meio, o servidor terminou,
   cobrou e gravou — e o resultado já pago tem que voltar. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) => fs.readFileSync(`${BASE}/${f}`, 'utf8'));

const MARCACAO = `
  <div id="paneAssistente"><div class="assistant-thread" id="iaThread"></div>
    <textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
  <div id="panePesquisa"><div id="pesquisaCorpo"></div>
    <textarea id="pesquisaInput"></textarea><span id="pesquisaAviso"></span><button id="pesquisaEnviar"></button></div>
  <button id="tabAssistente"></button><button id="tabPesquisa"></button>`;

function montar(rotas) {
  const dom = new JSDOM(`<!doctype html><body>${MARCACAO}</body>`, {
    url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder;
  const chamadas = [];
  window.fetch = async (url, opcoes) => {
    const caminho = String(url).replace('http://localhost:3333', '');
    chamadas.push({ caminho, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
    const r = rotas(caminho) || { status: 200, corpo: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo ?? {} };
  };
  const quadros = [];
  window.criarQuadroResultado = (t, i) => { quadros.push({ t, n: i.length }); return {}; };
  window.criarQuadroDocumento = (t) => { quadros.push({ t, doc: true }); return {}; };
  window.dispararAutosave = () => {};
  window.mostrarMensagem = () => {};
  window.EmpresaAtual = { id: 'e1' }; window.ProjetoAtual = { id: 'p1' };
  for (const js of [apiJs, iaJs, pesqJs]) {
    const tag = window.document.createElement('script'); tag.textContent = js;
    window.document.body.appendChild(tag);
  }
  return { window, chamadas, quadros, thread: window.document.getElementById('iaThread') };
}

const esperar = (ms = 120) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`); if (!ok) falhas++; };

const SESSAO = { status: 200, corpo: { sessoes: [{ id: 's1' }] } };

const ENTREGUE = {
  id: 'inv1', estado: 'entregue', pergunta: 'Pesquisar outras logitechs que atuam aqui no brasil.',
  passos: ['Li o que a empresa já sabe: 3 trechos validados.', 'Escrevi 4 perguntas verificáveis.', 'Busquei — 5 fontes.'],
  plano: { perguntas: [{ pergunta: 'Quais marcas?', porque: 'x' }], ja_sabido: [] },
  fecho: 'Pronto.',
  criado_em: new Date(Date.now() - 42000).toISOString(),
  encerrado_em: new Date(Date.now() - 12000).toISOString(),
  resultado: 'entregue',
  resposta: 'A Logitech compete com Razer e HyperX no Brasil.',
  fontes: [{ url: 'https://a.com', titulo: 'A' }],
};

/* 1. A aba fechou no meio; o servidor terminou. */
{
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    if (c.endsWith('/investigacao')) return { status: 200, corpo: { investigacao: ENTREGUE } };
    return { status: 200, corpo: {} };
  });
  await esperar();

  conferir('1a. procurou a investigação anterior sozinha, ao abrir a página',
    t.chamadas.some((c) => c.caminho.endsWith('/investigacao')), JSON.stringify(t.chamadas.map((c) => c.caminho)));
  conferir('1b. não criou sessão nova só para olhar',
    !t.chamadas.some((c) => c.caminho === '/pesquisa/sessoes' && c.corpo), JSON.stringify(t.chamadas.map((c) => c.caminho)));

  /* 16/09/2026, decisão do Ricardo: PROCURAR continua (é assim que o
     relatório fica disponível e que uma busca em curso é reencontrada),
     mas investigação TERMINADA não vira mais entrada no assistente.
     Desde que o rascunho saiu, a pesquisa já grava os quadros no board
     — então abrir a tarefa e ler um resumo do que está na tela, com um
     botão que só duplicaria, era eco. */
  conferir('1c. mas NÃO remonta a narração de quem já terminou',
    !/Li o que a empresa já sabe/.test(t.thread.textContent),
    t.thread.textContent.slice(0, 300));
  conferir('1d. e nada nasce no board por conta própria',
    t.quadros.length === 0, JSON.stringify(t.quadros));

  /* A PORTA CONTINUA ABERTA, e isto é o que separa "calar" de
     "perder": a pesquisa em curso que termina depois (§2), e o pedido
     explícito — "Ver a resposta que já existe" de BOARD-PESQUISA-077 —
     remontam tudo. Sem isso, uma busca já paga se perderia em silêncio. */
  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(150);
  const txt = t.thread.textContent;

  conferir('1e. a pedido, remonta com os passos gravados',
    /Li o que a empresa já sabe/.test(txt) && /Busquei — 5 fontes/.test(txt), txt);
  conferir('1f. com o tempo real, não "0s"',
    /(3[0-9]|4[0-9])s/.test(txt), txt.slice(0, 200));
  conferir('1g. ainda sem criar quadro sozinho', t.quadros.length === 0, JSON.stringify(t.quadros));

  const botao = t.thread.querySelector('[data-narracao-saida="trazer"]');
  conferir('1h. e oferecendo trazer o resultado, como gesto explícito', !!botao, t.thread.innerHTML.slice(0, 400));
  conferir('1i. dizendo que não custa nada — a busca já foi paga',
    /não custa nada/i.test(txt), txt.slice(-200));

  botao.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  await esperar();
  conferir('1j. o clique trouxe o resultado já pago para o quadro',
    t.quadros.length > 0, JSON.stringify(t.quadros));
}

/* 2. Ainda correndo: volta a perguntar até terminar. */
{
  let vezes = 0;
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    if (c.endsWith('/investigacao')) {
      vezes++;
      return vezes < 2
        ? { status: 200, corpo: { investigacao: { ...ENTREGUE, estado: 'correndo', encerrado_em: null, fecho: '', resultado: null, resposta: null } } }
        : { status: 200, corpo: { investigacao: ENTREGUE } };
    }
    return { status: 200, corpo: {} };
  });
  await esperar(150);
  conferir('2a. investigação em curso aparece como em curso',
    /Investigando/.test(t.thread.textContent), t.thread.textContent.slice(0, 200));

  await esperar(4500);
  conferir('2b. quando ela termina, a tela percebe sem ninguém recarregar',
    vezes >= 2 && /Pronto\./.test(t.thread.textContent), `vezes=${vezes} ` + t.thread.textContent.slice(0, 300));
  conferir('2c. só uma entrada na tela, não uma por pergunta ao servidor',
    t.thread.querySelectorAll('section[data-narracao]').length === 1,
    String(t.thread.querySelectorAll('section[data-narracao]').length));
}

/* 3. Nada gravado: a página abre igual. */
{
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return { status: 200, corpo: { sessoes: [] } };
    return { status: 200, corpo: {} };
  });
  await esperar();
  conferir('3a. sem investigação anterior, nada aparece',
    t.thread.querySelectorAll('section[data-narracao]').length === 0, t.thread.innerHTML);
  conferir('3b. e não foi perguntar por investigação sem ter sessão',
    !t.chamadas.some((c) => c.caminho.endsWith('/investigacao')), JSON.stringify(t.chamadas.map((c) => c.caminho)));
}

/* 4. A rota falha: a página continua inteira. */
{
  const t = montar((c) => {
    if (c.startsWith('/pesquisa/sessoes?')) return SESSAO;
    if (c.endsWith('/investigacao')) return { status: 500, corpo: { mensagem: 'boom' } };
    return { status: 200, corpo: {} };
  });
  await esperar();
  conferir('4. falha na recuperação não põe erro na cara de quem acabou de abrir a tela',
    !/boom/.test(t.thread.textContent), t.thread.textContent);
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
