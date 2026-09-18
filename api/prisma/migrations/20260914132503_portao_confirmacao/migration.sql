-- AlterEnum
ALTER TYPE "EstadoInvestigacao" ADD VALUE 'aguardando';

-- AlterTable
ALTER TABLE "pesquisa_investigacoes" ADD COLUMN     "estimativa_micros" INTEGER,
ADD COLUMN     "pergunta_busca" TEXT;
