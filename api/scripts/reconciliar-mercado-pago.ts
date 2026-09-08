/* ============================================================
   Reconciliar cobranças Pix "presas" — quando o webhook não chegou
   ============================================================
   Rodar:
     npm run reconciliar
     npm run reconciliar -- <txid>

   ------------------------------------------------------------
   POR QUE ISTO EXISTE
   ------------------------------------------------------------
   O crédito de uma recarga Pix normalmente entra pelo webhook
   (`/webhooks/pix/mercado-pago`) — mas o webhook depende do túnel
   (ngrok, em desenvolvimento) estar de pé NO MOMENTO em que o
   Mercado Pago tenta avisar. Se o túnel cair (ou nunca tiver
   subido), a notificação nunca chega, e a cobrança fica presa em
   "aguardando" mesmo com o Pix já pago de verdade do lado do banco.

   Este script não inventa um crédito: ele chama a MESMA função que
   o webhook chamaria — `confirmarPagamento()`, que reconsulta o PSP
   (SEG-PAG-002) antes de decidir qualquer coisa. Rodar isto contra
   uma cobrança que ainda não foi paga simplesmente não credita nada
   (a reconsulta continua dizendo "aguardando"). É seguro rodar mais
   de uma vez — a trava de idempotência de `razao.ts` (DIN-004)
   impede duplicar o crédito de uma cobrança já confirmada.

   Sem argumento: varre todas as cobranças em "aguardando" com PSP
   diferente de sandbox (o sandbox tem `simular-pagamento.ts` para
   isso). Com um txid: reconcilia só aquela.
   ============================================================ */

import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI. */
}

const [txidArg] = process.argv.slice(2);

async function main() {
  const { db } = await import('../src/db.js');
  const { confirmarPagamento } = await import('../src/rotas/webhooks.js');
  const { formatarReais } = await import('../src/creditos/dinheiro.js');

  /* Sem filtro por `psp`: cobranças criadas antes da correção do
     bug que gravava 'sandbox' fixo (ver commit) têm esse campo
     errado mesmo quando vieram do Mercado Pago de verdade — filtrar
     por ele aqui excluiria exatamente a cobrança que estamos atrás.
     Sem risco: `confirmarPagamento` consulta o PSP ATUAL (o que
     `PSP_DRIVER` diz agora), e um txid de sandbox simplesmente não
     existe lá — vira "não encontrada", inofensivo. */
  const cobrancas = txidArg
    ? await db.cobrancaPix.findMany({ where: { txid: txidArg } })
    : await db.cobrancaPix.findMany({
        where: { status: 'aguardando' },
        orderBy: { criadoEm: 'desc' },
        take: 10,
      });

  if (!cobrancas.length) {
    console.log(txidArg
      ? `\n  Nenhuma cobrança com txid "${txidArg}".\n`
      : '\n  Nenhuma cobrança em "aguardando" fora do sandbox — nada a reconciliar.\n');
    return;
  }

  console.log(`\n  Reconciliando ${cobrancas.length} cobrança(s)...\n`);

  for (const c of cobrancas) {
    process.stdout.write(`  ${c.txid}  (${formatarReais(c.valorMicros)}, era "${c.status}")  →  `);
    const resultado = await confirmarPagamento(c.txid);
    if ('erro' in resultado) {
      console.log(`erro: ${resultado.erro}`);
      continue;
    }
    const atualizada = await db.cobrancaPix.findUnique({ where: { txid: c.txid } });
    const taxaTexto = atualizada?.taxaMicros
      ? ` (taxa do PSP: ${formatarReais(atualizada.taxaMicros)})`
      : '';
    console.log((resultado.creditado ? 'creditado ✔' : 'ainda sem pagamento confirmado no PSP') + taxaTexto);
  }

  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    const { db } = await import('../src/db.js');
    await db.$disconnect();
  });
