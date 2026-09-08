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
import type { ProvedorBusca, RespostaBusca, Fonte, ContextoDeNegocio } from './provedor.js';

/* Teto de buscas encadeadas por pergunta. É PES-007 aplicado na
   ORIGEM: o provedor não gasta além disto, então o custo tem um limite
   conhecido ANTES da chamada — não uma estimativa nossa depois.

   Cinco foi o valor da comparação, onde nenhuma das três perguntas
   passou de uma busca. Sobra folga para pergunta mais difícil sem
   abrir espaço para o modelo se perder. */
const MAX_BUSCAS = 5;

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
          max_tokens: 1024,
          system: comContexto(SISTEMA, contexto),
          messages: [{ role: 'user', content: pergunta }],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_BUSCAS }],
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
    const ultimoResultado = blocos.map((b) => b?.type).lastIndexOf('web_search_tool_result');
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

    return {
      resposta,
      fontes,
      /* PES-003: unidades como o provedor as informou. A conversão em
         real é de `precos.ts`, com a cotação do dia — nunca uma conta
         embutida aqui. `custoUsdMicros` fica ausente porque a
         Anthropic não devolve dólares, e ausência é mais honesta que
         um número calculado por fora. */
      custo: {
        tokensEntrada: j.usage?.input_tokens,
        tokensSaida: j.usage?.output_tokens,
        buscas: j.usage?.server_tool_use?.web_search_requests,
      },
    };
  }
}

/** Constrói o provedor se a configuração permitir. Devolve `null`
 * quando falta chave ou modelo — quem chama decide o que fazer, em vez
 * de receber uma instância que falha na primeira chamada. */
export function criarBuscaClaude(): BuscaClaude | null {
  if (!env.IA_API_KEY || !env.IA_MODELO) return null;
  return new BuscaClaude(env.IA_API_KEY, env.IA_MODELO);
}
