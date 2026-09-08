-- ============================================================
-- Migração inicial — autenticação
-- ============================================================
-- Escrita à mão e validada contra PostgreSQL 16. Corresponde a
-- prisma/schema.prisma; mantenha os dois em sincronia.
-- ============================================================

CREATE TYPE "MotivoSuspensao" AS ENUM ('violacao', 'inadimplencia');
CREATE TYPE "PropositoOtp"    AS ENUM ('login', 'cadastro');

-- ---------- users ----------
CREATE TABLE "users" (
    "id"                UUID         NOT NULL,
    "nome"              TEXT         NOT NULL,
    "email"             TEXT         NOT NULL,
    "senha_hash"        TEXT         NOT NULL,
    "email_verificado"  BOOLEAN      NOT NULL DEFAULT false,
    "suspenso_em"       TIMESTAMP(3),
    "suspensao_motivo"  "MotivoSuspensao",
    "termos_versao"     TEXT,
    "termos_aceitos_em" TIMESTAMP(3),
    "criado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ---------- sessions ----------
CREATE TABLE "sessions" (
    "id"                 UUID         NOT NULL,
    "user_id"            UUID         NOT NULL,
    "refresh_token_hash" TEXT         NOT NULL,
    "lembrar_de_mim"     BOOLEAN      NOT NULL DEFAULT false,
    "expira_em"          TIMESTAMP(3) NOT NULL,
    "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_em"        TIMESTAMP(3),
    "ip"                 TEXT,
    "user_agent"         TEXT,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
CREATE INDEX "sessions_user_id_idx"   ON "sessions"("user_id");
CREATE INDEX "sessions_expira_em_idx" ON "sessions"("expira_em");

-- ---------- otp_codes ----------
CREATE TABLE "otp_codes" (
    "id"          UUID           NOT NULL,
    "user_id"     UUID           NOT NULL,
    "proposito"   "PropositoOtp" NOT NULL,
    "codigo_hash" TEXT           NOT NULL,
    "expira_em"   TIMESTAMP(3)   NOT NULL,
    "tentativas"  INTEGER        NOT NULL DEFAULT 0,
    "usado_em"    TIMESTAMP(3),
    "criado_em"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "otp_codes_user_id_proposito_idx" ON "otp_codes"("user_id", "proposito");
CREATE INDEX "otp_codes_expira_em_idx"         ON "otp_codes"("expira_em");

-- ---------- dispositivos_confiaveis ----------
CREATE TABLE "dispositivos_confiaveis" (
    "id"            UUID         NOT NULL,
    "user_id"       UUID         NOT NULL,
    "token_hash"    TEXT         NOT NULL,
    "apelido"       TEXT,
    "expira_em"     TIMESTAMP(3) NOT NULL,
    "ultimo_uso_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dispositivos_confiaveis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dispositivos_confiaveis_token_hash_key" ON "dispositivos_confiaveis"("token_hash");
CREATE INDEX "dispositivos_confiaveis_user_id_idx" ON "dispositivos_confiaveis"("user_id");

-- ---------- login_attempts ----------
CREATE TABLE "login_attempts" (
    "id"            UUID         NOT NULL,
    "user_id"       UUID,
    "email_tentado" TEXT         NOT NULL,
    "sucesso"       BOOLEAN      NOT NULL,
    "ip"            TEXT,
    "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_attempts_email_tentado_criado_em_idx" ON "login_attempts"("email_tentado", "criado_em");
CREATE INDEX "login_attempts_ip_criado_em_idx"            ON "login_attempts"("ip", "criado_em");

-- ---------- chaves estrangeiras ----------
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "otp_codes"
  ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispositivos_confiaveis"
  ADD CONSTRAINT "dispositivos_confiaveis_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, não CASCADE: apagar a conta não pode apagar o rastro
-- de auditoria das tentativas de acesso a ela.
ALTER TABLE "login_attempts"
  ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
