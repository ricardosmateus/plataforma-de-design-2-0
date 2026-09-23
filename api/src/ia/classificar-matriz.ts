/* ============================================================
   "Gerar classificação com IA" na Matriz CSD — MATRIZ-IA
   ============================================================
   Skill:  Skills/senior-product-designer.skill (§ "Classificando a
           Matriz CSD de uma atividade")
   Regras: Regras_de_negocio/modulos/atividades/matriz-csd.md

   A matriz pertence a uma TAREFA, que pertence a uma ATIVIDADE (a
   idéia) de um PROJETO. O que ela classifica é o trabalho dessa
   atividade: cada tarefa da lista vira um card, na coluna em que o
   assunto dela está hoje — Certeza, Suposição ou Dúvida. Numa
   atividade "Logotipo", "Pesquisar os logotipos dos concorrentes",
   "Buscar o manual de marca dos concorrentes" e "Validar com os
   nossos usuários" são os cards.

   A garantia "toda tarefa da atividade aparece" é de CÓDIGO
   (completarComTarefas): o modelo pode esquecer uma, o servidor não.
   Mesma divisão de gerar-ideias.ts: puro aqui em cima, rede no fim.
   ============================================================ */

import { env } from '../env.js';
import { lerUso, type Uso } from '../creditos/precos.js';
import { encurtar } from './gerar-ideias.js';

export type Coluna = 'certeza' | 'suposicao' | 'duvida';
export const COLUNAS: Coluna[] = ['certeza', 'suposicao', 'duvida'];
export const TITULO_COLUNA: Record<Coluna, string> = { certeza: 'Certeza', suposicao: 'Suposição', duvida: 'Dúvidas' };

export const TITULO_MAX = 260;
export const DESCRICAO_MAX = 280;
export const EXTRAS_MAX = 3;
export const TAREFAS_NO_PEDIDO = 40;
export const MAX_TOKENS_MATRIZ = 3000;

export type TarefaDaAtividade = { titulo: string; descricao: string; tipo: string; status: string };

export type ContextoMatriz = {
  empresaNome: string;
  empresaDescricao: string | null;
  projetoNome: string;
  atividadeTitulo: string;
  atividadeDescricao: string | null;
  /* As OUTRAS tarefas da atividade — a matriz não classifica a si mesma. */
  tarefas: TarefaDaAtividade[];
  conhecimento: string | null;
  /* O que já está na matriz, para não repetir. */
  jaNaMatriz: string[];
};

export type CardMatriz = { titulo: string; descricao: string; coluna: Coluna; tarefa: number | null };

export const SISTEMA_MATRIZ = `Você é um product designer sênior montando a Matriz CSD (Certezas, Suposições e Dúvidas) de uma ATIVIDADE de um projeto de design.

A matriz organiza o TRABALHO dessa atividade. Você recebe a lista de tarefas da atividade; cada tarefa vira um card, na coluna em que o assunto dela está HOJE:
- "certeza": já é fato conhecido ou validado — a tarefa foi concluída e o que ela buscava já se sabe, ou o que a empresa já sabe responde.
- "suposicao": algo que o time está assumindo como verdade, mas ainda não testou nem comprovou.
- "duvida": pergunta em aberto, que ainda precisa ser investigada para o projeto avançar.

Regras:
1. TODA tarefa da lista vira exatamente um card. Use "tarefa" com o número dela na lista.
2. "titulo" do card: o assunto da tarefa, curto e claro (pode ser o próprio título da tarefa).
3. "descricao": até 280 caracteres, dizendo por que o card está naquela coluna e o que faria ele mudar de coluna.
4. Depois das tarefas, você pode acrescentar até ${EXTRAS_MAX} cards EXTRAS ("tarefa": null) com o que falta para esta atividade e nenhuma tarefa cobre (ex.: "Validar com os nossos usuários"). Só o que for realmente necessário para o tipo de trabalho do projeto.
5. Não repita o que já está na matriz.
6. Tarefa concluída não é automaticamente certeza: se nada foi aprendido que responda o assunto, continua dúvida.
7. Use o que a empresa já sabe. Material de consulta NÃO é fato validado — sustenta suposição, não certeza.
8. Nunca invente fatos sobre a empresa. Português do Brasil, frases curtas, sem jargão sem explicação.

Responda SOMENTE com JSON:
{"cards":[{"tarefa":1,"coluna":"duvida","titulo":"...","descricao":"..."}]}`;

const STATUS: Record<string, string> = { pendente: 'pendente', concluida: 'concluída' };
const TIPO: Record<string, string> = { pesquisa: 'Pesquisa', matriz_csd: 'Matriz CSD', referencias_visuais: 'Referência' };

export function montarMensagemMatriz(c: ContextoMatriz): string {
  const l: string[] = [];
  l.push(`Projeto: ${c.projetoNome.trim()}`);
  l.push(`Empresa: ${c.empresaNome.trim()}`);
  const d = (c.empresaDescricao ?? '').trim();
  l.push(d ? `Sobre a empresa: ${d.slice(0, 1200)}` : 'Sobre a empresa: (sem descrição cadastrada)');
  l.push('');
  l.push(`Atividade: ${c.atividadeTitulo.trim().slice(0, 260)}`);
  const ad = (c.atividadeDescricao ?? '').trim();
  if (ad) l.push(`Descrição da atividade: ${ad.slice(0, 600)}`);
  l.push('');
  const tarefas = c.tarefas.slice(0, TAREFAS_NO_PEDIDO);
  if (tarefas.length) {
    l.push('Tarefas da atividade (cada uma vira um card):');
    tarefas.forEach((t, i) => {
      const desc = t.descricao.trim().slice(0, 280);
      l.push(`${i + 1}. [${TIPO[t.tipo] ?? t.tipo}, ${STATUS[t.status] ?? t.status}] ${t.titulo.trim().slice(0, 200)}${desc ? ' — ' + desc : ''}`);
    });
  } else {
    l.push('A atividade ainda não tem outras tarefas: proponha só os cards extras.');
  }
  if (c.jaNaMatriz.length) {
    l.push('');
    l.push('Já está na matriz (não repita):');
    for (const t of c.jaNaMatriz.slice(0, 60)) l.push(`- ${t.slice(0, 200)}`);
  }
  const saber = (c.conhecimento ?? '').trim();
  if (saber) {
    l.push('');
    l.push('O que a empresa já sabe:');
    l.push(saber.slice(0, 6000));
  }
  return l.join('\n');
}

export function chaveTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function paraColuna(v: unknown): Coluna | null {
  const k = chaveTexto(String(v ?? ''));
  if (k.startsWith('cert')) return 'certeza';
  if (k.startsWith('supos')) return 'suposicao';
  if (k.startsWith('duvid')) return 'duvida';
  return null;
}

/* Tolerante no formato, estrito no conteúdo — e sem lançar. */
export function interpretarMatriz(bruto: string, totalTarefas: number): CardMatriz[] {
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let dados: unknown = null;
  try {
    dados = JSON.parse(limpo);
  } catch {
    const i = limpo.indexOf('{');
    const f = limpo.lastIndexOf('}');
    if (i !== -1 && f > i) {
      try { dados = JSON.parse(limpo.slice(i, f + 1)); } catch { dados = null; }
    }
  }
  const lista = Array.isArray((dados as { cards?: unknown })?.cards) ? (dados as { cards: unknown[] }).cards : [];

  const saida: CardMatriz[] = [];
  const tarefasUsadas = new Set<number>();
  const titulos = new Set<string>();
  let extras = 0;
  for (const item of lista) {
    const o = item as { titulo?: unknown; descricao?: unknown; coluna?: unknown; tarefa?: unknown };
    const coluna = paraColuna(o?.coluna);
    if (!coluna || typeof o.titulo !== 'string') continue;
    const titulo = encurtar(o.titulo, TITULO_MAX);
    const descricao = typeof o.descricao === 'string' ? encurtar(o.descricao, DESCRICAO_MAX) : '';
    if (!titulo) continue;

    let tarefa: number | null = null;
    const n = typeof o.tarefa === 'number' ? o.tarefa : Number(o.tarefa);
    if (Number.isInteger(n) && n >= 1 && n <= totalTarefas) {
      if (tarefasUsadas.has(n)) continue; // uma tarefa, um card
      tarefa = n;
    }
    if (tarefa === null) {
      if (extras >= EXTRAS_MAX) continue;
    }
    const k = chaveTexto(titulo);
    if (!k || titulos.has(k)) continue;
    titulos.add(k);
    if (tarefa !== null) tarefasUsadas.add(tarefa);
    else extras++;
    saida.push({ titulo, descricao, coluna, tarefa });
  }
  return saida;
}

/* A garantia de código: toda tarefa da atividade vira card, e nada do
   que já está na matriz entra de novo. Tarefa que o modelo esqueceu
   entra pelo status — concluída em Certeza, pendente em Dúvida — com
   a descrição dizendo que a coluna é provisória. */
export function completarComTarefas(
  cards: CardMatriz[],
  tarefas: TarefaDaAtividade[],
  jaNaMatriz: string[],
): CardMatriz[] {
  const ja = new Set(jaNaMatriz.map(chaveTexto));
  const usadas = new Set(cards.filter((c) => c.tarefa !== null).map((c) => c.tarefa as number));
  const saida = cards.filter((c) => !ja.has(chaveTexto(c.titulo)));
  const lim = Math.min(tarefas.length, TAREFAS_NO_PEDIDO);
  for (let i = 0; i < lim; i++) {
    const t = tarefas[i] as TarefaDaAtividade;
    if (usadas.has(i + 1)) continue;
    if (ja.has(chaveTexto(t.titulo))) continue;
    const concluida = t.status === 'concluida';
    saida.push({
      titulo: encurtar(t.titulo, TITULO_MAX),
      descricao: concluida
        ? 'Tarefa concluída. Confirme se o que ela buscava já é fato — se não for, mova para Dúvidas.'
        : 'Tarefa ainda em aberto: o que ela investiga continua sendo uma pergunta.',
      coluna: concluida ? 'certeza' : 'duvida',
      tarefa: i + 1,
    });
  }
  return saida;
}

/* ---------------- REDE ---------------- */
export async function pedirMatriz(
  mensagem: string,
): Promise<{ ok: true; bruto: string; uso?: Uso; modelo: string; requisicaoId?: string } | { ok: false; motivo: string; uso?: Uso; modelo?: string; requisicaoId?: string }> {
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO) return { ok: false, motivo: 'sem-ia' };
  const PREFIXO = '{"cards":[';
  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.IA_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.IA_MODELO,
        max_tokens: MAX_TOKENS_MATRIZ,
        system: [{ type: 'text', text: SISTEMA_MATRIZ, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: mensagem },
          { role: 'assistant', content: PREFIXO },
        ],
      }),
    });
  } catch {
    return { ok: false, motivo: 'rede' };
  }
  if (!r.ok) return { ok: false, motivo: 'recusa-http' };
  const j = (await r.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: unknown; stop_reason?: string };
  const med = { uso: lerUso(j.usage), modelo: env.IA_MODELO, requisicaoId: r.headers.get('request-id') ?? undefined };
  if (j.stop_reason === 'max_tokens') return { ok: false, motivo: 'cortada', ...med };
  const texto = (j.content ?? []).filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('');
  return { ok: true, bruto: PREFIXO + texto, ...med };
}
