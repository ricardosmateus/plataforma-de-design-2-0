/* ============================================================
   Dinheiro — a unidade e as contas
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §3 (DIN-001)

   Módulo PURO: nenhum import, nenhum banco, nenhuma rede. Dá para
   testar inteiro em milissegundos, que é o mínimo que se exige de
   código que decide quanto alguém paga.

   ------------------------------------------------------------
   POR QUE MICRO DE REAL, E NÃO CENTAVO
   ------------------------------------------------------------
   O planejamento dizia "tudo em centavos". A regra de fundo estava
   certa — inteiro, nunca ponto flutuante — mas a unidade estava
   errada, e isso só apareceu ao fazer a primeira conta de verdade:

     Classificar uma idéia com Haiku custa cerca de 1.500 tokens de
     entrada e 50 de saída. Isso dá ~US$ 0,00175 — algo como
     R$ 0,0095. MENOS DE UM CENTAVO.

   Em centavos, esse consumo teria dois destinos, ambos ruins:
   arredondado para baixo vira zero (cem classificações custariam
   nada), arredondado para cima vira R$ 0,01 (cobrar mil por cento
   sobre o custo real). Nenhum dos dois é aceitável.

   Então a unidade da razão é o MICRO DE REAL: um milionésimo de
   real. Continua inteiro — a regra que importa —, mas com casas
   suficientes para o consumo real. O centavo volta a aparecer só
   onde ele é obrigatório: na tela e no Pix, que não sabem receber
   fração de centavo.

   Espaço: o inteiro seguro do JavaScript comporta ~9 bilhões de
   reais nesta unidade. Não é limite que este produto alcance.
   ============================================================ */

export const MICROS_POR_REAL = 1_000_000;
export const MICROS_POR_CENTAVO = 10_000;

/* A comissão em PONTOS-BASE (centésimos de por cento): 30% = 3000.
   Inteiro de propósito — escrever `0.30` aqui reintroduziria o
   ponto flutuante justamente na conta que gera a receita.

   Esta é a alíquota VIGENTE, não a de sempre. Subiu de 5% para 30%
   em 14/09/2026 (DIN-008): os 5% cobriam IOF, câmbio, imposto e
   tarifa de Pix com folga nenhuma, e não cobriam infraestrutura —
   servidor, banco e tráfego, que existem mesmo quando ninguém
   chama o provedor.

   Lançamento antigo NÃO é recalculado por esta constante. A razão
   é append-only (DIN-002) e cada linha guarda o que foi cobrado na
   época; conferir uma linha de agosto contra os 30% de hoje dá
   diferença legítima, não erro. A vigência está em
   `creditos-pagamentos-regras.md`, DIN-008. */
export const COMISSAO_PONTOS_BASE = 3000;

/* ------------------------------------------------------------
   Conversões
   ------------------------------------------------------------ */

export function reaisParaMicros(reais: number): number {
  return Math.round(reais * MICROS_POR_REAL);
}

/* Para a tela e para o Pix, que só entendem centavo.
   Arredonda para CIMA: quem cobra do usuário arredonda a favor
   dele em outros lugares (ver `comissaoSobre`), mas um valor a
   pagar nunca pode ser exibido menor do que é — senão o total
   mostrado não fecha com o que sai da conta. */
export function microsParaCentavos(micros: number): number {
  return Math.ceil(micros / MICROS_POR_CENTAVO);
}

/* Exibição. Não usa Intl para não depender do locale do servidor:
   o mesmo valor precisa sair igual em qualquer máquina. */
export function formatarReais(micros: number): string {
  const negativo = micros < 0;
  const centavos = Math.round(Math.abs(micros) / MICROS_POR_CENTAVO);
  const inteiros = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const milhar = String(inteiros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${milhar},${String(resto).padStart(2, '0')}`;
}

/* ------------------------------------------------------------
   Câmbio
   ------------------------------------------------------------
   A cotação também é inteira: milésimos de real por dólar.
   R$ 5,42 → 5420.

   `custoUsdMicros` é micro-dólar (milionésimo de dólar), que é a
   unidade em que o custo do provedor é calculado em `precos.ts`.
   ------------------------------------------------------------ */

export function usdParaMicrosBrl(custoUsdMicros: number, cotacaoMilesimos: number): number {
  return Math.round((custoUsdMicros * cotacaoMilesimos) / 1_000);
}

export function cotacaoParaMilesimos(cotacao: number): number {
  return Math.round(cotacao * 1_000);
}

/* ------------------------------------------------------------
   A comissão — DIN-005
   ------------------------------------------------------------
   Devolve as três partes SEPARADAS, nunca só o total. Guardar
   apenas a soma impede responder depois "quanto eu paguei ao
   provedor?" e "quanto eu lucrei?", e impede conferir se os 5%
   foram aplicados certo. Um número que já veio somado não se
   desmonta.

   Arredonda para baixo (`floor`): na dúvida de meio micro, a
   sobra fica com o usuário. Meio micro é R$ 0,0000005 — a escolha
   não muda receita nenhuma, mas define o comportamento em vez de
   deixá-lo ao acaso do arredondamento.
   ------------------------------------------------------------ */

export type Cobranca = {
  /** O que custou a nós, em micros de real. */
  custoMicros: number;
  /** Nossa margem, em micros de real. */
  comissaoMicros: number;
  /** custo + comissão — é isto que sai do saldo do usuário. */
  totalMicros: number;
};

export function comissaoSobre(custoMicros: number): Cobranca {
  if (!Number.isFinite(custoMicros) || custoMicros < 0) {
    throw new RangeError('custoMicros precisa ser um número não negativo');
  }
  const custo = Math.round(custoMicros);
  const comissaoMicros = Math.floor((custo * COMISSAO_PONTOS_BASE) / 10_000);
  return { custoMicros: custo, comissaoMicros, totalMicros: custo + comissaoMicros };
}
