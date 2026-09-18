/* ============================================================
   O que realmente aconteceu na última investigação
   ============================================================
   Rode na SUA máquina:  cd api && npx tsx ver-investigacao.ts
   Filtra por texto:     npx tsx ver-investigacao.ts Loggi

   Não gasta NADA: só lê. É a ferramenta de conferir se o que a
   tela mostrou é o que o banco guardou — e desde 14/09/2026 ela
   cobre também o portão (Fase 2), a curadoria (Fase 2) e o caderno
   (Fase 3a).
   ============================================================ */
import 'dotenv/config';
import { db } from './src/db.js';

const filtro = process.argv[2];

const inv = await db.pesquisaInvestigacao.findFirst({
  where: filtro ? { pergunta: { contains: filtro, mode: 'insensitive' } } : {},
  orderBy: { criadoEm: 'desc' },
});

if (!inv) {
  console.log('nenhuma investigação encontrada' + (filtro ? ` com "${filtro}"` : ''));
  process.exit(0);
}

const seg = inv.encerradoEm
  ? Math.round((+inv.encerradoEm - +inv.criadoEm) / 1000)
  : null;

console.log('='.repeat(70));
console.log('TAREFA        :', inv.pergunta);
console.log('RESOLVIDA     :', inv.perguntaResolvida);
console.log('ESTADO        :', inv.estado, seg !== null ? `(${seg}s)` : '(ainda correndo)');
console.log('FECHO         :', inv.fecho ?? '—');

/* O portão (Fase 2). `aguardando` com pergunta e preço gravados é o
   estado que prova que o stream parou e esperou alguém. */
if (inv.perguntaBusca || inv.estimativaMicros !== null) {
  console.log('\n--- O PORTÃO ---');
  console.log('  pergunta da busca :', inv.perguntaBusca ?? '—');
  console.log(
    '  preço prometido   :',
    inv.estimativaMicros === null ? '—' : 'R$ ' + (inv.estimativaMicros / 1_000_000).toFixed(2),
  );
  if (inv.estado === 'aguardando') {
    console.log('  >>> esperando alguém confirmar. Nada foi gasto com busca ainda.');
  }
}

console.log('\n--- PASSOS NARRADOS ---');
for (const p of (inv.passos as { texto: string }[]) ?? []) console.log('  ·', p.texto);

console.log('\n--- O QUE O PLANEJADOR ESCREVEU ---');
const plano = inv.plano as { perguntas?: { pergunta: string; porque: string }[]; ja_sabido?: string[] } | null;
if (!plano) console.log('  (nenhum plano gravado)');
else {
  (plano.perguntas ?? []).forEach((p, i) => console.log(`  ${i + 1}. ${p.pergunta}\n     (${p.porque})`));
  if (plano.ja_sabido?.length) {
    console.log('  já sabido:');
    plano.ja_sabido.forEach((j) => console.log('    -', j));
  }
}

if (!inv.consultaId) {
  console.log('\n(sem consulta: a investigação não chegou a buscar)');
  process.exit(0);
}

const c = await db.pesquisaConsulta.findUnique({
  where: { id: inv.consultaId },
  include: { fontes: true },
});

console.log('\n--- O QUE FOI MANDADO AO PROVEDOR ---');
console.log(c?.perguntaResolvida ?? '(não encontrei a consulta)');

console.log('\n--- O QUE O PROVEDOR DEVOLVEU ---');
console.log('resultado:', c?.resultado);
console.log((c?.resposta ?? '(vazia — ou gravada antes da coluna existir)').slice(0, 3000));

console.log('\n--- FONTES ---');
(c?.fontes ?? []).forEach((f) => console.log('  ·', f.titulo || '(sem título)', '—', f.url));

/* As afirmações e a decisão de quem leu (Fase 2, parte 3). É aqui
   que se confere se o rascunho realmente gravou o que a tela
   mostrou: `removida=null` quer dizer que ninguém decidiu ainda. */
const afirmacoes = await db.pesquisaAfirmacao.findMany({
  where: { consultaId: inv.consultaId },
  orderBy: { inicio: 'asc' },
  include: { fontes: true },
});

console.log('\n--- AFIRMAÇÕES E A CURADORIA ---');
if (!afirmacoes.length) {
  console.log('  (nenhuma gravada — provedor sem citações, ou investigação anterior à Fase 2)');
} else {
  const pendentes = afirmacoes.filter((a) => a.removidaPeloUsuario === null).length;
  const ficaram = afirmacoes.filter((a) => a.removidaPeloUsuario === false).length;
  const sairam = afirmacoes.filter((a) => a.removidaPeloUsuario === true).length;
  console.log(`  ${afirmacoes.length} afirmação(ões): ${ficaram} ficaram · ${sairam} saíram · ${pendentes} sem decisão`);
  if (pendentes && pendentes === afirmacoes.length) {
    console.log('  >>> rascunho ainda ABERTO: a tela deve oferecer "Continuar de onde parei".');
  }
  const posicao = new Map((c?.fontes ?? []).map((f, i) => [f.id, i + 1]));
  for (const a of afirmacoes) {
    const marca =
      a.removidaPeloUsuario === true ? '[ SAIU ]' : a.removidaPeloUsuario === false ? '[ ficou ]' : '[   ?  ]';
    const refs = a.fontes.map((l) => '[' + (posicao.get(l.fonteId) ?? '?') + ']').join('');
    console.log(`  ${marca} ${refs || (a.semFonte ? '(sem fonte)' : '(sem ligação)')} ${a.texto.slice(0, 90)}`);
  }
}

/* A conversa com o caderno (Fase 3a). */
const rodadas = await db.pesquisaPergunta.findMany({
  where: { consultaId: inv.consultaId },
  orderBy: { criadoEm: 'asc' },
});
console.log('\n--- PERGUNTAS AO CADERNO ---');
if (!rodadas.length) console.log('  (nenhuma)');
for (const r of rodadas) {
  console.log('  P:', r.pergunta);
  console.log('  R:', r.resposta.slice(0, 200).replace(/\n/g, ' '));
}

const consumos = await db.consumoPesquisa.findMany({
  where: { sessaoId: inv.sessaoId },
  orderBy: { criadoEm: 'desc' },
  take: 4,
});
console.log('\n--- CUSTO (últimos lançamentos desta sessão) ---');
for (const u of consumos) {
  console.log(`  ${u.provedor.padEnd(18)} nivel=${u.nivel.padEnd(13)} entrada=${u.tokensEntrada ?? '-'} saida=${u.tokensSaida ?? '-'} buscas=${u.buscas ?? '-'}`);
}

/* O total, que é o número que sai do saldo (DIN-007). Conferir contra
   o "até R$ X" que o portão mostrou é a única maneira de saber se a
   estimativa está dizendo a verdade. */
const total = consumos.reduce((soma, u) => soma + (u.totalMicros ?? 0), 0);
console.log('  ' + '-'.repeat(60));
console.log('  TOTAL destes lançamentos: R$ ' + (total / 1_000_000).toFixed(2));
if (inv.estimativaMicros) {
  console.log('  prometido no portão     : até R$ ' + (inv.estimativaMicros / 1_000_000).toFixed(2));
}

await db.$disconnect();
