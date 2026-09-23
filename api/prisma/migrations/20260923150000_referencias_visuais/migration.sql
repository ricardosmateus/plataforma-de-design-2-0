-- ============================================================
-- Referências visuais — tipo de tarefa novo e a tabela das
-- referências (ATV-TAR-CRIA-007, BOARD-REF)
-- ============================================================
-- Só acrescenta: um valor de enum, um enum novo e uma tabela.
-- Nenhuma linha existente muda.
--
-- ADD VALUE fica fora de qualquer uso do valor nesta mesma
-- migração, que é a condição do PostgreSQL para ele rodar dentro
-- da transação da migração (mesmo caso de 'aguardando' em
-- 20260914132503_portao_confirmacao).
-- ============================================================

ALTER TYPE "TipoTarefa" ADD VALUE 'referencias_visuais';

CREATE TYPE "TipoReferenciaVisual" AS ENUM ('site', 'imagem');

-- Presa à TAREFA, com CASCADE: excluir a tarefa apaga a linha de
-- verdade (ATV-TAR-EXCLUI-001), e uma referência órfã não teria
-- como ser vista nem apagada por ninguém.
CREATE TABLE "referencias_visuais" (
    "id"         UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "tarefa_id"  UUID                   NOT NULL,
    "tipo"       "TipoReferenciaVisual" NOT NULL,
    "url"        TEXT                   NOT NULL,
    "nome"       TEXT                   NOT NULL DEFAULT '',
    "criado_por" UUID                   NOT NULL,
    "criado_em"  TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referencias_visuais_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "referencias_visuais"
    ADD CONSTRAINT "referencias_visuais_tarefa_id_fkey"
    FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "referencias_visuais_tarefa_id_tipo_criado_em_idx"
    ON "referencias_visuais"("tarefa_id", "tipo", "criado_em");
