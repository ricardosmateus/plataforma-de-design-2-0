/* ============================================================
   Migra o banco de teste — roda UMA VEZ, antes da suíte inteira
   ============================================================
   Disparado automaticamente por `npm run teste` (convenção do
   npm: um script "preteste" roda antes de "teste").

   ------------------------------------------------------------
   POR QUE ISTO SAIU DE DENTRO DOS ARQUIVOS DE TESTE
   ------------------------------------------------------------
   `razao-integracao.test.ts` e `transicao-integracao.test.ts`
   antes rodavam `prisma migrate deploy`, CADA UM no seu próprio
   `before()`. O Postgres usa um LOCK CONSULTIVO (advisory lock)
   para migrar com segurança — e esse lock não convive bem com a
   CONEXÃO EM POOL do Neon (o host termina em "-pooler"): duas
   tentativas de migrar em sequência rápida, cada uma entrando por
   uma conexão diferente do pool, podem ver o lock da OUTRA como
   travado e estourar em timeout (erro P1002) mesmo com os arquivos
   de teste rodando em série, sem corrida real entre eles.

   Migrar UMA VEZ aqui, fora dos arquivos, elimina a classe inteira
   do problema — não sobra lock para ninguém disputar.

   Se `DATABASE_URL_TESTE` não estiver definida, não faz nada: os
   arquivos de integração pulam sozinhos (é o comportamento OPT-IN
   de sempre), e não faz sentido migrar um banco que ninguém vai
   usar nesta rodada.
   ============================================================ */

import { execSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI, onde a variável já vem do ambiente. */
}

const URL_TESTE = process.env.DATABASE_URL_TESTE;

if (!URL_TESTE) {
  console.log('[preteste] DATABASE_URL_TESTE não definida — pulando migração do banco de teste.');
  process.exit(0);
}

/* ------------------------------------------------------------
   DIRECT_URL TAMBÉM PRECISA SER TROCADA — o defeito de 02/09/2026
   ------------------------------------------------------------
   `schema.prisma` declara `directUrl = env("DIRECT_URL")`, e
   `prisma migrate` usa a directUrl QUANDO ELA EXISTE, ignorando a
   `url`. Trocar só `DATABASE_URL` aqui, como este script fazia,
   deixava a migração seguir por `DIRECT_URL` — que aponta para
   PRODUÇÃO.

   Ou seja: `npm run teste` rodava `prisma migrate deploy` contra o
   banco de produção, e o de teste nunca recebia migração nenhuma. O
   sintoma era mudo, porque produção normalmente já está migrada e o
   Prisma responde "No pending migrations to apply" — a única hora em
   que apareceria é justamente a pior, com uma migração pendente
   sendo aplicada em produção por quem só queria rodar teste.

   `DIRECT_URL_TESTE` é opcional: sem ela, migra pela própria URL de
   teste. O motivo de existir uma directUrl separada (o lock
   consultivo brigando com o pooler do Neon) continua valendo, então
   quem tiver o problema define a variável. */
const DIRETO_TESTE = process.env.DIRECT_URL_TESTE ?? URL_TESTE;

/* ------------------------------------------------------------
   A trava
   ------------------------------------------------------------
   "NUNCA aponte para o banco de produção" está escrito no topo de
   todo arquivo de integração, e até agora não havia nada que
   impedisse. Comparar o HOST (sem o sufixo -pooler, que é o mesmo
   servidor por outra porta) pega o caso real: alguém copiar a URL de
   produção para DATABASE_URL_TESTE. */
function identidadeDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    /* Host SEM o sufixo -pooler: no Neon, a URL com pooler e a direta
       são o mesmo servidor por caminhos diferentes, e tratá-las como
       coisas distintas deixaria passar exatamente o engano que esta
       trava existe para pegar.

       O NOME DO BANCO entra na comparação de propósito: no Neon é
       comum um projeto só com bancos separados para produção e
       teste, e isso é arranjo legítimo. O que não pode é os dois
       serem o MESMO banco. */
    return `${u.hostname.replace('-pooler', '')}${u.pathname}`;
  } catch {
    return null;
  }
}

const producao = identidadeDe(process.env.DIRECT_URL) ?? identidadeDe(process.env.DATABASE_URL);
const teste = identidadeDe(DIRETO_TESTE);
const hostTeste = teste;

if (producao && teste && producao === teste) {
  console.error(
    '\n[preteste] ABORTADO: o banco de teste é o MESMO banco da produção\n' +
    `           (${teste}).\n\n` +
    '           Os testes de integração APAGAM linhas. Rodar contra produção\n' +
    '           destruiria dados reais. Aponte DATABASE_URL_TESTE para outro\n' +
    '           banco antes de continuar.\n'
  );
  process.exit(1);
}

console.log('[preteste] migrando o banco de teste...');

try {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: URL_TESTE, DIRECT_URL: DIRETO_TESTE },
    stdio: 'inherit',
  });
} catch {
  /* O `execSync` estourando joga um erro do Node com stack trace de
     `child_process`, que não diz nada a quem está tentando rodar
     teste — e enterra a mensagem do Prisma, que é a única linha útil,
     algumas telas acima. Aqui o processo sai com a explicação por
     último, que é onde o olho vai. */
  console.error(
    `\n[preteste] A migração do banco de teste falhou.\n\n` +
    `           Host: ${hostTeste ?? '(não foi possível ler)'}\n\n` +
    '           Se o erro acima é P1001 ("can\'t reach database server"), o\n' +
    '           banco de teste não existe ou está fora do ar. Duas saídas:\n\n' +
    '           1. Local (recomendado — mais rápido, e nada perto da produção):\n' +
    '                docker run -d --name pg-teste -e POSTGRES_PASSWORD=teste \\\n' +
    '                  -e POSTGRES_DB=plataforma_teste -p 5433:5432 postgres:16\n\n' +
    '              e no .env:\n' +
    '                DATABASE_URL_TESTE="postgresql://postgres:teste@localhost:5433/plataforma_teste"\n\n' +
    '           2. Neon: criar um branch novo e copiar a connection string para\n' +
    '              DATABASE_URL_TESTE. Defina também DIRECT_URL_TESTE com a mesma\n' +
    '              URL sem o "-pooler" — o lock de migração briga com o pooler.\n\n' +
    '           Sem DATABASE_URL_TESTE definida, os testes de integração se\n' +
    '           pulam sozinhos em vez de falhar.\n'
  );
  process.exit(1);
}

console.log('[preteste] banco de teste migrado.');
