/* Guarda de sincronia do Prisma Client — `estruturaDoSchema`
   (prisma-sincronia.ts), usada por `db.ts` na partida da API.

   O caso de 23/09/2026: `Projeto.nome` entrou no schema, o client
   local era de 17/09, e criar projeto em desenvolvimento devolvia
   "Erro inesperado". A guarda antiga só conferia MODELS e ficou
   calada. Estes testes travam a conferência por CAMPO, e que ela não
   dispare à toa só porque o `prisma generate` reformata comentários. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estruturaDoSchema } from '../src/prisma-sincronia.js';

const antigo = `
/* Comentário em bloco,
   no formato do repositório. */
model Projeto {
  id   String @id
  tipo TipoProjeto // comentário de linha
  @@map("projetos")
}
enum TipoProjeto {
  startup
}`;

const novo = antigo.replace('  tipo TipoProjeto', '  tipo TipoProjeto\n  nome String?');

test('campo novo aparece na diferença', () => {
  const client = estruturaDoSchema(antigo);
  const falta = [...estruturaDoSchema(novo)].filter((c) => !client.has(c));
  assert.deepEqual(falta, ['Projeto.nome']);
});

test('comentário reformatado pelo generate não conta como diferença', () => {
  const reformatado = antigo.replace(/\/\*[\s\S]*?\*\//, '/**\n * Comentário em bloco,\n * no formato do generate.\n */');
  assert.deepEqual([...estruturaDoSchema(reformatado)], [...estruturaDoSchema(antigo)]);
});

test('atributos de bloco e comentários não viram campo; enums entram', () => {
  assert.deepEqual([...estruturaDoSchema(antigo)].sort(), ['Projeto.id', 'Projeto.tipo', 'TipoProjeto.startup']);
});
