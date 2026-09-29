-- ============================================================
-- Quadro-matriz (BOARD-PESQUISA-MATRIZ)
-- ============================================================
-- O resultado de uma pesquisa que pede matriz (SWOT, CSD, impacto ×
-- esforço, comparativa) vira um quadro próprio. Os dados são os de
-- sempre — colunas e registros —; o que muda é o desenho, e é o
-- `modelo` que diz qual.
--
-- `ADD VALUE` e a coluna nova não mexem em nenhuma linha existente,
-- e nada aqui USA o valor novo — condição do PostgreSQL para o
-- ADD VALUE rodar dentro da transação da migração.
-- ============================================================

ALTER TYPE "QuadroTipo" ADD VALUE 'matriz';

ALTER TABLE "quadros" ADD COLUMN "modelo" TEXT;
