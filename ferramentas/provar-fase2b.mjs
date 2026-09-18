/* Prova de que UM CLIQUE RODA A PESQUISA INTEIRA, com DOM real.

   Esta prova nasceu como a prova do PORTÃO DE CONFIRMAÇÃO DO GASTO
   (Fase 2, segunda metade), e foi reescrita em 15/09/2026, quando o
   Ricardo tirou o portão do caminho ao vivo: "ele já clicou, e já
   sabemos que ele quer pesquisar".

   A regra que se prova agora, em uma frase: QUEM CLICA EM "PESQUISAR"
   NÃO É PERGUNTADO DE NOVO. O plano aparece, a busca sai atrás dele,
   e as duas coisas acontecem na mesma entrada do assistente.

   O GESTO NÃO SUMIU, mudou de lugar — é o clique no botão da tarefa.
   Por isso as conferências que importam aqui continuam sendo sobre a
   LISTA DE CHAMADAS, e não sobre o texto da tela: §3 prova que o
   cliente não entra em laço quando o servidor insiste em esperar, e
   §6 prova que abrir a página não gasta nada sozinha. As duas são
   afirmações sobre dinheiro, e dinheiro é o que esta prova vigia.

   Por que uma prova de tela e não um teste de rota: no servidor tudo
   isto é igual — `aguardando` continua sendo gravado e `/buscar`
   continua sendo uma segunda chamada. O que mudou mora inteiro no
   cliente, e "a busca saiu sem segundo clique" é uma afirmação sobre
   a tela. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = '/mnt/user-data/uploads/Plataforma de Design 2.0/js';
const [apiJs, iaJs, pesqJs] = ['api.js', 'ia.js', 'pesquisa.js'].map((f) =>
  fs.readFileSync(`${BASE}/${f}`, 'utf8'),
);

const TAREFA = 'A Loggi opera serviço de ponto de coleta em condomínios residenciais ou comerciais?';
const INV = 'inv-77';
const PRECO = 'R$ 0,42';

const PERGUNTAS = [
  { pergunta: TAREFA, porque: 'É a tarefa, literalmente.' },
  { pergunta: 'O LoggiPonto aceita condomínios como ponto?', porque: 'É o produto que faria isso.' },
];

const RESPOSTA = `## ${TAREFA}

Não. O LoggiPonto permite que estabelecimentos comerciais atuem como pontos oficiais para envio e retirada de encomendas.`;

const FONTES = [{ url: 'https://www.loggi.com/loggiponto/', titulo: 'LoggiPonto' }];
const AFIRMACOES = [
  {
    texto:
      'Não. O LoggiPonto permite que estabelecimentos comerciais atuem como pontos oficiais para envio e retirada de encomendas.',
    fonteIds: [0],
    trechos: ['pontos oficiais para envio'],
    semFonte: false,
    inicio: RESPOSTA.indexOf('Não. O LoggiPonto'),
  },
];

/* Os dois streams, como o servidor os manda. */
const quadros = (eventos) =>
  eventos.map(([ev, d]) => `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join('');

const STREAM_PLANO = quadros([
  ['aberta', { investigacao_id: INV }],
  ['passo', { texto: 'Li o que a empresa já sabe: 2 trecho(s) validado(s).' }],
  ['plano', { perguntas: PERGUNTAS, ja_sabido: [] }],
  [
    'aguardando',
    {
      investigacao_id: INV,
      perguntas: PERGUNTAS,
      estimativa_micros: 420_000,
      estimativa_formatada: PRECO,
    },
  ],
]);

const STREAM_BUSCA = quadros([
  ['aberta', { investigacao_id: INV }],
  ['passo', { texto: 'Busquei 3 vez(es) · 1 fonte(s).' }],
  [
    'fim',
    {
      investigacao_id: INV,
      resultado: 'entregue',
      resposta: RESPOSTA,
      fontes: FONTES,
      afirmacoes: AFIRMACOES,
      perguntas: PERGUNTAS,
    },
  ],
]);

/* O servidor pode responder `aguardando` DE NOVO na rota de buscar:
   é o que ele faz quando o preço subiu entre planejar e confirmar
   (BOARD-PESQUISA-039). §3 usa isto. */
const STREAM_BUSCA_PEDE_ESPERA = quadros([
  ['aberta', { investigacao_id: INV }],
  ['passo', { texto: 'O preço mudou desde o plano — confira antes de eu buscar.' }],
  [
    'aguardando',
    {
      investigacao_id: INV,
      perguntas: PERGUNTAS,
      estimativa_micros: 520_000,
      estimativa_formatada: 'R$ 0,52',
      mudou: true,
    },
  ],
]);

function montar({ investigacaoGuardada = null, buscarPedeEspera = false } = {}) {
  const dom = new JSDOM(
    `<!doctype html><body>
    <div id="paneAssistente"><div id="iaThread"></div><textarea id="assistantInput"></textarea><span id="iaAviso"></span><button id="iaEnviar"></button></div>
    <div id="panePesquisa"><div id="pesquisaCorpo"></div><textarea id="pesquisaInput"></textarea><span id="pesquisaAviso"></span><button id="pesquisaEnviar"></button></div>
    <button id="tabAssistente"></button><button id="tabPesquisa"></button></body>`,
    {
      url: 'http://localhost:3333/board.html?empresa=e1&projeto=p1&tarefa=t1',
      runScripts: 'dangerously',
    },
  );
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  }

  window.fetch = async (u) => ({
    ok: true,
    status: 200,
    json: async () => {
      const s = String(u);
      if (s.includes('/pesquisa/sessoes?')) return { sessoes: [{ id: 's1' }] };
      if (s.endsWith('/investigacao')) return { investigacao: investigacaoGuardada };
      return {};
    },
  });

  const quadrosFeitos = [];
  window.criarQuadroResultado = (t, itens) => { quadrosFeitos.push({ tipo: 'postits', titulo: t, itens }); return {}; };
  window.criarQuadroDocumento = (t, texto, fontes) => { quadrosFeitos.push({ tipo: 'doc', titulo: t, texto, fontes }); return {}; };
  window.dispararAutosave = () => {};
  const toasts = [];
  window.mostrarMensagem = (m) => toasts.push(m);
  window.EmpresaAtual = { id: 'e1' };
  window.ProjetoAtual = { id: 'p1' };

  for (const js of [apiJs, iaJs, pesqJs]) {
    const s = window.document.createElement('script');
    s.textContent = js;
    window.document.body.appendChild(s);
  }

  /* Cada chamada de stream fica registrada: é a lista de chamadas —
     não o texto da tela — que prova que nada foi gasto. */
  const chamadas = [];
  window.API.fluxo = async (caminho, opcoes) => {
    chamadas.push({ caminho, corpo: (opcoes || {}).corpo });
    let texto = STREAM_PLANO;
    if (caminho.endsWith('/buscar')) {
      const jaBuscou = chamadas.filter((c) => c.caminho.endsWith('/buscar')).length > 1;
      texto = buscarPedeEspera && !jaBuscou ? STREAM_BUSCA_PEDE_ESPERA : STREAM_BUSCA;
    }
    let i = 0;
    const enc = new TextEncoder();
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (i++ === 0 ? { done: false, value: enc.encode(texto) } : { done: true }),
        }),
      },
    };
  };

  return {
    window,
    chamadas,
    quadros: quadrosFeitos,
    toasts,
    doc: window.document,
    thread: window.document.getElementById('iaThread'),
  };
}

const esperar = (ms = 140) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const conferir = (n, ok, d) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}${ok ? '' : '\n        ' + d}`);
  if (!ok) falhas++;
};
const botao = (t, rotulo) =>
  [...t.thread.querySelectorAll('[data-narracao-saida]')].find((b) => new RegExp(rotulo).test(b.textContent));
const clicar = (t, b) => b.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));

/* ============================================================
   1. Um clique roda a pesquisa inteira
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(240);

  const caminhos = t.chamadas.map((c) => c.caminho);
  conferir('1a. duas chamadas saíram: planejar e buscar', t.chamadas.length === 2,
    JSON.stringify(caminhos));
  conferir('1b. a segunda é a busca, pelo id da investigação',
    caminhos.some((c) => c.includes('/investigar/' + INV + '/buscar')), JSON.stringify(caminhos));
  /* Corpo vazio: o que se busca já está gravado no servidor. Remandar
     o plano daqui deixaria o cliente trocar o que se busca depois de
     o servidor já ter reservado o teto para AQUELE plano. */
  const busca = t.chamadas.find((c) => c.caminho.endsWith('/buscar'));
  conferir('1c. sem replanejar nada pelo caminho',
    !!busca && JSON.stringify(busca.corpo || {}) === '{}', JSON.stringify(busca && busca.corpo));

  conferir('1d. o plano ficou à vista antes da busca',
    /LoggiPonto aceita condomínios/.test(t.thread.textContent), t.thread.textContent.slice(0, 300));
  /* Planejar e buscar são uma coisa só para quem lê: UMA entrada de
     narração, não duas. Duas entradas contariam a mesma história
     partida ao meio. */
  /* `.ia-narracao`, e não `[data-narracao]`: os botões de saída também
     carregam o id da narração no atributo, então contar pelo atributo
     conta botões junto. */
  conferir('1e. tudo numa entrada só do assistente',
    t.thread.querySelectorAll('.ia-narracao').length === 1,
    t.thread.innerHTML.slice(0, 300));
  conferir('1f. e o fim do plano não virou "conexão caiu"',
    !/conexão caiu/i.test(t.thread.textContent), t.thread.textContent.slice(-300));
}

/* ============================================================
   2. Nenhuma segunda pergunta, e nenhum valor
   ============================================================ */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(240);

  const texto = t.thread.textContent;
  conferir('2a. nenhum valor aparece na jornada',
    !texto.includes(PRECO) && !/R\$/.test(texto), texto.slice(-300));
  conferir('2b. nem como teto, nem como sobra que volta',
    !/até\s*R\$/.test(texto) && !/volta para o saldo/.test(texto), texto.slice(-300));

  /* Os dois botões que saíram em 15/09/2026. Nomeados aqui de
     propósito: se um deles voltar por acidente, esta linha acusa. */
  conferir('2c. não há "Buscar agora"', !botao(t, 'Buscar agora'), texto.slice(-400));
  conferir('2d. nem "Agora não"', !botao(t, 'Agora não'), texto.slice(-400));
  conferir('2e. nem a pergunta que eles respondiam', !/Posso buscar\?/.test(texto),
    texto.slice(-400));

  /* Nada de desenho de espera: a investigação não está esperando
     ninguém, está correndo. */
  conferir('2f. o desenho não é de espera',
    !t.thread.querySelector('.ia-narracao--aguardando'), t.thread.innerHTML.slice(0, 200));
}

/* ============================================================
   3. O servidor insistindo em esperar NÃO vira laço
   ============================================================
   Esta é a conferência que justifica a prova existir. `/buscar` pode
   responder `aguardando` de novo (BOARD-PESQUISA-039, preço que subiu
   entre planejar e confirmar). Se o cliente confirmasse sozinho toda
   vez que visse esse evento, o defeito não seria uma tela travada:
   seria dinheiro saindo em rodadas. O seguir-sozinho vale para o
   stream que PLANEJA e só para ele. */
{
  const t = montar({ buscarPedeEspera: true });
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(300);

  conferir('3a. uma busca só saiu, não um laço',
    t.chamadas.filter((c) => c.caminho.endsWith('/buscar')).length === 1,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
  conferir('3b. e a tela para, esperando a pessoa',
    !!t.thread.querySelector('.ia-narracao--aguardando'), t.thread.innerHTML.slice(-300));
  conferir('3c. com um botão para continuar', !!botao(t, 'Continuar a pesquisa'),
    t.thread.textContent.slice(-300));
  conferir('3d. e sem preço, mesmo aqui', !/R\$/.test(t.thread.textContent),
    t.thread.textContent.slice(-300));

  clicar(t, botao(t, 'Continuar a pesquisa'));
  await esperar(240);
  conferir('3e. o clique retoma, e agora a busca completa',
    t.chamadas.filter((c) => c.caminho.endsWith('/buscar')).length === 2 &&
      t.quadros.length > 0,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
}

/* ============================================================
   4. O resultado vai direto para o board
   ============================================================
   O rascunho da Fase 2 saiu em 15/09/2026, no mesmo dia que o portão
   e pela mesma razão: era uma segunda decisão pedida a quem já tinha
   decidido. Um clique, e os quadros estão no board. */
{
  const t = montar();
  await t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(260);

  conferir('4a. nenhum dialog abriu no caminho',
    !t.doc.querySelector('dialog.rascunho'), t.doc.body.innerHTML.slice(0, 200));
  conferir('4b. e os quadros nasceram no board', t.quadros.length > 0,
    JSON.stringify(t.quadros.map((q) => q.titulo)));
  conferir('4c. a narração diz quantos', /Montei \d+ quadro/.test(t.thread.textContent),
    t.thread.textContent.slice(-300));
}

/* ============================================================
   5. Dois cliques em "Pesquisar" não são duas pesquisas
   ============================================================
   A trava do segundo clique era do botão do portão, que não existe
   mais. Quem segura agora é o botão da tarefa (`disabled` enquanto
   corre) e o estado no servidor (só `aguardando` pode ser
   confirmado). Aqui se prova o lado do cliente. */
{
  const t = montar();
  t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  t.window.PesquisaPainel.pesquisarNoQuadro(TAREFA);
  await esperar(300);

  conferir('5a. uma busca só saiu',
    t.chamadas.filter((c) => c.caminho.endsWith('/buscar')).length === 1,
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
}

/* ============================================================
   6. A investigação que ficou à espera não gasta sozinha
   ============================================================
   Sem portão no caminho ao vivo, chegar a `aguardando` significa que
   algo cortou no meio: a aba morreu, ou faltou crédito na confirmação
   (BOARD-PESQUISA-041). Aqui NÃO houve clique hoje — buscar ao abrir
   a página seria gastar sem gesto nenhum, no dia errado. */
{
  const t = montar({
    investigacaoGuardada: {
      id: INV,
      estado: 'aguardando',
      pergunta: TAREFA,
      passos: ['Escrevi 2 pergunta(s) verificável(is).'],
      plano: { perguntas: PERGUNTAS, ja_sabido: [] },
      fecho: null,
      criado_em: new Date(Date.now() - 90_000).toISOString(),
      encerrado_em: null,
      estimativa_micros: 420_000,
      estimativa_formatada: PRECO,
      resultado: null,
      resposta: null,
      fontes: [],
    },
  });

  /* Nada a chamar: a recuperação já roda sozinha ao carregar a
     página, e é assim que ela acontece de verdade. */
  await esperar(260);

  conferir('6a. NENHUMA busca saiu ao abrir a página',
    !t.chamadas.some((c) => c.caminho.endsWith('/buscar')),
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
  conferir('6b. a pesquisa parada é reencontrada',
    /parou antes de ir à web/i.test(t.thread.textContent), t.thread.textContent.slice(0, 400));
  /* Dizer QUE parou importa: senão o botão parece um segundo pedido
     de permissão, que é justamente o que saiu daqui. */
  conferir('6c. dizendo que o plano ficou guardado',
    /plano ficou guardado/i.test(t.thread.textContent), t.thread.textContent.slice(-300));
  conferir('6d. com um botão só, para continuar',
    !!botao(t, 'Continuar a pesquisa') && !botao(t, 'Agora não'),
    t.thread.textContent.slice(-300));
  conferir('6e. e sem preço', !/R\$/.test(t.thread.textContent),
    t.thread.textContent.slice(-300));

  clicar(t, botao(t, 'Continuar a pesquisa'));
  await esperar(240);
  conferir('6f. o clique de hoje busca o plano de ontem',
    t.chamadas.some((c) => c.caminho.includes('/investigar/' + INV + '/buscar')),
    JSON.stringify(t.chamadas.map((c) => c.caminho)));
}

console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
