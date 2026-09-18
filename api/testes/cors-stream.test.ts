/* ============================================================
   CORS nas rotas que passam por cima do Fastify
   ============================================================
   Achado em 15/09/2026, na PRIMEIRA investigação real depois de
   duas semanas de prova em jsdom. O navegador recusou a chamada
   com "No 'Access-Control-Allow-Origin' header is present",
   enquanto a API anunciava na partida exatamente a origem que o
   navegador estava usando.

   `resposta.hijack()` existe para tirar o Fastify do caminho e
   escrever SSE direto no socket. O `@fastify/cors` escreve os
   cabeçalhos num hook do Fastify. Tirar o Fastify do caminho tira
   o CORS junto — e o preflight OPTIONS, que continua passando pelo
   plugin, responde certo, o que deixa o defeito com cara de
   mistério: a permissão é concedida e depois não aparece.

   Nenhuma das 237 conferências em jsdom veria isto. Lá o `fetch` é
   um stub, e stub não tem política de mesma origem. Este é um
   defeito que só existe na presença de um navegador de verdade —
   e é a resposta empírica para "provar em jsdom basta?".

   `process.env` é escrito antes do import dinâmico porque `env.ts`
   lê e valida o ambiente uma vez, no carregamento. Cada arquivo de
   teste roda no próprio processo (`node --test`), então isto não
   contamina os outros. `env.ts` não importa Prisma — é por isso
   que dá para testar a coisa de verdade aqui, e não só a forma.
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ORIGENS = 'http://localhost:8000,https://app.exemplo.com';

const { cabecalhosCorsDeStream, origensPermitidas } = await import('../src/env.js');

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('origem permitida recebe o cabeçalho, com a origem exata', () => {
  const c = cabecalhosCorsDeStream('http://localhost:8000');
  assert.equal(c['access-control-allow-origin'], 'http://localhost:8000');
});

test('nunca devolve "*", porque a sessão viaja em cookie', () => {
  /* Com `credentials: true` o navegador REJEITA `*` — a resposta
     seria descartada exatamente como estava sendo antes do
     conserto, só que por outro motivo. Um coringa aqui trocaria um
     erro visível por outro. */
  for (const origem of origensPermitidas) {
    assert.notEqual(cabecalhosCorsDeStream(origem)['access-control-allow-origin'], '*');
  }
});

test('o cabeçalho de credenciais vem junto, senão o cookie não sobe', () => {
  const c = cabecalhosCorsDeStream('http://localhost:8000');
  assert.equal(c['access-control-allow-credentials'], 'true');
});

test('Vary: Origin, senão um cache serve a origem errada', () => {
  /* Duas origens permitidas e uma resposta cacheável sem `Vary`:
     a segunda origem receberia o cabeçalho emitido para a
     primeira, e o navegador recusaria. */
  assert.equal(cabecalhosCorsDeStream('https://app.exemplo.com')['vary'], 'Origin');
});

test('origem de fora da lista não recebe nada', () => {
  assert.deepEqual(cabecalhosCorsDeStream('https://site-qualquer.com'), {});
});

test('sem origem (curl, healthcheck) não recebe nada', () => {
  /* Pedido sem `Origin` não é pedido de navegador: não há política
     de mesma origem para satisfazer, e inventar um cabeçalho ali
     só faria ruído. */
  assert.deepEqual(cabecalhosCorsDeStream(undefined), {});
});

test('a lista é a MESMA que o plugin lê', () => {
  /* Duas listas divergiriam no primeiro ajuste, e a divergência
     apareceria como este mesmo erro — só que num ambiente onde
     ninguém está olhando. */
  assert.deepEqual(origensPermitidas, ['http://localhost:8000', 'https://app.exemplo.com']);
});

test('todo hijack() manda os cabeçalhos de CORS', () => {
  /* O teste que sustenta os outros. Eles provam que a função está
     certa; este prova que ela é CHAMADA em todo lugar que passa
     por cima do Fastify. Uma terceira rota de stream escrita
     amanhã sem esta linha reproduziria o defeito inteiro, e os
     testes acima continuariam verdes. */
  const arquivos: string[] = [];
  (function varrer(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const cheio = path.join(dir, e.name);
      if (e.isDirectory()) varrer(cheio);
      else if (e.name.endsWith('.ts')) arquivos.push(cheio);
    }
  })(SRC);

  const faltando: string[] = [];
  for (const arquivo of arquivos) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    const hijacks = (texto.match(/\.hijack\(\)/g) ?? []).length;
    if (!hijacks) continue;
    const comCors = (texto.match(/cabecalhosCorsDeStream\(/g) ?? []).length;
    if (comCors < hijacks) {
      faltando.push(`${path.relative(SRC, arquivo)}: ${hijacks} hijack(), ${comCors} com CORS`);
    }
  }

  assert.deepEqual(faltando, [], `stream sem cabeçalho de CORS: ${faltando.join(' · ')}`);
});
