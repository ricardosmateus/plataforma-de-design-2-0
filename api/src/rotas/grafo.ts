/* ============================================================
   Conhecimento da empresa — GET /empresas/:id/grafo e /sobre
   ============================================================
   Planejamento: planejamento-grafo-conhecimento.md

   Três telas consomem ESTA rota, e é de propósito que seja uma só:

     grafo.js         → a rede desenhada no canvas
     conhecimento.js  → a lista completa, com busca
     grafo-painel.js  → o resumo ao clicar num nó

   O comentário no topo de `conhecimento.js` já dizia "nenhuma rota
   nova — reaproveita a carga que o desenho já faz". A rota é que
   nunca existiu: o front-end foi escrito supondo que sim, e as três
   seções falhavam em silêncio desde então.

   Não há tabela de grafo, e não precisa haver: nós e arestas são
   DERIVADOS de `Ideia.assunto` e `Ideia.tags`, que a taxonomia já
   preenche. Materializar isso criaria uma segunda verdade para
   manter em sincronia com a primeira.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';
import { TAXONOMIA, CATEGORIAS } from '../ia/taxonomia-vocabulario.js';
import { nomeDoTipo } from '../projetos/catalogo.js';
import { classificarIdeiaEmSegundoPlano } from '../ia/taxonomia.js';
import { segmentarIdeiaEmSegundoPlano } from '../ia/recortes.js';

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

const paramsComEmpresa = z.object({ empresaId: z.string().uuid() });

/* Teto do SERVIDOR: existe para a consulta não explodir numa empresa
   grande, e é outra coisa que o teto do CLIENTE (que existe para o
   desenho continuar legível). `grafo.js` avisa na tela quando ESTE
   corta — por isso a contagem total vai junto na resposta. */
const TETO = 400;

/* Mesma função de auth das outras rotas — reproduzida aqui, não
   importada, seguindo a convenção do projeto. */
async function quemPede(req: FastifyRequest): Promise<string | null> {
  const acesso = req.cookies[sessao.COOKIE_ACESSO];
  if (!acesso) return null;

  const conteudo = await sessao.lerAcesso(acesso);
  if (!conteudo) return null;

  /* O token ser legível não basta: a sessão pode ter sido revogada ou
     expirada depois de emitido. Sem esta consulta, um logout não
     tiraria o acesso a esta rota até o token vencer sozinho. */
  const viva = await db.sessao.findFirst({
    where: { id: conteudo.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  if (!viva) return null;

  return conteudo.usuarioId;
}

/* Sem vínculo ativo a pessoa não tem o direito de saber se a empresa
   existe: devolve 404, nunca 403. */
async function vinculoAtivo(usuarioId: string, empresaId: string) {
  return db.empresaMembro.findFirst({
    where: {
      empresaId,
      usuarioId,
      revogadoEm: null,
      OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
      empresa: { arquivadoEm: null },
    },
  });
}

/* ------------------------------------------------------------
   O formato que as três telas esperam
   ------------------------------------------------------------
   Lido do próprio front-end, não inventado:

     nó de idéia     { id, tipo:'ideia', rotulo, ideia_id,
                       projeto_id, assunto, tags, status }
     nó de categoria { id, tipo:'categoria', rotulo, peso }
     aresta          { origem, destino, tipo }

   `x`, `y` e `r` são calculados no cliente (`montar()` em grafo.js).
   O servidor não manda posição: duas cargas iguais produzem o mesmo
   desenho porque a espiral é determinística lá, não porque veio
   pronta daqui.
   ------------------------------------------------------------ */
type No = {
  id: string;
  tipo: 'ideia' | 'categoria';
  rotulo: string;
  peso?: number;
  ideia_id?: string;
  projeto_id?: string;
  assunto?: string;
  tags?: string[];
  status?: string;
};

type Aresta = { origem: string; destino: string; tipo: string };

/* Id derivado do nome, e não um uuid sorteado: a aresta aponta para
   ele e as duas coisas são montadas em passagens diferentes. Normaliza
   para "Preços" e "preços" não virarem duas pastas. */
function idDaCategoria(nome: string): string {
  return 'cat:' + nome.trim().toLowerCase();
}

export async function rotasGrafo(app: FastifyInstance) {
  app.get('/empresas/:empresaId/grafo', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComEmpresa.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* O escopo desce pela relação `projeto`: o `where` é do banco, não
       de uma checagem depois. Idéia arquivada fica fora — foi
       descartada, e ressuscitá-la no grafo desfaria a decisão de quem
       a arquivou (IDEIA-EXCL-001).

       `status: 'finalizado'` FALTAVA AQUI, e o defeito só apareceu com
       volume (17/09/2026). O mapa é o conhecimento da empresa, e
       conhecimento é o que foi finalizado — é o que `/temas` já
       filtrava, é o que o estado vazio do cliente promete em palavras
       ("o grafo aparece quando houver idéia finalizada e classificada")
       e é a fronteira de IA-CONHEC-002. Sem o filtro, toda idéia de
       brainstorm entrava como nó.

       Por que ninguém viu antes: com poucas idéias soltas o desenho
       ficava só um pouco mais sujo. Com 152 idéias importadas de uma
       vez em "Minhas idéias" — todas sem `assunto` e sem `tags`,
       portanto sem aresta nenhuma —, e com o servidor ordenando por
       `criadoEm desc`, elas chegaram primeiro e consumiram inteiro o
       teto de 130 nós de idéia do cliente (`dobrarExcedente` em
       `js/grafo.js`). O grafo virou uma nuvem de pontos soltos e as
       idéias que tinham categoria foram TODAS dobradas para fora da
       tela. Nada no código do grafo mudou; o dado mudou, e o filtro
       que faltava deixou o dado decidir o desenho.

       Idéia finalizada SEM categoria continua entrando: ela é
       conhecimento, só não classificado, e é isso que o balde "sem
       pasta" existe para dizer. O que sai são as que ainda não são
       conhecimento. */
    const escopo = {
      arquivadoEm: null,
      status: 'finalizado',
      projeto: { empresaId: params.data.empresaId, arquivadoEm: null },
    } as const;

    const total = await db.ideia.count({ where: escopo });

    const ideias = await db.ideia.findMany({
      where: escopo,
      orderBy: { criadoEm: 'desc' },
      take: TETO,
      select: {
        id: true,
        titulo: true,
        status: true,
        assunto: true,
        tags: true,
        projetoId: true,
      },
    });

    const nos: No[] = [];
    const arestas: Aresta[] = [];
    /* Categoria → quantas idéias a citam. O peso do nó é essa
       contagem: uma pasta com doze idéias desenha maior que uma com
       duas, e é o que faz o grafo dizer algo de longe. */
    const pesoPorCategoria = new Map<string, number>();
    const rotuloPorId = new Map<string, string>();

    for (const i of ideias) {
      nos.push({
        id: i.id,
        tipo: 'ideia',
        rotulo: i.titulo,
        ideia_id: i.id,
        projeto_id: i.projetoId,
        assunto: i.assunto ?? '',
        tags: i.tags ?? [],
        status: i.status,
      });

      /* `assunto` é a pasta (uma por idéia); `tags` são as secundárias
         (N por idéia). As duas viram categoria, e a diferença fica no
         `tipo` da aresta — é o que permite ao desenho dar mais força à
         pasta sem precisar de outra consulta. */
      const categorias: Array<{ nome: string; tipo: string }> = [];
      if (i.assunto && i.assunto.trim()) {
        categorias.push({ nome: i.assunto.trim(), tipo: 'assunto' });
      }
      for (const t of i.tags ?? []) {
        if (t && t.trim()) categorias.push({ nome: t.trim(), tipo: 'tag' });
      }

      for (const c of categorias) {
        const idCat = idDaCategoria(c.nome);
        pesoPorCategoria.set(idCat, (pesoPorCategoria.get(idCat) ?? 0) + 1);
        if (!rotuloPorId.has(idCat)) rotuloPorId.set(idCat, c.nome);
        arestas.push({ origem: i.id, destino: idCat, tipo: c.tipo });
      }
    }

    /* Os nós de categoria saem do mapa depois de contados: cada um
       nasce com o peso final, sem segunda passagem para corrigir. */
    for (const [id, peso] of pesoPorCategoria) {
      nos.push({ id, tipo: 'categoria', rotulo: rotuloPorId.get(id) ?? id, peso });
    }

    return resposta.send({
      nos,
      arestas,
      truncado: total > TETO,
      teto: TETO,
    });
  });

  /* ------------------------------------------------------------
     GET /empresas/:id/sobre — as pastas e a cobertura
     ------------------------------------------------------------
     Consumida por `sobre-empresa-semana2.js`, que faz POLLING: ela
     recarrega sozinha e afrouxa o ritmo quando nada muda. Por isso a
     resposta precisa ser estável — mesma entrada, mesma saída, na
     mesma ordem. Uma ordenação instável faria a tela piscar a cada
     ciclo mesmo sem nada ter mudado, porque o cliente compara o JSON
     inteiro para decidir se redesenha.

     Formato lido do próprio front-end:
       { assuntos: [{ categoria, assunto, quantidade, finalizadas }],
         total_finalizadas: number,
         sem_categoria: number,
         cobertura: { total, cobertos, dominios: [{ nome, ideias }] } }

     ------------------------------------------------------------
     SÓ ENTRA NA LISTA A PASTA QUE TEM TRECHO DENTRO
     ------------------------------------------------------------
     Classificar e recortar respondem perguntas diferentes: a
     classificação diz de que a idéia fala (e abre a pasta), a
     segmentação diz que parágrafo, lido sozinho, é sobre aquele
     tema (e enche a pasta). Onde as duas divergem nascia uma pasta
     com nome, contagem e botão "Acessar" que abria sem nada —
     comum nas tags secundárias, que quase nunca ganham parágrafo
     próprio.

     Tentamos primeiro a via honesta: a pasta abria e explicava a
     divergência. Não resolveu o incômodo, porque o problema não era
     a falta de explicação — era a pasta existir. Uma gaveta vazia
     com etiqueta continua sendo trabalho para quem abre.

     Então a regra passa a ser: pasta é lugar onde há texto. Sem
     nenhum recorte sob aquele nome, ela não entra na lista. Nada se
     perde — a classificação continua no banco, a idéia continua no
     grafo e nas suas outras pastas, e se a segmentação rodar depois
     e recortar algo ali, a pasta aparece sozinha no próximo ciclo
     do polling.

     O espelho disto é `total_trechos` em `/temas/:categoria`: uma
     pasta listada aqui é uma pasta que abre com conteúdo lá. A
     conferência é a mesma — recorte de idéia finalizada, não
     arquivada, em projeto não arquivado.

     `cobertura` NÃO segue esta regra, de propósito. Ela mede o que
     já foi finalizado por domínio, e a frase que ela escreve é
     "ainda sem nada finalizado em X". Filtrar por trecho tornaria
     essa frase falsa justamente onde há conhecimento validado — o
     anel responde outra pergunta, e continua respondendo a dela.
     ------------------------------------------------------------ */
  app.get('/empresas/:empresaId/sobre', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComEmpresa.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const ideias = await db.ideia.findMany({
      where: {
        arquivadoEm: null,
        projeto: { empresaId: params.data.empresaId, arquivadoEm: null },
      },
      /* `_count.recortes` responde a segunda forma de uma finalizada
         estar incompleta — ver `sem_recortes` abaixo. Sai na mesma
         consulta porque é um JOIN agregado, não uma segunda ida ao
         banco, e esta rota é chamada em polling. */
      select: {
        assunto: true,
        tags: true,
        status: true,
        _count: { select: { recortes: true } },
        /* Só a categoria de cada recorte, sem o texto. É o que
           permite saber, POR PASTA, se existe trecho recortado sob
           aquele nome — e é essa resposta que decide se a pasta
           entra na lista. `_count` acima não serve: ele diz que a
           idéia tem algum recorte em algum tema, e uma idéia com
           trecho em Mercado e nenhum em Benchmark contaria as duas
           pastas como cheias. */
        recortes: { select: { categoria: true } },
      },
    });

    /* ------------------------------------------------------------
       Uma pasta por CATEGORIA, não por `assunto`
       ------------------------------------------------------------
       Antes esta rota só olhava `assunto`, e as `tags` não viravam
       pasta nenhuma. O resultado era uma tela que se contradizia: a
       mesma idéia classificada como "Mercado, Estratégia e
       Concorrentes" desenhava TRÊS nós no grafo (`/grafo` sempre
       tratou as duas iguais) e UMA pasta na lista ao lado. Quem via
       as três tags no card procurava as três pastas e achava uma.

       Com as páginas de tema a divergência virou um beco: existe
       `/temas/Concorrentes` com texto dentro, e não havia pasta
       nenhuma para clicar e chegar lá.

       Então a pasta passa a ser "categoria em que esta empresa tem
       conhecimento", que é a pergunta que a seção responde. A
       distinção entre pasta principal e menção não se perde — ela
       vive no painel do grafo, que separa "Nesta pasta" de
       "Mencionam como tag", e aqui sobrevive em `principais`, que
       desempata a ordenação.

       Consequência aceita: as contagens somadas passam a ser maiores
       que o número de idéias, porque uma idéia toca até quatro
       categorias. Não há total na tela para contradizer, e "quantas
       idéias falam disto" é a leitura certa de uma pasta.
       ------------------------------------------------------------ */
    const porPasta = new Map<
      string,
      { quantidade: number; finalizadas: number; principais: number; comTrecho: number }
    >();
    let semCategoria = 0;

    /* Uma finalizada pode estar incompleta de DUAS formas, e elas têm
       a mesma cara na tela (uma pasta que não entrega nada) com
       causas e remédios diferentes:

         sem pasta    → a classificação não rodou ou falhou;
         sem recortes → tem as tags, mas a página do tema abre vazia.
                        É o estado de toda idéia finalizada antes de
                        os recortes existirem.

       A segunda precisava ser CONTADA para poder ser oferecida: o
       balde "Sem categoria" só aparece quando o primeiro número é
       maior que zero, então quem tinha tudo classificado não tinha
       por onde pedir os trechos. */
    let semRecortes = 0;

    /* Quantas finalizadas existem, ponto — independente de pasta, de
       tag e de recorte. É o único número que responde à pergunta que
       o estado vazio da tela FAZ ("nenhuma atividade finalizada
       ainda"), e é por isso que ele viaja.

       A alternativa era o cliente deduzir da soma de `sem_categoria`
       com `sem_recortes`, e a dedução tem um furo: um recorte cuja
       categoria saiu das tags da idéia depois (edição manual da
       classificação) deixa a idéia fora dos dois contadores e fora
       de qualquer pasta. Raro, mas o preço do erro é a tela dizer a
       uma empresa cheia de trabalho que ela não fez nada. */
    let totalFinalizadas = 0;

    for (const i of ideias) {
      if (i.status === 'finalizado') totalFinalizadas++;
      const principal = (i.assunto ?? '').trim();

      /* Set: uma tag que repete o assunto contaria a mesma idéia
         duas vezes na mesma pasta. `interpretar` já remove essa
         repetição na origem, mas a taxonomia manual entra por outra
         porta e o dado antigo veio de antes dessa regra existir. */
      const categorias = new Set<string>();
      if (principal) categorias.add(principal);
      for (const t of i.tags ?? []) {
        const nome = (t ?? '').trim();
        if (nome) categorias.add(nome);
      }

      /* Sem categoria NENHUMA — nem pasta, nem tag. É o balde.

         `status === 'finalizado'` FALTAVA AQUI (corrigido 17/09/2026).
         O balde diz, em palavras, "elas estão finalizadas, mas ainda
         não têm pasta no mapa", e o botão que ele oferece chama
         `/reclassificar`, que só olha finalizadas. Sem o filtro, o
         número contava TODA idéia sem categoria — inclusive as de
         brainstorm, que não deveriam ter pasta ainda. Com as 152
         importadas, a tela anunciou "155 idéias sem pasta" e o botão
         não tinha o que fazer com 152 delas: um aviso que acusa um
         problema que não existe e oferece um remédio que não age. */
      if (categorias.size === 0) {
        if (i.status === 'finalizado') semCategoria++;
        continue;
      }

      /* A idéia é contada uma vez, não uma por categoria: o que
         falta é o recorte DELA. Contar por categoria mostraria "3
         idéias sem trechos" para uma idéia só. */
      if (i.status === 'finalizado' && i._count.recortes === 0) semRecortes++;

      /* Os temas sob os quais ESTA idéia tem trecho recortado. Não é
         o mesmo conjunto que `categorias`: a classificação abre a
         pasta olhando a idéia inteira, e a segmentação só recorta
         onde algum parágrafo, lido sozinho, é sobre aquele tema. */
      const comTrecho = new Set((i.recortes ?? []).map((r) => r.categoria));

      for (const nome of categorias) {
        const atual = porPasta.get(nome)
          ?? { quantidade: 0, finalizadas: 0, principais: 0, comTrecho: 0 };
        atual.quantidade++;
        if (i.status === 'finalizado') atual.finalizadas++;
        if (nome === principal) atual.principais++;
        /* O número que decide se a pasta existe. `finalizado` aqui
           não é zelo: é a mesma condição que `/temas/:categoria`
           aplica para montar os blocos. Se as duas divergirem, volta
           a existir pasta que promete e não entrega — só que agora
           pelo motivo inverso. */
        if (i.status === 'finalizado' && comTrecho.has(nome)) atual.comTrecho++;
        porPasta.set(nome, atual);
      }
    }

    /* Ordem estável: mais cheia primeiro, e nome como desempate. Sem o
       desempate, duas pastas com a mesma contagem trocariam de lugar
       entre ciclos do polling e a tela redesenharia à toa. */
    const assuntos = Array.from(porPasta.entries())
      /* Aqui a pasta vazia deixa de existir para a tela. Antes do
         `.map` porque o que não vai ser mostrado não precisa nem ser
         montado, e antes do `.sort` porque ordenar o que será
         descartado é trabalho jogado fora a cada ciclo do polling. */
      .filter(([, c]) => c.comTrecho > 0)
      .map(([nome, c]) => ({
        categoria: nome,
        /* Mesmo rótulo sob os dois nomes: `criarItem` lê
           `categoria || assunto`, e versões anteriores da tela
           mandavam só `assunto`. Custa um campo e evita quebrar
           qualquer uma das duas. */
        assunto: nome,
        quantidade: c.quantidade,
        finalizadas: c.finalizadas,
        /* Em quantas delas esta é a pasta PRINCIPAL. Não aparece na
           tela hoje; existe para desempatar a ordem — entre duas
           pastas com a mesma contagem, a que é assunto principal de
           alguma coisa vem antes da que só é mencionada. */
        principais: c.principais,
      }))
      .sort(
        (a, b) =>
          b.quantidade - a.quantidade ||
          b.principais - a.principais ||
          a.categoria.localeCompare(b.categoria),
      );

    /* Cobertura é sobre o que já foi VALIDADO, não sobre o que
       existe: a própria tela escreve "Ainda sem nada finalizado em".
       Um domínio cheio de hipóteses continua descoberto, e é essa a
       informação útil — mostra onde falta conhecimento firme. */
    /* `porPasta`, e não `assuntos`: o anel conta finalização, não
       recorte — ver a nota sobre `cobertura` no topo da rota. */
    const finalizadasPorPasta = new Map<string, number>();
    for (const [nome, c] of porPasta) {
      if (c.finalizadas > 0) finalizadasPorPasta.set(nome, c.finalizadas);
    }

    const dominios = Object.entries(TAXONOMIA).map(([nome, categorias]) => ({
      nome,
      ideias: (categorias as readonly string[]).reduce(
        (soma, cat) => soma + (finalizadasPorPasta.get(cat) ?? 0),
        0,
      ),
    }));

    return resposta.send({
      assuntos,
      total_finalizadas: totalFinalizadas,
      sem_categoria: semCategoria,
      sem_recortes: semRecortes,
      cobertura: {
        total: dominios.length,
        cobertos: dominios.filter((d) => d.ideias > 0).length,
        dominios,
      },
    });
  });

  /* ------------------------------------------------------------
     GET /empresas/:id/temas/:categoria — o texto de UM tema
     ------------------------------------------------------------
     Regras: Skills/categorizacao-taxonomia.skill

     As outras duas rotas deste arquivo respondem "de que a empresa
     fala": uma pasta chamada Concorrentes, com sete idéias dentro.
     Essa resposta acaba onde começa a pergunta seguinte, que é a que
     a pessoa realmente tem: "e o que exatamente foi dito sobre
     concorrentes?". Até aqui, respondê-la significava abrir as sete
     idéias e reler as atividades inteiras, filtrando na cabeça o que
     era de mercado e o que era de estratégia — o trabalho que a
     classificação existia para poupar.

     Esta rota serve o texto já separado. Ela NÃO chama o modelo: os
     recortes foram feitos uma vez, quando a idéia foi finalizada, e
     aqui é leitura de tabela. Abrir um tema é instantâneo e não
     custa crédito, que é o que permite navegar entre temas sem
     pensar duas vezes.

     Formato:
       { categoria, dominio, total_trechos,
         blocos: [{ ideia_id, ideia_titulo, projeto_id, projeto_nome,
                    tarefa_id, tarefa_titulo, trechos: [texto] }] }

     Um bloco por tarefa de origem, porque é o bloco que ganha o link
     do rodapé: "editar no quadro" precisa levar a UM quadro, e
     misturar duas tarefas sob um link só mandaria a pessoa para o
     lugar errado na metade das vezes.
     ------------------------------------------------------------ */
  app.get('/empresas/:empresaId/temas/:categoria', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = z
      .object({ empresaId: z.string().uuid(), categoria: z.string().min(1).max(60) })
      .safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* A categoria vem da URL e é comparada com o vocabulário fechado.
       Não é validação de formato: é o que impede a página de tema de
       existir para um nome inventado, que seria uma pasta fantasma
       com endereço próprio e conteúdo sempre vazio. */
    const categoria = CATEGORIAS.find(
      (c) => c.toLowerCase() === params.data.categoria.trim().toLowerCase(),
    );
    if (!categoria) {
      return resposta.code(404).send(erro(null, 'Esse tema não existe na taxonomia.'));
    }

    const dominio =
      Object.entries(TAXONOMIA).find(([, cats]) =>
        (cats as readonly string[]).includes(categoria),
      )?.[0] ?? null;

    /* O escopo desce pela relação, como no resto do arquivo: o
       `where` é do banco. Idéia arquivada, projeto arquivado e idéia
       que saiu de "finalizado" ficam fora — esta última não deveria
       nem ter recorte (a limpeza roda junto com o status), e o filtro
       é o cinto de segurança que garante isso mesmo se um recorte
       escapar. */
    const recortes = await db.recorteTaxonomia.findMany({
      where: {
        categoria,
        ideia: {
          arquivadoEm: null,
          status: 'finalizado',
          projeto: { empresaId: params.data.empresaId, arquivadoEm: null },
        },
      },
      orderBy: [{ ideiaId: 'asc' }, { ordem: 'asc' }],
      select: {
        texto: true,
        ordem: true,
        tarefaId: true,
        ideiaId: true,
        tarefa: { select: { titulo: true } },
        ideia: {
          select: {
            titulo: true,
            projetoId: true,
            criadoEm: true,
            /* Projeto não tem nome no banco: tem TIPO, e o rótulo
               que a interface mostra sai do catálogo (PROJ-CRIA-002).
               É a mesma fonte que `projetos.ts` usa para montar o
               card — se as duas divergissem, o mesmo projeto teria
               dois nomes em duas telas. */
            projeto: { select: { tipo: true } },
          },
        },
      },
    });

    /* Agrupa por tarefa preservando a ordem de leitura. `Map` e não
       objeto: a ordem de inserção é parte do contrato aqui, e a
       chave é composta. */
    type Bloco = {
      ideia_id: string;
      ideia_titulo: string;
      projeto_id: string;
      projeto_nome: string;
      tarefa_id: string;
      tarefa_titulo: string;
      criado_em: Date;
      trechos: string[];
    };

    const porTarefa = new Map<string, Bloco>();

    for (const r of recortes) {
      const chave = r.ideiaId + '|' + r.tarefaId;
      let bloco = porTarefa.get(chave);
      if (!bloco) {
        bloco = {
          ideia_id: r.ideiaId,
          ideia_titulo: r.ideia.titulo,
          projeto_id: r.ideia.projetoId,
          projeto_nome: r.ideia.projeto ? nomeDoTipo(r.ideia.projeto.tipo) : '',
          tarefa_id: r.tarefaId,
          tarefa_titulo: r.tarefa?.titulo ?? '',
          criado_em: r.ideia.criadoEm,
          trechos: [],
        };
        porTarefa.set(chave, bloco);
      }
      bloco.trechos.push(r.texto);
    }

    /* Mais recente primeiro: o que a empresa descobriu por último
       sobre um tema é o que interessa antes. Título como desempate,
       pela mesma razão da rota /sobre — ordem instável faria a página
       remontar diferente a cada carga. */
    const blocos = Array.from(porTarefa.values())
      .sort(
        (a, b) =>
          b.criado_em.getTime() - a.criado_em.getTime() ||
          a.ideia_titulo.localeCompare(b.ideia_titulo) ||
          a.tarefa_titulo.localeCompare(b.tarefa_titulo),
      )
      .map(({ criado_em, ...resto }) => resto);

    /* ---- Classificadas aqui, sem trecho próprio ----
       A pasta e o trecho não nascem da mesma pergunta, e é por isso
       que podem discordar:

         a classificação olha a IDÉIA — "de que isto fala?" — e é o
         que abre a pasta (`/sobre` monta a lista de `assunto` +
         `tags`);

         a segmentação olha o BLOCO — "este parágrafo é sobre quê?"
         — e cada bloco cai em UMA categoria só, garantida pela
         UNIQUE em `registro_id`.

       Uma idéia pode ser SOBRE Mercado sem ter um parágrafo que,
       lido sozinho, seja sobre Mercado. Quando isso acontece a pasta
       existe e não tem o que mostrar — e até aqui a página dizia
       "Nada escrito sobre Mercado ainda", que é falso: está escrito,
       só não recortado sob este nome.

       Devolver a lista é o que permite à tela dizer a verdade e
       ainda levar a pessoa à idéia. Não some com a pasta (a
       classificação é informação real) nem força um trecho onde não
       há (que faria a página de tema deixar de ser confiável). */
    const comTrecho = new Set(recortes.map((r) => r.ideiaId));

    const classificadas = await db.ideia.findMany({
      where: {
        arquivadoEm: null,
        status: 'finalizado',
        projeto: { empresaId: params.data.empresaId, arquivadoEm: null },
        /* O mesmo critério de `/sobre`: assunto principal OU tag. */
        OR: [{ assunto: categoria }, { tags: { has: categoria } }],
      },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        titulo: true,
        assunto: true,
        projetoId: true,
        projeto: { select: { tipo: true } },
      },
    });

    const semTrecho = classificadas
      .filter((i) => !comTrecho.has(i.id))
      .map((i) => ({
        ideia_id: i.id,
        ideia_titulo: i.titulo,
        projeto_id: i.projetoId,
        projeto_nome: i.projeto ? nomeDoTipo(i.projeto.tipo) : '',
        /* Distingue "esta é a pasta dela" de "ela só passa por
           aqui": a segunda é o caso comum e o menos surpreendente. */
        principal: i.assunto === categoria,
      }));

    return resposta.send({
      categoria,
      dominio,
      total_trechos: recortes.length,
      blocos,
      sem_trecho: semTrecho,
    });
  });

  /* ------------------------------------------------------------
     GET /empresas/:id/temas/:categoria/sintese — leitura guiada
     ------------------------------------------------------------
     Regras: Documentacao/enriquecimento-tema.md

     Separada de `/temas/:categoria` de propósito: aquela rota é
     instantânea, grátis, e não chama o modelo — essa garantia não
     muda em nada. Esta é aditiva. Se o enriquecimento ainda não
     rodou para este tema, ou falhou, a resposta tem
     `status_leitura: "pendente"` e a tela continua mostrando a
     leitura crua exatamente como sempre mostrou; nada aqui bloqueia
     nem atrasa a rota de cima.
     ------------------------------------------------------------ */
  app.get('/empresas/:empresaId/temas/:categoria/sintese', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = z
      .object({ empresaId: z.string().uuid(), categoria: z.string().min(1).max(60) })
      .safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const categoria = CATEGORIAS.find(
      (c) => c.toLowerCase() === params.data.categoria.trim().toLowerCase(),
    );
    if (!categoria) {
      return resposta.code(404).send(erro(null, 'Esse tema não existe na taxonomia.'));
    }

    const sintese = await db.sinteseTema.findUnique({
      where: { empresaId_categoria: { empresaId: params.data.empresaId, categoria } },
      select: { leitura: true, statusLeitura: true, graficos: true, statusGraficos: true },
    });

    /* Sem linha nenhuma ainda é o mesmo que "pendente" — a idéia que
       vai gerar a leitura pode não ter terminado de segmentar, ou a
       categoria pode ter acabado de ganhar seu primeiro recorte. Não
       é erro, é "ainda não". */
    const secoesArmazenadas =
      (sintese?.leitura as Array<{ titulo: string; recorteIds: string[] }> | null) ?? null;

    /* Os gráficos entram na MESMA resolução de recortes das seções, e
       não numa etapa à parte, por dois motivos que são o mesmo:

         - cada ponto carrega a `origem` de onde o número saiu, e essa
           origem só vira link se o recorte estiver no mapa que vai
           junto na resposta. Resolver só os ids das seções deixaria
           todo ponto cuja origem não foi citada em nenhuma seção sem
           destino — e, num tema com gráfico mas sem leitura guiada,
           deixaria TODOS sem destino;
         - a leitura e os gráficos ficam gravados com os ids que
           existiam quando o modelo rodou, e `recortes.ts` recria os
           recortes por inteiro a cada segmentação. Id órfão é normal,
           não é corrupção, e o tratamento tem que ser o mesmo dos dois
           lados: filtra o ponto, não derruba o resto. */
    const graficosArmazenados =
      (sintese?.graficos as Array<{
        tipo: string;
        titulo: string;
        eixoX?: string;
        eixoY?: string;
        dados: Array<{ rotulo: string; valor: number; origem: string }>;
      }> | null) ?? null;

    /* O texto de cada trecho é montado AGORA, a partir do recorte —
       nunca copiado da resposta do modelo (só título e ids ficam
       gravados em SinteseTema). O mesmo raciocínio de /temas/:categoria
       logo acima: a fonte de verdade do texto é sempre o recorte.

       Entre a leitura ter sido gerada e esta chamada, os recortes da
       categoria podem ter sido recriados (nova idéia segmentada) —
       um id referenciado na leitura antiga pode não existir mais.
       Filtra, sem derrubar a seção inteira por causa de um id órfão
       (mesma regra de enriquecimento-leitura.ts para números que não
       existem entre os recortes do tema). */
    let secoes: Array<{ titulo: string; recorte_ids: string[] }> | null = null;
    const recortesPorId: Record<
      string,
      {
        texto: string;
        projeto_id: string;
        projeto_nome: string;
        ideia_id: string;
        ideia_titulo: string;
        tarefa_id: string;
        tarefa_titulo: string;
      }
    > = {};

    const idsUnicos = Array.from(
      new Set([
        ...(secoesArmazenadas ?? []).flatMap((s) => s.recorteIds),
        ...(graficosArmazenados ?? []).flatMap((g) =>
          (g.dados ?? []).map((d) => d.origem),
        ),
      ]),
    );

    if (idsUnicos.length) {
      const recortesEncontrados = idsUnicos.length
        ? await db.recorteTaxonomia.findMany({
            where: { id: { in: idsUnicos } },
            select: {
              id: true,
              texto: true,
              tarefaId: true,
              ideiaId: true,
              tarefa: { select: { titulo: true } },
              ideia: {
                select: {
                  titulo: true,
                  projetoId: true,
                  projeto: { select: { tipo: true } },
                },
              },
            },
          })
        : [];

      for (const r of recortesEncontrados) {
        recortesPorId[r.id] = {
          texto: r.texto,
          tarefa_id: r.tarefaId,
          tarefa_titulo: r.tarefa?.titulo ?? '',
          ideia_id: r.ideiaId,
          ideia_titulo: r.ideia.titulo,
          projeto_id: r.ideia.projetoId,
          projeto_nome: r.ideia.projeto ? nomeDoTipo(r.ideia.projeto.tipo) : '',
        };
      }

      if (secoesArmazenadas && secoesArmazenadas.length) {
        secoes = secoesArmazenadas
          .map((s) => ({
            titulo: s.titulo,
            recorte_ids: s.recorteIds.filter((id) => recortesPorId[id]),
          }))
          .filter((s) => s.recorte_ids.length > 0);
      }
    }

    /* Mesmo filtro do interpretador (enriquecimento-graficos-leitura.ts),
       aplicado de novo na leitura: ponto sem recorte vivo sai, e um
       gráfico que fica com menos de dois pontos deixa de ser gráfico.
       Repetir a regra aqui não é redundância — lá ela vale para o que
       o modelo acabou de responder, aqui para o que foi gravado e
       envelheceu desde então. */
    const graficos = (graficosArmazenados ?? [])
      .map((g) => ({
        ...g,
        dados: (g.dados ?? []).filter((d) => recortesPorId[d.origem]),
      }))
      .filter((g) => g.dados.length >= 2);

    return resposta.send({
      categoria,
      status_graficos: sintese?.statusGraficos ?? 'pendente',
      status_leitura: sintese?.statusLeitura ?? 'pendente',
      secoes,
      recortes: recortesPorId,
      graficos,
    });
  });

  /* ------------------------------------------------------------
     POST /empresas/:id/reclassificar — recuperar o que ficou para trás
     ------------------------------------------------------------
     Esta rota é chamada por `sobre-empresa-semana2.js` desde sempre,
     e até agora respondia 404: o botão "Classificar" do balde "Sem
     categoria" existia na tela e não fazia nada. Mesmo padrão do
     `/grafo` e do `/sobre` — o front foi escrito supondo a rota.

     Ela cobre os DOIS jeitos de uma idéia finalizada ficar incompleta,
     que têm causas diferentes e a mesma cara para quem olha a tela:

       sem pasta      → a classificação não rodou, ou rodou e falhou
                        (rede caiu, saldo acabou, IA desligada).

       sem recortes   → a idéia foi finalizada ANTES de os recortes
                        existirem. Ela tem as tags e a página do tema
                        abre vazia — que é indistinguível de "ninguém
                        escreveu nada sobre isso".

     A segunda é a que interessa hoje: toda idéia classificada antes
     desta funcionalidade está nela.

     ------------------------------------------------------------
     Por que tem teto, e por que devolve `restantes`
     ------------------------------------------------------------
     Cada idéia aqui é uma ou duas chamadas ao modelo, pagas com o
     crédito de alguém. Um botão que dispara 400 delas de uma vez é
     um botão que gasta o saldo da pessoa sem ela ter como avaliar
     quanto ia custar. Vinte por clique, e a resposta diz quantas
     sobraram — quem quer continuar clica de novo, sabendo.

     `restantes` já é lido pela tela: ela troca o rótulo para "Tentar
     de novo" quando vem maior que zero.
     ------------------------------------------------------------ */
  app.post('/empresas/:empresaId/reclassificar', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    const params = paramsComEmpresa.safeParse(req.params);
    if (!params.success) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    const vinculo = await vinculoAtivo(usuarioId, params.data.empresaId);
    if (!vinculo) {
      return resposta.code(404).send(erro(null, 'Empresa não encontrada.'));
    }

    /* Quem só observa não dispara gasto de crédito. Mesmo critério
       de mover um card e de corrigir a pasta à mão. */
    if (vinculo.papel !== 'proprietario' && vinculo.papel !== 'membro' && vinculo.papel !== 'especialista') {
      return resposta.code(403).send(erro(null, 'Seu papel não permite reclassificar idéias.'));
    }

    const LOTE = 20;

    const candidatas = await db.ideia.findMany({
      where: {
        status: 'finalizado',
        arquivadoEm: null,
        projeto: { empresaId: params.data.empresaId, arquivadoEm: null },
      },
      orderBy: { atualizadoEm: 'desc' },
      select: {
        id: true,
        assunto: true,
        taxonomiaManual: true,
        _count: { select: { recortes: true } },
      },
    });

    /* Duas listas, porque o remédio é diferente: sem pasta precisa
       classificar (e a classificação chama o recorte no fim); com
       pasta e sem recorte precisa só do recorte — reclassificar
       seria pagar de novo por uma resposta que já se tem.

       `taxonomiaManual` fica de fora da primeira: pasta decidida por
       uma pessoa não se reabre para a IA. Mas entra na segunda — ela
       merece recorte como qualquer outra. */
    const paraClassificar = candidatas
      .filter((i) => !i.assunto && !i.taxonomiaManual)
      .map((i) => i.id);

    const paraRecortar = candidatas
      .filter((i) => i.assunto && i._count.recortes === 0)
      .map((i) => i.id);

    const fila = [...paraClassificar, ...paraRecortar];
    const lote = fila.slice(0, LOTE);

    /* Em segundo plano, como todos os outros disparos deste módulo:
       são chamadas de segundos, e a tela que pediu está com um botão
       em "Classificando…", não esperando um relatório. O `catch`
       vazio é intencional — cada função registra o próprio erro, e
       uma promessa rejeitada solta aqui derrubaria o processo. */
    for (const id of lote) {
      if (paraClassificar.includes(id)) {
        void classificarIdeiaEmSegundoPlano(id).catch(() => {});
      } else {
        void segmentarIdeiaEmSegundoPlano(id).catch(() => {});
      }
    }

    return resposta.send({
      enfileiradas: lote.length,
      classificando: lote.filter((id) => paraClassificar.includes(id)).length,
      recortando: lote.filter((id) => paraRecortar.includes(id)).length,
      restantes: Math.max(0, fila.length - lote.length),
    });
  });
}
