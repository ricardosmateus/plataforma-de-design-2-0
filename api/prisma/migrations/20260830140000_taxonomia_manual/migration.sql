-- Marca a idéia cuja pasta foi decidida por uma pessoa, e não pela IA.
--
-- Sem esta coluna, corrigir a classificação na tela seria inútil: a
-- próxima reclassificação (disparada ao editar o texto da idéia)
-- sobrescreveria a correção sem avisar. A pessoa arrumaria de novo,
-- e de novo, sem entender por quê.
--
-- `false` como padrão é o que faz o dado existente continuar
-- valendo: tudo que está lá hoje veio da IA.
ALTER TABLE "ideias"
  ADD COLUMN "taxonomia_manual" BOOLEAN NOT NULL DEFAULT false;
