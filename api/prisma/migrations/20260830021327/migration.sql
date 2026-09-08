-- AlterTable
ALTER TABLE "empresa_membros" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "empresas" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ia_conversas" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ia_mensagens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ideias" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "titulo" SET DATA TYPE TEXT,
ALTER COLUMN "descricao" SET DATA TYPE TEXT,
ALTER COLUMN "importancia" SET DATA TYPE INTEGER,
ALTER COLUMN "assunto" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "projetos" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "quadro_colunas" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "titulo" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "quadros" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "titulo" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "registros" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "titulo" SET DATA TYPE TEXT,
ALTER COLUMN "descricao" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "tarefas" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "titulo" SET DATA TYPE TEXT,
ALTER COLUMN "descricao" SET DATA TYPE TEXT;

-- RenameIndex
ALTER INDEX "ia_conversas_projeto_usuario_unico" RENAME TO "ia_conversas_projeto_id_usuario_id_key";
