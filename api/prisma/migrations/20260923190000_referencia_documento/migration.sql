-- ============================================================
-- Referência do tipo documento (BOARD-REF-008)
-- ============================================================
-- Só acrescenta um valor ao enum. Nenhuma linha existente muda,
-- e nada nesta migração usa o valor novo — condição do PostgreSQL
-- para ADD VALUE rodar dentro da transação da migração.
-- ============================================================

ALTER TYPE "TipoReferenciaVisual" ADD VALUE 'documento';
