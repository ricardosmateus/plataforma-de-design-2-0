-- CreateEnum
CREATE TYPE "EstadoInvestigacao" AS ENUM ('correndo', 'entregue', 'parada', 'falhou');

-- AlterTable
ALTER TABLE "pesquisa_consultas" ADD COLUMN     "resposta" TEXT;

-- CreateTable
CREATE TABLE "pesquisa_investigacoes" (
    "id" UUID NOT NULL,
    "sessao_id" UUID NOT NULL,
    "tarefa_id" UUID,
    "pergunta" TEXT NOT NULL,
    "pergunta_resolvida" TEXT NOT NULL,
    "estado" "EstadoInvestigacao" NOT NULL DEFAULT 'correndo',
    "plano" JSONB,
    "passos" JSONB NOT NULL DEFAULT '[]',
    "fecho" TEXT,
    "consulta_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerrado_em" TIMESTAMP(3),

    CONSTRAINT "pesquisa_investigacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pesquisa_investigacoes_tarefa_id_criado_em_idx" ON "pesquisa_investigacoes"("tarefa_id", "criado_em");

-- CreateIndex
CREATE INDEX "pesquisa_investigacoes_sessao_id_criado_em_idx" ON "pesquisa_investigacoes"("sessao_id", "criado_em");

-- AddForeignKey
ALTER TABLE "pesquisa_investigacoes" ADD CONSTRAINT "pesquisa_investigacoes_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "pesquisa_sessoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
