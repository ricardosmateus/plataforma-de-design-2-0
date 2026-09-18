/* ============================================================
   Registro de consumo — Fase 0
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md, Fase 0

   Grava quanto cada chamada de IA custou. NÃO COBRA NADA: não há
   saldo neste momento do projeto, e o objetivo desta fase é sair do
   palpite. Depois de uma semana rodando, as perguntas "quanto custa
   uma pergunta?", "5% dão conta?" e "quanto deve ser o mínimo de
   recarga?" passam a ter resposta com número.

   ------------------------------------------------------------
   NUNCA DERRUBA A CHAMADA QUE ESTÁ MEDINDO
   ------------------------------------------------------------
   Todo este arquivo é registro paralelo. Se a gravação falhar, o
   usuário perderia uma resposta que JÁ FOI PAGA ao provedor — o
   pior dos dois mundos. Por isso tudo aqui é `void` com `catch`, e
   a falha vira aviso no log, não erro na rota.

   O contrário (medir e não entregar) seria trocar o produto pela
   contabilidade do produto.
   ============================================================ */

import { db } from '../db.js';
import { env } from '../env.js';
import { custoUsdMicros, type Uso } from './precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from './dinheiro.js';

export type Registro = {
  usuarioId?: string | null;
  empresaId?: string | null;
  projetoId?: string | null;
  ideiaId?: string | null;
  tipo: 'assistente' | 'classificacao' | 'sintese_tema';
  resultado: 'entregue' | 'descartado';
  modelo: string;
  uso: Uso;
  requisicaoId?: string | null;

  /* DIN-014: o MESMO id passado a `reservar`/`consumir`. É por ele que
     o Histórico de uso liga a linha medida ao lançamento cobrado — e
     sabe, quando não há lançamento, que o consumo foi medido sem ser
     cobrado (`CREDITOS_COBRAR=nao`) em vez de não ter acontecido. */
  operacaoId?: string | null;
};

/* A cotação é configuração, não consulta — nesta fase. A Fase 1
   troca isto pela PTAX do Banco Central; até lá, um número no .env
   é honesto desde que fique GRAVADO em cada linha (o que ele fica),
   porque assim o real se recalcula depois sem perder nada. */
function cotacaoAtual(): number {
  return cotacaoParaMilesimos(env.COTACAO_USD_BRL);
}

export async function registrarConsumo(r: Registro): Promise<void> {
  const usd = custoUsdMicros(r.modelo, r.uso);

  /* Modelo fora da tabela de preços: os tokens ficam gravados e o
     custo fica nulo, com a marca. Estimar aqui colocaria um número
     inventado na razão, com cara de fato — e ninguém revisa número
     que já está no banco. Com os tokens guardados, recalcular
     depois é uma consulta. */
  const desconhecido = usd === null;

  const cotacao = desconhecido ? null : cotacaoAtual();
  const custo = desconhecido ? null : comissaoSobre(usdParaMicrosBrl(usd, cotacao as number));

  await db.consumoIa.create({
    data: {
      usuarioId: r.usuarioId ?? null,
      empresaId: r.empresaId ?? null,
      projetoId: r.projetoId ?? null,
      ideiaId: r.ideiaId ?? null,
      tipo: r.tipo,
      resultado: r.resultado,
      modelo: r.modelo,
      operacaoId: r.operacaoId ?? null,
      tokensEntrada: r.uso.entrada,
      tokensSaida: r.uso.saida,
      tokensCacheEscrita: r.uso.cacheEscrita,
      tokensCacheLeitura: r.uso.cacheLeitura,
      custoUsdMicros: usd,
      cotacaoMilesimos: cotacao,
      custoMicros: custo?.custoMicros ?? null,
      comissaoMicros: custo?.comissaoMicros ?? null,
      totalMicros: custo?.totalMicros ?? null,
      precoDesconhecido: desconhecido,
      /* Resposta descartada pela verificação: pagamos, mas não é
         cobrável. Cobrar por resposta que o próprio servidor recusou
         é cobrar por nada (IA-CUSTO-003). Registrar mesmo assim é o
         que revela quanto dinheiro está indo embora nessa recusa —
         custo que, sem esta linha, seria invisível. */
      cobravel: r.resultado === 'entregue',
      requisicaoId: r.requisicaoId ?? null,
    },
  });
}

/** Versão que nunca lança. É esta que as rotas chamam. */
export function registrar(r: Registro): void {
  void registrarConsumo(r).catch((e) => {
    console.error('[creditos] falha ao registrar consumo (a resposta seguiu normalmente)', e);
  });
}
