-- ============================================================
-- MÓDULO DE PROJETOS — tabela `projetos`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/projetos/projetos-listagem.md §3
--         Regras_de_negocio/modulos/projetos/projetos-criacao.md §3
-- Autorizado em 24/08/2026.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- Catálogo fechado — nasce só com 'startup' (PROJ-CRIA-006). Novo
-- tipo entra com `ALTER TYPE ... ADD VALUE`, migração aditiva.
CREATE TYPE "TipoProjeto" AS ENUM ('startup');

CREATE TABLE "projetos" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id"    UUID          NOT NULL,
    "tipo"          "TipoProjeto" NOT NULL,
    "criado_por"    UUID          NOT NULL,
    "arquivado_em"  TIMESTAMP(3),
    "criado_em"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "projetos_pkey" PRIMARY KEY ("id")
);

-- empresa_id nunca muda (PROJ-ISO-001) — CASCADE existe só como rede
-- de segurança do banco; na prática nenhuma empresa é apagada de
-- verdade (E1), arquivar é o caminho normal.
ALTER TABLE "projetos"
    ADD CONSTRAINT "projetos_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projetos"
    ADD CONSTRAINT "projetos_criado_por_fkey"
    FOREIGN KEY ("criado_por") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Toda listagem filtra por empresa + não-arquivado (PROJ-LIST-001).
-- Sem este índice ela vira varredura de tabela assim que houver
-- volume — mesmo raciocínio do índice equivalente em empresa_membros.
CREATE INDEX "projetos_empresa_id_arquivado_em_idx"
    ON "projetos"("empresa_id", "arquivado_em");
