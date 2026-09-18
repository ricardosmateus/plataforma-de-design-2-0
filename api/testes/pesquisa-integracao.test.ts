/* ============================================================
   A pesquisa, escrevendo de verdade num Postgres
   ============================================================
   Planejamento: planejamento-pesquisa-concorrentes.md §6 e §7

   As funções puras (`roteador`, `entidades`, `sessao`) provam as
   DECISÕES. Este arquivo prova o que só um banco de pé mostra:

   1. Que o estado gravado alimenta o roteador — apelido e foco lidos
      do banco resolvem a referência da pergunta seguinte.
   2. Que a trava do apelido é do BANCO, não só do TypeScript.
   3. Que a recusa NÃO CORROMPE NADA — sem provedor configurado,
      consultar não grava consulta, não cria entidade e não lança
      crédito. É a garantia que separa "não tentei" de "tentei e
      falhou", e a que mais importa enquanto não há provedor.

   Vai pela ROTA real (`construirApp()` + `app.inject`), não chamando
   o Prisma direto — pelo mesmo motivo de
   `transicao-integracao.test.ts`: o caminho que o navegador percorre
   é o que precisa estar certo.

   OPT-IN: sem DATABASE_URL_TESTE no .env, pula sozinho.
   NUNCA aponte para o banco de produção.

     npm run teste:pesquisa
   ============================================================ */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';

/* O .env precisa ser carregado AQUI, no topo — a constante abaixo é
   lida antes de `before()` rodar. Mesma armadilha já registrada em
   `razao-integracao.test.ts`. */
try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI. */
}

const URL_TESTE = process.env.DATABASE_URL_TESTE;

describe(
  'pesquisa — escrita real no banco',
  { skip: URL_TESTE ? false : 'DATABASE_URL_TESTE não definida — ver o topo deste arquivo' },
  () => {
    let db: typeof import('../src/db.js')['db'];
    let app: Awaited<ReturnType<typeof import('../src/servidor.js')['construirApp']>>;
    let COOKIE_ACESSO: string;

    let usuarioId: string;
    let cookie: string;

    /* Um segundo dono, para provar o isolamento. */
    let outroId: string;
    let cookieOutro: string;

    let sessaoId: string;

    const marcador = 'pesquisa-teste-' + Date.now();

    before(async () => {
      /* Import DINÂMICO: `db.ts` constrói o PrismaClient lendo
         `process.env.DATABASE_URL` no instante da construção. Import
         estático seria hoisted e apontaria para produção. */
      process.env.DATABASE_URL = URL_TESTE;
      process.env.NODE_ENV = 'test';

      /* Provedores desligados, sempre. Antes isto vinha do `.env` da
         máquina, e o teste "sem provedor configurado: 503" era o
         único a depender disso — calado, porque passava enquanto
         `PESQUISA_DRIVER` fosse "none".

         Em 07/09/2026 o `.env` passou a trazer `PESQUISA_DRIVER
         ="claude"` e a premissa caiu: a rota deixou de devolver 503 e
         passou a CHAMAR A ANTHROPIC DE VERDADE dentro do teste — uma
         chamada paga por execução da suíte, que é o efeito colateral
         mais caro que um teste de integração pode ter.

         Aqui, e não só naquele caso, porque nenhum teste deste
         arquivo quer provedor: todos exercitam recusa, planejamento e
         estado gravado. Um provedor ligado não ajuda nenhum deles e
         faz mal a um. */
      process.env.PESQUISA_DRIVER = 'none';
      process.env.LUGARES_DRIVER = 'none';

      db = (await import('../src/db.js')).db;
      const servidorMod = await import('../src/servidor.js');
      const sessaoMod = await import('../src/seguranca/sessao.js');

      app = await servidorMod.construirApp();
      COOKIE_ACESSO = sessaoMod.COOKIE_ACESSO;

      async function criarDono(sufixo: string) {
        const u = await db.usuario.create({
          data: {
            nome: 'Dono de teste',
            email: `${marcador}-${sufixo}@teste.local`,
            senhaHash: 'não-autentica-por-aqui',
          },
        });
        const s = await db.sessao.create({
          data: {
            usuarioId: u.id,
            refreshTokenHash: sessaoMod.digerir(sessaoMod.gerarTokenOpaco()),
            expiraEm: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        return { id: u.id, cookie: await sessaoMod.assinarAcesso(u.id, s.id) };
      }

      const dono = await criarDono('dono');
      usuarioId = dono.id;
      cookie = dono.cookie;

      const outro = await criarDono('outro');
      outroId = outro.id;
      cookieOutro = outro.cookie;
    });

    after(async () => {
      if (!db) return;
      /* Ordem inversa e explícita — o objetivo é deixar o banco
         limpo, não testar cascata. */
      const sessoes = await db.pesquisaSessao.findMany({
        where: { usuarioId: { in: [usuarioId, outroId] } },
        select: { id: true },
      });
      const ids = sessoes.map((s) => s.id);
      await db.pesquisaFonte.deleteMany({ where: { consulta: { sessaoId: { in: ids } } } });
      await db.pesquisaConsulta.deleteMany({ where: { sessaoId: { in: ids } } });
      await db.pesquisaEntidade.deleteMany({ where: { sessaoId: { in: ids } } });
      await db.pesquisaSessao.deleteMany({ where: { id: { in: ids } } });
      await db.consumoPesquisa.deleteMany({ where: { usuarioId: { in: [usuarioId, outroId] } } });
      await db.creditoLancamento.deleteMany({ where: { usuarioId: { in: [usuarioId, outroId] } } });
      await db.sessao.deleteMany({ where: { usuarioId: { in: [usuarioId, outroId] } } });
      await db.usuario.deleteMany({ where: { email: { startsWith: marcador } } });
      await app.close();
      await db.$disconnect();
    });

    function abrir(comCookie = cookie) {
      return app.inject({
        method: 'POST',
        url: '/pesquisa/sessoes',
        cookies: { [COOKIE_ACESSO]: comCookie },
        payload: { titulo: 'Concorrentes — teste' },
      });
    }

    function planejar(pergunta: string, comCookie = cookie) {
      return app.inject({
        method: 'POST',
        url: `/pesquisa/sessoes/${sessaoId}/planejar`,
        cookies: { [COOKIE_ACESSO]: comCookie },
        payload: { pergunta },
      });
    }

    function listar(tarefa?: string) {
      return app.inject({
        method: 'GET',
        url: '/pesquisa/sessoes' + (tarefa ? '?tarefaId=' + tarefa : ''),
        cookies: { [COOKIE_ACESSO]: cookie },
      });
    }

    function detalhe() {
      return app.inject({
        method: 'GET',
        url: `/pesquisa/sessoes/${sessaoId}`,
        cookies: { [COOKIE_ACESSO]: cookie },
      });
    }

    function consultar(pergunta: string) {
      return app.inject({
        method: 'POST',
        url: `/pesquisa/sessoes/${sessaoId}/consultar`,
        cookies: { [COOKIE_ACESSO]: cookie },
        payload: { pergunta },
      });
    }

    test('abre uma investigação', async () => {
      const r = await abrir();
      assert.equal(r.statusCode, 201);
      sessaoId = r.json().id;
      assert.ok(sessaoId);
    });

    test('a investigação de outro dono simplesmente não existe', async () => {
      /* 404, não 403: quem não é dono não precisa nem saber que ela
         existe. Investigação de concorrência é informação comercial. */
      const r = await planejar('quem são meus concorrentes', cookieOutro);
      assert.equal(r.statusCode, 404);
    });

    test('planejar não escreve NADA', async () => {
      const antes = await db.pesquisaConsulta.count({ where: { sessaoId } });
      const r = await planejar('quem são meus concorrentes');
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().nivel, 'conhecimento');

      const depois = await db.pesquisaConsulta.count({ where: { sessaoId } });
      assert.equal(depois, antes, 'planejar gravou consulta — deveria ser inerte');
    });

    describe('o estado gravado alimenta o roteador', () => {
      before(async () => {
        await db.pesquisaEntidade.createMany({
          data: [
            { sessaoId, apelido: 'concorrente 01', nome: 'Cafeteria Grão Nobre' },
            { sessaoId, apelido: 'concorrente 02', nome: 'Rede Expresso Café' },
          ],
        });
      });

      test('apelido lido do banco resolve a referência', async () => {
        const r = await planejar('quantas unidades o concorrente 02 tem no Brasil');
        const corpo = r.json();
        assert.deepEqual(corpo.citadas, ['Rede Expresso Café']);
        assert.deepEqual(corpo.nao_resolvidas, []);
        assert.equal(corpo.nivel, 'busca');
        assert.ok(corpo.pergunta_resolvida.includes('Rede Expresso Café'));
      });

      test('sem foco gravado, o pronome volta como referência quebrada', async () => {
        const r = await planejar('quantas unidades ele tem');
        assert.deepEqual(r.json().nao_resolvidas, ['ele']);
      });

      test('com foco gravado, o pronome resolve', async () => {
        const foco = await db.pesquisaEntidade.findFirst({
          where: { sessaoId, apelido: 'concorrente 01' },
        });
        await db.pesquisaSessao.update({
          where: { id: sessaoId },
          data: { focoId: foco!.id },
        });

        const r = await planejar('quantas unidades ele tem');
        const corpo = r.json();
        assert.deepEqual(corpo.nao_resolvidas, []);
        assert.ok(
          corpo.pergunta_resolvida.includes('Cafeteria Grão Nobre'),
          `pronome não resolveu: "${corpo.pergunta_resolvida}"`,
        );
      });

      test('o apelido tem um dono só — e a trava é do BANCO', async () => {
        /* Não basta o TypeScript garantir: é a restrição de unicidade
           que impede duas entidades disputarem "concorrente 01" numa
           corrida entre duas consultas simultâneas. */
        await assert.rejects(
          db.pesquisaEntidade.create({
            data: { sessaoId, apelido: 'concorrente 01', nome: 'Outra Empresa' },
          }),
          'o banco aceitou apelido repetido na mesma sessão',
        );
      });

      test('o mesmo apelido em OUTRA sessão é permitido', async () => {
        const outra = await db.pesquisaSessao.create({
          data: { usuarioId, titulo: 'segunda investigação' },
        });
        const e = await db.pesquisaEntidade.create({
          data: { sessaoId: outra.id, apelido: 'concorrente 01', nome: 'Empresa Qualquer' },
        });
        assert.ok(e.id);
      });
    });

    describe('reencontrar a investigação da tarefa', () => {
      /* É o caminho que o painel do board percorre a cada visita. Se
         ele falhar, cada abertura da tela cria uma investigação nova —
         e o "concorrente 01" da semana passada deixa de significar
         alguma coisa, sem erro nenhum aparecer. */
      let tarefaDaSessao: string;

      before(async () => {
        tarefaDaSessao = randomUUID();
        await db.pesquisaSessao.update({
          where: { id: sessaoId },
          data: { tarefaId: tarefaDaSessao },
        });
      });

      test('o filtro por tarefa acha a investigação certa', async () => {
        const r = await listar(tarefaDaSessao);
        assert.equal(r.statusCode, 200);
        const ids = r.json().sessoes.map((s: { id: string }) => s.id);
        assert.deepEqual(ids, [sessaoId]);
      });

      test('tarefa sem investigação devolve lista vazia, não a de outra', async () => {
        /* O erro que este teste pega: um filtro ignorado devolveria
           TODAS as sessões do usuário, e o painel adotaria a primeira
           como se fosse desta tarefa. */
        const r = await listar(randomUUID());
        assert.deepEqual(r.json().sessoes, []);
      });

      test('sem filtro, lista as do dono e diz de que tarefa cada uma é', async () => {
        const r = await listar();
        const achada = r.json().sessoes.find((s: { id: string }) => s.id === sessaoId);
        assert.ok(achada, 'a investigação do dono sumiu da lista');
        assert.equal(achada.tarefa_id, tarefaDaSessao);
      });
    });

    describe('o detalhe da investigação', () => {
      test('traz as entidades com apelido e o foco atual', async () => {
        const r = await detalhe();
        assert.equal(r.statusCode, 200);
        const corpo = r.json();
        const apelidos = corpo.entidades.map((e: { apelido: string }) => e.apelido);
        assert.ok(apelidos.includes('concorrente 01'));
        assert.ok(apelidos.includes('concorrente 02'));
        assert.ok(corpo.foco_id, 'o foco gravado não voltou no detalhe');
      });
    });

    describe('nível ambíguo não vira consulta sozinho — PES-007', () => {
      test('pergunta com dois caminhos possíveis devolve 409, sem gravar', async () => {
        /* "acesse o site" (navegação) + "perto de mim" (lugares) são
           dois níveis com custos de ordem diferente disputando a mesma
           pergunta. Escolher sozinho aqui seria escolher o custo
           sozinho. */
        const consultasAntes = await db.pesquisaConsulta.count({ where: { sessaoId } });

        const r = await consultar('acesse o site deles e veja quais unidades tem perto de mim');
        assert.equal(r.statusCode, 409);
        assert.ok(r.json().nivel_sugerido, 'a resposta não diz qual nível ela sugeriria');

        assert.equal(
          await db.pesquisaConsulta.count({ where: { sessaoId } }),
          consultasAntes,
          'gravou consulta para uma pergunta que nem chegou a ser decidida',
        );
      });

      test('com o nível confirmado, a ambiguidade deixa de barrar', async () => {
        /* Confirmado como navegação, passa da trava de PES-007 e cai na
           recusa de PES-005 — que é 501, não 409. Prova que a
           confirmação foi respeitada. */
        const r = await app.inject({
          method: 'POST',
          url: `/pesquisa/sessoes/${sessaoId}/consultar`,
          cookies: { [COOKIE_ACESSO]: cookie },
          payload: {
            pergunta: 'acesse o site deles e veja quais unidades tem perto de mim',
            nivelConfirmado: 'navegacao',
          },
        });
        assert.equal(r.statusCode, 501);
      });
    });

    describe('a recusa não corrompe nada', () => {
      test('sem provedor configurado: 503, e o banco fica intacto', async () => {
        const consultasAntes = await db.pesquisaConsulta.count({ where: { sessaoId } });
        const entidadesAntes = await db.pesquisaEntidade.count({ where: { sessaoId } });
        const lancamentosAntes = await db.creditoLancamento.count({ where: { usuarioId } });

        const r = await consultar('quantas unidades o concorrente 01 tem no Brasil');
        assert.equal(r.statusCode, 503);

        assert.equal(
          await db.pesquisaConsulta.count({ where: { sessaoId } }),
          consultasAntes,
          'gravou consulta para uma chamada que nunca saiu daqui',
        );
        assert.equal(
          await db.pesquisaEntidade.count({ where: { sessaoId } }),
          entidadesAntes,
          'criou entidade sem provedor nenhum ter respondido',
        );
        assert.equal(
          await db.creditoLancamento.count({ where: { usuarioId } }),
          lancamentosAntes,
          'mexeu em crédito sem chamada nenhuma ter acontecido',
        );
      });

      test('referência sem dono é recusada ANTES de qualquer gasto', async () => {
        const lancamentosAntes = await db.creditoLancamento.count({ where: { usuarioId } });

        const r = await consultar('quantas unidades o concorrente 09 tem');
        assert.equal(r.statusCode, 400);
        assert.deepEqual(r.json().nao_resolvidas, ['concorrente 09']);

        assert.equal(
          await db.creditoLancamento.count({ where: { usuarioId } }),
          lancamentosAntes,
        );
      });

      test('entrar em site específico é recusado por decisão, com 501', async () => {
        const r = await consultar('entre no linkedin do concorrente 01');
        assert.equal(r.statusCode, 501);
      });
    });
  },
);
