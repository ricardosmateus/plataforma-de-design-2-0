/* ============================================================
   Calibração da avaliação — a comparação (PURO)
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-014
   Plano:   planejamento-jev-avaliacao.md §7, Fase 1

   Os pesos e as faixas da nota só mudam com calibração registrada
   (IA-AVAL-014). Este arquivo é essa calibração: compara o que o
   JEV (ou o Claude) disse com o que uma PESSOA marcou para as mesmas
   etapas, e procura os limites que mais concordam com ela.

   Entradas vêm de dois scripts:
     · scripts/calibracao-exportar.ts — gera a página onde a pessoa
       marca cada etapa;
     · scripts/calibracao-analisar.ts — junta as marcações baixadas
       com as notas do banco e chama `analisar()`.

   Nenhuma rede, nenhum banco: testado em testes/calibracao.test.ts.
   ============================================================ */

import { LIMITES, type Criterio, type Faixa } from './normalizar.js';

export type FaixaHumana = Exclude<Faixa, 'nao_avaliado'>;

export type LinhaAvaliada = {
  id: string;
  geral: number | null;
  faixa: Faixa;
  avaliador: string;
  criterios: Record<string, Criterio>;
};

/* O que a pessoa marcou. As três perguntas de sim/não são opcionais:
   quem só quer dizer a faixa pode deixar o resto em branco, e o
   critério correspondente simplesmente não entra na conta. */
export type Marcacao = {
  id: string;
  faixa: FaixaHumana;
  generica?: boolean;
  inventaFato?: boolean;
  duplicada?: boolean;
};

export type Cortes = { alta: number; revisar: number };
export const CORTES_ATUAIS: Cortes = { alta: 80, revisar: 50 };
/* O limiar em uso hoje, por critério — lido de `normalizar.ts` para o
   relatório nunca comparar contra um número que o código não usa. */
export const LIMITE_ATUAL: Record<'c4' | 'c6' | 'c8', number> = {
  c4: LIMITES.inventaFato,
  c6: LIMITES.generica,
  c8: LIMITES.duplicada,
};
export const AMOSTRA_MINIMA = 40;

export function faixaComCortes(geral: number, c: Cortes): FaixaHumana {
  if (geral >= c.alta) return 'alta';
  if (geral >= c.revisar) return 'revisar';
  return 'baixa';
}

export type DesempenhoAlerta = {
  limiar: number;
  acerto: number;
  /* Dos que o avaliador marcou, quantos a pessoa também marcou. */
  precisao: number | null;
  /* Dos que a pessoa marcou, quantos o avaliador pegou. */
  revocacao: number | null;
};

export type AnaliseAlerta = {
  criterio: string;
  campo: 'generica' | 'inventaFato' | 'duplicada';
  n: number;
  positivosHumanos: number;
  atual: DesempenhoAlerta | null;
  sugerido: DesempenhoAlerta | null;
};

export type Relatorio = {
  n: number;
  semNota: number;
  semMarcacao: number;
  porAvaliador: Record<string, number>;
  concordancia: number | null;
  matriz: Record<FaixaHumana, Record<FaixaHumana, number>>;
  cortes: { atual: Cortes & { acerto: number | null }; sugerido: (Cortes & { acerto: number }) | null };
  alertas: AnaliseAlerta[];
  avisos: string[];
};

const FAIXAS: FaixaHumana[] = ['alta', 'revisar', 'baixa'];
const arred = (v: number) => Math.round(v * 1000) / 1000;

function matrizVazia(): Record<FaixaHumana, Record<FaixaHumana, number>> {
  const m = {} as Record<FaixaHumana, Record<FaixaHumana, number>>;
  for (const a of FAIXAS) m[a] = { alta: 0, revisar: 0, baixa: 0 };
  return m;
}

type Par = { l: LinhaAvaliada & { geral: number }; m: Marcacao };

function acertoCortes(pares: Par[], c: Cortes): number {
  if (!pares.length) return 0;
  return pares.filter((p) => faixaComCortes(p.l.geral, c) === p.m.faixa).length / pares.length;
}

/* Grade de 5 em 5. Empate: fica o mais perto dos cortes atuais —
   mexer sem ganho é mexer à toa. */
export function melhoresCortes(pares: Par[]): (Cortes & { acerto: number }) | null {
  if (!pares.length) return null;
  let melhor: (Cortes & { acerto: number; dist: number }) | null = null;
  for (let revisar = 20; revisar <= 90; revisar += 5) {
    for (let alta = revisar + 5; alta <= 95; alta += 5) {
      const acerto = acertoCortes(pares, { alta, revisar });
      const dist = Math.abs(alta - CORTES_ATUAIS.alta) + Math.abs(revisar - CORTES_ATUAIS.revisar);
      if (!melhor || acerto > melhor.acerto + 1e-9 || (Math.abs(acerto - melhor.acerto) < 1e-9 && dist < melhor.dist)) {
        melhor = { alta, revisar, acerto, dist };
      }
    }
  }
  return melhor ? { alta: melhor.alta, revisar: melhor.revisar, acerto: arred(melhor.acerto) } : null;
}

function desempenho(amostras: Array<{ pct: number; humano: boolean }>, limiar: number): DesempenhoAlerta {
  let vp = 0, fp = 0, fn = 0, vn = 0;
  for (const a of amostras) {
    const maquina = a.pct > limiar;
    if (maquina && a.humano) vp++;
    else if (maquina && !a.humano) fp++;
    else if (!maquina && a.humano) fn++;
    else vn++;
  }
  return {
    limiar,
    acerto: arred((vp + vn) / amostras.length),
    precisao: vp + fp ? arred(vp / (vp + fp)) : null,
    revocacao: vp + fn ? arred(vp / (vp + fn)) : null,
  };
}

function melhorLimiar(amostras: Array<{ pct: number; humano: boolean }>, atual: number): DesempenhoAlerta | null {
  if (!amostras.length) return null;
  let melhor: DesempenhoAlerta | null = null;
  for (let limiar = 20; limiar <= 95; limiar += 5) {
    const d = desempenho(amostras, limiar);
    if (
      !melhor ||
      d.acerto > melhor.acerto + 1e-9 ||
      (Math.abs(d.acerto - melhor.acerto) < 1e-9 && Math.abs(limiar - atual) < Math.abs(melhor.limiar - atual))
    ) {
      melhor = d;
    }
  }
  return melhor;
}

/* Critério → campo marcado pela pessoa. C6 é gravado como
   "específica" (100 − P(genérica)); aqui volta a ser "genérica" para
   comparar com a marcação. */
const ALERTAS: Array<{ criterio: string; campo: AnaliseAlerta['campo']; pct: (c: Criterio) => number }> = [
  { criterio: 'c4', campo: 'inventaFato', pct: (c) => c.pct },
  { criterio: 'c6', campo: 'generica', pct: (c) => 100 - c.pct },
  { criterio: 'c8', campo: 'duplicada', pct: (c) => c.pct },
];

export function analisar(linhas: LinhaAvaliada[], marcacoes: Marcacao[]): Relatorio {
  const porId = new Map(marcacoes.map((m) => [m.id, m]));
  const porAvaliador: Record<string, number> = {};
  const pares: Par[] = [];
  let semNota = 0;
  let semMarcacao = 0;

  for (const l of linhas) {
    const m = porId.get(l.id);
    if (!m) { semMarcacao++; continue; }
    if (l.geral === null) { semNota++; continue; }
    porAvaliador[l.avaliador] = (porAvaliador[l.avaliador] ?? 0) + 1;
    pares.push({ l: l as LinhaAvaliada & { geral: number }, m });
  }

  const matriz = matrizVazia();
  for (const p of pares) {
    const maquina = faixaComCortes(p.l.geral, CORTES_ATUAIS);
    matriz[maquina][p.m.faixa]++;
  }

  const acertoAtual = pares.length ? arred(acertoCortes(pares, CORTES_ATUAIS)) : null;

  const alertas: AnaliseAlerta[] = ALERTAS.map(({ criterio, campo, pct }) => {
    const amostras = pares
      .filter((p) => typeof p.m[campo] === 'boolean' && p.l.criterios[criterio])
      .map((p) => ({ pct: pct(p.l.criterios[criterio]!), humano: p.m[campo] as boolean }));
    return {
      criterio,
      campo,
      n: amostras.length,
      positivosHumanos: amostras.filter((a) => a.humano).length,
      atual: amostras.length ? desempenho(amostras, LIMITE_ATUAL[criterio as 'c4' | 'c6' | 'c8']) : null,
      sugerido: melhorLimiar(amostras, LIMITE_ATUAL[criterio as 'c4' | 'c6' | 'c8']),
    };
  });

  const avisos: string[] = [];
  if (pares.length < AMOSTRA_MINIMA) {
    avisos.push(`Amostra pequena: ${pares.length} etapas marcadas (o plano pede pelo menos ${AMOSTRA_MINIMA}). Os números servem de indício, não de decisão.`);
  }
  for (const a of alertas) {
    if (a.n && a.positivosHumanos === 0) {
      avisos.push(`Nenhuma etapa marcada como "${a.campo}": não dá para medir se o alerta ${a.criterio} pega os casos reais.`);
    }
  }

  return {
    n: pares.length,
    semNota,
    semMarcacao,
    porAvaliador,
    concordancia: acertoAtual,
    matriz,
    cortes: { atual: { ...CORTES_ATUAIS, acerto: acertoAtual }, sugerido: melhoresCortes(pares) },
    alertas,
    avisos,
  };
}

/* Validação das marcações baixadas da página: arquivo editado à mão
   ou de outra versão não pode entrar calado na conta. */
export function lerMarcacoes(bruto: unknown): Marcacao[] {
  const lista = Array.isArray(bruto) ? bruto : Array.isArray((bruto as { marcacoes?: unknown })?.marcacoes) ? (bruto as { marcacoes: unknown[] }).marcacoes : null;
  if (!lista) throw new Error('Arquivo de marcações sem a lista "marcacoes".');
  const saida: Marcacao[] = [];
  for (const item of lista) {
    const o = item as Record<string, unknown>;
    if (typeof o?.id !== 'string' || !FAIXAS.includes(o.faixa as FaixaHumana)) continue;
    const m: Marcacao = { id: o.id, faixa: o.faixa as FaixaHumana };
    for (const campo of ['generica', 'inventaFato', 'duplicada'] as const) {
      if (typeof o[campo] === 'boolean') m[campo] = o[campo] as boolean;
    }
    saida.push(m);
  }
  return saida;
}

/* ------------------------------------------------------------
   Relatório em Markdown — usado pelos dois scripts de calibração
   ------------------------------------------------------------ */
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const NOME_CAMPO = { generica: 'Genérica (C6)', inventaFato: 'Inventa fato (C4)', duplicada: 'Repete idéia (C8)' } as const;

export function secaoRelatorio(r: Relatorio, titulo: string, origem: string): string {
  const l: string[] = [];
  l.push(`## ${titulo}`, '');
  l.push(`${origem} · ${r.n} etapas comparadas` +
    (r.semNota ? ` · ${r.semNota} sem nota (não avaliadas)` : '') +
    ` · avaliador: ${Object.entries(r.porAvaliador).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`, '');
  if (r.avisos.length) l.push(...r.avisos.map((a) => `> ⚠ ${a}`), '');

  l.push('### Faixa', '');
  l.push(`Concordância com os cortes atuais (alta ≥ ${r.cortes.atual.alta}, revisar ≥ ${r.cortes.atual.revisar}): **${pct(r.concordancia)}**`, '');
  l.push('| JEV \\ Referência | Alta | Revisar | Baixa |', '|---|---|---|---|');
  for (const f of ['alta', 'revisar', 'baixa'] as const) {
    const m = r.matriz[f];
    l.push(`| **${f}** | ${m.alta} | ${m.revisar} | ${m.baixa} |`);
  }
  l.push('');
  if (r.cortes.sugerido) {
    const s = r.cortes.sugerido;
    const igual = s.alta === r.cortes.atual.alta && s.revisar === r.cortes.atual.revisar;
    l.push(igual
      ? 'Os cortes atuais já são os que mais concordam com a referência.'
      : `Cortes sugeridos: alta ≥ **${s.alta}**, revisar ≥ **${s.revisar}** → concordância **${pct(s.acerto)}**.`, '');
  }

  l.push('### Alertas', '');
  l.push('| Alerta | Etapas | Marcadas na referência | Limiar atual: acerto / precisão / revocação | Limiar sugerido |', '|---|---|---|---|---|');
  for (const a of r.alertas) {
    const at = a.atual ? `${pct(a.atual.acerto)} / ${pct(a.atual.precisao)} / ${pct(a.atual.revocacao)}` : '—';
    const sg = a.sugerido ? `${a.sugerido.limiar}% → ${pct(a.sugerido.acerto)} / ${pct(a.sugerido.precisao)} / ${pct(a.sugerido.revocacao)}` : '—';
    l.push(`| ${NOME_CAMPO[a.campo]} | ${a.n} | ${a.positivosHumanos} | ${at} | ${sg} |`);
  }
  l.push('', '_Precisão: dos alertas que o JEV deu, quantos a referência confirmou. Revocação: dos casos marcados na referência, quantos o JEV pegou._', '');
  return l.join('\n');
}

export type LinhaDetalhe = {
  titulo: string;
  rotulo: string;
  esperado: Omit<Marcacao, 'id'>;
  linha: LinhaAvaliada;
};

/** Tabela das etapas em que o JEV divergiu do esperado — é onde se aprende. */
export function tabelaDivergencias(itens: LinhaDetalhe[]): string {
  const campos = [['c4', 'inventaFato', 'inventa fato', (c: Criterio) => c.pct], ['c6', 'generica', 'genérica', (c: Criterio) => 100 - c.pct], ['c8', 'duplicada', 'repetida', (c: Criterio) => c.pct]] as const;
  const linhas: string[] = [];
  for (const it of itens) {
    const g = it.linha.geral;
    const faixaJev = g === null ? 'nao_avaliado' : faixaComCortes(g, CORTES_ATUAIS);
    const problemas: string[] = [];
    if (faixaJev !== it.esperado.faixa) problemas.push(`faixa ${faixaJev} (esperado ${it.esperado.faixa})`);
    for (const [cod, campo, nome, conv] of campos) {
      const c = it.linha.criterios[cod];
      const esperado = it.esperado[campo];
      if (!c || typeof esperado !== 'boolean') continue;
      const v = conv(c);
      const alertou = v > LIMITE_ATUAL[cod];
      if (alertou !== esperado) problemas.push(`${alertou ? 'alertou' : 'não alertou'} ${nome} (${Math.round(v)}%)`);
    }
    if (problemas.length) linhas.push(`| ${it.titulo} | ${it.rotulo} | ${g ?? '—'}% | ${problemas.join('; ')} |`);
  }
  if (!linhas.length) return 'O JEV acertou todas as etapas com gabarito.\n';
  return ['| Etapa | Gabarito | Nota JEV | Divergência |', '|---|---|---|---|', ...linhas, ''].join('\n');
}
