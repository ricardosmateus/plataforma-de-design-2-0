/* ============================================================
   O que cada consulta muda na sessão
   ============================================================
   Regras: planejamento-pesquisa-concorrentes.md §4
           (PES-004, PES-007, PES-008)

   Sem `import`, como `ideias/transicao.ts`, `pesquisa/roteador.ts` e
   `pesquisa/entidades.ts`. E pelo mesmo desenho: a rota faz a
   escrita; o que ela pergunta aqui é apenas "o que esta consulta
   significa para a sessão".

   São três decisões, e as três erram em silêncio se ficarem soltas
   dentro da rota:

   1. DE QUEM a conversa passa a tratar — o foco, que é o que resolve
      "ele" na pergunta seguinte.
   2. Se a próxima consulta CABE no teto de gasto.
   3. Se o que voltou foi entrega, vazio ou falha — que PES-008 exige
      que sejam três coisas distintas.

   ------------------------------------------------------------
   POR QUE O FOCO É UMA DECISÃO, E NÃO "a última entidade citada"
   ------------------------------------------------------------
   A regra ingênua — guardar sempre a última empresa mencionada —
   quebra exatamente no caso mais comum do fluxo real. "Quem são meus
   concorrentes?" descobre cinco empresas de uma vez: nenhuma delas é
   o assunto, e eleger uma seria arbitrário. Se a última da lista
   virar foco, o "ele" da pergunta seguinte resolve para uma empresa
   que o usuário nem leu ainda — e a resposta volta, certa, sobre
   quem ele não perguntou.

   Por isso ambiguidade LIMPA o foco em vez de chutar. Foco vazio faz
   o roteador devolver o pronome como referência não resolvida, que é
   uma pergunta a fazer ao usuário. Foco errado não devolve nada: só
   uma resposta convincente sobre outra empresa.
   ============================================================ */

export type Entidade = {
  apelido: string;
  nome: string;
};

/* O que a consulta produziu, do ponto de vista de quem decide o
   foco. Declarado aqui em vez de importado de `roteador.ts` e
   `entidades.ts`: este módulo depende da FORMA que usa, não dos dois
   arquivos inteiros. */
export type EfeitoDaConsulta = {
  /* Nomes que a pergunta citou, já resolvidos — `citadas` do
     roteador. */
  citadas: string[];

  /* Entidades que esta consulta trouxe pela primeira vez — `novas`
     de `planejarEntidades`. */
  descobertas: Entidade[];
};

/**
 * De quem a conversa passa a tratar depois desta consulta.
 *
 * `null` significa "ninguém em particular" — e é um resultado
 * legítimo, não uma falha. A pergunta seguinte que usar pronome vai
 * voltar com a referência não resolvida, e aí se pergunta ao usuário
 * de quem ele está falando.
 *
 * `conhecidas` é o que a sessão já tinha; quem busca no banco é quem
 * chama, mesmo princípio de `encontrarDuplicata` e
 * `planejarEntidades`.
 */
export function decidirFoco(
  atual: Entidade | null,
  efeito: EfeitoDaConsulta,
  conhecidas: Entidade[] = [],
): Entidade | null {
  const universo = [...conhecidas, ...efeito.descobertas];

  /* A pergunta falou de alguém. Uma empresa só: é dela que se está
     tratando agora, e isso vale mesmo que a consulta tenha falhado —
     o assunto mudou quando o usuário perguntou, não quando o
     provedor respondeu. */
  if (efeito.citadas.length === 1) {
    const nome = efeito.citadas[0]!;
    return universo.find((e) => e.nome === nome) ?? atual;
  }

  /* Comparação entre duas ou mais: não há um assunto. Manter o foco
     anterior seria pior do que limpar — o usuário acabou de mudar de
     assunto, e o pronome seguinte apontaria para trás. */
  if (efeito.citadas.length > 1) return null;

  /* A pergunta não citou ninguém. Se a consulta descobriu UMA
     empresa, é dela que a conversa passa a tratar. */
  if (efeito.descobertas.length === 1) return efeito.descobertas[0]!;

  /* Descobriu várias — é o "quem são meus concorrentes". Nenhuma é o
     assunto ainda; quem escolhe é a próxima pergunta. */
  if (efeito.descobertas.length > 1) return null;

  /* Não citou e não descobriu: nada mudou de assunto. Vale também
     para consulta que falhou — falha não troca o foco. */
  return atual;
}

/**
 * A próxima consulta cabe no teto da sessão? — PES-007.
 *
 * `teto` nulo significa sessão sem teto próprio: vale só o saldo do
 * usuário, que é conferido em `creditos/reserva.ts` e é a trava de
 * verdade. Este teto é o limite que o usuário combinou para ESTA
 * investigação, para que um aprofundamento longo não consuma o saldo
 * inteiro sem ele perceber.
 *
 * Compara com o gasto JÁ REALIZADO mais a estimativa da próxima —
 * não com o gasto sozinho. Deixar a consulta começar para descobrir
 * que estourou é gastar para descobrir que não podia gastar.
 */
export function cabeNoTeto(
  gastoMicros: number,
  estimativaMicros: number,
  tetoMicros: number | null,
): boolean {
  if (tetoMicros === null) return true;
  return gastoMicros + estimativaMicros <= tetoMicros;
}

export type ResultadoConsulta = 'entregue' | 'vazio' | 'falhou';

export type SaidaDoProvedor = {
  /* Quantos achados vieram. Zero é resposta válida. */
  itens: number;

  /* Presente quando a chamada não completou: rede, cota, resposta
     ilegível. */
  erro?: string | null;
};

/**
 * Entrega, vazio ou falha — PES-008, que é DIN-006 outra vez.
 *
 * Mora aqui, numa função só, e não espalhado em ternários pela rota,
 * porque a forma de errar isto é sempre a mesma: alguém trata "sem
 * resultado" e "não consegui buscar" no mesmo ramo, e a tela passa a
 * dizer que o concorrente não existe quando o que houve foi a busca
 * cair.
 *
 * A ordem importa: erro vence contagem. Um provedor que falha no meio
 * pode devolver zero itens junto com o erro, e ler isso como "vazio"
 * é justamente o disfarce que a regra proíbe.
 */
export function classificarResultado(saida: SaidaDoProvedor): ResultadoConsulta {
  if (saida.erro) return 'falhou';
  return saida.itens > 0 ? 'entregue' : 'vazio';
}
