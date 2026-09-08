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

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db } from '../db.js';
import * as sessaoLogin from '../seguranca/sessao.js';

import { planejarConsulta, type Entidade } from '../pesquisa/roteador.js';
import { planejarEntidades } from '../pesquisa/entidades.js';
import { decidirFoco, cabeNoTeto, classificarResultado } from '../pesquisa/sessao.js';
import {
  provedorBuscaAtual,
  provedorLugaresAtual,
  pesquisaConfigurada,
} from '../pesquisa/provedor.js';

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
        ...erro(null, 'Esta pergunta pode ser respondida de mais de um jeito, com custos diferentes. Confirme qual.'),
        nivel_sugerido: plano.nivel,
      });
    }

    /* PES-005: fora da v1 por decisão de negócio, não por falta de
       tempo. Ver §3 do planejamento. */
    if (nivel === 'navegacao') {
      return resposta.code(501).send(
        erro(
          null,
          'Ainda não entro em sites específicos (LinkedIn, Instagram) por esta ferramenta. ' +
            'Reformule a pergunta e eu busco a informação em fontes públicas.',
        ),
      );
    }

    const configurado = pesquisaConfigurada();
    if (!executavelAgora(nivel, configurado)) {
      return resposta.code(503).send(
        erro(null, 'A pesquisa externa ainda não está configurada nesta instalação.'),
      );
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
    const estimativaMicros = 0;

    if (!cabeNoTeto(gastoMicros, estimativaMicros, sessao.tetoMicros)) {
      return resposta.code(402).send(
        erro(null, 'Esta investigação atingiu o teto de gasto combinado. Aumente o teto para continuar.'),
      );
    }

    /* ---- A chamada ---- */
    const saida =
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

    const achados = 'lugares' in saida ? saida.lugares.length : saida.resposta.trim() ? 1 : 0;
    const resultado = classificarResultado({ itens: achados, erro: saida.erro });

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
}

/* Um nível é executável quando existe provedor por trás dele.
   'conhecimento' ainda não tem: ligá-lo a `ia/provedor.ts` exige um
   sistema próprio e não passa pela verificação de procedência de lá,
   que é específica do módulo de idéias. Fica registrado como o que é
   — pendente — em vez de responder de memória sem fonte, que é
   justamente o que PES-006 proíbe. */
function executavelAgora(
  nivel: 'conhecimento' | 'busca' | 'lugares' | 'navegacao',
  configurado: { busca: boolean; lugares: boolean },
): boolean {
  if (nivel === 'busca') return configurado.busca;
  if (nivel === 'lugares') return configurado.lugares;
  return false;
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
