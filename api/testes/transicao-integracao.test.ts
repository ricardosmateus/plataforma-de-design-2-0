/* ============================================================
   A regra crítica, escrita de verdade num Postgres
   ============================================================
   `testes/transicao.test.ts` cobre a DECISÃO (o que cada mudança de
   coluna significa) sem banco nem rede — e isso é o que roda sempre,
   em qualquer máquina, em milissegundos. Falta a outra metade: será
   que o `PATCH .../status` realmente GRAVA `assunto = null` quando
   manda? Decisão certa com escrita errada é o mesmo bug visto de
   outro ângulo.

   Este arquivo testa a ESCRITA — pela rota real (`construirApp()` +
   `app.inject`), não chamando o Prisma direto. Ir pela rota é o que
   também exercita autenticação, validação e a query real, que é
   onde bug de digitação em nome de coluna ou de tipo (como o
   `uuid = text` que ficou quebrado por dias em `/sobre`) se
   esconderia de um teste que pulasse a camada HTTP.

   ------------------------------------------------------------
   Por que isto é OPT-IN e não roda sozinho
   ------------------------------------------------------------
   Precisa de um Postgres de verdade. `npm run teste` (o `tsx --test
   testes/*.test.ts` do package.json) inclui este arquivo no glob,
   mas ele mesmo decide não fazer nada quando `DATABASE_URL_TESTE`
   não está definida no `.env` — pula, avisa por quê, e não falha a
   suíte de quem não configurou. NUNCA aponte isto para o banco de
   produção (o `DATABASE_URL` do Neon): o `before()` roda
   `prisma migrate deploy` e cria/apaga linhas.

   `prisma migrate deploy` no `before()` roda contra o MESMO banco
   de teste que outro arquivo de integração também usa — e o
   `node --test` roda arquivos em paralelo por padrão. Duas
   migrações disputando o mesmo banco ao mesmo tempo é exatamente o
   tipo de corrida que derruba uma delas com "migração falhou" sem
   ter falhado nada de verdade. Por isso o script `teste` em
   `package.json` roda com `--test-concurrency=1`: NÃO REMOVA essa
   flag enquanto houver mais de um arquivo de integração aqui.

   Como configurar (uma vez):
     1. Um Postgres alcançável — o mais simples é local:
          brew install postgresql@16
          brew services start postgresql@16
          createdb plataforma_teste
     2. No `.env`:
          DATABASE_URL_TESTE="postgresql://localhost:5432/plataforma_teste"
     3. npm run teste:integracao   (ou "npm run teste", que já inclui este arquivo)
   ------------------------------------------------------------ */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';

/* `src/env.ts` também chama loadEnvFile(), mas só é importado dentro
   de before() (import dinâmico, de propósito — ver comentário acima).
   Esta constante aqui embaixo é lida no topo do arquivo, antes de
   before() rodar, então sem isto DATABASE_URL_TESTE nunca seria
   enxergada mesmo estando no .env: a suíte pulava sempre, mesmo
   configurada certo. */
try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI, onde a variável já vem do ambiente. */
}

const URL_TESTE = process.env.DATABASE_URL_TESTE;

describe(
  'regra crítica — escrita real no banco (PATCH .../status)',
  { skip: URL_TESTE ? false : 'DATABASE_URL_TESTE não definida — ver o comentário no topo deste arquivo' },
  () => {
    let db: typeof import('../src/db.js')['db'];
    let app: Awaited<ReturnType<typeof import('../src/servidor.js')['construirApp']>>;
    let COOKIE_ACESSO: string;
    let cookieDaSessao: string;

    let empresaId: string;
    let projetoId: string;
    let usuarioId: string;
    const marcador = 'teste-integracao-' + Date.now();

    before(async () => {
      /* Import dinâmico, não estático: `db.ts` faz `new PrismaClient()`
         sem passar `datasources`, então ele lê `process.env.DATABASE_URL`
         no exato instante em que é construído. Um `import` no topo do
         arquivo seria hoisted pelo ESM e rodaria ANTES desta linha —
         apontando, por acidente, para a produção. E isto fica dentro
         de `before()`, não solto no corpo do `describe`, para nunca
         rodar quando a suíte está pulada. */
      process.env.DATABASE_URL = URL_TESTE;
      /* NODE_ENV=test já é o que `rateLimit.allowList` em
         servidor.ts verifica para não limitar requisição de teste —
         sem isto, os quatro `app.inject` abaixo correm risco de
         esbarrar no limite pensado para tráfego real. */
      process.env.NODE_ENV = 'test';

      /* A migração NÃO roda mais aqui — saiu para
         `scripts/migrar-teste.ts` (rodado uma vez por
         `npm run preteste`, antes desta suíte inteira). Cada
         arquivo de integração rodando `prisma migrate deploy` no
         próprio before() fazia dois lock consultivos disputarem a
         mesma conexão em pool do Neon e estourar timeout (P1002)
         mesmo sem corrida real entre os arquivos. Ver o cabeçalho
         de migrar-teste.ts para a explicação completa. */

      const dbMod = await import('../src/db.js');
      const servidorMod = await import('../src/servidor.js');
      const sessaoMod = await import('../src/seguranca/sessao.js');

      db = dbMod.db;
      app = await servidorMod.construirApp();
      COOKIE_ACESSO = sessaoMod.COOKIE_ACESSO;

      const usuario = await db.usuario.create({
        data: {
          nome: 'Pessoa de teste',
          email: `${marcador}@teste.local`,
          senhaHash: 'não-autentica-por-aqui',
        },
      });
      usuarioId = usuario.id;

      const sessaoRow = await db.sessao.create({
        data: {
          usuarioId: usuario.id,
          refreshTokenHash: sessaoMod.digerir(sessaoMod.gerarTokenOpaco()),
          expiraEm: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      cookieDaSessao = await sessaoMod.assinarAcesso(usuario.id, sessaoRow.id);

      const empresa = await db.empresa.create({
        data: { nome: marcador, nomeBusca: marcador, criadoPor: usuario.id },
      });
      empresaId = empresa.id;

      await db.empresaMembro.create({
        data: { empresaId, usuarioId: usuario.id, papel: 'proprietario' },
      });

      const projeto = await db.projeto.create({
        data: { empresaId, tipo: 'startup', criadoPor: usuario.id },
      });
      projetoId = projeto.id;
    });

    after(async () => {
      /* Ordem inversa das relações — explícito, e não torcendo para
         o `onDelete: Cascade` cobrir tudo sozinho: o objetivo aqui é
         deixar o banco de teste limpo, não testar cascata. */
      await db.ideia.deleteMany({ where: { projetoId } });
      await db.projeto.deleteMany({ where: { empresaId } });
      await db.empresaMembro.deleteMany({ where: { empresaId } });
      await db.empresa.deleteMany({ where: { id: empresaId } });
      const usuario = await db.usuario.findFirst({ where: { email: `${marcador}@teste.local` } });
      if (usuario) {
        await db.sessao.deleteMany({ where: { usuarioId: usuario.id } });
        await db.usuario.delete({ where: { id: usuario.id } });
      }
      await app.close();
      await db.$disconnect();
    });

    function mudarStatus(ideiaId: string, status: string) {
      return app.inject({
        method: 'PATCH',
        url: `/empresas/${empresaId}/projetos/${projetoId}/ideias/${ideiaId}/status`,
        cookies: { [COOKIE_ACESSO]: cookieDaSessao },
        payload: { status },
      });
    }

    test('sair de finalizado apaga assunto, tags e a marca manual — no banco, de verdade', async () => {
      /* O caso mais exigente: uma pasta escolhida por uma PESSOA
         (`taxonomiaManual: true`). Se a limpeza deixasse essa marca de
         pé, a idéia voltaria a "finalizado" um dia imune à IA para
         sempre, carregando uma decisão tomada sobre outro contexto. */
      const ideia = await db.ideia.create({
        data: {
          projetoId,
          titulo: 'Idéia finalizada com pasta corrigida à mão',
          descricao: 'Fixture do teste de integração — pode apagar.',
          criadoPor: usuarioId,
          status: 'finalizado',
          assunto: 'UX',
          tags: ['MVP'],
          taxonomiaManual: true,
        },
      });

      const resp = await mudarStatus(ideia.id, 'andamento');
      assert.equal(resp.statusCode, 200);

      const linha = await db.ideia.findUniqueOrThrow({ where: { id: ideia.id } });
      assert.equal(linha.status, 'andamento');
      assert.equal(linha.assunto, null);
      assert.deepEqual(linha.tags, []);
      assert.equal(linha.taxonomiaManual, false);
    });

    test('entre ideias e andamento a taxonomia não é tocada — mesmo se já tinha algo lá', async () => {
      /* Estado hoje inalcançável pela aplicação (nada preenche
         assunto fora de "finalizado"), mas o teste não deveria
         confiar nisso por acidente: prova que a ROTA propriamente
         ignora esses campos nessa transição, e não apenas que eles
         "geralmente estão vazios". */
      const ideia = await db.ideia.create({
        data: {
          projetoId,
          titulo: 'Idéia com sujeira proposital nos campos de taxonomia',
          descricao: 'Fixture do teste de integração — pode apagar.',
          criadoPor: usuarioId,
          status: 'ideias',
          assunto: 'Backlog',
          tags: ['Roadmap'],
          taxonomiaManual: true,
        },
      });

      const resp = await mudarStatus(ideia.id, 'andamento');
      assert.equal(resp.statusCode, 200);

      const linha = await db.ideia.findUniqueOrThrow({ where: { id: ideia.id } });
      assert.equal(linha.status, 'andamento');
      assert.equal(linha.assunto, 'Backlog');
      assert.deepEqual(linha.tags, ['Roadmap']);
      assert.equal(linha.taxonomiaManual, true);
    });

    test('entrar em finalizado NÃO grava pasta na hora — a classificação é assíncrona', async () => {
      /* Sem isto, alguém lendo só o teste anterior poderia concluir
         que basta finalizar para já sair classificado. A resposta HTTP
         volta antes do modelo responder, de propósito (ideias-mov-002
         / o comentário em ideias.ts): mover um card não pode esperar
         a IA. Este teste é a prova de que a escrita respeita essa
         promessa — e não uma falha de não ter configurado IA_API_KEY. */
      const ideia = await db.ideia.create({
        data: {
          projetoId,
          titulo: 'Idéia prestes a ser finalizada',
          descricao: 'Fixture do teste de integração — pode apagar.',
          criadoPor: usuarioId,
          status: 'andamento',
        },
      });

      const resp = await mudarStatus(ideia.id, 'finalizado');
      assert.equal(resp.statusCode, 200);

      const linha = await db.ideia.findUniqueOrThrow({ where: { id: ideia.id } });
      assert.equal(linha.status, 'finalizado');
      assert.equal(linha.assunto, null, 'a classificação é disparada, não esperada — ainda não chegou');
    });

    test('mover para a mesma coluna não escreve (não mexe em atualizado_em)', async () => {
      const ideia = await db.ideia.create({
        data: {
          projetoId,
          titulo: 'Idéia parada em andamento',
          descricao: 'Fixture do teste de integração — pode apagar.',
          criadoPor: usuarioId,
          status: 'andamento',
        },
      });

      const resp = await mudarStatus(ideia.id, 'andamento');
      assert.equal(resp.statusCode, 200);

      const linha = await db.ideia.findUniqueOrThrow({ where: { id: ideia.id } });
      assert.equal(linha.atualizadoEm.getTime(), ideia.atualizadoEm.getTime());
    });
  },
);
