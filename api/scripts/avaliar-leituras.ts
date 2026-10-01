/* A régua do caminho inteiro (etapa 3): o planejador propõe, o JEV
   confere ou escolhe, o planejador replaneja com lentes quando o JEV
   julga o plano infiel à tarefa (BOARD-PESQUISA-102/103).

   Primeira rodada (01/10/2026, sem conferência nem replanejamento):
   80% nos ambíguos e 5 de 6 nos claros. Os erros eram do PLANEJADOR —
   desvio puxado pelo contexto (Síndicos, Regulação), leitura certa que
   não foi vista (Shopee, iFood) e ambiguidade a mais ou a menos
   (Concorrentes, condomínios em SP).

   A correspondência entre a leitura do gabarito e a decidida é julgada
   pelo JEV — juiz falível —, e por isso as frases dos erros são
   impressas para LEITURA HUMANA.

   Uso (na pasta api):
     npx tsx scripts/avaliar-leituras.ts
     npx tsx scripts/avaliar-leituras.ts --rodadas 3
     npx tsx scripts/avaliar-leituras.ts --rodadas 3 --modelo claude-sonnet-4-5-20250929
   `--modelo` troca SÓ o planejador desta régua; o .env não muda.
   `--rodadas` repete a régua: o planejador não responde igual duas vezes,
   e uma rodada só não separa o efeito de uma mudança do ruído
   (01/10/2026: Síndicos e Regulação mudaram de lado sem mudança nenhuma).
   Custo por rodada: 31 a ~45 planejamentos e até ~100 chamadas ao JEV —
   ~R$ 0,60 com o Haiku, ~R$ 1,60 com o Sonnet 4.5. Não grava nada no banco
   e não cobra saldo. */

import { env } from '../src/env.js';
import { avaliarComJev } from '../src/ia/avaliacao/jev.js';
import { planejarComModelo, instrucaoDeReplanejamento } from '../src/pesquisa/planejador.js';
import {
  loteDeDesambiguacao, leituraEscolhida, loteDeCorrespondencia, lotePlanoNaLeitura, loteDeAderencia, aderenciaDe,
  textoDoContextoDaTarefa, CHAVE_CORRESPONDENCIA, CHAVE_PLANO_NA_LEITURA, NENHUMA, type ContextoDaTarefa,
} from '../src/pesquisa/desambiguar.js';
import { decidirLeitura, type Decisao } from '../src/pesquisa/decidir-leitura.js';
import { CLAROS, CONTEXTO_IHOUSELOG, CONTEXTOS, SOBRE_A_EMPRESA, casosConfirmados } from '../corpus/desambiguacao.js';

const META_REGUA = 0.85;
function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const RODADAS = Math.max(1, Math.min(5, Number(opcao('rodadas') ?? 1) || 1));
const chaveIa = env.IA_API_KEY;
const modeloPlanejador = opcao('modelo') ?? env.IA_MODELO;
const jev = { chave: env.TYPESAFE_API_KEY, baseUrl: env.TYPESAFE_BASE_URL, modelo: env.TYPESAFE_MODELO, timeoutMs: Math.max(env.TYPESAFE_TIMEOUT_MS, 20_000) };
if (!chaveIa || !modeloPlanejador || !jev.chave) {
  console.error('Faltam no .env: IA_API_KEY, IA_MODELO e TYPESAFE_API_KEY. Sem eles não há o que medir.');
  process.exit(1);
}

const NEUTRO: ContextoDaTarefa = { projeto: 'iHouseLog — Startup', atividade: 'Pesquisa inicial', tarefasIrmas: ['Levantar referências', 'Organizar o que já sabemos'] };
const textoDoContexto = (c: ContextoDaTarefa) => `FICHA DA EMPRESA\n${CONTEXTO_IHOUSELOG}\n\n${textoDoContextoDaTarefa(c)}`;
let planejamentos = 0;

async function jevResponde(lote: Parameters<typeof avaliarComJev>[0]) {
  const r = await avaliarComJev(lote, jev);
  return r.ok ? r.respostas : null;
}

function decidir(tarefa: string, ctx: ContextoDaTarefa): Promise<Decisao | null> {
  const planejar = async (instrucaoExtra?: string) => {
    planejamentos++;
    try {
      return (await planejarComModelo({ tarefa, contexto: textoDoContexto(ctx), chave: chaveIa!, modelo: modeloPlanejador!, instrucaoExtra })).plano;
    } catch {
      return null;
    }
  };
  return decidirLeitura({
    planejar: () => planejar(),
    replanejar: (anteriores) => planejar(instrucaoDeReplanejamento(anteriores)),
    escolher: async (leituras) => leituraEscolhida(await jevResponde(loteDeDesambiguacao({ tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras, contexto: ctx }))),
    conferir: async (perguntas) => aderenciaDe(await jevResponde(loteDeAderencia({ tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, contexto: ctx, perguntas }))),
  });
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

type Rodada = { ok: number; medidos: number; clarosOk: number; replanejados: number; porCaso: Map<string, boolean>; paraLer: string[] };

async function rodar(verboso: boolean): Promise<Rodada> {
  const r: Rodada = { ok: 0, medidos: 0, clarosOk: 0, replanejados: 0, porCaso: new Map(), paraLer: [] };
  for (const c of casosConfirmados()) {
    const ctx: ContextoDaTarefa = { ...CONTEXTOS[c.id]!, sobreAEmpresa: SOBRE_A_EMPRESA };
    const tarefa = CONTEXTOS[c.id]?.descricaoDaTarefa ?? c.tarefa;
    const certa = c.leituras.find((l) => l.id === c.certa)!.leitura;
    const d = await decidir(tarefa, ctx);
    if (!d) { if (verboso) console.log(`  FALHOU   ${c.id.padEnd(18)} o planejamento não voltou`); continue; }
    if (d.replanejou) r.replanejados++;
    let certo: boolean | null = null;
    let detalhe = '';
    if (d.escolhida) {
      const j = (await jevResponde(loteDeCorrespondencia(certa, [{ id: d.escolhida.id, leitura: d.escolhida.leitura }])))?.[CHAVE_CORRESPONDENCIA];
      if (j && j.type === 'choice') certo = j.choice !== NENHUMA;
      detalhe = `escolheu "${d.escolhida.leitura}" (${pct(d.escolha?.probabilidade)})`;
    } else {
      const j = (await jevResponde(lotePlanoNaLeitura(certa, d.plano.perguntas.map((p) => p.pergunta))))?.[CHAVE_PLANO_NA_LEITURA];
      if (j && j.type === 'noul') certo = j.noul >= 0.5;
      detalhe = `plano com aderência ${pct(d.aderencia)}${j && j.type === 'noul' ? `; na leitura certa: ${pct(j.noul)}` : ''}`;
    }
    if (certo === null) { if (verboso) console.log(`  FALHOU   ${c.id.padEnd(18)} o juiz não respondeu`); continue; }
    r.medidos++;
    if (certo) r.ok++;
    r.porCaso.set(c.id, certo);
    if (verboso) console.log(`  ${certo ? 'ok      ' : 'ERROU   '} ${c.id.padEnd(18)} [${d.modo}] ${detalhe}`);
    if (!certo) {
      r.paraLer.push(`${c.id} [${d.modo}]: certa = "${certa}"\n     ${d.escolhida
        ? `propostas: ${(d.plano.interpretacoes ?? []).map((p) => `(${p.id}) ${p.leitura}`).join(' | ')}`
        : `perguntas: ${d.plano.perguntas.map((p) => p.pergunta).join(' | ')}`}`);
    }
  }
  for (const c of CLAROS) {
    const d = await decidir(c.tarefa, { ...NEUTRO, sobreAEmpresa: SOBRE_A_EMPRESA });
    const bom = !!d && !d.escolhida;
    if (bom) r.clarosOk++;
    if (verboso) console.log(`  ${bom ? 'ok      ' : d ? 'ERROU   ' : 'FALHOU  '} ${c.id.padEnd(22)} ${d ? `[${d.modo}] aderência ${pct(d.aderencia)}` : 'o planejamento não voltou'} (claro)`);
    if (d?.escolhida) r.paraLer.push(`${c.id} (claro) [${d.modo}]: propostas: ${(d.plano.interpretacoes ?? []).map((p) => `(${p.id}) ${p.leitura}`).join(' | ')}`);
  }
  return r;
}

console.log(`Régua do caminho inteiro — planejador: ${modeloPlanejador}; JEV: ${jev.modelo}; ${RODADAS} rodada(s)\n`);
const rodadas: Rodada[] = [];
for (let i = 0; i < RODADAS; i++) {
  if (RODADAS > 1) console.log(`--- rodada ${i + 1} de ${RODADAS}`);
  const r = await rodar(RODADAS === 1);
  rodadas.push(r);
  console.log(`  ambíguos ${r.ok}/${r.medidos} (${pct(r.medidos ? r.ok / r.medidos : 0)}) · claros ${r.clarosOk}/${CLAROS.length} · replanejados ${r.replanejados}\n`);
}

const acertos = rodadas.map((r) => (r.medidos ? r.ok / r.medidos : 0));
const media = acertos.reduce((a, b) => a + b, 0) / acertos.length;
console.log(`Ambíguos, caminho inteiro — média ${pct(media)} (mín ${pct(Math.min(...acertos))}, máx ${pct(Math.max(...acertos))}) — meta ${pct(META_REGUA)}: ${media >= META_REGUA ? 'ATINGIDA' : 'não'}`);
console.log(`Claros — média ${(rodadas.reduce((a, r) => a + r.clarosOk, 0) / rodadas.length).toFixed(1)}/${CLAROS.length}. Planejamentos feitos: ${planejamentos}.`);

if (RODADAS > 1) {
  /* Quais casos mudam de lado sem mudança nenhuma: é o ruído, caso a caso. */
  const linhas: string[] = [];
  for (const c of casosConfirmados()) {
    const marcas = rodadas.map((r) => (r.porCaso.has(c.id) ? (r.porCaso.get(c.id) ? '✓' : '✗') : '·'));
    const certos = marcas.filter((m) => m === '✓').length;
    if (certos < rodadas.length) linhas.push(`  ${c.id.padEnd(18)} ${marcas.join(' ')}  ${certos === 0 ? '(errou sempre)' : '(muda de lado)'}`);
  }
  console.log(linhas.length ? `\nCasos que não acertaram em todas as rodadas:\n${linhas.join('\n')}` : '\nTodos os casos acertaram em todas as rodadas.');
}

const ultima = rodadas[rodadas.length - 1]!;
if (ultima.paraLer.length) console.log(`\nPara LER — erros da última rodada (o juiz pode errar):\n- ${ultima.paraLer.join('\n- ')}`);
