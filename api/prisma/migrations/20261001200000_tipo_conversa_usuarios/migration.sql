-- ATV-TAR-CRIA-011 (01/10/2026): tipo "Conversa com usuários".
-- Aditiva: nenhum DROP, nenhuma linha alterada. Mesmo padrão da
-- migração dos tipos-matriz (20260930150000_tipos_matriz).
ALTER TYPE "TipoTarefa" ADD VALUE IF NOT EXISTS 'conversa_usuarios';
