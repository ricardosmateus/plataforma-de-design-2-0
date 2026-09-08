import { PrismaClient } from '@prisma/client';

/* Uma instância por processo. Em serverless com muitas instâncias,
   usar o pooler do provedor (Neon tem embutido) — sem ele o
   Postgres recusa conexão sob carga (plano §6). */
export const db = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/* ------------------------------------------------------------
   Guarda de sincronia do Prisma Client
   ------------------------------------------------------------
   O Prisma Client é CÓDIGO GERADO. Quando um model novo entra no
   schema e ninguém roda `npm run gerar`, o client continua sendo o
   antigo: `db.modeloNovo` fica `undefined`, e a primeira chamada
   estoura com

       Cannot read properties of undefined (reading 'findFirst')

   — uma mensagem que não menciona Prisma, nem o model, nem o
   comando que resolve. Já custou caro três vezes neste projeto
   (projetos, idéias e o assistente), sempre aparecendo como "a
   funcionalidade não funcionou" em vez de "falta um passo".

   Esta função troca esse mistério por uma instrução. Roda na
   partida, não a cada requisição: o custo é zero e o erro aparece
   antes de qualquer pessoa usar a tela.
   ------------------------------------------------------------ */
const MODELOS_ESPERADOS = [
  'usuario',
  'sessao',
  'empresa',
  'empresaMembro',
  'projeto',
  'ideia',
  'tarefa',
  'iaConversa',
  'iaMensagem',
  'consumoIa',
  'creditoLancamento',
  'cobrancaPix',
] as const;

export function conferirClientPrisma(): string[] {
  const cliente = db as unknown as Record<string, unknown>;
  return MODELOS_ESPERADOS.filter((m) => !cliente[m]);
}

export function avisarSeClientDesatualizado(): void {
  const faltando = conferirClientPrisma();
  if (!faltando.length) return;

  console.error(
    [
      '',
      '  ⚠  O Prisma Client está desatualizado.',
      '',
      `     Models no schema que o client não conhece: ${faltando.join(', ')}`,
      '',
      '     As rotas que usam esses models vão falhar com',
      '     "Cannot read properties of undefined". Para resolver:',
      '',
      '       npm run gerar     # regenera o client a partir do schema',
      '       npm run migrar    # aplica as migrações pendentes no banco',
      '',
      '     Depois reinicie este processo: o tsx watch não observa',
      '     node_modules, então ele seguiria com o client velho em',
      '     memória mesmo depois do gerar.',
      '',
    ].join('\n'),
  );
}
