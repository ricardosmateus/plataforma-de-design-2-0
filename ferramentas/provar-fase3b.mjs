/* Prova do CADERNO VISÍVEL (Fase 3b) com DOM real.

   "De onde saiu isso?" é a pergunta que o produto inteiro existe
   para responder. Até aqui ela só tinha resposta no momento do
   rascunho — que passa, e depois some.

   O caso que esta prova trava: a pessoa apagou uma afirmação no
   rascunho. A fonte que sustentava aquela frase foi lida e PAGA. Se
   a tela de fontes escondesse as duas, a pergunta "por que paguei
   por esta página?" ficaria sem resposta — e a metade da história
   que some é justamente a que custou dinheiro sem render quadro. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const CONSULTA = 'c-700';

const A1 = 'A Loggi conta com mais de 1.700 pontos de coleta espalhados pelo Brasil, todos comerciais.';
const A2 = 'Não há registro público de LoggiPonto instalado dentro de condomínio residencial.';
const A3 = 'Estimativas de mercado sugerem crescimento de lockers em condomínios.';

const RESPOSTA = `## LoggiPonto\n\n${A1}\n\n${A2}\n\n## Mercado\n\n${A3}`;

const FONTES = [
  { url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto', trecho: 'pontos oficiais para envio' },
  { url: 'https://pt.wikipedia.org/wiki/Loggi', titulo: 'Wikipédia', trecho: '1.700 pontos' },
  { url: 'https://exemplo.com/lida-a-toa', titulo: 'Página lida à toa', trecho: 'nada citado' },
];

const afirmacao = (texto, fonteIds) => ({
  texto,
  fonteIds,
  trechos: fonteIds.map((i) => FONTES[i].trecho),
  semFonte: fonteIds.length === 0,
  inicio: RESPOSTA.indexOf(texto),
  removida: null,
});

const AFIRMACOES = [
  afirmacao(A1, [1]),
  afirmacao(A2, [0]),
  afirmacao(A3, []), // sem fonte declarada
];

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-700' }],
  ['plano', { perguntas: [{ pergunta: TAREFA }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-700', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);
const STREAM_BUSCA = quadros([
  ['fim', {
    investigacao_id: 'inv-700', consulta_id: CONSULTA, resultado: 'entregue',
    resposta: RESPOSTA, fontes: FONTES, afirmacoes: AFIRMACOES,
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

  const rest = [];
  window.fetch = async (u, o) => {
    const caminho = String(u).replace('http://localhost:3333', '');
    rest.push({ caminho, corpo: o && o.body ? JSON.parse(o.body) : null });
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        if (caminho.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
        if (caminho.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
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
const noDlg = (t, sel, r) => {
  const d = t.doc.querySelector(sel);
  return d && [...d.querySelectorAll('button')].find((b) => new RegExp(r).test(b.textContent));
};

/* Vai da tarefa até o quadro. Desde 15/09/2026 isso é um clique só:
   nem portão, nem rascunho — a pesquisa corre e os quadros nascem. */
async function ateOQuadro(t) {
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(260);
}

/* O outro caminho até o quadro: reabrir uma investigação GUARDADA.
   É por aqui que uma afirmação removida chega hoje — `removida` vem
   do banco, de quem curou enquanto o rascunho existia. Era o que a
   opção `desmarcar` simulava clicando numa caixinha; a caixinha saiu,
   o dado continua, e §3 precisa dele. */
function guardadaCom(removidas) {
  return {
    id: 'inv-700', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
    fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
    consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
    afirmacoes: AFIRMACOES.map((a, i) => ({
      ...a, id: 'a' + (i + 1), removida: removidas.includes(i),
    })),
    rascunho_pendente: false,
    perguntas: [],
  };
}

async function doGuardadoAoQuadro(t) {
  await esperar(260);
  /* 16/09/2026: abrir a tarefa NÃO remonta mais investigação
     terminada — os quadros já estão no board, e o resumo era eco. A
     remontagem passou a ser a pedido, que é o que "Ver a resposta que
     já existe" chama. A prova pede pela mesma porta. */
  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(260);
  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();
}

/* ============================================================
   1. A procedência fica, e não custa nada
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);

  conferir('1a. a investigação oferece ver as fontes', !!saida(t, 'Ver as fontes'),
    t.thread.textContent.slice(-400));

  const antes = t.rest.length;
  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();

  const dlg = t.doc.querySelector('dialog.fontes-caderno');
  conferir('1b. a tela abriu', !!dlg, 'sem dialog');
  /* Ela se monta com o que o cliente já tem. Uma rota nova seria uma
     segunda maneira de perguntar a mesma coisa. */
  conferir('1c. sem ida nenhuma ao servidor', t.rest.length === antes,
    JSON.stringify(t.rest.slice(antes).map((x) => x.caminho)));

  const txt = dlg.textContent;
  conferir('1d. cada fonte aparece com título e endereço',
    /LoggiPonto/.test(txt) && /loggi\.com\/loggiponto/.test(txt), txt.slice(0, 400));
  conferir('1e. e com o trecho que sobrevive à página sair do ar',
    /pontos oficiais para envio/.test(txt), txt.slice(0, 500));
  conferir('1f. dizendo o que cada uma sustenta',
    /afirmação\(ões\) apoiada\(s\) nesta fonte/.test(txt), txt.slice(0, 600));
}

/* ============================================================
   2. O que foi lido e não rendeu nada também aparece
   ============================================================
   Uma página lida que nenhuma afirmação citou custou tokens. Sumir
   com ela faria toda leitura parecer produtiva. */
{
  const t = montar();
  await ateOQuadro(t);
  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();

  const dlg = t.doc.querySelector('dialog.fontes-caderno');
  conferir('2a. a página lida à toa está listada', /Página lida à toa/.test(dlg.textContent),
    dlg.textContent.slice(0, 600));
  conferir('2b. e dita como o que é', /nenhuma afirmação citou esta fonte/i.test(dlg.textContent),
    dlg.textContent.slice(0, 800));

  /* PES-006 até o fim: o que não tem procedência é contado aqui
     também, e não some por não caber em nenhuma fonte. */
  conferir('2c. afirmação sem fonte tem bloco próprio',
    !!dlg.querySelector('.fonte-bloco--sem'), dlg.innerHTML.slice(0, 300));
  conferir('2d. com a frase que ficou sem chão',
    /crescimento de lockers/.test(dlg.querySelector('.fonte-bloco--sem').textContent),
    dlg.querySelector('.fonte-bloco--sem').textContent);
}

/* ============================================================
   3. O CASO QUE IMPORTA: a fonte que virou órfã
   ============================================================
   A pessoa tirou A1 do quadro. A Wikipédia, que sustentava só ela,
   não sustenta mais nada — mas foi lida e paga. As duas coisas
   precisam continuar visíveis. */
{
  const t = montar({ investigacaoGuardada: guardadaCom([0]) });
  await doGuardadoAoQuadro(t);

  const tudo = t.quadros.map((q) => q.texto || '').join('\n');
  conferir('3a. a desmarcada não entrou no quadro', !/1\.700 pontos de coleta/.test(tudo),
    tudo.slice(0, 300));

  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();
  const dlg = t.doc.querySelector('dialog.fontes-caderno');
  const txt = dlg.textContent;

  conferir('3b. mas a fonte dela continua listada', /Wikipédia/.test(txt), txt.slice(0, 600));
  conferir('3c. e a frase que ela sustentava também', /1\.700 pontos de coleta/.test(txt),
    txt.slice(0, 700));
  conferir('3d. marcada como tirada pela pessoa, não escondida',
    /você tirou esta do quadro/.test(txt) && !!dlg.querySelector('.fonte-item--fora'),
    txt.slice(0, 800));

  /* A que sustenta algo vem antes da que não sustenta mais nada:
     uma lista que começa pelo que não serviu esconde o que serviu. */
  const titulos = [...dlg.querySelectorAll('.fonte-bloco .fonte-titulo')].map((e) => e.textContent);
  conferir('3e. e a ordem põe primeiro o que sustenta o quadro',
    titulos.indexOf('LoggiPonto') < titulos.indexOf('Wikipédia'), JSON.stringify(titulos));

  /* `.caderno-resumo` desde 16/09/2026: a classe se chamava
     `.rascunho-resumo`, herdada do dialog da Fase 2 que já não existe,
     e o nome mentia sobre quem a usava. */
  const resumo = dlg.querySelector('.caderno-resumo').textContent;
  conferir('3f. o resumo conta quantas ainda sustentam alguma coisa',
    /3 fonte\(s\) lida\(s\)/.test(resumo) && /1 sustenta/.test(resumo), resumo);
}

/* ============================================================
   4. Ver é coisa que se faz mais de uma vez
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);

  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();
  clicar(t, noDlg(t, 'dialog.fontes-caderno', 'Fechar'));
  await esperar();
  conferir('4a. fechar fecha', !t.doc.querySelector('dialog.fontes-caderno'), 'ficou aberto');

  conferir('4b. e o botão continua lá para a próxima vez', !!saida(t, 'Ver as fontes'),
    t.thread.textContent.slice(-400));

  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();
  conferir('4c. que abre de novo', !!t.doc.querySelector('dialog.fontes-caderno'), 'não reabriu');
  /* Uma investigação, um modal: reabrir não pode empilhar cópias. */
  conferir('4d. sem empilhar cópias',
    t.doc.querySelectorAll('dialog.fontes-caderno').length === 1,
    String(t.doc.querySelectorAll('dialog.fontes-caderno').length));
}

/* ============================================================
   5. A procedência sobrevive a fechar a aba
   ============================================================ */
{
  const t = montar({
    investigacaoGuardada: {
      id: 'inv-700', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
      fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
      consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
      afirmacoes: [
        { ...AFIRMACOES[0], id: 'a1', removida: true },
        { ...AFIRMACOES[1], id: 'a2', removida: false },
        { ...AFIRMACOES[2], id: 'a3', removida: false },
      ],
      rascunho_pendente: false,
      perguntas: [],
    },
  });
  await esperar(240);

  /* O relatório é publicado na CARGA, sem pedir nada — é o que revela
     o botão "Download" do painel. Só a NARRAÇÃO é que ficou calada. */
  /* 16/09/2026: o "Download" do painel aparece já no carregamento, sem
     esperar por "Trazer o resultado". A investigação existe e foi paga;
     obrigar a trazer os quadros de volta só para baixar o arquivo seria
     cobrar um gesto por outro. */
  conferir('5a0. o relatório já está disponível antes de trazer o quadro',
    t.window.PesquisaPainel.temRelatorio() === true && t.quadros.length === 0,
    'temRelatorio=' + t.window.PesquisaPainel.temRelatorio() + ' quadros=' + t.quadros.length);

  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(260);
  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();
  conferir('5a. o resultado guardado voltou', t.quadros.length > 0,
    JSON.stringify(t.quadros.map((q) => q.titulo)));

  clicar(t, saida(t, 'Ver as fontes'));
  await esperar();
  const dlg = t.doc.querySelector('dialog.fontes-caderno');
  conferir('5b. e as fontes de ontem estão lá', !!dlg && /Wikipédia/.test(dlg.textContent),
    dlg && dlg.textContent.slice(0, 400));
  conferir('5c. com a decisão de ontem preservada',
    !!dlg && /você tirou esta do quadro/.test(dlg.textContent), dlg && dlg.textContent.slice(0, 700));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
