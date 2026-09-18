-- CreateTable
CREATE TABLE "pesquisa_perguntas" (
    "id" UUID NOT NULL,
    "consulta_id" UUID NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pesquisa_perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pesquisa_perguntas_consulta_id_criado_em_idx" ON "pesquisa_perguntas"("consulta_id", "criado_em");

-- AddForeignKey
ALTER TABLE "pesquisa_perguntas" ADD CONSTRAINT "pesquisa_perguntas_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "pesquisa_consultas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
