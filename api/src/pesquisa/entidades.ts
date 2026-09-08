/* ============================================================
   Quem já é conhecido, e como ele passa a se chamar
   ============================================================
   Regras: planejamento-pesquisa-concorrentes.md §4 (PES-004)

   Sem `import`, como `ideias/transicao.ts` e `pesquisa/roteador.ts`.
   A decisão fica aqui; a escrita fica em `sessao.ts`.

   ------------------------------------------------------------
   A REGRA CRÍTICA: O APELIDO NUNCA MUDA DE DONO
   ------------------------------------------------------------
   "Concorrente 01" é como o usuário chama a empresa nas perguntas
   seguintes. Se uma renumeração fizer esse rótulo apontar para outra
   empresa, toda referência anterior passa a significar outra coisa —
   e a resposta VOLTA, sobre a empresa errada, sem erro nenhum na
   tela. É a mesma família de falha do pronome sem antecedente que o
   roteador trata: o perigo não é quebrar, é acertar a pergunta
   errada.

   Por isso: numeração só cresce. Apelido atribuído não se reaproveita
   nem se reordena, nem quando a entidade some da lista.

   ------------------------------------------------------------
   POR QUE NÃO REUSAR `ideias/duplicidade.ts`
   ------------------------------------------------------------
   Aquele arquivo compara título e descrição de idéias por sobreposição
   de vocabulário (Jaccard), e resolve bem o problema dele. Razão
   social tem dois vícios que ele não trata:

   1. Sufixo jurídico não distingue nada. "Grão Nobre" e "Grão Nobre
      Ltda" são a mesma empresa, e o sufixo derruba a semelhança.
   2. Nome comercial aparece encurtado e alongado — "Cafeteria Grão
      Nobre" e "Grão Nobre" — e sobreposição simétrica pune o
      encurtamento, que é justamente a forma mais comum de citar.

   O mesmo espírito do resto do projeto: reproduzir o que serve em vez
   de criar dependência entre dois módulos que não têm por que se
   conhecer.
   ============================================================ */

export type EntidadeConhecida = {
  apelido: string;
  nome: string;
};

export type PlanoDeEntidades = {
  /* Descobertas agora, já com apelido atribuído. */
  novas: EntidadeConhecida[];

  /* Vieram de novo, com o nome que chegou e o apelido que já tinham.
     Não geram linha nova — mas quem chama pode querer registrar que
     a empresa apareceu outra vez nesta consulta. */
  repetidas: { nomeChegado: string; apelido: string; nome: string }[];
};

/* Formas jurídicas: dizem o que a empresa é perante a lei, nunca
   qual empresa ela é. Saem antes de qualquer comparação. */
const SUFIXO_JURIDICO =
  /\b(ltda|limitada|s\/?a|sa|eireli|epp|mei?|cia|companhia)\b/g;

function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(SUFIXO_JURIDICO, ' ')
    .trim();
}

/* Palavras de 3+ letras, como em `duplicidade.ts` e pelo mesmo
   motivo: "de", "da", "do" aparecem em razão social tanto quanto em
   texto corrido ("Casa do Café") e não distinguem ninguém. */
function palavras(nome: string): string[] {
  return normalizar(nome)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3);
}

/**
 * Duas grafias da mesma empresa?
 *
 * O teste é CONTENÇÃO, não semelhança: um nome é o outro quando
 * todas as palavras do mais curto estão no mais longo. "Cafeteria
 * Grão Nobre" contém "Grão Nobre"; "Padaria São João" não contém
 * "Padaria São Pedro".
 *
 * Deliberadamente conservador, e a assimetria do erro é o motivo:
 * separar por engano a mesma empresa gera duas linhas, que alguém vê
 * e corrige. Juntar por engano duas empresas diferentes reescreve o
 * significado de um apelido que o usuário já usou — e isso não
 * aparece em lugar nenhum.
 */
export function mesmaEmpresa(a: string, b: string): boolean {
  const pa = palavras(a);
  const pb = palavras(b);

  /* Nome que some inteiro na normalização (sigla curta, "3M", "Oi")
     só casa consigo mesmo, ao pé da letra. Melhor não casar do que
     casar errado. */
  if (pa.length === 0 || pb.length === 0) return normalizar(a) === normalizar(b);

  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];

  /* Uma palavra só não engole ninguém: "Café" não pode virar "Café
     Central". Exceção para o caso em que os dois lados são a mesma
     palavra única. */
  if (curto.length === 1 && longo.length > 1) return false;

  const conjuntoLongo = new Set(longo);
  return curto.every((p) => conjuntoLongo.has(p));
}

/* Lê o número de um apelido no formato que este módulo emite. Volta
   0 para qualquer coisa fora do formato — apelido escrito à mão no
   banco não deve derrubar a numeração. */
function numeroDo(apelido: string): number {
  const m = /^concorrente\s+(\d+)$/i.exec(apelido.trim());
  return m ? Number(m[1]) : 0;
}

function apelidoPara(numero: number): string {
  /* Duas casas porque é assim que o usuário escreve — "concorrente
     01". O roteador aceita as duas formas; a emissão fica numa só. */
  return `concorrente ${String(numero).padStart(2, '0')}`;
}

/**
 * Decide o que fazer com os nomes que uma consulta trouxe.
 *
 * `conhecidas` é o que a sessão já tem. Quem busca no banco é quem
 * chama — mesmo princípio de `encontrarDuplicata`.
 *
 * A ordem de `novas` segue a ordem de chegada: o provedor devolve os
 * concorrentes por relevância, e é essa ordem que o usuário vê na
 * tela quando diz "concorrente 01".
 */
export function planejarEntidades(
  chegadas: string[],
  conhecidas: EntidadeConhecida[] = [],
): PlanoDeEntidades {
  const novas: PlanoDeEntidades['novas'] = [];
  const repetidas: PlanoDeEntidades['repetidas'] = [];

  /* Continua de onde parou, e nunca reaproveita número — mesmo que a
     entidade de número 2 tenha sido removida, o próximo é 4. */
  let proximo = conhecidas.reduce((maior, e) => Math.max(maior, numeroDo(e.apelido)), 0);

  for (const chegada of chegadas) {
    const nome = chegada.trim();
    if (!nome) continue;

    /* Procura primeiro no que já existia, depois no que acabou de
       entrar neste mesmo lote: o provedor repete a mesma empresa em
       grafias diferentes na mesma resposta com frequência. */
    const achada =
      conhecidas.find((e) => mesmaEmpresa(e.nome, nome)) ??
      novas.find((e) => mesmaEmpresa(e.nome, nome));

    if (achada) {
      repetidas.push({ nomeChegado: nome, apelido: achada.apelido, nome: achada.nome });
      continue;
    }

    proximo += 1;
    novas.push({ apelido: apelidoPara(proximo), nome });
  }

  return { novas, repetidas };
}
