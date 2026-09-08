/* ============================================================
   Taxonomia — vocabulário e leitura da resposta
   ============================================================
   Sem `import`. De propósito: esta é a única parte do módulo que é
   decisão de negócio pura (quais categorias existem, e o que fazer
   quando o modelo devolve algo fora delas). Separada de rede e
   banco, ela roda em teste sem subir nada — e a regra do
   vocabulário fechado fica verificável de graça.
   ============================================================ */

/* ------------------------------------------------------------
   Taxonomia v2 — vocabulário FECHADO
   ------------------------------------------------------------
   Fechado de propósito. Um modelo livre para inventar categoria
   gera "Concorrentes", "Concorrência" e "Análise de concorrentes"
   como três pastas diferentes, e o mapa perde o sentido em algumas
   semanas. O que o modelo escolhe fora desta lista é descartado
   aqui, não corrigido depois na tela.

   PRÉ-REQUISITO ao adicionar uma categoria aqui: ela também precisa
   de uma entrada em DESCRICOES, em js/tema.js — a frase que explica
   o que a categoria significa, mostrada no topo da página do tema.
   Sem isso a categoria fica classificável e navegável, mas a página
   de tema abre sem dizer à pessoa o que ela está prestes a ler.
   Ver Skills/categorizacao-taxonomia.skill, seção "Toda categoria
   nova exige uma introdução em tema.html".
   ------------------------------------------------------------ */
export const TAXONOMIA = {
  Descoberta: [
    'Personas',
    'Concorrentes',
    'Mercado',
    'Benchmark',
    'Pesquisa Qualitativa',
    'Pesquisa Quantitativa',
  ],
  Produto: ['Funcionalidades', 'MVP', 'Roadmap', 'Requisitos', 'Backlog'],
  Experiência: ['Jornada do Usuário', 'UX', 'UI', 'Design System', 'Acessibilidade'],
  Negócio: ['Estratégia', 'KPIs', 'Posicionamento'],
  Tecnologia: ['APIs', 'IA', 'Arquitetura', 'Integrações'],
} as const;

export const CATEGORIAS: readonly string[] = Object.values(TAXONOMIA).flat();

/* Busca tolerante a caixa e acento: o modelo devolve "ux" ou
   "Jornada do usuario" com alguma frequência, e recusar isso seria
   jogar fora uma resposta certa por um detalhe de digitação. O que
   NÃO é tolerado é categoria inexistente. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const PORCHAVE = new Map(CATEGORIAS.map((c) => [normalizar(c), c]));

function canonica(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  return PORCHAVE.get(normalizar(valor)) ?? null;
}

export type Classificacao = { assunto: string; tags: string[] };

export function interpretar(bruto: string): Classificacao | null {
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let dados: unknown;
  try {
    dados = JSON.parse(limpo);
  } catch {
    const i = limpo.indexOf('{');
    const f = limpo.lastIndexOf('}');
    if (i === -1 || f <= i) return null;
    try {
      dados = JSON.parse(limpo.slice(i, f + 1));
    } catch {
      return null;
    }
  }

  const obj = dados as { assunto?: unknown; tags?: unknown };

  /* As tags são lidas antes do assunto porque servem de rede de
     segurança para ele — ver abaixo. */
  const validas: string[] = [];
  for (const t of Array.isArray(obj?.tags) ? obj.tags : []) {
    const c = canonica(t);
    if (c && !validas.includes(c)) validas.push(c);
  }

  /* Se o assunto veio fora da taxonomia mas alguma tag veio dentro,
     a primeira tag válida vira a pasta. O modelo demonstrou que
     entendeu o vocabulário; errou só em qual categoria promover a
     principal. Descartar tudo aí seria jogar fora informação boa e
     deixar a idéia invisível no mapa sem motivo. */
  const assunto = canonica(obj?.assunto) ?? validas[0] ?? null;

  /* Sem nenhuma categoria válida não há pasta — e uma pasta
     inventada é pior do que pasta nenhuma: é ela que transforma o
     mapa numa lista de sinônimos. */
  if (!assunto) return null;

  const tags = validas.filter((t) => t !== assunto).slice(0, 3);

  return { assunto, tags };
}

