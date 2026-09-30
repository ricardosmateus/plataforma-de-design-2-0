/* ============================================================
   Calibração do JEV — automática (sem marcação manual)
   ============================================================
   Rodar:  npm run calibrar:automatico

   Regras: ia-avaliacao.md, IA-AVAL-014 · Plano §7, Fase 1

   Duas referências, nenhuma delas o próprio JEV (ele não pode
   calibrar a si mesmo: comparado consigo, sempre "acerta"):

   1. GABARITO — etapas escritas com o defeito já conhecido
      (src/ia/avaliacao/gabarito.ts). O JEV avalia agora, ao vivo, e
      o gabarito diz se acertou. É a prova.
   2. REVISOR — as etapas reais que o JEV já avaliou (tabela
      avaliacoes_ia) são revisadas pelo Claude no papel de product
      designer. É um indício: a referência é outra IA.

   Custo: é da PLATAFORMA, não de um usuário — nada é debitado de
   saldo nenhum. Os tokens gastos aparecem no fim.

   NÃO muda nenhum número do código. Grava
   `calibracao/relatorio-automatico-AAAA-MM-DD.md`.
   ============================================================ */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';
import { env } from '../src/env.js';
import { avaliarLote } from '../src/ia/avaliacao/avaliar.js';
import { dependenciasDoAmbiente } from '../src/ia/avaliacao/config.js';
import { montarLoteIdeias } from '../src/ia/avaliacao/perguntas.js';
import { CENARIOS, idCaso } from '../src/ia/avaliacao/gabarito.js';
import { revisarComClaude } from '../src/ia/avaliacao/revisor-claude.js';
import {
  analisar,
  secaoRelatorio,
  tabelaDivergencias,
  type LinhaAvaliada,
  type LinhaDetalhe,
  type Marcacao,
} from '../src/ia/avaliacao/calibracao.js';
import type { Criterio } from '../src/ia/avaliacao/normalizar.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const gasto: Record<string, { entrada: number; saida: number; chamadas: number }> = {};
function somar(modelo: string, entrada: number, saida: number) {
  const g = (gasto[modelo] ??= { entrada: 0, saida: 0, chamadas: 0 });
  g.entrada += entrada; g.saida += saida; g.chamadas++;
}

async function parteGabarito() {
  const deps = dependenciasDoAmbiente();
  if (!deps.jev.chave) throw new Error('TYPESAFE_API_KEY vazia no .env: sem ela o gabarito mediria o Claude, não o JEV.');

  const linhas: LinhaAvaliada[] = [];
  const marcacoes: Marcacao[] = [];
  const detalhes: LinhaDetalhe[] = [];
  const falhas: string[] = [];

  for (const cen of CENARIOS) {
    process.stdout.write(`  gabarito · ${cen.id} (${cen.casos.length} etapas)… `);
    const lote = montarLoteIdeias({ ...cen.contexto, etapas: cen.casos });
    /* Só o JEV: o Claude de reserva fica de fora, senão uma falha do
       JEV viraria nota do Claude e o relatório mediria a IA errada. */
    const r = await avaliarLote(lote, cen.casos.length, { ...deps, claude: { ...deps.claude, chave: undefined } });
    for (const c of r.chamadas) if (c.uso) somar(c.modelo, c.uso.entrada, c.uso.saida);
    if (r.avaliador !== 'jev') {
      falhas.push(`${cen.id}: o JEV não respondeu (${r.falhaJev ?? 'desconhecido'})`);
      console.log('falhou');
      continue;
    }
    console.log('ok');
    cen.casos.forEach((caso, i) => {
      const a = r.avaliacoes[i]!;
      const linha: LinhaAvaliada = { id: idCaso(cen.id, i), geral: a.geral, faixa: a.faixa, avaliador: a.avaliador, criterios: a.criterios };
      linhas.push(linha);
      marcacoes.push({ id: linha.id, ...caso.esperado });
      detalhes.push({ titulo: caso.titulo, rotulo: caso.rotulo, esperado: caso.esperado, linha });
    });
  }
  return { linhas, marcacoes, detalhes, falhas };
}

async function parteRevisor() {
  const deps = dependenciasDoAmbiente();
  const modelo = env.IA_MODELO_SONNET || env.IA_MODELO;
  const cfg = { ...deps.claude, modelo };
  if (!cfg.chave || !cfg.modelo) return { linhas: [], marcacoes: [], aviso: 'Sem IA_API_KEY/IA_MODELO: parte do revisor pulada.' };

  const avaliacoes = await db.avaliacaoIa.findMany({
    where: { alvoTipo: 'ideia', avaliador: { in: ['jev', 'claude'] } },
    orderBy: { criadoEm: 'asc' },
  });
  if (!avaliacoes.length) return { linhas: [], marcacoes: [], aviso: 'Nenhuma etapa real avaliada ainda.' };

  const ideias = await db.ideia.findMany({
    where: { id: { in: avaliacoes.map((a) => a.alvoId) } },
    select: { id: true, titulo: true, descricao: true, projetoId: true },
  });
  const ideiaPorId = new Map(ideias.map((i) => [i.id, i]));

  /* Agrupa por projeto: o revisor precisa do contexto do projeto
     (ficha, validadas, o que já existia) para julgar, e uma chamada
     por projeto sai mais barata que uma por etapa. */
  const porProjeto = new Map<string, typeof avaliacoes>();
  for (const a of avaliacoes) {
    if (!ideiaPorId.has(a.alvoId)) continue;
    const lista = porProjeto.get(a.projetoId) ?? [];
    lista.push(a);
    porProjeto.set(a.projetoId, lista);
  }

  const linhas: LinhaAvaliada[] = [];
  const marcacoes: Marcacao[] = [];

  for (const [projetoId, grupo] of porProjeto) {
    const projeto = await db.projeto.findUnique({
      where: { id: projetoId },
      select: { nome: true, tipo: true, empresa: { select: { nome: true, descricao: true } } },
    });
    if (!projeto) continue;
    const idsDoGrupo = new Set(grupo.map((a) => a.alvoId));
    const outras = await db.ideia.findMany({
      where: { projetoId, arquivadoEm: null, id: { notIn: [...idsDoGrupo] } },
      select: { titulo: true, status: true },
    });
    /* Em lotes de 10: resposta curta, sem risco de corte. */
    for (let ini = 0; ini < grupo.length; ini += 10) {
      const fatia = grupo.slice(ini, ini + 10);
      process.stdout.write(`  revisor · ${projeto.nome ?? projeto.tipo} (${fatia.length} etapas)… `);
      const r = await revisarComClaude(
        {
          projetoNome: projeto.nome ?? projeto.tipo,
          empresaNome: projeto.empresa.nome,
          empresaDescricao: projeto.empresa.descricao,
          validadas: outras.filter((o) => o.status === 'finalizado').map((o) => o.titulo),
          existentes: outras.map((o) => o.titulo),
          orientacao: null,
          etapas: fatia.map((a) => ideiaPorId.get(a.alvoId)!),
        },
        cfg,
      );
      if (!r.ok) { console.log(`falhou (${r.motivo})`); continue; }
      somar(r.modelo, r.uso.entrada, r.uso.saida);
      console.log('ok');
      fatia.forEach((a, i) => {
        const rev = r.revisoes[i];
        if (!rev) return;
        linhas.push({ id: a.id, geral: a.geral, faixa: a.faixa, avaliador: a.avaliador, criterios: (a.criterios ?? {}) as Record<string, Criterio> });
        marcacoes.push({ id: a.id, ...rev });
      });
    }
  }
  return { linhas, marcacoes, aviso: null as string | null };
}

async function main() {
  console.log('\nCalibração automática do JEV\n');
  const g = await parteGabarito();
  const rv = await parteRevisor();

  const hoje = new Date().toISOString().slice(0, 10);
  const partes: string[] = [`# Calibração automática do JEV — ${hoje}`, ''];
  partes.push('Duas referências: o **gabarito** (etapas com o defeito conhecido, a prova) e o **revisor** (Claude revisando as etapas reais, um indício). O JEV nunca é a própria referência.', '');

  if (g.falhas.length) partes.push(...g.falhas.map((f) => `> ⚠ ${f}`), '');
  if (g.linhas.length) {
    const r = analisar(g.linhas, g.marcacoes);
    /* O gabarito é pequeno por construção; o aviso de amostra do
       analisar vale para marcação humana, não aqui. */
    r.avisos = r.avisos.filter((a) => !a.startsWith('Amostra pequena'));
    partes.push(secaoRelatorio(r, 'Gabarito', `${g.linhas.length} etapas em ${CENARIOS.length} cenários`));
    partes.push('### Onde o JEV divergiu do gabarito', '', tabelaDivergencias(g.detalhes));
  }

  if (rv.aviso) partes.push('## Revisor (Claude)', '', `> ${rv.aviso}`, '');
  else partes.push(secaoRelatorio(analisar(rv.linhas, rv.marcacoes), 'Revisor (Claude) nas etapas reais', `Revisor: ${env.IA_MODELO_SONNET || env.IA_MODELO}`));

  partes.push('## Gasto desta rodada', '', '| Modelo | Chamadas | Tokens de entrada | Tokens de saída |', '|---|---|---|---|');
  for (const [m, v] of Object.entries(gasto)) partes.push(`| ${m} | ${v.chamadas} | ${v.entrada} | ${v.saida} |`);
  partes.push('', 'Custo da plataforma, não debitado de nenhum usuário.', '');
  partes.push('Nada foi alterado no código. Se os números convencerem, registre a decisão em `ia-avaliacao.md` (IA-AVAL-014) e ajuste `normalizar.ts`.', '');

  const md = partes.join('\n');
  const pasta = join(raiz, 'calibracao');
  mkdirSync(pasta, { recursive: true });
  const saida = join(pasta, `relatorio-automatico-${hoje}.md`);
  writeFileSync(saida, md);
  console.log('\n' + md);
  console.log(`Relatório gravado em:\n  ${saida}\n`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
