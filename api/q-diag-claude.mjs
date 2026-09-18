import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  const t = await db.$queryRaw`
    select id, titulo, descricao, status, criado_em
      from tarefas
     where descricao ilike '%ihouselog%' or titulo ilike '%Concorrentes%'
     order by criado_em desc limit 5`;
  console.log('TAREFAS:', JSON.stringify(t, null, 2));
  for (const tarefa of t) {
    const q = await db.$queryRaw`
      select id, titulo, tipo, ordem, criado_em, atualizado_em
        from quadros where tarefa_id = ${tarefa.id}::uuid order by ordem`;
    console.log('\n== tarefa', tarefa.titulo, tarefa.id, '-> quadros:', q.length);
    console.table(q);
  }
} catch (e) {
  console.error('ERRO:', e.message);
} finally { await db.$disconnect(); }
