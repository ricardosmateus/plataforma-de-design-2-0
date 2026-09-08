-- ============================================================
-- MÓDULO DE ATIVIDADES — tabela `tarefas`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/atividades/atividade-lista.md
--         §1 (ATV-ACESSO, ATV-TAR-CRIA, ATV-TAR-ORDEM, ATV-TAR-CONCLUIR)
--         §3 (modelo de dados)
-- Autorizado em 28/08/2026 (decisão A17).
--
-- Não existe tabela `atividades` — a atividade é a idéia (§0 do
-- documento acima). Esta migração só acrescenta `tarefas`, presa
-- direto a `ideias.id`.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- Só dois estados (ATV-TAR-CONCLUIR-001/002): nascer sempre
-- "pendente" (ATV-TAR-CRIA-003), e toda tarefa concluída pode
-- voltar a "pendente".
CREATE TYPE "StatusTarefa" AS ENUM ('pendente', 'concluida');

CREATE TABLE "tarefas" (
    "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
    "ideia_id"      UUID           NOT NULL,
    "titulo"        VARCHAR(60)    NOT NULL,
    "descricao"     VARCHAR(280)   NOT NULL,
    "status"        "StatusTarefa" NOT NULL DEFAULT 'pendente',
    "ordem"         INTEGER        NOT NULL,
    "criado_em"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- Mesmos limites de idéia (ATV-TAR-CRIA-001, decisão A18). Validados
-- no servidor primeiro; o VARCHAR aqui é a última linha de defesa,
-- não a primeira — mesmo raciocínio de `ideias_titulo_nao_vazio`.
ALTER TABLE "tarefas"
    ADD CONSTRAINT "tarefas_titulo_nao_vazio"
    CHECK (length(btrim("titulo")) > 0);

ALTER TABLE "tarefas"
    ADD CONSTRAINT "tarefas_descricao_nao_vazia"
    CHECK (length(btrim("descricao")) > 0);

-- ideia_id nunca muda: uma tarefa não troca de atividade. CASCADE
-- existe como rede de segurança do banco — na prática nada é
-- apagado de verdade neste projeto (E1), mas aqui ainda não há
-- regra de "arquivar tarefa" definida (pendência "Excluir tarefa",
-- atividade-lista.md §5), então o cascade cobre só o caso da idéia
-- em si sendo removida por trás (o que hoje também não acontece —
-- idéias são arquivadas, não apagadas).
ALTER TABLE "tarefas"
    ADD CONSTRAINT "tarefas_ideia_id_fkey"
    FOREIGN KEY ("ideia_id") REFERENCES "ideias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda listagem busca por idéia, sempre em ordem de prioridade
-- (ATV-TAR-ORDEM-001) — sem este índice a lista de tarefas de uma
-- atividade movimentada vira varredura assim que houver volume,
-- mesmo raciocínio dos índices equivalentes em `projetos`/`ideias`.
CREATE INDEX "tarefas_ideia_id_ordem_idx"
    ON "tarefas"("ideia_id", "ordem");
