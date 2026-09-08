/* ============================================================
   Enriquecimento de tema — gráficos (Fase 2)
   ============================================================
   Regras: Documentacao/enriquecimento-tema.md

   Mesmo padrão de enriquecimento-leitura.ts, mas aqui o modelo
   EXTRAI dados quantitativos dos recortes e os agrupa em gráficos.

   Diferente da leitura (rótulos curtos), aqui usamos Sonnet:
   extrair o número certo do contexto certo ("cresceu 20%" pode ser
   do mercado inteiro ou de um concorrente específico citado no
   parágrafo ao lado) é uma tarefa que se beneficia de mais raciocínio.
   ============================================================ */

import { createHash, randomUUID } from 'node:crypto';

import { env } from '../env.js';
import { db } from '../db.js';
import { lerUso, type Uso, tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { registrar } from '../creditos/registro.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { iaConfigurada } from './provedor.js';

import { interpretar, type Grafico, type RecorteNumerado } from './enriquecimento-graficos-leitura.js';

export { interpretar };
export type { Grafico };

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

export function fingerprintDe(recortes: RecorteDoTema[]): string {
  return createHash('sha256').update(recortes.map((r) => r.id).join(',')).digest('hex');
}

/* Sistema para extração de dados quantitativos. Mais detalhado que
   leitura porque o modelo precisa validar que 35 é mesmo 35%, não uma
   confusão com outro número no parágrafo vizinho. */
const SISTEMA = [
  'Você extrai dados quantitativos de trechos de um tema de Product Design',
  'e os agrupa em gráficos. Os números que aparecem nos trechos são LITERAIS —',
  'não arredonde, não extrapole, não deduza. Se o texto não diz explicitamente',
  'um valor, omita esse dado.',
  '',
  'Recebe trechos numerados. Devolve gráficos (barra, linha, pizza) com ORIGEM',
  'do valor em cada ponto: qual número do trecho de origem aquele ponto veio.',
  '',
  'Responda SOMENTE com JSON, sem cercas de código e sem comentários:',
  '{"graficos":[{"tipo":"barra","titulo":"<título curto>","eixo_x":"<rótulo>",',
  '"eixo_y":"<rótulo>","dados":[{"rotulo":"<valor>","valor":<número>,"origem":<número>}]}]}',
  '',
  'Regras:',
  '- "origem" é OBRIGATÓRIO em cada ponto — qual número do trecho este valor veio.',
  '- Um gráfico precisa de PELO MENOS 2 pontos. Se um tipo tem só um ponto, omita.',
  '- Título de gráfico é curto, orientação de leitura, nunca resumo do conteúdo.',
  '- eixo_x e eixo_y são opcionais (omita se o gráfico não tiver eixos categóricos).',
  '- Não invente números. Se o texto não cita valor, não inclua ponto.',
].join('\n');

export type DiagnosticoGraficos = {
  graficos: Grafico[] | null;
  motivo: 'ok' | 'sem-ia' | 'sem-recortes' | 'rede' | 'recusa-http' | 'vazio' | 'ilegivel';
  bruto: string;
  uso?: Uso;
  modelo?: string;
  requisicaoId?: string;
};

export async function enriquecerGraficosComDiagnostico(
  recortes: RecorteDoTema[],
): Promise<DiagnosticoGraficos> {
  if (!recortes.length) return { graficos: null, motivo: 'sem-recortes', bruto: '' };
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO_SONNET) {
    return { graficos: null, motivo: 'sem-ia', bruto: '' };
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
        model: env.IA_MODELO_SONNET,
        /* Sonnet precisa de mais tokens para raciocínio. Estimativa:
           ~3 pontos por recorte em gráficos (conservador), ~200 tokens
           por gráfico (~3 tipos × 3 pontos cada = 9 pontos mínimo).
           Se tem 30 recortes, 90 pontos esperados = 30 gráficos = 6000
           tokens. Deixamos 8192 para margem. */
        max_tokens: 8192,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: texto.slice(0, 60000) },
          { role: 'assistant', content: '{"graficos":[' },
        ],
      }),
    });
  } catch {
    return { graficos: null, motivo: 'rede', bruto: '' };
  }

  if (!resposta.ok) {
    return {
      graficos: null,
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
    modelo: env.IA_MODELO_SONNET,
    requisicaoId: resposta.headers.get('request-id') ?? undefined,
  };

  const bruto = ('{"graficos":[' + (corpo.content ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')).trim();

  if (bruto === '{"graficos":[') {
    return { graficos: null, motivo: 'vazio', bruto, ...medicao };
  }

  const lido = interpretar(bruto, numerados);
  if (lido === null) {
    return { graficos: null, motivo: 'ilegivel', bruto, ...medicao };
  }
  return { graficos: lido, motivo: 'ok', bruto, ...medicao };
}

export async function enriquecerGraficosEmSegundoPlano(
  empresaId: string,
  categoria: string,
  usuarioId: string | null,
): Promise<void> {
  try {
    const recortes = await recortesDoTema(empresaId, categoria);
    if (!recortes.length) return;

    const fingerprint = fingerprintDe(recortes);

    const existente = await db.sinteseTema.findUnique({
      where: { empresaId_categoria: { empresaId, categoria } },
      select: { fingerprintGraficos: true, graficos: true },
    });
    if (existente?.fingerprintGraficos === fingerprint) return;

    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;

    if (iaConfigurada() && env.CREDITOS_COBRAR === 'sim' && usuarioId) {
      const amostra = recortes.map((r) => r.texto).join('\n\n').slice(0, 60000);
      const tetoUsd = tetoUsdMicros(env.IA_MODELO_SONNET as string, amostra, 8192);

      if (tetoUsd === null) {
        console.warn(`[graficos] ${empresaId}/${categoria} sem preço de tabela para o modelo — não enriqueceu`);
        return;
      }

      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

      try {
        await reservar(usuarioId, tetoTotalMicros, operacaoId, 'sintese_tema');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          console.warn(`[graficos] ${empresaId}/${categoria} não enriquecida (sem saldo)`);
          return;
        }
        throw e;
      }
    }

    const d = await enriquecerGraficosComDiagnostico(recortes);

    if (d.uso && d.modelo) {
      registrar({
        usuarioId,
        empresaId,
        tipo: 'sintese_tema',
        resultado: d.motivo === 'ok' ? 'entregue' : 'descartado',
        modelo: d.modelo,
        uso: d.uso,
        requisicaoId: d.requisicaoId,
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

    /* Erros não apagam gráficos antigos, mesmo raciocínio de leitura. */
    if (
      d.motivo === 'rede' ||
      d.motivo === 'recusa-http' ||
      d.motivo === 'sem-ia' ||
      d.motivo === 'ilegivel' ||
      d.motivo === 'vazio'
    ) {
      console.warn(`[graficos] ${empresaId}/${categoria} não enriquecida (${d.motivo}) — mantendo os gráficos que já existiam`);

      /* "pendente" quer dizer "ainda não rodou". Um tema onde a
         geração rodou e não deu certo não é isso — e a diferença
         importa para quem for olhar por que um tema nunca ganhou
         gráfico. Só que a marca de falha não pode passar por cima de
         conteúdo bom: se já existe algo gravado, ele continua valendo
         e o estado continua "ok".

         `sem-ia` fica de fora de propósito: a fase estar desligada
         não é uma tentativa que falhou, e marcar todo tema como
         "falhou" por falta de IA_MODELO_SONNET diria a coisa errada.
         O fingerprint também não é gravado — sem ele, a próxima
         mudança nos recortes tenta de novo. */
      if (d.motivo !== 'sem-ia' && !existente?.graficos) {
        await db.sinteseTema.upsert({
          where: { empresaId_categoria: { empresaId, categoria } },
          create: { empresaId, categoria, statusGraficos: 'falhou' },
          update: { statusGraficos: 'falhou' },
        });
      }
      return;
    }

    await db.sinteseTema.upsert({
      where: { empresaId_categoria: { empresaId, categoria } },
      create: {
        empresaId,
        categoria,
        fingerprintGraficos: fingerprint,
        graficos: d.graficos ?? [],
        statusGraficos: 'ok',
      },
      update: {
        fingerprintGraficos: fingerprint,
        graficos: d.graficos ?? [],
        statusGraficos: 'ok',
      },
    });
  } catch (e) {
    console.error('[graficos] falha ao gerar gráficos', empresaId, categoria, e);
  }
}
