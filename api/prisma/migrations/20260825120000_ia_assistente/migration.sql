-- ============================================================
-- ASSISTENTE DE IA — `ia_conversas` e `ia_mensagens`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/ia/ia-assistente-conversa.md §3
--         Regras_de_negocio/modulos/ia/ia-assistente-conhecimento.md
-- Autorizado em 25/08/2026.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- Enum e não booleano: se um dia entrar uma terceira origem (uma
-- nota do sistema, por exemplo), ela nasce nomeada em vez de virar
-- um "não é pessoa".
CREATE TYPE "AutorMensagem" AS ENUM ('pessoa', 'assistente');

CREATE TABLE "ia_conversas" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projeto_id"    UUID         NOT NULL,
    "usuario_id"    UUID         NOT NULL,
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_conversas_pkey" PRIMARY KEY ("id")
);

-- Uma conversa por pessoa, por projeto (IA-CONV-001, decisão A10).
-- É o índice único que impede duas conversas paralelas nascerem de
-- duas abas abertas ao mesmo tempo.
CREATE UNIQUE INDEX "ia_conversas_projeto_usuario_unico"
    ON "ia_conversas"("projeto_id", "usuario_id");

ALTER TABLE "ia_conversas"
    ADD CONSTRAINT "ia_conversas_projeto_id_fkey"
    FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ia_conversas"
    ADD CONSTRAINT "ia_conversas_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ia_mensagens" (
    "id"                   UUID            NOT NULL DEFAULT gen_random_uuid(),
    "conversa_id"          UUID            NOT NULL,
    "autor"                "AutorMensagem" NOT NULL,
    "texto"                TEXT            NOT NULL,
    -- [{ideiaId, categoria}] — a procedência COMO FOI VERIFICADA no
    -- momento da resposta (IA-GARANT-003). Não é recalculada depois:
    -- se a idéia sair de `Finalizado`, a mensagem antiga continua
    -- registrando o que valia quando foi dita.
    "fontes"               JSONB,
    "sem_verdade_validada" BOOLEAN         NOT NULL DEFAULT false,
    "criado_em"            TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_mensagens_pkey" PRIMARY KEY ("id")
);

-- Mensagem vazia não existe: nem pergunta em branco, nem resposta
-- em branco. Mesmo raciocínio dos CHECKs de `ideias` — o servidor já
-- recusa, mas qualquer outro caminho de escrita também deve recusar.
ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_texto_nao_vazio"
    CHECK (length(btrim("texto")) > 0);

-- Procedência só existe em resposta do assistente. Pergunta de
-- pessoa com `fontes` preenchido seria dado incoerente.
ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_fontes_so_do_assistente"
    CHECK ("autor" = 'assistente' OR "fontes" IS NULL);

ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_conversa_id_fkey"
    FOREIGN KEY ("conversa_id") REFERENCES "ia_conversas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda leitura é "as mensagens desta conversa, em ordem".
CREATE INDEX "ia_mensagens_conversa_id_criado_em_idx"
    ON "ia_mensagens"("conversa_id", "criado_em");
