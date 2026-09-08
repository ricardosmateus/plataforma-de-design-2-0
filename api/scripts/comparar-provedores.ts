/* ============================================================
   Comparar provedores de busca — antes de escolher um
   ============================================================
   Rodar:
     npm run comparar-pesquisa -- "<contexto>" "<um concorrente>"

   Exemplo:
     npm run comparar-pesquisa -- "cafeterias em São Paulo" "Starbucks"

   ------------------------------------------------------------
   POR QUE ISTO EXISTE
   ------------------------------------------------------------
   §8 do planejamento deixa em aberto QUAL provedor de busca usar, e a
   forma barata de decidir não é ler comparativo de blog: é rodar as
   perguntas REAIS do §1 contra cada candidato e olhar o que volta.

   A escolha do PSP (decisão C3) foi feita assim e deu certo. Preço por
   requisição está em tabela pública e é o critério fácil; o que decide
   de verdade é se a resposta serve — e isso nenhuma tabela mostra.

   Por isso este script faz duas coisas separadas:

   · mede o que é MEDÍVEL — custo real e latência, por pergunta;
   · grava as RESPOSTAS INTEIRAS num markdown, lado a lado, para você
     ler e julgar. A parte que importa é essa, e ela não vira número.

   ------------------------------------------------------------
   O QUE ESTE SCRIPT NÃO FAZ
   ------------------------------------------------------------
   Não estima custo. Quando o provedor não informa quanto cobrou, o
   campo fica NULO no relatório — nunca um palpite. É a mesma regra da
   taxa do Mercado Pago (PES-003, e a lição da Fase 4): número chutado
   entra no relatório com cara de fato e decide a escolha errada.

   Não testa o nível 'lugares'. Aquele é a Places API do Google, e a
   decisão é outra — não se compara "quantas unidades no meu bairro"
   com um provedor de texto.

   ------------------------------------------------------------
   AS DUAS FAMÍLIAS QUE ESTÃO SENDO COMPARADAS
   ------------------------------------------------------------
   Elas não fazem a mesma coisa, e é isso que a comparação precisa
   deixar visível:

   · SONAR devolve RESPOSTA PRONTA com fontes. Uma chamada resolve.
   · TAVILY e EXA devolvem só FONTES. A síntese ficaria com a IA que a
     plataforma já tem e já mede — mais barato por busca, mais controle
     sobre o texto, e uma chamada a mais no caminho.

   Ou seja: o relatório não elege um vencedor sozinho. Ele mostra o
   custo e a qualidade de cada caminho para uma decisão que também é
   de arquitetura, não só de preço.
   ============================================================ */

import { loadEnvFile } from 'node:process';
import { writeFileSync } from 'node:fs';

try {
  loadEnvFile();
} catch {
  /* Sem .env é normal em CI. */
}

/* ------------------------------------------------------------
   Os argumentos, e a armadilha do npm
   ------------------------------------------------------------
   `npm run x -- "duas palavras" "outras duas"` PERDE as aspas: o npm
   remonta a linha de comando e o script recebe cinco argumentos
   soltos em vez de dois. O sintoma é traiçoeiro — o script roda, só
   que comparando "duas" contra "palavras".

   Por isso: `npx tsx` direto é a forma recomendada (o shell preserva
   as aspas), e mais de dois argumentos aqui é tratado como erro, não
   como algo a adivinhar. */
const args = process.argv.slice(2);
const [contexto, concorrente] = args;

const USO =
  '  Forma recomendada (preserva as aspas):\n' +
  '    npx tsx scripts/comparar-provedores.ts "<contexto>" "<um concorrente>"\n\n' +
  '  Exemplo:\n' +
  '    npx tsx scripts/comparar-provedores.ts "cafeterias em São Paulo" "Starbucks"\n\n' +
  '  O contexto descreve o mercado; o concorrente é um nome real desse\n' +
  '  mercado, para as perguntas de aprofundamento terem sujeito.\n';

if (!contexto || !concorrente) {
  console.error('\n  Faltam argumentos.\n\n' + USO);
  process.exit(1);
}

if (args.length > 2) {
  console.error(
    `\n  Recebi ${args.length} argumentos e esperava 2 — as aspas se perderam\n` +
    '  no caminho. Isso acontece com `npm run ... --`, que remonta a linha\n' +
    '  de comando e desfaz o agrupamento.\n\n' +
    `  Chegou assim: ${args.map((a) => `"${a}"`).join(' ')}\n\n` +
    '  Rodar do jeito abaixo resolve, porque aí quem interpreta as aspas\n' +
    '  é o shell:\n\n' + USO
  );
  process.exit(1);
}

/* As perguntas do §1, nas palavras do usuário, com os nomes trocados.
   Só as de nível 'busca': é para esse nível que o provedor está sendo
   escolhido. */
const PERGUNTAS = [
  `Quem são os principais concorrentes no mercado de ${contexto}?`,
  `Quantas unidades a ${concorrente} tem no Brasil e em quais regiões?`,
  `Qual é a principal reclamação de clientes sobre a ${concorrente}?`,
];

type Resultado = {
  /* A chave do candidato ('sonar', 'sonar-pro', 'tavily', 'exa'). O
     rótulo é para o relatório; agrupar por ele seria deduzir
     identidade de texto de exibição, que quebra no primeiro ajuste. */
  chave: string;
  provedor: string;
  pergunta: string;
  ok: boolean;
  /* Nulo quando o provedor não informa — nunca estimado. */
  custoUsd: number | null;
  latenciaMs: number;
  fontes: number;
  /* Quando o provedor informa UNIDADES em vez de dólares (é o caso da
     Anthropic: tokens e número de buscas). Fica separado de `custoUsd`
     de propósito — um é dado do provedor, o outro seria conta nossa, e
     misturar os dois numa coluna é como o palpite vira fato. */
  unidades?: string;

  /* O texto inteiro, para o relatório. Vazio quando o provedor só
     devolve fontes. */
  resposta: string;
  listaFontes: { titulo: string; url: string }[];
  erro?: string;
};

/* A mesma página com query string diferente é a mesma fonte. Sem isto
   a contagem engana: no primeiro teste real, três das "cinco fontes"
   do Exa eram a mesma página do Reclame Aqui com `?status=` diferente.
   Contar fonte inflada favorece o provedor errado. */
function semRepetir(fontes: { titulo: string; url: string }[]) {
  const vistas = new Set<string>();
  const saida: { titulo: string; url: string }[] = [];
  for (const f of fontes) {
    let chave = f.url;
    try {
      const u = new URL(f.url);
      chave = u.origin + u.pathname.replace(/\/$/, '');
    } catch { /* URL torta: compara como veio */ }
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(f);
  }
  return saida;
}

async function medir<T>(fn: () => Promise<T>): Promise<{ valor: T | null; ms: number; erro?: string }> {
  const t0 = Date.now();
  try {
    const valor = await fn();
    return { valor, ms: Date.now() - t0 };
  } catch (e) {
    return { valor: null, ms: Date.now() - t0, erro: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------
   Perplexity Sonar — resposta pronta + fontes
   ------------------------------------------------------------
   `usage.cost.total_cost` vem na própria resposta: é o dado que PES-003
   pede, sem depender de tabela de preço no nosso código.

   O endpoint mudou de forma na documentação deles mais de uma vez. Se
   o primeiro der 404, tenta o outro em vez de acusar falha — a dúvida
   é sobre a URL, não sobre a chave. */
const SONAR_URLS = [
  'https://api.perplexity.ai/chat/completions',
  'https://api.perplexity.ai/v1/sonar',
];

async function sonar(pergunta: string, modelo: string): Promise<Resultado> {
  const chave = process.env.PERPLEXITY_API_KEY;
  const base: Resultado = {
    chave: modelo, provedor: `sonar (${modelo})`, pergunta, ok: false, custoUsd: null,
    latenciaMs: 0, fontes: 0, resposta: '', listaFontes: [],
  };
  if (!chave) return { ...base, erro: 'PERPLEXITY_API_KEY não definida' };

  const { valor, ms, erro } = await medir(async () => {
    let ultima = '';
    for (const url of SONAR_URLS) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: pergunta }],
        }),
      });
      if (r.status === 404) { ultima = `404 em ${url}`; continue; }
      if (!r.ok) throw new Error(`${r.status} — ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    }
    throw new Error(ultima || 'nenhum endpoint respondeu');
  });

  if (!valor) return { ...base, latenciaMs: ms, erro };

  const j = valor as any;
  const fontes = (j.search_results ?? []).map((s: any) => ({
    titulo: s.title ?? '', url: s.url ?? '',
  }));
  /* Se `citations` vier e `search_results` não, aproveita — foi assim
     que a resposta deles já veio em versões anteriores. */
  if (!fontes.length && Array.isArray(j.citations)) {
    for (const u of j.citations) fontes.push({ titulo: '', url: String(u) });
  }

  const unicas = semRepetir(fontes);
  return {
    ...base,
    ok: true,
    latenciaMs: ms,
    /* Nulo se não vier. Não se calcula custo por fora. */
    custoUsd: typeof j.usage?.cost?.total_cost === 'number' ? j.usage.cost.total_cost : null,
    resposta: j.choices?.[0]?.message?.content ?? '',
    fontes: unicas.length,
    listaFontes: unicas,
  };
}

/* ------------------------------------------------------------
   Tavily e Exa — só fontes
   ------------------------------------------------------------
   Nenhum dos dois devolve custo na resposta: cobram por busca, com
   preço de tabela. Por isso `custoUsd` fica NULO aqui — o preço por
   busca está no relatório como nota, separado do que foi medido, para
   não se confundir com dado vindo do provedor. */
async function tavily(pergunta: string): Promise<Resultado> {
  const chave = process.env.TAVILY_API_KEY;
  const base: Resultado = {
    chave: 'tavily', provedor: 'tavily', pergunta, ok: false, custoUsd: null,
    latenciaMs: 0, fontes: 0, resposta: '', listaFontes: [],
  };
  if (!chave) return { ...base, erro: 'TAVILY_API_KEY não definida' };

  const { valor, ms, erro } = await medir(async () => {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ query: pergunta, search_depth: 'basic', include_answer: true, max_results: 5 }),
    });
    if (!r.ok) throw new Error(`${r.status} — ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  });

  if (!valor) return { ...base, latenciaMs: ms, erro };
  const j = valor as any;
  const fontes = (j.results ?? []).map((s: any) => ({ titulo: s.title ?? '', url: s.url ?? '' }));

  const unicas = semRepetir(fontes);
  return {
    ...base, ok: true, latenciaMs: ms,
    resposta: j.answer ?? '',
    fontes: unicas.length, listaFontes: unicas,
  };
}

async function exa(pergunta: string): Promise<Resultado> {
  const chave = process.env.EXA_API_KEY;
  const base: Resultado = {
    chave: 'exa', provedor: 'exa', pergunta, ok: false, custoUsd: null,
    latenciaMs: 0, fontes: 0, resposta: '', listaFontes: [],
  };
  if (!chave) return { ...base, erro: 'EXA_API_KEY não definida' };

  const { valor, ms, erro } = await medir(async () => {
    const r = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': chave },
      body: JSON.stringify({ query: pergunta, numResults: 5, contents: { text: true } }),
    });
    if (!r.ok) throw new Error(`${r.status} — ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  });

  if (!valor) return { ...base, latenciaMs: ms, erro };
  const j = valor as any;
  const fontes = (j.results ?? []).map((s: any) => ({ titulo: s.title ?? '', url: s.url ?? '' }));

  const unicas = semRepetir(fontes);
  return { ...base, ok: true, latenciaMs: ms, fontes: unicas.length, listaFontes: unicas };
}

/* ------------------------------------------------------------
   Claude com busca na web — o fornecedor que a plataforma JÁ TEM
   ------------------------------------------------------------
   Usa `IA_API_KEY` e `IA_MODELO`, os mesmos de `src/ia/provedor.ts`.
   Não é fornecedor novo: é uma ferramenta ligada na mesma chamada da
   Messages API que o assistente já faz.

   Duas coisas que os outros candidatos não têm:

   · `max_uses` limita quantas buscas o modelo encadeia numa pergunta.
     É o teto de PES-007 aplicado na ORIGEM, e não uma estimativa
     nossa depois do fato.
   · `allowed_domains` permitiria enviesar para fontes brasileiras —
     não uso aqui de propósito, para a comparação ser justa: os outros
     candidatos correm sem essa ajuda.

   A Anthropic informa UNIDADES (tokens e `web_search_requests`), não
   dólares. Por isso `custoUsd` fica nulo e as unidades vão para o
   relatório — a conversão em dinheiro é trabalho de `precos.ts`, que
   já existe, e não deste comparador. */
async function claudeComBusca(pergunta: string): Promise<Resultado> {
  const modelo = process.env.IA_MODELO;
  const base: Resultado = {
    chave: 'claude-busca', provedor: `claude com busca (${modelo ?? '?'})`,
    pergunta, ok: false, custoUsd: null, latenciaMs: 0, fontes: 0,
    resposta: '', listaFontes: [],
  };

  /* ---- Passou a usar o PROVEDOR DE VERDADE (02/09/2026) ----
     Até a decisão sair, este candidato mandava a pergunta crua, sem
     instrução de sistema — de propósito, para a comparação ser justa
     com os outros.

     Decidido o vencedor, o papel deste script mudou: de escolher para
     VERIFICAR. Agora ele chama `pesquisa/provedor-claude-busca.ts`, o
     mesmo código que atende o usuário — então rodar isto confere se os
     três defeitos que a comparação expôs (razão social no lugar do
     nome comercial, desvio para fontes americanas, narração vazando)
     ficaram de fato corrigidos.

     Se um dia entrar candidato novo, lembre que este roda AFINADO e os
     outros crus: para comparar de igual para igual, mande a pergunta
     direto à API como as outras funções fazem. */
  const { valor, ms, erro } = await medir(async () => {
    process.env.PESQUISA_DRIVER = 'claude';
    const { criarBuscaClaude } = await import('../src/pesquisa/provedor-claude-busca.js');
    const provedor = criarBuscaClaude();
    if (!provedor) throw new Error('IA_API_KEY ou IA_MODELO não definidas');
    return await provedor.buscar(pergunta);
  });

  if (!valor) return { ...base, latenciaMs: ms, erro };
  if (valor.erro) return { ...base, latenciaMs: ms, erro: valor.erro };

  const fontes = valor.fontes.map((f) => ({ titulo: f.titulo ?? '', url: f.url }));

  return {
    ...base, ok: true, latenciaMs: ms,
    resposta: valor.resposta,
    fontes: fontes.length, listaFontes: fontes,
    unidades:
      `${valor.custo?.buscas ?? '?'} busca(s) · ${valor.custo?.tokensEntrada ?? '?'} tokens entrada · ` +
      `${valor.custo?.tokensSaida ?? '?'} saída`,
  };
}

/* Preço de tabela, para os que não informam custo na resposta. Fica
   FORA de `custoUsd` de propósito: é referência pública, não medição —
   e misturar as duas coisas numa coluna só é como o custo vira palpite
   com cara de fato. Conferir antes de decidir; preço muda. */
const PRECO_TABELA: Record<string, string> = {
  tavily: '~US$ 0,008/busca · 1.000/mês grátis',
  exa: '~US$ 0,005/busca · 1.000/mês grátis',
};

async function main() {
  const candidatos: { nome: string; roda: (p: string) => Promise<Resultado> }[] = [
    { nome: 'sonar', roda: (p) => sonar(p, 'sonar') },
    { nome: 'sonar-pro', roda: (p) => sonar(p, 'sonar-pro') },
    { nome: 'tavily', roda: tavily },
    { nome: 'exa', roda: exa },
    { nome: 'claude-busca', roda: claudeComBusca },
  ];

  const configurados = candidatos.filter(({ nome }) =>
    nome.startsWith('sonar') ? !!process.env.PERPLEXITY_API_KEY
      : nome === 'tavily' ? !!process.env.TAVILY_API_KEY
      : nome === 'claude-busca' ? !!(process.env.IA_API_KEY && process.env.IA_MODELO)
      : !!process.env.EXA_API_KEY
  );

  if (!configurados.length) {
    console.error(
      '\n  Nenhum candidato configurado. Ponha no .env a chave de pelo menos um:\n\n' +
      '    IA_API_KEY + IA_MODELO   (claude com busca — provavelmente já tem)\n' +
      '    PERPLEXITY_API_KEY=...   (sonar e sonar-pro)\n' +
      '    TAVILY_API_KEY=...\n' +
      '    EXA_API_KEY=...\n\n' +
      '  Todos têm faixa gratuita suficiente para esta comparação.\n'
    );
    process.exit(1);
  }

  console.log(`\n  Comparando ${configurados.length} candidato(s) em ${PERGUNTAS.length} perguntas...\n`);

  const todos: Resultado[] = [];
  for (const pergunta of PERGUNTAS) {
    console.log(`  ${pergunta}`);
    for (const c of configurados) {
      process.stdout.write(`    ${c.nome.padEnd(12)} `);
      const r = await c.roda(pergunta);
      todos.push(r);
      console.log(
        r.ok
          ? `${String(r.latenciaMs).padStart(5)}ms · ${r.fontes} fontes · ` +
            (r.custoUsd !== null ? `US$ ${r.custoUsd.toFixed(5)}` : (r.unidades ?? 'custo não informado'))
          : `erro: ${r.erro}`
      );
    }
    console.log('');
  }

  /* ---- O relatório: onde a qualidade fica visível ---- */
  const data = new Date().toISOString().slice(0, 10);
  const arquivo = `../../comparacao-provedores-${data}.md`;

  const linhas: string[] = [
    `# Comparação de provedores de busca — ${data}`,
    '',
    `**Contexto:** ${contexto}  `,
    `**Concorrente usado nas perguntas de aprofundamento:** ${concorrente}`,
    '',
    '> O custo abaixo é o que **o provedor informou na resposta**. Onde',
    '> aparece "não informado", o provedor cobra por tabela e o preço está',
    '> na nota de rodapé — nunca estimado aqui (PES-003).',
    '',
    '## Resumo',
    '',
    '| Provedor | Perguntas OK | Custo total informado | Latência média | Fontes/pergunta |',
    '|---|---|---|---|---|',
  ];

  for (const c of configurados) {
    const ok = todos.filter((r) => r.chave === c.nome && r.ok);
    const custos = ok.map((r) => r.custoUsd).filter((x): x is number => x !== null);
    const custo = custos.length ? `US$ ${custos.reduce((a, b) => a + b, 0).toFixed(5)}` : 'não informado';
    const lat = ok.length ? Math.round(ok.reduce((a, r) => a + r.latenciaMs, 0) / ok.length) + 'ms' : '—';
    const fon = ok.length ? (ok.reduce((a, r) => a + r.fontes, 0) / ok.length).toFixed(1) : '—';
    linhas.push(`| ${c.nome} | ${ok.length}/${PERGUNTAS.length} | ${custo} | ${lat} | ${fon} |`);
  }

  linhas.push('', '**Preço de tabela** (para quem não informa custo na resposta):', '');
  for (const [nome, preco] of Object.entries(PRECO_TABELA)) {
    if (configurados.some((c) => c.nome === nome)) linhas.push(`- \`${nome}\` — ${preco}`);
  }

  linhas.push(
    '',
    '---',
    '',
    '## As respostas, para julgar',
    '',
    'Custo e latência decidem pouco: os dois estão na mesma ordem de',
    'grandeza. O que decide é se a resposta serve — e isso só lendo.',
    '',
    'Repare em três coisas: se ela **responde a pergunta feita** ou desvia;',
    'se as **fontes são brasileiras e recentes**; e se ela **admite não',
    'saber** em vez de preencher com plausível.',
    ''
  );

  for (const pergunta of PERGUNTAS) {
    linhas.push(`### ${pergunta}`, '');
    for (const r of todos.filter((x) => x.pergunta === pergunta)) {
      linhas.push(`#### ${r.provedor}`, '');
      if (!r.ok) {
        linhas.push(`\`erro: ${r.erro}\``, '');
        continue;
      }
      if (r.unidades) linhas.push(`\`${r.unidades}\``, '');
      linhas.push(r.resposta ? r.resposta : '_(só devolve fontes — a síntese ficaria com a IA da plataforma)_', '');
      if (r.listaFontes.length) {
        linhas.push('**Fontes:**', '');
        for (const f of r.listaFontes) linhas.push(`- ${f.titulo || '(sem título)'} — ${f.url}`);
        linhas.push('');
      }
    }
    linhas.push('---', '');
  }

  writeFileSync(new URL(arquivo, import.meta.url), linhas.join('\n'));
  console.log(`  Relatório: comparacao-provedores-${data}.md (na raiz do projeto)\n`);
  console.log('  O resumo compara o que é medível. A decisão está nas respostas —\n  leia o arquivo antes de escolher.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
