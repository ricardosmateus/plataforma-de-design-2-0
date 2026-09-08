-- ============================================================
-- NOME DE EMPRESA ÚNICO POR CONTA — EMP-CRIA-002
-- ============================================================
-- Regras: Regras_de_negocio/modulos/empresas/empresas-criacao.md §3
-- Autorizado em 22/08/2026.
-- ============================================================

-- unaccent() precisa da extensão, e o backfill abaixo já a usa —
-- por isso vem antes de tudo, não depois.
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "empresas" ADD COLUMN "nome_busca" TEXT;

-- Backfill: qualquer empresa criada antes desta coluna existir (só
-- havia dados de exemplo no frontend, nada no banco ainda, mas a
-- migração fica correta mesmo se isso mudar antes de rodar).
UPDATE "empresas" SET "nome_busca" = lower(unaccent("nome"));

ALTER TABLE "empresas" ALTER COLUMN "nome_busca" SET NOT NULL;

-- Índice único PARCIAL: nome repetido é bloqueado só entre empresas
-- não arquivadas da mesma conta. Arquivar libera o nome de novo
-- (consistente com E1 em empresas-listagem.md).
CREATE UNIQUE INDEX "empresas_nome_unico_por_conta"
    ON "empresas"("criado_por", "nome_busca")
    WHERE "arquivado_em" IS NULL;
