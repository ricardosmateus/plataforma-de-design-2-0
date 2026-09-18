/* ============================================================
   Medir o planejador com uma chamada real
   ============================================================
   Rode na SUA máquina:   cd api && npx tsx medir-planejador.ts

   Para reproduzir um caso seu, troque os três por ambiente:
     TAREFA="A Loggi opera ponto de coleta em condomínios?" \\
     EMPRESA="iHouseLog" \\
     DESCRICAO="Transforma condomínios em pontos de coleta." \\
     npx tsx medir-planejador.ts

   A ficha da empresa importa: ela é o que o planejador usa para
   INTERPRETAR a tarefa, e foi por ali que ele se perdeu em
   14/09/2026 — usava a ficha para trocar a pergunta pela pesquisa
   de concorrentes que ele imaginava que aquela empresa quisesse.

   Não roda do ambiente do Claude: a VM de lá só alcança a rede por
   um proxy que não libera `api.anthropic.com`. Aqui não há proxy
   nenhum e a chamada sai direto.

   Custa alguns centavos: uma chamada de planejamento em Haiku, sem
   busca nenhuma. O valor real aparece no fim, já com a comissão de
   30% (DIN-008) — que é o que sairia do saldo de um usuário.
   ============================================================ */
import 'dotenv/config';
import { planejarComModelo } from './src/pesquisa/planejador.js';
import { montarPacoteInterno, pacoteParaTexto } from './src/pesquisa/contexto-interno.js';
import { custoUsdMicros } from './src/creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos, formatarReais } from './src/creditos/dinheiro.js';

/* Empresa de mentira, mas com a forma real: dois recortes validados
   (um deles responde parte da pergunta, de propósito — é assim que
   se vê se o planejador respeita o Bloco A) e uma hipótese aberta. */
const pacote = montarPacoteInterno({
  empresa: {
    nome: process.env.EMPRESA || 'Acme Periféricos',
    descricao: process.env.DESCRICAO || 'Vende mouses e teclados gamer no Brasil, por e-commerce próprio.',
  },
  categoriaDaIdeia: 'Concorrentes',
  recortes: [
    { categoria: 'Concorrentes', texto: 'A Razer lidera o mercado brasileiro de mouses gamer acima de R$ 400.', ideiaId: '1', ideiaTitulo: 'Estudo de concorrência 2026' },
    { categoria: 'Mercado', texto: 'O mercado de periféricos gamer no Brasil cresceu 12% em 2025.', ideiaId: '2', ideiaTitulo: 'Tamanho de mercado' },
  ],
  ativas: [
    { id: 'a1', titulo: 'Suposição: nosso público é gamer casual, não competitivo', descricao: 'Ainda não confirmado com dado externo.', status: 'andamento' },
  ],
});

const TAREFA = process.env.TAREFA || 'Pesquisar outras logitechs que atuam aqui no brasil.';
const contexto = pacoteParaTexto(pacote);

console.log('--- contexto interno (%d tokens estimados) ---\n', pacote.tokens);
console.log(contexto);
console.log('\n--- tarefa ---\n' + TAREFA);
console.log('\n--- chamando o planejador ---');

const t0 = Date.now();
const r = await planejarComModelo({
  tarefa: TAREFA,
  contexto,
  chave: process.env.IA_API_KEY!,
  modelo: process.env.IA_MODELO!,
});
const ms = Date.now() - t0;

console.log(`\nmodelo: ${r.modelo}   tempo: ${ms} ms   uso: entrada=${r.uso.entrada} saida=${r.uso.saida}`);
console.log('\nnao_da_para_buscar: ' + (r.plano.naoDaParaBuscar ?? '(null — vai buscar)'));
console.log(`\n${r.plano.perguntas.length} perguntas:`);
r.plano.perguntas.forEach((p, i) => console.log(`  ${i + 1}. ${p.pergunta}\n     (${p.porque})`));
console.log(`\nja_sabido (${r.plano.jaSabido.length}) — o que ele NÃO perguntou porque já estava no Bloco A:`);
r.plano.jaSabido.forEach((j) => console.log('  - ' + j));

/* A conferência que importa desde 14/09/2026: o plano responde a
   tarefa, ou o assunto dela? */
if (TAREFA.trim().endsWith('?')) {
  const primeira = r.plano.perguntas[0]?.pergunta ?? '';
  console.log(
    '\nFIDELIDADE: a tarefa é uma pergunta, e a primeira do plano ' +
      (primeira === TAREFA.trim() ? 'É ELA. ✅' : 'NÃO é ela. ⚠️  → ' + primeira),
  );
}

const usd = custoUsdMicros(r.modelo, r.uso);
if (usd !== null) {
  const c = comissaoSobre(usdParaMicrosBrl(usd, cotacaoParaMilesimos(Number(process.env.COTACAO_USD_BRL ?? 5.4))));
  console.log(`\nplanejar custou US$ ${(usd / 1e6).toFixed(6)}`);
  console.log(`  provedor ${formatarReais(c.custoMicros)} + comissão ${formatarReais(c.comissaoMicros)} = ${formatarReais(c.totalMicros)} (o que sairia do saldo)`);
}
