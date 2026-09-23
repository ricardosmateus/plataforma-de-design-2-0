import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { estruturaDoSchema } from './prisma-sincronia.js';

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

/* ------------------------------------------------------------
   Campos, não só models — 23/09/2026
   ------------------------------------------------------------
   A conferência acima pega model novo e deixa passar CAMPO novo. Foi
   o que aconteceu com `Projeto.nome`: o model existia no client
   antigo, então a guarda ficou calada, e criar projeto em
   desenvolvimento devolvia "Erro inesperado" (o client recusava
   `nome` como argumento desconhecido). Em produção funcionava,
   porque o build do Render roda `prisma generate`.

   Compara o schema do repositório com a cópia que o `prisma
   generate` deixa dentro do client. Texto não serve — o generate
   reformata os comentários —, então a comparação é pela ESTRUTURA:
   o conjunto `Model.campo` e `Enum.valor` dos dois lados, lido por
   `estruturaDoSchema` (prisma-sincronia.ts, pura e testada). */
/* O que o schema do repositório tem e o client gerado não. Lista
   vazia quando não dá para ler algum dos dois — esta guarda avisa,
   nunca impede a API de subir. */
export function camposQueOClientNaoConhece(): string[] {
  try {
    const fonte = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    const copia = readFileSync(createRequire(import.meta.url).resolve('.prisma/client/schema.prisma'), 'utf8');
    const doClient = estruturaDoSchema(copia);
    return [...estruturaDoSchema(fonte)].filter((c) => !doClient.has(c));
  } catch {
    return [];
  }
}

export function avisarSeClientDesatualizado(): void {
  const faltando = conferirClientPrisma();
  const campos = camposQueOClientNaoConhece();
  if (!faltando.length && !campos.length) return;

  console.error(
    [
      '',
      '  ⚠  O Prisma Client está desatualizado.',
      '',
      ...(faltando.length ? [`     Models no schema que o client não conhece: ${faltando.join(', ')}`] : []),
      ...(campos.length
        ? [`     Campos no schema que o client não conhece: ${campos.slice(0, 12).join(', ')}${campos.length > 12 ? '…' : ''}`]
        : []),
      '',
      '     As rotas que usam esses campos vão responder "Erro',
      '     inesperado" na tela. Para resolver:',
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
