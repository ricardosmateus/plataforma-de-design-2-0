/* ============================================================
   Perguntar ao caderno — Fase 3a
   ============================================================
   A pergunta de acompanhamento, respondida SÓ com o que a
   investigação já coletou. Sem busca nova, sem conhecimento geral
   do modelo, sem ferramenta nenhuma.

   ------------------------------------------------------------
   POR QUE ISTO NÃO É "MAIS UMA PERGUNTA AO ASSISTENTE"
   ------------------------------------------------------------
   O assistente do projeto lê o conhecimento interno da empresa e
   responde com o que sabe. O caderno faz o contrário: ele tem um
   material fechado na frente e não pode sair dele. "Não está nas
   minhas fontes" é a resposta CERTA quando é o caso (`PES-008`), não
   uma falha a ser contornada.

   É a régua do NotebookLM, e é ela que torna a resposta conferível:
   toda frase aponta para uma fonte que está listada logo acima.

   ------------------------------------------------------------
   O QUE ENTRA NO MATERIAL, E POR QUÊ
   ------------------------------------------------------------
   1. As FONTES, com título, URL e o trecho citado. Uma fonte é um
      documento que foi lido e pago; ela fica mesmo que a afirmação
      que ela sustentava tenha sido descartada.

   2. O TEXTO QUE SOBREVIVEU À CURADORIA. Se a pessoa apagou uma
      afirmação, ela disse que aquilo não presta — mandar o texto
      original de volta contrabandearia para dentro da resposta
      exatamente o que ela tirou. Antes da curadoria ninguém decidiu
      nada, então vale tudo.

   3. As PERGUNTAS ANTERIORES desta mesma investigação, para a
      conversa fazer sentido. É conversa com um caderno, não uma
      sequência de perguntas isoladas.

   E nada mais. Recorte decidido pelo Ricardo em 14/09/2026: só esta
   investigação. O caderno que lê várias buscas de uma tarefa, e o
   que cruza com o conhecimento interno da empresa, são decisões
   seguintes — e cada uma multiplica o custo por pergunta.
   ============================================================ */

import { db } from '../db.js';
import { lerUso, type Uso } from '../creditos/precos.js';

export const MAX_TOKENS_CADERNO = 1_200;

/* Teto do material. Uma investigação com muitas fontes mandaria o
   caderno inteiro a cada pergunta, e o custo de uma conversa cresce
   com o número de perguntas VEZES o tamanho do material. Cortar é
   melhor do que uma conversa que fica cara sem ninguém entender por
   quê — e o corte é DITO, nunca silencioso. */
export const TETO_CARACTERES_MATERIAL = 24_000;

/* Quantas rodadas anteriores viajam junto. Seis é conversa; sessenta
   é um histórico que ninguém lê e todo mundo paga. */
export const MAX_RODADAS = 6;

export type FonteDoCaderno = {
  titulo: string | null;
  url: string;
  trecho: string | null;
};

export type Rodada = { pergunta: string; resposta: string };

export const SISTEMA_CADERNO = `Você responde perguntas sobre uma investigação que já foi feita, usando APENAS o material que vem abaixo.

A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS
Se a resposta não está no material, diga isso — com essas palavras ou parecidas: "Isso não está nas fontes desta investigação." Dizer que não sabe é resposta certa e esperada, não fracasso. Completar a lacuna com o que você sabe de fora é o pior erro possível aqui, porque quem lê vai decidir dinheiro achando que leu uma fonte.

COMO RESPONDER
- Cite a fonte de cada afirmação pelo número, assim: [1], [2]. Toda frase que afirma um fato precisa de um número.
- Se o material só permite uma resposta parcial, responda a parte que dá e diga qual parte não está lá.
- Se a pergunta pede uma busca nova ("procure também...", "veja no site X"), explique que aqui você só lê o que já foi coletado, e que buscar de novo é outra ação — que custa.
- Não repita o material inteiro. Responda a pergunta.
- Português do Brasil, direto, sem saudação e sem oferecer ajuda extra.

O QUE NÃO FAZER
- Não invente número, data, nome ou URL que não esteja no material.
- Não diga "segundo minhas informações" nem "de modo geral": ou está numa fonte listada, ou não está.
- Não recomende o que a empresa deve fazer. Você responde o que o material diz.`;

/* ------------------------------------------------------------
   O material, em texto
   ------------------------------------------------------------
   As fontes primeiro, numeradas — é por esse número que a resposta
   vai citar. Depois o que foi apurado. */
export function materialDoCaderno(entrada: {
  pergunta: string;
  fontes: FonteDoCaderno[];
  texto: string;
}): { texto: string; cortou: boolean } {
  const linhasFontes = entrada.fontes.map((f, i) => {
    const nome = (f.titulo ?? '').trim() || f.url;
    const trecho = (f.trecho ?? '').trim();
    return `[${i + 1}] ${nome} — ${f.url}${trecho ? `\n    Trecho citado: "${trecho}"` : ''}`;
  });

  const cabeca =
    `PERGUNTA ORIGINAL DA INVESTIGAÇÃO\n${entrada.pergunta}\n\n` +
    `FONTES (cite pelo número)\n${linhasFontes.length ? linhasFontes.join('\n') : '(nenhuma fonte declarada)'}\n\n` +
    `O QUE FOI APURADO\n`;

    /* O corte cai no APURADO, nunca na lista de fontes: uma resposta
       que cita [7] com seis fontes listadas é pior do que uma resposta
       com menos material. */
  const sobra = Math.max(0, TETO_CARACTERES_MATERIAL - cabeca.length);
  const corpo = entrada.texto.length > sobra ? entrada.texto.slice(0, sobra) : entrada.texto;

  return { texto: cabeca + corpo, cortou: corpo.length < entrada.texto.length };
}

/* ------------------------------------------------------------
   A conversa gravada
   ------------------------------------------------------------
   O cast de fronteira que cobriu a espera pela migração
   `20260914141622_caderno` saiu no mesmo dia — quarta e última vez
   em 14/09/2026. */
export async function rodadasGravadas(consultaId: string): Promise<Rodada[]> {
  try {
    const linhas = await db.pesquisaPergunta.findMany({
      where: { consultaId },
      orderBy: { criadoEm: 'asc' },
    });
    return linhas.map((l) => ({ pergunta: l.pergunta, resposta: l.resposta }));
  } catch (e) {
    /* Sem histórico, a pergunta ainda é respondida — só sem memória
       das anteriores. Melhor do que recusar por causa da memória. */
    console.warn('[caderno] não consegui ler a conversa:', e);
    return [];
  }
}

export async function gravarRodada(
  consultaId: string,
  pergunta: string,
  resposta: string,
): Promise<void> {
  try {
    await db.pesquisaPergunta.create({ data: { consultaId, pergunta, resposta } });
  } catch (e) {
    /* A resposta já foi paga e já está a caminho da tela. Falhar aqui
       custa o histórico, não a resposta. */
    console.warn('[caderno] não consegui gravar a rodada:', e);
  }
}

export class FalhaDoCaderno extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FalhaDoCaderno';
  }
}

export type SaidaCaderno = { resposta: string; uso: Uso; modelo: string };

export async function perguntarAoCaderno(entrada: {
  pergunta: string;
  material: string;
  anteriores: Rodada[];
  chave: string;
  modelo: string;
}): Promise<SaidaCaderno> {
  /* O material vai numa mensagem do usuário, e não no `system`, de
     propósito: `system` é onde mora a INSTRUÇÃO, e misturar as duas
     coisas é o que faz um texto vindo da web parecer ordem. O mesmo
     cuidado que separa contexto interno de conteúdo lido na busca. */
  const mensagens = [
    { role: 'user' as const, content: entrada.material },
    { role: 'assistant' as const, content: 'Certo. Vou responder só com esse material.' },
    ...entrada.anteriores.slice(-MAX_RODADAS).flatMap((r) => [
      { role: 'user' as const, content: r.pergunta },
      { role: 'assistant' as const, content: r.resposta },
    ]),
    { role: 'user' as const, content: entrada.pergunta },
  ];

  let resposta: Response;
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': entrada.chave,
        'anthropic-version': '2023-06-01',
      },
      /* Sem `tools`. Não é esquecimento: é a regra. O caderno não
         busca — se pudesse, a pergunta barata viraria uma busca cara
         sem passar pelo portão (`BOARD-PESQUISA-037`). */
      body: JSON.stringify({
        model: entrada.modelo,
        max_tokens: MAX_TOKENS_CADERNO,
        system: SISTEMA_CADERNO,
        messages: mensagens,
      }),
    });
  } catch {
    throw new FalhaDoCaderno('Não foi possível falar com o provedor.');
  }

  if (!resposta.ok) throw new FalhaDoCaderno('O provedor recusou a pergunta.');

  const dados = (await resposta.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
    model?: string;
  };

  const texto = (dados.content ?? [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();

  if (!texto) throw new FalhaDoCaderno('A resposta voltou vazia.');

  return { resposta: texto, uso: lerUso(dados.usage), modelo: dados.model ?? entrada.modelo };
}
