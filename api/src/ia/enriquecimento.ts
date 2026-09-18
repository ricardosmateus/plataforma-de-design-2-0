/* ============================================================
   Enriquecimento de tema — leitura guiada (Fase 1)
   ============================================================
   Regras: Documentacao/enriquecimento-tema.md

   Recortes já respondem "o que foi escrito sobre este tema", cada
   trecho preso ao quadro de origem. Falta a ordem em que faz
   sentido LER — hoje é "quando a idéia foi finalizada", não "o que
   vem primeiro". Este módulo é a terceira etapa da cadeia que
   `taxonomia.ts` e `recortes.ts` já formam:

     idéia finalizada → CLASSIFICAR → RECORTAR → ENRIQUECER (aqui)

   Mas ao contrário das duas primeiras, que olham para UMA idéia,
   este olha para TODOS os recortes que a empresa já tem numa
   categoria — "a leitura de Mercado" é o tema inteiro, não o que
   uma idéia isolada disse.

   Mesma decisão central de `recortes.ts`: o modelo ROTULA, não
   ESCREVE. Recebe os trechos numerados, devolve só títulos de
   seção e os números que pertencem a cada uma — nunca o texto. A
   leitura pura que valida essa resposta mora em
   `enriquecimento-leitura.ts`.
   ============================================================ */

import { createHash, randomUUID } from 'node:crypto';

import { env } from '../env.js';
import { db } from '../db.js';
import { lerUso, type Uso, tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { registrar } from '../creditos/registro.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { iaConfigurada } from './provedor.js';

import { interpretar, type RecorteNumerado, type Secao } from './enriquecimento-leitura.js';

export { interpretar };
export type { Secao };

/* ------------------------------------------------------------
   Os recortes de UM tema
   ------------------------------------------------------------
   Mesmo escopo da rota GET /empresas/:id/temas/:categoria
   (src/rotas/grafo.ts): idéia finalizada, não arquivada, projeto
   não arquivado. A ordem (ideiaId, ordem) é só para o fingerprint e
   a numeração ficarem determinísticos entre chamadas — a ordem de
   LEITURA é o que este módulo existe para decidir.
   ------------------------------------------------------------ */
export type RecorteDoTema = {
  id: string;
  texto: string;
  tarefaId: string;
  ideiaId: string;
};

export async function recortesDoTema(
  empresaId: string,
  categoria: string,
): Promise<RecorteDoTema[]> {
  return db.recorteTaxonomia.findMany({
    where: {
      categoria,
      ideia: {
        arquivadoEm: null,
        status: 'finalizado',
        projeto: { empresaId, arquivadoEm: null },
      },
    },
    orderBy: [{ ideiaId: 'asc' }, { ordem: 'asc' }],
    select: { id: true, texto: true, tarefaId: true, ideiaId: true },
  });
}

/* Hash da lista ORDENADA de ids de recorte. Como recortes.ts recria
   os recortes por inteiro (deleteMany + createMany) a cada
   segmentação, o id de cada recorte troca sempre que o conteúdo de
   origem mudou — então o fingerprint muda sozinho sempre que há
   algo novo para reler, e não muda quando uma idéia sem relação
   nenhuma finaliza noutra categoria. */
export function fingerprintDe(recortes: RecorteDoTema[]): string {
  return createHash('sha256').update(recortes.map((r) => r.id).join(',')).digest('hex');
}

/* ------------------------------------------------------------
   A chamada ao provedor
   ------------------------------------------------------------ */
const SISTEMA = [
  'Você organiza trechos já escritos de um tema de Product Design numa ordem de leitura fluida.',
  '',
  'Recebe trechos numerados. Devolve seções: cada seção tem um título',
  'curto e a lista de números dos trechos que pertencem a ela, na',
  'ordem em que devem ser lidos.',
  '',
  'Responda SOMENTE com JSON, sem cercas de código e sem comentários:',
  '{"secoes":[{"titulo":"<título curto>","recortes":[<números>]}]}',
  '',
  'Regras:',
  '- Não reescreva, não resuma e não invente texto. Você só organiza —',
  '  o texto de cada trecho já existe e não muda.',
  '- Cada trecho aparece em NO MÁXIMO uma seção.',
  '- Um trecho pode ficar de fora se nenhuma seção fizer sentido para',
  '  ele — ele ainda aparece depois, à parte, então omitir é seguro.',
  '- Título de seção é curto, uma linha — orientação de leitura, nunca',
  '  uma frase completa sobre o conteúdo.',
].join('\n');

export type DiagnosticoLeitura = {
  secoes: Secao[] | null;
  motivo: 'ok' | 'sem-ia' | 'sem-recortes' | 'rede' | 'recusa-http' | 'vazio' | 'ilegivel';
  bruto: string;
  uso?: Uso;
  modelo?: string;
  requisicaoId?: string;
};

export async function enriquecerLeituraComDiagnostico(
  recortes: RecorteDoTema[],
): Promise<DiagnosticoLeitura> {
  if (!recortes.length) return { secoes: null, motivo: 'sem-recortes', bruto: '' };
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO) {
    return { secoes: null, motivo: 'sem-ia', bruto: '' };
  }

  const numerados: RecorteNumerado[] = recortes.map((r, i) => ({ n: i + 1, recorteId: r.id }));
  const texto = recortes.map((r, i) => `[${i + 1}]\n${r.texto}`).join('\n\n');

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
        /* Uma seção + título por recorte, no pior caso — mesmo teto
           de `recortes.ts` para o mesmo tamanho de entrada. */
        max_tokens: 2048,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: texto.slice(0, 60000) },
          /* Mesmo pré-preenchimento da classificação e da segmentação:
             sem lugar por onde escrever saudação ou cerca de código. */
          { role: 'assistant', content: '{"secoes":[' },
        ],
      }),
    });
  } catch {
    return { secoes: null, motivo: 'rede', bruto: '' };
  }

  if (!resposta.ok) {
    return {
      secoes: null,
      motivo: 'recusa-http',
      bruto: await resposta.text().catch(() => ''),
    };
  }

  const corpo = (await resposta.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
  };

  const medicao = {
    uso: lerUso(corpo.usage),
    modelo: env.IA_MODELO,
    requisicaoId: resposta.headers.get('request-id') ?? undefined,
  };

  const bruto = ('{"secoes":[' + (corpo.content ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')).trim();

  if (bruto === '{"secoes":[') {
    return { secoes: null, motivo: 'vazio', bruto, ...medicao };
  }

  const lido = interpretar(bruto, numerados);
  if (lido === null) {
    return { secoes: null, motivo: 'ilegivel', bruto, ...medicao };
  }
  return { secoes: lido, motivo: 'ok', bruto, ...medicao };
}

/* ------------------------------------------------------------
   Gerar e gravar
   ------------------------------------------------------------
   Disparada a partir de `segmentarIdeiaEmSegundoPlano` (recortes.ts),
   depois que os recortes de uma idéia são gravados com sucesso — uma
   vez por categoria que a idéia toca. Roda em segundo plano, fora do
   caminho da resposta, pela mesma razão de sempre: enriquecer é
   caro, lento e pode falhar, e nada disso pode atrasar quem só
   queria mover um card.

   `usuarioId` é quem criou a idéia que disparou esta chamada — a
   mesma pessoa cujo saldo já paga pela classificação e pela
   segmentação daquela idéia. Não existe cobrança em nível de
   empresa neste produto; enriquecer o tema é consequência de UMA
   ação de UMA pessoa, e é essa ação que paga por ela.
   ------------------------------------------------------------ */
export async function enriquecerLeituraEmSegundoPlano(
  empresaId: string,
  categoria: string,
  usuarioId: string | null,
): Promise<void> {
  try {
    const recortes = await recortesDoTema(empresaId, categoria);
    /* Sem recorte não há o que ler — e não há página de tema com
       conteúdo para mostrar a leitura. Nada a fazer agora; se um
       recorte novo chegar depois, a próxima chamada encontra
       fingerprint diferente e tenta de novo. */
    if (!recortes.length) return;

    const fingerprint = fingerprintDe(recortes);

    const existente = await db.sinteseTema.findUnique({
      where: { empresaId_categoria: { empresaId, categoria } },
      select: { fingerprintLeitura: true, leitura: true },
    });
    /* Nada mudou desde a última leitura boa — não gasta crédito de
       novo. Cobre o caso comum de uma idéia ser reclassificada para
       a mesma pasta, ou de duas idéias de temas diferentes
       finalizarem quase juntas. */
    if (existente?.fingerprintLeitura === fingerprint) return;

    /* Mesma reserva de taxonomia.ts e recortes.ts (IA-CUSTO-002).
       Sem saldo, o enriquecimento simplesmente não acontece agora —
       a página de tema continua mostrando a leitura crua, que é
       sempre grátis e sempre existe. */
    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;

    if (iaConfigurada() && env.CREDITOS_COBRAR === 'sim' && usuarioId) {
      const amostra = recortes.map((r) => r.texto).join('\n\n').slice(0, 60000);
      const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, amostra, 2048);

      if (tetoUsd === null) {
        console.warn(`[enriquecimento] ${empresaId}/${categoria} sem preço de tabela para o modelo — não enriqueceu`);
        return;
      }

      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

      try {
        await reservar(usuarioId, tetoTotalMicros, operacaoId, 'sintese_tema');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          console.warn(`[enriquecimento] ${empresaId}/${categoria} não enriquecida (sem saldo)`);
          return;
        }
        throw e;
      }
    }

    const d = await enriquecerLeituraComDiagnostico(recortes);

    if (d.uso && d.modelo) {
      registrar({
        usuarioId,
        empresaId,
        tipo: 'sintese_tema',
        resultado: d.motivo === 'ok' ? 'entregue' : 'descartado',
        modelo: d.modelo,
        uso: d.uso,
        requisicaoId: d.requisicaoId,
        operacaoId,
      });
    }

    if (tetoTotalMicros > 0 && usuarioId) {
      await liberar(usuarioId, tetoTotalMicros, operacaoId, 'sintese_tema');

      if (d.motivo === 'ok' && d.uso && d.modelo) {
        const usdReal = custoUsdMicros(d.modelo, d.uso);
        if (usdReal !== null) {
          const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
          const totalReal = comissaoSobre(usdParaMicrosBrl(usdReal, cotacao)).totalMicros;
          if (totalReal > 0) {
            await consumir(usuarioId, totalReal, operacaoId, 'sintese_tema');
          }
        }
      }
    }

    /* Rede fora, provedor recusando ou resposta ilegível NÃO apaga a
       leitura que já existia — mesmo raciocínio de recortes.ts: um
       soluço de conexão não pode esvaziar uma leitura guiada que já
       funcionava. A leitura crua (sempre grátis, sempre presente)
       continua a mesma de qualquer forma. */
    if (
      d.motivo === 'rede' ||
      d.motivo === 'recusa-http' ||
      d.motivo === 'sem-ia' ||
      d.motivo === 'ilegivel' ||
      d.motivo === 'vazio'
    ) {
      console.warn(`[enriquecimento] ${empresaId}/${categoria} não enriquecida (${d.motivo}) — mantendo a leitura que já existia`);

      /* "pendente" quer dizer "ainda não rodou". Um tema onde a
         geração rodou e não deu certo não é isso — e a diferença
         importa para quem for olhar por que um tema nunca ganhou
         a leitura. Só que a marca de falha não pode passar por cima
         de conteúdo bom: se já existe algo gravado, ele continua
         valendo e o estado continua "ok".

         `sem-ia` fica de fora de propósito: a fase estar desligada
         não é uma tentativa que falhou, e marcar todo tema como
         "falhou" por causa de configuração ausente diria a coisa
         errada. O fingerprint também não é gravado — sem ele, a
         próxima mudança nos recortes tenta de novo. */
      if (d.motivo !== 'sem-ia' && !existente?.leitura) {
        await db.sinteseTema.upsert({
          where: { empresaId_categoria: { empresaId, categoria } },
          create: { empresaId, categoria, statusLeitura: 'falhou' },
          update: { statusLeitura: 'falhou' },
        });
      }
      return;
    }

    await db.sinteseTema.upsert({
      where: { empresaId_categoria: { empresaId, categoria } },
      create: {
        empresaId,
        categoria,
        fingerprintLeitura: fingerprint,
        leitura: d.secoes ?? [],
        statusLeitura: 'ok',
      },
      update: {
        fingerprintLeitura: fingerprint,
        leitura: d.secoes ?? [],
        statusLeitura: 'ok',
      },
    });
  } catch (e) {
    /* Mesma regra de sempre: falhar aqui não pode escalar. O tema
       fica com a leitura que já tinha (ou sem leitura guiada, com a
       crua no lugar) até a próxima idéia daquela categoria finalizar. */
    console.error('[enriquecimento] falha ao gerar leitura guiada', empresaId, categoria, e);
  }
}
