/* ============================================================
   A régua do planejador, com chamadas reais — Fase 4
   ============================================================
   Rode na SUA máquina:

     cd api && npx tsx avaliar-planejador.ts

   Um caso só, para iterar rápido:

     CASO=loggi-fidelidade npx tsx avaliar-planejador.ts

   ------------------------------------------------------------
   PARA QUE SERVE
   ------------------------------------------------------------
   A Fase 4 é "qualidade e custo": trocar modelo, mexer no prompt,
   cortar buscas, filtrar domínio. Toda mudança dessas é uma aposta
   sobre qualidade, e sem régua "melhorou?" é opinião de quem mexeu.

   Rode ANTES de mexer, guarde o número, mexa, rode de novo. Se o
   número não melhorou, a mudança não melhorou — por mais que o
   raciocínio por trás dela pareça bom. Foi assim que três defeitos
   apareceram em 14/09/2026, e em nenhum deles o raciocínio tinha
   apontado para o lugar certo.

   ------------------------------------------------------------
   O QUE ELE NÃO FAZ
   ------------------------------------------------------------
   Não dá nota de "qualidade da resposta" — isso exigiria um modelo
   juiz, que custa por rodada, deriva, e precisaria da própria
   avaliação para se saber confiável. Aqui só entra o que se confere
   por contagem e comparação de texto; o resto ele IMPRIME, e quem
   lê julga.

   Também não busca: mede o PLANEJADOR. Buscar multiplicaria o custo
   por dez para medir outra coisa.

   ------------------------------------------------------------
   CUSTO
   ------------------------------------------------------------
   Uma chamada de planejamento por caso — centavos no total. O valor
   sai no fim, com a comissão de 30% (DIN-008), que é o que sairia
   do saldo de um usuário de verdade.
   ============================================================ */
import 'dotenv/config';
import { planejarComModelo } from './src/pesquisa/planejador.js';
import { montarPacoteInterno, pacoteParaTexto } from './src/pesquisa/contexto-interno.js';
import { custoUsdMicros } from './src/creditos/precos.js';
import {
  usdParaMicrosBrl,
  comissaoSobre,
  cotacaoParaMilesimos,
  formatarReais,
} from './src/creditos/dinheiro.js';
import { CORPUS, avaliarPlano, type Caso } from './corpus/planejador.js';

const chave = process.env.IA_API_KEY;
const modelo = process.env.IA_MODELO;
if (!chave || !modelo) {
  console.error('Faltam IA_API_KEY e IA_MODELO no .env.');
  process.exit(1);
}

const filtro = process.env.CASO;
const casos = filtro ? CORPUS.filter((c) => c.nome === filtro) : CORPUS;
if (!casos.length) {
  console.error(`Nenhum caso com o nome "${filtro}". Casos: ${CORPUS.map((c) => c.nome).join(', ')}`);
  process.exit(1);
}

function contextoDe(caso: Caso): string {
  return pacoteParaTexto(
    montarPacoteInterno({
      empresa: caso.empresa,
      categoriaDaIdeia: caso.categoria ?? null,
      recortes: (caso.recortes ?? []).map((r, i) => ({
        texto: r.texto,
        categoria: r.categoria,
        ideiaId: 'i' + i,
        ideiaTitulo: 'Idéia ' + i,
      })),
      ativas: (caso.consulta ?? []).map((c, i) => ({
        id: 'ic' + i,
        titulo: c.titulo,
        descricao: c.descricao,
        status: 'andamento' as const,
      })),
    }),
  );
}

let passaram = 0;
let quebradosQueConsertaram = 0;
let usdTotal = 0;

for (const caso of casos) {
  const contexto = contextoDe(caso);

  let saida;
  try {
    saida = await planejarComModelo({ tarefa: caso.tarefa, contexto, chave, modelo });
  } catch (e) {
    console.log(`\n${'='.repeat(70)}\n${caso.nome}\n  FALHOU a chamada: ${(e as Error).message}`);
    continue;
  }

  const usd = custoUsdMicros(saida.modelo, saida.uso);
  if (usd !== null) usdTotal += usd;

  const nota = avaliarPlano(caso, saida.plano);
  const esperadoQuebrado = !!caso.quebrado;

  console.log('\n' + '='.repeat(70));
  console.log(caso.nome + (esperadoQuebrado ? '   [quebrado conhecido]' : ''));
  console.log('  tarefa: ' + caso.tarefa);
  console.log('  ' + caso.porque);

  console.log('\n  o plano que saiu:');
  if (!saida.plano.perguntas.length) {
    console.log('    (nenhuma pergunta) ' + (saida.plano.naoDaParaBuscar ?? ''));
  }
  /* O `porque` sai junto porque é ele que diz QUEM escreveu a
     pergunta: a garantia do servidor assina "É a própria tarefa,
     escrita como pergunta". Sem isso, descobrir se uma duplicata
     veio do modelo ou de nós exigiu calcular à mão em 15/09/2026. */
  saida.plano.perguntas.forEach((p, i) => {
    console.log(`    ${i + 1}. ${p.pergunta}`);
    if (p.porque) console.log(`       (${p.porque})`);
  });
  if (saida.plano.jaSabido.length) {
    console.log('  já sabido: ' + saida.plano.jaSabido.join(' · '));
  }

  console.log('\n  a régua:');
  for (const item of nota.itens) {
    console.log(`    ${item.passou ? '✅' : '❌'} ${item.criterio} — ${item.detalhe}`);
  }

  if (nota.passou) passaram++;

  /* Um caso marcado `quebrado` que passa a funcionar não é boa
     notícia silenciosa: é dívida quitada que precisa ser registrada,
     senão ninguém apaga a marca e ela vira folclore. Mesmo desenho
     de `testes/roteador.test.ts`. */
  if (esperadoQuebrado && nota.passou) {
    quebradosQueConsertaram++;
    console.log(`\n  ⚠️  CONSERTOU: este caso estava marcado como quebrado (“${caso.quebrado}”).`);
    console.log('      Tire a marca do corpus — e registre o que mudou.');
  }
}

console.log('\n' + '='.repeat(70));
console.log(`${passaram} de ${casos.length} caso(s) passaram na régua.`);
if (quebradosQueConsertaram) {
  console.log(`${quebradosQueConsertaram} caso(s) marcados como quebrados agora passam — atualize o corpus.`);
}

if (usdTotal > 0) {
  const c = comissaoSobre(
    usdParaMicrosBrl(usdTotal, cotacaoParaMilesimos(Number(process.env.COTACAO_USD_BRL ?? 5.4))),
  );
  console.log(`\ncusto desta rodada: US$ ${(usdTotal / 1e6).toFixed(6)} → ${formatarReais(c.totalMicros)} (com comissão)`);
}

console.log(
  '\nO que a régua NÃO mede: se a resposta é boa. Leia os planos acima —\n' +
  'uma pergunta pode passar em todos os critérios e ainda ser a pergunta errada.',
);
