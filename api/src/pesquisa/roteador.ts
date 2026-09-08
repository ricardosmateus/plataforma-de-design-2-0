/* ============================================================
   Para onde vai cada pergunta da pesquisa
   ============================================================
   Regras: planejamento-pesquisa-concorrentes.md §4 (PES-001, PES-004)

   Sem `import`, como `ideias/transicao.ts` e `ia/taxonomia-vocabulario.ts`,
   e pelo mesmo motivo: esta é a decisão que define quanto cada pergunta
   custa — de fração de centavo a dólares — e regra de custo que só o
   teste de integração cobre é, na prática, regra sem teste.

   A decisão é separada da execução. A rota continua chamando provedor,
   gravando sessão e liquidando crédito; o que ela pergunta aqui é
   apenas "que tipo de pergunta é esta, e a que ela se refere".

   POR QUE HEURÍSTICA, E NÃO UMA CHAMADA DE MODELO
   ------------------------------------------------------------
   Classificar com modelo custaria uma chamada em TODA pergunta,
   inclusive nas baratas — o piso de custo do módulo subiria para o
   preço da classificação. Aqui a heurística decide os casos claros de
   graça e marca `decidido: false` quando não tem certeza. Quem chama
   escolhe o que fazer com a dúvida (perguntar ao usuário, ou gastar
   uma chamada de modelo) — e essa escolha fica registrada como
   pendência em aberto no §8 do planejamento, não escondida aqui.
   ============================================================ */

/* O catálogo é FECHADO e todo o resto do código olha este campo,
   nunca o texto da pergunta — PES-001. É a mesma correção que
   `TipoTarefa` já registra no schema: rotear por texto solto é o
   defeito que `IDEIA-MOV-015` teve que consertar em outro lugar. */
export type Nivel =
  | 'conhecimento' /* o que o modelo já sabe — "quem são meus concorrentes" */
  | 'busca'        /* fato atual, precisa de fonte — "quantas unidades no Brasil" */
  | 'lugares'      /* geográfico e estruturado — "quantas no meu bairro" */
  | 'navegacao';   /* entrar num site específico — LinkedIn, Instagram */

/* O que a sessão já descobriu. `apelido` é o que faz "concorrente 01"
   significar alguma coisa: sem ele, a pergunta seguinte não tem a que
   se referir. */
export type Entidade = {
  apelido: string;
  nome: string;
};

export type Plano = {
  nivel: Nivel;

  /* `false` quando a pergunta acionou sinais de mais de um nível.
     Não é erro — é a heurística admitindo que não sabe, para quem
     chama confirmar ANTES de gastar (PES-007). O caso perigoso é o
     silencioso: mandar para 'navegacao' por acidente custa dólares. */
  decidido: boolean;

  /* A pergunta com as referências trocadas pelos nomes reais. É ela
     que vai ao provedor — nunca o texto cru, que só o usuário
     entende. */
  pergunta: string;

  /* Nomes que a pergunta cita, já resolvidos. */
  citadas: string[];

  /* Apelidos citados que NÃO existem na sessão — "concorrente 05"
     quando só três foram descobertos. Nunca pode passar em silêncio:
     a consulta iria ao provedor com a referência literal e voltaria
     com qualquer coisa, que é pior do que não voltar (PES-004). */
  naoResolvidas: string[];
};

/* ------------------------------------------------------------
   Sinais
   ------------------------------------------------------------
   Cada lista é o conjunto mínimo que separa um nível dos outros nos
   exemplos reais do §1. Deliberadamente curtas: sinal que quase
   nunca aparece não separa nada e só dá falsa confiança. */

/* Entrar num lugar específico da internet. O verbo sozinho não
   basta — "acesse os dados" não é navegação — por isso exige
   destino junto. */
const VERBOS_NAVEGACAO =
  /\b(entre|entrar|entra|acesse|acessar|acessa|abra|abrir|navegue|navegar)\b/i;

const DESTINOS_NAVEGACAO =
  /\b(linkedin|instagram|facebook|twitter|tiktok|youtube|site|página|pagina|perfil|url|www\.|https?:\/\/)/i;

/* Proximidade em relação a QUEM PERGUNTA. É este o sinal que separa
   "quantas unidades no Brasil" (busca) de "quantas unidades no meu
   bairro" (lugares) — as duas perguntam a mesma coisa, mas só a
   segunda é uma consulta geográfica com raio. */
const PROXIMIDADE =
  /\b(no meu bairro|na minha (região|regiao|cidade|rua|área|area)|perto (de mim|daqui|de mim)|aqui perto|próximo (a mim|daqui)|proximo (a mim|daqui)|nesta região|nesta regiao|nessa região|nessa regiao)\b/i;

/* Mapa citado explicitamente. Vale como sinal de 'lugares' mesmo sem
   proximidade: "quais as unidades dele no google maps" é consulta de
   lugar, não de fato. */
const MAPA = /\b(google maps|maps|mapa)\b/i;

/* Endereço, filial, unidade física. Só conta junto com proximidade
   ou mapa — sozinho, "quantas unidades" é pergunta de fato. */
const LUGAR_FISICO =
  /\b(unidade|unidades|filial|filiais|loja|lojas|endereço|endereco|endereços|enderecos)\b/i;

/* Fato verificável sobre alguém específico: precisa de fonte, não de
   memória do modelo. */
const FATO =
  /\b(quantas|quantos|quanto|qual|quais|onde|quando|em (que|qual)|reclamação|reclamacao|reclamações|reclamacoes|avaliação|avaliacao|avaliações|avaliacoes|preço|preco|preços|precos|faturamento|fundada|fundado|cnpj)\b/i;

/* ------------------------------------------------------------
   Tarefa não é pergunta
   ------------------------------------------------------------
   `FATO` acima só enxerga pergunta interrogativa — "quantas", "qual",
   "onde". Isso cobre o painel, onde a pessoa digita perguntando, e
   deixava de fora exatamente o caminho que a tela de atividade usa:
   a descrição de uma TAREFA, escrita no imperativo. "Pesquisar o
   slogan dos concorrentes" não tem nenhuma dessas palavras, não cita
   entidade conhecida, e caía em `conhecimento` — recusa, com a
   mensagem pedindo para reformular uma frase que já estava certa.

   O erro tinha um custo assimétrico: `busca` é o nível BARATO e
   executável, `conhecimento` é o único que não executa nada. Mandar
   para busca por engano gasta uma consulta; recusar por engano faz a
   pessoa desistir do recurso achando que ele não funciona. */

/* Verbo que declara a intenção de ir buscar fora. Sozinho não basta,
   pelo mesmo desenho de VERBOS_NAVEGACAO: "levantar informação sobre
   a nossa suposição mais crítica" é reflexão interna, não consulta. */
const VERBO_LEVANTAMENTO =
  /\b(pesquisar|pesquise|pesquisa|buscar|busque|descobrir|descubra|consultar|consulte|verificar|verifique|comparar|compare|mapear|mapeie|levantar|levante|identificar|identifique|listar|liste)\b/i;

/* Sobre QUEM o levantamento é. Junto com o verbo acima forma o par
   "vá buscar X sobre Y" — o mesmo formato verbo+destino que já
   separa navegação. */
const SUJEITO_EXTERNO =
  /\b(concorrente|concorrentes|competidor|competidores|empresa|empresas|marca|marcas|mercado|setor|indústria|industria|cliente|clientes|fornecedor|fornecedores|player|players|startup|startups|benchmark)\b/i;

/* Atributo que existe REGISTRADO em algum lugar público — não é algo
   que se deduza pensando. Vale como sinal de fato por conta própria,
   porque quem escreve "o slogan da X" está apontando para um dado que
   está publicado, mesmo sem usar palavra interrogativa. */
const ATRIBUTO_PUBLICO =
  /\b(slogan|slogans|tagline|missão|missao|visão|visao|posicionamento|fundador|fundadora|fundadores|sede|matriz|ceo|diretor|diretora|funcionários|funcionarios|portfólio|portfolio)\b/i;

/* O contrapeso, e a razão de ele existir: os sinais acima olham
   substantivo, e substantivo não distingue "pesquisar o slogan dos
   concorrentes" de "criar um slogan para a marca". A segunda é
   trabalho criativo — nenhuma fonte externa tem a resposta, porque
   ela ainda não existe. Sem este veto, o pedido de CRIAR viraria uma
   busca que não pode dar certo.

   O veto cai quando há verbo de levantamento junto: "pesquisar como
   os concorrentes criam seus slogans" é consulta, não criação. */
const VERBO_CRIACAO =
  /\b(criar|crie|criação|criacao|escrever|escreva|redigir|redija|elaborar|elabore|desenhar|desenhe|propor|proponha|gerar|gere|inventar|invente|bolar|bole|sugerir|sugira|montar|monte|projetar|prototipar|esboçar|esbocar|definir|defina)\b/i;

/* "concorrente 01", "concorrente 1", "concorrente 02". O zero à
   esquerda é opcional dos dois lados: o usuário escreve como quer, e
   a sessão gravou como gravou. */
const REFERENCIA_NUMERADA = /\bconcorrente\s*0*(\d+)\b/gi;

/* "quantas unidades ELE tem" é a forma mais comum de citar o
   concorrente da pergunta anterior — mais comum que repetir o
   apelido. Sem resolver isto, a consulta chega ao provedor sem
   antecedente: ele não tem como saber quem é "ele", e responde
   qualquer coisa. É o modo de falha que PES-004 existe para impedir,
   e o mais perigoso deles, porque a resposta VOLTA — só que sobre
   outra empresa. */
const PRONOME_POSSESSIVO = /\b(dele|dela|deles|delas)\b/gi;
const PRONOME_SUJEITO = /\b(ele|ela|eles|elas)\b/gi;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

/* Compara apelidos ignorando caixa e zero à esquerda, para que
   "Concorrente 01" na sessão case com "concorrente 1" na pergunta. */
function mesmoApelido(a: string, b: string): boolean {
  const limpar = (s: string) => normalizar(s).replace(/\s*0*(\d+)\b/, ' $1');
  return limpar(a) === limpar(b);
}

/* ------------------------------------------------------------
   Resolução de referência (PES-004)
   ------------------------------------------------------------
   Troca "concorrente 01" pelo nome real ANTES de qualquer
   classificação, porque o nome resolvido muda o que a pergunta é:
   com entidade citada, "quantas unidades" é busca sobre alguém
   específico; sem ela, é pergunta genérica. */
function resolver(
  pergunta: string,
  conhecidas: Entidade[],
  foco: Entidade | undefined,
): { pergunta: string; citadas: string[]; naoResolvidas: string[] } {
  const citadas: string[] = [];
  const naoResolvidas: string[] = [];

  let resolvida = pergunta.replace(REFERENCIA_NUMERADA, (bruto, numero: string) => {
    const alvo = `concorrente ${numero}`;
    const achada = conhecidas.find((e) => mesmoApelido(e.apelido, alvo));

    if (!achada) {
      naoResolvidas.push(bruto.trim());
      return bruto;
    }

    citadas.push(achada.nome);
    return achada.nome;
  });

  /* Pronome resolve contra o FOCO da sessão — a entidade de que a
     conversa está tratando — e não contra a lista inteira: com três
     concorrentes conhecidos, "ele" não tem como ser deduzido de quem
     existe, só de quem estava em pauta. Quem sabe isso é a sessão,
     então ela passa; o roteador não adivinha.

     Sem foco, o pronome vira referência não resolvida. Deixar passar
     mandaria ao provedor uma pergunta sem sujeito. */
  const temPronome = PRONOME_POSSESSIVO.test(resolvida) || PRONOME_SUJEITO.test(resolvida);
  PRONOME_POSSESSIVO.lastIndex = 0;
  PRONOME_SUJEITO.lastIndex = 0;

  if (temPronome) {
    if (foco) {
      resolvida = resolvida
        .replace(PRONOME_POSSESSIVO, `de ${foco.nome}`)
        .replace(PRONOME_SUJEITO, foco.nome);
      if (!citadas.includes(foco.nome)) citadas.push(foco.nome);
    } else {
      const achado = resolvida.match(PRONOME_SUJEITO) ?? resolvida.match(PRONOME_POSSESSIVO);
      if (achado) naoResolvidas.push(achado[0].toLowerCase());
      PRONOME_POSSESSIVO.lastIndex = 0;
      PRONOME_SUJEITO.lastIndex = 0;
    }
  }

  /* Entidade citada pelo nome, sem apelido. Não substitui nada — só
     registra que a pergunta fala dela, o que muda a classificação. */
  for (const e of conhecidas) {
    if (citadas.includes(e.nome)) continue;
    if (normalizar(resolvida).includes(normalizar(e.nome))) citadas.push(e.nome);
  }

  return { pergunta: resolvida, citadas, naoResolvidas };
}

/* ------------------------------------------------------------
   A função
   ------------------------------------------------------------ */
export function planejarConsulta(
  pergunta: string,
  conhecidas: Entidade[] = [],
  /* De quem a conversa está tratando agora. A sessão sabe; o
     roteador não tenta deduzir. */
  foco?: Entidade,
): Plano {
  const { pergunta: resolvida, citadas, naoResolvidas } = resolver(pergunta, conhecidas, foco);

  /* A classificação olha o texto RESOLVIDO: é ele que vai ao
     provedor, e é sobre ele que a decisão de custo tem que valer. */
  const alvo = resolvida;

  const ehNavegacao = VERBOS_NAVEGACAO.test(alvo) && DESTINOS_NAVEGACAO.test(alvo);
  const ehLugar =
    PROXIMIDADE.test(alvo) || (MAPA.test(alvo) && LUGAR_FISICO.test(alvo));
  /* Pedido de criar algo novo não tem fonte externa possível — o veto
     vem primeiro, senão "criar um slogan" acionaria ATRIBUTO_PUBLICO
     e viraria busca. */
  const ehLevantamento = VERBO_LEVANTAMENTO.test(alvo);
  const ehCriacao = VERBO_CRIACAO.test(alvo) && !ehLevantamento;

  const ehFato =
    !ehCriacao &&
    (FATO.test(alvo) ||
      citadas.length > 0 ||
      ATRIBUTO_PUBLICO.test(alvo) ||
      (ehLevantamento && SUJEITO_EXTERNO.test(alvo)));

  /* Ordem: do mais específico para o mais geral. Um sinal de
     navegação é mais informativo que um de fato, porque quase toda
     pergunta tem palavra de fato dentro. */
  const nivel: Nivel = ehNavegacao
    ? 'navegacao'
    : ehLugar
      ? 'lugares'
      : ehFato
        ? 'busca'
        : 'conhecimento';

  /* Dois níveis caros disputando a mesma pergunta é exatamente o
     caso em que errar sai caro. Aí a heurística não decide sozinha. */
  const disputa = ehNavegacao && ehLugar;

  return {
    nivel,
    decidido: !disputa,
    pergunta: resolvida,
    citadas,
    naoResolvidas,
  };
}
