/* Prova do RELATÓRIO (Fase 3c) com DOM real.

   A regra que mais importa aqui: **o que foi descartado entra no
   relatório.** É isso que separa um relatório de um resumo. Quem lê
   amanhã precisa poder perguntar "o que mais apareceu e não ficou?"
   — um documento que esconde o que foi jogado fora não é auditável,
   é propaganda do próprio resultado.

   E a segunda: o arquivo é montado NA HORA do clique. Entre entregar
   o resultado e baixar, a pessoa pode ter perguntado ao caderno — e
   essas perguntas fazem parte do que a investigação apurou. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const CONSULTA = 'c-800';

const A1 = 'A Loggi conta com mais de 1.700 pontos de coleta espalhados pelo Brasil, todos comerciais.';
const A2 = 'Não há registro público de LoggiPonto instalado dentro de condomínio residencial.';
const A3 = 'Estimativas de mercado sugerem crescimento de lockers em condomínios.';
const RESPOSTA = `## LoggiPonto\n\n${A1}\n\n${A2}\n\n## Mercado\n\n${A3}`;

const FONTES = [
  { url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto', trecho: 'pontos oficiais para envio' },
  { url: 'https://pt.wikipedia.org/wiki/Loggi', titulo: 'Wikipédia', trecho: '1.700 pontos' },
];

const PERGUNTAS = [
  { pergunta: 'O LoggiPonto aceita condomínios como ponto?', porque: 'É o produto que faria isso.' },
  { pergunta: 'Há registro de LoggiPonto em condomínio residencial?', porque: 'É a tarefa, literalmente.' },
];
const JA_SABIDO = ['A Loggi atua em logística de última milha no Brasil.'];

const afirmacao = (texto, fonteIds) => ({
  texto, fonteIds,
  trechos: fonteIds.map((i) => FONTES[i].trecho),
  semFonte: fonteIds.length === 0,
  inicio: RESPOSTA.indexOf(texto),
  removida: null,
});
const AFIRMACOES = [afirmacao(A1, [1]), afirmacao(A2, [0]), afirmacao(A3, [])];

const RESPOSTA_CADERNO = 'Isso não está nas fontes desta investigação.';

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-800' }],
  ['plano', { perguntas: PERGUNTAS, ja_sabido: JA_SABIDO }],
  ['aguardando', { investigacao_id: 'inv-800', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);
const STREAM_BUSCA = quadros([
  ['fim', {
    investigacao_id: 'inv-800', consulta_id: CONSULTA, resultado: 'entregue',
    resposta: RESPOSTA, fontes: FONTES, afirmacoes: AFIRMACOES,
    perguntas: PERGUNTAS, ja_sabido: JA_SABIDO,
    custo_micros: 380_000, custo_formatado: 'R$ 0,38',
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

  /* jsdom não implementa Blob→texto de forma síncrona nem
     createObjectURL. O que a prova precisa saber é O QUE seria
     baixado e com que nome, então o Blob guarda o texto cru. */
  /* O evento que board.html ouve para revelar o botão "Download".
     Escutado ANTES de os scripts rodarem, porque a investigação
     recuperada pode publicá-lo já no carregamento. */
  const eventosRelatorio = [];
  window.document.addEventListener('pesquisa:relatorio', (ev) => {
    eventosRelatorio.push(!!(ev.detail && ev.detail.disponivel));
  });

  const baixados = [];
  window.Blob = class {
    constructor(partes, opcoes) { this.texto = partes.join(''); this.type = (opcoes || {}).type; }
  };
  window.URL.createObjectURL = (b) => { baixados.push({ blob: b }); return 'blob:fake'; };
  window.URL.revokeObjectURL = () => {};
  const clicadoEm = [];
  const criarOriginal = window.document.createElement.bind(window.document);
  window.document.createElement = function (tag) {
    const el = criarOriginal(tag);
    if (String(tag).toLowerCase() === 'a') {
      el.click = function () { clicadoEm.push({ nome: el.download, href: el.href }); };
    }
    return el;
  };

  window.fetch = async (u, o) => ({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => {
      const s = String(u);
      if (s.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
      if (s.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
      if (s.endsWith('/perguntar')) return { resposta: RESPOSTA_CADERNO, custo_formatado: 'R$ 0,02' };
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

  return { window, baixados, clicadoEm, eventosRelatorio, quadros: feitos, doc: window.document, thread: window.document.getElementById('iaThread') };
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

/* Da tarefa ao quadro. Desde 15/09/2026 é um clique só: nem portão,
   nem rascunho. */
async function ateOQuadro(t) {
  t.window.IaAssistente.carregar();
  await esperar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(260);
}

/* ============================================================
   1. O arquivo sai, com nome que serve para alguma coisa
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);

  /* 16/09/2026: o relatório saiu da narração e virou o botão
     "Download" no painel da tarefa. Quem o desenha é board.html, que
     esta prova não carrega — então o que se confere aqui é o CONTRATO
     que board.html consome: `temRelatorio()` diz se o botão aparece, e
     `baixarRelatorio()` é o que o clique chama. */
  conferir('1a. a investigação anuncia que há relatório',
    t.window.PesquisaPainel.temRelatorio() === true, 'temRelatorio() devolveu falso');
  conferir('1a2. e avisou a tela, para o botão poder aparecer',
    t.eventosRelatorio.length >= 1 && t.eventosRelatorio[t.eventosRelatorio.length - 1] === true,
    JSON.stringify(t.eventosRelatorio));

  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();

  conferir('1b. um arquivo foi gerado', t.baixados.length === 1, String(t.baixados.length));
  conferir('1c. como markdown', ultimo(t).blob.type.startsWith('text/markdown'), ultimo(t).blob.type);

  const nome = t.clicadoEm[t.clicadoEm.length - 1];
  /* Uma pasta com cinco "investigacao.md" não serve para nada. */
  conferir('1d. o nome vem da tarefa e traz a data',
    !!nome && /loggi/.test(nome.nome) && /\d{4}-\d{2}-\d{2}\.md$/.test(nome.nome),
    nome && nome.nome);

  /* A narração NÃO fala mais do download: quem baixa vê o arquivo
     chegar no navegador, e um aviso confirmando o que a pessoa acabou
     de ver seria ruído. O relato de falha ficou com board.html, que é
     quem tem o toast. */
  conferir('1e. e a narração não fala do download',
    !/Baixei o relatório/.test(t.thread.textContent), t.thread.textContent.slice(-300));
}

/* ============================================================
   2. O conteúdo: a investigação inteira, não um resumo
   ============================================================ */
{
  const t = montar();
  await ateOQuadro(t);
  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();

  const md = ultimo(t).blob.texto;

  conferir('2a. a tarefa está no título', md.startsWith('# Investigação — ' + TAREFA), md.slice(0, 120));
  conferir('2b. as perguntas que foram escritas estão lá',
    /LoggiPonto aceita condomínios/.test(md) && /registro de LoggiPonto/.test(md), md.slice(0, 700));
  conferir('2c. com o porquê de cada uma', /É a tarefa, literalmente/.test(md), md.slice(0, 700));

  /* A prova visível de que ler o conhecimento interno economiza
     busca. Sem isto o ganho existe e ninguém vê. */
  conferir('2d. o que a empresa já sabia, e por isso não foi perguntado',
    /já sabia/.test(md) && /última milha/.test(md), md.slice(0, 900));

  conferir('2e. os achados citam a fonte pelo número',
    /1\.700 pontos[\s\S]*?\[2\]/.test(md), md.slice(0, 1200));
  conferir('2f. afirmação sem fonte é dita, não escondida',
    /crescimento de lockers.*sem fonte declarada/.test(md), md.slice(0, 1400));

  conferir('2g. as fontes estão listadas com URL', /\[1\] LoggiPonto — https:\/\/www\.loggi\.com/.test(md),
    md.slice(-800));
  conferir('2h. e com o trecho citado', /> pontos oficiais para envio/.test(md), md.slice(-800));

  /* 15/09/2026: o custo saiu do relatório. O rodapé continua dizendo
     o TAMANHO do que foi apurado — fontes, afirmações, o que não
     ficou —, que é o que se audita aqui. O valor mora em Créditos de
     uso, e só lá. */
  conferir('2i. o rodapé conta fontes e afirmações, sem custo',
    !/Custo desta investigação/.test(md) && !/R\$/.test(md) &&
      /fonte\(s\) lida\(s\)/.test(md) && /não mantida\(s\)/.test(md), md.slice(-300));
}

/* ============================================================
   3. A REGRA QUE IMPORTA: o descartado entra
   ============================================================ */
{
  /* A afirmação removida chega pelo BANCO, não por uma caixinha: o
     rascunho saiu em 15/09/2026, e `removida` é o que sobrou dele —
     a decisão de quem curou enquanto ele existia. Reabrir aquela
     investigação tem de honrar a decisão, e o relatório tem de
     continuar dizendo o que apareceu e não ficou. */
  const t = montar({
    investigacaoGuardada: {
      id: 'inv-800', estado: 'entregue', pergunta: TAREFA, passos: [], plano: { perguntas: PERGUNTAS, ja_sabido: JA_SABIDO },
      fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
      consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
      /* DUAS fora: a que a pessoa desmarcou (índice 0) e a que chegou
         SEM FONTE (índice 2). A segunda saía gravada como removida sem
         ninguém a ter tirado — no rascunho ela chegava desligada
         (BOARD-PESQUISA-035), e quem salvava sem ligá-la gravava isso.
         É exatamente o par que faz a seção se chamar "Apareceu e não
         foi mantido", e não "descartado por quem leu". */
      afirmacoes: AFIRMACOES.map((a, i) => ({ ...a, id: 'a' + (i + 1), removida: i === 0 || i === 2 })),
      rascunho_pendente: false, perguntas: [],
    },
  });
  t.window.IaAssistente.carregar();
  await esperar(260);
  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();

  const noQuadro = t.quadros.map((q) => q.texto || '').join('\n');
  conferir('3a. o descartado não foi para o quadro', !/1\.700 pontos de coleta/.test(noQuadro),
    noQuadro.slice(0, 300));

  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();
  const md = ultimo(t).blob.texto;

  conferir('3b. mas ENTRA no relatório, em seção própria',
    /## Apareceu e não foi mantido/.test(md), md.slice(0, 1600));
  conferir('3c. com o texto do que foi jogado fora',
    /Apareceu e não foi mantido[\s\S]*1\.700 pontos de coleta/.test(md), md.slice(0, 1800));
  conferir('3d. e separado dos achados',
    md.indexOf('## Achados') < md.indexOf('## Apareceu'), 'ordem das seções');
  /* O que ficou continua onde deve. */
  conferir('3e. o mantido segue na seção de achados',
    /## Achados[\s\S]*registro público[\s\S]*## Apareceu/.test(md), md.slice(0, 1800));
  /* DUAS: a que a pessoa desmarcou, e a que chegou sem fonte e nunca
     foi ligada. A seção não se chama "descartado por quem leu"
     justamente por causa da segunda — ninguém a tirou, ela nunca
     entrou (BOARD-PESQUISA-035). Chamar isso de descarte seria
     atribuir à pessoa um ato que ela não praticou. */
  conferir('3f. o rodapé conta as duas que não ficaram',
    /2 não mantida\(s\)/.test(md), md.slice(-300));
}

/* ============================================================
   4. O relatório é montado na hora, não na entrega
   ============================================================
   Entre entregar o resultado e baixar, a pessoa perguntou ao
   caderno. Essas perguntas fazem parte do que a investigação
   apurou — um relatório montado na entrega as perderia. */
{
  const t = montar();
  await ateOQuadro(t);

  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();
  const antes = ultimo(t).blob.texto;
  conferir('4a. antes de perguntar, não há seção de caderno',
    !/Perguntas ao caderno/.test(antes), antes.slice(-400));

  clicar(t, saida(t, 'Perguntar sobre estas fontes'));
  await esperar();
  t.doc.getElementById('assistantInput').value = 'e em condomínios comerciais?';
  clicar(t, t.doc.getElementById('iaEnviar'));
  await esperar();

  t.window.PesquisaPainel.baixarRelatorio();
  await esperar();
  const depois = ultimo(t).blob.texto;

  conferir('4b. depois, a conversa entra no relatório',
    /## Perguntas ao caderno/.test(depois) && /condomínios comerciais/.test(depois),
    depois.slice(-700));
  conferir('4c. com a resposta que o caderno deu',
    /não está nas fontes desta investigação/.test(depois), depois.slice(-700));
  /* Dita como o que é: respondida com as fontes, não com o
     conhecimento da empresa. */
  conferir('4d. e dizendo que ela só leu as fontes acima',
    /Respondidas apenas com as fontes acima/.test(depois), depois.slice(-800));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
