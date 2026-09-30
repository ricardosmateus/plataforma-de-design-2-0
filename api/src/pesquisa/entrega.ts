/* ============================================================
   A busca respondeu? — o que vai à busca e o que volta dela (PURO)
   ============================================================
   Regras:  board-lista.md, BOARD-PESQUISA-088 a 091
   Plano:   planejamento-jev-board.md §1.1 e Fase 1

   Nasceu da investigação de 30/09/2026 na tarefa 93a6236f…: o
   planejador escreveu quatro perguntas boas, e a busca devolveu uma
   NEGOCIAÇÃO DE ESCOPO ("Preciso esclarecer o escopo antes de
   proceder… Você quer que eu vá direto nas 4 perguntas?"), com zero
   fontes. A rota contava qualquer texto como achado — `entregue`,
   "Pronto.", seis "afirmações" feitas da negociação, quatro vezes.

   Dois lados, os dois aqui para serem testados sem rede:
   1. O QUE VAI: as perguntas do plano primeiro, e a tarefa só como
      contexto, com a ordem de não negociar. Antes, o texto inteiro
      da tarefa ia na frente — com o "Entrega: mood board" que a busca
      não sabe fazer, e a que ela reagiu.
   2. O QUE VOLTA: resposta SEM FONTE NENHUMA que devolve perguntas ou
      se apresenta como pedido de esclarecimento não é resultado.
      Instrução não é garantia: o prompt pede para não negociar, e
      este é o código que confere.
   ============================================================ */

export function textoDaBusca(tarefa: string, perguntas: { pergunta: string }[]): string {
  const lista = perguntas.map((p, i) => `${i + 1}. ${p.pergunta}`).join('\n');
  return (
    `Responda, com fonte, cada uma destas perguntas:\n${lista}\n\n` +
    `Estas perguntas saem desta tarefa do projeto, que vai aqui só como contexto:\n"""${tarefa.replace(/"""/g, '"')}"""\n\n` +
    'Não devolva pedido de esclarecimento nem pergunte o que a pessoa prefere: responda as perguntas acima. ' +
    'Se a tarefa pedir algo que uma busca na web não produz (imagens, mood board, apresentação, arquivo), ' +
    'não negocie — responda o que dá para responder com fonte e diga, numa linha no fim, o que ficou de fora.'
  );
}

export type VereditoDaBusca =
  | { respondeu: true }
  | { respondeu: false; motivo: 'pergunta-de-volta' | 'esclarecimento'; mensagem: string };

export const MENSAGEM_NAO_PESQUISOU =
  'A busca não pesquisou: devolveu perguntas em vez de resultado, sem nenhuma fonte. Nada foi colocado no quadro.';

function semMarcacao(t: string): string {
  return t.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
}

const ABRE_COMO_ESCLARECIMENTO =
  /^(preciso (esclarecer|entender|saber|confirmar)|antes de (prosseguir|continuar|come[cç]ar|seguir)|para (que eu possa|eu poder|poder) (responder|seguir|continuar)|n[aã]o (consigo|posso) (fazer|atender|entregar|coletar))/i;

const PEDE_ESCOLHA =
  /(voc[eê] (quer|prefere|gostaria) que eu|posso (seguir|ir) (com|por|direto)|me (confirme|diga (qual|se))|qual (dessas|destas) op[cç][oõ]es)/i;

/**
 * BOARD-PESQUISA-088. Só julga resposta SEM fonte: com fonte, houve
 * pesquisa — e uma resposta com fonte que termina perguntando "o que
 * faltou?" continua sendo resultado (PES-006, lacunas).
 */
export function avaliarSeRespondeu(resposta: string, fontes: readonly unknown[]): VereditoDaBusca {
  if (fontes.length > 0) return { respondeu: true };
  const texto = String(resposta ?? '').trim();
  if (!texto) return { respondeu: true }; // vazio já é `vazio` para classificarResultado

  const paragrafos = texto.split(/\n\s*\n/).map(semMarcacao).filter(Boolean);
  const primeiro = paragrafos[0] ?? '';
  const ultimo = paragrafos[paragrafos.length - 1] ?? '';

  if (ABRE_COMO_ESCLARECIMENTO.test(primeiro) || PEDE_ESCOLHA.test(texto)) {
    return { respondeu: false, motivo: 'esclarecimento', mensagem: MENSAGEM_NAO_PESQUISOU };
  }
  if (/\?$/.test(ultimo)) {
    return { respondeu: false, motivo: 'pergunta-de-volta', mensagem: MENSAGEM_NAO_PESQUISOU };
  }
  return { respondeu: true };
}
