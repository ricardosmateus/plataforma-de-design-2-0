-- ============================================================
-- Avaliação do conteúdo de IA (IA-AVAL) — ia-avaliacao.md
-- ============================================================
-- O Claude gera; o JEV (ou o Claude, quando o JEV falha) avalia, e
-- a nota fica gravada aqui. Na Fase 1 só grava: nada aparece na tela.
--
-- `ADD VALUE` em TipoConsumoIa: nada nesta migração usa o valor
-- novo, condição do PostgreSQL para ele rodar dentro da transação.
--
-- Sem FOREIGN KEY para o alvo: ele é polimórfico (idéia hoje;
-- mensagem, ação e fonte depois), mesmo motivo de `consumos_ia`.
-- ============================================================

ALTER TYPE "TipoConsumoIa" ADD VALUE 'avaliacao';

CREATE TYPE "AlvoAvaliacaoIa" AS ENUM ('ideia', 'mensagem', 'acao', 'fonte');
CREATE TYPE "AvaliadorIa" AS ENUM ('jev', 'claude', 'nenhum');
CREATE TYPE "FaixaAvaliacaoIa" AS ENUM ('alta', 'revisar', 'baixa', 'nao_avaliado');
CREATE TYPE "EstadoAvaliacaoIa" AS ENUM ('ativa', 'excluida', 'desatualizada');

CREATE TABLE "avaliacoes_ia" (
  "id"         UUID NOT NULL,
  "alvo_tipo"  "AlvoAvaliacaoIa" NOT NULL,
  "alvo_id"    UUID NOT NULL,
  "projeto_id" UUID NOT NULL,

  "avaliador" "AvaliadorIa" NOT NULL,
  "modelo"    TEXT,
  "geral"     INTEGER,
  "faixa"     "FaixaAvaliacaoIa" NOT NULL,
  "incerta"   BOOLEAN NOT NULL DEFAULT false,

  "criterios" JSONB NOT NULL DEFAULT '{}',
  "alertas"   JSONB NOT NULL DEFAULT '[]',

  "estado" "EstadoAvaliacaoIa" NOT NULL DEFAULT 'ativa',

  "operacao_id" UUID,

  "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "avaliacoes_ia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "avaliacoes_ia_alvo_tipo_alvo_id_idx" ON "avaliacoes_ia"("alvo_tipo", "alvo_id");
CREATE INDEX "avaliacoes_ia_projeto_id_criado_em_idx" ON "avaliacoes_ia"("projeto_id", "criado_em");
