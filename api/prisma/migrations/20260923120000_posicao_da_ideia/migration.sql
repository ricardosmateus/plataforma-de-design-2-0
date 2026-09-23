-- A idéia passa a ter posição dentro da coluna (IDEIA-ORDEM-001).
--
-- Até aqui a ordem de uma coluna era só "mais recente primeiro", derivada
-- do `criado_em`. Com o arrastar dentro da mesma coluna, a ordem vira
-- escolha da pessoa, e precisa ser gravada.
--
-- Menor `posicao` = mais acima. O default é -(epoch em ms): uma idéia
-- nova fica mais negativa que todas as anteriores e nasce no topo, sem
-- nenhuma rota precisar calcular posição ao criar. É também o que deixa
-- esta migração invisível para quem nunca reorganizou nada: o UPDATE
-- abaixo grava nas linhas existentes o mesmo valor derivado do
-- `criado_em`, e o quadro continua exatamente na ordem em que estava.
--
-- Double, e não inteiro: reorganizar grava 0..n-1 na coluna, e o card
-- que chega de outra coluna entra em (menor posição - 1). Os dois
-- convivem com os valores negativos do default sem colisão.
ALTER TABLE "ideias"
  ADD COLUMN "posicao" DOUBLE PRECISION NOT NULL
  DEFAULT ((- (EXTRACT(EPOCH FROM now()) * 1000)))::double precision;

UPDATE "ideias"
  SET "posicao" = ((- (EXTRACT(EPOCH FROM "criado_em") * 1000)))::double precision;

-- Toda leitura do quadro ordena por projeto + coluna + posição.
CREATE INDEX "ideias_projeto_id_status_posicao_idx"
  ON "ideias" ("projeto_id", "status", "posicao");
