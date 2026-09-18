/* ============================================================
   O planejador — o portão de regex vira leitura
   ============================================================
   Fase 1a. Substitui `SUJEITO_EXTERNO` e companhia para tudo que
   não é lugar nem navegação: um modelo barato lê a tarefa como um
   humano leria, junto com o que a empresa já sabe, e devolve de 3 a
   6 perguntas verificáveis.

   ------------------------------------------------------------
   O QUE ELE CONSERTA
   ------------------------------------------------------------
   `testes/roteador.test.ts` mede a heurística em 14 de 18. Os 4 que
   falham são a mesma falha quatro vezes: verbo de levantamento com
   alvo que é nome próprio ou categoria de produto — "Pesquisar
   outras logitechs", "Listar fabricantes de teclado mecânico" —
   contra uma lista fechada de substantivos genéricos. Nenhuma lista
   fechada cobre nomes próprios, então o defeito não tinha conserto
   por ajuste: tinha por troca de mecanismo.

   ------------------------------------------------------------
   O QUE ELE NÃO PODE VIRAR
   ------------------------------------------------------------
   Um portão novo. `naoDaParaBuscar` existe para o caso honesto
   ("Definir nossa proposta de valor" não tem fonte externa), e é
   uma RECUSA COM MOTIVO LIDO, não por palavra-chave. Mas ela
   continua sujeita a BOARD-PESQUISA-012: quem chama tem que
   oferecer "buscar assim mesmo" do mesmo jeito. Trocar um portão
   burro por um portão esperto ainda seria um portão.

   ------------------------------------------------------------
   POR QUE 3 A 6
   ------------------------------------------------------------
   Menos de 3 e a investigação é a consulta rasa de hoje com outro
   nome. Mais de 6 e o custo cresce linear (cada pergunta é uma
   busca a US$ 0,01 mais os tokens de leitura) sem a resposta ficar
   melhor — as perguntas 7 em diante costumam ser reformulações das
   primeiras. O teto é aplicado AQUI, no servidor, e não pedido ao
   modelo e torcido: pedir é instrução, cortar é garantia.
   ============================================================ */

import { lerUso, type Uso } from '../creditos/precos.js';

/* UMA pergunta é um plano legítimo — 14/09/2026.
   O piso era 3, e foi o defeito. Tarefa como "A Loggi opera ponto de
   coleta em condomínios residenciais ou comerciais?" JÁ É uma
   pergunta verificável, inteira: o trabalho do planejador ali é
   reconhecer isso, não inventar mais duas para cumprir uma cota.
   Com o piso, o modelo preenchia a cota alargando o assunto — saíram
   "principais logtechs do Brasil", "custo de locker inteligente",
   "maiores e-commerces do mundo". Nenhuma respondia o que foi
   perguntado.

   Cota de pergunta é cota de busca paga: o piso não só desviava o
   assunto, cobrava por isso. */
export const MIN_PERGUNTAS = 1;
export const MAX_PERGUNTAS = 6;
export const MAX_TOKENS_PLANEJADOR = 900;

export type PerguntaPlanejada = {
  pergunta: string;
  porque: string;
};

export type PlanoInvestigacao = {
  perguntas: PerguntaPlanejada[];
  /* O que o modelo reconheceu que já está no Bloco A e por isso NÃO
     virou pergunta. Vira passo na narração: é a prova visível de
     que ler o conhecimento interno economizou busca. */
  jaSabido: string[];
  /* Preenchido quando a tarefa não tem fonte externa possível.
     Continua valendo BOARD-PESQUISA-012 para quem chama. */
  naoDaParaBuscar: string | null;
};

export const SISTEMA_PLANEJADOR = `Você transforma uma tarefa de um projeto de design em perguntas de pesquisa verificáveis.

A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS
Toda pergunta que você escrever tem que ajudar a responder A TAREFA COMO ELA FOI ESCRITA. Se alguém ler o seu plano e não conseguir dizer qual era a tarefa, o plano está errado.
Não alargue o assunto. "A empresa X faz Y?" não vira "quais empresas fazem Y", nem "quanto custa Y", nem "como é o mercado de Y". É sobre a empresa X.

O QUE É UMA PERGUNTA VERIFICÁVEL
Uma pergunta cuja resposta existe numa fonte pública e pode ser conferida: um número, uma data, um nome, um preço, uma lista de empresas, uma comparação de produtos no mercado.
NÃO é verificável: opinião, criação, priorização interna, decisão de produto.

REGRAS
1. Devolva de ${MIN_PERGUNTAS} a ${MAX_PERGUNTAS} perguntas. **Uma só é um plano completo e legítimo.** Se a tarefa já é uma pergunta verificável, o plano é ela — acrescente outra APENAS se for indispensável para respondê-la. Cada pergunta a mais é uma busca paga a mais.
2. NÃO faça pergunta cuja resposta já está no BLOCO A (verdade validada). Liste o que você deixou de perguntar por isso em "ja_sabido".
3. O BLOCO B são hipóteses NÃO validadas do projeto. Use-as para decidir o que vale confirmar ou derrubar com fonte externa — nunca as trate como fato.
4. Nome próprio de empresa, marca ou produto na tarefa é sinal FORTE de que há fato externo a buscar — e é sinal de que a pergunta é SOBRE AQUELA empresa. "Pesquisar outras logitechs que atuam no Brasil" pede concorrentes porque diz "outras"; "A Loggi opera ponto de coleta em condomínios?" pede a Loggi, e nada além dela.
5. A ficha da empresa (quem está perguntando) serve para você INTERPRETAR a tarefa — resolver uma ambiguidade, entender um termo do ramo. Ela NUNCA substitui a tarefa. Não transforme a pergunta na pesquisa de concorrentes que você imagina que essa empresa gostaria de ter.
6. Escreva as perguntas em português do Brasil, na linguagem de quem vai ler a resposta — não em jargão de busca.
7. Só preencha "nao_da_para_buscar" quando a tarefa for genuinamente interna (criar, definir, priorizar, escrever algo do próprio time) e não houver NENHUM fato externo por trás dela. Na dúvida, prefira perguntar.

FORMATO — responda SÓ com este JSON, sem texto antes ou depois:
{
  "perguntas": [{ "pergunta": "...", "porque": "..." }],
  "ja_sabido": ["..."],
  "nao_da_para_buscar": null
}`;

export function perguntaDoPlanejador(tarefa: string, contexto: string): string {
  return `${contexto}\n\n---\n\nTAREFA A INVESTIGAR:\n${tarefa}`;
}

/* ------------------------------------------------------------
   Leitura da resposta
   ------------------------------------------------------------
   Tolerante quanto ao FORMATO (cerca de crase, texto em volta),
   rígida quanto ao CONTEÚDO. Um plano que não dá para ler vira
   falha — nunca um plano vazio que seguiria adiante gastando busca
   sem ninguém ter decidido o quê. Mesmo princípio de
   `ia/provedor.ts#extrairJson`. */
export function interpretarPlano(bruto: string): PlanoInvestigacao | null {
  const limpo = String(bruto ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  /* O modelo às vezes enfeita com uma frase antes do JSON. Pegar do
     primeiro `{` ao último `}` recupera esses casos sem aceitar
     lixo: se o miolo não for JSON, o parse falha igual. */
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    return null;
  }
  if (!dados || typeof dados !== 'object') return null;

  const obj = dados as Record<string, unknown>;

  const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const cruas = Array.isArray(obj.perguntas) ? obj.perguntas : [];
  const vistas = new Set<string>();
  const perguntas: PerguntaPlanejada[] = [];

  for (const item of cruas) {
    if (!item || typeof item !== 'object') continue;
    const p = texto((item as Record<string, unknown>).pergunta);
    if (!p) continue;
    /* Duplicata desperdiça uma busca inteira a US$ 0,01 para
       devolver a mesma coisa duas vezes. */
    const chave = p.toLowerCase().replace(/[^a-zà-ú0-9]+/gi, ' ').trim();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    perguntas.push({ pergunta: p, porque: texto((item as Record<string, unknown>).porque) });
    /* Corta aqui em vez de confiar na instrução: pedir é instrução,
       cortar é garantia — e o que está em jogo é o custo. */
    if (perguntas.length >= MAX_PERGUNTAS) break;
  }

  const jaSabido = Array.isArray(obj.ja_sabido)
    ? obj.ja_sabido.map(texto).filter(Boolean)
    : [];

  const naoDaParaBuscar = texto(obj.nao_da_para_buscar) || null;

  /* Zero perguntas E nenhum motivo é resposta ilegível, não recusa.
     Tratar como recusa aqui esconderia falha de formato atrás de
     uma mensagem de produto — e a pessoa levaria a culpa por uma
     tarefa que estava boa. */
  if (!perguntas.length && !naoDaParaBuscar) return null;

  return { perguntas, jaSabido, naoDaParaBuscar };
}

/* ------------------------------------------------------------
   A pergunta da tarefa entra no plano — por construção
   ------------------------------------------------------------
   A regra 1 pede ao modelo que, quando a tarefa já for uma
   pergunta, o plano seja ela. Pedir é instrução. Isto é a garantia.

   O caso que obrigou: "A Loggi opera serviço de ponto de coleta em
   condomínios residenciais ou comerciais?" virou quatro perguntas
   sobre o mercado de logtech e o custo de lockers. Nenhuma delas
   respondia o que estava escrito na tarefa — e a pessoa pagou por
   quatro buscas para não receber a resposta que pediu.

   Quem escreveu uma pergunta quer AQUELA pergunta respondida. O
   servidor garante isso; o que o modelo escreve entra como apoio,
   depois.

   Só vale para tarefa ESCRITA como pergunta. "Pesquisar a Loggi e
   verificar o principal produto" é instrução, não pergunta — ali
   expandir é o trabalho certo, e forçar a frase crua como termo de
   busca seria pior. */

/* Parágrafo que termina em "?" não é uma pergunta: é um texto que
   por acaso acaba assim. O teto separa os dois sem precisar
   entender português. */

/* ============================================================
   A tarefa que não é tarefa — 14/09/2026
   ============================================================
   Achado numa investigação real: uma tarefa cuja descrição era
   literalmente `"Responda aqui..."` — o convite de um post-it —
   virou uma investigação paga. E DUAS vezes: R$ 0,67 no total.

   O planejador não recusou. Com a tarefa vazia de sentido, ele
   preencheu o vazio com a ficha da empresa e escreveu cinco
   perguntas sobre o mercado de lockers em condomínios. Nenhuma
   delas era sobre a tarefa, porque não havia tarefa. Os "porquês"
   que ele gravou denunciam o mecanismo: *"A proposta central da
   iHouseLog é..."*, *"A descrição menciona..."*. Ele planejou a
   partir do CONTEXTO.

   POR QUE A REGRA 5 DO PROMPT NÃO SEGUROU
   Ela diz que a ficha da empresa nunca substitui a tarefa — e vale
   quando existe uma tarefa para não ser substituída. Aqui não
   existia. E a regra 7 empurra na direção errada nesse caso: "na
   dúvida, prefira perguntar".

   POR QUE O CONSERTO NÃO É MEXER NO PROMPT
   Porque instrução não é garantia — pela quarta vez neste projeto.
   Um texto de placeholder é reconhecível sem modelo nenhum, de
   graça e sem margem para interpretação. Recusar ANTES da chamada
   custa zero e não tem como derivar.

   ISTO NÃO É "PEDIR PARA REESCREVER A TAREFA"
   A Fase 0 tirou da tela o texto que mandava a pessoa reformular
   uma tarefa boa para compensar um limite NOSSO. Aqui é outra
   coisa: o campo está com o texto de convite, não foi preenchido.
   Dizer isso — e mostrar o que foi encontrado — é informar, não
   terceirizar.
   ============================================================ */

/* Textos que a própria interface escreve nos campos, e que
   portanto nunca são tarefa. Vêm de `js/pesquisa.js` (o convite do
   post-it) e de `board.html` (o estado de falha de carga). */
const NAO_SAO_TAREFA = [
  'Responda aqui...',
  'Sem título',
  'Sem descrição',
  'Não foi possível ler esta tarefa agora. Recarregue a página.',
  'Tarefa não carregada',
];

function achatar(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    /* Reticências, pontos e travessões do fim não mudam o que a
       frase é: "Responda aqui..." e "Responda aqui" são o mesmo
       campo em branco. */
    .replace(/[.…\-–—:;!?]+$/g, '')
    .trim();
}

/* A lista passa pela MESMA normalização da entrada. Escrevê-la já
   achatada à mão era o caminho curto, e ele errou na primeira vez:
   o texto de falha do board termina em ponto, e a comparação passava
   ao lado por causa dele. Duas normalizações diferentes para o mesmo
   dado é o mesmo defeito de sempre, em miniatura. */
const CONHECIDOS = new Set(NAO_SAO_TAREFA.map(achatar));

export function tarefaSemConteudo(tarefa: string): boolean {
  const t = achatar(tarefa);
  if (!t) return true;

  /* Nenhuma letra nem dígito: "...", "---", "???" não são tarefa em
     língua nenhuma. */
  if (!/[a-z0-9]/.test(t)) return true;

  return CONHECIDOS.has(t);
}

/* O texto que a pessoa lê. Mora aqui, com a regra, porque redigir
   em dois lugares foi a dívida que este projeto já pagou duas vezes
   — e porque a mensagem precisa MOSTRAR o que foi encontrado: sem
   isso ela vira "está errado" sem dizer o quê. */
export function avisoDeTarefaVazia(tarefa: string): string {
  const visto = String(tarefa ?? '').trim();
  return visto
    ? `Esta tarefa ainda não tem uma pergunta escrita — o que está no campo é “${visto.slice(0, 80)}”. ` +
      'Escreva o que você quer descobrir e eu investigo. Nada foi cobrado.'
    : 'Esta tarefa não tem descrição para investigar. Nada foi cobrado.';
}

const MAX_CARACTERES_PERGUNTA = 300;

export function tarefaEhPergunta(tarefa: string): boolean {
  const t = String(tarefa ?? '').trim();
  return t.endsWith('?') && t.length <= MAX_CARACTERES_PERGUNTA;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* Palavras curtas são cola ("a", "de", "em", "ou") e casariam entre
   perguntas que não têm nada a ver. O corte em 4 letras deixa passar
   o que carrega o assunto. */
function palavrasDe(s: string): Set<string> {
  return new Set(normalizar(s).split(' ').filter((p) => p.length >= 4));
}

/* Duas perguntas são a mesma quando uma contém a outra, ou quando
   quase todas as palavras de assunto da tarefa estão na outra. O
   segundo teste existe para a paráfrase: o modelo costuma reescrever
   "A Loggi opera X?" como "A Loggi oferece X?", e aceitar isso como
   duplicata evita pagar duas buscas pela mesma resposta. */
export function ehAMesmaPergunta(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;

  const pa = palavrasDe(a);
  if (pa.size < 3) return false;
  const pb = palavrasDe(b);
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / pa.size >= 0.8;
}

export function comPerguntaDaTarefa(tarefa: string, plano: PlanoInvestigacao): PlanoInvestigacao {
  if (!tarefaEhPergunta(tarefa)) return plano;

  const texto = String(tarefa).trim();

  /* NAS DUAS DIREÇÕES — corrigido em 15/09/2026, achado pela régua
     da Fase 4.
     `ehAMesmaPergunta(a, b)` divide as palavras comuns pelo tamanho
     de `a`: ela é assimétrica de propósito, mas isso a fazia quase
     nunca bater com a tarefa (longa) na frente. Consequência medida:
     tarefa "Quais marcas vendem no Brasil E qual a participação da
     Logitech?", com as marcas já validadas no Bloco A. O modelo
     acertou — perguntou só a parte que faltava — e a garantia
     reinjetou a tarefa inteira por cima. Duas perguntas para uma
     coisa só, uma busca paga a mais.

     Olhar na outra direção reconhece a pergunta ESTREITA que cabe
     dentro da tarefa, e não injeta. O plano continua respondendo o
     que falta, que é o ponto.

     A garantia contra deriva não afrouxa: uma pergunta derivada não
     cabe dentro da tarefa (compartilha quase nenhuma palavra com
     ela), então a injeção continua acontecendo no caso que a criou
     — e `testes/planejador.test.ts` cobra isso. */
  const jaTem = plano.perguntas.some(
    (p) => ehAMesmaPergunta(texto, p.pergunta) || ehAMesmaPergunta(p.pergunta, texto),
  );
  if (jaTem) return plano;

  /* Primeira, não última: a busca responde na ordem, e o teto de
     saída do provedor corta o fim. A pergunta que a pessoa escreveu
     não pode ser a que fica sem espaço. */
  const perguntas = [
    { pergunta: texto, porque: 'É a própria tarefa, escrita como pergunta.' },
    ...plano.perguntas,
  ].slice(0, MAX_PERGUNTAS);

  return { ...plano, perguntas };
}

/* ------------------------------------------------------------
   A chamada
   ------------------------------------------------------------
   Messages API direta, sem ferramenta nenhuma: planejar não busca,
   não lê página, não gasta `web_search`. É a etapa barata, e é o
   que permite mostrar o plano e a estimativa ANTES de qualquer
   gasto de busca (PES-007). */
export class FalhaDoPlanejador extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FalhaDoPlanejador';
  }
}

export type SaidaPlanejador = {
  plano: PlanoInvestigacao;
  uso: Uso;
  modelo: string;
};

export async function planejarComModelo(entrada: {
  tarefa: string;
  contexto: string;
  chave: string;
  modelo: string;
}): Promise<SaidaPlanejador> {
  let resposta: Response;
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': entrada.chave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: entrada.modelo,
        max_tokens: MAX_TOKENS_PLANEJADOR,
        system: SISTEMA_PLANEJADOR,
        messages: [
          { role: 'user', content: perguntaDoPlanejador(entrada.tarefa, entrada.contexto) },
        ],
      }),
    });
  } catch {
    throw new FalhaDoPlanejador('Não foi possível falar com o provedor para planejar.');
  }

  if (!resposta.ok) {
    throw new FalhaDoPlanejador('O provedor recusou a chamada de planejamento.');
  }

  const dados = (await resposta.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
    model?: string;
  };

  const texto = (dados.content ?? [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  const plano = interpretarPlano(texto);
  if (!plano) {
    throw new FalhaDoPlanejador('O planejamento voltou num formato que não consigo ler.');
  }

  /* A garantia, e não a instrução: se a tarefa era uma pergunta, ela
     está no plano quando este retorno acontece — tenha o modelo
     obedecido a regra 1 ou não. */
  return {
    plano: comPerguntaDaTarefa(entrada.tarefa, plano),
    uso: lerUso(dados.usage),
    modelo: dados.model ?? entrada.modelo,
  };
}
