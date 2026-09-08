-- ============================================================
-- AÇÕES PROPOSTAS PELO ASSISTENTE — colunas em `ia_mensagens`
-- ============================================================
-- Regras: Regras_de_negocio/modulos/ia/ia-assistente-conhecimento.md
--         §1.5 (IA-ACAO)
-- Autorizado em 26/08/2026.
--
-- O assistente passa a poder PROPOR criar, editar ou mover uma
-- idéia quando a pessoa pede — nunca decidir por conta própria
-- (IA-ACAO-001). A proposta viaja na mensagem; só vira escrita real
-- no quadro depois de confirmação explícita, na rota de
-- confirmação, que valida de novo (IA-ACAO-005) — estas colunas
-- guardam só a PROPOSTA, nunca o efeito colateral direto.
--
-- Escrita à mão, mesmo motivo das migrações anteriores: o CDN de
-- binários do Prisma não é alcançável do ambiente onde este arquivo
-- foi gerado. Validada contra PostgreSQL 16.
-- ============================================================

-- Fechado de propósito: só os três verbos que a pessoa autorizou.
-- Arquivar/excluir continuam fora do alcance do assistente.
CREATE TYPE "TipoAcaoIa" AS ENUM ('criar_ideia', 'editar_ideia', 'mover_ideia');

-- `pendente` é o único estado em que a confirmação ainda pode agir
-- (IA-ACAO-006) — um segundo clique em cima de `confirmada` ou
-- `descartada` não repete nem desfaz nada.
CREATE TYPE "StatusAcaoIa" AS ENUM ('nenhuma', 'pendente', 'confirmada', 'descartada');

ALTER TABLE "ia_mensagens"
    ADD COLUMN "acao_tipo"     "TipoAcaoIa",
    ADD COLUMN "acao_dados"    JSONB,
    ADD COLUMN "acao_status"   "StatusAcaoIa" NOT NULL DEFAULT 'nenhuma',
    ADD COLUMN "acao_ideia_id" UUID;

-- Proposta só existe em resposta do assistente, mesmo raciocínio já
-- aplicado a `fontes` na migração anterior.
ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_acao_so_do_assistente"
    CHECK ("autor" = 'assistente' OR ("acao_tipo" IS NULL AND "acao_status" = 'nenhuma'));

-- `acao_tipo` e `acao_status = 'pendente'/'confirmada'/'descartada'`
-- andam juntos: não existe status de ação sem tipo de ação, nem tipo
-- de ação preso em `nenhuma`.
ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_acao_tipo_status_coerentes"
    CHECK (("acao_tipo" IS NULL AND "acao_status" = 'nenhuma')
        OR ("acao_tipo" IS NOT NULL AND "acao_status" <> 'nenhuma'));

-- `acao_ideia_id` só existe depois de confirmada — antes disso não
-- há idéia nenhuma resultante para apontar.
ALTER TABLE "ia_mensagens"
    ADD CONSTRAINT "ia_mensagens_acao_ideia_so_confirmada"
    CHECK ("acao_ideia_id" IS NULL OR "acao_status" = 'confirmada');

-- Referencial, não FK: a idéia pode ser arquivada depois de a ação
-- ter sido confirmada, e a mensagem precisa continuar apontando para
-- ela mesmo assim (mesmo raciocínio de `fontes`, que também não
-- reage a mudança posterior do que referencia).
