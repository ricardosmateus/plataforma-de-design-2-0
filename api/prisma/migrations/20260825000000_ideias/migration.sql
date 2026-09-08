-- ============================================================
-- MÓDULO DE IDÉIAS — tabela `ideias`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/ideias/ideias-quadro.md §3
--         Regras_de_negocio/modulos/ideias/ideias-criacao.md §1
-- Autorizado em 25/08/2026.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- As três colunas do quadro (IDEIA-QUADRO-001). Fixas: o usuário não
-- cria nem renomeia coluna, então o banco recusa um quarto valor.
CREATE TYPE "StatusIdeia" AS ENUM ('ideias', 'andamento', 'finalizado');

CREATE TABLE "ideias" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "projeto_id"    UUID          NOT NULL,
    "titulo"        VARCHAR(60)   NOT NULL,
    "descricao"     VARCHAR(280)  NOT NULL,
    "importancia"   SMALLINT      NOT NULL DEFAULT 0,
    "status"        "StatusIdeia" NOT NULL DEFAULT 'ideias',
    "criado_por"    UUID          NOT NULL,
    "arquivado_em"  TIMESTAMP(3),
    "criado_em"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "ideias_pkey" PRIMARY KEY ("id")
);

-- Os limites de 60/280 também são validados no servidor
-- (IDEIA-CRIA-005); o VARCHAR aqui é a última linha de defesa, não a
-- primeira. E o CHECK de importância existe porque 0..5 é regra de
-- negócio (IDEIA-CRIA-002), não convenção de interface: sem ele, um
-- 99 entraria pela API e quebraria a régua de estrelas na tela.
ALTER TABLE "ideias"
    ADD CONSTRAINT "ideias_importancia_check"
    CHECK ("importancia" >= 0 AND "importancia" <= 5);

-- Título e descrição não podem ser só espaço em branco
-- (IDEIA-CRIA-006). O servidor já apara e recusa, mas repetir aqui
-- impede que qualquer outro caminho de escrita — script, correção
-- manual, importação futura — crie um card em branco na tela.
ALTER TABLE "ideias"
    ADD CONSTRAINT "ideias_titulo_nao_vazio"
    CHECK (length(btrim("titulo")) > 0);

ALTER TABLE "ideias"
    ADD CONSTRAINT "ideias_descricao_nao_vazia"
    CHECK (length(btrim("descricao")) > 0);

-- projeto_id nunca muda (IDEIA-ISO-001) — CASCADE existe só como
-- rede de segurança do banco; na prática nada é apagado de verdade
-- (E1), arquivar é o caminho normal.
ALTER TABLE "ideias"
    ADD CONSTRAINT "ideias_projeto_id_fkey"
    FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ideias"
    ADD CONSTRAINT "ideias_criado_por_fkey"
    FOREIGN KEY ("criado_por") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Toda listagem filtra por projeto + não-arquivado
-- (IDEIA-QUADRO-004). Mesmo raciocínio do índice equivalente em
-- `projetos`: sem ele a listagem vira varredura assim que houver
-- volume.
CREATE INDEX "ideias_projeto_id_arquivado_em_idx"
    ON "ideias"("projeto_id", "arquivado_em");

-- NOTA: não existe índice único de título. É deliberado — duas
-- idéias do mesmo projeto podem se chamar igual (IDEIA-CRIA-007).
