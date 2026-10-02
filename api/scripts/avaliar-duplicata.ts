/* A régua da frente A (planejamento-jev-assistente.md): o JEV escolhe,
   entre as ideias existentes, a que é a MESMA da ideia nova — ou
   "nenhuma". Mede-se o acerto contra o gabarito
   (corpus/ideias-duplicadas.ts), e os dois erros separados, porque não
   custam o mesmo:
   - ALERTA FALSO: avisar de uma duplicata que não existe — atrapalha
     quem está criando, e ensina a ignorar o aviso;
   - ALERTA PERDIDO: deixar passar uma duplicata — o defeito de hoje.

   Uso (na pasta api):  npx tsx scripts/avaliar-duplicata.ts --rodadas 3
   Custo: uma chamada ao JEV por caso por rodada — centavos.
   Não grava nada no banco e não cobra saldo de ninguém. */

import { env } from '../src/env.js';
import { avaliarComJev } from '../src/ia/avaliacao/jev.js';
import { loteDeDuplicata, escolhaDuplicata, NENHUMA_DUPLICATA } from '../src/ia/duplicata-ideia.js';
import { CASOS_DUPLICATA, CONTEXTO_EMPRESA_DUPLICATA, casosConfirmadosDuplicata } from '../corpus/ideias-duplicadas.js';

const META = 0.85;
const META_DECISAO = 0.75;
function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const RODADAS = Math.max(1, Math.min(5, Number(opcao('rodadas') ?? 1) || 1));
const jev = { chave: env.TYPESAFE_API_KEY, baseUrl: env.TYPESAFE_BASE_URL, modelo: env.TYPESAFE_MODELO, timeoutMs: Math.max(env.TYPESAFE_TIMEOUT_MS, 20_000) };
if (!jev.chave) {
  console.error('TYPESAFE_API_KEY não está no .env: sem ela não há o que medir.');
  process.exit(1);
}

const casos = casosConfirmadosDuplicata();
const pendentes = CASOS_DUPLICATA.length - casos.length;
console.log(`Régua de ideias duplicadas — ${casos.length} caso(s)${pendentes ? `, ${pendentes} com dúvida pendente (fora da conta)` : ''}; ${RODADAS} rodada(s). JEV: ${jev.modelo}\n`);

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const porCaso = new Map<string, string[]>();
const acertos: number[] = [];
let falsos = 0, perdidos = 0, seguros = 0, segurosCertos = 0, medidos = 0, falhas = 0;
/* O LIMITE DE CONFIANÇA, medido e DESCARTADO (Ricardo, 02/10/2026).
   Com "alerta só com ≥ 75%", a 2ª rodada perdeu 4 duplicatas verdadeiras
   para evitar 1 alerta falso — e o caso que ele queria barrar veio com
   exatamente 75%. Como o alerta é uma PERGUNTA ("parece com X, criar
   mesmo assim?"), um alerta falso custa um clique, e uma duplicata
   perdida é o defeito que a frente A conserta. A regra da tela é a
   escolha do JEV, sem limite. A linha fica para comparar no futuro. */
let regraFalsos = 0, regraPerdidos = 0, regraCertos = 0;

for (let r = 0; r < RODADAS; r++) {
  let ok = 0, n = 0;
  for (const c of casos) {
    const resp = await avaliarComJev(loteDeDuplicata({ contextoEmpresa: CONTEXTO_EMPRESA_DUPLICATA, nova: c.nova, existentes: c.existentes }), jev);
    const e = resp.ok ? escolhaDuplicata(resp.respostas) : null;
    if (!e) { falhas++; (porCaso.get(c.id) ?? porCaso.set(c.id, []).get(c.id)!).push('·'); continue; }
    n++; medidos++;
    const certo = e.id === c.certa;
    if (certo) ok++;
    else if (c.certa === NENHUMA_DUPLICATA) falsos++;
    else perdidos++;
    if (e.probabilidade >= META_DECISAO) { seguros++; if (certo) segurosCertos++; }
    const alerta = e.id !== NENHUMA_DUPLICATA && e.probabilidade >= META_DECISAO ? e.id : NENHUMA_DUPLICATA;
    if (alerta === c.certa) regraCertos++;
    else if (c.certa === NENHUMA_DUPLICATA) regraFalsos++;
    else regraPerdidos++;
    (porCaso.get(c.id) ?? porCaso.set(c.id, []).get(c.id)!).push(certo ? '✓' : `✗ escolheu ${e.id} (${Math.round(e.probabilidade * 100)}%)`);
  }
  acertos.push(n ? ok / n : 0);
  console.log(`  rodada ${r + 1}: acerto ${ok}/${n} (${pct(ok, n)})`);
}

const media = acertos.reduce((a, b) => a + b, 0) / acertos.length;
console.log(`\nAcerto médio: ${Math.round(media * 100)}% (mín ${Math.round(Math.min(...acertos) * 100)}%, máx ${Math.round(Math.max(...acertos) * 100)}%) — meta ${Math.round(META * 100)}%: ${media >= META ? 'ATINGIDA' : 'não'}`);
console.log(`Alertas FALSOS (avisou de duplicata que não existe): ${falsos} · alertas PERDIDOS (deixou passar): ${perdidos}`);
console.log(`\nSe houvesse limite (alerta só com ≥${Math.round(META_DECISAO * 100)}%, descartado em 02/10/2026): acerto ${pct(regraCertos, medidos)} · alertas falsos ${regraFalsos} · alertas perdidos ${regraPerdidos}`);
console.log(`Decisões seguras (≥${Math.round(META_DECISAO * 100)}%): ${seguros}, das quais certas ${segurosCertos} (${pct(segurosCertos, seguros)})${falhas ? ` · falhas de chamada: ${falhas}` : ''}`);

const erros = casos.filter((c) => (porCaso.get(c.id) ?? []).some((m) => m !== '✓'));
if (erros.length) {
  console.log('\nOs casos que não acertaram em todas as rodadas, para LER:');
  for (const c of erros) {
    console.log(`  · ${c.id}: "${c.nova.titulo}" — certa: ${c.certa}\n      ${(porCaso.get(c.id) ?? []).join(' | ')}\n      por quê: ${c.porque}`);
  }
}
