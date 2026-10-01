/* A régua da etapa 3 (v2, fase 3a): o JEV escolhe a leitura de cada
   pedido ambíguo do gabarito (corpus/desambiguacao.ts), em DOIS modos,
   e o acerto é medido contra a leitura certa.

   - "só a tarefa": a frase curta e uma linha sobre a empresa (como a
     primeira rodada, 01/10/2026: 80%, mas 18 de 18 acima de 75%);
   - "com contexto": mais o que a plataforma sabe da tarefa — projeto,
     atividade, tarefas irmãs, descrição completa e "Sobre a empresa".

   Meta da decisão: 75% de probabilidade (E1). Meta da régua: 85% de
   acerto. O modo "com diálogo" entra na fase 3c.

   Uso (na pasta api):  npx tsx scripts/avaliar-desambiguacao.ts
   Custo: 50 chamadas ao JEV (25 casos × 2 modos), da ordem de centavos.
   Não grava nada no banco e não cobra saldo de ninguém. */

import { env } from '../src/env.js';
import { avaliarComJev } from '../src/ia/avaliacao/jev.js';
import { loteDeDesambiguacao, leituraEscolhida, type ContextoDaTarefa, type Escolha } from '../src/pesquisa/desambiguar.js';
import { AMBIGUOS, CONTEXTO_IHOUSELOG, CONTEXTOS, SOBRE_A_EMPRESA, casosConfirmados } from '../corpus/desambiguacao.js';

const META_REGUA = 0.85;
const META_DECISAO = 0.75;
const cfg = {
  chave: env.TYPESAFE_API_KEY,
  baseUrl: env.TYPESAFE_BASE_URL,
  modelo: env.TYPESAFE_MODELO,
  timeoutMs: Math.max(env.TYPESAFE_TIMEOUT_MS, 20_000),
};
if (!cfg.chave) {
  console.error('TYPESAFE_API_KEY não está no .env: sem ela não há o que medir.');
  process.exit(1);
}

type Modo = 'tarefa' | 'contexto';
const NOMES: Record<Modo, string> = { tarefa: 'só a tarefa', contexto: 'com contexto' };

const casos = casosConfirmados();
const pendentes = AMBIGUOS.length - casos.length;
console.log(`Régua de desambiguação v2 — ${casos.length} caso(s)${pendentes ? `, ${pendentes} com dúvida pendente (fora da conta)` : ''}. Modelo: ${cfg.modelo}\n`);

const res: Record<Modo, Array<{ id: string; e: Escolha | null; certo: boolean }>> = { tarefa: [], contexto: [] };
let tokens = 0;

for (const c of casos) {
  const ctx = CONTEXTOS[c.id];
  const linhas: string[] = [];
  for (const modo of ['tarefa', 'contexto'] as Modo[]) {
    const contexto: ContextoDaTarefa | undefined = modo === 'contexto' && ctx
      ? { ...ctx, sobreAEmpresa: SOBRE_A_EMPRESA }
      : undefined;
    const r = await avaliarComJev(loteDeDesambiguacao({ tarefa: c.tarefa, contextoEmpresa: CONTEXTO_IHOUSELOG, leituras: c.leituras, contexto }), cfg);
    const e = r.ok ? leituraEscolhida(r.respostas) : null;
    if (r.ok) tokens += r.chamada.uso?.entrada ?? 0;
    const certo = !!e && e.id === c.certa;
    res[modo].push({ id: c.id, e, certo });
    linhas.push(e ? `${certo ? 'ok   ' : 'ERROU'} ${e.id} ${String(Math.round(e.probabilidade * 100)).padStart(3)}%` : `FALHOU ${r.ok ? 'formato' : r.motivo}`);
  }
  console.log(`  ${c.id.padEnd(18)} só a tarefa: ${linhas[0]!.padEnd(16)} com contexto: ${linhas[1]}${ctx?.neutro ? '   [contexto neutro]' : ''}  (certo: ${c.certa})`);
}

console.log('');
for (const modo of ['tarefa', 'contexto'] as Modo[]) {
  const r = res[modo];
  const medidos = r.filter((x) => x.e);
  const acertos = medidos.filter((x) => x.certo).length;
  const seguros = medidos.filter((x) => x.e!.probabilidade >= META_DECISAO);
  const segurosCertos = seguros.filter((x) => x.certo).length;
  const acerto = medidos.length ? acertos / medidos.length : 0;
  console.log(
    `${NOMES[modo].padEnd(13)} acerto ${acertos}/${medidos.length} (${Math.round(acerto * 100)}%, meta ${Math.round(META_REGUA * 100)}%: ${acerto >= META_REGUA ? 'ATINGIDA' : 'não'})` +
      ` · seguros (≥${Math.round(META_DECISAO * 100)}%): ${seguros.length}, dos quais certos ${segurosCertos}` +
      ` · iriam para o diálogo: ${medidos.length - seguros.length}` +
      (r.length - medidos.length ? ` · falhas: ${r.length - medidos.length}` : ''),
  );
}

/* Os neutros: o contexto que não decide não pode resolver sozinho o que
   era inseguro, e não pode estragar o que era seguro. */
console.log('\nContexto neutro:');
for (const c of casos.filter((x) => CONTEXTOS[x.id]?.neutro)) {
  const antes = res.tarefa.find((x) => x.id === c.id)!;
  const depois = res.contexto.find((x) => x.id === c.id)!;
  const eraSeguro = !!antes.e && antes.e.probabilidade >= META_DECISAO;
  const ficouSeguro = !!depois.e && depois.e.probabilidade >= META_DECISAO;
  const leitura = eraSeguro
    ? (depois.certo ? 'continua certo, como devia' : 'ERA SEGURO E PIOROU — o contexto atrapalhou')
    : (ficouSeguro ? 'ficou seguro sem contexto que decide — olhar se o caso é ambíguo mesmo' : 'continua inseguro, como devia: é caso para o diálogo');
  console.log(`  ${c.id.padEnd(18)} ${leitura}`);
}
console.log(`\nTokens de entrada: ${tokens}.`);
