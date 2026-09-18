/* Prova de que A DECISÃO GRAVADA SOBREVIVE, com DOM real.

   Esta prova nasceu como a prova do RASCUNHO GRAVADO (Fase 2, terceira
   parte). O rascunho SAIU em 15/09/2026 — o resultado vai direto para
   o board —, e com ele saíram as conferências sobre salvar, descartar
   e reabrir o dialog.

   O QUE SOBROU É O QUE IMPORTAVA MAIS, e por isso esta prova continua
   existindo: enquanto o rascunho existiu, gente curou investigações, e
   `removida_pelo_usuario` está gravado no banco por afirmação. Reabrir
   uma daquelas tarefas tem de devolver ao quadro o que a pessoa
   manteve — nem mais, nem menos. É para isso que `agruparEmSecoes` e
   `remontar` ficaram no código depois de o dialog ir embora.

   O caso é o que mais dói: a afirmação removida está no COMEÇO do
   texto. Se as posições das fontes não forem recalculadas em cima do
   que sobrou, todas as fontes seguintes escorregam para o quadro
   errado (`BOARD-PESQUISA-031`) — e o erro é silencioso, porque o
   texto continua bonito. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const CONSULTA = 'c-501';

const A1 = 'A Loggi conta com mais de 1.700 pontos de coleta espalhados pelo Brasil, todos comerciais.';
const A2 = 'Não há registro público de LoggiPonto instalado dentro de condomínio residencial.';
const A3 = 'Outras logtechs brasileiras não divulgam número de pontos em condomínios.';

const RESPOSTA = `## LoggiPonto

${A1}

${A2}

## Outras logtechs

${A3}`;

const FONTES = [
  { url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto' },
  { url: 'https://pt.wikipedia.org/wiki/Loggi', titulo: 'Wikipédia' },
  { url: 'https://exemplo.com/logtechs', titulo: 'Panorama logtechs' },
];

/* Com id, como o servidor passa a devolver desde que as afirmações
   são gravadas. */
const afirmacao = (id, texto, fonteIds, removida = null) => ({
  id,
  texto,
  fonteIds,
  trechos: fonteIds.map((i) => 'trecho de ' + FONTES[i].titulo),
  semFonte: fonteIds.length === 0,
  inicio: RESPOSTA.indexOf(texto),
  removida,
});

const AFIRMACOES = [
  afirmacao('af-1', A1, [0]),
  afirmacao('af-2', A2, [1]),
  afirmacao('af-3', A3, [2]),
];

const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: 'inv-501' }],
  ['plano', { perguntas: [{ pergunta: TAREFA }], ja_sabido: [] }],
  ['aguardando', { investigacao_id: 'inv-501', estimativa_micros: 420_000, estimativa_formatada: 'R$ 0,42' }],
]);

const STREAM_BUSCA = quadros([
  ['passo', { texto: 'Busquei 3 vez(es) · 3 fonte(s).' }],
  [
    'fim',
    {
      investigacao_id: 'inv-501',
      consulta_id: CONSULTA,
      resultado: 'entregue',
      resposta: RESPOSTA,
      fontes: FONTES,
      afirmacoes: AFIRMACOES,
    },
  ],
]);

function montar({ investigacaoGuardada = null } = {}) {
  const dom = new JSDOM(
    `<!doctype html><body>
    <div id="paneAssistente"><div id="iaThread"></div><textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
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

  /* Toda chamada REST fica registrada: é por ela que se prova que a
     decisão foi mandada, e com quais ids. */
  const rest = [];
  window.fetch = async (u, o) => {
    const caminho = String(u).replace('http://localhost:3333', '');
    rest.push({ caminho, corpo: o && o.body ? JSON.parse(o.body) : null, metodo: (o && o.method) || 'GET' });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        if (caminho.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
        if (caminho.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
        return {};
      },
      text: async () => '{}',
    };
  };

  const feitos = [];
  window.criarQuadroResultado = (t, itens) => { feitos.push({ tipo: 'postits', titulo: t, itens }); return {}; };
  window.criarQuadroDocumento = (t, texto, fontes) => { feitos.push({ tipo: 'doc', titulo: t, texto, fontes }); return {}; };
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
    return {
      ok: true,
      status: 200,
      body: { getReader: () => ({ read: async () => (i++ === 0 ? { done: false, value: enc.encode(texto) } : { done: true }) }) },
    };
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
/* ============================================================
   1. Decisão de ontem, quadro de hoje — com as fontes no lugar
   ============================================================
   Este é o cerne. A afirmação do COMEÇO foi removida ontem. Se as
   posições das fontes não forem recalculadas sobre o que sobrou, a
   fonte da segunda afirmação cai no quadro da primeira seção — e
   ninguém percebe, porque o texto continua bonito. */
{
  const curadas = [
    { ...AFIRMACOES[0], removida: true },
    { ...AFIRMACOES[1], removida: false },
    { ...AFIRMACOES[2], removida: false },
  ];
  const t = montar({
    investigacaoGuardada: {
      id: 'inv-501', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
      fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
      consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA,
      fontes: FONTES, afirmacoes: curadas, rascunho_pendente: false,
    },
  });
  await esperar(220);
  /* 16/09/2026: abrir a tarefa não remonta mais investigação
     terminada. A remontagem é a pedido — a mesma porta de "Ver a
     resposta que já existe". */
  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(220);

  conferir('1a. rascunho resolvido não pede para ser resolvido de novo',
    !saida(t, 'Continuar de onde parei'), t.thread.textContent.slice(-300));
  conferir('1b. e oferece trazer o resultado', !!saida(t, 'Trazer o resultado'), t.thread.textContent.slice(-300));

  clicar(t, saida(t, 'Trazer o resultado'));
  await esperar();

  const tudo = t.quadros.map((q) => q.texto || '').join('\n');
  conferir('1c. o que a pessoa removeu ontem não volta hoje', !/1\.700 pontos/.test(tudo), tudo.slice(0, 300));
  conferir('1d. o que ela manteve, sim', /registro público/.test(tudo), tudo.slice(0, 300));

  /* A fonte da afirmação removida não sustenta mais nada: listá-la
     seria procedência de coisa nenhuma. */
  /* O board recebe a fonte como "Título — url" numa string só: é
     esse o contrato entre `pesquisa.js` e `criarQuadroDocumento`. */
  const urls = t.quadros.flatMap((q) => (q.fontes || []).map((f) => (typeof f === 'string' ? f : f.url || '')));
  conferir('1e. a fonte órfã saiu junto', !urls.some((u) => /loggiponto/.test(u)), JSON.stringify(urls));
  conferir('1f. e as que restaram continuam listadas',
    urls.some((u) => /wikipedia/.test(u)), JSON.stringify(urls));

  /* O defeito que BOARD-PESQUISA-031 registrava: todas as fontes
     empilhadas no primeiro quadro. Com as posições recalculadas,
     cada uma volta para o quadro da sua seção. */
  const comFonte = t.quadros.filter((q) => (q.fontes || []).length);
  conferir('1g. as fontes se espalham pelos quadros, não empilham no primeiro',
    comFonte.length > 1 || t.quadros.length === 1,
    JSON.stringify(t.quadros.map((q) => ({ t: q.titulo, f: (q.fontes || []).length }))));
}

/* ============================================================
   2. Descartado ontem fica descartado
   ============================================================ */
{
  const t = montar({
    investigacaoGuardada: {
      id: 'inv-501', estado: 'entregue', pergunta: TAREFA, passos: [], plano: null,
      fecho: 'Pronto.', criado_em: new Date().toISOString(), encerrado_em: new Date().toISOString(),
      consulta_id: CONSULTA, resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES,
      afirmacoes: AFIRMACOES.map((a) => ({ ...a, removida: true })),
      rascunho_pendente: false,
    },
  });
  await esperar(220);
  t.window.PesquisaPainel.verInvestigacaoAnterior();
  await esperar(220);

  conferir('2a. não oferece trazer para o quadro o que foi descartado',
    !saida(t, 'Trazer o resultado'), t.thread.textContent.slice(-300));
  conferir('2b. e diz o que aconteceu, sem apagar a investigação',
    /descartou/i.test(t.thread.textContent) && /histórico/i.test(t.thread.textContent),
    t.thread.textContent.slice(-300));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
