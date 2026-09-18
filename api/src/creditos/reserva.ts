/* ============================================================
   Reservar / liberar / consumir — Fase 2
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §5

   `razao.ts` já garante que lançamento e saldo mudam juntos e que
   o saldo nunca fica negativo. Este arquivo não reimplementa nada
   disso — é só o VOCABULÁRIO do fluxo de consumo de IA por cima de
   `lancar()`, para quem chama (as rotas) não escrever `tipo:
   'reserva'` e `valorMicros` com sinal trocado espalhado pelo
   código.

   ------------------------------------------------------------
   POR QUE RESERVAR ANTES DE CHAMAR
   ------------------------------------------------------------
   O custo real só se conhece DEPOIS que o provedor responde (é o
   `usage` da resposta). Mas o saldo precisa ser conferido ANTES —
   senão alguém com R$ 0,05 poderia disparar uma chamada de R$ 5,00
   e só descobrir que não tinha saldo depois de já ter sido cobrado
   por ela. Por isso a chamada é sempre:

     reservar (teto, superestimado)  →  chamar o provedor  →
     liberar a reserva inteira  →  consumir o valor VERDADEIRO

   O saldo cai duas vezes (reserva, depois consumo) e sobe uma
   (liberação) — mas a liberação é sempre do valor cheio da reserva,
   então o efeito líquido é exatamente o custo real, nunca o teto.
   O `origemId` é o mesmo nas três linhas: é o que amarra a
   reserva, a liberação e o consumo de uma mesma chamada no extrato,
   e a trava `(tipo, origemId)` de `razao.ts` impede que a mesma
   chamada libere ou consuma duas vezes.
   ============================================================ */

import { lancar, saldoDe, SaldoInsuficiente, LancamentoRepetido, type OrigemLancamento } from './razao.js';
import { env } from '../env.js';

export { SaldoInsuficiente, LancamentoRepetido };

/* ------------------------------------------------------------
   A CHAVE DE COBRANÇA MORA AQUI, E NÃO NAS ROTAS
   ------------------------------------------------------------
   `CREDITOS_COBRAR="nao"` promete, no `.env.example`, que "a IA
   responde normalmente mas nada sai do saldo de ninguém". Até
   15/09/2026 essa promessa era cumprida por cada rota lembrar de
   perguntar — `rotas/ia.ts`, recortes, taxonomia, enriquecimento —
   e as rotas de pesquisa, que nasceram depois, não lembraram.
   Investigar em desenvolvimento debitava saldo de verdade.

   Pedir a cada rota que não cobre é instrução; cortar aqui é
   garantia. Reserva, liberação e consumo são o único caminho para
   a razão, então desligar aqui desliga para todo chamador — os que
   existem e os que vierem.

   O que NÃO se desliga junto: a MEDIÇÃO. `registrarPesquisa` e
   `registrar` gravam tokens, buscas e custo em dólar por outro
   caminho, e continuam gravando. PES-003 — "o custo vem do
   provedor, transação a transação" — vale igual com a cobrança
   desligada; o que para é o débito, não a conta.

   Nota: as verificações de `CREDITOS_COBRAR` que já existem nas
   rotas de IA ficam onde estão. Elas não são mais o mecanismo —
   são um atalho, que também evita calcular um teto que ninguém vai
   reservar. Quem for escrever rota nova não precisa copiá-las.
   ------------------------------------------------------------ */
function cobrancaLigada(): boolean {
  return env.CREDITOS_COBRAR === 'sim';
}

export type OperacaoConsumo = 'assistente' | 'classificacao' | 'pesquisa' | 'sintese_tema';

/* A pesquisa entra na razão com origem própria, e não como 'uso_ia':
   do nível 'busca' em diante quem cobra é um provedor externo que não
   é o de IA, e somar os dois numa origem só impediria responder
   depois "quanto gastei com pesquisa?" — que é a pergunta que DIN-005
   existe para manter respondível. */
const ORIGEM: Record<OperacaoConsumo, OrigemLancamento> = {
  assistente: 'uso_ia',
  classificacao: 'uso_ia',
  // Mesma origem de classificação: é a mesma IA, o mesmo provedor —
  // "quanto se gastou com IA" continua uma pergunta só. O que muda é
  // o `tipo` em ConsumoIa ('sintese_tema'), que separa a resposta a
  // "quanto custou enriquecer os temas" de "quanto custou classificar".
  sintese_tema: 'uso_ia',
  pesquisa: 'pesquisa',
};

const NOME: Record<OperacaoConsumo, string> = {
  assistente: 'assistente',
  classificacao: 'classificação automática',
  sintese_tema: 'leitura guiada de tema',
  pesquisa: 'pesquisa de concorrentes',
};

function descricaoDe(operacao: OperacaoConsumo, fase: 'reserva' | 'liberacao' | 'consumo'): string {
  const nome = NOME[operacao];
  if (fase === 'reserva') return `Reserva — pergunta ao ${nome}`;
  if (fase === 'liberacao') return `Reserva devolvida — ${nome}`;
  return `Uso da plataforma — ${nome}`;
}

/** Confere se HÁ saldo para o teto, sem gastar nada ainda. É uma
 * checagem otimista: evita fazer a reserva (que já é uma escrita no
 * banco) quando dá para ver de antemão que não vai fechar. A trava
 * de verdade continua sendo a transação de `lancar()` — esta função
 * só evita o caso comum de bater na trava. */
export async function temSaldoPara(usuarioId: string, tetoMicros: number): Promise<boolean> {
  const saldo = await saldoDe(usuarioId);
  return saldo >= tetoMicros;
}

/** Reserva o teto — o saldo cai AGORA, antes de qualquer chamada ao
 * provedor. Lança `SaldoInsuficiente` quando não há saldo (o chamador
 * trata isso como 402, nunca chama o provedor). */
export async function reservar(
  usuarioId: string,
  tetoMicros: number,
  origemId: string,
  operacao: OperacaoConsumo,
): Promise<{ saldoMicros: number | null }> {
  /* Desligada a cobrança, não há reserva — e, portanto, não há
     `SaldoInsuficiente`: quem não é cobrado não pode ficar sem
     saldo.

     `null`, e não zero nem o saldo lido do banco. Zero seria
     mentira; ler o saldo seria uma ida ao banco para produzir um
     número que nenhum chamador usa — e que tornaria esta função
     impossível de provar sem banco de pé. `null` diz o que é
     verdade: nada foi lançado, então não há saldo novo a informar. */
  if (!cobrancaLigada()) return { saldoMicros: null };

  const r = await lancar({
    usuarioId,
    tipo: 'reserva',
    origem: ORIGEM[operacao],
    valorMicros: -Math.abs(tetoMicros),
    origemId,
    descricao: descricaoDe(operacao, 'reserva'),
  });
  return { saldoMicros: r.saldoMicros };
}

/** Devolve a reserva inteira. Chamado sempre — deu certo ou deu
 * errado a chamada ao provedor — porque o teto nunca é o custo
 * final: o custo final é liquidado à parte, por `consumir()`.
 * `LancamentoRepetido` aqui significa que esta reserva já tinha
 * sido liberada antes (reentrância) — trata como sucesso, não como
 * erro, pelo mesmo motivo que um webhook repetido não é falha. */
export async function liberar(
  usuarioId: string,
  tetoMicros: number,
  origemId: string,
  operacao: OperacaoConsumo,
): Promise<void> {
  /* Nada foi reservado, então não há o que devolver. Sair aqui é o
     que mantém reserva e liberação sempre em par: se só uma das
     duas respeitasse a chave, o saldo andaria sozinho. */
  if (!cobrancaLigada()) return;

  try {
    await lancar({
      usuarioId,
      tipo: 'liberacao',
      origem: ORIGEM[operacao],
      valorMicros: Math.abs(tetoMicros),
      origemId,
      descricao: descricaoDe(operacao, 'liberacao'),
    });
  } catch (e) {
    if (e instanceof LancamentoRepetido) return;
    throw e;
  }
}

/** Debita o custo VERDADEIRO (custo + comissão), depois que a
 * reserva já foi liberada. Chamado só quando a resposta foi
 * entregue e é cobrável (IA-CUSTO-003: resposta descartada não
 * chega aqui).
 *
 * O caso raro e feio: o teto era uma estimativa, e a saída real
 * ficou maior do que o previsto (texto de entrada mal estimado por
 * caractere, por exemplo) — depois de devolver a reserva, o saldo
 * pode não cobrir o custo verdadeiro inteiro. Cobrar por uma
 * resposta que JÁ FOI PAGA à Anthropic e já foi entregue à pessoa é
 * mais importante do que nunca deixar o saldo negativo por um
 * instante — a chamada não pode ser desfeita a essa altura. Por
 * isso, e só aqui, um saldo insuficiente vira um consumo do que
 * houver disponível (o saldo vai a zero, não fica negativo) em vez
 * de lançar erro — e quem chamou registra isso para revisão. */
export async function consumir(
  usuarioId: string,
  totalMicros: number,
  origemId: string,
  operacao: OperacaoConsumo,
): Promise<{ saldoMicros: number | null; cobradoIntegralmente: boolean }> {
  /* `cobradoIntegralmente: true` porque não ficou dívida para
     trás. `false` significa "a chamada foi entregue e o saldo não
     cobriu", que aciona revisão em quem chama — dizer isso quando
     a cobrança está desligada inventaria um prejuízo que não
     existe. */
  if (!cobrancaLigada()) return { saldoMicros: null, cobradoIntegralmente: true };

  try {
    const r = await lancar({
      usuarioId,
      tipo: 'consumo',
      origem: ORIGEM[operacao],
      valorMicros: -Math.abs(totalMicros),
      origemId,
      descricao: descricaoDe(operacao, 'consumo'),
    });
    return { saldoMicros: r.saldoMicros, cobradoIntegralmente: true };
  } catch (e) {
    if (e instanceof LancamentoRepetido) {
      return { saldoMicros: await saldoDe(usuarioId), cobradoIntegralmente: true };
    }
    if (e instanceof SaldoInsuficiente) {
      /* Cobra o que houver — nunca mais que o saldo, nunca menos do
         que zero. É a única exceção da casa a "débito maior que o
         saldo é recusado": aqui a chamada já aconteceu e já foi
         paga, então recusar não devolve dinheiro nenhum, só
         esconderia o prejuízo em vez de registrá-lo. */
      if (e.saldoMicros <= 0) return { saldoMicros: e.saldoMicros, cobradoIntegralmente: false };
      /* Reaproveita o MESMO origemId: a tentativa anterior lançou
         `SaldoInsuficiente` DENTRO da transação de `lancar()`, que
         foi revertida inteira — nenhuma linha 'consumo' chegou a
         existir com este origemId, então a trava de unicidade não
         colide aqui. */
      const r = await lancar({
        usuarioId,
        tipo: 'consumo',
        origem: ORIGEM[operacao],
        valorMicros: -e.saldoMicros,
        origemId,
        descricao: `${descricaoDe(operacao, 'consumo')} (cobrado parcialmente — saldo esgotado)`,
      });
      return { saldoMicros: r.saldoMicros, cobradoIntegralmente: false };
    }
    throw e;
  }
}
