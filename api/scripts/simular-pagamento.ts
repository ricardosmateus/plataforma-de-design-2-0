/* ============================================================
   Simular o pagamento de uma cobrança Pix — só em sandbox
   ============================================================
   Rodar:
     npm run simular-pagamento -- <txid>

   ------------------------------------------------------------
   O QUE ISTO FAZ, E POR QUE É DUAS ETAPAS
   ------------------------------------------------------------
   1. Marca a cobrança como paga em `cobrancas_pix` — é o papel do
      "banco": só o banco sabe que o dinheiro mudou de mão, e é
      exatamente esse papel que este script está representando.
   2. Chama o `POST /webhooks/pix`, ASSINADO, do mesmo jeito que um
      PSP de verdade chamaria — por HTTP, de fora do processo da
      API, com a mesma assinatura que `rotasWebhooks` exige.

   Não faz as duas coisas numa função só, e não pula a etapa 2
   chamando `lancar()` direto: o ponto inteiro da Fase 3 é ENSAIAR
   o caminho real (webhook → reconsulta ao PSP → crédito), não
   atalhar por cima dele. Se o webhook estiver quebrado, este
   script tem que mostrar isso — não escondê-lo creditando por
   fora.

   Exige `WEBHOOK_PIX_SECRET` no `.env` e a API rodando (`npm run
   dev`, noutro terminal) — sem as duas coisas, o passo 2 falha, e é
   isso mesmo que deve acontecer.
   ============================================================ */

import { createHmac, randomBytes } from 'node:crypto';

import { db } from '../src/db.js';
import { env } from '../src/env.js';
import { formatarReais } from '../src/creditos/dinheiro.js';

const [txid] = process.argv.slice(2);

function uso(): never {
  console.log('\n  npm run simular-pagamento -- <txid>\n');
  console.log('  O txid aparece na resposta de POST /creditos/recarga,');
  console.log('  ou na tela, no código "copia e cola" gerado.\n');
  process.exit(1);
}

/* Id que o Banco Central daria ao Pix pago de verdade. Formato
   plausível (E + 32 dígitos), nunca usado fora de sandbox. */
function e2eIdFalso(): string {
  return 'E' + randomBytes(16).toString('hex').toUpperCase();
}

async function main() {
  if (!txid) uso();
  if (!env.WEBHOOK_PIX_SECRET) {
    console.error('\n  WEBHOOK_PIX_SECRET não está no .env — configure antes de simular.\n');
    process.exit(1);
  }

  const cobranca = await db.cobrancaPix.findUnique({ where: { txid } });
  if (!cobranca) {
    console.error(`\n  Nenhuma cobrança com txid "${txid}".\n`);
    process.exit(1);
  }
  if (cobranca.status !== 'aguardando') {
    console.error(`\n  Esta cobrança já está "${cobranca.status}", não "aguardando" — nada a simular.\n`);
    process.exit(1);
  }

  const e2eId = e2eIdFalso();
  await db.cobrancaPix.update({
    where: { txid },
    data: { status: 'pago', pagoEm: new Date(), e2eId },
  });
  console.log(`\n  "Banco" confirma pagamento de ${formatarReais(cobranca.valorMicros)} — txid ${txid}`);

  const assinatura = createHmac('sha256', env.WEBHOOK_PIX_SECRET).update(txid).digest('hex');
  const url = `http://localhost:${env.PORTA}/webhooks/pix`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-assinatura': assinatura },
      body: JSON.stringify({ txid }),
    });
  } catch {
    console.error(`\n  Não consegui falar com ${url}.`);
    console.error('  A API está rodando (npm run dev, noutro terminal)?\n');
    process.exit(1);
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    console.error(`\n  Webhook recusou: ${resposta.status} ${JSON.stringify(corpo)}\n`);
    process.exit(1);
  }

  console.log(`  Webhook respondeu: ${JSON.stringify(corpo)}`);

  const usuario = await db.usuario.findUnique({ where: { id: cobranca.usuarioId }, select: { saldoMicros: true } });
  console.log(`  Saldo agora: ${formatarReais(usuario?.saldoMicros ?? 0)}\n`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
