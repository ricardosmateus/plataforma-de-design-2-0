/* ============================================================
   Projeto com o mesmo nome na mesma empresa — PROJ-CRIA-012
   ============================================================
   Sem `import` de banco ou rede, como `catalogo.ts`: é a regra pura
   ("este nome já existe aqui?"), testável sem Postgres.

   Não bloqueia nada — PROJ-CRIA-003 continua valendo: uma empresa
   PODE ter dois "Logotipo". O que esta função decide é só se a
   pessoa precisa ser avisada antes. Quem avisa é a tela; quem manda
   a tela avisar é a rota, com um 409 que só sai quando o corpo não
   traz `confirmarDuplicado: true`.
   ============================================================ */

import { nomeDoTipo } from './catalogo.js';

/* "Logotipo", "logotipo " e "Logótipo" são o mesmo projeto — a
   mesma chave que `projetos.html` usa para achar descrição e
   ilustração (PROJ-CRIA-011). */
export function chaveDoNome(t: string | null | undefined): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* O nome que o projeto MOSTRA: o escolhido, ou o rótulo do tipo para
   os antigos, criados antes da lista (PROJ-CRIA-002). Comparar só a
   coluna `nome` deixaria um "Startup" antigo (nome nulo) passar como
   se não existisse. */
export function nomeExibido(p: { nome: string | null; tipo: string }): string {
  return p.nome ?? nomeDoTipo(p.tipo);
}

export type Existente = { nome: string | null; tipo: string; criadoEm: Date };

export type Duplicidade = {
  /* Quantos projetos ativos da empresa já têm este nome. */
  quantidade: number;
  /* O mais recente deles — é a data que a modal mostra. */
  maisRecente: Date;
};

/* `existentes` deve vir só com os projetos ATIVOS da empresa
   (arquivadoEm nulo): um projeto excluído não existe mais para a
   pessoa, e avisar sobre ele seria falso. */
export function encontrarMesmoNome(existentes: Existente[], nome: string): Duplicidade | null {
  const chave = chaveDoNome(nome);
  if (!chave) return null;

  const iguais = existentes.filter((p) => chaveDoNome(nomeExibido(p)) === chave);
  if (iguais.length === 0) return null;

  const maisRecente = iguais.reduce(
    (m, p) => (p.criadoEm > m ? p.criadoEm : m),
    iguais[0]!.criadoEm,
  );
  return { quantidade: iguais.length, maisRecente };
}
