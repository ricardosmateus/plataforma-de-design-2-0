-- Fase 1 do módulo de pesquisa de concorrentes.
-- Planejamento: planejamento-pesquisa-concorrentes.md §5
--
-- A investigação é uma conversa com estado: "o concorrente 01" só
-- significa alguma coisa porque uma consulta anterior o descobriu.
-- É esse estado que estas tabelas guardam.
--
-- Escrita à mão, como as anteriores, e pelo mesmo motivo registrado
-- no README: o CDN de binários do Prisma fica bloqueado no ambiente
-- onde a API é construída. Ela CORRESPONDE ao schema.prisma — se
-- alterar um, altere o outro.

-- ------------------------------------------------------------
-- Catálogo fechado de níveis (PES-001). Todo o código de custo olha
-- este campo, nunca o texto da pergunta: a diferença entre o
-- primeiro valor e o último é de cerca de cem vezes no preço.
-- ------------------------------------------------------------
CREATE TYPE "NivelPesquisa" AS ENUM
  ('conhecimento', 'busca', 'lugares', 'navegacao');

-- PES-008, que é DIN-006 outra vez: "não achei nada" e "a busca
-- falhou" são resultados diferentes, e a tela tira o texto daqui.
CREATE TYPE "ResultadoConsulta" AS ENUM ('entregue', 'vazio', 'falhou');

CREATE TYPE "TipoEntidadePesquisa" AS ENUM ('empresa', 'unidade', 'perfil');

-- A pesquisa entra na razão com origem própria, e não como 'uso_ia':
-- do nível 'busca' em diante quem cobra é um provedor externo que não
-- é o de IA. Somar os dois numa origem só impediria responder depois
-- "quanto gastei com pesquisa?".
--
-- ADD VALUE roda dentro da transação da migração no PostgreSQL 12+,
-- desde que o valor novo não seja USADO na mesma transação — nenhuma
-- linha abaixo o usa.
ALTER TYPE "OrigemLancamento" ADD VALUE 'pesquisa';

-- ------------------------------------------------------------
-- A sessão: uma linha de investigação.
-- ------------------------------------------------------------
CREATE TABLE "pesquisa_sessoes" (
  "id" UUID NOT NULL,

  "user_id"    UUID NOT NULL,
  "empresa_id" UUID,
  "projeto_id" UUID,

  -- A tarefa que abriu esta sessão, quando veio de uma. O comentário
  -- de TipoTarefa no schema já previa isto: um tipo que dispara
  -- ferramenta externa em vez de abrir quadro em branco.
  "tarefa_id" UUID,

  "titulo" TEXT NOT NULL,

  -- Teto de gasto da investigação inteira (PES-007). Nulo = sem teto
  -- próprio, vale só o saldo. Em micros de real, DIN-001.
  "teto_micros" INTEGER,

  -- De quem a conversa está tratando AGORA — é o que resolve "ele" na
  -- pergunta seguinte. Sem FOREIGN KEY: a sessão sobrevive à entidade.
  "foco_id" UUID,

  "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "encerrado_em" TIMESTAMP(3),

  CONSTRAINT "pesquisa_sessoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pesquisa_sessoes_user_id_criado_em_idx"
  ON "pesquisa_sessoes"("user_id", "criado_em");

-- ------------------------------------------------------------
-- Cada pergunta feita dentro da sessão.
-- ------------------------------------------------------------
CREATE TABLE "pesquisa_consultas" (
  "id" UUID NOT NULL,

  "sessao_id" UUID NOT NULL,

  "nivel"     "NivelPesquisa"     NOT NULL,
  "resultado" "ResultadoConsulta" NOT NULL,

  -- O texto do usuário como ele escreveu. É a única coisa que permite
  -- conferir depois se o roteador entendeu certo: reconstruir a
  -- pergunta original a partir da resolvida não é possível.
  "pergunta" TEXT NOT NULL,

  -- O que de fato saiu para o provedor, com apelidos e pronomes já
  -- trocados pelos nomes reais.
  "pergunta_resolvida" TEXT NOT NULL,

  -- false quando a heurística não teve certeza do nível e o usuário
  -- confirmou. Guardado para medir com que frequência isso acontece —
  -- é o número que decide se vale trocar a heurística por um
  -- classificador de verdade.
  "decidido_sozinho" BOOLEAN NOT NULL DEFAULT true,

  "provedor" TEXT,

  -- Nulo quando não custou nada (nível 'conhecimento' sem chamada) ou
  -- quando falhou antes de gastar.
  "consumo_id" UUID,

  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pesquisa_consultas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pesquisa_consultas_sessao_id_criado_em_idx"
  ON "pesquisa_consultas"("sessao_id", "criado_em");

ALTER TABLE "pesquisa_consultas"
  ADD CONSTRAINT "pesquisa_consultas_sessao_id_fkey"
  FOREIGN KEY ("sessao_id") REFERENCES "pesquisa_sessoes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- O que a investigação descobriu — e é aqui que "concorrente 01" tem
-- dono.
-- ------------------------------------------------------------
CREATE TABLE "pesquisa_entidades" (
  "id" UUID NOT NULL,

  "sessao_id" UUID NOT NULL,

  "tipo" "TipoEntidadePesquisa" NOT NULL DEFAULT 'empresa',

  -- Como o usuário chama nas perguntas seguintes. NUNCA muda de dono
  -- depois de atribuído: a numeração só cresce e não reaproveita
  -- número de entidade removida. Renumerar faria toda pergunta
  -- anterior apontar para outra empresa, sem erro nenhum na tela.
  "apelido" TEXT NOT NULL,

  "nome" TEXT NOT NULL,

  -- Formato aberto de propósito: o que a Places API devolve para uma
  -- unidade não é o que uma busca devolve para uma empresa.
  "dados" JSONB,

  -- Qual consulta trouxe. Sem FOREIGN KEY: a entidade sobrevive à
  -- consulta que a descobriu.
  "descoberta_em" UUID,

  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pesquisa_entidades_pkey" PRIMARY KEY ("id")
);

-- A trava que faz "concorrente 01" ter um dono só dentro da sessão.
CREATE UNIQUE INDEX "pesquisa_entidades_sessao_id_apelido_key"
  ON "pesquisa_entidades"("sessao_id", "apelido");

CREATE INDEX "pesquisa_entidades_sessao_id_idx"
  ON "pesquisa_entidades"("sessao_id");

ALTER TABLE "pesquisa_entidades"
  ADD CONSTRAINT "pesquisa_entidades_sessao_id_fkey"
  FOREIGN KEY ("sessao_id") REFERENCES "pesquisa_sessoes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Procedência (PES-006). Toda afirmação carrega fonte.
-- ------------------------------------------------------------
CREATE TABLE "pesquisa_fontes" (
  "id" UUID NOT NULL,

  "consulta_id" UUID NOT NULL,

  "url"    TEXT NOT NULL,
  "titulo" TEXT,

  -- O trecho citado, guardado junto. A URL sozinha não basta: página
  -- sai do ar, muda, some atrás de login — e a afirmação fica sem
  -- lastro justamente quando alguém foi conferir.
  "trecho" TEXT,

  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pesquisa_fontes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pesquisa_fontes_consulta_id_idx"
  ON "pesquisa_fontes"("consulta_id");

ALTER TABLE "pesquisa_fontes"
  ADD CONSTRAINT "pesquisa_fontes_consulta_id_fkey"
  FOREIGN KEY ("consulta_id") REFERENCES "pesquisa_consultas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- O custo de uma consulta.
--
-- Tabela IRMÃ de consumos_ia, não a mesma: as colunas de dinheiro são
-- idênticas porque DIN-005 exige a mesma forma, mas a UNIDADE cobrada
-- muda por provedor — busca cobra por token e por requisição, Places
-- cobra por chamada, e consumos_ia tem tokens obrigatórios.
--
-- Sem FOREIGN KEY, como consumos_ia e creditos_lancamentos: registro
-- financeiro sobrevive ao que descreve.
-- ------------------------------------------------------------
CREATE TABLE "consumos_pesquisa" (
  "id" UUID NOT NULL,

  "user_id"     UUID NOT NULL,
  "sessao_id"   UUID,
  "consulta_id" UUID,

  "nivel"     "NivelPesquisa"     NOT NULL,
  "provedor"  TEXT                NOT NULL,
  "resultado" "ResultadoConsulta" NOT NULL,

  -- As unidades, como cada provedor as cobra. Todas opcionais: o que
  -- não se aplica fica NULO em vez de zero — zero diria "cobrou
  -- zero", nulo diz "não cobra assim".
  "tokens_entrada" INTEGER,
  "tokens_saida"   INTEGER,
  "requisicoes"    INTEGER,
  "buscas"         INTEGER,

  -- PES-003: o custo vem da resposta do provedor, na moeda dele. É o
  -- dado mais confiável da linha — se a cotação estiver errada, o real
  -- se recalcula a partir daqui; o contrário não é possível.
  "custo_usd_micros"  INTEGER,
  "cotacao_milesimos" INTEGER,

  -- DIN-005: as três partes separadas, nunca só o total.
  "custo_micros"    INTEGER,
  "comissao_micros" INTEGER,
  "total_micros"    INTEGER,

  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consumos_pesquisa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consumos_pesquisa_user_id_criado_em_idx"
  ON "consumos_pesquisa"("user_id", "criado_em");

CREATE INDEX "consumos_pesquisa_sessao_id_idx"
  ON "consumos_pesquisa"("sessao_id");
