-- Fase 3 do módulo de créditos: cobranças Pix, em sandbox.
-- O crédito de verdade continua nascendo só em "creditos_lancamentos"
-- (tipo 'recarga'), gravado por rotas/webhooks.ts depois de confirmar
-- o pagamento. Esta tabela é "o que foi pedido ao PSP", não o
-- lançamento em si.

CREATE TYPE "StatusCobrancaPix" AS ENUM
  ('aguardando', 'pago', 'expirado', 'cancelado');

CREATE TABLE "cobrancas_pix" (
  "id" UUID NOT NULL,

  -- Sem FOREIGN KEY: mesmo motivo de consumos_ia e
  -- creditos_lancamentos — registro financeiro sobrevive ao que descreve.
  "user_id" UUID NOT NULL,

  -- Chave de idempotência com o PSP, e o mesmo valor usado como
  -- origem_id do lançamento 'recarga' correspondente.
  "txid" TEXT NOT NULL,

  -- DIN-001: micro de real, nunca centavo — mesma unidade do resto
  -- do módulo, mesmo o valor de uma recarga sendo sempre "redondo".
  "valor_micros" INTEGER NOT NULL,

  "status" "StatusCobrancaPix" NOT NULL DEFAULT 'aguardando',

  -- 'sandbox' nesta fase; outro valor na Fase 4, por configuração.
  "psp" TEXT NOT NULL,

  -- O payload EMV completo (o "copia e cola"). Gerado uma vez.
  "brcode" TEXT NOT NULL,

  "expira_em" TIMESTAMP(3) NOT NULL,
  "pago_em"   TIMESTAMP(3),

  -- Id que o Banco Central dá ao Pix pago de verdade. Único quando
  -- presente: o mesmo pagamento não confirma duas cobranças.
  "e2e_id" TEXT,

  -- O aviso do PSP como chegou, cru — para auditoria e disputa.
  "retorno_bruto" JSONB,

  "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cobrancas_pix_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cobrancas_pix_txid_key" ON "cobrancas_pix"("txid");
CREATE UNIQUE INDEX "cobrancas_pix_e2e_id_key" ON "cobrancas_pix"("e2e_id");
CREATE INDEX "cobrancas_pix_user_id_criado_em_idx"
  ON "cobrancas_pix"("user_id", "criado_em");
