/* ============================================================
   A razão, escrevendo de verdade num Postgres
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §3

   Código de dinheiro sem prova de escrita real é imprudente. As
   funções puras (`dinheiro.test.ts`, `precos.test.ts`) provam a
   CONTA; este arquivo prova a GRAVAÇÃO — que é onde mora a classe
   de bug que custa dinheiro: transação que não é transação, trava
   de idempotência que não trava, saldo que fica negativo.

   OPT-IN, igual a `transicao-integracao.test.ts`: sem
   DATABASE_URL_TESTE no .env, pula sozinho e explica por quê.
   NUNCA aponte para o banco de produção.

   `prisma migrate deploy` no `before()` roda contra o MESMO banco
   de teste que outro arquivo de integração também usa — e o
   `node --test` roda arquivos em paralelo por padrão. Duas
   migrações disputando o mesmo banco ao mesmo tempo é exatamente o
   tipo de corrida que derruba uma delas com "migração falhou" sem
   ter falhado nada de verdade. Por isso o script `teste` em
   `package.json` roda com `--test-concurrency=1`: NÃO REMOVA essa
   flag enquanto houver mais de um arquivo de integração aqui.

     npm run teste:razao
   ============================================================ */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';

/* O .env precisa ser carregado AQUI, no topo: a constante abaixo é
   lida antes de `before()` rodar, e `src/env.ts` (que também
   carrega) só é importado lá dentro. Sem isto a suíte pulava mesmo
   configurada certo — foi exatamente o que aconteceu em
   transicao-integracao.test.ts. */
try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI, onde a variável vem do ambiente. */
}

const URL_TESTE = process.env.DATABASE_URL_TESTE;

describe(
  'a razão — escrita real no banco',
  { skip: URL_TESTE ? false : 'DATABASE_URL_TESTE não definida — ver o topo deste arquivo' },
  () => {
    let db: typeof import('../src/db.js')['db'];
    let razao: typeof import('../src/creditos/razao.js');
    let dinheiro: typeof import('../src/creditos/dinheiro.js');

    let usuarioId: string;
    const marcador = 'razao-teste-' + Date.now();

    before(async () => {
      /* Import DINÂMICO, não estático: `db.ts` faz `new
         PrismaClient()` lendo `process.env.DATABASE_URL` no instante
         em que é construído. Um import no topo seria hoisted pelo
         ESM e rodaria ANTES desta linha — apontando, por acidente,
         para a produção. */
      process.env.DATABASE_URL = URL_TESTE;
      process.env.NODE_ENV = 'test';

      /* A migração NÃO roda mais aqui — saiu para
         `scripts/migrar-teste.ts` (rodado uma vez por
         `npm run preteste`, antes desta suíte inteira). Cada
         arquivo de integração rodando `prisma migrate deploy` no
         próprio before() fazia dois lock consultivos disputarem a
         mesma conexão em pool do Neon e estourar timeout (P1002)
         mesmo sem corrida real entre os arquivos. Ver o cabeçalho
         de migrar-teste.ts para a explicação completa. */

      db = (await import('../src/db.js')).db;
      razao = await import('../src/creditos/razao.js');
      dinheiro = await import('../src/creditos/dinheiro.js');

      const u = await db.usuario.create({
        data: {
          nome: 'Teste Razão',
          email: `${marcador}@exemplo.teste`,
          senhaHash: 'nao-usado',
        },
        select: { id: true },
      });
      usuarioId = u.id;
    });

    after(async () => {
      if (!db) return;
      await db.creditoLancamento.deleteMany({ where: { usuarioId } });
      await db.usuario.deleteMany({ where: { email: { startsWith: marcador } } });
      await db.$disconnect();
    });

    test('creditar aumenta o saldo e deixa linha no extrato', async () => {
      const r = await razao.lancar({
        usuarioId,
        tipo: 'ajuste',
        origem: 'manual',
        valorMicros: dinheiro.reaisParaMicros(10),
        descricao: 'crédito inicial',
      });

      assert.equal(r.saldoMicros, 10_000_000);

      /* Lê do BANCO, não do retorno: o que importa é o que ficou
         gravado, não o que a função disse ter gravado. */
      const saldo = await razao.saldoDe(usuarioId);
      assert.equal(saldo, 10_000_000);

      const extrato = await razao.extratoDe(usuarioId);
      assert.equal(extrato.length, 1);
      assert.equal(extrato[0]?.saldoDepois, 10_000_000);
    });

    test('débito reduz o saldo', async () => {
      await razao.lancar({
        usuarioId,
        tipo: 'consumo',
        origem: 'uso_ia',
        valorMicros: -dinheiro.reaisParaMicros(3),
        descricao: 'uso do assistente',
      });
      assert.equal(await razao.saldoDe(usuarioId), 7_000_000);
    });

    test('débito maior que o saldo é RECUSADO — o saldo não fica negativo', async () => {
      /* A regra que impede crédito que ninguém autorizou. Saldo
         negativo não dá erro em lugar nenhum: ele só se espalha. */
      await assert.rejects(
        () => razao.lancar({
          usuarioId,
          tipo: 'consumo',
          origem: 'uso_ia',
          valorMicros: -dinheiro.reaisParaMicros(999),
          descricao: 'gasto impossível',
        }),
        razao.SaldoInsuficiente,
      );

      /* E o saldo continua exatamente onde estava — a transação
         inteira voltou atrás, sem deixar linha órfã. */
      assert.equal(await razao.saldoDe(usuarioId), 7_000_000);
      const extrato = await razao.extratoDe(usuarioId);
      assert.ok(
        !extrato.some((l) => l.descricao === 'gasto impossível'),
        'a recusa não pode deixar linha no extrato',
      );
    });

    test('a mesma origem não credita duas vezes — DIN-004', async () => {
      /* É o cenário do webhook de pagamento reenviado, que é normal
         e esperado. Sem esta trava, cada reenvio é dinheiro dado. */
      const origemId = crypto.randomUUID();

      await razao.lancar({
        usuarioId,
        tipo: 'recarga',
        origem: 'cobranca_pix',
        valorMicros: dinheiro.reaisParaMicros(50),
        origemId,
        descricao: 'recarga via Pix',
      });
      const depoisDaPrimeira = await razao.saldoDe(usuarioId);

      await assert.rejects(
        () => razao.lancar({
          usuarioId,
          tipo: 'recarga',
          origem: 'cobranca_pix',
          valorMicros: dinheiro.reaisParaMicros(50),
          origemId,
          descricao: 'recarga via Pix (webhook repetido)',
        }),
        razao.LancamentoRepetido,
      );

      assert.equal(
        await razao.saldoDe(usuarioId),
        depoisDaPrimeira,
        'o webhook repetido não pode ter creditado de novo',
      );
    });

    test('saldo e soma dos lançamentos batem — DIN-002', async () => {
      /* O saldo é cache. Se ele divergir da soma, houve escrita
         fora de `lancar()` — e é o tipo de bug que ninguém
         descobre sozinho. */
      const c = await razao.conferir(usuarioId);
      assert.ok(c.bate, `divergência: saldo ${c.saldoGravado} vs razão ${c.somaDosLancamentos}`);
    });

    test('lançamento de valor zero ou fracionário é recusado', async () => {
      await assert.rejects(
        () => razao.lancar({
          usuarioId, tipo: 'ajuste', origem: 'manual',
          valorMicros: 0, descricao: 'nada',
        }),
        RangeError,
      );
      /* Fração aqui é ponto flutuante entrando pela janela. */
      await assert.rejects(
        () => razao.lancar({
          usuarioId, tipo: 'ajuste', origem: 'manual',
          valorMicros: 10.5, descricao: 'meio micro',
        }),
        RangeError,
      );
    });

    test('dois débitos simultâneos não gastam o mesmo dinheiro duas vezes', async () => {
      /* O erro clássico de saldo: duas requisições leem o mesmo
         saldo, cada uma subtrai, as duas gravam. Só aparece sob
         concorrência — justamente quando ninguém está olhando.
         É o que o isolamento `Serializable` em `lancar()` impede. */
      const saldoAntes = await razao.saldoDe(usuarioId);
      const metade = Math.floor(saldoAntes / 2) + 1_000_000; // cada um sozinho cabe; juntos, não

      const resultados = await Promise.allSettled([
        razao.lancar({ usuarioId, tipo: 'consumo', origem: 'uso_ia', valorMicros: -metade, descricao: 'corrida A' }),
        razao.lancar({ usuarioId, tipo: 'consumo', origem: 'uso_ia', valorMicros: -metade, descricao: 'corrida B' }),
      ]);

      const passaram = resultados.filter((r) => r.status === 'fulfilled').length;
      assert.equal(passaram, 1, 'exatamente um dos dois débitos deveria passar');

      assert.ok(await razao.saldoDe(usuarioId) >= 0, 'o saldo não pode ter ficado negativo');
      const c = await razao.conferir(usuarioId);
      assert.ok(c.bate, 'saldo e razão precisam continuar batendo depois da corrida');
    });
  },
);
