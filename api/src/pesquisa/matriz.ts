/* ============================================================
   Resultado em formato de matriz — BOARD-PESQUISA-MATRIZ
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md
           (§ "Resultado que é uma matriz")

   Algumas tarefas de pesquisa pedem, com todas as letras, uma
   MATRIZ: "liste oportunidades e ameaças", "forças e fraquezas da
   empresa X contra a concorrência", "monte uma tabela comparando…".
   O resultado entregue em parágrafos responde a pergunta, mas obriga
   a pessoa a remontar a matriz à mão no board — que é exatamente o
   trabalho que ela pediu para a plataforma fazer.

   O fluxo tem três pontas, e esta é a do servidor:

     1. o PLANEJADOR (que já roda, e já é pago) diz se a tarefa pede
        uma matriz e qual — sem chamada nova de modelo;
     2. a BUSCA recebe o formato e organiza a resposta com os títulos
        fixos da matriz (ou uma tabela, na comparativa);
     3. o NAVEGADOR (js/pesquisa.js) reconhece esses títulos e monta o
        quadro-matriz. Ele reconhece pelos títulos, e não por esta
        dica, para que uma investigação reaberta dias depois volte
        como matriz sem o servidor ter guardado nada a mais.

   O reforço por palavras (`detectarMatriz`) existe porque pedir ao
   modelo é instrução, e o nome explícito da matriz na tarefa é
   garantia: quem escreveu "SWOT" quer uma SWOT.
   ============================================================ */

export type ModeloMatriz = 'swot' | 'csd' | 'impacto_esforco' | 'comparativa';

export const MODELOS_MATRIZ: readonly ModeloMatriz[] = ['swot', 'csd', 'impacto_esforco', 'comparativa'];

/* Os títulos que a busca é obrigada a usar — e que o navegador
   procura. Mudar um lado sem o outro quebra o reconhecimento: o
   espelho está em `MATRIZES` de js/pesquisa.js. */
export const QUADRANTES: Record<Exclude<ModeloMatriz, 'comparativa'>, string[]> = {
  swot: ['Forças', 'Fraquezas', 'Oportunidades', 'Ameaças'],
  csd: ['Certezas', 'Suposições', 'Dúvidas'],
  impacto_esforco: ['Fazer já', 'Planejar', 'Se sobrar tempo', 'Evitar'],
};

export function lerModeloMatriz(v: unknown): ModeloMatriz | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (t === 'fofa') return 'swot';
  if (t === 'impacto_x_esforco' || t === 'esforco_impacto' || t === 'impacto_esforço') return 'impacto_esforco';
  return (MODELOS_MATRIZ as readonly string[]).includes(t) ? (t as ModeloMatriz) : null;
}

/* Sem acento e em minúsculas: "Forças" e "forcas" são a mesma coisa
   para quem escreveu a tarefa às pressas. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* Só o NOME da matriz, dito na tarefa. Não tenta adivinhar a partir
   do assunto: "analisar a concorrência" não pede tabela nenhuma, e
   uma matriz que ninguém pediu é tão ruim quanto parágrafos no lugar
   da matriz pedida. Essa leitura mais fina é trabalho do planejador. */
export function detectarMatriz(tarefa: string): ModeloMatriz | null {
  const t = normalizar(tarefa || '');
  if (/\b(swot|fofa)\b/.test(t)) return 'swot';
  if (/\bforcas?\b[^.]{0,80}\bfraquezas?\b|\bfraquezas?\b[^.]{0,80}\bforcas?\b/.test(t)) return 'swot';
  if (/\boportunidades?\b[^.]{0,80}\bameacas?\b|\bameacas?\b[^.]{0,80}\boportunidades?\b/.test(t)) return 'swot';
  if (/\bmatriz\s+csd\b|\bcsd\b/.test(t)) return 'csd';
  if (/\bcertezas?\b[^.]{0,80}\bsuposic(ao|oes)\b[^.]{0,80}\bduvidas?\b/.test(t)) return 'csd';
  if (/\bimpacto\s*(x|×|e|vs\.?|versus|\/)\s*esforco\b|\besforco\s*(x|×|e|vs\.?|versus|\/)\s*impacto\b/.test(t)) return 'impacto_esforco';
  if (/\btabela\s+(comparativa|de\s+compara[cç][aã]o)\b|\bmatriz\s+(comparativa|de\s+compara[cç][aã]o)\b|\bmonte\s+uma\s+tabela\b|\bquadro\s+comparativo\b/.test(t)) return 'comparativa';
  return null;
}

/* A instrução que vai para a busca. Diz a FORMA, não o conteúdo: o
   que entra em cada quadrante continua sendo o que as fontes
   sustentam, e quadrante sem dado diz que faltou em vez de inventar
   — mesma regra de sempre (PES-006). */
export function instrucaoDeFormato(modelo: ModeloMatriz): string {
  const itens =
    'Em cada seção, de 2 a 5 itens, um por linha, sempre neste formato:\n' +
    '- **Título curto do item**: uma ou duas frases com o dado que sustenta o item.\n' +
    'Quando não houver dado para uma seção, escreva um único item dizendo o que faltou — não invente para preencher.';
  const conclusao =
    'Depois das seções, você pode acrescentar "## Conclusão" com um parágrafo curto. Nada antes da primeira seção.';

  if (modelo === 'swot') {
    return [
      'FORMATO DA RESPOSTA — esta tarefa pede uma matriz SWOT (FOFA).',
      'Organize a resposta EXATAMENTE nestas quatro seções, com estes títulos e nesta ordem:',
      '## Forças', '## Fraquezas', '## Oportunidades', '## Ameaças',
      'Forças e Fraquezas são da empresa que está perguntando, comparada ao mercado e aos concorrentes. Oportunidades e Ameaças vêm de fora: mercado, concorrentes, regulação, tendências.',
      itens, conclusao,
    ].join('\n');
  }
  if (modelo === 'csd') {
    return [
      'FORMATO DA RESPOSTA — esta tarefa pede uma Matriz CSD.',
      'Organize a resposta EXATAMENTE nestas três seções, com estes títulos e nesta ordem:',
      '## Certezas', '## Suposições', '## Dúvidas',
      'Certezas: o que as fontes confirmam. Suposições: o que há indício mas as fontes não comprovam. Dúvidas: o que a pesquisa não conseguiu responder e ainda precisa ser investigado.',
      itens, conclusao,
    ].join('\n');
  }
  if (modelo === 'impacto_esforco') {
    return [
      'FORMATO DA RESPOSTA — esta tarefa pede uma matriz de Impacto × Esforço.',
      'Organize a resposta EXATAMENTE nestas quatro seções, com estes títulos e nesta ordem:',
      '## Fazer já', '## Planejar', '## Se sobrar tempo', '## Evitar',
      '"Fazer já" é alto impacto e baixo esforço; "Planejar" é alto impacto e alto esforço; "Se sobrar tempo" é baixo impacto e baixo esforço; "Evitar" é baixo impacto e alto esforço. Classifique pelo que as fontes mostram sobre custo, prazo e resultado.',
      itens, conclusao,
    ].join('\n');
  }
  return [
    'FORMATO DA RESPOSTA — esta tarefa pede uma matriz comparativa.',
    'Comece com UMA tabela em markdown, sem nada antes dela:',
    '| Critério | Empresa A | Empresa B |',
    '|---|---|---|',
    '| Critério 1 | … | … |',
    'Uma coluna por empresa (de 2 a 5), começando pela empresa que está perguntando quando ela fizer parte da comparação. De 3 a 8 critérios, um por linha — use os que a tarefa pedir. Cada célula com no máximo 15 palavras; use "—" quando não achar o dado.',
    conclusao,
  ].join('\n');
}
