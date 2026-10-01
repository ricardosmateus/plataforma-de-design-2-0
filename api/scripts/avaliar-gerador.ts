/* A régua do GERADOR de tarefas (ATV-GERAR-024): o prompt de hoje
   contra o candidato, medidos pelo caminho que a tarefa vai percorrer
   de verdade — o planejador e a conferência do JEV.

   Para cada atividade (as da régua de desambiguação, com as tarefas
   irmãs e "Sobre a empresa"), o gerador cria uma tarefa de Pesquisa com
   cada prompt. Cada tarefa gerada passa por `decidirLeitura`, e mede-se:
   - SEGUE DIRETO: o planejador entende de primeira — sem ver
     ambiguidade e com o plano fiel à tarefa (≥ 75%), sem replanejar;
   - PESQUISÁVEL: o JEV julga que fatos públicos com fonte respondem;
   - PEDE O QUE NÃO SE ENTREGA: mood board, imagens, arquivo, opinião
     (conferido por código, no texto da descrição).
   Não precisa de gabarito: é a própria pesquisa dizendo se entendeu.

   Uso (na pasta api):  npx tsx scripts/avaliar-gerador.ts --rodadas 3
   Custo por rodada: 16 gerações, 16 a ~30 planejamentos e ~50 chamadas
   ao JEV — da ordem de R$ 0,40 com o Haiku. Não grava nada no banco e
   não cobra saldo de ninguém. */

import { env } from '../src/env.js';
import { avaliarComJev } from '../src/ia/avaliacao/jev.js';
import { pedirTarefa, interpretarTarefa, montarMensagemTarefa, SISTEMA_TAREFA, SISTEMA_TAREFA_CANDIDATO } from '../src/ia/gerar-tarefa.js';
import { planejarComModelo, instrucaoDeReplanejamento } from '../src/pesquisa/planejador.js';
import { loteDeDesambiguacao, leituraEscolhida, loteDeAderencia, aderenciaDe, textoDoContextoDaTarefa, type ContextoDaTarefa } from '../src/pesquisa/desambiguar.js';
import { decidirLeitura } from '../src/pesquisa/decidir-leitura.js';
import { CONTEXTO_IHOUSELOG, CONTEXTOS, SOBRE_A_EMPRESA } from '../corpus/desambiguacao.js';
import type { Lote } from '../src/ia/avaliacao/perguntas.js';

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const RODADAS = Math.max(1, Math.min(5, Number(opcao('rodadas') ?? 1) || 1));
const chaveIa = env.IA_API_KEY;
const modelo = env.IA_MODELO;
const jev = { chave: env.TYPESAFE_API_KEY, baseUrl: env.TYPESAFE_BASE_URL, modelo: env.TYPESAFE_MODELO, timeoutMs: Math.max(env.TYPESAFE_TIMEOUT_MS, 20_000) };
if (!chaveIa || !modelo || !jev.chave) {
  console.error('Faltam no .env: IA_API_KEY, IA_MODELO e TYPESAFE_API_KEY.');
  process.exit(1);
}

/* As atividades da régua de desambiguação, cada uma com TODAS as
   tarefas irmãs que aparecem nela — é o "não repita" do gerador. */
const PROJETO = 'iHouseLog — Startup';
const atividades = new Map<string, Set<string>>();
for (const c of Object.values(CONTEXTOS)) {
  const s = atividades.get(c.atividade) ?? new Set<string>();
  c.tarefasIrmas.forEach((t) => s.add(t));
  atividades.set(c.atividade, s);
}

const PROMPTS: Array<[string, string]> = [['atual', SISTEMA_TAREFA], ['candidato', SISTEMA_TAREFA_CANDIDATO]];
const PROIBIDO = /mood ?board|imagens|arquivo|apresenta[çc][ãa]o|opini[ãa]o/i;

async function jevResponde(lote: Lote) {
  const r = await avaliarComJev(lote, jev);
  return r.ok ? r.respostas : null;
}
function lotePesquisavel(tarefa: string): Lote {
  return {
    state: { empresa: CONTEXTO_IHOUSELOG, tarefa },
    questions: {
      pesquisavel: {
        type: 'noul',
        instructions: 'Esta tarefa pode ser respondida com fatos públicos, com fonte, por uma busca na web — sem pedir imagens, mood board, arquivos ou opinião?',
      },
    },
  };
}

type Linha = { atividade: string; titulo: string; descricao: string; direto: boolean; pesquisavel: boolean; proibido: boolean; replanejou: boolean; leituras: number };

async function avaliarUma(sistema: string, atividade: string, irmas: string[]): Promise<Linha | null> {
  const mensagem = montarMensagemTarefa({
    tipo: 'pesquisa',
    empresaNome: 'iHouseLog',
    empresaDescricao: CONTEXTO_IHOUSELOG,
    projetoNome: PROJETO,
    atividadeTitulo: atividade,
    atividadeDescricao: null,
    tarefas: irmas.map((t) => ({ titulo: t, tipo: 'pesquisa', status: 'pendente' })),
    conhecimento: SOBRE_A_EMPRESA.map((f) => `- ${f}`).join('\n'),
    concorrentesConhecidos: [],
  });
  const g = await pedirTarefa(mensagem, sistema);
  const proposta = g.ok ? interpretarTarefa(g.bruto) : null;
  if (!proposta) return null;

  const ctx: ContextoDaTarefa = { projeto: PROJETO, atividade, tarefasIrmas: irmas, sobreAEmpresa: SOBRE_A_EMPRESA };
  const tarefa = proposta.descricao;
  const texto = `FICHA DA EMPRESA\n${CONTEXTO_IHOUSELOG}\n\n${textoDoContextoDaTarefa(ctx)}`;
  const planejar = async (instrucaoExtra?: string) => {
    try { return (await planejarComModelo({ tarefa, contexto: texto, chave: chaveIa!, modelo: modelo!, instrucaoExtra })).plano; } catch { return null; }
  };
  const d = await decidirLeitura({
    planejar: () => planejar(),
    replanejar: (a) => planejar(instrucaoDeReplanejamento(a)),
    escolher: async (leituras) => leituraEscolhida(await jevResponde(loteDeDesambiguacao({ tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras, contexto: ctx }))),
    conferir: async (perguntas) => aderenciaDe(await jevResponde(loteDeAderencia({ tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, contexto: ctx, perguntas }))),
  });
  const p = (await jevResponde(lotePesquisavel(tarefa)))?.pesquisavel;
  return {
    atividade,
    titulo: proposta.titulo,
    descricao: proposta.descricao,
    direto: !!d && d.modo === 'plano-fiel',
    pesquisavel: !!p && p.type === 'noul' && p.noul >= 0.5,
    proibido: PROIBIDO.test(proposta.descricao),
    replanejou: !!d?.replanejou,
    leituras: d?.plano.interpretacoes?.length ?? 0,
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
console.log(`Régua do gerador — modelo: ${modelo}; JEV: ${jev.modelo}; ${atividades.size} atividades; ${RODADAS} rodada(s)\n`);

const total: Record<string, Linha[]> = { atual: [], candidato: [] };
const ultima: Record<string, Linha[]> = { atual: [], candidato: [] };
let falhas = 0;
for (let r = 0; r < RODADAS; r++) {
  for (const [nome, sistema] of PROMPTS) {
    const desta: Linha[] = [];
    for (const [atividade, irmas] of atividades) {
      const l = await avaliarUma(sistema, atividade, [...irmas]);
      if (!l) { falhas++; continue; }
      desta.push(l);
    }
    total[nome]!.push(...desta);
    ultima[nome] = desta;
    console.log(`  rodada ${r + 1}, ${nome.padEnd(9)} segue direto ${pct(desta.filter((x) => x.direto).length, desta.length)} · pesquisável ${pct(desta.filter((x) => x.pesquisavel).length, desta.length)} · pede o que não se entrega ${desta.filter((x) => x.proibido).length}`);
  }
}

console.log('\nTotal das rodadas:');
for (const [nome] of PROMPTS) {
  const t = total[nome]!;
  const chars = t.length ? Math.round(t.reduce((a, x) => a + x.descricao.length, 0) / t.length) : 0;
  console.log(`  ${nome.padEnd(9)} segue direto ${pct(t.filter((x) => x.direto).length, t.length)} · pesquisável ${pct(t.filter((x) => x.pesquisavel).length, t.length)} · com leituras ${t.filter((x) => x.leituras >= 2).length} · replanejadas ${t.filter((x) => x.replanejou).length} · pede o que não se entrega ${t.filter((x) => x.proibido).length} · descrição média ${chars} caracteres (n=${t.length})`);
}
if (falhas) console.log(`  gerações que falharam: ${falhas}`);

console.log('\nAs tarefas da última rodada, para LER (o número não diz se a tarefa é boa para o time):');
for (const [nome] of PROMPTS) {
  console.log(`\n  [${nome}]`);
  for (const l of ultima[nome]!) {
    console.log(`  · ${l.atividade}: ${l.titulo}\n      ${l.descricao}\n      ${l.direto ? 'segue direto' : l.leituras >= 2 ? `${l.leituras} leituras` : l.replanejou ? 'replanejada' : 'sem conferência'}${l.pesquisavel ? '' : ' · NÃO pesquisável'}${l.proibido ? ' · PEDE O QUE NÃO SE ENTREGA' : ''}`);
  }
}
