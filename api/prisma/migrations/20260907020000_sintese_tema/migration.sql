-- Síntese de tema — leitura guiada, gráficos e lacunas.
-- Documentacao/enriquecimento-tema.md
--
-- Uma linha por (empresa, categoria), não por idéia: a síntese é do
-- TEMA inteiro, somando recortes de idéias diferentes. As três fases
-- (leitura, gráficos, lacunas) moram na mesma linha, com status e
-- fingerprint próprios cada uma — independentes na falha, mas a
-- mesma síntese de um mesmo tema.

-- Novo tipo de consumo, ao lado de "assistente" e "classificacao":
-- separa "quanto custou enriquecer os temas" de "quanto custou
-- classificar idéias" nas mesmas perguntas que já se fazem hoje.
ALTER TYPE "TipoConsumoIa" ADD VALUE 'sintese_tema';

CREATE TABLE "sintese_tema" (
  "id"         UUID NOT NULL,
  "empresa_id" UUID NOT NULL,
  "categoria"  TEXT NOT NULL,

  "fingerprint_leitura"  TEXT,
  "fingerprint_graficos" TEXT,
  "fingerprint_lacunas"  TEXT,

  "leitura"        JSONB,
  "status_leitura" TEXT NOT NULL DEFAULT 'pendente',

  "graficos"        JSONB,
  "status_graficos" TEXT NOT NULL DEFAULT 'pendente',

  "lacunas"        JSONB,
  "status_lacunas" TEXT NOT NULL DEFAULT 'pendente',

  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sintese_tema_pkey" PRIMARY KEY ("id")
);

-- Uma síntese por tema da empresa — nunca duas linhas concorrentes
-- para "Mercado" da mesma empresa. O upsert de gravação depende
-- desta chave composta.
CREATE UNIQUE INDEX "sintese_tema_empresa_id_categoria_key"
  ON "sintese_tema"("empresa_id", "categoria");

-- CASCADE: empresa apagada não deixa síntese órfã para trás. Mesmo
-- motivo de projetos e recortes_taxonomia.
ALTER TABLE "sintese_tema"
  ADD CONSTRAINT "sintese_tema_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
