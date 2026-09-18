-- DIN-014 — a chave que liga consumo medido a lançamento cobrado.
--
-- `consumir()` já gera um `operacaoId` e o grava na razão como
-- `origemId`; as tabelas de medição nunca o guardaram. Sem ele, uma
-- linha medida não sabe dizer se foi cobrada — e o Histórico de uso,
-- desde que DIN-013 o tornou o único lugar onde valor aparece, precisa
-- responder exatamente isso quando CREDITOS_COBRAR=nao mediu sem lançar.
--
-- Aditiva e anulável de propósito: as linhas anteriores ficam com NULL,
-- e o Histórico as ignora em vez de adivinhar. Adivinhar erraria para o
-- lado de mostrar o mesmo gasto duas vezes.

ALTER TABLE "consumos_ia" ADD COLUMN "operacao_id" UUID;
ALTER TABLE "consumos_pesquisa" ADD COLUMN "operacao_id" UUID;

CREATE INDEX "consumos_ia_operacao_id_idx" ON "consumos_ia" ("operacao_id");
CREATE INDEX "consumos_pesquisa_operacao_id_idx" ON "consumos_pesquisa" ("operacao_id");
