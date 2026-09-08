/* ============================================================
   Assinatura do webhook do Mercado Pago
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §6 (SEG-PAG-001),
                 Fase 4

   Formato deles, diferente do PSP sandbox (`rotas/webhooks.ts`
   assina só o `txid`). Aqui o texto assinado é um "manifest" fixo:

     id:{data.id, minúsculo};request-id:{x-request-id};ts:{ts};

   — construído a partir de duas fontes: o header `x-signature`
   (que traz `ts=...,v1=...`, o timestamp e o HMAC em si) e o
   `data.id`/`x-request-id` que acompanham a notificação. Isolado
   num arquivo próprio pelo mesmo motivo de `seguranca/otp.ts`:
   é criptografia, testa-se sozinho, sem precisar do Fastify nem do
   banco por perto.
   ============================================================ */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function assinaturaMercadoPagoValida(params: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = params;
  if (!xSignature || !dataId) return false;

  /* "ts=1704908010,v1=618c8534..." — nem sempre nessa ordem, por
     isso lê como pares chave=valor em vez de posição fixa. */
  const partes = new Map<string, string>();
  for (const par of xSignature.split(',')) {
    const i = par.indexOf('=');
    if (i === -1) continue;
    partes.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1) return false;

  /* `request-id` só entra no manifest quando existe — a doc do
     Mercado Pago é explícita que um campo ausente na notificação
     some do texto assinado, não vira string vazia. */
  let manifest = `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const esperada = createHmac('sha256', secret).update(manifest).digest('hex');

  const bufEsperada = Buffer.from(esperada, 'hex');
  let bufRecebida: Buffer;
  try {
    bufRecebida = Buffer.from(v1, 'hex');
  } catch {
    return false;
  }
  if (bufRecebida.length !== bufEsperada.length) return false;
  /* Tempo constante — mesmo motivo de `assinaturaValida` em
     `rotas/webhooks.ts` e de `seguranca/otp.ts`. */
  return timingSafeEqual(bufEsperada, bufRecebida);
}
