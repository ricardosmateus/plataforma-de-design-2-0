/* ============================================================
   Crédito manual — a porta dos fundos, de propósito estreita
   ============================================================
   Rodar:
     npm run creditar -- email@dominio.com 50
     npm run creditar -- email@dominio.com 50 "motivo escrito"
     npm run creditar -- email@dominio.com --extrato

   ------------------------------------------------------------
   POR QUE UM SCRIPT E NÃO UMA ROTA DE ADMINISTRADOR
   ------------------------------------------------------------
   O planejamento (SEG-PAG-006) diz que o ajuste manual de saldo
   precisa ser restrito e registrado. Uma rota HTTP exigiria criar
   agora o conceito de "administrador da plataforma", que não existe
   neste projeto — os papéis de hoje são todos POR EMPRESA
   (`PapelMembro`), não globais. Inventar um papel global às pressas,
   na porta que mexe em dinheiro, é a pior ordem possível de fazer
   as coisas.

   Um script no terminal já é a restrição mais forte disponível:
   exige acesso à máquina e ao `.env`. Quando existir administrador
   de verdade, a rota entra reaproveitando `lancar()` — que continua
   sendo a única porta.

   Enquanto o Pix não existe (Fase 3/4), é assim que entra saldo.
   ============================================================ */

import { db } from '../src/db.js';
import { lancar, extratoDe, conferir, SaldoInsuficiente } from '../src/creditos/razao.js';
import { formatarReais, reaisParaMicros } from '../src/creditos/dinheiro.js';

const [email, valorOuFlag, motivo] = process.argv.slice(2);

function uso(): never {
  console.log('\n  npm run creditar -- <email> <valor em reais> ["motivo"]');
  console.log('  npm run creditar -- <email> --extrato\n');
  console.log('  Valor negativo debita. Ex.: npm run creditar -- ana@x.com -10 "estorno"\n');
  process.exit(1);
}

async function main() {
  if (!email || !valorOuFlag) uso();

  const usuario = await db.usuario.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, nome: true, email: true, saldoMicros: true },
  });
  if (!usuario) {
    console.error(`\n  Nenhum usuário com o e-mail ${email}.\n`);
    process.exit(1);
  }

  if (valorOuFlag === '--extrato') {
    const linhas = await extratoDe(usuario.id, 30);
    const c = await conferir(usuario.id);

    console.log(`\n  ${usuario.nome} <${usuario.email}>`);
    console.log(`  Saldo: ${formatarReais(usuario.saldoMicros)}\n`);

    if (!linhas.length) console.log('  Nenhum lançamento ainda.\n');
    for (const l of linhas) {
      const sinal = l.valorMicros > 0 ? '+' : '';
      console.log(
        `  ${l.criadoEm.toISOString().slice(0, 16).replace('T', ' ')}  ` +
        `${l.tipo.padEnd(10)} ${(sinal + formatarReais(l.valorMicros)).padStart(14)}  ` +
        `saldo ${formatarReais(l.saldoDepois).padStart(14)}  ${l.descricao}`,
      );
    }

    /* DIN-002: saldo é cache, a soma é a verdade. Divergência aqui
       significa escrita fora de `lancar()` — bug, não arredondamento. */
    console.log('');
    if (c.bate) {
      console.log('  Conferência: saldo e soma dos lançamentos batem.\n');
    } else {
      console.log('  !! DIVERGÊNCIA — houve escrita fora de lancar()');
      console.log(`     saldo gravado: ${formatarReais(c.saldoGravado)}`);
      console.log(`     soma da razão: ${formatarReais(c.somaDosLancamentos)}\n`);
    }
    return;
  }

  const reais = Number(valorOuFlag.replace(',', '.'));
  if (!Number.isFinite(reais) || reais === 0) uso();

  const micros = reaisParaMicros(reais);
  const credito = micros > 0;

  try {
    const r = await lancar({
      usuarioId: usuario.id,
      /* Entrada manual é `ajuste`, não `recarga`: recarga é dinheiro
         que entrou de verdade por um pagamento. Chamar as duas de
         recarga tornaria impossível responder depois quanto de fato
         foi pago pelos usuários. */
      tipo: 'ajuste',
      origem: 'manual',
      valorMicros: micros,
      descricao: motivo?.trim() || (credito ? 'Crédito manual' : 'Débito manual'),
    });

    console.log(`\n  ${usuario.nome} <${usuario.email}>`);
    console.log(`  ${credito ? 'Creditado' : 'Debitado'}: ${formatarReais(Math.abs(micros))}`);
    console.log(`  Saldo agora: ${formatarReais(r.saldoMicros)}\n`);
  } catch (e) {
    if (e instanceof SaldoInsuficiente) {
      console.error(`\n  Recusado: saldo é ${formatarReais(e.saldoMicros)},`);
      console.error(`  o débito pedido é ${formatarReais(e.pedidoMicros)}.`);
      console.error('  O saldo não fica negativo.\n');
      process.exit(1);
    }
    throw e;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
