import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const tarefaId = '77641b79-75b1-426e-8752-d001a9ff888c';

const t = await db.tarefa.findUnique({ where: { id: tarefaId } });
console.log('TAREFA:', t ? `"${t.titulo}" status=${t.status}` : 'NAO ENCONTRADA');

const qs = await db.quadro.findMany({
  where: { tarefaId },
  orderBy: { ordem: 'asc' },
  include: { colunas: { include: { registros: true }, orderBy: { ordem: 'asc' } } },
});
console.log('QUADROS NO BANCO:', qs.length);
for (const q of qs) {
  const n = q.colunas.reduce((a, c) => a + c.registros.length, 0);
  console.log(`  [${q.ordem}] tipo=${q.tipo} "${q.titulo}" — ${q.colunas.length} col, ${n} registros | atualizado=${q.atualizadoEm.toISOString()}`);
  for (const c of q.colunas) for (const r of c.registros) {
    console.log(`        · "${r.titulo}" (${r.descricao.length} chars)`);
  }
}
await db.$disconnect();
