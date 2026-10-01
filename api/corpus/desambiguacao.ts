/* ============================================================
   Gabarito de desambiguação — a régua da etapa 3
   ============================================================
   Plano: planejamento-jev-board.md, Fases 3 e 4 (B1: "segue com a
   mais provável e diz o que assumiu")

   Para que serve: o JEV vai escolher SOZINHO a leitura de um pedido
   ambíguo, e a pesquisa inteira sai dessa escolha. Antes de ligar,
   mede-se: o JEV recebe a tarefa e as leituras, escolhe uma, e o
   acerto contra `certa` tem de passar de 85% (Fase 3, em sombra).

   Duas famílias de caso:
   - AMBÍGUOS: duas ou mais leituras plausíveis, e uma certa para o
     contexto desta empresa.
   - CLAROS: o certo é NÃO haver interpretações. Medem o erro oposto:
     ver ambiguidade onde não há também atrapalha.

   Oito casos tinham a leitura certa como DECISÃO DE PRODUTO, e não
   fato (concorrentes, preço, tamanho do mercado, benchmark de apps,
   personas, custo do locker, parceiros, iFood). Foram sugeridos por
   Claude e confirmados pelo Ricardo em 01/10/2026: estão marcados com
   `confirmadoPor`. Um caso novo com `duvida: true` não conta no
   acerto até ser confirmado.

   Origem dos casos: as tarefas reais vistas entre 13/09 e 01/10/2026
   ("Pesquisar outras logitechs", "Concorrentes", o mood board, os
   logotipos, "Nome dos clientes/usuários") e variações delas.
   ============================================================ */

export const CONTEXTO_IHOUSELOG =
  'iHouseLog: logtech brasileira que conecta e-commerces a condomínios residenciais, usados como pontos de coleta e entrega. ' +
  'Públicos: moradores, síndicos e administradoras, e-commerces. O time que pesquisa é de design de produto.';

export type Leitura = { id: string; leitura: string };

export type CasoAmbiguo = {
  id: string;
  tarefa: string;
  leituras: Leitura[];
  certa: string;
  porque: string;
  /** A leitura certa é decisão de produto: espera a confirmação do Ricardo. */
  duvida?: boolean;
  /** Quem confirmou a leitura certa de um caso que era decisão de produto. */
  confirmadoPor?: string;
  /** De onde o caso veio, quando é de uma tarefa real. */
  origem?: string;
};

export type CasoClaro = { id: string; tarefa: string; porque: string };

export const AMBIGUOS: CasoAmbiguo[] = [
  {
    id: 'logitechs',
    tarefa: 'Pesquisar outras logitechs',
    origem: 'tarefa real (o pedido do Ricardo, 13/09/2026)',
    leituras: [
      { id: 'a', leitura: 'Concorrentes diretos: logtechs que entregam em condomínios ou operam pontos de coleta no Brasil' },
      { id: 'b', leitura: 'Logtechs brasileiras em geral, de qualquer modelo de negócio' },
      { id: 'c', leitura: 'A empresa Logitech, fabricante de periféricos de computador' },
    ],
    certa: 'a',
    porque: '"logitechs" é logtechs com erro de digitação; "outras" diz que são as parecidas com a iHouseLog.',
  },
  {
    id: 'concorrentes',
    tarefa: 'Concorrentes',
    origem: 'tarefa real (sessão "Concorrentes", 30/09/2026)',
    leituras: [
      { id: 'a', leitura: 'Concorrentes diretos: quem leva entregas de e-commerce até o condomínio ou opera pontos de coleta nele' },
      { id: 'b', leitura: 'Concorrentes indiretos: transportadoras e marketplaces com pontos de retirada próprios' },
      { id: 'c', leitura: 'Os dois, separados em diretos e indiretos' },
    ],
    certa: 'c',
    porque: 'Sem qualificação, um time de design costuma querer o mapa inteiro, com a separação explícita.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'referencias-tech',
    tarefa: 'Colete referências visuais de empresas de tech, logística e inovação',
    origem: 'tarefa real (o mood board, 30/09/2026)',
    leituras: [
      { id: 'a', leitura: 'Identidade visual de logtechs e empresas do setor (logotipo, cores, tipografia)' },
      { id: 'b', leitura: 'Sites e interfaces de empresas de tecnologia em geral, como inspiração de UI' },
    ],
    certa: 'a',
    porque: 'A entrega pedida era um mood board de cores, estilos e tipografias: identidade, não interface.',
  },
  {
    id: 'preco',
    tarefa: 'Preço',
    leituras: [
      { id: 'a', leitura: 'Quanto os concorrentes cobram dos e-commerces por entrega em ponto de coleta' },
      { id: 'b', leitura: 'Quanto cobrar dos condomínios para instalar e manter o serviço' },
      { id: 'c', leitura: 'Quanto custa o equipamento (lockers) para a própria iHouseLog' },
    ],
    certa: 'a',
    porque: 'Quem paga pela entrega é o e-commerce; é o preço que posiciona a iHouseLog no mercado.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'amazon',
    tarefa: 'Pesquisar Amazon',
    leituras: [
      { id: 'a', leitura: 'Amazon Locker e Amazon Hub como referência de ponto de retirada' },
      { id: 'b', leitura: 'A Amazon como e-commerce cliente em potencial da iHouseLog' },
      { id: 'c', leitura: 'AWS, os serviços de nuvem da Amazon' },
    ],
    certa: 'a',
    porque: 'Para uma logtech de pontos de coleta, a Amazon interessa pelo modelo de retirada que ela já opera.',
  },
  {
    id: 'mercado-livre',
    tarefa: 'Mercado Livre e condomínios',
    leituras: [
      { id: 'a', leitura: 'Como o Mercado Livre entrega em condomínios hoje (agências, pontos de retirada, regras de portaria)' },
      { id: 'b', leitura: 'O Mercado Livre como parceiro ou cliente da iHouseLog' },
    ],
    certa: 'a',
    porque: 'O par "e condomínios" pede o que acontece hoje na prática, antes de qualquer parceria.',
  },
  {
    id: 'sindicos',
    tarefa: 'Síndicos',
    leituras: [
      { id: 'a', leitura: 'Dores e objeções dos síndicos com o volume de encomendas no condomínio' },
      { id: 'b', leitura: 'Quantos síndicos e condomínios existem: o tamanho desse público' },
    ],
    certa: 'a',
    porque: 'Para um time de design, o público vem antes do número: o que ele sente e o que o faz dizer não.',
  },
  {
    id: 'tamanho-mercado',
    tarefa: 'Tamanho do mercado',
    leituras: [
      { id: 'a', leitura: 'Volume de entregas de e-commerce para condomínios residenciais no Brasil' },
      { id: 'b', leitura: 'Número de condomínios residenciais no Brasil' },
      { id: 'c', leitura: 'Tamanho do mercado de lockers inteligentes' },
    ],
    certa: 'a',
    porque: 'É o mercado que a iHouseLog atende: entregas, e não prédios nem equipamentos.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'lockers',
    tarefa: 'Lockers',
    leituras: [
      { id: 'a', leitura: 'Empresas que vendem ou operam lockers inteligentes em condomínios no Brasil' },
      { id: 'b', leitura: 'Como funciona a tecnologia dos lockers (fechaduras, sensores, aplicativo)' },
    ],
    certa: 'a',
    porque: 'Num contexto de pesquisa de mercado, "lockers" pede quem está no jogo, e não como o equipamento funciona.',
  },
  {
    id: 'lgpd',
    tarefa: 'LGPD',
    leituras: [
      { id: 'a', leitura: 'O que a LGPD exige ao guardar dados de moradores (nome, apartamento, encomendas)' },
      { id: 'b', leitura: 'Um panorama geral da LGPD' },
    ],
    certa: 'a',
    porque: 'A pergunta útil é a que se aplica ao produto; o panorama geral não vira decisão de design.',
  },
  {
    id: 'loggi',
    tarefa: 'Pesquisar Loggi',
    leituras: [
      { id: 'a', leitura: 'A Loggi como concorrente: modelo de negócio, pontos de entrega, preço, cobertura' },
      { id: 'b', leitura: 'A identidade visual da Loggi (logotipo, cores, tipografia)' },
    ],
    certa: 'a',
    porque: 'Sem pedir nada visual, "pesquisar" uma empresa é pesquisar o negócio dela. O visual tem gatilho próprio (BOARD-VISUAL-012).',
  },
  {
    id: 'benchmark-apps',
    tarefa: 'Benchmark de apps',
    leituras: [
      { id: 'a', leitura: 'Apps de condomínio que gerenciam encomendas na portaria' },
      { id: 'b', leitura: 'Apps de entrega e rastreamento usados pelos moradores' },
    ],
    certa: 'a',
    porque: 'É o mesmo momento do produto da iHouseLog: a encomenda chegando ao condomínio.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'portaria',
    tarefa: 'Portaria',
    leituras: [
      { id: 'a', leitura: 'Como as portarias recebem, registram e entregam as encomendas hoje' },
      { id: 'b', leitura: 'Empresas de portaria remota e terceirizada' },
    ],
    certa: 'a',
    porque: 'A portaria é o ponto exato onde a iHouseLog atua; o processo dela é o que o produto muda.',
  },
  {
    id: 'devolucoes',
    tarefa: 'Devoluções',
    leituras: [
      { id: 'a', leitura: 'Logística reversa: como o morador devolve uma compra usando um ponto de coleta' },
      { id: 'b', leitura: 'O que o Código de Defesa do Consumidor diz sobre devoluções' },
    ],
    certa: 'a',
    porque: 'A devolução por ponto de coleta é uma oportunidade de produto; a lei é contexto, e não a pergunta.',
  },
  {
    id: 'shopee',
    tarefa: 'Shopee',
    leituras: [
      { id: 'a', leitura: 'Como a Shopee entrega e quais pontos de retirada ela usa' },
      { id: 'b', leitura: 'A Shopee como canal de vendas para os lojistas' },
    ],
    certa: 'a',
    porque: 'Para uma logtech, um marketplace interessa pela logística que ele já tem.',
  },
  {
    id: 'personas',
    tarefa: 'Personas',
    leituras: [
      { id: 'a', leitura: 'Personas de moradores que recebem encomendas' },
      { id: 'b', leitura: 'Personas de síndicos e administradoras' },
      { id: 'c', leitura: 'Personas de e-commerces que enviam para condomínios' },
    ],
    certa: 'a',
    porque: 'O morador é quem mais usa o produto no dia a dia.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'tendencias',
    tarefa: 'Tendências',
    leituras: [
      { id: 'a', leitura: 'Tendências de entrega de última milha e de entregas em condomínios em 2025 e 2026' },
      { id: 'b', leitura: 'Tendências de design de interfaces' },
    ],
    certa: 'a',
    porque: 'O pedido vem de um projeto de logística; tendência de design teria sido pedida com essa palavra.',
  },
  {
    id: 'regulacao',
    tarefa: 'Regulação',
    leituras: [
      { id: 'a', leitura: 'Regras de condomínio (convenção, assembleia) para instalar lockers e receber entregas' },
      { id: 'b', leitura: 'Regulação do transporte de cargas (ANTT, frete)' },
    ],
    certa: 'a',
    porque: 'O que pode travar a iHouseLog é a assembleia do condomínio, e não a regulação de transporte, que é dos parceiros.',
  },
  {
    id: 'custo-locker',
    tarefa: 'Quanto custa um locker',
    leituras: [
      { id: 'a', leitura: 'Preço de compra e instalação de um locker inteligente' },
      { id: 'b', leitura: 'Mensalidade de locker oferecido como serviço' },
    ],
    certa: 'a',
    porque: '"Quanto custa" sem mais nada costuma ser o preço de compra.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'parceiros',
    tarefa: 'Parceiros',
    leituras: [
      { id: 'a', leitura: 'Administradoras de condomínio, como canal para chegar a muitos condomínios de uma vez' },
      { id: 'b', leitura: 'Transportadoras que levariam as entregas até o condomínio' },
    ],
    certa: 'a',
    porque: 'Chegar aos condomínios é o gargalo de uma rede de pontos de coleta; transportadora é a parte que já existe.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
  {
    id: 'entregas-noturnas',
    tarefa: 'Entregas noturnas',
    leituras: [
      { id: 'a', leitura: 'Se e como dá para entregar à noite em condomínios (portaria, regras, segurança)' },
      { id: 'b', leitura: 'Empresas que já fazem entregas noturnas' },
    ],
    certa: 'a',
    porque: 'A dúvida de produto é a viabilidade no condomínio; quem já faz é a pergunta seguinte.',
  },
  {
    id: 'nome-clientes',
    tarefa: 'Nome dos clientes/usuários',
    origem: 'tarefa real (atividade "iHouseLog / Startup"; o time escolheu "iLovers")',
    leituras: [
      { id: 'a', leitura: 'Um nome para chamar os usuários da marca (naming de comunidade)' },
      { id: 'b', leitura: 'A lista de clientes atuais ou potenciais' },
    ],
    certa: 'a',
    porque: 'O próprio time respondeu esta tarefa com "iLovers": era naming. A leitura literal (b) é a armadilha.',
  },
  {
    id: 'mood-board',
    tarefa: 'Mood board',
    leituras: [
      { id: 'a', leitura: 'Referências visuais de marcas do setor: logotipos, cores e tipografia' },
      { id: 'b', leitura: 'Inspiração visual livre, de qualquer setor' },
    ],
    certa: 'a',
    porque: 'Num projeto de logtech, o mood board parte do setor; inspiração livre é pedida com essa palavra.',
  },
  {
    id: 'correios',
    tarefa: 'Correios',
    leituras: [
      { id: 'a', leitura: 'Os Correios como concorrente ou alternativa (agências, retirada em ponto)' },
      { id: 'b', leitura: 'Greves e atrasos dos Correios' },
    ],
    certa: 'a',
    porque: 'Num projeto de pontos de coleta, os Correios são a alternativa que o morador já conhece.',
  },
  {
    id: 'ifood',
    tarefa: 'iFood',
    leituras: [
      { id: 'a', leitura: 'Como os entregadores do iFood acessam condomínios (portaria, regras, conflitos)' },
      { id: 'b', leitura: 'O iFood como modelo de marketplace de entregas' },
    ],
    certa: 'a',
    porque: 'É o mesmo problema da iHouseLog, a entrega chegando ao condomínio, vivido por outro setor.',
    confirmadoPor: 'Ricardo, 01/10/2026 (seguiu a sugestão)',
  },
];

export const CLAROS: CasoClaro[] = [
  {
    id: 'claro-lockers-brasil',
    tarefa: 'Quais empresas operam lockers inteligentes em condomínios residenciais no Brasil?',
    porque: 'Diz o quê, onde e para quem.',
  },
  {
    id: 'claro-frete-ml',
    tarefa: 'Quanto o Mercado Livre cobra de frete para envios abaixo de R$ 79?',
    porque: 'Pergunta fechada, com o recorte dado.',
  },
  {
    id: 'claro-cor-loggi',
    tarefa: 'Qual a cor principal da marca Loggi?',
    porque: 'Uma pergunta, uma resposta.',
  },
  {
    id: 'claro-condominios-sp',
    tarefa: 'Quantos condomínios residenciais existem na cidade de São Paulo?',
    porque: 'Número com recorte geográfico explícito.',
  },
  {
    id: 'claro-lgpd-morador',
    tarefa: 'O que a LGPD exige para guardar o nome e o apartamento do morador num sistema de encomendas?',
    porque: 'A versão clara do caso "LGPD": já diz qual dado e em qual sistema.',
  },
  {
    id: 'claro-logotipos',
    tarefa: 'O que se sabe, com fonte, sobre os logotipos atuais das logtechs brasileiras?',
    porque: 'Tarefa real (01/10/2026), clara: objeto, setor e país dados.',
  },
];

/* ============================================================
   Régua v2 (fase 3a, 01/10/2026): o contexto INTERNO de cada caso
   ============================================================
   A primeira rodada deu ao JEV só a frase curta da tarefa e uma linha
   sobre a empresa — e os 5 erros tinham o dado que faltava DENTRO da
   plataforma. Uma tarefa real nunca vive solta: ela está numa
   atividade, num projeto, ao lado de outras tarefas, e a empresa tem
   "Sobre a empresa". Aqui está esse contexto, escrito como ele é na
   plataforma: nomes de atividade e de tarefa, e fatos validados.

   Dois cuidados, os dois conferidos em testes/desambiguacao.test.ts:
   - o texto da leitura certa NUNCA aparece copiado no contexto (a
     régua não pode ficar fácil por construção);
   - seis casos têm contexto NEUTRO, que não decide: três que hoje são
     inseguros (devem continuar inseguros — é para eles que o diálogo
     da fase 3c existe) e três que hoje são seguros (devem continuar
     certos — contexto a mais não pode atrapalhar).
   ============================================================ */

/** Fatos de "Sobre a empresa" (verdade validada), como a investigação já os lê. */
export const SOBRE_A_EMPRESA = [
  'Receita: o e-commerce paga por entrega concluída no ponto de coleta; o condomínio não paga pelo serviço.',
  'Os pontos de coleta são armários inteligentes instalados em áreas comuns. A iHouseLog não fabrica os armários: compra de fornecedores e instala.',
  'Público principal: moradores de condomínios verticais em capitais do Sudeste.',
  'A entrada num condomínio depende da aprovação em assembleia; o síndico leva a proposta.',
];

export type ContextoInterno = {
  projeto: string;
  atividade: string;
  /** A descrição completa da tarefa, quando a frase curta é só o título. */
  descricaoDaTarefa?: string;
  tarefasIrmas: string[];
  /** Contexto que de propósito NÃO decide a leitura. */
  neutro?: boolean;
};

const PROJETO = 'iHouseLog — Startup';
const NEUTRA = { atividade: 'Pesquisa inicial', tarefasIrmas: ['Levantar referências', 'Organizar o que já sabemos'], neutro: true };

export const CONTEXTOS: Record<string, ContextoInterno> = {
  'logitechs': { projeto: PROJETO, atividade: 'Análise de concorrência', tarefasIrmas: ['Mapear quem entrega em condomínios', 'Comparar preços de entrega por ponto'] },
  'concorrentes': { projeto: PROJETO, ...NEUTRA },
  'referencias-tech': {
    projeto: PROJETO,
    atividade: 'Identidade da marca',
    descricaoDaTarefa: 'Entenda como condomínios, e-commerces e moradores veem logística urbana. Colete 20–30 referências visuais de empresas de tech, logística e inovação. Entrega: mood board com cores, estilos e tipografias.',
    tarefasIrmas: ['Definir o nome da marca', 'Paleta de cores'],
  },
  'preco': { projeto: PROJETO, atividade: 'Modelo de negócio', tarefasIrmas: ['Quanto um e-commerce paga hoje por frete', 'Margem por entrega'] },
  'amazon': { projeto: PROJETO, atividade: 'Análise de concorrência', tarefasIrmas: ['Pesquisar Loggi', 'Pontos de retirada no Brasil'] },
  'mercado-livre': { projeto: PROJETO, ...NEUTRA },
  'sindicos': { projeto: PROJETO, ...NEUTRA },
  'tamanho-mercado': { projeto: PROJETO, atividade: 'Modelo de negócio', tarefasIrmas: ['Preço', 'Quantas entregas um condomínio recebe por mês'] },
  'lockers': { projeto: PROJETO, atividade: 'Análise de concorrência', tarefasIrmas: ['Pesquisar outras logitechs', 'Concorrentes'] },
  'lgpd': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Cadastro do morador', 'Aviso de encomenda chegando'] },
  'loggi': { projeto: PROJETO, atividade: 'Análise de concorrência', tarefasIrmas: ['Pesquisar Amazon', 'Shopee'] },
  'benchmark-apps': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Portaria', 'Aviso de encomenda chegando'] },
  'portaria': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Entregas noturnas', 'Cadastro do morador'] },
  'devolucoes': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Portaria', 'Aviso de encomenda chegando'] },
  'shopee': { projeto: PROJETO, ...NEUTRA },
  'personas': { projeto: PROJETO, atividade: 'Entender o morador', tarefasIrmas: ['Rotina de compras online', 'Dores ao receber encomendas'] },
  'tendencias': { projeto: PROJETO, atividade: 'Contexto do mercado', tarefasIrmas: ['Tamanho do mercado', 'Crescimento do e-commerce no Brasil'] },
  'regulacao': { projeto: PROJETO, atividade: 'Entrar no condomínio', tarefasIrmas: ['Síndicos', 'Como funciona uma assembleia'] },
  'custo-locker': { projeto: PROJETO, atividade: 'Modelo de negócio', tarefasIrmas: ['Margem por entrega', 'Fornecedores de armários'] },
  'parceiros': { projeto: PROJETO, atividade: 'Entrar no condomínio', tarefasIrmas: ['Síndicos', 'Regulação'] },
  'entregas-noturnas': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Portaria', 'Devoluções'] },
  'nome-clientes': { projeto: PROJETO, atividade: 'Identidade da marca', tarefasIrmas: ['Definir o nome da marca', 'Tom de voz'] },
  'mood-board': { projeto: PROJETO, ...NEUTRA },
  'correios': { projeto: PROJETO, ...NEUTRA },
  'ifood': { projeto: PROJETO, atividade: 'Operação no condomínio', tarefasIrmas: ['Portaria', 'Entregas noturnas'] },
};

/** Só os casos que contam no acerto: sem dúvida pendente. */
export function casosConfirmados(): CasoAmbiguo[] {
  return AMBIGUOS.filter((c) => !c.duvida);
}
