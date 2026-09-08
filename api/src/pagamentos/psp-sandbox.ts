/* ============================================================
   PSP sandbox — dinheiro falso, payload de verdade
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §7, Fase 3

   `criarCobranca` não fala com banco nenhum: gera um BR Code de
   verdade (CRC correto, campos corretos — `brcode.ts`) sem
   depender de rede. É deliberado que esta função não toque o
   banco: a criação de uma cobrança é rápida e pura o bastante para
   não precisar, e mantém o contrato simétrico com um PSP real
   (que também não conhece a NOSSA tabela).

   `consultarCobranca`, ao contrário, LÊ `cobrancas_pix` — e essa
   assimetria é proposital, não descuido: em produção, "consultar"
   pergunta ao PSP externo qual é a verdade; em sandbox, não existe
   PSP externo, então a verdade mora na nossa própria tabela, que
   `scripts/simular-pagamento.ts` atualiza de fora do processo da
   API (do mesmo jeito que um banco de verdade atualizaria o dele).
   Isso preserva a regra real (SEG-PAG-002: o webhook nunca confia
   no próprio corpo, sempre reconsulta) mesmo sem PSP de verdade —
   é o comportamento de produção sendo ENSAIADO, não simulado por
   atalho.
   ============================================================ */

import { db } from '../db.js';
import { montarBrcode, gerarTxid } from './brcode.js';
import type { Psp, CobrancaCriada, StatusConsultado } from './psp.js';

const MINUTOS_PARA_EXPIRAR = 30;

export class PspSandbox implements Psp {
  constructor(
    private readonly chavePix: string,
    private readonly nomeRecebedor: string,
    private readonly cidadeRecebedor: string,
  ) {}

  async criarCobranca(input: { valorMicros: number; descricao: string }): Promise<CobrancaCriada> {
    const txid = gerarTxid();
    const expiraEm = new Date(Date.now() + MINUTOS_PARA_EXPIRAR * 60_000);

    const brcode = montarBrcode({
      chavePix: this.chavePix,
      valorMicros: input.valorMicros,
      txid,
      nomeRecebedor: this.nomeRecebedor,
      cidadeRecebedor: this.cidadeRecebedor,
      descricao: input.descricao,
    });

    return { txid, brcode, expiraEm };
  }

  async consultarCobranca(txid: string): Promise<StatusConsultado | null> {
    const c = await db.cobrancaPix.findUnique({ where: { txid } });
    if (!c) return null;

    return {
      status: c.status,
      pagoEm: c.pagoEm,
      e2eId: c.e2eId,
      /* Sandbox não cobra taxa nenhuma — de propósito, não por
         esquecimento. `null`, nunca `0`: `0` afirmaria "cobrei e a
         taxa deu zero", quando na verdade não há cobrança real
         nenhuma acontecendo aqui pra medir. */
      taxaMicros: null,
      bruto: { sandbox: true, txid: c.txid, status: c.status, pagoEm: c.pagoEm, e2eId: c.e2eId },
    };
  }
}
