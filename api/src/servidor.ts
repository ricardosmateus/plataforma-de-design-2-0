/* ============================================================
   Servidor
   ============================================================
   Plano de backend §2 e §6: API stateless atrás de HTTPS, CORS
   restrito ao domínio do frontend, rate limit na borda da API.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import estaticos from '@fastify/static';
import multipart from '@fastify/multipart';

import { TAMANHO_MAXIMO } from './armazenamento/logotipo.js';
import { env, origensPermitidas, producao } from './env.js';
import { rotasAuth } from './rotas/auth.js';
import { rotasEmpresas } from './rotas/empresas.js';
import { rotasGrafo } from './rotas/grafo.js';
import { rotasProjetos } from './rotas/projetos.js';
import { rotasIdeias } from './rotas/ideias.js';
import { rotasTarefas } from './rotas/tarefas.js';
import { rotasBoard } from './rotas/board.js';
import { rotasReferencias } from './rotas/referencias.js';
import { rotasGerarTarefa } from './rotas/gerar-tarefa.js';
import { rotasIa } from './rotas/ia.js';
import { rotasCreditos } from './rotas/creditos.js';
import { rotasPesquisa } from './rotas/pesquisa.js';
import { rotasWebhooks } from './rotas/webhooks.js';
import { db, avisarSeClientDesatualizado } from './db.js';

/* A raiz do site é a pasta acima de api/ — o repositório inteiro.
   Isso torna a allowlist abaixo obrigatória, não opcional. */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_SITE = path.resolve(AQUI, '..', '..');

/* ALLOWLIST, jamais denylist.
   Debaixo desta raiz vivem api/.env com os segredos, a documentação
   e as regras de negócio. Servir por exclusão significa que no dia
   em que alguém criar uma pasta nova, ela vaza — e ninguém percebe.
   Por inclusão, o pior caso é um arquivo novo não ser servido, o
   que aparece na hora. */
const PERMITIDO =
  /^\/(?:[\w-]+\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js|img\/[\w.-]+\.(?:svg|png|jpe?g|webp|avif))$/;

/* ------------------------------------------------------------
   Páginas que NÃO vão ao ar — bloqueadas em produção
   ------------------------------------------------------------
   A allowlist acima serve qualquer `/<nome>.html` da raiz, sem
   autenticação nenhuma: arquivo estático não passa pela sessão. Em
   desenvolvimento isso é exatamente o que se quer. Hospedado, deixa
   três páginas internas legíveis por quem souber o endereço.

   A que importa é `mapa-regras-negocio.html`: ele EMBUTE os 26
   documentos de regra de negócio inteiros (mais de meio mega de
   texto), com as decisões comerciais, a lógica de preço e a
   discussão da alíquota de comissão. `DIN-007` diz que a separação
   entre custo do provedor e comissão é interna e "não vai para tela,
   resposta de API, extrato nem exportação" — publicar este arquivo
   numa URL pública é a exportação mais completa possível dela.

   As outras duas são catálogo de componentes e mockup: não vazam
   nada, mas também não são produto, e uma pessoa que cai nelas por
   um link perdido acha que está vendo a plataforma.

   Bloqueadas só em produção, de propósito: em desenvolvimento estas
   páginas são ferramenta de trabalho diária. */
const SO_EM_DESENVOLVIMENTO = new Set([
  '/mapa-regras-negocio.html',
  '/styleguide.html',
  '/sobre-empresa-empty-state.html',
]);

/* CUIDADO COM A BARRA INICIAL. O `allowedPath` do `@fastify/static`
   é chamado de dois jeitos, e eles não combinam:

     · pela rota coringa (`/login.html` pedido no navegador) chega
       COM barra: "/login.html";
     · por `resposta.sendFile('login.html')` chega SEM: "login.html".

   `PERMITIDO` exige a barra, então a segunda forma reprovava sempre.
   Custou uma hora em 17/09/2026: a página existia, a rota estava
   registrada, o `podeServir` era chamado, e o log dizia
   "Route GET:/login not found" — porque um `sendFile` recusado cai no
   tratador de não-encontrado, que relata o ENDEREÇO pedido e não o
   arquivo negado. Normalizar aqui, e não em quem chama, é o que
   garante que os dois caminhos respondam igual. */
function podeServir(caminho: string): boolean {
  const semQuery = (caminho.split('?')[0] ?? '').replace(/^\/+/, '');
  const limpo = '/' + semQuery;
  if (!PERMITIDO.test(limpo)) return false;
  if (producao && SO_EM_DESENVOLVIMENTO.has(limpo)) return false;
  return true;
}

/* ------------------------------------------------------------
   Endereços sem `.html` — `/login` em vez de `/login.html`
   ------------------------------------------------------------
   Pedido do Ricardo, 17/09/2026: o endereço da plataforma é
   `https://www.plataformadedesign.com/login`.

   Isto é resolvido AQUI, e não trocando as 630 referências a
   `.html` espalhadas pelas páginas, pelo js e pelos comentários.
   O truque é o par:

     `/login.html`  → 301 para `/login`     (canoniza)
     `/login`       → serve `login.html`    (reescrita interna)

   Com o 301 no lugar, TODO link interno que ainda diz `.html`
   continua funcionando e deixa a pessoa num endereço limpo — a
   barra de endereço da plataforma inteira fica sem `.html` sem que
   uma única página precise ser editada. Trocar os links depois vira
   otimização (economiza um salto de redirecionamento), não
   pré-requisito.

   Por que 301 e não 302: o endereço sem `.html` é a forma
   canônica, não um desvio temporário. O preço é que o navegador
   guarda o redirecionamento com força — se um dia a decisão mudar,
   conte com caches antigos insistindo por um tempo.

   A lista de páginas é lida do disco na partida, e não escrita à
   mão, para não haver dois lugares que precisam concordar quando
   alguém criar uma página nova. Ela não amplia nada: `podeServir`
   continua sendo o único portão, então uma página que ele recusa
   (as internas, em produção) também não ganha endereço limpo. */
/* O espaço de nomes da API e o das páginas dividem a raiz, e em um
   caso eles se encontram: `GET /empresas` já é a rota que LISTA as
   empresas em JSON. Registrar `empresas.html` no mesmo endereço
   estoura na partida com `FST_ERR_DUPLICATED_ROUTE` — o que foi como
   isto apareceu, ao provar o servidor com `NODE_ENV=production` em
   17/09/2026, e não em produção.

   O endereço limpo desta página passa a ser `/minhas-empresas`, que
   não é nome inventado: é como a própria plataforma a chama
   (`js/login.js`, `nome: 'Minhas empresas'`). A API não muda.

   A CORREÇÃO DE VERDADE é outra, e está registrada como pendência:
   a API deveria morar sob um prefixo (`/api/...`), e aí página e
   dado nunca disputariam um nome. Isso mexe em toda chamada do
   frontend, então não entra junto com a hospedagem. Até lá, esta
   exceção é uma linha e está explicada. */
const EXCECOES = new Map<string, string>([['/empresas', '/minhas-empresas']]);

const PAGINAS = new Map<string, string>();
try {
  for (const arquivo of fs.readdirSync(RAIZ_SITE)) {
    if (!arquivo.endsWith('.html')) continue;
    const nome = arquivo.slice(0, -'.html'.length);
    /* Só nomes que a allowlist aceitaria: `[\w-]+`. Um arquivo com
       ponto ou espaço no nome não vira rota. */
    if (!/^[\w-]+$/.test(nome)) continue;
    const natural = '/' + nome;
    PAGINAS.set(EXCECOES.get(natural) ?? natural, '/' + arquivo);
  }
} catch {
  /* Sem a raiz do site (API publicada sozinha, SERVIR_FRONTEND=nao)
     não há página para mapear, e isso não é erro. */
}

export async function construirApp() {
  const app = Fastify({
    logger: producao
      ? { level: 'info' }
      : { level: 'warn', transport: undefined },
    /* Necessário para que req.ip reflita o cliente e não o
       balanceador — o rate limit por IP depende disso. */
    trustProxy: true,
  });

  await app.register(cookie);

  /* Limite um pouco acima de TAMANHO_MAXIMO: a regra de negócio
     (2MB, EMP-CRIA-003) é aplicada com a mensagem certa dentro da
     rota; este limite aqui é só uma rede de segurança para não
     deixar o processo ler um corpo absurdamente grande antes de
     chegar a validar nada. */
  await app.register(multipart, {
    limits: { fileSize: TAMANHO_MAXIMO + 1024, files: 1 },
  });

  await app.register(cors, {
    /* Allowlist estrita (plano §6). credentials:true é obrigatório
       porque a sessão viaja em cookie, não em cabeçalho. */
    origin(origem, cb) {
      if (!origem) return cb(null, true);          // curl, healthcheck
      cb(null, origensPermitidas.includes(origem));
    },
    credentials: true,
    // PUT entrou com a edição de projeto (PROJ-CRIA-005) e PATCH com
    // a movimentação de idéia entre colunas (IDEIA-MOV) — sem eles
    // no allowlist, o preflight do navegador bloqueia a chamada
    // mesmo com a rota certa do lado do servidor (mesmo problema que
    // já tinha acontecido com o DELETE de empresa).
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  /* Filtro grosso por IP. O filtro fino, por e-mail, está em
     rotas/auth.ts — só ele pega ataque distribuído mirando uma
     conta específica, que é o caso que interessa. */
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    allowList: (req) => {
      if (env.NODE_ENV === 'test') return true;

      /* Arquivo do frontend NÃO é chamada de API.
         Com SERVIR_FRONTEND=sim esta mesma instância serve o site, e
         `estaticos` é registrado depois deste plugin — então herda o
         hook e cada .css/.js/.png consome a cota. board.html sozinho
         pede 7 arquivos: recarregar a tela algumas vezes enquanto se
         trabalha esgotava os 60/min e a pessoa se bloqueava sozinha,
         com "Muitas requisições" no primeiro clique seguinte.

         O limite existe para proteger a API de abuso; folha de estilo
         não precisa de cota. Mesma allowlist de PERMITIDO, para os
         dois lugares não divergirem no dia em que um tipo novo entrar. */
      const caminho = (req.url ?? '').split('?')[0] ?? '';
      /* `|| PAGINAS.has(...)`: desde que os endereços perderam o
         `.html` (17/09/2026), `/login` não casa mais com `PERMITIDO`
         e a página passaria a consumir cota enquanto o `.css` e o
         `.js` dela seguem isentos. Eram os dois lados da mesma
         decisão — arquivo de tela não precisa de cota — e um deles
         ficaria de fora por causa do formato do endereço. */
      return PERMITIDO.test(caminho) || PAGINAS.has(caminho);
    },
    errorResponseBuilder: () => ({
      campo: null,
      mensagem: 'Muitas requisições. Aguarde um instante.',
    }),
  });

  app.get('/saude', async () => {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  await app.register(rotasAuth);
  await app.register(rotasEmpresas);
  await app.register(rotasGrafo);
  await app.register(rotasProjetos);
  await app.register(rotasIdeias);
  await app.register(rotasTarefas);
  await app.register(rotasBoard);
  await app.register(rotasReferencias);
  await app.register(rotasGerarTarefa);
  await app.register(rotasIa);
  await app.register(rotasCreditos);
  await app.register(rotasPesquisa);
  await app.register(rotasWebhooks);

  /* ------------------------------------------------------------
     Frontend servido pela própria API
     ------------------------------------------------------------
     Em desenvolvimento isso vira um processo só, numa porta só:
     acaba o segundo terminal, acaba o CORS entre origens e acaba a
     classe de erro em que o site "cai" porque o outro servidor
     morreu sem avisar.

     Em produção fica desligado por padrão: o frontend vai para CDN
     (plano §2), que serve arquivo estático melhor do que qualquer
     API. Ligue com SERVIR_FRONTEND=sim se optar por publicar tudo
     junto num único serviço.
     ------------------------------------------------------------ */
  if (env.SERVIR_FRONTEND === 'sim') {
    /* Roda antes do estático porque mexe no `req.url` que ele vai
       ler. `onRequest` e não `preHandler`: quanto mais cedo, menos
       trabalho o Fastify faz por um pedido que só vai redirecionar. */
    app.addHook('onRequest', async (req, resposta) => {
      const [caminho, busca] = (req.url ?? '/').split('?');
      const query = busca ? '?' + busca : '';

      /* `/login.html` → `/login`. Só para páginas que de fato
         existem e que `podeServir` aceita: assim `/mapa-regras-
         negocio.html` continua dando 404 em produção em vez de
         redirecionar para um endereço que também não serve. */
      if (caminho && caminho.endsWith('.html')) {
        const natural = '/' + path.basename(caminho, '.html');
        const limpo = EXCECOES.get(natural) ?? natural;
        if (PAGINAS.has(limpo) && podeServir(caminho)) {
          return resposta.redirect(limpo + query, 301);
        }
        return;
      }

      /* O caminho limpo (`/login`) é atendido por uma rota própria,
         registrada depois do estático — ver abaixo. Reescrever
         `req.raw.url` aqui NÃO funcionaria: o `@fastify/static` atende
         por uma rota coringa `/*`, e o `*` já foi extraído pelo
         roteador antes de qualquer hook. A reescrita passaria em
         silêncio e o endereço limpo devolveria 404. */
    });

    await app.register(estaticos, {
      root: RAIZ_SITE,
      index: false,
      /* O caminho chega sem query string, mas normalizamos por
         garantia — ?v=3 não pode virar brecha na allowlist. */
      allowedPath: (caminho) => podeServir(caminho),

      /* Fora de produção, nada de cache.
         O padrão (`max-age=0` + ETag) manda o navegador revalidar, e
         em teoria basta — na prática, um .js editado continuava
         rodando a versão antiga na aba aberta, e o tempo ia embora
         atrás de um defeito que já estava corrigido no disco.
         `no-store` remove a dúvida: em desenvolvimento, o que a tela
         executa é sempre o que está no arquivo. Em produção o
         comportamento não muda — lá o cache é desejável. */
      setHeaders: (resposta) => {
        if (env.NODE_ENV !== 'production') {
          resposta.header('Cache-Control', 'no-store, must-revalidate');
        }
      },
    });

    /* A raiz leva ao login: `index: false` faz `/` devolver 404, e a
       raiz é a primeira coisa que alguém digita. Para o endereço
       LIMPO, senão o 301 de cima transformaria toda visita à raiz em
       dois redirecionamentos seguidos. */
    app.get('/', async (_req, resposta) => resposta.redirect('/login'));

    /* ------------------------------------------------------------
       Uma rota por página, para o endereço sem `.html`
       ------------------------------------------------------------
       Registradas DEPOIS do estático porque `sendFile` é decoração
       dele. Rota explícita, e não reescrita de `req.url`: o
       `@fastify/static` atende por uma coringa `/*` e o roteador já
       extraiu o `*` antes de qualquer hook — reescrever ali passaria
       em silêncio e o endereço limpo daria 404.

       `sendFile` e não um `readFile` próprio: assim estes endereços
       herdam o mesmo cache, o mesmo ETag e o mesmo tratamento de
       intervalo que os arquivos servidos pelo caminho normal. Dois
       jeitos de entregar o mesmo arquivo divergiriam no primeiro
       ajuste de cabeçalho. */
    for (const [rota, arquivo] of PAGINAS) {
      app.get(rota, async (_req, resposta) => {
        /* Reconferido a cada pedido, e não só na montagem da lista:
           é `podeServir` que decide, e ele é o único portão. */
        if (!podeServir(arquivo)) return resposta.callNotFound();
        return resposta.sendFile(arquivo.slice(1));
      });
    }
  }

  /* Nunca devolver stack para o cliente: mensagem genérica para
     fora, detalhe no log. */
  app.setErrorHandler((e, _req, resposta) => {
    app.log.error(e);
    /* O 500 genérico é certo para a tela e péssimo para quem está
       depurando: "Erro inesperado" não diz que faltou um passo. As
       duas falhas de Prisma que são SEMPRE falta de passo ganham o
       comando no log (a resposta continua genérica — o detalhe do
       banco não vai para o navegador). */
    const nome = (e as { name?: string })?.name;
    const codigo = (e as { code?: string })?.code;
    if (nome === 'PrismaClientValidationError') {
      console.error('  ⚠  O Prisma Client recusou a consulta. Se o schema mudou: npm run gerar, e reinicie a API.');
    } else if (codigo === 'P2021' || codigo === 'P2022') {
      console.error('  ⚠  Tabela ou coluna inexistente no banco: há migração pendente. Rode npm run migrar.');
    }
    if (resposta.sent) return;
    resposta.code(500).send({ campo: null, mensagem: 'Erro inesperado. Tente novamente.' });
  });

  return app;
}

/* Sobe sempre, exceto em teste — os testes importam construirApp()
   e não querem porta aberta.

   A versão anterior comparava import.meta.url com process.argv[1]
   para detectar "executado direto". Sob `tsx watch` esses dois
   valores nem sempre batem, e o processo subia sem nunca escutar —
   silenciosamente, que é o pior jeito de falhar. */
if (env.NODE_ENV !== 'test') {
  /* Antes de abrir a porta: se o client estiver defasado em relação
     ao schema, dizer isso com o comando que resolve — em vez de
     deixar a falha aparecer depois como um 500 críptico dentro de
     uma tela. */
  avisarSeClientDesatualizado();

  const app = await construirApp();
  try {
    await app.listen({ port: env.PORTA, host: '0.0.0.0' });
    console.log(`API em http://localhost:${env.PORTA}`);
    console.log(`Origens permitidas: ${origensPermitidas.join(', ')}`);
    console.log(`Driver de e-mail: ${env.EMAIL_DRIVER}`);
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}
