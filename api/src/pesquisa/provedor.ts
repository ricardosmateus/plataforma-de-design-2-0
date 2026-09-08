/* ============================================================
   Os provedores de pesquisa — atrás de interface
   ============================================================
   Regras: planejamento-pesquisa-concorrentes.md §4 (PES-003, PES-009)

   Mesma forma de `Psp` em `pagamentos/psp.ts` e de `Provedor` em
   `ia/provedor.ts` — o padrão desta casa para peça que vai mudar por
   decisão de negócio, e não de engenharia. Aqui a decisão é qual
   provedor de busca usar, registrada como pendência aberta no §8 do
   planejamento: candidato é o Perplexity Sonar, ainda não testado
   contra as perguntas reais.

   ------------------------------------------------------------
   POR QUE DUAS INTERFACES, E NÃO UMA
   ------------------------------------------------------------
   Busca e lugares não são dois provedores da mesma coisa: são duas
   capacidades diferentes. Busca devolve texto com fontes; lugares
   devolve registro estruturado com endereço e coordenada. Espremer
   as duas num contrato só produziria um tipo cheio de campo
   opcional que nunca se sabe quando vem — e a rota voltaria a
   perguntar "qual é mesmo o formato disto?", que é justamente o que
   a interface existe para evitar.

   O nível 'conhecimento' não aparece aqui porque não sai chamada
   nenhuma: ele é respondido por `ia/provedor.ts`, que já existe.
   O nível 'navegacao' também não, e de propósito — está fora da v1
   por PES-005.

   ------------------------------------------------------------
   O CUSTO VOLTA JUNTO COM A RESPOSTA — PES-003
   ------------------------------------------------------------
   Toda resposta carrega `custo`, com as unidades que o provedor de
   fato cobrou. É a mesma decisão de `RespostaBruta.uso` em
   `ia/provedor.ts` e a lição da taxa do Mercado Pago na Fase 4: o
   custo vem da resposta, transação por transação, nunca de uma
   tabela de preço chutada aqui dentro.

   Opcional porque um provedor pode não informar. Ausência vira
   consumo sem custo apurado — nunca um palpite gravado na razão com
   cara de fato, que é a regra que `consumos_ia` já registra.
   ============================================================ */

/* Espelha as colunas de unidade de `consumos_pesquisa`. Cada
   provedor preenche as suas: busca cobra por token e por
   requisição, lugares cobra por chamada. O que não se aplica fica
   ausente, nunca zero — zero diria "cobrou zero". */
export type CustoDaChamada = {
  tokensEntrada?: number;
  tokensSaida?: number;
  requisicoes?: number;
  buscas?: number;

  /* Quando o provedor informa o custo direto, na moeda dele. É o
     dado mais confiável que existe sobre a chamada. */
  custoUsdMicros?: number;
};

/* PES-006: toda afirmação carrega fonte. `trecho` vai junto da URL
   porque página sai do ar, muda e some atrás de login — e aí a
   afirmação fica sem lastro justamente quando alguém foi conferir. */
export type Fonte = {
  url: string;
  titulo?: string;
  trecho?: string;
  /* Onde, em caracteres, esta fonte e citada dentro de `resposta`.
     A citacao chega presa a um bloco de texto; depois que os blocos
     viram uma string so, essa ligacao nao existe mais em lugar nenhum
     — e sem ela o board nao tem como saber que assunto cada fonte
     sustenta, e joga todas no primeiro quadro.

     E lista porque a mesma pagina costuma sustentar mais de um
     trecho: uma tabela de precos citada em "Precos" e de novo em
     "Comparativo" pertence aos dois. Vazia quando a citacao veio de
     um bloco anterior a resposta (a narracao da busca). */
  inicios?: number[];
};

/* Erro volta no corpo, não como exceção: quem chama precisa
   distinguir "não achei nada" de "não consegui buscar" (PES-008), e
   `sessao.classificarResultado` faz exatamente essa leitura. Exceção
   obrigaria try/catch em toda rota para reconstruir a mesma
   informação. */
export type RespostaBusca = {
  resposta: string;
  fontes: Fonte[];
  custo?: CustoDaChamada;
  erro?: string | null;
};

/* ------------------------------------------------------------
   Quem está perguntando
   ------------------------------------------------------------
   A busca recebia só a pergunta, então tratava toda consulta como se
   viesse de um desconhecido: perguntada sobre "meios de transporte
   para a iHouseLog", devolvia um pedido de esclarecimento sobre o
   setor da empresa — que estava cadastrado desde o começo, a uma
   consulta de distância.

   Perguntar de volta o que o sistema já sabe é o defeito que o
   Orquestrador de Atividades existe para impedir; a busca ficava
   fora dessa garantia porque a interface não tinha por onde receber
   contexto. Opcional de propósito: provedor que não use o campo
   continua compilando. */
export type ContextoDeNegocio = {
  empresa?: { nome: string; descricao?: string | null };
};

export interface ProvedorBusca {
  /** A pergunta já chega RESOLVIDA — com apelidos e pronomes
   * trocados pelos nomes reais por `roteador.ts`. O provedor não
   * conhece a sessão nem tem como resolver "ele". */
  buscar(pergunta: string, contexto?: ContextoDeNegocio): Promise<RespostaBusca>;
}

/* ------------------------------------------------------------ */

export type Lugar = {
  nome: string;
  endereco?: string;
  latitude?: number;
  longitude?: number;
  avaliacao?: number;
  totalAvaliacoes?: number;
  /* O id do lugar no provedor, para consultar detalhe depois sem
     buscar de novo. */
  idExterno?: string;
};

export type RespostaLugares = {
  lugares: Lugar[];
  custo?: CustoDaChamada;
  erro?: string | null;
};

export interface ProvedorLugares {
  /** "Quantas unidades do concorrente 02 tem aqui no meu bairro" —
   * raio em metros, a partir de uma coordenada. É consulta
   * geográfica, não pergunta de fato: por isso nome e coordenada
   * entram separados, e não como texto corrido. */
  buscarPerto(input: {
    termo: string;
    latitude: number;
    longitude: number;
    raioMetros: number;
  }): Promise<RespostaLugares>;
}

/* ------------------------------------------------------------
   'none' — o padrão
   ------------------------------------------------------------
   Recusa com mensagem clara em vez de derrubar. Mesmo
   comportamento do `none` de `ia/provedor.ts`, e pelo mesmo motivo:
   a plataforma inteira segue funcionando sem provedor de pesquisa
   configurado, e quem tentar usar recebe um texto que explica o que
   falta — não um 500.

   É também o que mantém honesto o estado atual do projeto: o
   provedor de busca ainda NÃO foi escolhido (§8). Um driver falso
   que devolvesse resultado inventado seria encenação — a mesma
   coisa que a Fase 4 teve que remover de oito páginas.
   ------------------------------------------------------------ */

const RECUSA =
  'A pesquisa externa ainda não está configurada nesta instalação. ' +
  'Defina PESQUISA_DRIVER no .env para habilitar.';

const RECUSA_LUGARES =
  'A busca por unidades e endereços ainda não está configurada nesta instalação. ' +
  'Defina LUGARES_DRIVER no .env para habilitar.';

class BuscaIndisponivel implements ProvedorBusca {
  async buscar(): Promise<RespostaBusca> {
    return { resposta: '', fontes: [], erro: RECUSA };
  }
}

class LugaresIndisponivel implements ProvedorLugares {
  async buscarPerto(): Promise<RespostaLugares> {
    return { lugares: [], erro: RECUSA_LUGARES };
  }
}

/* ------------------------------------------------------------
   Qual provedor usar
   ------------------------------------------------------------
   Único lugar que muda quando a decisão do §8 for tomada: uma
   classe nova implementando a interface, escolhida aqui por
   configuração. Nenhuma rota precisa saber.
   ------------------------------------------------------------ */
import { env } from '../env.js';
import { criarBuscaClaude } from './provedor-claude-busca.js';

let busca: ProvedorBusca | null = null;
let lugares: ProvedorLugares | null = null;

export function provedorBuscaAtual(): ProvedorBusca {
  if (!busca) {
    /* `env.ts` já garantiu na partida que, com PESQUISA_DRIVER=claude,
       IA_API_KEY e IA_MODELO existem — então `criarBuscaClaude()` só
       devolve null aqui por defeito de programação, e cair no
       indisponível é a resposta certa para isso: recusa com texto
       claro, não um 500. */
    busca = env.PESQUISA_DRIVER === 'claude'
      ? (criarBuscaClaude() ?? new BuscaIndisponivel())
      : new BuscaIndisponivel();
  }
  return busca;
}

export function provedorLugaresAtual(): ProvedorLugares {
  if (!lugares) {
    lugares = new LugaresIndisponivel();
  }
  return lugares;
}

/** Se há provedor de verdade por trás. A rota usa isto para avisar
 * ANTES de o usuário formular uma pergunta cara — e não depois, com
 * uma recusa que parece falha. */
export function pesquisaConfigurada(): { busca: boolean; lugares: boolean } {
  return {
    busca: env.PESQUISA_DRIVER !== 'none',
    lugares: env.LUGARES_DRIVER !== 'none',
  };
}
