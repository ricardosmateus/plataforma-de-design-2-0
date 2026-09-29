/* ============================================================
   Calibração do JEV — exportar a página de marcação
   ============================================================
   Rodar:  npm run calibrar:exportar            (todas as avaliações)
           npm run calibrar:exportar -- 7       (últimos 7 dias)

   Regras: ia-avaliacao.md, IA-AVAL-014 · Plano §7, Fase 1

   Gera `calibracao/marcar-AAAA-MM-DD.html` na raiz do projeto: uma
   página só, sem servidor, com cada etapa que a IA gerou e o JEV
   avaliou. A pessoa marca o que acha de cada uma SEM ver a nota
   (ela aparece só depois de marcar, para não ancorar o julgamento),
   baixa o .json e roda `npm run calibrar:analisar`.

   A pasta `calibracao/` fica fora do git: tem texto de idéias de
   clientes.
   ============================================================ */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const DIAS = Number(process.argv[2]) || 0;

async function main() {
  const avaliacoes = await db.avaliacaoIa.findMany({
    where: {
      alvoTipo: 'ideia',
      ...(DIAS ? { criadoEm: { gte: new Date(Date.now() - DIAS * 86_400_000) } } : {}),
    },
    orderBy: { criadoEm: 'asc' },
  });

  const ideias = await db.ideia.findMany({
    where: { id: { in: avaliacoes.map((a) => a.alvoId) } },
    select: { id: true, titulo: true, descricao: true, projeto: { select: { nome: true, tipo: true, empresa: { select: { nome: true } } } } },
  });
  const porId = new Map(ideias.map((i) => [i.id, i]));

  const itens = avaliacoes
    .filter((a) => porId.has(a.alvoId))
    .map((a) => {
      const i = porId.get(a.alvoId)!;
      return {
        /* A marcação é por AVALIAÇÃO, não por idéia: a mesma idéia
           pode ter sido avaliada mais de uma vez no futuro. */
        id: a.id,
        titulo: i.titulo,
        descricao: i.descricao,
        projeto: i.projeto.nome ?? i.projeto.tipo,
        empresa: i.projeto.empresa.nome,
        estado: a.estado,
        geral: a.geral,
        faixa: a.faixa,
        avaliador: a.avaliador,
        criterios: a.criterios,
        alertas: a.alertas,
      };
    });

  const geradoEm = new Date().toISOString();
  /* JSON dentro de <script>: `</` fecharia a tag antes da hora. */
  const dados = JSON.stringify({ geradoEm, itens }).replace(/</g, '\\u003c');
  const html = readFileSync(join(aqui, 'calibracao-pagina.html'), 'utf8').replace('/*__DADOS__*/null', dados);

  const pasta = join(raiz, 'calibracao');
  mkdirSync(pasta, { recursive: true });
  const arquivo = join(pasta, `marcar-${geradoEm.slice(0, 10)}.html`);
  writeFileSync(arquivo, html);

  const semTexto = avaliacoes.length - itens.length;
  console.log(`\n${itens.length} etapa(s) para marcar${semTexto ? ` (${semTexto} sem idéia correspondente, ignoradas)` : ''}.`);
  console.log(`Abra no navegador:\n  open "${arquivo}"\n`);
  if (itens.length < 40) {
    console.log(`O plano pede de 40 a 60 etapas. Dá para marcar já e completar depois:`);
    console.log(`as marcações ficam salvas no navegador até você baixar o arquivo.\n`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
