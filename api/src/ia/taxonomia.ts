/* ============================================================
   Taxonomia — classificação automática de idéias finalizadas
   ============================================================
   Regras: Skills/categorizacao-taxonomia.skill
           planejamento-grafo-conhecimento.md

   Duas operações, e a assimetria entre elas é o ponto do módulo:

   CLASSIFICAR é caro, lento e pode falhar. Acontece quando a idéia
   ENTRA em "finalizado", fora do caminho da resposta: mover um card
   não pode ficar esperando a IA, nem falhar porque a IA falhou.
   Idéia sem classificação apenas não aparece no mapa ainda.

   LIMPAR é barato, instantâneo e não pode falhar. Acontece quando a
   idéia SAI de "finalizado", DENTRO da mesma escrita que muda o
   status. Essa é a regra crítica: o que saiu de "finalizado" some
   do mapa na mesma hora. Se a limpeza fosse assíncrona como a
   classificação, existiria uma janela em que a página "Sobre a
   empresa" mostraria conhecimento que a pessoa já retirou de lá —
   e é justamente isso que não pode acontecer.
   ============================================================ */

import { env } from '../env.js';
import { db } from '../db.js';
import { lerUso, type Uso, tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { registrar } from '../creditos/registro.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { iaConfigurada } from './provedor.js';
import { segmentarIdeiaEmSegundoPlano, apagarRecortes } from './recortes.js';
import { randomUUID } from 'node:crypto';

import {
  TAXONOMIA,
  CATEGORIAS,
  interpretar,
  type Classificacao,
} from './taxonomia-vocabulario.js';

export { TAXONOMIA, CATEGORIAS, interpretar };
export type { Classificacao };

/* ------------------------------------------------------------
   O prompt do sistema é constante e longo; a idéia é curta e
   variável. Essa é exatamente a forma que o cache de prompt da
   Anthropic premia: marcamos o bloco fixo com `cache_control`
   ephemeral e pagamos o texto da taxonomia uma vez a cada cinco
   minutos, em vez de uma vez por idéia.
   ------------------------------------------------------------ */
const SISTEMA = [
  'Você classifica idéias de projetos de Product Design em uma taxonomia fixa.',
  '',
  'Taxonomia (domínio → categorias):',
  ...Object.entries(TAXONOMIA).map(([dominio, cats]) => `- ${dominio}: ${cats.join(', ')}`),
  '',
  'Responda SOMENTE com JSON, sem cercas de código e sem comentários:',
  '{"assunto":"<uma categoria>","tags":["<categoria>","<categoria>"]}',
  '',
  'Regras:',
  '- "assunto" é a categoria PRINCIPAL, exatamente uma, copiada literalmente da lista.',
  '- "tags" são de 0 a 3 categorias secundárias, também literais da lista, sem repetir o assunto.',
  '- Nunca invente categoria fora da lista. Na dúvida, use menos tags.',
].join('\n');

/* ------------------------------------------------------------
   Chamada ao provedor
   ------------------------------------------------------------
   `fetch` direto, como em `provedor.ts`: mesma razão (uma
   dependência a menos para auditar) e mesmo contrato HTTP.
   Devolve `null` em vez de lançar — quem chama é um disparo
   assíncrono, e um erro solto ali derrubaria o processo sem
   ninguém para tratá-lo.
   ------------------------------------------------------------ */
export type Diagnostico = {
  resultado: Classificacao | null;
  /* O texto cru do modelo. Existe para uma situação específica: a
     classificação falhou e ninguém sabe por quê. Sem isto, "não
     devolveu categoria válida" é um beco sem saída — pode ser
     recusa, pode ser JSON torto, pode ser categoria inventada, e as
     três pedem correções diferentes. */
  bruto: string;
  motivo: 'ok' | 'sem-ia' | 'rede' | 'recusa-http' | 'vazio' | 'fora-da-taxonomia';

  /* Custo da chamada — Fase 0 do módulo de créditos. Opcional
     porque falha de rede e ausência de provedor não têm consumo. */
  uso?: Uso;
  modelo?: string;
  requisicaoId?: string;
};

/* Exaustivo de propósito. Quando alguém acrescentar um motivo novo
   ao diagnóstico, o TypeScript para a compilação aqui e obriga a
   decisão: essa falha apaga a pasta ou preserva? Deixar como um
   `||` de dois valores faria o motivo novo cair no ramo "preserva"
   em silêncio, que é o comportamento errado para metade dos casos
   imagináveis. */
export function falhaDefinitiva(motivo: Diagnostico['motivo']): boolean {
  switch (motivo) {
    /* O modelo respondeu; o que veio não serve. Insistir com o mesmo
       texto dá o mesmo resultado. */
    case 'fora-da-taxonomia':
    case 'vazio':
      return true;

    /* Não houve resposta. O texto pode ser perfeitamente
       classificável — só não deu para perguntar agora. */
    case 'rede':
    case 'recusa-http':
    case 'sem-ia':
    case 'ok':
      return false;
  }
}

export async function classificarComDiagnostico(
  titulo: string,
  descricao: string,
): Promise<Diagnostico> {
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO) {
    return { resultado: null, bruto: '', motivo: 'sem-ia' };
  }

  const texto = `Título: ${titulo}\n\nDescrição: ${descricao}`.slice(0, 4000);

  let resposta: Response;
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.IA_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.IA_MODELO,
        max_tokens: 120,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: texto },
          /* Pré-preenchimento da resposta do assistente: o modelo
             continua a partir daqui, então não tem por onde escrever
             saudação, explicação ou cerca de código. Custa nada e
             elimina a classe inteira de "devolveu prosa". */
          { role: 'assistant', content: '{"assunto":"' },
        ],
      }),
    });
  } catch {
    return { resultado: null, bruto: '', motivo: 'rede' };
  }

  if (!resposta.ok) {
    return { resultado: null, bruto: await resposta.text().catch(() => ''), motivo: 'recusa-http' };
  }

  const corpo = (await resposta.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
  };

  /* Sem isto não há como saber o que classificar custa — e
     classificação roda sozinha, em segundo plano, no volume todo. É
     justamente o gasto que passa despercebido. */
  const medicao = {
    uso: lerUso(corpo.usage),
    modelo: env.IA_MODELO,
    requisicaoId: resposta.headers.get('request-id') ?? undefined,
  };
  /* Recompõe o que foi pré-preenchido: a API devolve só a
     continuação, não o trecho que nós escrevemos. */
  const bruto = ('{"assunto":"' + (corpo.content ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')).trim();

  if (bruto === '{"assunto":"') return { resultado: null, bruto, motivo: 'vazio', ...medicao };

  const resultado = interpretar(bruto);
  return { resultado, bruto, motivo: resultado ? 'ok' : 'fora-da-taxonomia', ...medicao };
}

export async function classificar(
  titulo: string,
  descricao: string,
): Promise<Classificacao | null> {
  return (await classificarComDiagnostico(titulo, descricao)).resultado;
}

export async function classificarIdeiaEmSegundoPlano(ideiaId: string): Promise<void> {
  try {
    const ideia = await db.ideia.findUnique({
      where: { id: ideiaId },
      select: {
        id: true, titulo: true, descricao: true,
        status: true, arquivadoEm: true, taxonomiaManual: true,
        /* Fase 0 dos créditos: o consumo precisa ser ATRIBUÍVEL.
           O saldo é do usuário (decisão C1), mas sem empresa e
           projeto na linha não há como responder depois qual
           empresa gastou — e essa pergunta chega. */
        criadoPor: true, projetoId: true,
        projeto: { select: { empresaId: true } },
      },
    });
    if (!ideia || ideia.status !== 'finalizado' || ideia.arquivadoEm) return;

    /* Quem decidiu foi uma pessoa. A IA não desfaz isso — nem
       quando o texto muda, nem quando a idéia volta para
       "finalizado". Discordar em silêncio de uma correção explícita
       é a forma mais rápida de a pessoa parar de confiar na tela. */
    if (ideia.taxonomiaManual) return;

    /* ---- Fase 2 dos créditos: reservar ANTES de chamar ----
       Mesma regra do assistente (IA-CUSTO-002), adaptada ao fato de
       que esta função roda em segundo plano, sem requisição HTTP
       para devolver um 402: sem saldo (ou sem preço de tabela para
       o modelo configurado), a classificação simplesmente NÃO
       ACONTECE agora — a idéia fica sem pasta, do mesmo jeito que já
       fica quando a rede cai ou o provedor recusa, logo abaixo. Não
       é erro; é "não dá para classificar agora". */
    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;
    const usuarioId = ideia.criadoPor;

    if (iaConfigurada() && env.CREDITOS_COBRAR === 'sim' && usuarioId) {
      const texto = `Título: ${ideia.titulo}\n\nDescrição: ${ideia.descricao}`.slice(0, 4000);
      const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, texto, 120);

      if (tetoUsd === null) {
        console.warn(`[taxonomia] ${ideia.id} não classificada (modelo sem preço configurado) — mantendo o que estava`);
        return;
      }

      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

      try {
        await reservar(usuarioId, tetoTotalMicros, operacaoId, 'classificacao');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          console.warn(`[taxonomia] ${ideia.id} não classificada (sem saldo) — mantendo o que estava`);
          return;
        }
        throw e;
      }
    }

    const d = await classificarComDiagnostico(ideia.titulo, ideia.descricao);

    /* Registra o custo antes de decidir o que fazer com o resultado:
       a chamada já foi paga, tenha ela classificado bem ou não. Um
       modelo que responde fora da taxonomia custa exatamente o mesmo
       que um que acerta — e é esse desperdício que a Fase 0 existe
       para tornar visível. */
    if (d.uso && d.modelo) {
      registrar({
        usuarioId: ideia.criadoPor,
        empresaId: ideia.projeto?.empresaId ?? null,
        projetoId: ideia.projetoId,
        ideiaId: ideia.id,
        tipo: 'classificacao',
        resultado: d.motivo === 'ok' ? 'entregue' : 'descartado',
        modelo: d.modelo,
        uso: d.uso,
        requisicaoId: d.requisicaoId,
        operacaoId,
      });
    }

    /* ---- Fase 2: acertar a reserva pelo custo VERDADEIRO ----
       A reserva cobriu um TETO; devolve por inteiro e debita à
       parte só o custo real — e só quando a classificação foi
       `entregue` (IA-CUSTO-003: descartada não cobra, mesmo tendo
       custado ao provedor). */
    if (tetoTotalMicros > 0 && usuarioId) {
      await liberar(usuarioId, tetoTotalMicros, operacaoId, 'classificacao');

      if (d.motivo === 'ok' && d.uso && d.modelo) {
        const usdReal = custoUsdMicros(d.modelo, d.uso);
        if (usdReal !== null) {
          const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
          const totalReal = comissaoSobre(usdParaMicrosBrl(usdReal, cotacao)).totalMicros;
          if (totalReal > 0) {
            await consumir(usuarioId, totalReal, operacaoId, 'classificacao');
          }
        }
      }
    }

    /* Nem toda falha é igual, e tratá-las igual produz o pior
       resultado possível numa RECLASSIFICAÇÃO: o texto mudou, e o
       assunto antigo fica descrevendo um conteúdo que não existe
       mais. Pasta errada e plausível é o tipo de erro que ninguém
       percebe.

       - `ok`: grava.
       - modelo respondeu e não soube enquadrar: apaga. A idéia cai
         no balde "Sem categoria", visível, com botão de tentar de
         novo — não some.
       - rede fora, provedor recusando, IA desligada: NÃO mexe. Um
         soluço de conexão não pode esvaziar as pastas de ninguém.

       Na primeira classificação apagar é inócuo (já era nulo), então
       o mesmo caminho serve para os dois casos. */
    const definitiva = falhaDefinitiva(d.motivo);

    if (!d.resultado && !definitiva) {
      console.warn(`[taxonomia] ${ideia.id} não classificada (${d.motivo}) — mantendo o que estava`);
      return;
    }

    const atualizadas = await db.ideia.updateMany({
      /* O status entra no WHERE, não só na leitura acima: é ele que
         fecha a corrida de verdade, no momento da escrita. */
      /* `taxonomiaManual` volta ao WHERE: entre a leitura acima e
         esta escrita, a pessoa pode ter corrigido a pasta na tela. */
      where: { id: ideia.id, status: 'finalizado', arquivadoEm: null, taxonomiaManual: false },
      data: d.resultado
        ? { assunto: d.resultado.assunto, tags: d.resultado.tags }
        : { assunto: null, tags: [] },
    });

    if (atualizadas.count === 0) {
      console.warn(`[taxonomia] ${ideia.id} saiu de finalizado durante a classificação`);
      return;
    }

    if (!d.resultado) {
      /* Ficou sem pasta: os recortes antigos descreviam uma
         classificação que não vale mais. Deixá-los seria manter
         páginas de tema citando esta idéia sob uma categoria que ela
         perdeu. */
      console.warn(`[taxonomia] ${ideia.id} sem categoria válida (${d.motivo}); ficou sem pasta`);
      await apagarRecortes(ideia.id);
      return;
    }

    /* A classificação diz DE QUE a idéia fala; o recorte diz ONDE ela
       fala disso. É a segunda metade da mesma pergunta, e por isso
       roda aqui e não num disparo separado: sem ela, "Mercado,
       Estratégia e Concorrentes" continua sendo um rótulo que obriga
       a reler a atividade inteira.

       Não é `await`: já estamos em segundo plano, e a segmentação
       falhar não pode desfazer a classificação que acabou de dar
       certo. Ela cuida do próprio erro. */
    void segmentarIdeiaEmSegundoPlano(ideia.id).catch(() => {});
  } catch (e) {
    /* Falhar aqui é aceitável e não pode escalar: a idéia
       simplesmente fica sem pasta até a próxima vez que entrar em
       "finalizado". */
    console.error('[taxonomia] falha ao classificar', ideiaId, e);
  }
}

/* REGRA CRÍTICA. Não é assíncrona e não tem tratamento de erro
   próprio de propósito: se a limpeza falhar, a mudança de status
   inteira deve falhar junto. Status "andamento" com assunto
   preenchido é a única inconsistência que este módulo não pode
   deixar existir.

   `taxonomiaManual` zera junto, e não é detalhe: a correção da
   pessoa vale para a classificação daquele texto naquela pasta. Se
   ela sobrevivesse à saída de "finalizado", a idéia voltaria ao mapa
   depois carregando uma decisão tomada sobre outro contexto — e,
   pior, silenciosamente imune à IA para sempre. */
export function limparTaxonomia() {
  return { assunto: null, tags: [] as string[], taxonomiaManual: false };
}
