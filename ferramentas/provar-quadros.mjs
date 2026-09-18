/* ============================================================
   O que o board MOSTRA — regressão de 14/09/2026
   ============================================================
   A resposta abaixo é REAL: veio da investigação sobre a Loggi,
   com quatro perguntas do planejador respondidas uma a uma.

   O defeito que este arquivo trava: `secoesDaResposta` só aceitava
   cabeçalho de até 80 caracteres, e desde a Fase 1a o provedor
   repete cada pergunta como cabeçalho — pergunta é longa. Duas das
   quatro passavam de 80, não viravam título, caíam no CORPO da
   seção anterior, e lá eram confundidas com perguntas em aberto.

   O que a pessoa via: um quadro intitulado com a pergunta 1
   contendo as respostas 1, 2 e 3 grudadas; e um post-it
   "A Loggi opera serviço de ponto de coleta em condomínios? —
   Responda aqui..." como se ninguém tivesse respondido. A resposta
   estava logo abaixo da pergunta o tempo todo.
   ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js','ia.js','pesquisa.js'].map(f => fs.readFileSync(`${BASE}/${f}`,'utf8'));

const RESPOSTA = `## Resposta às suas 4 perguntas:

### 1. Qual é o principal produto ou serviço oferecido pela Loggi no Brasil em 2024?

A Loggi é uma empresa que usa tecnologia para simplificar a vida das pessoas através de envios de pacotes e encomendas para todo o Brasil. Em 2024, a empresa lançou uma plataforma self-service para pequenas e médias empresas, eliminando exigências de volume mínimo e contratos burocráticos, com inteligência artificial que permite que empreendedores cadastrem lojas, integrem plataformas de e-commerce e realizem envios de forma autônoma.

### 2. A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?

Não. O LoggiPonto permite que estabelecimentos comerciais atuem como pontos oficiais para envio e retirada de encomendas. Não há informação sobre operação específica em condomínios residenciais ou comerciais. A Loggi conta com mais de 1.700 pontos de coleta espalhados pelo Brasil, mas esses são comerciais (lojas, bairros e parceiros logísticos), não condomínios residenciais.

Para esse modelo específico de condomínios, existe a iHouseLog, que é seu competitor niche: ela transforma condomínios em pontos de coleta, diferente da estratégia de pontos comerciais da Loggi.

### 3. Quais são as principais logtechs que oferecem serviço de ponto de coleta em condomínios no Brasil?

Aqui as buscas não trouxeram uma lista abrangente de logtechs com esse modelo específico. Encontrei apenas a iHouseLog, que transforma condomínios residenciais ou comerciais em pontos de coleta e conecta os maiores e-commerces, simplificando a logística com tecnologia avançada.

Não há dados recentes sobre quantas outras logtechs operam especificamente com esse modelo em condomínios no Brasil.

### 4. Em qual ano a Loggi foi fundada e qual era seu modelo de negócio inicial?

A Loggi foi criada em dezembro de 2013 na capital paulista. A empresa nasceu da observação do potencial logístico das motocicletas nas grandes cidades brasileiras, inicialmente focada em entregas urbanas expressas de documentos e pequenas encomendas. Em 2015, expandiu seu modelo para atender e-commerce, passando a realizar coletas em grandes centros de distribuição de varejistas online.`;

const FONTES = [
  { url: 'https://www.loggi.com/conheca-a-loggi/', titulo: 'Prazer, somos a Loggi' },
  { url: 'https://pt.wikipedia.org/wiki/Loggi', titulo: 'Loggi – Wikipédia' },
  { url: 'https://www.loggi.com/conteudos/logistica/ponto-de-coleta/', titulo: 'Ponto de coleta' },
  { url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto' },
  { url: 'https://www.ihouselog.com/', titulo: 'Ihouselog' },
  { url: 'https://forbes.com.br/forbes-tech/2021/08/o-mundo-dos-unicornios-loggi/', titulo: 'Forbes: Loggi' },
];

const dom = new JSDOM(`<!doctype html><body>
  <div id="paneAssistente"><div id="iaThread"></div><textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
  <div id="panePesquisa"><div id="pesquisaCorpo"></div><textarea id="pesquisaInput"></textarea><span id="pesquisaAviso"></span><button id="pesquisaEnviar"></button></div>
  <button id="tabAssistente"></button><button id="tabPesquisa"></button></body>`,
  { url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1', runScripts: 'dangerously' });
const { window } = dom;
window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder;
if (!window.HTMLDialogElement.prototype.showModal) {
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
}
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ sessoes: [] }) });

const quadros = [];
window.criarQuadroResultado = (t, itens) => { quadros.push({ tipo: 'post-its', titulo: t, itens }); return {}; };
window.criarQuadroDocumento = (t, texto, fontes) => { quadros.push({ tipo: 'documento', titulo: t, texto, fontes }); return {}; };
window.dispararAutosave = () => {};
window.mostrarMensagem = () => {};
window.EmpresaAtual = { id: 'e1' }; window.ProjetoAtual = { id: 'p1' };
for (const js of [apiJs, iaJs, pesqJs]) { const s = window.document.createElement('script'); s.textContent = js; window.document.body.appendChild(s); }

await new Promise(r => setTimeout(r, 50));

window.API.fluxo = async () => ({
  ok: true, status: 200,
  body: { getReader: () => { let i = 0; const enc = new TextEncoder();
    const q = `event: fim\ndata: ${JSON.stringify({ resultado: 'entregue', resposta: RESPOSTA, fontes: FONTES })}\n\n`;
    return { read: async () => (i++ === 0 ? { done: false, value: enc.encode(q) } : { done: true }) }; } },
});
window.fetch = async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes('/pesquisa/sessoes?') ? { sessoes: [{ id: 's1' }] } : {}) });

await window.PesquisaPainel.pesquisarNoQuadro('Pesquisar a Loggi que atuam aqui no brasil, verificar qual o seu principal produto atualmente');
await new Promise(r => setTimeout(r, 120));

/* Até 15/09/2026 era preciso atravessar o rascunho aqui para o quadro
   nascer. Ele saiu; o resultado vai direto ao board, e esta prova —
   que é sobre a MONTAGEM do quadro — só precisa esperar. */
await new Promise(r => setTimeout(r, 200));

let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : '\n        ' + detalhe}`);
  if (!ok) falhas++;
};

const docs = quadros.filter((q) => q.tipo === 'documento');
const postits = quadros.filter((q) => q.tipo === 'post-its');

conferir('uma pergunta respondida = um quadro, os quatro',
  docs.length === 4, quadros.map((q) => `${q.tipo}:${q.titulo}`).join(' | '));

conferir('nenhuma pergunta respondida virou "pergunta em aberto"',
  !postits.some((q) => /em aberto/i.test(q.titulo)),
  postits.map((q) => q.titulo + ' -> ' + q.itens.map((i) => i.titulo).join(' ; ')).join(' | '));

const q2 = docs.find((q) => /condomínios residenciais ou comerciais/.test(q.titulo));
conferir('a pergunta dos condomínios virou quadro com título próprio', !!q2,
  docs.map((q) => q.titulo).join(' | '));
conferir('e o corpo dele é a resposta DELA, não a da vizinha',
  !!q2 && /^Não\. O LoggiPonto/.test(q2.texto) && !/plataforma self-service/.test(q2.texto),
  q2 ? q2.texto.slice(0, 160) : '(sem quadro)');

conferir('nenhum quadro carrega a resposta de mais de uma pergunta',
  !docs.some((q) => /\b[23]\.\s/.test(q.texto)),
  docs.map((q) => q.titulo + ' :: ' + q.texto.slice(0, 80)).join('\n        '));

console.log(`\n===== O BOARD RECEBEU ${quadros.length} QUADRO(S) =====\n`);
quadros.forEach((q, i) => {
  console.log(`--- quadro ${i + 1}: ${q.tipo} ---`);
  console.log('TÍTULO :', JSON.stringify(q.titulo));
  if (q.tipo === 'documento') {
    console.log('FONTES :', (q.fontes || []).length);
    console.log('TEXTO  :', q.texto.slice(0, 200) + (q.texto.length > 200 ? '…' : ''));
  } else {
    q.itens.forEach((it, j) => console.log(`   ${j + 1}. [${it.titulo}] ${String(it.descricao).slice(0, 100)}`));
  }
  console.log();
});

console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas ? 1 : 0);
