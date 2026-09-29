/* ============================================================
   Calibração — o Claude como revisor das etapas reais
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-014

   Nas etapas que a IA gerou de verdade não há gabarito. Aqui o
   Claude faz o papel da PESSOA da página de marcação: lê a etapa com
   o contexto do projeto e diz o que faria com ela (manter, revisar,
   excluir) e se ela é genérica, inventa fato ou repete idéia.

   Não é a mesma pergunta que o JEV responde, de propósito: o JEV dá
   probabilidades por critério; o revisor dá a DECISÃO de um product
   designer. A calibração mede quanto uma concorda com a outra.

   Limite a saber: é outra IA, não uma pessoa. Por isso o relatório
   separa "gabarito" (verdade construída) de "revisor" (opinião do
   Claude), e só o gabarito vale como prova.
   ============================================================ */

import { lerUso, type Uso } from '../../creditos/precos.js';
import type { Marcacao } from './calibracao.js';
import type { ContextoAvaliacaoIdeias } from './perguntas.js';
import { ehTimeout, type Buscar } from './chamada.js';
import type { ConfigClaude } from './claude-juiz.js';

export type Revisao = Omit<Marcacao, 'id'>;

export const SISTEMA_REVISOR = `Você é um product designer sênior revisando as etapas que uma IA sugeriu para o projeto de um cliente. Cada etapa vira um card no quadro do cliente.

Para CADA etapa, decida:
- "faixa": "alta" se você manteria a etapa como está; "revisar" se ela serve mas precisa ser reescrita (genérica, vaga ou repetida); "baixa" se você excluiria (inventa fatos, foge do projeto ou não ajuda).
- "generica": true se a etapa serviria a qualquer projeto, sem nada próprio deste projeto ou da empresa.
- "inventaFato": true se a etapa afirma sobre a empresa algo (números, filiais, clientes, concorrentes, mercado) que NÃO está na ficha nem nas idéias validadas.
- "duplicada": true se a etapa repete, com outras palavras, uma das idéias que já existem.

Julgue só pelo que está na mensagem. O que não está na ficha da empresa não está confirmado.

Responda SOMENTE com JSON, sem texto antes ou depois, com uma entrada por etapa, na mesma ordem:
{"revisoes":[{"i":0,"faixa":"alta","generica":false,"inventaFato":false,"duplicada":false}]}`;

const PREFIXO = '{"revisoes":[';

export function mensagemRevisor(c: ContextoAvaliacaoIdeias): string {
  const l: string[] = [];
  l.push(`Projeto: ${c.projetoNome}`);
  l.push(`Empresa: ${c.empresaNome}`);
  l.push(`Ficha da empresa: ${c.empresaDescricao?.trim() || '(sem descrição cadastrada)'}`);
  l.push(`Idéias validadas: ${c.validadas.length ? c.validadas.map((t) => `"${t}"`).join('; ') : '(nenhuma)'}`);
  l.push(`Idéias que já existiam: ${c.existentes.length ? c.existentes.map((t) => `"${t}"`).join('; ') : '(nenhuma)'}`);
  if (c.orientacao) l.push(`Orientação de quem pediu: ${c.orientacao}`);
  l.push('', 'Etapas sugeridas:');
  c.etapas.forEach((e, i) => l.push(`${i}. ${e.titulo} — ${e.descricao}`));
  return l.join('\n');
}

const FAIXAS = ['alta', 'revisar', 'baixa'] as const;

/** Uma revisão por etapa, na ordem; `null` onde a resposta falhou. */
export function interpretarRevisao(texto: string, quantidade: number): Array<Revisao | null> {
  const saida: Array<Revisao | null> = Array.from({ length: quantidade }, () => null);
  let dados: unknown;
  try {
    dados = JSON.parse(texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return saida;
  }
  const lista = (dados as { revisoes?: unknown })?.revisoes;
  if (!Array.isArray(lista)) return saida;
  lista.forEach((bruto, pos) => {
    const o = bruto as Record<string, unknown>;
    const i = typeof o?.i === 'number' ? o.i : pos;
    if (!Number.isInteger(i) || i < 0 || i >= quantidade) return;
    if (!FAIXAS.includes(o.faixa as (typeof FAIXAS)[number])) return;
    saida[i] = {
      faixa: o.faixa as Revisao['faixa'],
      generica: o.generica === true,
      inventaFato: o.inventaFato === true,
      duplicada: o.duplicada === true,
    };
  });
  return saida;
}

export type ResultadoRevisao =
  | { ok: true; revisoes: Array<Revisao | null>; uso: Uso; modelo: string }
  | { ok: false; motivo: string; uso?: Uso };

export async function revisarComClaude(
  c: ContextoAvaliacaoIdeias,
  cfg: ConfigClaude,
  buscar: Buscar = fetch,
): Promise<ResultadoRevisao> {
  if (!cfg.chave || !cfg.modelo) return { ok: false, motivo: 'sem-configuracao' };
  let resposta: Response;
  try {
    resposta = await buscar('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: 200 + 60 * c.etapas.length,
        system: SISTEMA_REVISOR,
        messages: [
          { role: 'user', content: mensagemRevisor(c) },
          { role: 'assistant', content: PREFIXO },
        ],
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    return { ok: false, motivo: ehTimeout(e) ? 'timeout' : 'rede' };
  }
  if (!resposta.ok) return { ok: false, motivo: `http ${resposta.status}` };
  const corpo = (await resposta.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }>; usage?: unknown }
    | null;
  if (!corpo) return { ok: false, motivo: 'formato' };
  const texto = PREFIXO + (corpo.content ?? []).filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('');
  return { ok: true, revisoes: interpretarRevisao(texto, c.etapas.length), uso: lerUso(corpo.usage), modelo: cfg.modelo };
}
