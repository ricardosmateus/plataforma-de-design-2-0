-- ============================================================
-- MÓDULO DE ATIVIDADES — tipo da tarefa e o quadro de `board.html`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/atividades/board-lista.md
--         §1 (BOARD-ACESSO, BOARD-QUADRO, BOARD-TAREFA)
--         Regras_de_negocio/modulos/atividades/atividade-lista.md
--         §5 P3 (resolvida por esta migração)
-- Autorizado em 29/08/2026 (decisões A23 a A26).
--
-- Duas coisas de uma vez, porque uma não serve sem a outra:
--   1. `tarefas.tipo` — sem ele não há como chegar em board.html
--      sem comparar o texto do título (o defeito que
--      IDEIA-MOV-015 já corrigiu em outro lugar).
--   2. `quadros`/`quadro_colunas`/`registros` — o que a tela grava.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- ---------- 1. Tipo da tarefa (BOARD-ACESSO-001) ----------
-- Catálogo fechado. `sem_tela` é o padrão porque é o que toda
-- tarefa já criada é hoje: item de lista, sem espaço próprio.
CREATE TYPE "TipoTarefa" AS ENUM ('pesquisa', 'matriz_csd', 'sem_tela');

ALTER TABLE "tarefas"
    ADD COLUMN "tipo" "TipoTarefa" NOT NULL DEFAULT 'sem_tela';

-- ---------- 2. O quadro (BOARD-QUADRO) ----------
-- Preso à TAREFA, não à idéia (decisão A24). O CASCADE aqui é real,
-- e não só rede de segurança como em `tarefas`: excluir tarefa
-- apaga a linha de verdade (ATV-TAR-EXCLUI-001), então o quadro
-- dela precisa ir junto — um quadro órfão não teria como ser
-- alcançado nem apagado por ninguém depois.
CREATE TABLE "quadros" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tarefa_id"     UUID         NOT NULL,
    "titulo"        VARCHAR(60)  NOT NULL DEFAULT '',
    "ordem"         INTEGER      NOT NULL,
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quadros_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quadros"
    ADD CONSTRAINT "quadros_tarefa_id_fkey"
    FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "quadros_tarefa_id_ordem_idx"
    ON "quadros"("tarefa_id", "ordem");

-- ---------- 3. Colunas ----------
-- Título vazio é válido de propósito: o protótipo já oferece
-- "deixe em branco para uma coluna sem título", e isso é escolha de
-- layout, não campo faltando. Por isso DEFAULT '' e nenhum CHECK de
-- não-vazio aqui — diferente de `tarefas.titulo`.
CREATE TABLE "quadro_colunas" (
    "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "quadro_id" UUID        NOT NULL,
    "titulo"    VARCHAR(60) NOT NULL DEFAULT '',
    "ordem"     INTEGER     NOT NULL,

    CONSTRAINT "quadro_colunas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quadro_colunas"
    ADD CONSTRAINT "quadro_colunas_quadro_id_fkey"
    FOREIGN KEY ("quadro_id") REFERENCES "quadros"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "quadro_colunas_quadro_id_ordem_idx"
    ON "quadro_colunas"("quadro_id", "ordem");

-- ---------- 4. Registros (os post-its) ----------
-- Aqui o título NÃO pode ser vazio: um registro sem texto nenhum é
-- um card em branco que ninguém sabe o que significa. A descrição
-- pode faltar — um post-it de uma linha é legítimo.
CREATE TABLE "registros" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "coluna_id"     UUID         NOT NULL,
    "titulo"        VARCHAR(60)  NOT NULL,
    "descricao"     VARCHAR(280) NOT NULL DEFAULT '',
    "ordem"         INTEGER      NOT NULL,
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registros_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "registros"
    ADD CONSTRAINT "registros_titulo_nao_vazio"
    CHECK (length(btrim("titulo")) > 0);

ALTER TABLE "registros"
    ADD CONSTRAINT "registros_coluna_id_fkey"
    FOREIGN KEY ("coluna_id") REFERENCES "quadro_colunas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "registros_coluna_id_ordem_idx"
    ON "registros"("coluna_id", "ordem");
