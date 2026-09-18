/* ============================================================
   O que a PRIMEIRA investigação real mostrou sobre as afirmações
   ============================================================
   15/09/2026. Tarefa: "Pesquisar os concorrentes da ihouselog na
   área de loghtecs". 7 afirmações, 2 sem fonte — e as duas sem
   fonte não eram afirmações:

     [ SAIU ] (sem fonte) .

     Inside Lockers, Zibox e Caixa de Correio Inteligente também...

     [ SAIU ] (sem fonte) — mas não atua com condomínios.

     **O que faltou:**

     A pesquisa não encontrou em fontes brasileiras recentes...

   Um bloco sem citação não é "uma afirmação que o modelo não
   sustentou". É *o texto que sobrou entre duas citações*, e nele
   vem junto o rabo da frase anterior, o título da seção seguinte,
   e a afirmação de verdade que o modelo não citou.

   A consequência cara: a seção "O que faltou" — onde o modelo diz
   o que NÃO conseguiu responder, o parágrafo mais valioso da
   resposta — chegou grudada num fragmento, desmarcada (sem fonte
   chega desmarcada) e foi descartada. Ninguém decidiu isso.

   Estes testes usam o texto REAL daquela investigação. Fixture
   inventada é fixture limpa, e foi por isso que nenhuma das 237
   conferências em jsdom viu o problema: eu escrevia os blocos, e
   eu escrevia blocos que eram frases inteiras.
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afirmacoesDosBlocos, type BlocoCitado } from '../src/pesquisa/provedor-claude-busca.js';

const BOXLOCKER = {
  url: 'https://www.boxlocker.com.br/armario-inteligente-condominio-sao-paulo',
  titulo: 'BoxLocker',
  trecho: 'x',
};
const LOGHOUSE = { url: 'https://loghouse.com.br/parcerias/', titulo: 'LogHouse', trecho: 'y' };
const FONTES = [BOXLOCKER, LOGHOUSE];

/* O bloco sem citação, exatamente como veio: começa com o ponto
   final que a citação anterior deixou de fora. */
const RABO_E_SECAO = `— mas não atua com condomínios.

**O que faltou:**

A pesquisa não encontrou em fontes brasileiras recentes outras logtechs que façam o mesmo que a iHouseLog: conectar especificamente condomínios residenciais/comerciais como pontos de coleta aos principais e-commerces.`;

function blocos(): BlocoCitado[] {
  const citado =
    'LogHouse é um ponto de coleta oficial Shopee e tem integração com Mercado Livre e é indicada pela Amazon';
  return [
    { texto: citado, citacoes: [{ url: LOGHOUSE.url, cited_text: 'ponto de coleta oficial' }], inicio: 0 },
    { texto: RABO_E_SECAO, citacoes: [], inicio: citado.length },
  ];
}

test('o rabo da frase anterior não é oferecido como afirmação', () => {
  /* "— mas não atua com condomínios." já está dito na afirmação
     citada de onde ele se soltou. Pedir à pessoa que decida se
     mantém meia frase é pedir uma decisão impossível. */
  const r = afirmacoesDosBlocos(blocos(), FONTES);
  assert.equal(
    r.some((a) => a.texto.startsWith('— mas não atua')),
    false,
  );
});

test('"O que faltou" sobrevive como afirmação própria, e não some junto', () => {
  /* O teste que dá nome ao arquivo. Antes do conserto este
     parágrafo vinha colado ao fragmento acima, num item só; a
     pessoa descartava o fragmento e levava o parágrafo junto sem
     saber. */
  const r = afirmacoesDosBlocos(blocos(), FONTES);
  const faltou = r.find((a) => a.texto.startsWith('A pesquisa não encontrou'));
  assert.ok(faltou, 'a declaração de limite do modelo foi perdida');
  assert.equal(faltou.semFonte, true);
});

test('o título da seção não vira afirmação, nem no meio do bloco', () => {
  /* A guarda antiga pegava `## Assim`, e só quando o bloco
     COMEÇAVA com ele. Aqui o título é `**O que faltou:**` e está
     no meio. Duas formas de falhar, as duas presentes no dado
     real. */
  const r = afirmacoesDosBlocos(blocos(), FONTES);
  assert.equal(
    r.some((a) => a.texto.includes('**O que faltou:**')),
    false,
  );
});

test('a posição de cada pedaço é calculada, não estimada', () => {
  /* A família de defeito mais cara do projeto: posição derivada do
     texto original sendo lida contra um texto diferente. Erra em
     silêncio, com números plausíveis. Aqui a conferência é dura —
     o `inicio` tem que apontar para o caractere certo do texto
     inteiro. */
  const bs = blocos();
  const inteiro = bs.map((b) => b.texto).join('');
  for (const a of afirmacoesDosBlocos(bs, FONTES)) {
    assert.equal(
      inteiro.slice(a.inicio, a.inicio + a.texto.length),
      a.texto,
      `posição errada para: ${a.texto.slice(0, 40)}`,
    );
  }
});

test('o bloco citado continua inteiro — partir orfanaria a fonte', () => {
  /* O conserto mexe SÓ no bloco sem citação. Num bloco citado a
     fonte sustenta o texto todo; parti-lo daria dois pedaços
     apontando para a mesma fonte, sem dizer qual trecho sustenta
     qual. */
  const r = afirmacoesDosBlocos(
    [
      {
        texto: 'Primeira parte da mesma ideia, com fonte.\n\nSegunda parte da mesma ideia, mesma fonte.',
        citacoes: [{ url: BOXLOCKER.url, cited_text: 'trecho' }],
        inicio: 0,
      },
    ],
    FONTES,
  );
  const [unica] = r;
  assert.equal(r.length, 1);
  assert.ok(unica);
  assert.equal(unica.fonteIds.length, 1);
});

test('um parágrafo sem fonte que É uma afirmação continua aparecendo', () => {
  /* PES-006 e BOARD-PESQUISA-029 não mudaram: afirmação sem fonte
     é marcada e mostrada, nunca escondida. O conserto tira o que
     não é afirmação — não o que é afirmação sem fonte. */
  const r = afirmacoesDosBlocos(
    [{ texto: 'O mercado brasileiro de lockers cresceu bastante nos últimos anos.', citacoes: [], inicio: 0 }],
    FONTES,
  );
  const [unica] = r;
  assert.equal(r.length, 1);
  assert.ok(unica);
  assert.equal(unica.semFonte, true);
});

test('o fragmento de um caractere que o dado real trouxe', () => {
  /* A outra afirmação sem fonte daquela investigação começava
     literalmente com "." e uma linha em branco. Curta demais para
     ser afirmação, e continuação por onde começa: as duas guardas
     pegam, e é bom que peguem as duas. */
  const r = afirmacoesDosBlocos(
    [
      {
        texto: '.\n\nInside Lockers, Zibox e Caixa de Correio Inteligente também oferecem armários inteligentes.',
        citacoes: [],
        inicio: 0,
      },
    ],
    FONTES,
  );
  const [unica] = r;
  assert.equal(r.length, 1);
  assert.ok(unica);
  assert.equal(unica.texto.startsWith('Inside Lockers'), true);
});
