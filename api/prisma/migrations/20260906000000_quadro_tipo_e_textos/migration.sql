-- Alinha o banco ao schema.prisma.
--
-- O quadro-documento foi declarado no schema e implementado na rota,
-- mas nunca ganhou a migration correspondente. Enquanto isso faltou,
-- TODO PUT /quadros falhava: o cliente Prisma nao conhecia `tipo`, a
-- transacao fazia rollback inteira, e a tela mostrava "Salvando..."
-- sobre uma gravacao que nunca acontecia. Post-it tambem nao salvava
-- — a rota manda `tipo` em todo quadro, com default 'postits'.

-- 1. Tipo do quadro ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "QuadroTipo" AS ENUM ('postits', 'documento');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "quadros"
  ADD COLUMN IF NOT EXISTS "tipo" "QuadroTipo" NOT NULL DEFAULT 'postits';

-- 2. Textos livres ----------------------------------------------------
-- As quatro colunas nasceram VARCHAR(60)/VARCHAR(280), do tempo em que
-- todo registro era post-it. O quadro-documento existe justamente para
-- guardar resposta longa: a rota aceita 260 no titulo e 50000 na
-- descricao, e schema.prisma ja declara String puro (TEXT) nas quatro.
-- Sem isto, uma resposta de pesquisa estourava a coluna e derrubava a
-- mesma transacao — segundo motivo para a pesquisa nunca persistir.
ALTER TABLE "quadros"        ALTER COLUMN "titulo"    TYPE TEXT;
ALTER TABLE "quadro_colunas" ALTER COLUMN "titulo"    TYPE TEXT;
ALTER TABLE "registros"      ALTER COLUMN "titulo"    TYPE TEXT;
ALTER TABLE "registros"      ALTER COLUMN "descricao" TYPE TEXT;
