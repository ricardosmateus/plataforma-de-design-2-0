/* ============================================================
   Registro de consumo da PESQUISA — `consumos_pesquisa`
   ============================================================
   Irmão de `registro.ts`, que faz o mesmo para `consumos_ia`.

   São duas tabelas de propósito, decidido no schema: a pesquisa
   cobra em unidades que a IA não tem (buscas encadeadas,
   requisições ao provedor de lugares) e não tem as que a IA tem
   (cache de leitura e escrita). Uma tabela só obrigaria metade das
   colunas a ficar nula em cada linha, e "nulo porque não se aplica"
   e "nulo porque não veio" deixariam de ser distinguíveis.

   O que esta camada NÃO faz: debitar. Quem mexe no saldo é
   `reserva.ts`; aqui só se registra o que a chamada custou, para a
   pergunta "quanto gastei com pesquisa?" ter resposta com as três
   partes separadas (DIN-005).
   ============================================================ */

import { db } from '../db.js';
import { env } from '../env.js';
import { custoUsdMicros, custoBuscasUsdMicros, type Uso } from './precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from './dinheiro.js';

import type { NivelPesquisa, ResultadoConsulta } from '@prisma/client';

export type RegistroPesquisa = {
  usuarioId: string;
  sessaoId?: string | null;
  consultaId?: string | null;

  /* DIN-014: o MESMO id que a rota passa a `reservar`/`consumir`. É
     por ele que o Histórico de uso sabe se esta linha medida chegou a
     ser cobrada. Opcional na assinatura para não quebrar quem chama
     sem ele, mas toda chamada de rota deve mandá-lo — uma linha sem
     operação é uma linha que o Histórico não pode classificar. */
  operacaoId?: string | null;

  nivel: NivelPesquisa;
  provedor: string;
  resultado: ResultadoConsulta;

  /* O modelo só existe quando quem atendeu foi a busca por IA. O
     provedor de lugares cobra por requisição e não tem modelo — daí
     o opcional, e não uma string vazia que entraria na tabela de
     preços como "modelo desconhecido". */
  modelo?: string | null;

  /* As unidades como o provedor as informou (PES-003). O que ele não
     cobra fica ausente, não zero. */
  tokensEntrada?: number;
  tokensSaida?: number;
  requisicoes?: number;
  buscas?: number;
};

function cotacaoAtual(): number {
  return cotacaoParaMilesimos(env.COTACAO_USD_BRL);
}

/* ------------------------------------------------------------
   O que já dá para precificar, e o que não dá
   ------------------------------------------------------------
   Tokens: a tabela de `precos.ts` cobre, porque a busca usa o mesmo
   `IA_MODELO` da Messages API.

   Buscas encadeadas (`web_search_requests`): a Anthropic cobra por
   requisição, e esse preço NÃO está registrado em lugar nenhum
   deste repositório. Então ele não entra na conta — as buscas ficam
   gravadas na linha como unidade, para que o dia em que o preço
   existir seja uma consulta e não uma perda.

   Requisições ao provedor de lugares: mesma situação.

   Isto deixa o `total_micros` de uma consulta MENOR que o custo
   real. É deliberado e está registrado como pendência em
   `creditos-pagamentos-regras.md`. A alternativa seria estimar — e
   um número inventado na razão tem cara de fato, que é exatamente o
   que `registrarConsumo` de `registro.ts` já recusa fazer pelo mesmo
   motivo.
   ------------------------------------------------------------ */
export function usoDe(r: RegistroPesquisa): Uso {
  return {
    entrada: r.tokensEntrada ?? 0,
    saida: r.tokensSaida ?? 0,
    cacheEscrita: 0,
    cacheLeitura: 0,
  };
}

/** O custo em reais desta chamada, com as três partes separadas.
 *  `null` quando não há como precificar — sem modelo, ou modelo fora
 *  da tabela. */
export function custoDe(r: RegistroPesquisa): {
  usdMicros: number;
  cotacaoMilesimos: number;
  custoMicros: number;
  comissaoMicros: number;
  totalMicros: number;
} | null {
  if (!r.modelo) return null;

  const tokens = custoUsdMicros(r.modelo, usoDe(r));
  if (tokens === null) return null;

  /* As buscas encadeadas, que a Anthropic cobra por unidade além dos
     tokens. Ficaram fora da razão desde que a pesquisa existe: a
     coluna `buscas` guardava a contagem, e a contagem nunca virava
     dinheiro. Na investigação da Loggi (14/09/2026) elas eram a
     MAIOR parte da conta — US$ 0,04 de busca contra US$ 0,036 de
     tokens. Ver `precos.ts`, PRECO_BUSCA_USD_MICROS. */
  const usd = tokens + custoBuscasUsdMicros(r.buscas);

  const cotacao = cotacaoAtual();
  const partes = comissaoSobre(usdParaMicrosBrl(usd, cotacao));

  return {
    usdMicros: usd,
    cotacaoMilesimos: cotacao,
    custoMicros: partes.custoMicros,
    comissaoMicros: partes.comissaoMicros,
    totalMicros: partes.totalMicros,
  };
}

export async function registrarConsumoPesquisa(r: RegistroPesquisa): Promise<void> {
  const custo = custoDe(r);

  await db.consumoPesquisa.create({
    data: {
      usuarioId: r.usuarioId,
      sessaoId: r.sessaoId ?? null,
      consultaId: r.consultaId ?? null,
      operacaoId: r.operacaoId ?? null,

      nivel: r.nivel,
      provedor: r.provedor,
      resultado: r.resultado,

      tokensEntrada: r.tokensEntrada ?? null,
      tokensSaida: r.tokensSaida ?? null,
      requisicoes: r.requisicoes ?? null,
      buscas: r.buscas ?? null,

      custoUsdMicros: custo?.usdMicros ?? null,
      cotacaoMilesimos: custo?.cotacaoMilesimos ?? null,
      custoMicros: custo?.custoMicros ?? null,
      comissaoMicros: custo?.comissaoMicros ?? null,
      totalMicros: custo?.totalMicros ?? null,
    },
  });
}

/** Versão que nunca lança — é esta que a rota chama.
 *
 *  O registro é paralelo à resposta: se ele falhar, quem perguntou
 *  não pode perder o resultado que já foi pago. Mesma decisão de
 *  `registrar()` em `registro.ts`. */
export function registrarPesquisa(r: RegistroPesquisa): void {
  void registrarConsumoPesquisa(r).catch((e) => {
    console.error('[creditos] falha ao registrar consumo de pesquisa (a resposta seguiu normalmente)', e);
  });
}
