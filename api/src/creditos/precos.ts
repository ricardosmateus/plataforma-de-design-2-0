/* ============================================================
   Preço por modelo — quanto a chamada custou a nós
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §4.4, Fase 0

   Módulo PURO. Nenhum banco, nenhuma rede.

   ------------------------------------------------------------
   A REGRA MAIS IMPORTANTE DESTE ARQUIVO
   ------------------------------------------------------------
   Modelo sem preço na tabela devolve `null` — NUNCA um palpite.

   Um custo estimado errado é pior que custo nenhum: ele entra na
   razão com cara de fato, e ninguém revisa. `null` obriga quem
   chamou a gravar os tokens e marcar `precoDesconhecido`, o que
   deixa o buraco visível e corrigível depois (os tokens ficaram
   guardados; recalcular é uma consulta).

   ------------------------------------------------------------
   UNIDADES
   ------------------------------------------------------------
   Preço: MICRO-DÓLAR por milhão de tokens. US$ 1,00/MTok = 1.000.000.
   Custo: MICRO-DÓLAR. A conversão para real acontece em `dinheiro.ts`,
   com a cotação gravada junto — nunca aqui.

   Por que micro-dólar e não uma unidade menor: `tokens × preço`
   precisa caber no inteiro seguro do JavaScript. Com micro-dólar, a
   maior conta possível (uma janela cheia de contexto no modelo mais
   caro) fica três ordens de grandeza abaixo do limite.

   ------------------------------------------------------------
   VIGÊNCIA
   ------------------------------------------------------------
   Esta tabela é a de HOJE. Quando o provedor mudar o preço, o
   consumo antigo tem que continuar sendo lido pelo preço da época —
   reescrever o preço do passado reescreveria o extrato de quem já
   pagou. Por isso `custo_usd_micros` fica GRAVADO em cada linha de
   consumo: a tabela só é consultada uma vez, no instante do gasto.

   Preços conferidos em 31/08/2026 na documentação do provedor.
   ============================================================ */

export type Uso = {
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
};

export type Preco = {
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
};

/* Chaveado por PREFIXO da família, não pelo id completo: o id real
   carrega a data do snapshot (`claude-haiku-4-5-20251001`), que muda
   sem que o preço mude. Casar por prefixo evita que trocar de
   snapshot derrube o preço para `null` sem ninguém perceber. */
export const TABELA: Record<string, Preco> = {
  'claude-haiku-4-5':  { entrada:  1_000_000, saida:  5_000_000, cacheEscrita:  1_250_000, cacheLeitura: 100_000 },
  'claude-sonnet-4-5': { entrada:  3_000_000, saida: 15_000_000, cacheEscrita:  3_750_000, cacheLeitura: 300_000 },
  'claude-sonnet-4-6': { entrada:  3_000_000, saida: 15_000_000, cacheEscrita:  3_750_000, cacheLeitura: 300_000 },
  'claude-sonnet-5':   { entrada:  2_000_000, saida: 10_000_000, cacheEscrita:  2_500_000, cacheLeitura: 200_000 },
  'claude-opus-4-5':   { entrada:  5_000_000, saida: 25_000_000, cacheEscrita:  6_250_000, cacheLeitura: 500_000 },
  'claude-opus-5':     { entrada:  5_000_000, saida: 25_000_000, cacheEscrita:  6_250_000, cacheLeitura: 500_000 },
};

export function precoDe(modelo: string): Preco | null {
  /* Do prefixo mais longo para o mais curto: `claude-sonnet-4-5` tem
     que ganhar de um eventual `claude-sonnet`, senão o mais genérico
     captura o específico e cobra errado. */
  const chaves = Object.keys(TABELA).sort((a, b) => b.length - a.length);
  for (const chave of chaves) {
    if (modelo.startsWith(chave)) return TABELA[chave] as Preco;
  }
  return null;
}

/** Custo da chamada em MICRO-DÓLAR, ou `null` se o modelo é desconhecido. */
export function custoUsdMicros(modelo: string, uso: Uso): number | null {
  const p = precoDe(modelo);
  if (!p) return null;

  const parcela = (tokens: number, precoPorMilhao: number) =>
    Math.round((Math.max(0, tokens) * precoPorMilhao) / 1_000_000);

  return (
    parcela(uso.entrada, p.entrada) +
    parcela(uso.saida, p.saida) +
    parcela(uso.cacheEscrita, p.cacheEscrita) +
    parcela(uso.cacheLeitura, p.cacheLeitura)
  );
}

/* ------------------------------------------------------------
   Leitura do `usage` da resposta do provedor
   ------------------------------------------------------------
   Tolerante de propósito: campo que não veio vira zero, e não
   quebra a chamada. O consumo é registro paralelo — se a leitura
   falhar, o usuário não pode perder a resposta que já foi paga.

   `input_tokens` NÃO inclui os tokens de cache; por isso as quatro
   parcelas se somam sem risco de contar duas vezes.
   ------------------------------------------------------------ */
export function lerUso(bruto: unknown): Uso {
  const u = (bruto ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    entrada: n(u.input_tokens),
    saida: n(u.output_tokens),
    cacheEscrita: n(u.cache_creation_input_tokens),
    cacheLeitura: n(u.cache_read_input_tokens),
  };
}

/* ------------------------------------------------------------
   Teto de custo — Fase 2 (IA-CUSTO-002)
   ------------------------------------------------------------
   Antes de chamar o provedor não existe `usage` nenhum — ele só
   vem DEPOIS da resposta. Mas o saldo precisa ser conferido ANTES
   (a regra é clara: nunca se gasta chamada que não será cobrável).
   A saída disto não é "o custo": é um TETO, superestimado de
   propósito, usado só para reservar. O custo de verdade continua
   vindo exclusivamente do `usage` real, depois da resposta.
   ------------------------------------------------------------ */

/** Estimativa GROSSEIRA de tokens a partir de caracteres. Superestima
 * de propósito — 1 token a cada 3 caracteres é mais conservador que
 * a média real (~4 caracteres/token em português): errar para cima
 * aqui só reserva um pouco a mais (o troco volta depois, em
 * `liberar`); errar para baixo deixaria passar uma chamada que a
 * pessoa não tinha saldo para cobrir. */
export function tokensEstimados(texto: string): number {
  return Math.ceil(texto.length / 3);
}

/** Teto de custo da chamada, em MICRO-DÓLAR, calculado ANTES dela
 * acontecer: tokens de entrada estimados por caractere + o máximo de
 * saída que o servidor vai permitir (`max_tokens`, que o provedor
 * sempre respeita). `null` só quando o modelo é desconhecido — a
 * mesma regra de `custoUsdMicros`, porque reservar um teto chutado
 * para um modelo sem preço seria o mesmo palpite que este arquivo
 * inteiro existe para evitar. */
export function tetoUsdMicros(modelo: string, textoEntrada: string, maxTokensSaida: number): number | null {
  return custoUsdMicros(modelo, {
    entrada: tokensEstimados(textoEntrada),
    saida: Math.max(0, maxTokensSaida),
    cacheEscrita: 0,
    cacheLeitura: 0,
  });
}

/* ============================================================
   O preço da busca encadeada — 14/09/2026
   ============================================================
   A Anthropic cobra por BUSCA, além dos tokens: US$ 10 por mil
   buscas, ou US$ 0,01 cada. Isso ficou fora da razão desde que a
   pesquisa existe: `consumos_pesquisa.buscas` guardava a contagem,
   e a contagem nunca virava dinheiro.

   Não era desprezível — era a MAIOR parte. Na investigação sobre a
   Loggi (14/09/2026): 4 buscas = US$ 0,04, contra US$ 0,036 de
   tokens. A plataforma cobrou metade do que pagou, e a comissão de
   30% incidia sobre essa metade.

   Preço de tabela, não estimativa: é o mesmo tipo de número que
   `TABELA` guarda para os modelos, e por isso pode entrar na razão
   sem ferir "estimar seria pôr número inventado".
   ============================================================ */
export const PRECO_BUSCA_USD_MICROS = 10_000; // US$ 0,01

export function custoBuscasUsdMicros(buscas: number | undefined | null): number {
  if (!Number.isFinite(buscas ?? NaN) || (buscas as number) <= 0) return 0;
  return Math.round(buscas as number) * PRECO_BUSCA_USD_MICROS;
}

/* ------------------------------------------------------------
   Quanto uma busca encadeada consome de ENTRADA, no pior caso
   ------------------------------------------------------------
   O teto acima serve para uma chamada simples: o que entra é o
   texto do prompt. Numa busca com ferramenta, não: o resultado da
   web volta para o contexto, e o contexto INTEIRO é reenviado a
   cada rodada. A entrada cresce quadraticamente com o número de
   buscas, não linearmente.

   Medido em 14/09/2026, na investigação da Loggi: 4 buscas,
   **31.196 tokens de entrada**. A estimativa em uso na época
   contava só o prompt — uns 400. Errava por quase 80 vezes, o que
   fazia a reserva não reservar nada e o teto de R$ 3 não segurar
   coisa alguma. Pior: era esse número que aparecia para a pessoa
   como "custo estimado", e PES-007 existe justamente para esse
   número ser verdade.

   O modelo abaixo é (k+1) rodadas reenviando o prompt, mais o
   acúmulo dos resultados:

     entrada ≈ (k+1)·P + R·k·(k+1)/2

   Com P ≈ 1.000 e k = 4, dá ~30 mil — que é o que se mediu. `R` é
   o único número calibrado a partir de UMA observação; se a conta
   começar a divergir do que a razão registra, é ele que se ajusta
   primeiro. */
export const TOKENS_POR_RODADA_DE_BUSCA = 2_500;

/* Entrada acumulada de uma chamada com ferramenta.

   `rodadas` é quantas vezes a ferramenta pode ser usada — busca e
   leitura de página contam igual, porque as duas fazem o modelo
   responder de novo com o contexto inteiro atrás.

   `tokensPorRodada` é o que cada uso acrescenta. Quando os dois
   tipos convivem, passa-se o MAIOR: a reserva deve errar para cima
   (o troco volta em `liberar`), e errar para baixo deixa passar
   chamada que a pessoa não tinha saldo para cobrir. */
export function entradaEstimadaComFerramentas(
  textoEntrada: string,
  rodadas: number,
  tokensPorRodada: number,
): number {
  const p = tokensEstimados(textoEntrada);
  const k = Math.max(0, Math.floor(rodadas));
  return (k + 1) * p + Math.max(0, tokensPorRodada) * ((k * (k + 1)) / 2);
}

export function entradaEstimadaComBusca(textoEntrada: string, maxBuscas: number): number {
  return entradaEstimadaComFerramentas(textoEntrada, maxBuscas, TOKENS_POR_RODADA_DE_BUSCA);
}

/** Teto de uma consulta que USA busca: tokens (com o acúmulo das
 *  rodadas) mais o preço das buscas em si. É este que a reserva e a
 *  estimativa mostrada à pessoa devem usar — nunca `tetoUsdMicros`,
 *  que só conhece o prompt. */
export function tetoBuscaUsdMicros(
  modelo: string,
  textoEntrada: string,
  maxTokensSaida: number,
  maxBuscas: number,
  /* Fase 1b: páginas abertas com `web_fetch`. A ferramenta não cobra
     por uso, mas cada página entra no contexto e volta a cada rodada
     — e uma página é bem mais pesada que um punhado de trechos. */
  maxLeituras = 0,
  tokensPorPagina = 0,
): number | null {
  const rodadas = Math.max(0, maxBuscas) + Math.max(0, maxLeituras);
  const porRodada = Math.max(TOKENS_POR_RODADA_DE_BUSCA, maxLeituras > 0 ? tokensPorPagina : 0);

  const tokens = custoUsdMicros(modelo, {
    entrada: entradaEstimadaComFerramentas(textoEntrada, rodadas, porRodada),
    saida: Math.max(0, maxTokensSaida),
    cacheEscrita: 0,
    cacheLeitura: 0,
  });
  if (tokens === null) return null;
  /* Só a busca tem preço por unidade; `web_fetch` é de graça além
     dos tokens que ela mete no contexto. */
  return tokens + custoBuscasUsdMicros(maxBuscas);
}
