-- Fase 0 do módulo de créditos: medir antes de cobrar.
-- Só registra consumo; não há saldo nem cobrança nesta fase.

CREATE TYPE "TipoConsumoIa" AS ENUM ('assistente', 'classificacao');
CREATE TYPE "ResultadoConsumoIa" AS ENUM ('entregue', 'descartado');

CREATE TABLE "consumos_ia" (
  "id" UUID NOT NULL,

  -- Sem FOREIGN KEY de propósito: registro financeiro precisa
  -- sobreviver ao que descreve. Apagar um usuário não pode apagar a
  -- prova de quanto se gastou com ele.
  "user_id"    UUID,
  "empresa_id" UUID,
  "projeto_id" UUID,
  "ideia_id"   UUID,

  "tipo"      "TipoConsumoIa" NOT NULL,
  "resultado" "ResultadoConsumoIa" NOT NULL,
  "modelo"    TEXT NOT NULL,

  "tokens_entrada"       INTEGER NOT NULL,
  "tokens_saida"         INTEGER NOT NULL,
  "tokens_cache_escrita" INTEGER NOT NULL DEFAULT 0,
  "tokens_cache_leitura" INTEGER NOT NULL DEFAULT 0,

  "custo_usd_micros"  INTEGER,
  "cotacao_milesimos" INTEGER,

  "custo_micros"    INTEGER,
  "comissao_micros" INTEGER,
  "total_micros"    INTEGER,

  "preco_desconhecido" BOOLEAN NOT NULL DEFAULT false,
  "cobravel"           BOOLEAN NOT NULL DEFAULT true,
  "requisicao_id"      TEXT,

  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consumos_ia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consumos_ia_user_id_criado_em_idx" ON "consumos_ia"("user_id", "criado_em");
CREATE INDEX "consumos_ia_criado_em_idx" ON "consumos_ia"("criado_em");
