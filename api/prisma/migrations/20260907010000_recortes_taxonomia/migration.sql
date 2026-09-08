-- Recortes de taxonomia — o texto da idéia partido por tema.
--
-- A classificação já dizia QUE uma idéia finalizada fala de
-- "Mercado, Estratégia e Concorrentes". Não dizia ONDE: para saber o
-- que ela diz sobre concorrentes era preciso reler a atividade
-- inteira, que é o trabalho que a classificação existia para poupar.
--
-- Cada linha é um bloco de texto que JÁ EXISTE (um registro de um
-- quadro) apontado para uma categoria. `texto` é cópia, não
-- referência: o registro pode ser editado ou apagado depois, e um
-- trecho que muda sozinho debaixo de quem está lendo é pior do que
-- um trecho com data.
--
-- A UNIQUE em `registro_id` é a regra de negócio, não otimização: um
-- bloco pertence a no máximo uma categoria. É o banco — e não a boa
-- vontade do modelo — que impede o mesmo parágrafo de aparecer em
-- "Mercado" e em "Concorrentes" ao mesmo tempo.
CREATE TABLE "recortes_taxonomia" (
  "id"          UUID         NOT NULL,
  "ideia_id"    UUID         NOT NULL,
  "categoria"   TEXT         NOT NULL,
  "texto"       TEXT         NOT NULL,
  "tarefa_id"   UUID         NOT NULL,
  "quadro_id"   UUID         NOT NULL,
  "registro_id" UUID         NOT NULL,
  "ordem"       INTEGER      NOT NULL,
  "criado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recortes_taxonomia_pkey" PRIMARY KEY ("id")
);

-- Um registro, uma categoria. Ver acima.
CREATE UNIQUE INDEX "recortes_taxonomia_registro_id_key"
  ON "recortes_taxonomia"("registro_id");

-- A página do tema pergunta "desta categoria, o que existe".
CREATE INDEX "recortes_taxonomia_categoria_idx"
  ON "recortes_taxonomia"("categoria");

-- A limpeza pergunta "desta idéia, apague tudo" — e ela roda dentro
-- da mesma escrita que tira a idéia de "finalizado", então precisa
-- ser barata.
CREATE INDEX "recortes_taxonomia_ideia_id_idx"
  ON "recortes_taxonomia"("ideia_id");

-- CASCADE: idéia apagada não deixa recorte órfão para trás. O mesmo
-- motivo pelo qual as tarefas já são CASCADE.
ALTER TABLE "recortes_taxonomia"
  ADD CONSTRAINT "recortes_taxonomia_ideia_id_fkey"
  FOREIGN KEY ("ideia_id") REFERENCES "ideias"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Tarefa apagada leva os recortes dela junto. Sem isto, o link do
-- rodapé ("editar no quadro") apontaria para uma tarefa que não
-- existe mais, e o trecho seguiria na página do tema como se ainda
-- houvesse onde corrigi-lo.
CREATE INDEX "recortes_taxonomia_tarefa_id_idx"
  ON "recortes_taxonomia"("tarefa_id");

ALTER TABLE "recortes_taxonomia"
  ADD CONSTRAINT "recortes_taxonomia_tarefa_id_fkey"
  FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
