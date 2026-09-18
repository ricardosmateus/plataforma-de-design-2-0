/* ============================================================
   Busca via ferramenta web_search da Anthropic
   ============================================================
   Planejamento: planejamento-pesquisa-concorrentes.md §8, decidido em
   02/09/2026 pela comparação de `scripts/comparar-provedores.ts`.

   Não é fornecedor novo: usa `IA_API_KEY` e `IA_MODELO`, os mesmos de
   `src/ia/provedor.ts`. A busca é uma ferramenta ligada na mesma
   chamada da Messages API — o que significa que o custo já cai em
   `consumos_ia`/`precos.ts`, sem medição nova para construir.

   ------------------------------------------------------------
   POR QUE ESTE E NÃO O EXA
   ------------------------------------------------------------
   Na comparação com as perguntas reais do §1, a pergunta "quantas
   unidades a Starbucks tem no Brasil" expôs a diferença estrutural:

   · As cinco fontes do Exa falavam todas de EXPANSÃO ("vai abrir 35
     lojas em 2026"). Nenhuma dizia quantas lojas existem hoje. Uma
     síntese em cima delas teria que recusar — ou inventar "35", com
     fonte respeitável anexada.
   · Este caminho achou uma fonte que o Exa não trouxe, com o número
     real, e respondeu "112 lojas (em dezembro de 2025)", separando a
     contagem atual do plano futuro.

   Fonte que não contém a resposta é limite de arquitetura, não de
   ajuste: nenhum prompt conserta. Os defeitos deste caminho, ao
   contrário, eram de instrução — e é o que este arquivo corrige.

   ------------------------------------------------------------
   POR QUE `allowed_domains` NÃO É USADO
   ------------------------------------------------------------
   A intenção era enviesar para fontes brasileiras com uma lista de
   domínios permitidos. A própria comparação mostrou que seria um erro.

   A fonte que trouxe o número certo das 112 lojas foi o `portalmie.com`
   — um site que ninguém teria colocado numa lista escrita à mão.
   Qualquer allowlist plausível (Exame, Folha, Veja, Reclame Aqui…)
   teria EXCLUÍDO justamente a fonte que ganhou a comparação.

   Whitelist de domínio troca um problema de qualidade por um teto de
   descoberta. O viés brasileiro fica na instrução de sistema, que
   orienta sem impedir.
   ============================================================ */

import { env } from '../env.js';
import type { ProvedorBusca, RespostaBusca, Fonte, Afirmacao, ContextoDeNegocio } from './provedor.js';

/* Teto de buscas encadeadas por pergunta. É PES-007 aplicado na
   ORIGEM: o provedor não gasta além disto, então o custo tem um limite
   conhecido ANTES da chamada — não uma estimativa nossa depois.

   Cinco foi o valor da comparação, onde nenhuma das três perguntas
   passou de uma busca. Sobra folga para pergunta mais difícil sem
   abrir espaço para o modelo se perder. */
export const MAX_BUSCAS = 5;

/* ============================================================
   Ler a página, não só o trecho — Fase 1b, 14/09/2026
   ============================================================
   `web_search` devolve trecho. Trecho responde "quem são" e não
   responde "como funciona": foi o que a investigação da Loggi
   mostrou, com a resposta certa e rasa. `web_fetch` traz a página
   inteira, e é o comportamento do Manus que motivou este plano.

   TRÊS TETOS, E CADA UM SEGURA UMA COISA DIFERENTE
   · `MAX_LEITURAS` — quantas páginas. Segura a DERIVA: sem ele o
     modelo encadeia leitura atrás de leitura seguindo links.
   · `MAX_TOKENS_POR_PAGINA` — quanto de cada uma. Segura a PÁGINA
     GORDA: um portal de notícias com menu, rodapé e trinta links
     relacionados entra inteiro no contexto se ninguém cortar.
   · `MAX_TOKENS_SAIDA` — quanto o modelo pode escrever. Subiu de
     1024 para 2048 porque a Fase 1a passou a mandar até seis
     perguntas por vez: a resposta da Loggi saiu com 982 tokens,
     encostada no teto antigo, e com páginas lidas ela seria cortada
     no meio.

   `web_fetch` NÃO TEM PREÇO PRÓPRIO — só tokens. Mas tokens de
   página lida são muitos, e voltam ao contexto a cada rodada. Quem
   paga por isso é a reserva, em `precos.ts`.

   SEGURANÇA: a ferramenta só busca URL que JÁ APARECEU na conversa,
   e a única coisa que aparece aqui são os resultados da própria
   busca. O conhecimento interno da empresa nunca chega a este
   provedor — ele vai para o PLANEJADOR, noutra chamada. É o que o
   §6 do plano pede: contexto interno e conteúdo lido nunca no mesmo
   bloco. */
export const MAX_LEITURAS = 3;
export const MAX_TOKENS_POR_PAGINA = 4_000;
export const MAX_TOKENS_SAIDA = 2_048;

/* Abaixo disto um bloco é cola, não afirmação: "Além disso:", "Em
   2024.", "Por outro lado". Marcar cola como "sem fonte" encheria a
   tela de aviso onde não há nada a sustentar. */
const MIN_CARACTERES_AFIRMACAO = 25;

/* Um parágrafo: linhas seguidas, até uma linha em branco. Casado
   com `matchAll` para que o `index` de cada um dê o deslocamento
   exato dentro do bloco — a posição tem que ser calculada, nunca
   estimada. Foi posição estimada que produziu os três defeitos
   silenciosos de 14/09/2026 (BOARD-PESQUISA-031, `remontar`, e o
   `inicio` que não viajava). */
const PARAGRAFO = /[^\n]+(?:\n(?!\n)[^\n]*)*/g;

/* Um título em markdown, nas duas formas que o provedor usa:
   `## Assim` e `**Assim:**` sozinho na linha. A guarda antiga só
   pegava a primeira, e só quando o bloco COMEÇAVA com ela. */
const EH_TITULO = /^(?:#{1,6}\s|\*\*[^*\n]+\*\*:?\s*$)/;

/* Um pedaço que começa assim não é afirmação: é o rabo da frase
   anterior, que ficou de fora porque a citação terminou antes do
   ponto final. Medido em 15/09/2026, numa investigação real: o
   rascunho ofereceu ".\n\nInside Lockers, Zibox e ..." e "— mas não
   atua com condomínios." como coisas a julgar. Ninguém consegue
   decidir se mantém um fragmento que começa no meio de uma frase. */
const EH_CONTINUACAO = /^[.,;:)\]}»—–-]|^[a-zà-ÿ]/;

/* ------------------------------------------------------------
   Blocos citados → afirmações
   ------------------------------------------------------------
   Pura, e exportada para poder ser conferida sem subir nada: é ela
   que decide o que a pessoa vai ler como "afirmação com fonte", e
   isso é caro demais para só ser testável com chamada real.

   Cada bloco de texto da resposta já chega com as citações que o
   sustentam. Não há atribuição a fazer — há atribuição a NÃO
   descartar. */
export type BlocoCitado = {
  texto: string;
  citacoes: { url?: unknown; cited_text?: unknown }[];
  inicio: number;
};

export function afirmacoesDosBlocos(blocos: BlocoCitado[], fontes: Fonte[]): Afirmacao[] {
  const afirmacoes: Afirmacao[] = [];

  for (const b of blocos) {
    const bruto = b.texto ?? '';

    const fonteIds: number[] = [];
    const trechos: string[] = [];

    for (const c of b.citacoes ?? []) {
      if (typeof c?.url !== 'string') continue;
      const i = fontes.findIndex((f) => f.url === c.url);
      if (i < 0 || fonteIds.includes(i)) continue;
      fonteIds.push(i);
      if (typeof c.cited_text === 'string' && c.cited_text) trechos.push(c.cited_text);
    }

    /* ---- Bloco COM citação: um bloco, uma afirmação ----
       A citação sustenta o bloco inteiro. Parti-lo orfanaria a
       atribuição: dois pedaços apontando para a mesma fonte, sem
       que ninguém saiba qual trecho sustenta qual. O que funciona
       fica como está. */
    if (fonteIds.length) {
      const texto = bruto.trim();
      if (texto.length < MIN_CARACTERES_AFIRMACAO) continue;
      if (EH_TITULO.test(texto)) continue;
      afirmacoes.push({ texto, fonteIds, trechos, semFonte: false, inicio: b.inicio });
      continue;
    }

    /* ---- Bloco SEM citação: não é uma afirmação, é o resto ----
       Aqui está o achado de 15/09/2026, na primeira investigação
       real. Um bloco sem citação não é "uma afirmação que o modelo
       não sustentou" — é *o texto que sobrou entre duas citações*,
       e nele vem junto: o rabo da frase anterior, os títulos das
       seções seguintes, e afirmações de verdade que o modelo não
       citou.

       Tratar tudo isso como UMA coisa produziu, no dado real, um
       item que começava em "— mas não atua com condomínios." e
       engolia inteira a seção "**O que faltou:**" — justamente o
       parágrafo em que o modelo diz o que NÃO conseguiu responder,
       que é o mais valioso da resposta. Ele chegou desmarcado
       (sem fonte chega desmarcada, por BOARD-PESQUISA-029) e foi
       descartado junto com o fragmento, sem ninguém ter decidido
       isso.

       Partir por parágrafo separa as três naturezas e deixa cada
       uma ser julgada pelo que é. */
    for (const m of bruto.matchAll(PARAGRAFO)) {
      const parte = m[0];
      const recuo = parte.length - parte.trimStart().length;
      const texto = parte.trim();

      if (texto.length < MIN_CARACTERES_AFIRMACAO) continue;

      /* Título é rótulo do que vem abaixo, não coisa a sustentar. */
      if (EH_TITULO.test(texto)) continue;

      /* Fragmento de continuação já está dito na afirmação citada
         de onde ele se soltou. Oferecê-lo de novo pede à pessoa
         uma decisão sobre meia frase. */
      if (EH_CONTINUACAO.test(texto)) continue;

      afirmacoes.push({
        texto,
        fonteIds: [],
        trechos: [],
        semFonte: true,
        inicio: b.inicio + (m.index ?? 0) + recuo,
      });
    }
  }

  return afirmacoes;
}

/* ---- Uma lição de 02/09/2026 ----
   A regra sobre número atual x plano futuro estava escrita como um
   contraste em maiúsculas ("Separe o que É do que SERÁ"). O modelo
   passou a ECOAR a instrução dentro da resposta — saiu um
   "(isto é, SERÁ, não É)" no meio de um parágrafo sobre uma franquia.

   Instrução com cara de slogan vira citação. Descrever o
   COMPORTAMENTO esperado, em vez de dar um lema para repetir, produz
   a mesma distinção sem o eco. */
/* ---- Uma lição de 07/09/2026 ----
   O prompt dizia tudo sobre o CONTEÚDO e nada sobre a FORMA, e o
   modelo respondia em bloco único: dez linhas sem uma quebra, com
   dados, ressalva e conclusão colados. A tela onde isso aparece
   (tema.html) já respeita quebra de linha — `white-space: pre-wrap`
   no `.tema-trecho` — então não havia nada a consertar na renderização:
   o texto chegava mesmo sem parágrafo nenhum.

   A instrução abaixo descreve QUANDO mudar de parágrafo, e não um
   formato a seguir, pela mesma razão da lição de 02/09: regra com
   cara de forma vira eco dentro da resposta. */
const SISTEMA = `Você pesquisa concorrentes e mercado para donos de pequenas e médias empresas no Brasil.

Responda em português do Brasil, direto, sem preâmbulo.

Ao listar concorrentes, use o NOME COMERCIAL pelo qual as pessoas conhecem a empresa — nunca a razão social de cadastro. "Coco Bambu", não "CB RESTAURANTES E FRANQUIAS LTDA". Se só encontrar razão social, diga que não achou o nome comercial em vez de apresentar o registro como se fosse a marca.

Priorize fontes brasileiras e recentes. Quando a informação for de outro país, diga isso — o dado dos Estados Unidos não serve para quem decide preço no Brasil.

Ao citar um número que muda com o tempo, diga de quando ele é. Se a fonte fala de lojas que ainda serão abertas, apresente como previsão — nunca como situação atual.

Quando as fontes não responderem a pergunta, diga isso. Uma resposta plausível construída em cima de fonte que não a sustenta é pior do que nenhuma resposta — quem lê vai decidir dinheiro em cima dela.

Você pode ABRIR uma página (web_fetch) quando o trecho da busca não responder. Abra as poucas que realmente decidem a resposta — a página oficial da empresa, a reportagem com o número. Não abra o que o trecho já respondeu, e não abra por curiosidade: cada página aberta entra inteira no que você tem para ler e encarece a resposta de quem perguntou.

Não narre o que você vai fazer. Vá direto ao que encontrou.

Separe a resposta em parágrafos, com uma linha em branco entre eles, mudando de parágrafo quando mudar de assunto: o que os dados mostram, o que ficou faltando, e a conclusão são parágrafos diferentes. Esta resposta é lida numa tela estreita, e um bloco corrido de dez linhas faz o olho perder a linha na volta.`;

type BlocoTexto = { type: 'text'; text?: string; citations?: unknown[] };


/* O contexto vai no `system`, não na pergunta: ele descreve quem
   pergunta, e não deve virar termo de busca na web — "Logtech
   condomínio ponto de coleta" colado na consulta estreitaria o
   resultado em vez de esclarecê-lo. */
function comContexto(base: string, contexto?: ContextoDeNegocio): string {
  const e = contexto?.empresa;
  if (!e) return base;

  const linhas = [`Nome: ${e.nome}`];
  const d = (e.descricao ?? '').trim();
  if (d) linhas.push(`O que faz: ${d}`);

  return (
    base +
    `\n\nQUEM ESTA PERGUNTANDO\n${linhas.join('\n')}\n\n` +
    'Use isto para interpretar a pergunta. Se ela for ambigua e o contexto acima ' +
    'resolver a ambiguidade, resolva por ele e responda — nao devolva pedido de ' +
    'esclarecimento sobre o que ja esta escrito aqui. So peca esclarecimento sobre o ' +
    'que este contexto nao responde, e nesse caso diga exatamente o que falta.'
  );
}

export class BuscaClaude implements ProvedorBusca {
  constructor(private readonly chave: string, private readonly modelo: string) {}

  async buscar(pergunta: string, contexto?: ContextoDeNegocio): Promise<RespostaBusca> {
    let bruta: unknown;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.chave,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelo,
          max_tokens: MAX_TOKENS_SAIDA,
          system: comContexto(SISTEMA, contexto),
          messages: [{ role: 'user', content: pergunta }],
          tools: [
            /* A versão vem da configuração (15/09/2026). De
               `web_search_20260209` em diante a busca roda com
               filtragem dinâmica — os resultados passam por um
               código que os enxuga antes do contexto — e é por isso
               que `contemResultadoDeFerramenta` procura em qualquer
               profundidade: com filtragem, os resultados chegam
               aninhados. */
            { type: env.PESQUISA_BUSCA_VERSAO, name: 'web_search', max_uses: MAX_BUSCAS },
            {
              type: 'web_fetch_20250910',
              name: 'web_fetch',
              max_uses: MAX_LEITURAS,
              max_content_tokens: MAX_TOKENS_POR_PAGINA,
              /* Ligadas de propósito: é a citação que carrega o
                 `cited_text`, e é o trecho citado que mantém a
                 afirmação auditável depois que a página sair do ar
                 (PES-006). Sem isto, uma página lida entraria na
                 resposta sem deixar rastro de onde veio. */
              citations: { enabled: true },
            },
          ],
        }),
      });

      if (!r.ok) {
        /* Erro no corpo, não como exceção: quem chama precisa separar
           "não achei nada" de "não consegui buscar" (PES-008). */
        return {
          resposta: '', fontes: [],
          erro: `A busca não completou (${r.status}).`,
        };
      }

      bruta = await r.json();
    } catch {
      return { resposta: '', fontes: [], erro: 'Não consegui alcançar o serviço de busca.' };
    }

    const j = bruta as any;
    const blocos: any[] = Array.isArray(j.content) ? j.content : [];

    /* ---- A narração, removida pela ESTRUTURA e não por texto ----
       A resposta vem em blocos nesta ordem: um `text` com o modelo
       anunciando que vai buscar, o `server_tool_use`, o
       `web_search_tool_result`, e só então o `text` com a resposta.

       Na comparação isso apareceu como "Vou buscar informações
       sobre...Com base na busca realizada," colado num parágrafo só.

       Cortar por expressão ("Vou buscar", "Deixe-me...") seria caçar
       uma lista infinita de aberturas. Cortar pela posição do último
       resultado de busca é exato: o que vem depois dele é a resposta,
       o que vem antes é preparação. */
    /* Agora há DOIS tipos de resultado de ferramenta, e a resposta é
       o que vem depois do último de qualquer um deles. Procurar só
       por `web_search_tool_result` deixaria a narração da leitura
       ("Vou abrir a página da Loggi para confirmar") entrar na
       resposta como se fosse conteúdo. */
    /* EM QUALQUER PROFUNDIDADE — 15/09/2026.
       A partir de `web_search_20260209` a busca pode rodar com
       filtragem dinâmica: o modelo escreve código que filtra os
       resultados antes de eles entrarem no contexto, e aí os pares
       `server_tool_use` / `web_search_tool_result` chegam ANINHADOS
       dentro do bloco de execução de código, cada um com um campo
       `caller`.

       Varrer só o nível de cima acharia -1 e devolveria a resposta
       inteira, com o "Vou buscar informações sobre..." colado na
       frente — exatamente o defeito que este corte existe para
       evitar, ressuscitado por uma mudança de formato.

       Isto vale mesmo com a versão antiga: o custo é uma varredura
       rasa de objetos pequenos, e o ganho é o parser não depender de
       onde a API resolveu pôr o bloco. */
    const ultimoResultado = blocos.reduce(
      (ultimo, b, i) => (contemResultadoDeFerramenta(b) ? i : ultimo),
      -1,
    );
    const blocosDaResposta = ultimoResultado >= 0 ? blocos.slice(ultimoResultado + 1) : blocos;

    const textosDaResposta = blocosDaResposta.filter(
      (b): b is BlocoTexto => b?.type === 'text'
    );
    const juncao = textosDaResposta.map((b) => b.text ?? '').join('');
    const resposta = juncao.trim();

    /* Onde cada bloco de texto comeca dentro de `resposta`.
       A citacao vem presa ao bloco que ela sustenta — o join apaga
       essa ligacao, e ela e a unica coisa que diz a QUAL assunto da
       resposta cada fonte pertence. O recuo desconta o que o trim()
       comeu na frente, senao todo deslocamento sai errado. */
    const recuo = juncao.length - juncao.trimStart().length;
    const posicaoDoBloco = new Map<BlocoTexto, number>();
    let cursor = 0;
    for (const b of textosDaResposta) {
      posicaoDoBloco.set(b, Math.max(0, cursor - recuo));
      cursor += (b.text ?? '').length;
    }

    /* PES-006: as fontes saem das citações, que já trazem o trecho
       citado — e é o trecho que mantém a afirmação auditável quando a
       página sair do ar. */
    const fontes: Fonte[] = [];
    const porIdent = new Map<string, Fonte>();

    for (const b of blocos) {
      const inicio = posicaoDoBloco.get(b as BlocoTexto);

      for (const c of (b?.citations ?? []) as any[]) {
        const url = c?.url;
        if (typeof url !== 'string' || !url) continue;

        /* A mesma página com query string diferente é a mesma fonte —
           no teste real, três "fontes" eram o mesmo endereço do
           Reclame Aqui com `?status=` diferente. */
        let ident = url;
        try {
          const u = new URL(url);
          ident = u.origin + u.pathname.replace(/\/$/, '');
        } catch { /* URL torta: compara como veio */ }

        /* A fonte repetida continua entrando uma vez so na lista, mas
           agora ACUMULA as posicoes em vez de descartar as repetidas:
           a segunda citacao da mesma pagina costuma estar em outro
           assunto, e e justamente ela que diz que aquele quadro
           tambem se apoia nesta fonte. */
        let f = porIdent.get(ident);
        if (!f) {
          f = {
            url,
            titulo: typeof c.title === 'string' ? c.title : undefined,
            trecho: typeof c.cited_text === 'string' ? c.cited_text : undefined,
            inicios: [],
          };
          porIdent.set(ident, f);
          fontes.push(f);
        }
        if (typeof inicio === 'number' && !f.inicios!.includes(inicio)) {
          f.inicios!.push(inicio);
        }
      }
    }

    /* ---- Fonte por afirmação, de graça ----
       Os blocos já estão aqui, cada um com as citações que o
       sustentam e a posição dentro da resposta. O que faltava era
       não descartar isso no `join`.

       Bloco vira afirmação quando tem conteúdo próprio. Cabeçalho
       não é afirmação — é rótulo do que vem abaixo, e marcá-lo como
       "sem fonte" encheria a tela de aviso onde não há nada a
       sustentar. (É o mesmo cuidado que custou um defeito em
       14/09/2026, quando cabeçalho virou pergunta em aberto.)

       O piso de 25 caracteres corta a cola — "Além disso:", "Em
       2024." — que também não afirma nada sozinha. */
    const afirmacoes = afirmacoesDosBlocos(
      textosDaResposta.map((b) => ({
        texto: b.text ?? '',
        citacoes: (b.citations ?? []) as { url?: unknown; cited_text?: unknown }[],
        inicio: posicaoDoBloco.get(b) ?? 0,
      })),
      fontes,
    );

    return {
      resposta,
      fontes,
      afirmacoes,
      /* PES-003: unidades como o provedor as informou. A conversão em
         real é de `precos.ts`, com a cotação do dia — nunca uma conta
         embutida aqui. `custoUsdMicros` fica ausente porque a
         Anthropic não devolve dólares, e ausência é mais honesta que
         um número calculado por fora. */
      custo: {
        tokensEntrada: j.usage?.input_tokens,
        tokensSaida: j.usage?.output_tokens,
        buscas: j.usage?.server_tool_use?.web_search_requests,
        /* Quantas páginas foram abertas. Não vai para a razão porque
           `web_fetch` não cobra por uso — o que ele custa já está nos
           tokens. Serve para a narração poder dizer "li 3 páginas",
           que é a diferença visível entre a investigação de agora e a
           consulta rasa de antes. */
        leituras: j.usage?.server_tool_use?.web_fetch_requests,
      },
    };
  }
}

/** O modelo que SINTETIZA a busca.
 *
 * Fonte única, e é isso que importa aqui: o teto reservado
 * (`tetoBuscaUsdMicros`) e o provedor que faz a chamada precisam
 * falar do MESMO modelo. Enquanto os dois liam `env.IA_MODELO`
 * separadamente isso era verdade por coincidência; no dia em que
 * divergissem, a estimativa mentiria — a mesma classe de erro que
 * fez a reserva errar por 80× em 14/09/2026, e que os comentários
 * de `rotas/pesquisa.ts` já avisavam ("constante de custo repetida
 * é reserva que diverge do que o provedor faz").
 *
 * Cai em `IA_MODELO` quando `IA_MODELO_BUSCA` não está definido:
 * o padrão é exatamente o comportamento de antes. */
export function modeloDaBusca(): string | null {
  return escolherModeloDaBusca(env.IA_MODELO_BUSCA, env.IA_MODELO);
}

/** A escolha, pura, para poder ser medida sem mexer em `env`.
 *
 * Em branco NÃO é um modelo. `IA_MODELO_BUSCA=` (vazio) passa pelo
 * zod `.optional()` como string vazia, e `'' ?? padrao` devolve `''`
 * — o provedor nasceria com modelo vazio e falharia só na primeira
 * chamada, depois de a pessoa já ter clicado. */
export function escolherModeloDaBusca(
  daBusca: string | undefined,
  padrao: string | undefined,
): string | null {
  const limpo = (t: string | undefined) => {
    const v = (t ?? '').trim();
    return v || null;
  };
  return limpo(daBusca) ?? limpo(padrao);
}

const TIPOS_DE_RESULTADO = new Set(['web_search_tool_result', 'web_fetch_tool_result']);

/** O bloco É, ou CONTÉM, um resultado de busca/leitura?
 *
 * Recursiva porque a filtragem dinâmica aninha os resultados dentro
 * do bloco de execução de código. Profundidade limitada porque um
 * corpo torto não pode virar laço infinito num servidor.
 *
 * O teto é 8 e não 4 porque **cada array come um nível**: o caminho
 * documentado `bloco → content[] → par → content[] → resultado` já
 * gasta cinco. Um teto justo demais não falha com erro — ele
 * silenciosamente para de achar o resultado, e a narração do modelo
 * volta a vazar para dentro da resposta. Foi o teste que mostrou
 * isso, com um nível a mais do que a API documenta hoje. */
export function contemResultadoDeFerramenta(bloco: unknown, profundidade = 0): boolean {
  if (!bloco || typeof bloco !== 'object' || profundidade > 8) return false;

  if (Array.isArray(bloco)) {
    return bloco.some((b) => contemResultadoDeFerramenta(b, profundidade + 1));
  }

  const o = bloco as Record<string, unknown>;
  if (typeof o.type === 'string' && TIPOS_DE_RESULTADO.has(o.type)) return true;

  /* Só os campos que a API usa para carregar blocos dentro de
     blocos. Varrer o objeto inteiro acharia um `type` solto em
     qualquer canto e daria falso positivo. */
  return (
    contemResultadoDeFerramenta(o.content, profundidade + 1) ||
    contemResultadoDeFerramenta(o.results, profundidade + 1)
  );
}

/** Constrói o provedor se a configuração permitir. Devolve `null`
 * quando falta chave ou modelo — quem chama decide o que fazer, em vez
 * de receber uma instância que falha na primeira chamada. */
export function criarBuscaClaude(): BuscaClaude | null {
  const modelo = modeloDaBusca();
  if (!env.IA_API_KEY || !modelo) return null;
  return new BuscaClaude(env.IA_API_KEY, modelo);
}
