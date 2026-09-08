/* ============================================================
   Reservar / liberar / consumir, escrevendo de verdade num Postgres
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §5

   `reserva.ts` é vocabulário fino em cima de `razao.lancar()` — os
   testes puros de `razao-integracao.test.ts` já provam a transação,
   a trava de idempotência e o saldo nunca-negativo. O que falta
   provar aqui é específico do TRIO: que os três verbos (reserva,
   liberação, consumo) realmente compõem o efeito líquido certo —
   saldo cai no reservar, volta no liberar, cai de novo (pelo valor
   VERDADEIRO) no consumir — e que cada um reage do jeito certo
   quando repetido ou quando o saldo não fecha.

   OPT-IN, igual aos outros arquivos de integração: sem
   DATABASE_URL_TESTE no .env, pula sozinho. NUNCA aponte para o
   banco de produção. A migração roda uma vez só, fora daqui, via
   `npm run preteste` → `scripts/migrar-teste.ts` — não adicione
   `prisma migrate deploy` neste arquivo (ver o cabeçalho de
   `migrar-teste.ts` para o porquê).

     npm run teste:reserva
   ============================================================ */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';

/* O .env precisa ser carregado AQUI, no topo — mesmo motivo de
   razao-integracao.test.ts: a constante abaixo é lida antes do
   before() rodar. */
try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI, onde a variável vem do ambiente. */
}

const URL_TESTE = process.env.DATABASE_URL_TESTE;

describe(
  'reservar / liberar / consumir — escrita real no banco (Fase 2)',
  { skip: URL_TESTE ? false : 'DATABASE_URL_TESTE não definida — ver o topo deste arquivo' },
  () => {
    let db: typeof import('../src/db.js')['db'];
    let reserva: typeof import('../src/creditos/reserva.js');
    let razao: typeof import('../src/creditos/razao.js');
    let dinheiro: typeof import('../src/creditos/dinheiro.js');

    let usuarioId: string;
    const marcador = 'reserva-teste-' + Date.now();

    before(async () => {
      /* Import DINÂMICO, não estático — mesmo motivo de
         razao-integracao.test.ts: `db.ts` lê `DATABASE_URL` no
         instante em que é construído, e um import no topo seria
         hoisted pelo ESM para antes desta linha. */
      process.env.DATABASE_URL = URL_TESTE;
      process.env.NODE_ENV = 'test';

      db = (await import('../src/db.js')).db;
      reserva = await import('../src/creditos/reserva.js');
      razao = await import('../src/creditos/razao.js');
      dinheiro = await import('../src/creditos/dinheiro.js');

      const u = await db.usuario.create({
        data: {
          nome: 'Teste Reserva',
          email: `${marcador}@exemplo.teste`,
          senhaHash: 'nao-usado',
        },
        select: { id: true },
      });
      usuarioId = u.id;

      /* Saldo inicial: R$ 100,00. Cada teste abaixo é sequencial e
         depende do saldo deixado pelo anterior — mesmo estilo de
         razao-integracao.test.ts. */
      await razao.lancar({
        usuarioId,
        tipo: 'ajuste',
        origem: 'manual',
        valorMicros: dinheiro.reaisParaMicros(100),
        descricao: 'saldo inicial do teste',
      });
    });

    after(async () => {
      if (!db) return;
      await db.creditoLancamento.deleteMany({ where: { usuarioId } });
      await db.usuario.deleteMany({ where: { email: { startsWith: marcador } } });
      await db.$disconnect();
    });

    test('temSaldoPara — checagem otimista antes de escrever', async () => {
      assert.equal(await reserva.temSaldoPara(usuarioId, dinheiro.reaisParaMicros(50)), true);
      assert.equal(await reserva.temSaldoPara(usuarioId, dinheiro.reaisParaMicros(200)), false);
      /* Só leu — não escreveu nada. */
      assert.equal(await razao.saldoDe(usuarioId), 100_000_000);
    });

    test('reservar debita o teto do saldo AGORA, antes de qualquer chamada ao provedor', async () => {
      const origemId = crypto.randomUUID();
      const r = await reserva.reservar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');

      assert.equal(r.saldoMicros, 90_000_000);
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000);

      const extrato = await razao.extratoDe(usuarioId);
      const linha = extrato.find((l) => l.origemId === origemId);
      assert.equal(linha?.tipo, 'reserva');
      assert.equal(linha?.valorMicros, -10_000_000);
    });

    test('reservar sem saldo para o teto recusa — SaldoInsuficiente, sem mexer no saldo', async () => {
      const origemId = crypto.randomUUID();
      await assert.rejects(
        () => reserva.reservar(usuarioId, dinheiro.reaisParaMicros(999), origemId, 'assistente'),
        reserva.SaldoInsuficiente,
      );
      /* O saldo continua onde a reserva anterior deixou — 90. Uma
         reserva recusada não pode ter debitado nada. */
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000);
    });

    test('liberar devolve a reserva inteira — o saldo volta ao que era antes dela', async () => {
      const origemId = crypto.randomUUID();
      await reserva.reservar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 80_000_000);

      await reserva.liberar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000);

      const extrato = await razao.extratoDe(usuarioId);
      const linha = extrato.find((l) => l.origemId === origemId && l.tipo === 'liberacao');
      assert.equal(linha?.valorMicros, 10_000_000);
    });

    test('liberar chamado duas vezes (mesmo origemId) não devolve duas vezes — reentrância', async () => {
      /* O caso real: a rota chama liberar() no catch E de novo mais
         adiante, ou o processo cai entre as duas e é retomado. A
         segunda chamada precisa ser um não-evento, não um crédito
         extra. */
      const origemId = crypto.randomUUID();
      await reserva.reservar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 80_000_000);

      await reserva.liberar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000);

      /* A repetição não deve lançar (liberar() engole LancamentoRepetido)
         nem alterar o saldo. */
      await reserva.liberar(usuarioId, dinheiro.reaisParaMicros(10), origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000);
    });

    test('o trio inteiro: reservar → liberar → consumir com o mesmo origemId', async () => {
      /* A trava de razao.ts é (tipo, origemId) — não origemId sozinho.
         Por isso as três chamadas do trio, que são tipos diferentes
         ('reserva', 'liberacao', 'consumo'), podem compartilhar o
         MESMO origemId sem colidir entre si. É esse origemId comum
         que amarra as três linhas no extrato como uma chamada só. */
      const origemId = crypto.randomUUID();
      const teto = dinheiro.reaisParaMicros(5); // teto superestimado
      const custoReal = dinheiro.reaisParaMicros(2); // o que a chamada custou de verdade

      await reserva.reservar(usuarioId, teto, origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 85_000_000); // 90 - 5

      await reserva.liberar(usuarioId, teto, origemId, 'assistente');
      assert.equal(await razao.saldoDe(usuarioId), 90_000_000); // devolveu o teto inteiro

      const r = await reserva.consumir(usuarioId, custoReal, origemId, 'assistente');
      assert.equal(r.cobradoIntegralmente, true);
      assert.equal(r.saldoMicros, 88_000_000); // 90 - 2: efeito líquido é o custo real, nunca o teto
      assert.equal(await razao.saldoDe(usuarioId), 88_000_000);

      const extrato = await razao.extratoDe(usuarioId, 10);
      const linhasDaChamada = extrato.filter((l) => l.origemId === origemId);
      assert.equal(linhasDaChamada.length, 3, 'reserva, liberação e consumo — três linhas, um origemId');
    });

    test('consumir chamado duas vezes (mesmo origemId) não debita duas vezes — reentrância', async () => {
      const origemId = crypto.randomUUID();
      const custoReal = dinheiro.reaisParaMicros(3);

      const primeira = await reserva.consumir(usuarioId, custoReal, origemId, 'classificacao');
      assert.equal(primeira.cobradoIntegralmente, true);
      assert.equal(await razao.saldoDe(usuarioId), 85_000_000); // 88 - 3

      const segunda = await reserva.consumir(usuarioId, custoReal, origemId, 'classificacao');
      assert.equal(segunda.cobradoIntegralmente, true);
      assert.equal(segunda.saldoMicros, 85_000_000, 'a repetição devolve o saldo atual, não debita de novo');
      assert.equal(await razao.saldoDe(usuarioId), 85_000_000);
    });

    test('consumir com saldo insuficiente cobra o que houver — nunca recusa uma chamada já paga', async () => {
      /* O cenário feio: o teto era uma estimativa, a saída real veio
         maior, e depois de liberar a reserva o saldo não cobre o
         custo verdadeiro inteiro. Drena o saldo para bem menos do
         que o próximo custo vai pedir, simulando essa situação. */
      await razao.lancar({
        usuarioId,
        tipo: 'consumo',
        origem: 'uso_ia',
        valorMicros: -(85_000_000 - 500_000), // deixa exatamente R$ 0,50
        descricao: 'drenagem para o cenário de teste',
      });
      assert.equal(await razao.saldoDe(usuarioId), 500_000);

      const origemId = crypto.randomUUID();
      const custoReal = dinheiro.reaisParaMicros(2); // pede R$ 2,00, só há R$ 0,50

      const r = await reserva.consumir(usuarioId, custoReal, origemId, 'assistente');
      assert.equal(r.cobradoIntegralmente, false, 'não pode fingir que cobrou o total');
      assert.equal(r.saldoMicros, 0, 'cobra o que houver — o saldo vai a zero, nunca fica negativo');
      assert.equal(await razao.saldoDe(usuarioId), 0);

      const extrato = await razao.extratoDe(usuarioId);
      const linha = extrato.find((l) => l.origemId === origemId);
      assert.equal(linha?.valorMicros, -500_000, 'debitou exatamente o que havia, não o custo pedido');
    });

    test('consumir com saldo já zerado não tenta lançar nada — só relata', async () => {
      assert.equal(await razao.saldoDe(usuarioId), 0);

      const origemId = crypto.randomUUID();
      const r = await reserva.consumir(usuarioId, dinheiro.reaisParaMicros(1), origemId, 'assistente');

      assert.equal(r.cobradoIntegralmente, false);
      assert.equal(r.saldoMicros, 0);
      assert.equal(await razao.saldoDe(usuarioId), 0);

      /* Sem saldo pra cobrar nem em parte, não pode ter escrito
         linha nenhuma com este origemId — não há o que registrar. */
      const extrato = await razao.extratoDe(usuarioId);
      assert.ok(!extrato.some((l) => l.origemId === origemId));
    });

    test('saldo e soma dos lançamentos batem no final — DIN-002', async () => {
      const c = await razao.conferir(usuarioId);
      assert.ok(c.bate, `divergência: saldo ${c.saldoGravado} vs razão ${c.somaDosLancamentos}`);
    });
  },
);
