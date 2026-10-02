/* ============================================================
   Nomes de empresa que ninguém informou — ATV-GERAR-025 (PURO)
   ============================================================
   O prompt do gerador (ATV-GERAR-024) manda: nomes de empresas, SÓ os
   que aparecem na mensagem. Na régua do gerador (01/10/2026), mesmo
   assim, a tarefa de "Identidade da marca" citou "Juntos Entregamos" e
   "Nestio" — que ninguém informou. Instrução não é garantia.

   Este detector acha, no texto gerado, NOMES PRÓPRIOS (palavras com
   inicial maiúscula fora do começo de frase, em sequência: "Mercado
   Livre", "Juntos Entregamos") que não aparecem no texto PERMITIDO (a
   mensagem enviada ao gerador). Primeiro ele MEDE com que frequência
   isso acontece (scripts/avaliar-gerador.ts); a reação — gerar de novo
   — custa uma segunda chamada, e só se justifica se for frequente.

   Ignora o que não é nome de empresa: começo de frase, siglas e
   códigos (QR, B2B2C, NBR), e um vocabulário geográfico e comum.
   ============================================================ */

const COMUNS = new Set([
  'brasil', 'sudeste', 'sul', 'norte', 'nordeste', 'centro-oeste', 'são paulo', 'rio de janeiro', 'minas gerais',
  'belo horizonte', 'curitiba', 'porto alegre', 'salvador', 'recife', 'fortaleza', 'brasília', 'capitais',
  'foco', 'fatos', 'dados', 'para', 'quais', 'quanto', 'quantos', 'como', 'onde', 'quem', 'qual', 'estudos',
  'pesquisar', 'pesquisa', 'mapear', 'levantar', 'analisar', 'investigar', 'entender', 'identificar',
  'lgpd', 'cdc', 'procon', 'abnt', 'anatel', 'ibge', 'reclame aqui',
]);

function normal(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Sequências de palavras com inicial maiúscula, fora do começo de frase. */
export function nomesProprios(texto: string): string[] {
  const achados: string[] = [];
  /* Frases: o que vem depois de . ? ! : ; ou de quebra de linha é começo
     de frase — a maiúscula ali é gramática, não nome. */
  for (const frase of String(texto ?? '').split(/[.?!:;\n]+/)) {
    const palavras = frase.trim().split(/\s+/);
    let atual: string[] = [];
    const fechar = () => { if (atual.length) achados.push(atual.join(' ')); atual = []; };
    palavras.forEach((brutaP, i) => {
      const p = brutaP.replace(/^[("'“‘]+|[)"'”’,]+$/g, '');
      const inicioDeFrase = i === 0;
      const maiuscula = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçà]/.test(p);
      /* "iFood", "eBay", "iPhone": minúscula seguida de maiúscula é nome
         em qualquer posição — o ponto cego da 1ª medição (01/10/2026). */
      const camelo = /^[a-z][A-Z][A-Za-z]+$/.test(p);
      const sigla = /^[A-Z0-9]{2,}$/.test(p) || /\d/.test(p);
      const conector = atual.length > 0 && /^(de|da|do|das|dos|e)$/.test(p);
      if (camelo) { fechar(); atual.push(p); fechar(); }
      else if (maiuscula && !sigla && !inicioDeFrase) atual.push(p);
      else if (conector) atual.push(p);
      else fechar();
      if (/[,)]$/.test(brutaP)) fechar();
    });
    fechar();
  }
  /* Conector solto no fim ("Mercado de") não faz parte do nome. */
  return achados.map((n) => n.replace(/\s+(de|da|do|das|dos|e)$/i, '')).filter(Boolean);
}

/**
 * Os nomes do texto gerado que não estão no texto permitido nem no
 * vocabulário comum. A comparação é sem acento e sem caixa, e aceita
 * a forma por partes: "Amazon Lockers" é aceito se "Amazon" foi
 * informado.
 */
export function nomesNaoInformados(gerado: string, permitido: string): string[] {
  const base = normal(permitido);
  const fora = new Set<string>();
  for (const nome of nomesProprios(gerado)) {
    const n = normal(nome);
    if (COMUNS.has(n)) continue;
    if (base.includes(n)) continue;
    const primeira = n.split(' ')[0]!;
    if (primeira.length >= 4 && base.includes(primeira)) continue;
    fora.add(nome);
  }
  return [...fora];
}

/* ============================================================
   A reação — ATV-GERAR-025 (opção A, Ricardo, 01/10/2026)
   ============================================================
   Medido na régua do gerador: 5 de 24 tarefas do prompt de produção
   citavam empresas não informadas, quase todas em identidade visual e
   benchmark. Os nomes não são necessários: a pesquisa descobre as
   empresas sozinha, com o site verificado pela busca (BOARD-VISUAL-015).
   Então o gerador tenta UMA vez de novo, pedindo a categoria em vez dos
   nomes. */
export function instrucaoSemNomes(nomes: string[]): string {
  return [
    `A proposta anterior citou empresas que esta mensagem não traz: ${nomes.join(', ')}.`,
    'Escreva a tarefa de novo SEM esses nomes: descreva o TIPO de empresa (por exemplo, "logtechs brasileiras",',
    '"plataformas de delivery") — quem escolhe as empresas é a pesquisa, com fonte. O resto continua valendo.',
  ].join(' ');
}

/** Entre a primeira proposta e a segunda tentativa, fica a com MENOS
 *  nomes não informados; empate, a primeira (a segunda não ajudou). */
export function escolherProposta<P extends { titulo: string; descricao: string }>(
  primeira: P,
  segunda: P | null,
  permitido: string,
): { proposta: P; trocou: boolean; nomesQueFicaram: string[] } {
  const nomesDe = (p: P) => nomesNaoInformados(`${p.titulo}. ${p.descricao}`, permitido);
  const n1 = nomesDe(primeira);
  if (!segunda) return { proposta: primeira, trocou: false, nomesQueFicaram: n1 };
  const n2 = nomesDe(segunda);
  return n2.length < n1.length
    ? { proposta: segunda, trocou: true, nomesQueFicaram: n2 }
    : { proposta: primeira, trocou: false, nomesQueFicaram: n1 };
}
