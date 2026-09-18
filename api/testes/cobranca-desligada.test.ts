/* ============================================================
   CREDITOS_COBRAR="nao" — nada sai do saldo de ninguém
   ============================================================
   O `.env.example` promete que, com a chave em "nao", "a IA
   responde normalmente mas nada sai do saldo de ninguém". Até
   15/09/2026 essa promessa dependia de cada rota lembrar de
   perguntar — e as rotas de pesquisa, que nasceram depois das de
   IA, não lembraram: investigar em desenvolvimento debitava saldo
   de verdade, R$ 0,69 por vez.

   A chave passou a morar dentro de `reservar`/`liberar`/`consumir`.

   ------------------------------------------------------------
   POR QUE ESTE ARQUIVO LÊ CÓDIGO EM VEZ DE CHAMAR FUNÇÃO
   ------------------------------------------------------------
   A afirmação que se quer provar é ESTRUTURAL: *não existe outro
   caminho até a razão*. Isso não é observável chamando uma função
   — chamar as três e ver que não escreveram prova que aquelas três
   estão certas, e nada sobre a quarta que alguém escrever amanhã
   por fora. Era exatamente essa a forma do defeito: `rotas/ia.ts`
   perguntava certo, e a rota nova não perguntava.

   E há a razão prática: importar `reserva.ts` arrasta `razao.ts`,
   que arrasta `db.ts`, que instancia o Prisma Client. Teste puro
   neste projeto não importa Prisma — foi por isso que
   `formatarQuando` mudou de casa em 15/09/2026.

   O efeito de verdade (saldo que não se move num Postgres real)
   é cobrado em `reserva-integracao.test.ts`, que é onde ele pode
   ser observado. Aqui se prova que a porta é uma só e que ela
   está fechada antes de qualquer lançamento.
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const RESERVA = fs.readFileSync(path.join(SRC, 'creditos/reserva.ts'), 'utf8');

/** Recorta o corpo de uma função exportada, do `{` de abertura até
 *  a `}` na coluna zero que a fecha — que é como este projeto
 *  formata. Recortar importa: procurar `lancar(` no arquivo inteiro
 *  acharia o das outras funções e o teste passaria por engano. */
function corpoDe(fonte: string, nome: string): string {
  const assinatura = new RegExp(`export async function ${nome}\\(`);
  const achado = fonte.search(assinatura);
  assert.notEqual(achado, -1, `função ${nome} não encontrada em reserva.ts`);
  const inicio = fonte.indexOf('{', fonte.indexOf(')', achado));
  const fim = fonte.indexOf('\n}', inicio);
  assert.notEqual(fim, -1, `fim de ${nome} não encontrado`);
  return fonte.slice(inicio, fim);
}

/* ------------------------------------------------------------
   1. A chave está no caminho dos três verbos, ANTES do lançamento
   ------------------------------------------------------------ */

for (const verbo of ['reservar', 'liberar', 'consumir']) {
  test(`${verbo} consulta a chave antes de lançar na razão`, () => {
    const corpo = corpoDe(RESERVA, verbo);

    const naChave = corpo.indexOf('cobrancaLigada()');
    const noLancamento = corpo.indexOf('lancar(');

    assert.notEqual(naChave, -1, `${verbo} não consulta CREDITOS_COBRAR`);
    assert.notEqual(noLancamento, -1, `${verbo} deixou de lançar na razão — o teste está velho`);
    assert.ok(
      naChave < noLancamento,
      `em ${verbo} a chave é consultada DEPOIS do lançamento: ela não impede nada`,
    );
  });
}

test('os três saem juntos ou nenhum sai', () => {
  /* Se `liberar` respeitasse a chave e `reservar` não (ou o
     contrário), o saldo andaria sozinho numa direção só — uma
     reserva eterna, ou uma devolução sem reserva. O par é o que
     mantém o saldo íntegro, então nenhum dos três pode ficar de
     fora. */
  for (const verbo of ['reservar', 'liberar', 'consumir']) {
    assert.match(
      corpoDe(RESERVA, verbo),
      /if \(!cobrancaLigada\(\)\) return/,
      `${verbo} não tem a saída antecipada`,
    );
  }
});

test('a chave lê CREDITOS_COBRAR e mais nada', () => {
  /* Uma chave que também olhasse NODE_ENV, ou um segundo nome de
     variável, teria dois donos — e o `.env` deixaria de ser a
     resposta para "isto está cobrando?". */
  const inicio = RESERVA.indexOf('function cobrancaLigada');
  assert.notEqual(inicio, -1, 'cobrancaLigada não existe mais em reserva.ts');
  const corpo = RESERVA.slice(inicio);
  const ate = corpo.slice(0, corpo.indexOf('\n}'));
  assert.match(ate, /env\.CREDITOS_COBRAR === 'sim'/);
  assert.equal(/NODE_ENV|process\.env/.test(ate), false, 'a chave olha algo além de CREDITOS_COBRAR');
});

/* ------------------------------------------------------------
   2. A chave não pode ser contornada
   ------------------------------------------------------------
   Este é o teste que sustenta os outros. Eles provam que a porta
   está fechada; este prova que a porta é **uma só**. Sem ele, uma
   rota nova chamando `lancar()` direto passaria por cima de tudo —
   que é o defeito que estamos consertando, uma camada abaixo.
   ------------------------------------------------------------ */

function arquivosTs(dir: string, achados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const cheio = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosTs(cheio, achados);
    else if (entrada.name.endsWith('.ts')) achados.push(cheio);
  }
  return achados;
}

test('só reserva.ts e webhooks.ts falam com a razão diretamente', () => {
  /* `webhooks.ts` é a exceção legítima, e é de sentido contrário:
     ele CREDITA (pagamento Pix confirmado). Crédito que entra nunca
     pode depender de `CREDITOS_COBRAR` — a chave desliga o débito,
     não o dinheiro que a pessoa pôs. */
  const PERMITIDOS = new Set(['creditos/reserva.ts', 'rotas/webhooks.ts']);

  const infratores = arquivosTs(SRC)
    .filter((f) => /import\s*\{[^}]*\blancar\b[^}]*\}\s*from/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .filter((rel) => !PERMITIDOS.has(rel));

  assert.deepEqual(
    infratores,
    [],
    `lançam na razão por fora de reserva.ts e escapam de CREDITOS_COBRAR: ${infratores.join(', ')}`,
  );
});

test('webhooks.ts só credita — nunca debita por fora da chave', () => {
  const texto = fs.readFileSync(path.join(SRC, 'rotas/webhooks.ts'), 'utf8');
  /* Débito é valor negativo. Um `valorMicros` negativo aqui seria
     um consumo escondido no caminho do crédito, e ele não passaria
     pela chave. */
  assert.equal(
    /valorMicros\s*:\s*-/.test(texto),
    false,
    'webhooks.ts passou a lançar valor negativo: é débito fora de reserva.ts',
  );
});

/* ------------------------------------------------------------
   3. O que a chave NÃO desliga
   ------------------------------------------------------------ */

test('a medição continua, com a cobrança desligada', () => {
  /* PES-003: o custo vem do provedor, transação a transação. Isso
     vale igual com a cobrança desligada — o que para é o débito,
     não a conta. `registrarPesquisa` grava tokens, buscas e custo
     em dólar por um caminho que não passa por `reserva.ts`, e é
     assim que deve continuar: se ele passasse, desligar a cobrança
     apagaria a medição junto, e desenvolvimento deixaria de
     produzir o dado que acha os defeitos. */
  const registro = fs.readFileSync(path.join(SRC, 'creditos/registro-pesquisa.ts'), 'utf8');
  assert.equal(
    /cobrancaLigada|CREDITOS_COBRAR/.test(registro),
    false,
    'a medição passou a depender de CREDITOS_COBRAR: desligar a cobrança apagaria o dado',
  );
});
