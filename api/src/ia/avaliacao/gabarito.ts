/* ============================================================
   Calibração — casos com gabarito (PURO)
   ============================================================
   Regras:  ia-avaliacao.md, IA-AVAL-014

   Etapas escritas À MÃO com o defeito já conhecido: a resposta
   certa não depende de opinião, porque o caso foi construído para
   tê-la. "Posicionar contra os 12 concorrentes" inventa fato porque a
   ficha da empresa não fala de concorrente nenhum — quem escreveu o
   caso garantiu isso.

   É a parte da calibração que não precisa de pessoa nem de outra IA
   como referência. O JEV avalia; o gabarito diz se ele acertou.

   Cada cenário vira UMA chamada ao JEV (o lote inteiro), no mesmo
   formato que a rota de gerar idéias usa.

   Rótulos:
     faixa        o que uma pessoa faria com a etapa (manteria,
                  revisaria, excluiria)
     generica     serviria a qualquer projeto
     inventaFato  afirma sobre a empresa algo fora da ficha
     duplicada    repete uma idéia de `existentes`
   ============================================================ */

import type { Marcacao } from './calibracao.js';
import type { ContextoAvaliacaoIdeias, EtapaAvaliavel } from './perguntas.js';

export type CasoGabarito = EtapaAvaliavel & {
  rotulo: 'boa' | 'generica' | 'inventa_fato' | 'duplicada' | 'fora_do_projeto';
  esperado: Omit<Marcacao, 'id'>;
};

export type Cenario = {
  id: string;
  contexto: Omit<ContextoAvaliacaoIdeias, 'etapas'>;
  casos: CasoGabarito[];
};

const boa = (titulo: string, descricao: string): CasoGabarito => ({
  titulo, descricao, rotulo: 'boa',
  esperado: { faixa: 'alta', generica: false, inventaFato: false, duplicada: false },
});
const generica = (titulo: string, descricao: string): CasoGabarito => ({
  titulo, descricao, rotulo: 'generica',
  esperado: { faixa: 'revisar', generica: true, inventaFato: false, duplicada: false },
});
const inventa = (titulo: string, descricao: string): CasoGabarito => ({
  titulo, descricao, rotulo: 'inventa_fato',
  esperado: { faixa: 'baixa', generica: false, inventaFato: true, duplicada: false },
});
const duplicada = (titulo: string, descricao: string): CasoGabarito => ({
  titulo, descricao, rotulo: 'duplicada',
  esperado: { faixa: 'revisar', generica: false, inventaFato: false, duplicada: true },
});
const fora = (titulo: string, descricao: string): CasoGabarito => ({
  titulo, descricao, rotulo: 'fora_do_projeto',
  esperado: { faixa: 'baixa', generica: false, inventaFato: false, duplicada: false },
});

export const CENARIOS: Cenario[] = [
  {
    id: 'padaria-identidade',
    contexto: {
      projetoNome: 'Identidade Visual',
      empresaNome: 'Padaria Grão Fino',
      empresaDescricao: 'Padaria artesanal de bairro em Curitiba, focada em pães de fermentação natural.',
      validadas: ['O público principal são famílias que moram no bairro'],
      existentes: ['Pesquisar referências de marcas de padarias artesanais'],
      orientacao: null,
    },
    casos: [
      boa('Definir a paleta de cores da marca', 'Escolher de 3 a 5 cores que remetam à fermentação natural e ao pão artesanal. Entrega: paleta com códigos HEX aplicada em 2 peças.'),
      boa('Desenhar três propostas de logotipo', 'Criar 3 conceitos de logotipo a partir das referências levantadas, pensando nas famílias do bairro. Entrega: 3 opções em vetor para escolha.'),
      boa('Escolher a tipografia da marca', 'Definir uma fonte para títulos e outra para textos, legíveis na embalagem e na fachada. Entrega: guia com as duas fontes e exemplos de uso.'),
      generica('Planejar o projeto', 'Organizar as próximas atividades e revisar tudo com a equipe.'),
      generica('Fazer reuniões de alinhamento', 'Marcar reuniões periódicas para alinhar o andamento do trabalho.'),
      inventa('Posicionar a marca contra os 12 concorrentes', 'A Grão Fino já tem 40% do mercado do bairro; comparar com os 12 concorrentes diretos e definir os diferenciais.'),
      inventa('Adaptar a marca para as 5 filiais', 'Aplicar a identidade nas 5 filiais que a padaria abriu em São Paulo em 2024.'),
      duplicada('Levantar referências visuais de padarias artesanais', 'Reunir exemplos de marcas de padarias artesanais para inspirar o conceito. Entrega: painel com 15 referências.'),
      fora('Configurar o e-mail corporativo', 'Contratar um serviço de e-mail e criar as contas dos funcionários.'),
    ],
  },
  {
    id: 'saas-landing',
    contexto: {
      projetoNome: 'Landing Page',
      empresaNome: 'Fluxo',
      empresaDescricao: 'Software de gestão financeira para pequenos escritórios de contabilidade de Minas Gerais. Lançamento previsto para o próximo semestre.',
      validadas: ['O público são contadores donos de escritórios com até 10 funcionários'],
      existentes: ['Definir o objetivo principal da landing page'],
      orientacao: null,
    },
    casos: [
      boa('Escrever a proposta de valor', 'Resumir em uma frase o ganho para o contador dono de escritório pequeno. Entrega: 3 versões de título e subtítulo para teste.'),
      boa('Montar a estrutura das seções', 'Definir a ordem das seções: problema, solução, prova, preço e chamada para ação. Entrega: wireframe de baixa fidelidade.'),
      boa('Configurar a medição de conversões', 'Medir os cliques no botão de lista de espera. Entrega: painel com a taxa de conversão semanal.'),
      generica('Revisar tudo', 'Fazer uma revisão geral antes de publicar.'),
      inventa('Destacar os 3.000 clientes atuais', 'Colocar no topo o número de 3.000 escritórios que já usam o Fluxo e o selo de líder de mercado.'),
      duplicada('Definir a meta da landing page', 'Decidir qual é a ação principal que o visitante deve fazer na página. Entrega: a meta escrita em uma frase.'),
      fora('Redigir o contrato de trabalho dos vendedores', 'Preparar o modelo de contrato para contratar a equipe de vendas.'),
    ],
  },
  {
    id: 'clinica-mvp',
    contexto: {
      projetoNome: 'MVP',
      empresaNome: 'Clínica Sorriso Leve',
      empresaDescricao: 'Clínica de odontologia infantil com uma unidade em Recife.',
      validadas: [],
      existentes: [],
      orientacao: 'O foco é o agendamento de consultas pelo celular, feito pelos pais.',
    },
    casos: [
      boa('Mapear o problema do agendamento', 'Entrevistar 5 pais sobre como marcam consultas hoje e onde travam. Entrega: lista dos 3 maiores problemas.'),
      boa('Definir o escopo mínimo do app', 'Escolher só as funções essenciais para os pais marcarem e remarcarem pelo celular. Entrega: lista de 5 funções priorizadas.'),
      boa('Testar o protótipo com pais', 'Pedir a 5 pais que marquem uma consulta num protótipo clicável. Entrega: relatório com os pontos em que travaram.'),
      generica('Melhorar a experiência', 'Garantir que tudo fique bom para os usuários.'),
      inventa('Integrar com o sistema das 8 unidades', 'Conectar o app ao prontuário usado nas 8 unidades da clínica em Recife e Olinda.'),
      fora('Criar a loja virtual de produtos de higiene', 'Vender escovas e cremes dentais infantis pelo app.'),
    ],
  },
];

/** Id estável de um caso, para casar nota e gabarito no relatório. */
export function idCaso(cenario: string, i: number): string {
  return `gabarito:${cenario}:${i}`;
}
