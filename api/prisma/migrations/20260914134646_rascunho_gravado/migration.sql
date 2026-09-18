-- CreateTable
CREATE TABLE "pesquisa_afirmacoes" (
    "id" UUID NOT NULL,
    "consulta_id" UUID NOT NULL,
    "inicio" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "sem_fonte" BOOLEAN NOT NULL DEFAULT false,
    "removida_pelo_usuario" BOOLEAN,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pesquisa_afirmacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesquisa_afirmacao_fontes" (
    "afirmacao_id" UUID NOT NULL,
    "fonte_id" UUID NOT NULL,
    "trecho" TEXT,

    CONSTRAINT "pesquisa_afirmacao_fontes_pkey" PRIMARY KEY ("afirmacao_id","fonte_id")
);

-- CreateIndex
CREATE INDEX "pesquisa_afirmacoes_consulta_id_inicio_idx" ON "pesquisa_afirmacoes"("consulta_id", "inicio");

-- CreateIndex
CREATE INDEX "pesquisa_afirmacao_fontes_fonte_id_idx" ON "pesquisa_afirmacao_fontes"("fonte_id");

-- AddForeignKey
ALTER TABLE "pesquisa_afirmacoes" ADD CONSTRAINT "pesquisa_afirmacoes_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "pesquisa_consultas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisa_afirmacao_fontes" ADD CONSTRAINT "pesquisa_afirmacao_fontes_afirmacao_id_fkey" FOREIGN KEY ("afirmacao_id") REFERENCES "pesquisa_afirmacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisa_afirmacao_fontes" ADD CONSTRAINT "pesquisa_afirmacao_fontes_fonte_id_fkey" FOREIGN KEY ("fonte_id") REFERENCES "pesquisa_fontes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
