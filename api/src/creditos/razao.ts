/* ============================================================
   A razão — todo movimento de dinheiro passa por aqui
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §3 e §4.1

   Existe UMA porta para mexer em saldo: `lancar()`. Nenhuma rota,
   nenhum script e nenhuma outra função escreve em `saldoMicros`
   direto. Essa restrição é o que torna a regra verificável: se o
   saldo divergir da soma dos lançamentos, o bug está neste arquivo
   e em nenhum outro.

   ------------------------------------------------------------
   AS DUAS COISAS QUE ESTE ARQUIVO GARANTE
   ------------------------------------------------------------
   1. Lançamento e saldo mudam JUNTOS ou não mudam (transação). Um
      saldo atualizado sem linha correspondente é dinheiro sem
      procedência; uma linha sem saldo atualizado é o extrato
      mentindo. Os dois casos são invisíveis até alguém reclamar.

   2. O saldo nunca fica negativo por débito. Débito maior que o
      saldo é RECUSADO, com erro tipado — não vira saldo negativo
      silencioso.
   ============================================================ */

import { db } from '../db.js';
import type { Prisma } from '@prisma/client';

export type TipoLancamento = 'recarga' | 'consumo' | 'reserva' | 'liberacao' | 'estorno' | 'ajuste';
export type OrigemLancamento = 'cobranca_pix' | 'uso_ia' | 'contratacao' | 'manual' | 'pesquisa';

export type Lancamento = {
  usuarioId: string;
  tipo: TipoLancamento;
  origem: OrigemLancamento;
  /** Com sinal: positivo entra, negativo sai. */
  valorMicros: number;
  origemId?: string | null;
  descricao: string;
};

/* Erros tipados: quem chamou precisa distinguir "não tem saldo"
   (que vira 402 e é situação normal) de "já lancei isso antes"
   (que vira sucesso silencioso, porque é o webhook repetindo) de
   um erro de programação, que não deve virar nenhum dos dois. */
export class SaldoInsuficiente extends Error {
  constructor(readonly saldoMicros: number, readonly pedidoMicros: number) {
    super('Saldo insuficiente.');
    this.name = 'SaldoInsuficiente';
  }
}

export class LancamentoRepetido extends Error {
  constructor() {
    super('Este lançamento já foi feito.');
    this.name = 'LancamentoRepetido';
  }
}

/* ------------------------------------------------------------
   A única porta
   ------------------------------------------------------------
   `Serializable` e não o padrão: duas requisições simultâneas do
   mesmo usuário poderiam ler o mesmo saldo, cada uma subtrair, e
   as duas gravarem — gastando duas vezes o mesmo dinheiro. É o
   erro clássico de saldo, e ele só aparece sob concorrência, que
   é justamente quando ninguém está olhando.
   ------------------------------------------------------------ */
export async function lancar(l: Lancamento): Promise<{ saldoMicros: number; id: string }> {
  if (!Number.isInteger(l.valorMicros)) {
    /* Fração aqui é ponto flutuante entrando pela janela. */
    throw new RangeError('valorMicros precisa ser inteiro (micro de real)');
  }
  if (l.valorMicros === 0) {
    throw new RangeError('lançamento de valor zero não tem o que registrar');
  }

  try {
    return await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const usuario = await tx.usuario.findUnique({
          where: { id: l.usuarioId },
          select: { saldoMicros: true },
        });
        if (!usuario) throw new Error(`usuário ${l.usuarioId} não existe`);

        const saldoDepois = usuario.saldoMicros + l.valorMicros;

        if (saldoDepois < 0) {
          /* Recusa, não saldo negativo. Um saldo negativo é crédito
             que ninguém autorizou, e ele se espalha em silêncio. */
          throw new SaldoInsuficiente(usuario.saldoMicros, -l.valorMicros);
        }

        const linha = await tx.creditoLancamento.create({
          data: {
            usuarioId: l.usuarioId,
            tipo: l.tipo,
            origem: l.origem,
            valorMicros: l.valorMicros,
            saldoDepois,
            origemId: l.origemId ?? null,
            descricao: l.descricao,
          },
          select: { id: true },
        });

        await tx.usuario.update({
          where: { id: l.usuarioId },
          data: { saldoMicros: saldoDepois },
        });

        return { saldoMicros: saldoDepois, id: linha.id };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (e) {
    /* P2002 = violação de unicidade. Aqui só pode ser a trava do
       DIN-004: a mesma origem tentando gerar o mesmo lançamento
       duas vezes. Vira erro TIPADO para quem chamou tratar como
       "já estava feito", que é sucesso — e não como falha. */
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      throw new LancamentoRepetido();
    }
    throw e;
  }
}

/* ------------------------------------------------------------
   Leitura
   ------------------------------------------------------------ */

export async function saldoDe(usuarioId: string): Promise<number> {
  const u = await db.usuario.findUnique({
    where: { id: usuarioId },
    select: { saldoMicros: true },
  });
  return u?.saldoMicros ?? 0;
}

export async function extratoDe(usuarioId: string, limite = 50) {
  return db.creditoLancamento.findMany({
    where: { usuarioId },
    orderBy: { criadoEm: 'desc' },
    take: Math.min(Math.max(1, limite), 200),
  });
}

/* ------------------------------------------------------------
   Conferência — DIN-002
   ------------------------------------------------------------
   O saldo é cache; a soma dos lançamentos é a verdade. Se os dois
   divergirem, alguma escrita aconteceu fora de `lancar()` — e é
   exatamente o tipo de coisa que ninguém descobre sozinho.

   Não corrige: só relata. Corrigir automaticamente esconderia a
   causa, e a causa é um bug que vai voltar.
   ------------------------------------------------------------ */
export async function conferir(usuarioId: string): Promise<{
  bate: boolean;
  saldoGravado: number;
  somaDosLancamentos: number;
}> {
  const [u, soma] = await Promise.all([
    db.usuario.findUnique({ where: { id: usuarioId }, select: { saldoMicros: true } }),
    db.creditoLancamento.aggregate({ where: { usuarioId }, _sum: { valorMicros: true } }),
  ]);
  const saldoGravado = u?.saldoMicros ?? 0;
  const somaDosLancamentos = soma._sum.valorMicros ?? 0;
  return { bate: saldoGravado === somaDosLancamentos, saldoGravado, somaDosLancamentos };
}
