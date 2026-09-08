-- ============================================================
-- Toda tarefa tem um espaço de trabalho — retirada de `sem_tela`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/atividades/board-lista.md
--         §1.1 (BOARD-ACESSO-001/002), decisão A31
-- Autorizado em 29/08/2026.
--
-- Por quê: `sem_tela` era o padrão, então toda tarefa criada antes
-- da migração `20260829000000_board_quadros` ficou sem botão
-- "Acessar tarefa" — e, como não existe rota para editar o tipo de
-- uma tarefa, ficaram permanentemente sem como abrir. O defeito
-- apareceu em uso: duas tarefas órfãs na mesma atividade.
--
-- A decisão não foi "mostrar o botão mesmo assim", e sim remover o
-- conceito: toda tarefa tem onde trabalhar, e o tipo diz QUE tipo
-- de trabalho é — não se existe trabalho.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- 1. Nenhuma linha pode continuar em `sem_tela` — elas viram
--    `pesquisa`, que é o novo padrão. Precisa vir ANTES da troca do
--    tipo, senão o cast falha.
UPDATE "tarefas" SET "tipo" = 'sem_tela' WHERE "tipo" IS NULL;
UPDATE "tarefas" SET "tipo" = 'pesquisa' WHERE "tipo" = 'sem_tela';

-- 2. PostgreSQL não remove valor de enum: o caminho é recriar o
--    tipo e migrar a coluna. O DEFAULT sai antes e volta depois
--    porque não é possível trocar o tipo de uma coluna que tem
--    default declarado sobre o tipo antigo.
ALTER TYPE "TipoTarefa" RENAME TO "TipoTarefa_antigo";

CREATE TYPE "TipoTarefa" AS ENUM ('pesquisa', 'matriz_csd');

ALTER TABLE "tarefas" ALTER COLUMN "tipo" DROP DEFAULT;

ALTER TABLE "tarefas"
    ALTER COLUMN "tipo" TYPE "TipoTarefa"
    USING "tipo"::text::"TipoTarefa";

-- 3. O novo padrão. Toda tarefa nasce com um quadro de pesquisa —
--    inclusive a tarefa-semente de ATV-ACESSO-002.
ALTER TABLE "tarefas" ALTER COLUMN "tipo" SET DEFAULT 'pesquisa';

DROP TYPE "TipoTarefa_antigo";
