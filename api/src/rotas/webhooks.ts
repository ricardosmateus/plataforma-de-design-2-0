/* ============================================================
   Webhook do Pix — a campainha, não a entrega
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §6 (SEG-PAG),
                 §7 Fase 3

   SEG-PAG-002: este endpoint NUNCA credita com base no que o corpo
   diz. O corpo só traz o `txid` — quem confirma o que de fato
   aconteceu é `psp.consultarCobranca(txid)`, uma pergunta que sobe
   até a fonte (o PSP), não uma leitura do que acabou de chegar por
   POST. Um invasor que descobrisse o formato do corpo e não
   soubesse a assinatura não conseguiria inventar um pagamento —
   e mesmo que adivinhasse a assinatura, ainda dependeria do PSP
   confirmar, porque é lá que a pergunta é feita.

   SEG-PAG-001: sem assinatura válida, nem chega a consultar nada —
   401 direto. Um webhook sem essa trava é uma rota pública que
   qualquer um pode martelar com txids até acertar um válido.

   SEG-PAG-005: responde rápido, sempre. Nada aqui espera a
   Anthropic, e-mail ou qualquer coisa lenta — só banco.
   ============================================================ */

import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { db } from '../db.js';
import { env } from '../env.js';
import { pspAtual } from '../pagamentos/psp.js';
import { assinaturaMercadoPagoValida } from '../pagamentos/assinatura-mercado-pago.js';
import { lancar, LancamentoRepetido } from '../creditos/razao.js';

const CORPO = z.object({ txid: z.string().min(1).max(25) });

/* Assinatura sobre o TXID, não sobre o corpo bruto — evita a
   plumbing de capturar o corpo cru do Fastify (que por padrão já
   consumiu e parseou o JSON antes do handler rodar) só para um
   payload de um campo só. Trocar por HMAC sobre o corpo inteiro na
   Fase 4, se o PSP escolhido exigir, é mudança isolada aqui e em
   `scripts/simular-pagamento.ts` — nenhuma outra peça depende do
   formato da assinatura. */
function assinaturaValida(txid: string, assinaturaRecebida: string | undefined): boolean {
  if (!env.WEBHOOK_PIX_SECRET || !assinaturaRecebida) return false;

  const esperada = createHmac('sha256', env.WEBHOOK_PIX_SECRET).update(txid).digest();
  let recebida: Buffer;
  try {
    recebida = Buffer.from(assinaturaRecebida, 'hex');
  } catch {
    return false;
  }
  if (recebida.length !== esperada.length) return false;
  /* Tempo constante — mesma razão de `seguranca/otp.ts`: comparar
     com === vazaria, pelo tempo de resposta, quantos bytes bateram. */
  return timingSafeEqual(esperada, recebida);
}

/* ------------------------------------------------------------
   O que acontece depois que uma assinatura já foi validada —
   comum às duas rotas (sandbox e Mercado Pago). SEG-PAG-002 mora
   AQUI, não em cada rota: reconsulta o PSP, nunca confia no que
   qualquer corpo de webhook diz. Ter as duas rotas chamando a
   MESMA função é o que garante que essa regra não diverge entre
   um provedor e outro com o tempo.
   ------------------------------------------------------------ */
type ResultadoConfirmacao =
  | { ok: true; creditado: boolean }
  | { erro: string; codigo: number };

export async function confirmarPagamento(txid: string): Promise<ResultadoConfirmacao> {
  const statusReal = await pspAtual().consultarCobranca(txid);
  if (!statusReal) {
    return { erro: 'Cobrança não encontrada.', codigo: 404 };
  }

  const cobranca = await db.cobrancaPix.findUnique({ where: { txid } });
  if (!cobranca) {
    return { erro: 'Cobrança não encontrada.', codigo: 404 };
  }

  /* Só grava o retorno bruto, o e2eId e a taxa; o STATUS gravado
     aqui é o que o PSP disse agora, não o que o corpo do POST
     sugeriu. */
  await db.cobrancaPix.update({
    where: { txid },
    data: {
      status: statusReal.status,
      pagoEm: statusReal.pagoEm,
      e2eId: statusReal.e2eId,
      taxaMicros: statusReal.taxaMicros,
      retornoBruto: statusReal.bruto as object,
    },
  });

  if (statusReal.status !== 'pago') {
    /* 'aguardando' de novo (reenvio de um webhook que chegou
       cedo demais), 'expirado' ou 'cancelado': nada a creditar.
       200 mesmo assim — não é erro, é "recebido, nada a fazer". */
    return { ok: true, creditado: false };
  }

  /* O que entra na conta do usuário é o valor BRUTO menos a taxa
     que o PSP reteve — nunca o bruto sozinho. Cobrar o valor cheio
     quando a plataforma recebeu menos seria dar crédito que ninguém
     pagou. `Math.max(0, ...)`: uma taxa maior que o valor da
     cobrança não deveria existir, mas se existir, nunca vira
     crédito negativo — vira zero, e fica registrado em `taxaMicros`
     para investigação. */
  const taxa = statusReal.taxaMicros ?? 0;
  const valorLiquido = Math.max(0, cobranca.valorMicros - taxa);

  try {
    await lancar({
      usuarioId: cobranca.usuarioId,
      tipo: 'recarga',
      origem: 'cobranca_pix',
      /* origemId = o id da PRÓPRIA cobrança, não o txid: é o que
         `creditos_lancamentos` espera (coluna UUID) e o que a
         trava do DIN-004 usa — reenvio do mesmo webhook (comum e
         esperado) não credita duas vezes. */
      origemId: cobranca.id,
      valorMicros: valorLiquido,
      descricao: taxa > 0 ? 'Recarga via Pix (líquido — taxa do PSP descontada)' : 'Recarga via Pix',
    });
  } catch (e) {
    if (!(e instanceof LancamentoRepetido)) throw e;
    /* Já creditado por um webhook anterior — sucesso silencioso,
       não erro. É exatamente o caso que DIN-004 existe para cobrir. */
  }

  return { ok: true, creditado: true };
}

const CORPO_MERCADO_PAGO = z.object({
  type: z.string().optional(),
  action: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
});

export async function rotasWebhooks(app: FastifyInstance) {
  app.post('/webhooks/pix', async (req, resposta) => {
    if (!env.WEBHOOK_PIX_SECRET) {
      /* Erro de configuração, não do chamador — mas ainda assim
         nunca processa nada sem segredo configurado. */
      return resposta.code(503).send({ erro: 'Webhook de pagamento não está configurado.' });
    }

    const corpo = CORPO.safeParse(req.body);
    if (!corpo.success) return resposta.code(400).send({ erro: 'Corpo inválido.' });

    const assinatura = req.headers['x-assinatura'];
    if (typeof assinatura !== 'string' || !assinaturaValida(corpo.data.txid, assinatura)) {
      req.log.warn({ txid: corpo.data.txid }, 'webhook Pix com assinatura inválida — recusado');
      return resposta.code(401).send({ erro: 'Assinatura inválida.' });
    }

    const { txid } = corpo.data;

    const resultado = await confirmarPagamento(txid);
    if ('erro' in resultado) {
      req.log.error({ txid }, `webhook Pix: ${resultado.erro}`);
      return resposta.code(resultado.codigo).send({ erro: resultado.erro });
    }
    return resposta.send(resultado);
  });

  /* ---------- Webhook do Mercado Pago — Fase 4 ----------
     Formato deles, diferente da rota acima (que é do PSP sandbox):
     a notificação traz `type`/`data.id` (o id do PAGAMENTO no
     Mercado Pago — que é o nosso `txid` para este Psp, ver
     `psp-mercado-pago.ts`), não um `txid` direto no corpo. A
     assinatura também é outra (`assinatura-mercado-pago.ts`).
     SEG-PAG-001 e SEG-PAG-002 continuam valendo do mesmo jeito:
     sem assinatura válida não passa, e quem decide o status é
     sempre `confirmarPagamento()` reconsultando o PSP — nunca o
     que este corpo diz. */
  app.post('/webhooks/pix/mercado-pago', async (req, resposta) => {
    /* Log explícito, independente do `logger` do Fastify — que fica
       DESLIGADO fora de produção (`logger: producao`, servidor.ts).

       Isto NÃO é resto de depuração: é permanente, e ganhou o direito
       de existir no teste ao vivo da Fase 4. O modo de falha desta
       rota é sempre o mesmo — ela não faz nada e ninguém fica sabendo.
       Passamos por três variantes disso (túnel do ngrok caído, túnel
       tentando IPv6 contra uma API só-IPv4, e um Prisma Client
       desatualizado quebrando o processamento), e em NENHUMA delas o
       terminal mostrava qualquer coisa: nem sucesso, nem erro. Um
       webhook de pagamento silencioso é indistinguível de um webhook
       que funciona — até alguém conferir o saldo. */
    console.log('[webhook mercado-pago] recebido', { query: req.query, corpo: req.body });

    if (!env.MERCADO_PAGO_WEBHOOK_SECRET) {
      console.error('[webhook mercado-pago] 503 — MERCADO_PAGO_WEBHOOK_SECRET não configurado');
      return resposta.code(503).send({ erro: 'Webhook do Mercado Pago não está configurado.' });
    }

    /* O `data.id` que entra na assinatura vem da QUERY STRING, não
       do corpo — é assim que a doc do Mercado Pago descreve o
       manifest. O corpo serve de reserva para quando a notificação
       não trouxer query string (varia por tipo de configuração no
       painel deles). */
    const query = req.query as Record<string, unknown>;
    const corpo = CORPO_MERCADO_PAGO.safeParse(req.body);

    const tipo = typeof query.type === 'string' ? query.type : corpo.data?.type;
    const dataIdBruto = typeof query['data.id'] === 'string' ? query['data.id'] : corpo.data?.data?.id;
    if (dataIdBruto == null) return resposta.code(400).send({ erro: 'Corpo inválido.' });
    const dataId = String(dataIdBruto);

    const assinaturaOk = assinaturaMercadoPagoValida({
      xSignature: req.headers['x-signature'] as string | undefined,
      xRequestId: req.headers['x-request-id'] as string | undefined,
      dataId,
      secret: env.MERCADO_PAGO_WEBHOOK_SECRET,
    });
    if (!assinaturaOk) {
      req.log.warn({ dataId }, 'webhook Mercado Pago com assinatura inválida — recusado');
      console.warn('[webhook mercado-pago] 401 — assinatura inválida', {
        dataId,
        xSignaturePresente: Boolean(req.headers['x-signature']),
        xRequestIdPresente: Boolean(req.headers['x-request-id']),
      });
      return resposta.code(401).send({ erro: 'Assinatura inválida.' });
    }

    if (tipo && tipo !== 'payment') {
      /* Outro tipo de evento (merchant_order, order, etc.) — não é
         nosso, mas confirma recebido: 200 evita que o Mercado Pago
         fique reenviando algo que nunca vamos processar.

         ATENÇÃO ao ler este log: se um Pix REAL nosso chegar aqui
         com `type: 'order'` em vez de 'payment', o crédito nunca
         acontece — e sem este log seria um 200 silencioso,
         indistinguível de sucesso. Se isso aparecer com um `dataId`
         que corresponde a uma cobrança nossa, é sinal de que o
         Mercado Pago migrou a notificação para a Orders API e esta
         rota precisa tratar esse formato (o `data.id` de uma
         notificação de "order" é o id do PEDIDO, não do pagamento —
         consultar `/v1/payments/{id}` com ele daria 404). */
      console.log('[webhook mercado-pago] ignorado — evento não é de pagamento', { tipo, dataId });
      return resposta.send({ ok: true, creditado: false });
    }

    const resultado = await confirmarPagamento(dataId);
    if ('erro' in resultado) {
      req.log.error({ txid: dataId }, `webhook Mercado Pago: ${resultado.erro}`);
      console.error('[webhook mercado-pago] erro ao confirmar', { dataId, resultado });
      return resposta.code(resultado.codigo).send({ erro: resultado.erro });
    }
    console.log('[webhook mercado-pago] concluído', { dataId, resultado });
    return resposta.send(resultado);
  });
}
