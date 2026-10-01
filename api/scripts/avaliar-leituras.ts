/* A régua do PLANEJADOR propondo leituras (etapa 3, antes da 3b).
   Mede o caminho inteiro, como a pesquisa vai funcionar:
   1. o planejador recebe a tarefa COM o contexto da plataforma e decide
      se ela tem interpretações (BOARD-PESQUISA-102);
   2. se tiver, o JEV escolhe uma — e a régua confere se ela corresponde
      à leitura certa do gabarito;
   3. se não tiver (o contexto resolveu), a régua confere se as perguntas
      do plano pesquisam a leitura certa;
   4. nos casos CLAROS, o certo é não haver interpretações.

   A correspondência entre frases (a leitura do gabarito e a proposta
   pelo planejador) é julgada pelo JEV — um juiz falível. Por isso o
   script imprime as frases: os casos marcados como erro têm de ser
   LIDOS antes de qualquer conclusão.

   Uso (na pasta api):  npx tsx scripts/avaliar-leituras.ts
   Custo: 31 planejamentos (o modelo do planejador, IA_MODELO) e até ~60
   chamadas ao JEV — da ordem de R$ 0,50. Não grava nada no banco e não
   cobra saldo de ninguém. */

import { env } from '../src/env.js';
import { avaliarComJev } from '../src/ia/avaliacao/jev.js';
import { planejarComModelo } from '../src/pesquisa/planejador.js';
import {
  loteDeDesambiguacao, leituraEscolhida, loteDeCorrespondencia, lotePlanoNaLeitura, textoDoContextoDaTarefa,
  CHAVE_CORRESPONDENCIA, CHAVE_PLANO_NA_LEITURA, NENHUMA, type ContextoDaTarefa,
} from '../src/pesquisa/desambiguar.js';
import { AMBIGUOS, CLAROS, CONTEXTO_IHOUSELOG, CONTEXTOS, SOBRE_A_EMPRESA, casosConfirmados } from '../corpus/desambiguacao.js';

const META_REGUA = 0.85;
const META_DECISAO = 0.75;
const chaveIa = env.IA_API_KEY;
const modeloPlanejador = env.IA_MODELO;
const jev = { chave: env.TYPESAFE_API_KEY, baseUrl: env.TYPESAFE_BASE_URL, modelo: env.TYPESAFE_MODELO, timeoutMs: Math.max(env.TYPESAFE_TIMEOUT_MS, 20_000) };
if (!chaveIa || !modeloPlanejador || !jev.chave) {
  console.error('Faltam no .env: IA_API_KEY, IA_MODELO e TYPESAFE_API_KEY. Sem eles não há o que medir.');
  process.exit(1);
}

const NEUTRO: ContextoDaTarefa = { projeto: 'iHouseLog — Startup', atividade: 'Pesquisa inicial', tarefasIrmas: ['Levantar referências', 'Organizar o que já sabemos'] };
const textoDoContexto = (c: ContextoDaTarefa) => `FICHA DA EMPRESA\n${CONTEXTO_IHOUSELOG}\n\n${textoDoContextoDaTarefa(c)}`;

let tokensPlano = 0;
async function planejar(tarefa: string, c: ContextoDaTarefa) {
  try {
    const s = await planejarComModelo({ tarefa, contexto: textoDoContexto(c), chave: chaveIa!, modelo: modeloPlanejador! });
    tokensPlano += s.uso.entrada;
    return s.plano;
  } catch (e) {
    return null;
  }
}
async function perguntarJev(lote: Parameters<typeof avaliarComJev>[0]) {
  const r = await avaliarComJev(lote, jev);
  return r.ok ? r.respostas : null;
}

console.log(`Régua do planejador propondo leituras — modelo do planejador: ${modeloPlanejador}; juiz: ${jev.modelo}\n`);

let ambOk = 0, ambMedidos = 0, comLeituras = 0, certaPresente = 0, semLeituras = 0, semLeiturasOk = 0, seguros = 0, segurosOk = 0;
const paraLer: string[] = [];

for (const c of casosConfirmados()) {
  const ctx: ContextoDaTarefa = { ...CONTEXTOS[c.id]!, sobreAEmpresa: SOBRE_A_EMPRESA };
  const tarefa = CONTEXTOS[c.id]?.descricaoDaTarefa ?? c.tarefa;
  const certa = c.leituras.find((l) => l.id === c.certa)!.leitura;
  const plano = await planejar(tarefa, ctx);
  if (!plano) { console.log(`  FALHOU   ${c.id.padEnd(18)} o planejamento não voltou`); continue; }
  const propostas = (plano.interpretacoes ?? []).map((i) => ({ id: i.id, leitura: i.leitura }));

  if (propostas.length >= 2) {
    comLeituras++;
    const esc = leituraEscolhida(await perguntarJev(loteDeDesambiguacao({ tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras: propostas, contexto: ctx })));
    const corrResp = (await perguntarJev(loteDeCorrespondencia(certa, propostas)))?.[CHAVE_CORRESPONDENCIA];
    const corr = corrResp && corrResp.type === 'choice' ? corrResp.choice : null;
    if (!esc || !corr) { console.log(`  FALHOU   ${c.id.padEnd(18)} o JEV não respondeu`); continue; }
    ambMedidos++;
    if (corr !== NENHUMA) certaPresente++;
    const ok = corr !== NENHUMA && esc.id === corr;
    if (ok) ambOk++;
    if (esc.probabilidade >= META_DECISAO) { seguros++; if (ok) segurosOk++; }
    console.log(`  ${ok ? 'ok      ' : 'ERROU   '} ${c.id.padEnd(18)} ${propostas.length} leituras; escolheu ${esc.id} (${Math.round(esc.probabilidade * 100)}%); a certa corresponde a: ${corr}`);
    if (!ok) paraLer.push(`${c.id}: certa = "${certa}"\n     propostas: ${propostas.map((p) => `(${p.id}) ${p.leitura}`).join(' | ')}\n     escolhida: ${esc.id}; correspondência julgada: ${corr}`);
  } else {
    semLeituras++;
    const r = (await perguntarJev(lotePlanoNaLeitura(certa, plano.perguntas.map((p) => p.pergunta))))?.[CHAVE_PLANO_NA_LEITURA];
    if (!r || r.type !== 'noul') { console.log(`  FALHOU   ${c.id.padEnd(18)} o JEV não respondeu`); continue; }
    ambMedidos++;
    const ok = r.noul >= 0.5;
    if (ok) { ambOk++; semLeiturasOk++; }
    console.log(`  ${ok ? 'ok      ' : 'ERROU   '} ${c.id.padEnd(18)} sem interpretações (o contexto resolveu); plano na leitura certa: ${Math.round(r.noul * 100)}%`);
    if (!ok) paraLer.push(`${c.id}: certa = "${certa}"\n     perguntas do plano: ${plano.perguntas.map((p) => p.pergunta).join(' | ')}`);
  }
}

console.log('\nClaros (o certo é NÃO propor interpretações):');
let clarosOk = 0;
for (const c of CLAROS) {
  const plano = await planejar(c.tarefa, { ...NEUTRO, sobreAEmpresa: SOBRE_A_EMPRESA });
  const n = plano?.interpretacoes?.length ?? -1;
  if (n === 0) clarosOk++;
  console.log(`  ${n === 0 ? 'ok      ' : n < 0 ? 'FALHOU  ' : 'ERROU   '} ${c.id.padEnd(22)} ${n < 0 ? 'o planejamento não voltou' : `${n} interpretação(ões)`}`);
  if (n > 0) paraLer.push(`${c.id} (claro): "${c.tarefa}"\n     propostas: ${plano!.interpretacoes!.map((p) => `(${p.id}) ${p.leitura}`).join(' | ')}`);
}

const acerto = ambMedidos ? ambOk / ambMedidos : 0;
console.log(`\nAmbíguos, caminho inteiro: ${ambOk}/${ambMedidos} (${Math.round(acerto * 100)}%) — meta ${Math.round(META_REGUA * 100)}%: ${acerto >= META_REGUA ? 'ATINGIDA' : 'não'}`);
console.log(`  com interpretações propostas: ${comLeituras} — a certa estava entre elas em ${certaPresente}; decisões seguras (≥${Math.round(META_DECISAO * 100)}%): ${seguros}, das quais certas ${segurosOk}`);
console.log(`  sem interpretações (o contexto resolveu): ${semLeituras} — plano na leitura certa em ${semLeiturasOk}`);
console.log(`Claros sem interpretações: ${clarosOk}/${CLAROS.length}`);
console.log(`Tokens de entrada do planejador: ${tokensPlano}.`);
if (paraLer.length) console.log(`\nPara LER (o juiz de correspondência pode errar):\n- ${paraLer.join('\n- ')}`);
