import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const t = await db.tarefa.findMany({
  where: { ideiaId: '3235a578-0b7c-4b4e-bc7f-341127d1682e' },
  orderBy: { ordem: 'asc' },
  select: { titulo: true, tipo: true, status: true },
});
console.log(JSON.stringify(t, null, 1));
await db.$disconnect();
