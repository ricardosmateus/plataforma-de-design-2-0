/* ============================================================
   Gabarito de ideias duplicadas — a régua da frente A
   ============================================================
   Plano: planejamento-jev-assistente.md, frente A.

   Ao confirmar uma ideia proposta pelo assistente, a plataforma procura
   uma parecida (IDEIA-DUPL-003). A heurística de hoje, pelo registro do
   projeto, NUNCA disparou: zero alertas em 11.476 pares reais. Aqui, o
   JEV escolhe, entre as ideias existentes, a que é a MESMA da nova — ou
   "nenhuma".

   Escrito por Claude (decisão do Ricardo, 02/10/2026). O contrapeso de
   quem escreve sabendo as respostas está em testes/duplicata-ideia.test.ts:
   o gabarito TEM de conter duplicatas com poucas palavras em comum e
   ideias diferentes com muitas — o par que a comparação por palavras erra.

   O que conta como "a mesma ideia": o mesmo serviço ou solução, para o
   mesmo problema e o mesmo público — mesmo com outras palavras. Ideias
   do MESMO TEMA que propõem coisas diferentes não são a mesma.
   ============================================================ */

export type IdeiaCurta = { id: string; titulo: string; descricao: string };
export type CasoDuplicata = {
  id: string;
  nova: { titulo: string; descricao: string };
  existentes: IdeiaCurta[];
  /** O id da existente que é a mesma ideia, ou 'nenhuma'. */
  certa: string;
  porque: string;
  /** A resposta certa é decisão de produto: espera a confirmação do Ricardo. */
  duvida?: boolean;
  /** Quem confirmou a resposta de um caso que era decisão de produto. */
  confirmadoPor?: string;
};

const LOCKERS = { id: 'lockers', titulo: 'Lockers para encomendas', descricao: 'Colocar lockers no hall para os moradores pegarem as compras sem depender do porteiro.' };
const NOTIFICACAO = { id: 'notificacao', titulo: 'Notificação de chegada', descricao: 'Mandar push ou WhatsApp ao morador quando o pacote entra no armário.' };
const RECEITA = { id: 'receita', titulo: 'Receita por entrega concluída', descricao: 'O e-commerce paga uma tarifa a cada entrega retirada no ponto de coleta.' };
const ASSEMBLEIA = { id: 'assembleia', titulo: 'Material de apoio para assembleia', descricao: 'Slides e argumentos prontos para o síndico apresentar a proposta aos moradores.' };
const CHECKOUT = { id: 'checkout', titulo: 'Opção de entrega no checkout', descricao: 'Aparecer como opção de entrega na hora da compra nos marketplaces.' };
const PORTARIA = { id: 'portaria', titulo: 'Portaria sem pilha de caixas', descricao: 'Tirar da portaria o trabalho de receber, guardar e entregar pacotes.' };
const PAINEL = { id: 'painel', titulo: 'Dashboard de entregas do condomínio', descricao: 'Uma tela para o síndico acompanhar quantas entregas o condomínio recebe e retira.' };
const ACESSO = { id: 'acesso', titulo: 'Abrir o armário pelo celular', descricao: 'O morador abre o compartimento com o próprio celular, sem senha nem chave.' };
const FIDELIDADE = { id: 'fidelidade', titulo: 'Desconto para quem usa o ponto de coleta', descricao: 'Morador que retira no armário ganha desconto nas próximas compras.' };
const VIZINHOS = { id: 'vizinhos', titulo: 'Um ponto para a rua inteira', descricao: 'Um mesmo ponto de coleta servindo vários condomínios vizinhos.' };

export const CASOS_DUPLICATA: CasoDuplicata[] = [
  {
    id: 'armario-portaria',
    nova: { titulo: 'Armário inteligente na portaria', descricao: 'Instalar um armário com código onde o morador retira a encomenda sozinho.' },
    existentes: [LOCKERS, NOTIFICACAO, ASSEMBLEIA],
    certa: 'lockers',
    porque: 'Armário com código e lockers no hall: o mesmo serviço, quase sem palavras em comum.',
  },
  {
    id: 'armario-devolucao',
    nova: { titulo: 'Armário inteligente para devoluções', descricao: 'Usar o armário do condomínio para o morador deixar compras que quer devolver ao e-commerce.' },
    existentes: [LOCKERS, NOTIFICACAO, RECEITA],
    certa: 'nenhuma',
    porque: 'Mesma infraestrutura, outro serviço: devolver não é receber.',
  },
  {
    id: 'avisar-morador',
    nova: { titulo: 'Avisar o morador quando a encomenda chegar', descricao: 'Mandar uma mensagem no celular assim que a encomenda for guardada.' },
    existentes: [NOTIFICACAO, LOCKERS, PAINEL],
    certa: 'notificacao',
    porque: 'A mesma notificação, com outras palavras.',
  },
  {
    id: 'avisar-sindico',
    nova: { titulo: 'Avisar o síndico sobre o volume de encomendas', descricao: 'Mandar ao síndico, todo mês, quantas encomendas o condomínio recebeu.' },
    existentes: [NOTIFICACAO, ASSEMBLEIA, LOCKERS],
    certa: 'nenhuma',
    porque: 'Muitas palavras em comum com a notificação ao morador, mas outro público e outro propósito. (O painel do síndico não está entre as opções aqui.)',
  },
  {
    id: 'cobrar-ecommerce',
    nova: { titulo: 'Cobrar do e-commerce por pacote', descricao: 'A loja paga um valor a cada pacote que o morador retira.' },
    existentes: [RECEITA, CHECKOUT, FIDELIDADE],
    certa: 'receita',
    porque: 'O mesmo modelo de receita.',
  },
  {
    id: 'cobrar-condominio',
    nova: { titulo: 'Cobrar mensalidade do condomínio', descricao: 'O condomínio paga uma mensalidade para ter o ponto de coleta.' },
    existentes: [RECEITA, CHECKOUT, ASSEMBLEIA],
    certa: 'nenhuma',
    porque: 'O oposto da receita existente: quem paga muda.',
  },
  {
    id: 'pontos-morador',
    nova: { titulo: 'Programa de pontos para moradores', descricao: 'O morador acumula pontos a cada retirada e troca por desconto.' },
    existentes: [FIDELIDADE, RECEITA, NOTIFICACAO],
    certa: 'fidelidade',
    porque: 'Pontos que viram desconto e desconto por usar o ponto: o mesmo incentivo.',
  },
  {
    id: 'pontos-academia',
    nova: { titulo: 'Pontos de coleta em academias', descricao: 'Instalar armários de retirada em academias de ginástica do bairro.' },
    existentes: [LOCKERS, VIZINHOS, PORTARIA],
    certa: 'nenhuma',
    porque: 'Outro lugar, outro público: academia não é condomínio.',
  },
  {
    id: 'lockers-sp',
    nova: { titulo: 'Lockers em prédios de São Paulo', descricao: 'Começar a instalar lockers por condomínios verticais da capital paulista.' },
    existentes: [LOCKERS, VIZINHOS, CHECKOUT],
    certa: 'lockers',
    porque: 'A mesma ideia com um recorte geográfico: o recorte não faz outra ideia.',
    confirmadoPor: 'Ricardo, 02/10/2026',
  },
  {
    id: 'entrega-noturna',
    nova: { titulo: 'Entrega noturna no armário', descricao: 'Transportadoras deixam as encomendas no armário durante a noite, sem incomodar a portaria.' },
    existentes: [LOCKERS, PORTARIA, NOTIFICACAO],
    certa: 'nenhuma',
    porque: 'Usa o armário, mas propõe outra coisa: um novo horário de entrega.',
  },
  {
    id: 'kit-sindico',
    nova: { titulo: 'Kit para o síndico convencer a assembleia', descricao: 'Apresentação e respostas às dúvidas mais comuns para o síndico levar à reunião.' },
    existentes: [ASSEMBLEIA, PAINEL, RECEITA],
    certa: 'assembleia',
    porque: 'O mesmo material de apoio.',
  },
  {
    id: 'pesquisa-sindicos',
    nova: { titulo: 'Conversar com síndicos sobre a assembleia', descricao: 'Entender por que síndicos não levam propostas de serviço à assembleia.' },
    existentes: [ASSEMBLEIA, PAINEL, VIZINHOS],
    certa: 'nenhuma',
    porque: 'Mesmo tema (a assembleia), outra coisa: entender o síndico não é produzir material para ele.',
  },
  {
    id: 'garagem',
    nova: { titulo: 'Smart locker na garagem', descricao: 'Colocar o locker no subsolo, perto dos elevadores.' },
    existentes: [LOCKERS, ACESSO, PORTARIA],
    certa: 'lockers',
    porque: 'Smart locker e lockers no hall: o lugar do prédio muda, a ideia não.',
  },
  {
    id: 'refrigerado',
    nova: { titulo: 'Armário refrigerado para supermercado', descricao: 'Compartimentos com geladeira para compras de supermercado que precisam de frio.' },
    existentes: [LOCKERS, ACESSO, FIDELIDADE],
    certa: 'nenhuma',
    porque: 'Um tipo novo de compartimento abre outro mercado (o de alimentos), com outras exigências.',
    confirmadoPor: 'Ricardo, 02/10/2026',
  },
  {
    id: 'mercado-livre',
    nova: { titulo: 'Integração com o Mercado Livre', descricao: 'O Mercado Livre mostrar o condomínio como ponto de retirada no checkout.' },
    existentes: [CHECKOUT, RECEITA, PAINEL],
    certa: 'checkout',
    porque: 'Aparecer no checkout de um marketplace: um caso da mesma ideia.',
  },
  {
    id: 'sistema-portaria',
    nova: { titulo: 'Integração com o sistema da portaria', descricao: 'Conectar com o software que a portaria já usa para registrar visitantes.' },
    existentes: [CHECKOUT, PORTARIA, ACESSO],
    certa: 'nenhuma',
    porque: '"Integração" e "portaria" em comum, mas é outra integração, com outro sistema.',
  },
  {
    id: 'trabalho-porteiro',
    nova: { titulo: 'Reduzir o trabalho do porteiro', descricao: 'O porteiro deixa de receber e guardar pacotes.' },
    existentes: [PORTARIA, LOCKERS, NOTIFICACAO],
    certa: 'portaria',
    porque: 'A mesma ideia, dita pelo lado do porteiro.',
  },
  {
    id: 'treinar-porteiro',
    nova: { titulo: 'Treinamento para porteiros', descricao: 'Ensinar os porteiros a explicar o armário aos moradores.' },
    existentes: [PORTARIA, NOTIFICACAO, ASSEMBLEIA],
    certa: 'nenhuma',
    porque: 'Mesmo público (o porteiro), outra ação: treinar não é tirar trabalho.',
  },
  {
    id: 'seguro',
    nova: { titulo: 'Seguro para encomendas extraviadas', descricao: 'Cobrir o valor da compra se a encomenda sumir do armário.' },
    existentes: [RECEITA, FIDELIDADE, CHECKOUT],
    certa: 'nenhuma',
    porque: 'Nada parecido no projeto: o caso fácil, que tem de continuar fácil.',
  },
  {
    id: 'qr-code',
    nova: { titulo: 'Morador retira com QR code', descricao: 'Um QR code no celular abre o compartimento da encomenda.' },
    existentes: [ACESSO, NOTIFICACAO, LOCKERS],
    certa: 'acesso',
    porque: 'Abrir pelo celular, sem senha: o QR code é um jeito de fazer a mesma ideia.',
  },
  {
    id: 'biometria',
    nova: { titulo: 'Abrir o armário com a digital', descricao: 'O morador encosta o dedo num leitor biométrico para abrir o compartimento.' },
    existentes: [ACESSO, LOCKERS, PORTARIA],
    certa: 'nenhuma',
    porque: 'Outro jeito de abrir, sem celular: o mesmo problema, outra solução.',
    confirmadoPor: 'Ricardo, 02/10/2026',
  },
  {
    id: 'painel-sindico',
    nova: { titulo: 'Painel do síndico', descricao: 'O síndico vê, numa tela, as entregas do condomínio no mês.' },
    existentes: [PAINEL, ASSEMBLEIA, NOTIFICACAO],
    certa: 'painel',
    porque: 'O mesmo dashboard.',
  },
  {
    id: 'painel-ecommerce',
    nova: { titulo: 'Dashboard de entregas da loja', descricao: 'Uma tela para o e-commerce acompanhar quantas entregas fez nos condomínios e quantas foram retiradas.' },
    existentes: [PAINEL, RECEITA, CHECKOUT],
    certa: 'nenhuma',
    porque: 'Quase as mesmas palavras do dashboard do síndico, mas para outro público, com outra pergunta.',
  },
  {
    id: 'notificacao-porteiro',
    nova: { titulo: 'Notificação de chegada ao porteiro', descricao: 'Mandar push ao porteiro quando o pacote entra no armário, para ele não precisar conferir.' },
    existentes: [NOTIFICACAO, PORTARIA, LOCKERS],
    certa: 'nenhuma',
    porque: 'Repete as palavras da notificação ao morador, mas avisa outra pessoa, para outro fim.',
  },
  {
    id: 'ponto-rua',
    nova: { titulo: 'Armário compartilhado entre prédios', descricao: 'Prédios vizinhos dividem um mesmo armário de encomendas.' },
    existentes: [VIZINHOS, LOCKERS, ACESSO],
    certa: 'vizinhos',
    porque: 'O mesmo ponto compartilhado.',
  },
];

export const CONTEXTO_EMPRESA_DUPLICATA =
  'iHouseLog: logtech brasileira que conecta e-commerces a condomínios residenciais, usados como pontos de coleta e entrega.';

export function casosConfirmadosDuplicata(): CasoDuplicata[] {
  return CASOS_DUPLICATA.filter((c) => !c.duvida);
}
