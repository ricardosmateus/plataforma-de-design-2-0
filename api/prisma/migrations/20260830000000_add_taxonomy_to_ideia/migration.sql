-- Migration: Add taxonomy fields (assunto + tags) to Ideia model

-- Add columns to ideias table
ALTER TABLE ideias
  ADD COLUMN assunto VARCHAR(60),
  ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Create index for efficient filtering by assunto + status
CREATE INDEX idx_ideias_assunto_finalizado 
  ON ideias(projeto_id, assunto) 
  WHERE arquivado_em IS NULL AND status = 'finalizado';

-- Add comment to clarify fields
COMMENT ON COLUMN ideias.assunto IS 'Categoria principal (pasta) — preenchida ao entrar em "finalizado", limpa ao sair';
COMMENT ON COLUMN ideias.tags IS 'Categorias secundárias (arestas do grafo) — preenchidas ao entrar em "finalizado", limpas ao sair';
