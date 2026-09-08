/* ============================================================
   Relatório de consumo — a entrega da Fase 0
   ============================================================
   Rodar:  npm run relatorio:consumo        (últimos 30 dias)
           npm run relatorio:consumo -- 7   (últimos 7)

   Não muda nada para o usuário. Serve para responder, com número,
   as perguntas que hoje só têm palpite:

     · quanto custa DE VERDADE uma pergunta ao assistente?
     · quanto custa classificar uma idéia?
     · quanto está indo embora em resposta descartada?
     · a margem de 5% cobre o quê?

   É a partir daqui que se decide preço, mínimo de recarga e se 5%
   dão conta — ver planejamento-creditos-e-pagamento.md §1.3.
   ============================================================ */

import { db } from '../src/db.js';
import { formatarReais, MICROS_POR_REAL } from '../src/creditos/dinheiro.js';

const DIAS = Number(process.argv[2] ?? 30) || 30;
const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);

function linha(rotulo: string, valor: string) {
  console.log('  ' + rotulo.padEnd(34) + valor);
}

async function main() {
  const tudo = await db.consumoIa.findMany({
    where: { criadoEm: { gte: desde } },
    orderBy: { criadoEm: 'asc' },
  });

  console.log(`\nConsumo de IA — últimos ${DIAS} dias (${tudo.length} chamadas)\n`);

  if (tudo.length === 0) {
    console.log('  Nada registrado ainda. Use o assistente ou mova uma idéia');
    console.log('  para "finalizado" e rode de novo.\n');
    return;
  }

  const semPreco = tudo.filter((c) => c.precoDesconhecido);
  if (semPreco.length) {
    /* Alto e cedo: modelo fora da tabela de preços é custo que
       existe e não está sendo contado. */
    const modelos = [...new Set(semPreco.map((c) => c.modelo))].join(', ');
    console.log(`  !! ${semPreco.length} chamada(s) SEM PREÇO na tabela: ${modelos}`);
    console.log('     Os tokens estão gravados; acrescente o preço em');
    console.log('     src/creditos/precos.ts e o custo se recalcula.\n');
  }

  for (const tipo of ['assistente', 'classificacao'] as const) {
    const grupo = tudo.filter((c) => c.tipo === tipo && !c.precoDesconhecido);
    if (!grupo.length) continue;

    const custo = grupo.reduce((s, c) => s + (c.custoMicros ?? 0), 0);
    const comissao = grupo.reduce((s, c) => s + (c.comissaoMicros ?? 0), 0);
    const total = grupo.reduce((s, c) => s + (c.totalMicros ?? 0), 0);

    console.log(`  ${tipo.toUpperCase()} — ${grupo.length} chamada(s)`);
    linha('custo (nosso, ao provedor)', formatarReais(custo));
    linha('comissão de 5% (receita)', formatarReais(comissao));
    linha('total (o usuário pagaria)', formatarReais(total));
    linha('média por chamada', formatarReais(Math.round(total / grupo.length)));
    /* Em micros também, porque uma chamada custa MENOS de um
       centavo — e em centavo a média some. */
    linha('média em micros de real', String(Math.round(total / grupo.length)));
    console.log('');
  }

  const descartadas = tudo.filter((c) => c.resultado === 'descartado' && !c.precoDesconhecido);
  const perdido = descartadas.reduce((s, c) => s + (c.custoMicros ?? 0), 0);
  console.log('  DESCARTADAS (pagas, não entregues, não cobráveis)');
  linha('quantidade', `${descartadas.length} de ${tudo.length}`);
  linha('dinheiro que saiu sem retorno', formatarReais(perdido));
  console.log('');

  const custoTotal = tudo.reduce((s, c) => s + (c.custoMicros ?? 0), 0);
  const comissaoTotal = tudo.reduce((s, c) => s + (c.comissaoMicros ?? 0), 0);
  console.log('  NO PERÍODO');
  linha('custo total', formatarReais(custoTotal));
  linha('comissão total (receita bruta)', formatarReais(comissaoTotal));
  linha('comissão menos o desperdício', formatarReais(comissaoTotal - perdido));

  /* A conta de §1.3 do planejamento com número real em vez de
     hipótese: quanto de consumo é preciso para a comissão de 5%
     cobrir uma única tarifa de Pix de R$ 1,00. */
  console.log('');
  console.log('  PARA DECIDIR (ver planejamento §1.3)');
  const consumoParaPagarTarifa = MICROS_POR_REAL / 0.05;
  linha('consumo p/ 5% cobrirem R$ 1,00', formatarReais(Math.round(consumoParaPagarTarifa)));
  const medio = custoTotal / tudo.length;
  if (medio > 0) {
    linha('...em chamadas deste tamanho', String(Math.ceil(consumoParaPagarTarifa / medio)));
  }
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
