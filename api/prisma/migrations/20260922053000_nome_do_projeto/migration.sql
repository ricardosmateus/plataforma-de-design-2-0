-- O projeto passa a ter nome próprio.
--
-- Até aqui um projeto era identificado só pelo `tipo`, e o nome no card
-- vinha de `CATALOGO_TIPOS` — todo projeto startup se chamava "Startup".
-- Com a lista de possíveis projetos na modal "Novo projeto" (12
-- categorias), o que a pessoa escolhe é o NOME: "Landing Page",
-- "Rebranding", "Design Sprint".
--
-- `tipo` continua decidindo o que o projeto ABRE por dentro, e segue
-- valendo PROJ-CRIA-006: o único tipo criável é `startup`. O nome não
-- promete tela nenhuma — é rótulo. Essa separação é o que deixa a lista
-- existir sem reabrir PROJ-CRIA-007, que exige tela pronta por tipo.
--
-- NULL é deliberado para as linhas existentes: projeto criado antes da
-- lista não tem nome escolhido, e para ele o catálogo responde como
-- sempre respondeu. Coluna anulável não reescreve a tabela e não trava
-- escrita durante a migração.
ALTER TABLE "projetos"
  ADD COLUMN "nome" TEXT;
