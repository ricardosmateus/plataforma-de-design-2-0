-- ATV-TAR-CRIA-009 (30/09/2026): tarefas que SÃO uma matriz de decisão.
-- O board delas abre com a matriz vazia do modelo de mesmo nome
-- (BOARD-MATRIZ-TAREFA). Aditiva: nenhum DROP, nenhuma linha alterada.
--
-- O enum não tem @@map no schema.prisma, então o tipo no Postgres se
-- chama "TipoTarefa" — o mesmo padrão de `referencias_visuais`
-- (23/09/2026) e de "AlvoAvaliacaoIa" (30/09/2026, que rodou limpo).
ALTER TYPE "TipoTarefa" ADD VALUE IF NOT EXISTS 'swot';
ALTER TYPE "TipoTarefa" ADD VALUE IF NOT EXISTS 'impacto_esforco';
ALTER TYPE "TipoTarefa" ADD VALUE IF NOT EXISTS 'comparativa';
