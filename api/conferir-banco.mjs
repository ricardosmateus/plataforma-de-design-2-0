/* Diagnóstico do banco — rode com:  node --env-file=.env conferir-banco.mjs
   Pode apagar este arquivo quando não precisar mais. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const EMAIL = process.argv[2] || 'ricardosmateus@gmail.com';
try {
  const t = await db.$queryRaw`select table_name from information_schema.tables where table_schema='public' order by table_name`;
  const nomes = t.map(r => r.table_name);
  console.log('TABELAS:', nomes.join(', '));

  const ok = nomes.includes('empresas') && nomes.includes('empresa_membros');
  console.log('\nMigração de empresas aplicada?', ok ? 'SIM' : 'NÃO  <<< é isso que falta');
  if (!ok) process.exit(0);

  const u = await db.$queryRaw`select id, email from users where email = ${EMAIL}`;
  if (!u.length) { console.log('\nConta', EMAIL, 'não encontrada.'); process.exit(0); }
  console.log('\nConta:', u[0].email, '/ id', u[0].id);

  const e = await db.$queryRaw`
    select e.nome, m.papel, e.arquivado_em, m.revogado_em, m.expira_em
      from empresa_membros m join empresas e on e.id = m.empresa_id
     where m.user_id = ${u[0].id}::uuid`;
  console.log('\nVínculos dessa conta:', e.length);
  if (e.length) console.table(e);
  else console.log('Nenhum — a listagem deve mostrar o estado vazio. Correto.');
} catch (err) {
  console.log('ERRO:', err.message.split('\n')[0]);
} finally { await db.$disconnect(); }
