/* ============================================================
   Nenhum nível é beco sem saída — BOARD-PESQUISA-012
   ============================================================
   Puro: sem banco, sem rede, sem provedor. Recebe o plano e o que
   está configurado, devolve texto e opções.

   ------------------------------------------------------------
   POR QUE ESTE ARQUIVO EXISTE
   ------------------------------------------------------------
   Dois problemas juntos, antes dele.

   O primeiro: os textos de recusa viviam em DOIS lugares — as
   mensagens de 501/503 em `rotas/pesquisa.ts` e
   `motivoNaoExecutavel()` em `js/pesquisa.js` —, escritos em
   momentos diferentes e já divergindo. Um texto de produto com
   duas cópias tem duas versões da verdade, e a que o usuário lê
   depende de por qual caminho ele chegou.

   O segundo, mais grave: toda recusa terminava mandando a pessoa
   reescrever a tarefa. Ela escreveu "Pesquisar outras logitechs
   que atuam aqui no brasil" — uma tarefa perfeitamente clara — e
   recebeu um pedido de reescrita, porque `SUJEITO_EXTERNO` é uma
   lista fechada de substantivos genéricos e nome próprio não está
   nela (limite L1 do `planejamento-pesquisa-v2.md`). O trabalho
   de contornar o defeito ficava com quem menos podia saber dele.

   Agora a recusa vem com SAÍDAS: o que dá para fazer com esta
   mesma tarefa, agora, sem reescrever nada. A pessoa escolhe, o
   cliente reenvia com `nivelConfirmado`, e `consultar` executa —
   mecanismo que existia inteiro no servidor desde 02/09 e nunca
   teve quem o acionasse (limite L3).

   Isto NÃO conserta a heurística. Ela continua errando os quatro
   casos que `testes/roteador.test.ts` registra. O que muda é que
   errar deixou de ser uma porta fechada.
   ============================================================ */

import type { Nivel } from './roteador.js';

export type Configurado = { busca: boolean; lugares: boolean };

export type Saida = {
  nivel: Nivel;
  rotulo: string;
  explicacao: string;
};

/* Um nível é executável quando existe provedor por trás dele.
   'conhecimento' ainda não tem: ligá-lo a `ia/provedor.ts` exige um
   sistema próprio e não passa pela verificação de procedência de lá,
   que é específica do módulo de idéias. Fica registrado como o que é
   — pendente — em vez de responder de memória sem fonte, que é
   justamente o que PES-006 proíbe. */
export function executavelAgora(nivel: Nivel, configurado: Configurado): boolean {
  if (nivel === 'busca') return configurado.busca;
  if (nivel === 'lugares') return configurado.lugares;
  return false;
}

/* Por que o nível planejado não roda, em uma frase — sem pedir
   reescrita. `null` quando roda. */
export function impedimentoDe(nivel: Nivel, configurado: Configurado): string | null {
  if (executavelAgora(nivel, configurado)) return null;

  if (nivel === 'navegacao') {
    /* PES-005: decisão de negócio, não falta de tempo. Dizer isso
       sem oferecer o caminho público seria recusar duas vezes. */
    return (
      'Não entro em sites específicos como LinkedIn ou Instagram — é decisão nossa, ' +
      'por causa dos termos de uso deles.'
    );
  }
  if (nivel === 'conhecimento') {
    /* O texto antigo dizia "reescreva a tarefa como uma pergunta
       verificável (com número, data, nome ou fonte) e a busca
       executa". Era a tela pedindo à pessoa que compensasse um
       defeito nosso — e, no caso do Ricardo, a tarefa JÁ tinha nome
       próprio. Admitir a falibilidade da leitura é o que torna o
       botão ao lado uma oferta honesta em vez de teimosia. */
    return (
      'Li esta tarefa como reflexão, não como um fato para procurar em fonte externa. ' +
      'Posso estar errado — a leitura é por palavra-chave, e nome próprio costuma escapar dela.'
    );
  }
  if (nivel === 'lugares') {
    return 'A busca por proximidade (mapa, endereço, "perto de mim") não está ligada nesta instalação.';
  }
  return 'A busca externa não está ligada nesta instalação.';
}

/* O que dá para fazer com a MESMA tarefa, agora.

   Só entra aqui o que executa de verdade: oferecer um botão que vai
   dar em outra recusa é pior do que não oferecer nada — é prometer
   duas vezes e cumprir zero. Por isso `navegacao` nunca é saída: ela
   é recusa permanente (PES-005), não uma opção mais cara. */
export function saidasDe(
  plano: { nivel: Nivel; decidido: boolean },
  configurado: Configurado,
): Saida[] {
  const saidas: Saida[] = [];

  if (configurado.busca && plano.nivel !== 'busca') {
    saidas.push({
      nivel: 'busca',
      rotulo: 'Buscar assim mesmo',
      explicacao:
        plano.nivel === 'navegacao'
          ? 'Procuro o mesmo fato em fontes públicas, sem entrar no site deles.'
          : plano.nivel === 'lugares'
            ? 'Procuro em fontes públicas, sem o recorte de bairro ou cidade.'
            : 'Procuro em fontes públicas e trago as fontes junto. Custa crédito.',
    });
  }

  /* Proximidade só é oferecida quando a própria pergunta tem recorte
     geográfico. O roteador diz isso de dois jeitos: ou classificou
     como `lugares`, ou ficou indeciso entre navegação e lugares —
     que é a única disputa que existe hoje. Oferecer "perto de mim"
     para "Definir nossa proposta de valor" seria um botão sem
     sentido, e um botão sem sentido ensina a ignorar os botões. */
  const temRecorteGeografico =
    plano.nivel === 'lugares' || (plano.nivel === 'navegacao' && !plano.decidido);

  if (configurado.lugares && temRecorteGeografico && plano.nivel !== 'lugares') {
    saidas.push({
      nivel: 'lugares',
      rotulo: 'Buscar por proximidade',
      explicacao: 'Uso a base de lugares para trazer unidades e endereços perto de você.',
    });
  }

  return saidas;
}
