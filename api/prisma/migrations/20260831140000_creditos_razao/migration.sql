-- Fase 1 do módulo de créditos: a razão e o saldo.
-- Ainda não há Pix; o crédito entra por script (scripts/creditar.ts).

CREATE TYPE "TipoLancamento" AS ENUM
  ('recarga', 'consumo', 'reserva', 'liberacao', 'estorno', 'ajuste');

CREATE TYPE "OrigemLancamento" AS ENUM
  ('cobranca_pix', 'uso_ia', 'contratacao', 'manual');

-- Saldo é CACHE da soma dos lançamentos, gravado na mesma transação.
ALTER TABLE "users" ADD COLUMN "saldo_micros" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "creditos_lancamentos" (
  "id" UUID NOT NULL,

  -- Sem FOREIGN KEY: registro financeiro sobrevive ao que descreve.
  "user_id" UUID NOT NULL,

  "tipo"   "TipoLancamento" NOT NULL,
  "origem" "OrigemLancamento" NOT NULL,

  -- Com sinal: + entra, - sai. A SOMA desta coluna tem que dar o
  -- saldo do usuário; é essa igualdade que a conferência verifica.
  "valor_micros" INTEGER NOT NULL,

  -- Fotografia do saldo após o lançamento. Redundante de propósito.
  "saldo_depois" INTEGER NOT NULL,

  "origem_id" UUID,
  "descricao" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "creditos_lancamentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creditos_lancamentos_user_id_criado_em_idx"
  ON "creditos_lancamentos"("user_id", "criado_em");

-- DIN-004: uma origem gera UM lançamento de cada tipo. Webhook de
-- pagamento reenviado (normal e esperado) não credita duas vezes.
--
-- Sem cláusula WHERE de propósito: no PostgreSQL, NULL é DISTINTO de
-- NULL num índice único, então vários ajustes manuais (que têm
-- `origem_id` nulo) continuam permitidos sem precisar de índice
-- parcial. Um índice parcial aqui só criaria divergência entre este
-- arquivo e o schema.prisma, que não sabe expressá-lo.
CREATE UNIQUE INDEX "creditos_lancamentos_tipo_origem_id_key"
  ON "creditos_lancamentos"("tipo", "origem_id");
