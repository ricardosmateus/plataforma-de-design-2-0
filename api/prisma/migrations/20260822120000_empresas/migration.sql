-- ============================================================
-- MÓDULO DE EMPRESAS — tabelas `empresas` e `empresa_membros`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/empresas/empresas-listagem.md §3
-- Autorizado em 22/08/2026.
--
-- Escrita à mão, como a migração inicial: o CDN de binários do
-- Prisma não é alcançável do ambiente onde este arquivo foi
-- gerado. Validada contra PostgreSQL 16.
-- ============================================================

CREATE TYPE "PapelMembro" AS ENUM ('proprietario', 'membro', 'especialista');

-- ------------------------------------------------------------
-- empresas
-- ------------------------------------------------------------
CREATE TABLE "empresas" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "nome"          TEXT         NOT NULL,
    "descricao"     TEXT,
    "logotipo_url"  TEXT,
    "fonte"         TEXT,
    "cor"           TEXT,
    "criado_por"    UUID         NOT NULL,
    "arquivado_em"  TIMESTAMP(3),
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "empresas"
    ADD CONSTRAINT "empresas_criado_por_fkey"
    FOREIGN KEY ("criado_por") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- empresa_membros
-- ------------------------------------------------------------
CREATE TABLE "empresa_membros" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id"    UUID          NOT NULL,
    "user_id"       UUID          NOT NULL,
    "papel"         "PapelMembro" NOT NULL,
    "convidado_por" UUID,
    "expira_em"     TIMESTAMP(3),
    "criado_em"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_em"   TIMESTAMP(3),

    CONSTRAINT "empresa_membros_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "empresa_membros"
    ADD CONSTRAINT "empresa_membros_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "empresa_membros"
    ADD CONSTRAINT "empresa_membros_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A consulta que decide o estado vazio filtra por user_id + vínculo
-- ativo. Sem este índice ela vira varredura de tabela assim que
-- houver volume.
CREATE INDEX "empresa_membros_user_id_revogado_em_idx"
    ON "empresa_membros"("user_id", "revogado_em");

CREATE INDEX "empresa_membros_empresa_id_revogado_em_idx"
    ON "empresa_membros"("empresa_id", "revogado_em");

-- Índice único PARCIAL: impede dois vínculos ativos da mesma pessoa
-- com a mesma empresa, mas permite recontratar depois de revogar —
-- que é o caso do especialista voltando ao mesmo cliente.
CREATE UNIQUE INDEX "empresa_membros_ativo_unico"
    ON "empresa_membros"("empresa_id", "user_id")
    WHERE "revogado_em" IS NULL;
