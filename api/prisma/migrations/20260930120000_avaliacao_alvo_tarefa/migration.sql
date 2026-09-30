-- planejamento-jev-tarefas.md §4.4 (A2) — IA-AVAL-018
-- A tarefa gerada em "Nova tarefa → Gerar com ajuda da IA" passa a ser
-- alvo de avaliação. Aditiva: nenhum DROP, nenhuma coluna alterada —
-- o mesmo padrão de `aguardando` no portão da pesquisa.
--
-- [conferir] O enum não tem @@map no schema.prisma (linhas 1526–1531),
-- então o tipo no Postgres se chama "AlvoAvaliacaoIa". Se a migração
-- que criou `avaliacoes_ia` usou outro nome, troque aqui.
ALTER TYPE "AlvoAvaliacaoIa" ADD VALUE IF NOT EXISTS 'tarefa';
