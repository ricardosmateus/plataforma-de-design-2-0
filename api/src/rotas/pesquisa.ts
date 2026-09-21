/* ============================================================
   Rotas de pesquisa de concorrentes
   ============================================================
   Planejamento: planejamento-pesquisa-concorrentes.md §6 e §7

   A sessão é sempre a do DONO DA SESSÃO DE LOGIN. Não existe
   parâmetro de usuário em lugar nenhum — mesma regra de
   `creditos.ts`: uma rota que aceita "de quem é" é uma rota que
   alguém vai chamar com o id de outra pessoa. Aqui isso vale dobrado,
   porque uma investigação de concorrência é informação comercial.

   ------------------------------------------------------------
   POR QUE PLANEJAR E CONSULTAR SÃO DUAS ROTAS
   ------------------------------------------------------------
   `planejar` roteia a pergunta, resolve as referências e devolve o
   que ela É — sem chamar provedor nenhum e sem gastar um micro.
   `consultar` executa.

   Não é separação por capricho: PES-007 exige que consulta cara
   mostre o custo ANTES de disparar, e a diferença entre o nível mais
   barato e o mais caro é de cerca de cem vezes. Uma rota só
   obrigaria a tela a escolher entre gastar para descobrir o preço ou
   reimplementar o roteador em JavaScript — e aí a decisão de custo
   passaria a existir em dois lugares que divergem no primeiro ajuste.

   Efeito colateral bom: `planejar` funciona inteiro hoje, sem
   provedor configurado. A camada de roteamento é demonstrável antes
   de qualquer decisão do §8.
   ============================================================ */

import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessaoLogin from '../seguranca/sessao.js';

import { planejarConsulta, type Entidade, type Nivel } from '../pesquisa/roteador.js';
import { executavelAgora, impedimentoDe, saidasDe } from '../pesquisa/saidas.js';
import { planejarEntidades } from '../pesquisa/entidades.js';
import { decidirFoco, cabeNoTeto, classificarResultado } from '../pesquisa/sessao.js';
import {
  provedorBuscaAtual,
  provedorLugaresAtual,
  pesquisaConfigurada,
  type Afirmacao,
} from '../pesquisa/provedor.js';
/* O modelo da síntese vem de UMA função, e não de `env` lido em
   cada lugar: é ela que garante que o teto reservado e a chamada
   que gasta falem do mesmo modelo (Fase 4, 15/09/2026). */
import { modeloDaBusca } from '../pesquisa/provedor-claude-busca.js';
import {
  MAX_BUSCAS,
  MAX_LEITURAS,
  MAX_TOKENS_POR_PAGINA,
  MAX_TOKENS_SAIDA,
} from '../pesquisa/provedor-claude-busca.js';

import { env, cabecalhosCorsDeStream } from '../env.js';
import { tetoUsdMicros, tetoBuscaUsdMicros } from '../creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { registrarPesquisa, custoDe } from '../creditos/registro-pesquisa.js';

/* Fase 1a — a investigação em etapas. */
import type { ResultadoConsulta } from '@prisma/client';
import { formatarReais } from '../creditos/dinheiro.js';
import {
  montarPacoteInterno,
  pacoteParaTexto,
  categoriasDaInvestigacao,
} from '../pesquisa/contexto-interno.js';
import {
  planejarComModelo,
  FalhaDoPlanejador,
  SISTEMA_PLANEJADOR,
  MAX_TOKENS_PLANEJADOR,
  tarefaSemConteudo,
  avisoDeTarefaVazia,
} from '../pesquisa/planejador.js';
import {
  abrirInvestigacao,
  anotarPasso,
  anotarPlano,
  aguardarConfirmacao,
  retomarInvestigacao,
  fecharInvestigacao,
  investigacaoPorId,
  ultimaInvestigacaoDaTarefa,
} from '../pesquisa/investigacao.js';
import {
  afirmacoesDaConsulta,
  registrarCuradoria,
  temRascunhoPendente,
  textoCurado,
} from '../pesquisa/afirmacoes-gravadas.js';
import { formatarQuando } from '../pesquisa/quando.js';
import {
  materialDoCaderno,
  perguntarAoCaderno,
  FalhaDoCaderno,
  SISTEMA_CADERNO,
  MAX_TOKENS_CADERNO,
  rodadasGravadas,
  gravarRodada,
} from '../pesquisa/caderno.js';

/* Os limites do provedor de busca vêm DE LÁ, importados — não
   copiados. Eram duas constantes repetidas aqui (`MAX_TOKENS_SAIDA`
   e o `max_uses` da busca), e constante de custo repetida é reserva
   que diverge do que o provedor faz na primeira vez que alguém
   ajusta um dos dois lados. Quem sabe quanto a chamada pode gastar é
   quem a faz. */

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* Mesma corrente de sessão das outras rotas. Reproduzida aqui, e não
   importada, pelo mesmo motivo já registrado em `creditos.ts`,
   `projetos.ts` e `ia.ts`: nenhum módulo tem por que depender do
   outro existir. */
async function quemPede(req: FastifyRequest): Promise<string | null> {
  const acesso = req.cookies[sessaoLogin.COOKIE_ACESSO];
  if (!acesso) return null;

  const dados = await sessaoLogin.lerAcesso(acesso);
  if (!dados) return null;

  const viva = await db.sessao.findFirst({
    where: { id: dados.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  if (!viva) return null;

  return dados.usuarioId;
}

/* Carrega a sessão de pesquisa JÁ FILTRADA pelo dono. Uma sessão de
   outro usuário responde 404, não 403: quem não é dono não precisa
   nem saber que ela existe. */

/* A sessão de pesquisa já guarda `empresaId` desde que foi criada —
   o vínculo existia, ninguém o lia. Sem isto o provedor responde
   sobre a empresa como quem nunca ouviu falar dela. */
async function contextoDaSessao(empresaId: string | null) {
  if (!empresaId) return undefined;
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, descricao: true },
  });
  return empresa ? { empresa } : undefined;
}

async function sessaoDoDono(sessaoId: string, usuarioId: string) {
  return db.pesquisaSessao.findFirst({
    where: { id: sessaoId, usuarioId },
  });
}

/* O estado que o roteador precisa para resolver referência: as
   entidades da sessão e de quem a conversa está tratando. */
async function estadoDa(sessaoId: string): Promise<{ conhecidas: Entidade[]; foco?: Entidade }> {
  const entidades = await db.pesquisaEntidade.findMany({
    where: { sessaoId },
    orderBy: { criadoEm: 'asc' },
  });

  const conhecidas: Entidade[] = entidades.map((e) => ({ apelido: e.apelido, nome: e.nome }));

  const sessao = await db.pesquisaSessao.findUnique({ where: { id: sessaoId } });
  const focoLinha = sessao?.focoId ? entidades.find((e) => e.id === sessao.focoId) : undefined;

  return {
    conhecidas,
    foco: focoLinha ? { apelido: focoLinha.apelido, nome: focoLinha.nome } : undefined,
  };
}

const corpoAbrir = z.object({
  titulo: z.string().trim().min(1, 'Dê um título à investigação.').max(120),
  empresaId: z.string().uuid().optional(),
  projetoId: z.string().uuid().optional(),
  tarefaId: z.string().uuid().optional(),
  /* Teto de gasto da investigação inteira, em micros — PES-007. */
  tetoMicros: z.number().int().positive().optional(),
});

/* O que a pessoa decidiu manter. Ids, e só isso: o que ficou de
   fora se deduz do que ficou dentro — mandar as duas listas criaria
   a chance de elas se contradizerem. */
const corpoCuradoria = z.object({
  mantidas: z.array(z.string().uuid()).max(500),
});

/* A pergunta ao caderno. Curta de propósito: ela não é um documento,
   é uma frase sobre o que está na tela. */
const corpoCaderno = z.object({
  pergunta: z.string().trim().min(1, 'Escreva a pergunta.').max(500),
});

const corpoPergunta = z.object({
  pergunta: z.string().trim().min(1, 'Escreva a pergunta.').max(500),
  /* Quando a heurística não decidiu sozinha, a tela confirma o nível
     e reenvia aqui. Sem isto, `consultar` recusa em vez de escolher
     por conta própria o caminho caro. */
  nivelConfirmado: z.enum(['conhecimento', 'busca', 'lugares', 'navegacao']).optional(),
  /* Só para o nível 'lugares': de onde é "aqui". Sem coordenada não
     existe "no meu bairro". */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  raioMetros: z.number().int().positive().max(50_000).default(2_000),
  /* "Sim, eu sei que já existe uma resposta; investigue de novo."
     Sem esta confirmação, a rota recusa quando a tarefa já tem
     investigação entregue (BOARD-PESQUISA-077). */
  refazer: z.boolean().optional(),
});

export async function rotasPesquisa(app: FastifyInstance) {
  /* ---------- Abrir uma investigação ---------- */
  app.post('/pesquisa/sessoes', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const corpo = corpoAbrir.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    const criada = await db.pesquisaSessao.create({
      data: {
        usuarioId,
        titulo: corpo.data.titulo,
        empresaId: corpo.data.empresaId ?? null,
        projetoId: corpo.data.projetoId ?? null,
        tarefaId: corpo.data.tarefaId ?? null,
        tetoMicros: corpo.data.tetoMicros ?? null,
      },
    });

    return resposta.code(201).send({ id: criada.id, titulo: criada.titulo });
  });

  /* ---------- As investigações do dono ----------
     `?tarefaId=` filtra a investigação de UMA tarefa. É como o painel
     do board acha a sessão dele: uma tarefa do tipo `pesquisa` tem
     uma investigação, e ela precisa ser reencontrada a cada vez que a
     pessoa abre a tela — senão cada visita começaria do zero e o
     "concorrente 01" da semana passada não significaria mais nada. */
  app.get('/pesquisa/sessoes', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    /* `projetoId` entra como filtro porque o que uma investigacao
       descobriu — os nomes das empresas, em `pesquisa_entidades` — vale
       para o projeto inteiro, nao so para a tarefa que a abriu. Sem
       ele, quem monta a proxima tarefa nao tem como reaproveitar os
       concorrentes que uma atividade anterior ja levantou. */
    const { tarefaId, projetoId } = req.query as {
      tarefaId?: string;
      projetoId?: string;
    };

    const sessoes = await db.pesquisaSessao.findMany({
      where: {
        usuarioId,
        ...(tarefaId ? { tarefaId } : {}),
        ...(projetoId ? { projetoId } : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });

    return resposta.send({
      sessoes: sessoes.map((s) => ({
        id: s.id,
        titulo: s.titulo,
        tarefa_id: s.tarefaId,
        /* Devolvidos para quem lista sem filtro conseguir separar
           depois — antes a resposta nao dizia de que projeto era. */
        empresa_id: s.empresaId,
        projeto_id: s.projetoId,
        criado_em: s.criadoEm,
        encerrado_em: s.encerradoEm,
      })),
    });
  });

  /* ---------- Uma investigação, com o que ela já sabe ---------- */
  app.get('/pesquisa/sessoes/:sessaoId', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const [entidades, consultas] = await Promise.all([
      db.pesquisaEntidade.findMany({ where: { sessaoId }, orderBy: { criadoEm: 'asc' } }),
      db.pesquisaConsulta.findMany({
        where: { sessaoId },
        orderBy: { criadoEm: 'asc' },
        include: { fontes: true },
      }),
    ]);

    return resposta.send({
      id: sessao.id,
      titulo: sessao.titulo,
      teto_micros: sessao.tetoMicros,
      foco_id: sessao.focoId,
      entidades: entidades.map((e) => ({
        id: e.id,
        apelido: e.apelido,
        nome: e.nome,
        tipo: e.tipo,
        dados: e.dados,
      })),
      consultas: consultas.map((c) => ({
        id: c.id,
        nivel: c.nivel,
        resultado: c.resultado,
        pergunta: c.pergunta,
        decidido_sozinho: c.decididoSozinho,
        criado_em: c.criadoEm,
        fontes: c.fontes.map((f) => ({ url: f.url, titulo: f.titulo, trecho: f.trecho })),
      })),
    });
  });

  /* ---------- Planejar: o que esta pergunta É, sem gastar nada ----------
     Não chama provedor, não reserva crédito, não escreve linha
     nenhuma. É seguro chamar a cada tecla, se a tela quiser. */
  app.post('/pesquisa/sessoes/:sessaoId/planejar', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const corpo = corpoPergunta.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    /* A mesma guarda da rota em etapas: placeholder não é tarefa, e
       recusar aqui custa zero (14/09/2026). */
    if (tarefaSemConteudo(corpo.data.pergunta)) {
      return resposta.code(400).send(
        erro('pergunta', avisoDeTarefaVazia(corpo.data.pergunta)),
      );
    }

    const { conhecidas, foco } = await estadoDa(sessaoId);
    const plano = planejarConsulta(corpo.data.pergunta, conhecidas, foco);
    const configurado = pesquisaConfigurada();

    return resposta.send({
      nivel: plano.nivel,
      decidido: plano.decidido,
      pergunta_resolvida: plano.pergunta,
      citadas: plano.citadas,
      nao_resolvidas: plano.naoResolvidas,

      /* PES-003 outra vez, pelo avesso: o preço por nível ainda não
         está fechado (§8 do planejamento — depende de câmbio e da
         escolha do provedor). Devolver um número inventado aqui seria
         pior do que devolver nulo, porque a tela mostraria como se
         fosse conta feita. */
      custo_estimado_micros: null,

      /* O que ACONTECERIA se `consultar` fosse chamado agora. Deixa a
         tela avisar antes, em vez de o usuário formular a pergunta e
         tomar uma recusa que parece falha. */
      executavel: executavelAgora(plano.nivel, configurado),

      /* BOARD-PESQUISA-012: por que não roda, e o que dá para fazer
         com esta mesma tarefa. O texto mora aqui, num lugar só — a
         tela desenha, não redige. `saidas` vazio é uma afirmação de
         verdade ("não há o que oferecer"), não um esquecimento. */
      impedimento: impedimentoDe(plano.nivel, configurado),
      saidas: saidasDe(plano, configurado),
    });
  });

  /* ---------- Consultar: executa ---------- */
  app.post('/pesquisa/sessoes/:sessaoId/consultar', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const corpo = corpoPergunta.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    /* A mesma guarda da rota em etapas: placeholder não é tarefa, e
       recusar aqui custa zero (14/09/2026). */
    if (tarefaSemConteudo(corpo.data.pergunta)) {
      return resposta.code(400).send(
        erro('pergunta', avisoDeTarefaVazia(corpo.data.pergunta)),
      );
    }

    const { conhecidas, foco } = await estadoDa(sessaoId);
    const plano = planejarConsulta(corpo.data.pergunta, conhecidas, foco);

    /* ---- As recusas que não gastam nada, em ordem ----
       Todas ANTES de qualquer reserva ou chamada. E nenhuma delas
       grava consulta: "não tentei" não é a mesma coisa que "tentei e
       falhou", e encher a investigação de linhas que nunca saíram
       daqui tornaria o histórico ilegível justamente onde ele serve
       para auditar o que foi perguntado. */

    /* PES-004: referência sem dono. Mandar isto ao provedor traria
       resposta sobre qualquer um — e ela voltaria convincente. */
    if (plano.naoResolvidas.length > 0) {
      return resposta.code(400).send({
        ...erro('pergunta', `Não sei a quem "${plano.naoResolvidas[0]}" se refere nesta investigação.`),
        nao_resolvidas: plano.naoResolvidas,
      });
    }

    /* PES-007: a heurística não teve certeza e ninguém confirmou.
       Escolher sozinha aqui é escolher o custo sozinha. */
    const nivel = corpo.data.nivelConfirmado ?? plano.nivel;
    if (!plano.decidido && !corpo.data.nivelConfirmado) {
      return resposta.code(409).send({
        ...erro(null, 'Esta pergunta dá para ler de mais de um jeito, e cada um custa diferente. Escolha qual.'),
        nivel_sugerido: plano.nivel,
        /* O 409 existia desde 02/09 sem ninguém para atendê-lo: o
           cliente parava em `planejar` e nunca chegava aqui. Manda
           as saídas junto para quem atender não ter que reimplementar
           a decisão de custo do lado de lá. */
        saidas: saidasDe(plano, pesquisaConfigurada()),
      });
    }

    /* Confirmar `conhecimento` é pedir resposta de memória, sem fonte
       — exatamente o que PES-006 proíbe. Sem esta guarda o pedido
       caía no 503 logo abaixo e recebia "a pesquisa não está
       configurada", que é mentira: não falta configuração nenhuma,
       falta ser uma coisa que a gente faz. */
    if (corpo.data.nivelConfirmado === 'conhecimento') {
      return resposta.code(400).send(
        erro(
          'nivelConfirmado',
          'Responder de memória, sem fonte, é o que esta ferramenta não faz. ' +
            'Peça a busca em fontes públicas.',
        ),
      );
    }

    /* PES-005: fora da v1 por decisão de negócio, não por falta de
       tempo. Ver §3 do planejamento. */
    const configurado = pesquisaConfigurada();

    /* Os dois casos abaixo compartilham o texto com `planejar`: uma
       recusa não pode ser redigida em dois lugares, senão a pessoa
       lê uma coisa no painel e outra no erro. */
    if (nivel === 'navegacao') {
      return resposta.code(501).send({
        ...erro(null, impedimentoDe('navegacao', configurado) as string),
        saidas: saidasDe({ nivel: 'navegacao', decidido: plano.decidido }, configurado),
      });
    }

    if (!executavelAgora(nivel, configurado)) {
      return resposta.code(503).send({
        ...erro(null, impedimentoDe(nivel, configurado) as string),
        saidas: saidasDe({ nivel, decidido: plano.decidido }, configurado),
      });
    }

    if (nivel === 'lugares' && (corpo.data.latitude === undefined || corpo.data.longitude === undefined)) {
      return resposta.code(400).send(
        erro('latitude', 'Para buscar unidades por proximidade eu preciso saber de onde é "aqui".'),
      );
    }

    /* ---- Daqui para baixo, gasta ----
       O teto da sessão é conferido ANTES da chamada (PES-007), com o
       gasto já realizado somado à próxima. Enquanto a tabela de preço
       por nível não existir (§8), a estimativa é zero — o que faz o
       teto nunca barrar. É deliberado e temporário: um número chutado
       aqui barraria consulta legítima ou deixaria passar consulta
       cara, e as duas coisas são piores do que a trava do saldo, que
       continua valendo em `reserva.ts`. */
    const gastoMicros = await gastoDaSessao(sessaoId);

    /* ---- Quanto esta consulta pode custar, no pior caso ----
       A estimativa era `0`, fixa, com a observação de que a tabela
       de preço por nível ainda não existia. Consequência: o teto
       nunca barrava, a reserva nunca acontecia e nada chegava à
       razão — a pesquisa saiu gratuita e invisível no extrato,
       observado em 13/09/2026.

       Ela não precisava de tabela nova: a busca usa o MESMO
       `IA_MODELO` da Messages API, que `precos.ts` já cobre. O teto
       é a entrada estimada mais o `max_tokens` do provedor.

       O que continua de fora: a Anthropic cobra por busca encadeada
       (`web_search_requests`, até MAX_BUSCAS por pergunta) e esse
       preço não está registrado em lugar nenhum deste repositório.
       Ele fica gravado como unidade em `consumos_pesquisa`, sem
       virar dinheiro. Estimar seria pôr número inventado na razão.
       Ver `creditos-pagamentos-regras.md`, "Consumidores não
       medidos". */
    const modeloBusca = nivel === 'lugares' ? null : modeloDaBusca();
    const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);

    /* Mesmo conserto de 14/09/2026 que a rota `investigar` levou: o
       nível `busca` usa ferramenta, e numa chamada com ferramenta o
       resultado da web volta para o contexto a cada rodada. Contar
       só o prompt subestimava a entrada em quase 80 vezes. `lugares`
       não usa modelo e continua sem teto próprio. */
    const tetoUsd = modeloBusca
      ? tetoBuscaUsdMicros(
          modeloBusca,
          plano.pergunta,
          MAX_TOKENS_SAIDA,
          MAX_BUSCAS,
          MAX_LEITURAS,
          MAX_TOKENS_POR_PAGINA,
        )
      : null;
    const estimativaMicros =
      tetoUsd === null ? 0 : comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

    if (!cabeNoTeto(gastoMicros, estimativaMicros, sessao.tetoMicros)) {
      return resposta.code(402).send(
        erro(null, 'Esta investigação atingiu o teto de gasto combinado. Aumente o teto para continuar.'),
      );
    }

    /* ---- A reserva ----
       Antes da chamada, como no assistente e na síntese de tema: o
       saldo é conferido e travado pelo pior caso, e o que sobrar
       volta depois. Sem reserva, duas consultas simultâneas de quem
       tem saldo para uma só passariam as duas.

       `SaldoInsuficiente` não é erro do servidor: é resposta. O
       painel mostra 402 e a pessoa recarrega — mesmo código do teto
       da sessão logo acima, porque para quem está do outro lado as
       duas situações são a mesma ("não dá para continuar sem mexer
       em dinheiro"). */
    /* Um id por consulta, não o da sessão: é ele que liga reserva,
       liberação e consumo uns aos outros na razão. Com o id da
       sessão, duas consultas na mesma investigação produziriam seis
       lançamentos indistinguíveis, e uma liberação que falhasse não
       teria como ser encontrada. Mesmo padrão de `enriquecimento.ts`. */
    const operacaoId = randomUUID();
    let reservadoMicros = 0;
    if (estimativaMicros > 0) {
      try {
        await reservar(usuarioId, estimativaMicros, operacaoId, 'pesquisa');
        reservadoMicros = estimativaMicros;
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          return resposta.code(402).send(
            erro(null, 'Créditos insuficientes para esta consulta. Recarregue para continuar.'),
          );
        }
        throw e;
      }
    }

    /* ---- A chamada ----
       Dentro de try/catch por causa da reserva: uma exceção aqui
       (rede caindo no meio, provedor derrubando a conexão) sairia da
       rota com o saldo travado, e a pessoa perderia crédito por uma
       consulta que nunca aconteceu. O `liberar` no catch é a única
       coisa que o erro faz antes de subir. */
    let saida;
    try {
      saida =
        nivel === 'lugares'
          ? await provedorLugaresAtual().buscarPerto({
              termo: plano.pergunta,
              latitude: corpo.data.latitude!,
              longitude: corpo.data.longitude!,
              raioMetros: corpo.data.raioMetros,
            })
          : await provedorBuscaAtual().buscar(
              plano.pergunta,
              await contextoDaSessao(sessao.empresaId),
            );
    } catch (e) {
      if (reservadoMicros > 0) {
        await liberar(usuarioId, reservadoMicros, operacaoId, 'pesquisa');
      }
      throw e;
    }

    const achados = 'lugares' in saida ? saida.lugares.length : saida.resposta.trim() ? 1 : 0;
    const resultado = classificarResultado({ itens: achados, erro: saida.erro });

    /* ---- A reserva volta, o custo real sai ----
       Mesma ordem do assistente e da síntese de tema: libera o teto
       inteiro e cobra o que de fato aconteceu. Fazer só a diferença
       daria o mesmo saldo e um extrato pela metade — e a razão é o
       que se lê depois para entender para onde o dinheiro foi
       (DIN-002).

       `falhou` não cobra: a chamada não completou, e cobrar por isso
       é cobrar por nada (mesmo princípio de IA-CUSTO-003). `vazio`
       cobra: a busca rodou, o provedor cobrou de nós, e "não
       encontrei nada" é uma resposta — inclusive uma resposta útil.
       Essa segunda metade é decisão de negócio e está registrada
       como tal em `board-lista.md` (BOARD-PESQUISA-009) para ser
       confirmada. */
    const consumo = {
      usuarioId,
      sessaoId,
      nivel,
      provedor: nivel === 'lugares' ? 'lugares' : 'busca',
      resultado,
      modelo: modeloBusca,
      tokensEntrada: saida.custo?.tokensEntrada,
      tokensSaida: saida.custo?.tokensSaida,
      requisicoes: saida.custo?.requisicoes,
      buscas: saida.custo?.buscas,
    };

    if (reservadoMicros > 0) {
      await liberar(usuarioId, reservadoMicros, operacaoId, 'pesquisa');

      if (resultado !== 'falhou') {
        const real = custoDe(consumo);
        if (real && real.totalMicros > 0) {
          await consumir(usuarioId, real.totalMicros, operacaoId, 'pesquisa');
        }
      }
    }

    /* ---- A escrita, em transação ----
       Consulta, fontes, entidades novas e foco mudam JUNTOS ou não
       mudam. Mesma disciplina de `razao.lancar()`, e pelo mesmo
       motivo: uma entidade gravada sem a consulta que a descobriu é
       um concorrente sem procedência, e um foco atualizado sem a
       consulta correspondente faz o "ele" seguinte apontar para algo
       que não está no histórico. */
    const nomesChegados =
      'lugares' in saida ? saida.lugares.map((l) => l.nome) : [];
    const { novas } = planejarEntidades(nomesChegados, conhecidas);

    const gravado = await db.$transaction(async (tx) => {
      const consulta = await tx.pesquisaConsulta.create({
        data: {
          sessaoId,
          nivel,
          resultado,
          pergunta: corpo.data.pergunta,
          perguntaResolvida: plano.pergunta,
          decididoSozinho: plano.decidido,
          provedor: nivel === 'lugares' ? 'lugares' : 'busca',
        },
      });

      if ('fontes' in saida && saida.fontes.length) {
        await tx.pesquisaFonte.createMany({
          data: saida.fontes.map((f) => ({
            consultaId: consulta.id,
            url: f.url,
            titulo: f.titulo ?? null,
            trecho: f.trecho ?? null,
          })),
        });
      }

      const criadas = [];
      for (const nova of novas) {
        criadas.push(
          await tx.pesquisaEntidade.create({
            data: {
              sessaoId,
              apelido: nova.apelido,
              nome: nova.nome,
              tipo: nivel === 'lugares' ? 'unidade' : 'empresa',
              descobertaEm: consulta.id,
            },
          }),
        );
      }

      /* PES-004: de quem a conversa passa a tratar. `decidirFoco`
         devolve `null` de propósito quando não há assunto único —
         e nulo aqui é o que faz o pronome seguinte voltar como
         referência não resolvida, em vez de resolver para a empresa
         errada. */
      const focoNovo = decidirFoco(
        foco ?? null,
        { citadas: plano.citadas, descobertas: novas },
        conhecidas,
      );

      const focoLinha = focoNovo
        ? (criadas.find((c) => c.nome === focoNovo.nome) ??
           (await tx.pesquisaEntidade.findFirst({ where: { sessaoId, nome: focoNovo.nome } })))
        : null;

      await tx.pesquisaSessao.update({
        where: { id: sessaoId },
        data: { focoId: focoLinha?.id ?? null },
      });

      return { consultaId: consulta.id, entidadesNovas: criadas.length };
    });

    /* A linha de consumo sai FORA da transação e depois dela, para ter
       o `consulta_id` — é ele que liga o custo à pergunta que o
       gerou, e sem essa ligação "quanto custou esta investigação?"
       vira uma soma sem itens.

       Fora da transação também porque o registro é paralelo: se ele
       falhar, a consulta já gravada e já paga não pode ser desfeita
       por causa da contabilidade. `registrarPesquisa` não lança, pelo
       mesmo motivo que `registrar()` em `registro.ts` não lança.

       Grava SEMPRE, inclusive quando `resultado === 'falhou'` e nada
       foi cobrado: é esta linha que mostra quanto dinheiro está indo
       embora em chamadas que não deram em nada — custo que, sem ela,
       seria invisível. */
    registrarPesquisa({ ...consumo, consultaId: gravado.consultaId, operacaoId });

    return resposta.send({
      consulta_id: gravado.consultaId,
      nivel,
      resultado,
      pergunta_resolvida: plano.pergunta,
      entidades_novas: gravado.entidadesNovas,
      resposta: 'resposta' in saida ? saida.resposta : null,
      lugares: 'lugares' in saida ? saida.lugares : null,
      fontes: 'fontes' in saida ? saida.fontes : [],
      erro: saida.erro ?? null,
    });
  });

  /* ---------- A última investigação da tarefa (Fase 1b) ----------
     É a rota da recuperação. Quem recarrega a página no meio de uma
     investigação — ou volta depois de fechar a aba — reencontra por
     aqui o que aconteceu enquanto ele não estava olhando.

     Isto não é conforto. O servidor TERMINA a investigação mesmo
     sem cliente: a busca completa, é cobrada, a consulta é gravada.
     Quem sumia era só o quadro, que nasce no navegador. Sem esta
     rota, fechar a aba no meio custava o dinheiro de uma busca e
     não entregava nada — e o resultado estava no banco o tempo
     todo.

     `resposta` e `fontes` vêm da consulta, não de uma cópia: um
     segundo dono do mesmo fato divergiria em silêncio
     (BOARD-PESQUISA-002, outra vez). */
  app.get('/pesquisa/sessoes/:sessaoId/investigacao', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    if (!sessao.tarefaId) return resposta.send({ investigacao: null });

    const inv = await ultimaInvestigacaoDaTarefa(sessaoId, sessao.tarefaId);
    if (!inv) return resposta.send({ investigacao: null });

    /* Só busca a consulta quando há o que buscar. Investigação
       parada pelo planejador nunca teve consulta, e um `findUnique`
       com `null` seria uma ida ao banco para descobrir isso. */
    const consulta = inv.consultaId
      ? await db.pesquisaConsulta.findFirst({
          where: { id: inv.consultaId, sessaoId },
          include: { fontes: true },
        })
      : null;

    /* Os índices que a tela vai receber são contra ESTA ordem de
       fontes, a mesma que sai no corpo logo abaixo. Passá-la em vez
       de reconsultar é o que garante que os dois lados falem dos
       mesmos números. */
    const afirmacoesGravadas = consulta
      ? await afirmacoesDaConsulta(consulta.id, consulta.fontes.map((f) => f.id))
      : [];

    /* A conversa com o caderno (Fase 3a) volta junto: é ela que faz a
       investigação ser um lugar para voltar, e não um resultado que
       se lê uma vez. */
    const rodadas = consulta ? await rodadasGravadas(consulta.id) : [];
    const gastoTotal = await gastoDaSessao(sessaoId);

    return resposta.send({
      investigacao: {
        id: inv.id,
        estado: inv.estado,
        pergunta: inv.pergunta,
        passos: inv.passos.map((p) => p.texto),
        plano: inv.plano,
        fecho: inv.fecho,
        criado_em: inv.criadoEm,
        encerrado_em: inv.encerradoEm,
        /* O preço prometido volta junto do estado `aguardando`: quem
           reencontra o portão precisa ver o MESMO número que viu
           antes de sair. Reconferir é tarefa da rota que confirma —
           aqui só se mostra o que foi combinado. */
        estimativa_micros: inv.estimativaMicros,
        estimativa_formatada:
          inv.estimativaMicros === null ? null : formatarReais(inv.estimativaMicros),
        /* O mesmo formato do evento `fim` do stream, de propósito: a
           tela monta os quadros pelo mesmo caminho, tenha o
           resultado chegado ao vivo ou sido reencontrado depois.
           Dois caminhos para montar o mesmo quadro divergiriam no
           primeiro ajuste. */
        consulta_id: consulta ? consulta.id : null,
        resultado: consulta ? consulta.resultado : null,
        resposta: consulta ? consulta.resposta : null,
        fontes: consulta
          ? consulta.fontes.map((f) => ({ url: f.url, titulo: f.titulo, trecho: f.trecho }))
          : [],
        /* O recorte por afirmação, com a decisão de quem leu — Fase 2.
           Até 14/09/2026 isto não voltava, e a recuperação empilhava
           todas as fontes no primeiro quadro porque não tinha como
           saber onde cada uma entrava (`BOARD-PESQUISA-031`, agora
           fechada). */
        afirmacoes: afirmacoesGravadas,
        perguntas: rodadas,
        custo_micros: gastoTotal,
        custo_formatado: formatarReais(gastoTotal),
        /* Uma coisa que a tela não deve ter de deduzir: se ainda há
           uma decisão pendente sobre uma busca já paga. */
        rascunho_pendente: temRascunhoPendente(afirmacoesGravadas),
        /* Se esta investigação já esteve no board. A restauração
           automática só age quando é `false`: com `true`, board vazio
           significa que a pessoa apagou, e repor desfaria a decisão
           dela. */
        trazida_ao_board: inv.trazidaAoBoard,
      },
    });
  });

  /* ---------- "Esta investigação já está no board" ----------
     Chamada pela tela depois de restaurar os quadros — e também
     quando ela CONSTATA que já havia quadro lá e por isso não
     restaurou nada. Os dois casos dizem a mesma coisa: daqui para a
     frente, board vazio é escolha de quem apagou, não resultado
     perdido.

     Idempotente e sem corpo: é uma marca que só anda para frente, e
     um segundo `POST` não tem como significar outra coisa. Por isso
     também não desfaz — quem quiser o resultado de volta depois de
     apagar faz uma pesquisa nova, que é a regra que esta marca
     existe para sustentar. */
  app.post('/pesquisa/sessoes/:sessaoId/investigacao/trazida', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));
    if (!sessao.tarefaId) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const inv = await ultimaInvestigacaoDaTarefa(sessaoId, sessao.tarefaId);
    if (!inv) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    await db.pesquisaInvestigacao.update({
      where: { id: inv.id },
      data: { trazidaAoBoard: true },
    });

    return resposta.send({ trazida_ao_board: true });
  });

  /* ---------- Investigar: em etapas, narrando (Fase 1a) ----------
     A diferença para `consultar` não é o que ela devolve — é o que
     ela conta enquanto acontece, e o que ela lê antes de começar.

     TRÊS COISAS NOVAS
     1. Lê o que a empresa já sabe antes de ir à web
        (BOARD-PESQUISA-013/014/015), pelas duas categorias do
        assistente e com os alcances diferentes de cada uma.
     2. Troca o portão de regex por um planejador: um modelo barato
        lê a tarefa e escreve de 3 a 6 perguntas verificáveis. É o
        conserto do limite L1 — nenhuma lista fechada de
        substantivos cobre "logitechs".
     3. Narra por SSE. Cada passo é emitido DEPOIS de acontecer
        (IA-CONV-NARRA-005): não há barra de progresso porque não se
        sabe quanto falta.

     O QUE AINDA NÃO É A FASE 1 INTEIRA
     A busca continua sendo a de hoje — uma chamada ao provedor, que
     encadeia até MAX_BUSCAS internamente. O que mudou é a PERGUNTA
     que ela recebe: em vez do texto cru da tarefa, o conjunto de
     perguntas que o planejador escreveu. `web_fetch` por página e
     síntese com fonte por afirmação ficam para a 1b.

     SSE E NÃO WebSocket: é um fluxo de mão única, curto, que morre
     com a resposta. WebSocket traria reconexão, heartbeat e um
     protocolo para manter — tudo isso para não usar nada. */
  app.post('/pesquisa/sessoes/:sessaoId/investigar', async (req, resposta) => {
    /* ---- Tudo que pode virar erro HTTP normal acontece ANTES do
       stream abrir. Depois do `writeHead` não há mais código de
       status: um 402 que chegasse ali seria um `event: erro` no meio
       de um 200, e nenhum cliente trata isso direito. ---- */
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId } = req.params as { sessaoId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const corpo = corpoPergunta.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    /* A tarefa que não é tarefa (14/09/2026). Antes de tudo, e de
       graça: um campo com o convite do post-it dentro já virou duas
       investigações pagas, e o planejador preencheu o vazio com a
       ficha da empresa. Reconhecer um placeholder não precisa de
       modelo — e recusar aqui não tem como derivar. */
    if (tarefaSemConteudo(corpo.data.pergunta)) {
      return resposta.code(400).send(
        erro('pergunta', avisoDeTarefaVazia(corpo.data.pergunta)),
      );
    }

    /* ---- Já existe resposta para esta tarefa? ----
       Medido em 14/09/2026: a MESMA tarefa foi investigada duas
       vezes na mesma sessão, R$ 0,67 no total. Nada no caminho
       perguntava se já havia resposta — nem o cliente, nem a rota.

       A recuperação ao abrir a página já mostra a investigação
       anterior, mas quem clica no botão não passa por ela. E o botão
       é o caminho vivo.

       Recusa ANTES do planejador, então nem os centavos dele saem. E
       é recusa com saída, nunca beco (BOARD-PESQUISA-012): ver o que
       já existe não custa nada, e refazer continua sendo uma opção —
       a resposta pode ter envelhecido, ou ter vindo ruim. Quem decide
       é quem paga; o que não pode é decidir sem saber. */
    if (!corpo.data.refazer && sessao.tarefaId) {
      const anterior = await ultimaInvestigacaoDaTarefa(sessaoId, sessao.tarefaId);
      if (anterior && anterior.estado === 'entregue' && anterior.consultaId) {
        const quando = anterior.encerradoEm ?? anterior.criadoEm;
        return resposta.code(409).send({
          ...erro(
            null,
            `Esta tarefa já foi investigada em ${formatarQuando(quando)}. ` +
              'Ver o que já existe não custa nada; investigar de novo custa.',
          ),
          ja_investigada: {
            investigacao_id: anterior.id,
            pergunta: anterior.pergunta,
            quando,
          },
          saidas: [
            {
              nivel: 'ver-anterior',
              rotulo: 'Ver a resposta que já existe',
              explicacao: 'Não custa nada: a busca já foi feita e paga.',
            },
            {
              nivel: 'refazer',
              rotulo: 'Investigar de novo',
              explicacao: 'Uma investigação nova, do zero. Custa.',
            },
          ],
        });
      }
    }

    const configurado = pesquisaConfigurada();
    if (!configurado.busca) {
      return resposta.code(503).send({
        ...erro(null, impedimentoDe('busca', configurado) as string),
        saidas: saidasDe({ nivel: 'busca', decidido: true }, configurado),
      });
    }

    const chave = env.IA_API_KEY;
    const modeloPlanejador = env.IA_MODELO;
    if (!chave || !modeloPlanejador) {
      return resposta.code(503).send(
        erro(null, 'O planejamento da investigação ainda não está configurado nesta instalação.'),
      );
    }

    /* PES-004 continua antes de tudo: referência sem dono não vira
       investigação. O roteador segue fazendo ESTA parte — resolver
       "ele" e "essa empresa" é trabalho de texto, não de modelo, e
       trocá-lo aqui seria pagar por algo que já funciona. */
    const { conhecidas, foco } = await estadoDa(sessaoId);
    const roteado = planejarConsulta(corpo.data.pergunta, conhecidas, foco);
    if (roteado.naoResolvidas.length > 0) {
      return resposta.code(400).send({
        ...erro('pergunta', `Não sei a quem "${roteado.naoResolvidas[0]}" se refere nesta investigação.`),
        nao_resolvidas: roteado.naoResolvidas,
      });
    }

    const gastoMicros = await gastoDaSessao(sessaoId);
    const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);

    /* Teto de D2: R$ 3 por investigação, decidido pelo Ricardo em
       14/09/2026. O teto da sessão, quando existe, continua valendo
       por cima — quem apertou o próprio limite não o perde por
       causa de um padrão mais folgado. */
    const tetoDaInvestigacao = Math.min(
      TETO_INVESTIGACAO_MICROS,
      sessao.tetoMicros ?? TETO_INVESTIGACAO_MICROS,
    );
    if (gastoMicros >= tetoDaInvestigacao) {
      return resposta.code(402).send(
        erro(null, 'Esta investigação atingiu o teto de gasto. Aumente o teto para continuar.'),
      );
    }

    /* ---- Daqui para baixo é stream ---- */
    resposta.hijack();
    resposta.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      /* Proxies que bufferizam transformam um stream de etapas numa
         entrega única no fim — o que é exatamente o mesmo que não
         ter stream. */
      'x-accel-buffering': 'no',
      /* `hijack()` tira o Fastify do caminho, e com ele o
         @fastify/cors — que escreve num hook. Sem estes cabeçalhos
         o navegador descarta a resposta inteira. Ver o comentário
         em `env.ts`. */
      ...cabecalhosCorsDeStream(req.headers.origin),
    });

    const enviar = (evento: string, dados: unknown) => {
      if (resposta.raw.writableEnded) return;
      resposta.raw.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
    };

    /* O registro da corrida (Fase 1b). Aberto DEPOIS do `writeHead`
       porque nada nele pode impedir o stream de começar: se a
       gravação falhar, `abrirInvestigacao` devolve `null` e tudo
       daqui para baixo vira no-op — a investigação acontece igual,
       só não poderá ser recuperada depois. */
    const invId = await abrirInvestigacao({
      sessaoId,
      tarefaId: sessao.tarefaId,
      pergunta: corpo.data.pergunta,
      perguntaResolvida: roteado.pergunta,
    });
    enviar('aberta', { investigacao_id: invId });

    /* Um passo é emitido E gravado. Emitir sem gravar deixaria quem
       recarrega sem o histórico do que já aconteceu; gravar sem
       emitir seria um registro que ninguém vê acontecer. */
    const passo = (texto: string) => {
      enviar('passo', { texto });
      anotarPasso(invId, texto);
    };

    try {
      /* ---- 1. O que a empresa já sabe ---- */
      const pacote = await pacoteInternoDa(sessao);
      passo(
        pacote.validada.length
          ? `Li o que a empresa já sabe: ${pacote.validada.length} trecho(s) validado(s)` +
              (pacote.categorias.length ? ` em ${pacote.categorias.length} categoria(s)` : '') +
              (pacote.consulta.length ? `, e ${pacote.consulta.length} hipótese(s) em andamento` : '') +
              '.'
          : 'A empresa ainda não tem conhecimento finalizado para esta categoria — vou da estaca zero.',
      );
      if (pacote.cortouPorTeto) {
        /* Uma investigação que leu metade do que existe não pode
           parecer que leu tudo. */
        passo(`${pacote.cortados} trecho(s) ficaram de fora por limite de tamanho.`);
      }

      /* ---- 2. Planejar ---- */
      const contexto = pacoteParaTexto(pacote);
      const tetoPlanoUsd = tetoUsdMicros(
        modeloPlanejador,
        SISTEMA_PLANEJADOR + contexto + roteado.pergunta,
        MAX_TOKENS_PLANEJADOR,
      );
      const estimativaPlano =
        tetoPlanoUsd === null ? 0 : comissaoSobre(usdParaMicrosBrl(tetoPlanoUsd, cotacao)).totalMicros;

      const operacaoPlano = randomUUID();
      let reservadoPlano = 0;
      if (estimativaPlano > 0) {
        try {
          await reservar(usuarioId, estimativaPlano, operacaoPlano, 'pesquisa');
          reservadoPlano = estimativaPlano;
        } catch (e) {
          if (e instanceof SaldoInsuficiente) {
            const falta = 'Créditos insuficientes para esta investigação. Recarregue para continuar.';
            enviar('erro', { mensagem: falta, status: 402 });
            await fecharInvestigacao(invId, { estado: 'falhou', fecho: falta });
            return resposta.raw.end();
          }
          throw e;
        }
      }

      let saidaPlano;
      try {
        saidaPlano = await planejarComModelo({
          tarefa: roteado.pergunta,
          contexto,
          chave,
          modelo: modeloPlanejador,
        });
      } finally {
        if (reservadoPlano > 0) await liberar(usuarioId, reservadoPlano, operacaoPlano, 'pesquisa');
      }

      /* O planejamento aconteceu e é cobrado, tenha ele decidido
         buscar ou não: o modelo rodou e a Anthropic cobrou de nós.
         `nivel: 'conhecimento'` é literal aqui — o enum o define como
         "não sai chamada para fora", que é exatamente o caso: o
         planejador raciocina, não busca. */
      const consumoPlano = {
        usuarioId,
        sessaoId,
        nivel: 'conhecimento' as const,
        provedor: 'claude-planejador',
        /* `entregue` porque o planejamento entregou: as perguntas
           existem. O enum é de RESULTADO da chamada, não de achado
           na web — planejar nem vai à web. */
        resultado: 'entregue' as const,
        modelo: saidaPlano.modelo,
        tokensEntrada: saidaPlano.uso.entrada,
        tokensSaida: saidaPlano.uso.saida,
        requisicoes: 1,
      };
      const custoPlano = custoDe(consumoPlano);
      if (custoPlano) {
        await consumir(usuarioId, custoPlano.totalMicros, operacaoPlano, 'pesquisa');
      }
      registrarPesquisa({ ...consumoPlano, operacaoId: operacaoPlano });

      if (saidaPlano.plano.jaSabido.length) {
        /* A prova visível de que ler o conhecimento interno economiza
           busca. Sem isto, o ganho existe e ninguém vê. */
        passo(
          `Não vou perguntar ${saidaPlano.plano.jaSabido.length} coisa(s) que a empresa já validou.`,
        );
      }

      /* O planejador pode recusar — e a recusa dele é lida, não por
         palavra-chave. Mas BOARD-PESQUISA-012 vale igual: trocar um
         portão burro por um portão esperto ainda seria um portão. */
      if (!saidaPlano.plano.perguntas.length) {
        const motivo = saidaPlano.plano.naoDaParaBuscar ?? 'Não encontrei nada verificável nesta tarefa.';
        enviar('parado', {
          mensagem: motivo,
          saidas: saidasDe({ nivel: 'conhecimento', decidido: true }, configurado),
        });
        await fecharInvestigacao(invId, { estado: 'parada', fecho: motivo });
        return resposta.raw.end();
      }

      passo(`Escrevi ${saidaPlano.plano.perguntas.length} pergunta(s) verificável(is).`);

      /* ---- 3. O plano, ANTES de gastar com busca (PES-007) ---- */
      const perguntaDaBusca = textoDaBusca(roteado.pergunta, saidaPlano.plano.perguntas);
      /* `tetoBuscaUsdMicros`, e não `tetoUsdMicros`: numa busca com
         ferramenta o resultado da web volta para o contexto, e o
         contexto inteiro é reenviado a cada rodada. Contar só o
         prompt errava por quase 80 vezes (medido em 14/09/2026) — a
         reserva não reservava, o teto de R$ 3 não segurava, e era
         esse número que aparecia para a pessoa como "custo
         estimado", que é justamente o que PES-007 quer que seja
         verdade. */
      /* O modelo da BUSCA, não o do planejador: desde 15/09/2026 os
         dois podem ser diferentes, e reservar pelo preço do modelo
         errado é a mesma mentira de 14/09, só que mais difícil de
         ver. `modeloDaBusca()` é a mesma fonte que constrói o
         provedor. */
      const tetoBuscaUsd = tetoBuscaUsdMicros(
        modeloDaBusca() ?? modeloPlanejador,
        perguntaDaBusca,
        MAX_TOKENS_SAIDA,
        MAX_BUSCAS,
        MAX_LEITURAS,
        MAX_TOKENS_POR_PAGINA,
      );
      /* Sem preço, o portão não tem número para mostrar — e sem
         número não há escolha a confirmar (PES-007). Parar aqui é
         melhor do que abrir um portão que diz "até R$ 0,00" e
         entregar uma busca que ninguém consegue cobrar. */
      if (tetoBuscaUsd === null) {
        const semPreco = `Não sei o preço do modelo “${modeloDaBusca() ?? modeloPlanejador}” — não vou buscar sem saber cobrar.`;
        enviar('erro', { mensagem: semPreco, status: 503 });
        await fecharInvestigacao(invId, { estado: 'falhou', fecho: semPreco });
        return resposta.raw.end();
      }
      const estimativaBusca = comissaoSobre(usdParaMicrosBrl(tetoBuscaUsd, cotacao)).totalMicros;

      anotarPlano(invId, {
        perguntas: saidaPlano.plano.perguntas,
        ja_sabido: saidaPlano.plano.jaSabido,
      });

      enviar('plano', {
        perguntas: saidaPlano.plano.perguntas,
        ja_sabido: saidaPlano.plano.jaSabido,
        /* O total que sairia do saldo, comissão dentro e sem
           desmembrar (DIN-007). O planejamento já saiu; o que se
           mostra aqui é o que ainda pode sair. */
        estimativa_micros: estimativaBusca,
        estimativa_formatada: formatarReais(estimativaBusca),
      });

      /* ---- 4. O portão (BOARD-PESQUISA-037) ----
         A investigação PARA aqui. O plano e o preço já foram ditos;
         o que falta é alguém dizer que sim.

         Até 14/09/2026 este ponto era um comentário admitindo que a
         estimativa era informação, não escolha: ela aparecia e a
         busca seguia sozinha. Mostrar um preço e cobrar em seguida
         sem perguntar é o contrário do que PES-007 existe para
         fazer.

         O stream TERMINA aqui, em vez de segurar o socket esperando
         um clique. Conexão pendurada morre em proxy, em laptop que
         dorme e em reinício de servidor — e um portão que morre com
         a conexão é um aviso com prazo, não uma escolha. Com o plano
         gravado, a confirmação sobrevive a fechar a aba: reabrir a
         tarefa reencontra a investigação em `aguardando` e oferece
         o mesmo preço. */
      await aguardarConfirmacao(invId, {
        perguntaBusca: perguntaDaBusca,
        estimativaMicros: estimativaBusca,
      });

      enviar('aguardando', {
        investigacao_id: invId,
        perguntas: saidaPlano.plano.perguntas,
        estimativa_micros: estimativaBusca,
        estimativa_formatada: formatarReais(estimativaBusca),
      });
      resposta.raw.end();
    } catch (e) {
      /* Erro depois do stream aberto não tem código de status para
         onde ir. Vira evento — e o cliente trata como falha da
         investigação, não como "não aconteceu nada". */
      const mensagem =
        e instanceof FalhaDoPlanejador
          ? e.message
          : 'A investigação não completou.';
      req.log?.error?.({ err: e }, 'investigar falhou');
      enviar('erro', { mensagem, status: 500 });
      await fecharInvestigacao(invId, { estado: 'falhou', fecho: mensagem });
      resposta.raw.end();
    }
  });

  /* ============================================================
     A confirmação do gasto (Fase 2 — BOARD-PESQUISA-037)
     ============================================================
     A segunda metade de `investigar`. A primeira planeja e cota;
     esta busca — e só existe porque alguém clicou.

     POR QUE UMA ROTA, E NÃO UMA ESPERA DENTRO DO STREAM
     Porque a espera é de gente. Segurar o socket aberto até o clique
     amarraria a escolha à conexão: proxy que corta por inatividade,
     laptop que dorme e servidor que reinicia matariam o plano — que
     já foi PAGO — sem ninguém ter decidido nada. Com o plano
     gravado, a confirmação pode chegar cinco segundos ou um dia
     depois, da mesma aba ou de outra.

     O QUE ESTA ROTA NÃO REFAZ
     Não replaneja. As perguntas já existem, já foram cobradas e já
     foram mostradas — replanejar cobraria de novo pelo mesmo
     trabalho e, pior, poderia buscar algo diferente do que a pessoa
     aprovou.
     ============================================================ */
  app.post('/pesquisa/sessoes/:sessaoId/investigar/:invId/buscar', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId, invId } = req.params as { sessaoId: string; invId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const inv = await investigacaoPorId(invId, sessaoId);
    if (!inv) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    /* Confirmar duas vezes é um clique duplo, uma aba antiga, um
       botão de voltar. Nenhum deles pode virar duas buscas pagas.
       O estado é o guarda: só `aguardando` pode ser confirmado, e
       confirmar tira desse estado ANTES de qualquer gasto. */
    if (inv.estado !== 'aguardando') {
      return resposta.code(409).send({
        ...erro(null, 'Esta investigação já saiu da espera — nada foi cobrado duas vezes.'),
        estado: inv.estado,
      });
    }
    if (!inv.perguntaBusca || !inv.plano?.perguntas.length) {
      return resposta.code(409).send(
        erro(null, 'O plano desta investigação não ficou completo. Comece de novo.'),
      );
    }

    const configurado = pesquisaConfigurada();
    if (!configurado.busca) {
      return resposta.code(503).send({
        ...erro(null, impedimentoDe('busca', configurado) as string),
        saidas: saidasDe({ nivel: 'busca', decidido: true }, configurado),
      });
    }

    const modeloBusca = modeloDaBusca();
    if (!modeloBusca) {
      return resposta.code(503).send(erro(null, 'A busca não está configurada nesta instalação.'));
    }

    const gastoMicros = await gastoDaSessao(sessaoId);
    const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
    const tetoDaInvestigacao = Math.min(
      TETO_INVESTIGACAO_MICROS,
      sessao.tetoMicros ?? TETO_INVESTIGACAO_MICROS,
    );
    if (gastoMicros >= tetoDaInvestigacao) {
      return resposta.code(402).send(
        erro(null, 'Esta investigação atingiu o teto de gasto. Aumente o teto para continuar.'),
      );
    }

    /* ---- O preço, reconferido ----
       A cotação do dólar anda, e entre cotar e confirmar pode ter
       passado um dia. O que foi PROMETIDO é `inv.estimativaMicros`;
       o que vale agora é este cálculo.

       Mais barato: cobra-se o mais barato, sem alarde.
       Mais caro: não se cobra a diferença calado. O plano volta com
       o preço novo e o portão fecha de novo — porque um preço
       confirmado que muda sozinho não era um preço, era um palpite
       (PES-007). */
    const tetoBuscaUsd = tetoBuscaUsdMicros(
      modeloBusca,
      inv.perguntaBusca,
      MAX_TOKENS_SAIDA,
      MAX_BUSCAS,
      MAX_LEITURAS,
      MAX_TOKENS_POR_PAGINA,
    );
    /* Modelo sem preço na tabela = investigação GRÁTIS para quem
       pede e paga pela plataforma: sem preço não há teto, sem teto
       não há reserva, e `custoDe` também devolve `null` no fim, então
       nem o consumo é lançado. As buscas (US$ 0,01 cada) somem junto.
       É a mesma família de "consumidor não medido" que `DIN-009`
       fechou em 14/09/2026 — e um `IA_MODELO_BUSCA` com erro de
       digitação passou a ser um jeito fácil de cair nela.

       Recusar é o certo: não dá para cobrar o que não se sabe
       precificar, e regalar busca em silêncio é pior do que parar. */
    if (tetoBuscaUsd === null) {
      return resposta.code(503).send(
        erro(null, `Não sei o preço do modelo “${modeloBusca}” — não vou buscar sem saber cobrar.`),
      );
    }
    const agora = comissaoSobre(usdParaMicrosBrl(tetoBuscaUsd, cotacao)).totalMicros;
    const prometido = inv.estimativaMicros ?? agora;
    const estimativaBusca = Math.min(agora, prometido);

    /* ---- Daqui para baixo é stream ---- */
    resposta.hijack();
    resposta.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      /* Mesmo motivo da rota de investigar: hijack passa por cima
         do @fastify/cors. */
      ...cabecalhosCorsDeStream(req.headers.origin),
    });

    const enviar = (evento: string, dados: unknown) => {
      if (resposta.raw.writableEnded) return;
      resposta.raw.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
    };
    const passo = (texto: string) => {
      enviar('passo', { texto });
      anotarPasso(invId, texto);
    };

    enviar('aberta', { investigacao_id: invId });

    if (agora > prometido) {
      /* Continua `aguardando`: a espera não acabou, só o número
         mudou. O gasto segue trancado atrás de um gesto. */
      await aguardarConfirmacao(invId, {
        perguntaBusca: inv.perguntaBusca,
        estimativaMicros: agora,
      });
      passo('O preço mudou desde o plano — confira antes de eu buscar.');
      enviar('aguardando', {
        investigacao_id: invId,
        perguntas: inv.plano.perguntas,
        estimativa_micros: agora,
        estimativa_formatada: formatarReais(agora),
        mudou: true,
      });
      return resposta.raw.end();
    }

    /* O gesto aconteceu: sai da espera ANTES de gastar. Se o
       servidor cair no meio da busca, a investigação fica em
       `correndo` e ninguém consegue confirmá-la de novo — que é o
       lado certo para errar. */
    await retomarInvestigacao(invId, estimativaBusca);

    try {
      /* O roteador de novo, sobre a pergunta original. Não é
         desperdício nem risco de divergir: resolver "ele" e "essa
         empresa" é trabalho de texto puro, determinístico e de graça
         — e o que vai à web é `inv.perguntaBusca`, gravado, não o
         que sair daqui. Isto serve para `citadas`/`conhecidas`, que
         a gravação da consulta pede. */
      const { conhecidas, foco } = await estadoDa(sessaoId);
      const roteado = planejarConsulta(inv.pergunta, conhecidas, foco);

      const operacaoBusca = randomUUID();
      let reservadoBusca = 0;
      if (estimativaBusca > 0) {
        try {
          await reservar(usuarioId, estimativaBusca, operacaoBusca, 'pesquisa');
          reservadoBusca = estimativaBusca;
        } catch (e) {
          if (e instanceof SaldoInsuficiente) {
            const falta = 'Créditos insuficientes para a busca. Recarregue para continuar.';
            enviar('erro', { mensagem: falta, status: 402 });
            /* Volta para a espera, não para o fracasso: o plano
               continua bom e recarregar créditos é a saída. Fechar
               como `falhou` jogaria fora um planejamento pago por
               causa de um saldo que a pessoa resolve em dois
               minutos. */
            await aguardarConfirmacao(invId, {
              perguntaBusca: inv.perguntaBusca!,
              estimativaMicros: estimativaBusca,
            });
            return resposta.raw.end();
          }
          throw e;
        }
      }

      passo('Buscando na web.');

      let saida;
      try {
        saida = await provedorBuscaAtual().buscar(
          inv.perguntaBusca,
          await contextoDaSessao(sessao.empresaId),
        );
      } finally {
        if (reservadoBusca > 0) await liberar(usuarioId, reservadoBusca, operacaoBusca, 'pesquisa');
      }

      const achados = saida.resposta.trim() ? 1 : 0;
      const resultado = classificarResultado({ itens: achados, erro: saida.erro });

      const consumoBusca = {
        usuarioId,
        sessaoId,
        nivel: 'busca' as const,
        provedor: 'investigar',
        resultado,
        modelo: modeloBusca,
        tokensEntrada: saida.custo?.tokensEntrada,
        tokensSaida: saida.custo?.tokensSaida,
        requisicoes: saida.custo?.requisicoes,
        buscas: saida.custo?.buscas,
      };
      /* `falhou` não cobra — a chamada não completou. `vazio` cobra:
         a busca rodou e o provedor cobrou de nós (BOARD-PESQUISA-010). */
      const custoBusca = custoDe(consumoBusca);
      if (custoBusca && custoBusca.totalMicros > 0 && resultado !== 'falhou') {
        await consumir(usuarioId, custoBusca.totalMicros, operacaoBusca, 'pesquisa');
      }

      const afirmacoes = saida.afirmacoes ?? [];

      const gravado = await gravarInvestigacao({
        sessaoId,
        perguntaOriginal: inv.pergunta,
        perguntaResolvida: inv.perguntaBusca,
        resultado,
        resposta: saida.resposta,
        fontes: saida.fontes ?? [],
        afirmacoes,
        citadas: roteado.citadas,
        conhecidas,
        foco,
      });
      registrarPesquisa({ ...consumoBusca, consultaId: gravado.consultaId, operacaoId: operacaoBusca });

      const leituras = saida.custo?.leituras ?? 0;
      passo(
        [
          saida.custo?.buscas ? `Busquei ${saida.custo.buscas} vez(es)` : 'Busquei',
          leituras ? `li ${leituras} página(s) inteira(s)` : null,
          saida.fontes?.length ? `${saida.fontes.length} fonte(s)` : 'sem fonte declarada',
        ]
          .filter(Boolean)
          .join(' · ') + '.',
      );

      /* PES-006 na narração: afirmação sem fonte é DITA, não
         escondida. O número nu é mais honesto que um adjetivo. */
      if (afirmacoes.length) {
        const semFonte = afirmacoes.filter((a) => a.semFonte).length;
        passo(
          semFonte
            ? `${afirmacoes.length} afirmação(ões), ${semFonte} sem fonte.`
            : `${afirmacoes.length} afirmação(ões), todas com fonte.`,
        );
      }

      await fecharInvestigacao(invId, {
        estado: 'entregue',
        fecho: 'Pronto.',
        consultaId: gravado.consultaId,
      });

      /* O que esta investigação custou, somado — o número que sai do
         saldo, com a comissão dentro e sem desmembrar (`DIN-007`).
         Vai junto porque é ele que o relatório precisa para a
         investigação poder ser defendida internamente: uma conclusão
         sem preço não deixa ninguém julgar se valeu. */
      const gastoTotal = await gastoDaSessao(sessaoId);

      enviar('fim', {
        investigacao_id: invId,
        consulta_id: gravado.consultaId,
        resultado,
        resposta: saida.resposta,
        fontes: saida.fontes ?? [],
        /* Cada uma com o id da linha gravada: é por ele que o
           rascunho devolve a decisão (`BOARD-PESQUISA-043`). */
        afirmacoes: afirmacoes.map((a, i) => ({ ...a, id: gravado.idsAfirmacoes[i] ?? null })),
        perguntas: inv.plano.perguntas,
        custo_micros: gastoTotal,
        custo_formatado: formatarReais(gastoTotal),
        erro: saida.erro ?? null,
      });
      resposta.raw.end();
    } catch (e) {
      const mensagem = 'A busca não completou.';
      req.log?.error?.({ err: e }, 'investigar/buscar falhou');
      enviar('erro', { mensagem, status: 500 });
      await fecharInvestigacao(invId, { estado: 'falhou', fecho: mensagem });
      resposta.raw.end();
    }
  });

  /* ============================================================
     A curadoria gravada (Fase 2 — BOARD-PESQUISA-043)
     ============================================================
     O que ficou e o que saiu do rascunho. Uma rota, um gesto.

     POR QUE O SERVIDOR PRECISA SABER
     Enquanto o rascunho vivia só no navegador, a decisão da pessoa
     morria com a aba: voltava-se para uma lista em que ninguém tinha
     decidido nada, sobre uma busca já paga. Gravar é o que permite
     reabrir no ponto em que parou — e é também a primeira vez que dá
     para MEDIR quanto se apaga, que é a conta que a decisão D1 deixou
     em aberto ("o atalho de salvar direto só se desenha depois de
     medir").

     O QUE ELA NÃO FAZ
     Não monta quadro. O quadro nasce no navegador, por gesto
     explícito (`BOARD-PESQUISA-003`), e continua assim. Esta rota
     grava a decisão; desenhar é da tela.
     ============================================================ */
  app.post('/pesquisa/sessoes/:sessaoId/consultas/:consultaId/curadoria', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId, consultaId } = req.params as { sessaoId: string; consultaId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const corpo = corpoCuradoria.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    /* A consulta tem de ser DESTA sessão. Sem isto, um id adivinhado
       marcaria o rascunho de outra pessoa como descartado. */
    const consulta = await db.pesquisaConsulta.findFirst({
      where: { id: consultaId, sessaoId },
      select: { id: true },
    });
    if (!consulta) return resposta.code(404).send(erro(null, 'Consulta não encontrada.'));

    const conta = await registrarCuradoria(consultaId, corpo.data.mantidas);
    return resposta.send({ ficaram: conta.ficaram, sairam: conta.sairam });
  });

  /* ============================================================
     Perguntar ao caderno (Fase 3a — BOARD-PESQUISA-047)
     ============================================================
     A pergunta de acompanhamento, respondida só com o que esta
     investigação já coletou.

     NÃO TEM PORTÃO, e isso é decisão (Ricardo, 14/09/2026). O portão
     existe para a busca, que custa dezenas de vezes mais; confirmar
     cada pergunta de acompanhamento mataria a conversa que esta rota
     existe para permitir. O gasto aparece depois, na própria
     resposta, e o teto de R$ 3 da investigação continua valendo por
     cima — é ele que impede uma conversa longa de virar gasto sem
     ninguém notar.
     ============================================================ */
  app.post('/pesquisa/sessoes/:sessaoId/consultas/:consultaId/perguntar', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const { sessaoId, consultaId } = req.params as { sessaoId: string; consultaId: string };
    const sessao = await sessaoDoDono(sessaoId, usuarioId);
    if (!sessao) return resposta.code(404).send(erro(null, 'Investigação não encontrada.'));

    const corpo = corpoCaderno.safeParse(req.body);
    if (!corpo.success) {
      const i = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(i.path[0] ?? ''), i.message));
    }

    const chave = env.IA_API_KEY;
    const modelo = env.IA_MODELO;
    if (!chave || !modelo) {
      return resposta.code(503).send(erro(null, 'O assistente não está configurado nesta instalação.'));
    }

    const consulta = await db.pesquisaConsulta.findFirst({
      where: { id: consultaId, sessaoId },
      include: { fontes: true },
    });
    if (!consulta) return resposta.code(404).send(erro(null, 'Consulta não encontrada.'));

    /* Sem material não há caderno. Recusar é melhor do que perguntar
       ao modelo sobre o nada e cobrar por uma resposta que só pode
       ser "não sei". */
    if (!consulta.resposta) {
      return resposta.code(409).send(
        erro(null, 'Esta investigação não tem resultado guardado para consultar.'),
      );
    }

    /* O teto da investigação vale aqui também. Sem isto, a conversa
       seria o caminho por onde o gasto escapa do limite que a busca
       respeita. */
    const gastoMicros = await gastoDaSessao(sessaoId);
    const tetoDaInvestigacao = Math.min(
      TETO_INVESTIGACAO_MICROS,
      sessao.tetoMicros ?? TETO_INVESTIGACAO_MICROS,
    );
    if (gastoMicros >= tetoDaInvestigacao) {
      return resposta.code(402).send(
        erro(null, 'Esta investigação atingiu o teto de gasto. Aumente o teto para continuar perguntando.'),
      );
    }

    const afirmacoes = await afirmacoesDaConsulta(consultaId, consulta.fontes.map((f) => f.id));
    const material = materialDoCaderno({
      pergunta: consulta.pergunta,
      fontes: consulta.fontes.map((f) => ({ titulo: f.titulo, url: f.url, trecho: f.trecho })),
      texto: textoCurado(consulta.resposta, afirmacoes),
    });

    const anteriores = await rodadasGravadas(consultaId);

    const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
    const tetoUsd = tetoUsdMicros(
      modelo,
      SISTEMA_CADERNO + material.texto + anteriores.map((a) => a.pergunta + a.resposta).join('') + corpo.data.pergunta,
      MAX_TOKENS_CADERNO,
    );
    const estimativa = tetoUsd === null ? 0 : comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

    const operacao = randomUUID();
    let reservado = 0;
    if (estimativa > 0) {
      try {
        await reservar(usuarioId, estimativa, operacao, 'pesquisa');
        reservado = estimativa;
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          return resposta.code(402).send(
            erro(null, 'Créditos insuficientes para perguntar. Recarregue para continuar.'),
          );
        }
        throw e;
      }
    }

    let saida;
    try {
      saida = await perguntarAoCaderno({
        pergunta: corpo.data.pergunta,
        material: material.texto,
        anteriores,
        chave,
        modelo,
      });
    } catch (e) {
      if (reservado > 0) await liberar(usuarioId, reservado, operacao, 'pesquisa');
      const mensagem =
        e instanceof FalhaDoCaderno ? e.message : 'Não consegui responder com as fontes desta investigação.';
      req.log?.error?.({ err: e }, 'perguntar ao caderno falhou');
      return resposta.code(502).send(erro(null, mensagem));
    }
    if (reservado > 0) await liberar(usuarioId, reservado, operacao, 'pesquisa');

    /* `nivel: 'conhecimento'` é literal: nenhuma chamada saiu para
       fora além do modelo. O caderno raciocina sobre o que já foi
       comprado — não compra nada. */
    const consumo = {
      usuarioId,
      sessaoId,
      nivel: 'conhecimento' as const,
      provedor: 'caderno',
      resultado: 'entregue' as const,
      modelo: saida.modelo,
      tokensEntrada: saida.uso.entrada,
      tokensSaida: saida.uso.saida,
      requisicoes: 1,
      consultaId,
    };
    const custo = custoDe(consumo);
    if (custo && custo.totalMicros > 0) {
      await consumir(usuarioId, custo.totalMicros, operacao, 'pesquisa');
    }
    registrarPesquisa({ ...consumo, operacaoId: operacao });

    /* A conversa persiste — é o que faz o caderno ser um lugar para
       voltar, e não uma pergunta que morre com a aba. Falhar aqui não
       pode engolir a resposta que a pessoa já pagou. */
    await gravarRodada(consultaId, corpo.data.pergunta, saida.resposta);

    return resposta.send({
      resposta: saida.resposta,
      /* O custo narrado, já com a comissão dentro e sem desmembrar
         (`DIN-007`). Aparece DEPOIS, porque aqui não há escolha a
         fazer antes — a decisão de Ricardo em 14/09/2026. */
      custo_micros: custo?.totalMicros ?? 0,
      custo_formatado: formatarReais(custo?.totalMicros ?? 0),
      /* Material cortado é dito. Uma resposta que leu metade do
         caderno não pode parecer que leu tudo. */
      material_cortado: material.cortou,
    });
  });
}

/* `executavelAgora`, `impedimentoDe` e `saidasDe` moraram aqui por
   algumas horas e saíram para `../pesquisa/saidas.js`. O motivo é
   testabilidade: aqui dentro elas só podiam ser exercitadas subindo
   o app inteiro com banco, e a regra que elas implementam
   (BOARD-PESQUISA-012 — nenhum nível é beco sem saída) é exatamente
   o tipo de coisa que precisa de teste barato para não apodrecer.
   Ver `testes/saidas.test.ts`. */


/* ============================================================
   Apoio da rota `investigar` (Fase 1a)
   ============================================================ */

/* D2, decidido pelo Ricardo em 14/09/2026: R$ 3 por investigação.
   É teto de INVESTIGAÇÃO, não de consulta — a Fase 1 gasta em duas
   etapas (planejar e buscar) e vai gastar em mais na 1b; um teto
   por chamada não diria nada sobre o total. */
const TETO_INVESTIGACAO_MICROS = 3_000_000;

/* ------------------------------------------------------------
   O contexto interno, lido do banco
   ------------------------------------------------------------
   A decisão de O QUE entra está em `pesquisa/contexto-interno.ts`,
   que é puro e testado. Aqui só se busca o que aquele módulo pede,
   com os dois alcances de BOARD-PESQUISA-015 traduzidos em duas
   consultas diferentes:

   · recortes de idéias FINALIZADAS da EMPRESA inteira
   · idéias ATIVAS não finalizadas do PROJETO da tarefa

   Idéia arquivada não entra em nenhuma das duas (IA-CONHEC-004):
   `arquivadoEm: null` nas duas consultas. */
async function pacoteInternoDa(sessao: {
  empresaId: string | null;
  projetoId: string | null;
  tarefaId: string | null;
}) {
  const empresa = sessao.empresaId
    ? await db.empresa.findUnique({
        where: { id: sessao.empresaId },
        select: { nome: true, descricao: true },
      })
    : null;

  /* A categoria da idéia que contém a tarefa é o centro de D7. Sem
     tarefa, ou com idéia ainda não classificada, o pacote vem sem
     recorte por tema — e isso é tratado, não é erro. */
  const tarefa = sessao.tarefaId
    ? await db.tarefa.findUnique({
        where: { id: sessao.tarefaId },
        select: { ideia: { select: { assunto: true } } },
      })
    : null;
  const categoriaDaIdeia = tarefa?.ideia?.assunto ?? null;

  const categorias = categoriasDaInvestigacao(categoriaDaIdeia);

  const recortes =
    sessao.empresaId && categorias.length
      ? await db.recorteTaxonomia.findMany({
          where: {
            categoria: { in: categorias },
            ideia: {
              status: 'finalizado',
              arquivadoEm: null,
              projeto: { empresaId: sessao.empresaId },
            },
          },
          select: {
            categoria: true,
            texto: true,
            ideiaId: true,
            ideia: { select: { titulo: true } },
          },
          /* Teto generoso na consulta e corte fino no módulo puro: o
             banco não sabe contar tokens, e trazer de menos aqui
             tornaria o corte de D7 dependente da ordem do banco. */
          take: 400,
        })
      : [];

  const ativas = sessao.projetoId
    ? await db.ideia.findMany({
        where: {
          projetoId: sessao.projetoId,
          status: { in: ['ideias', 'andamento'] },
          arquivadoEm: null,
        },
        select: { id: true, titulo: true, descricao: true, status: true },
        orderBy: { criadoEm: 'asc' },
        take: 40,
      })
    : [];

  return montarPacoteInterno({
    empresa: empresa ?? { nome: 'Empresa', descricao: null },
    categoriaDaIdeia,
    recortes: recortes.map((r) => ({
      categoria: r.categoria,
      texto: r.texto,
      ideiaId: r.ideiaId,
      ideiaTitulo: r.ideia.titulo,
    })),
    ativas: ativas.map((i) => ({
      id: i.id,
      titulo: i.titulo,
      descricao: i.descricao,
      status: i.status as 'ideias' | 'andamento',
    })),
  });
}

/* ------------------------------------------------------------
   A pergunta que vai ao provedor
   ------------------------------------------------------------
   Na Fase 1a a busca continua sendo UMA chamada — o provedor
   encadeia até MAX_BUSCAS internamente. O que mudou é o que ele
   recebe: em vez do texto cru da tarefa, a tarefa mais as perguntas
   que o planejador escreveu.

   A tarefa original fica junto de propósito. As perguntas são
   derivadas dela, e mandar só as derivadas perderia o enquadramento
   — "Quais marcas vendem periféricos no Brasil?" sozinha não diz
   que quem pergunta é um concorrente querendo se comparar. */
function textoDaBusca(tarefa: string, perguntas: { pergunta: string }[]): string {
  return (
    `${tarefa}\n\nResponda, com fonte, cada uma destas perguntas:\n` +
    perguntas.map((p, i) => `${i + 1}. ${p.pergunta}`).join('\n')
  );
}

/* ------------------------------------------------------------
   A escrita
   ------------------------------------------------------------
   Mesma disciplina de `consultar`: consulta, fontes e foco mudam
   juntos ou não mudam. Mais enxuta porque a investigação nunca
   devolve lugares — logo não há entidade nova vinda de nome de
   unidade, só o foco que as citações da pergunta determinam. */
async function gravarInvestigacao(entrada: {
  sessaoId: string;
  perguntaOriginal: string;
  perguntaResolvida: string;
  resultado: ResultadoConsulta;
  /* O texto do provedor. Guardado para a investigação poder ser
     recuperada depois de a aba fechar — ver a coluna `resposta` em
     `schema.prisma`. */
  resposta: string;
  fontes: { url: string; titulo?: string; trecho?: string }[];
  /* As frases, com a fonte que sustenta cada uma. Gravadas aqui e
     não depois: quem fecha a aba entre a busca e o rascunho já
     pagou pela busca, e o recorte por afirmação é o que a torna
     curável quando ela voltar (BOARD-PESQUISA-042). */
  afirmacoes: Afirmacao[];
  citadas: string[];
  conhecidas: Entidade[];
  foco?: Entidade;
  /* Os ids das afirmações voltam na MESMA ordem em que entraram: é
     com eles que a tela manda de volta o que a pessoa decidiu
     manter. Sem isso o rascunho ao vivo não teria como falar da
     mesma linha que o banco guardou. */
}): Promise<{ consultaId: string; idsAfirmacoes: string[] }> {
  return db.$transaction(async (tx) => {
    const consulta = await tx.pesquisaConsulta.create({
      data: {
        sessaoId: entrada.sessaoId,
        nivel: 'busca',
        resultado: entrada.resultado,
        pergunta: entrada.perguntaOriginal,
        perguntaResolvida: entrada.perguntaResolvida,
        /* O texto que o provedor devolveu. Sem esta coluna, fechar a
           aba entre a busca e o desenho do quadro perdia a prosa de
           uma busca já paga — ela só existia no corpo HTTP. */
        resposta: entrada.resposta || null,
        /* A investigação nunca decide o nível sozinha: quem decidiu
           foi o planejador, lendo. Registrar `true` aqui faria o
           histórico dizer que a heurística acertou de novo. */
        decididoSozinho: false,
        provedor: 'investigar',
      },
    });

    /* Os ids saem daqui, e não do banco, porque `createMany` não os
       devolve. Gerá-los antes deixa fonte e afirmação serem gravadas
       em duas chamadas em vez de uma por linha — e é o que permite a
       ligação por CHAVE, no lugar do índice de array que não
       sobrevive a ser gravado. */
    const idsFontes = entrada.fontes.map(() => randomUUID());

    if (entrada.fontes.length) {
      await tx.pesquisaFonte.createMany({
        data: entrada.fontes.map((f, i) => ({
          id: idsFontes[i]!,
          consultaId: consulta.id,
          url: f.url,
          titulo: f.titulo ?? null,
          trecho: f.trecho ?? null,
        })),
      });
    }

    const idsAfirmacoes = entrada.afirmacoes.map(() => randomUUID());

    if (entrada.afirmacoes.length) {
      await tx.pesquisaAfirmacao.createMany({
        data: entrada.afirmacoes.map((a, i) => ({
          id: idsAfirmacoes[i]!,
          consultaId: consulta.id,
          inicio: a.inicio,
          texto: a.texto,
          semFonte: a.semFonte,
          /* `null`, e não `false`: ninguém decidiu ainda. É este
             estado que faz a tela saber, depois de um F5, que há um
             rascunho esperando — em vez de tratar tudo como
             aprovado por omissão. */
          removidaPeloUsuario: null,
        })),
      });

      /* Um par por citação, sem repetir a mesma fonte na mesma
         afirmação: duas citações da mesma página são a mesma
         procedência. */
      const pares = entrada.afirmacoes.flatMap((a, i) =>
        a.fonteIds
          .filter((id, k) => idsFontes[id] !== undefined && a.fonteIds.indexOf(id) === k)
          .map((id) => ({
            afirmacaoId: idsAfirmacoes[i]!,
            fonteId: idsFontes[id]!,
            trecho: a.trechos[a.fonteIds.indexOf(id)] ?? null,
          })),
      );
      if (pares.length) await tx.pesquisaAfirmacaoFonte.createMany({ data: pares });
    }

    const focoNovo = decidirFoco(
      entrada.foco ?? null,
      { citadas: entrada.citadas, descobertas: [] },
      entrada.conhecidas,
    );
    if (focoNovo) {
      const linha = await tx.pesquisaEntidade.findFirst({
        where: { sessaoId: entrada.sessaoId, nome: focoNovo.nome },
      });
      await tx.pesquisaSessao.update({
        where: { id: entrada.sessaoId },
        data: { focoId: linha?.id ?? null },
      });
    }

    return { consultaId: consulta.id, idsAfirmacoes };
  });
}

/* Quanto esta investigação já consumiu. Soma o total de
   `consumos_pesquisa`, que é onde o custo real de cada consulta fica
   — nunca uma estimativa reconstruída a partir do número de
   consultas. */
async function gastoDaSessao(sessaoId: string): Promise<number> {
  const r = await db.consumoPesquisa.aggregate({
    where: { sessaoId },
    _sum: { totalMicros: true },
  });
  return r._sum.totalMicros ?? 0;
}
