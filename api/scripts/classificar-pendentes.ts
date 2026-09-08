/* ============================================================
   Backfill — classifica idéias que já estavam em "finalizado"
   ============================================================
   O disparador novo só age em quem ENTRA em "finalizado" a partir
   de agora. Quem já estava lá antes ficou com assunto NULL e não
   aparece no mapa. Este script fecha essa lacuna uma vez.

   Uso (na pasta api/):
     npx tsx scripts/classificar-pendentes.ts          # aplica
     npx tsx scripts/classificar-pendentes.ts --secar  # só mostra

   É seguro repetir: só toca em idéia finalizada com assunto NULL.
   ============================================================ */

import { db } from '../src/db.js';
import { classificarComDiagnostico } from '../src/ia/taxonomia.js';
import { env } from '../src/env.js';

const secar = process.argv.includes('--secar');

async function main() {
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO) {
    console.error('IA não configurada (IA_DRIVER / IA_API_KEY / IA_MODELO no .env).');
    process.exitCode = 1;
    return;
  }

  const pendentes = await db.ideia.findMany({
    where: { status: 'finalizado', arquivadoEm: null, assunto: null },
    select: { id: true, titulo: true, descricao: true },
    orderBy: { criadoEm: 'asc' },
  });

  console.log(`${pendentes.length} idéia(s) finalizada(s) sem classificação.`);
  if (!pendentes.length) return;

  let feitas = 0;
  for (const ideia of pendentes) {
    const rotulo = ideia.titulo.slice(0, 60);

    if (secar) {
      console.log(`  [seco] ${rotulo}`);
      continue;
    }

    const d = await classificarComDiagnostico(ideia.titulo, ideia.descricao);
    const c = d.resultado;
    if (!c) {
      /* Mostrar o texto cru aqui é o que separa "não funcionou" de
         um diagnóstico: recusa, JSON torto e categoria inventada
         pedem correções diferentes. */
      console.warn(`  ✗ ${rotulo} — ${d.motivo}`);
      if (d.bruto) console.warn(`      modelo devolveu: ${d.bruto.slice(0, 300)}`);
      continue;
    }

    /* Mesma trava da rota: o status volta ao WHERE na hora de
       gravar, para não reclassificar algo que saiu de "finalizado"
       enquanto o script rodava. */
    const r = await db.ideia.updateMany({
      where: { id: ideia.id, status: 'finalizado', arquivadoEm: null },
      data: { assunto: c.assunto, tags: c.tags },
    });

    if (r.count) {
      feitas++;
      console.log(`  ✓ ${rotulo} → ${c.assunto}${c.tags.length ? ` [${c.tags.join(', ')}]` : ''}`);
    } else {
      console.warn(`  ~ ${rotulo} — saiu de finalizado durante a execução, ignorada`);
    }
  }

  if (!secar) console.log(`\n${feitas} de ${pendentes.length} classificada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
