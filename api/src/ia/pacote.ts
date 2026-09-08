/* ============================================================
   O pacote de contexto — markdown para uma IA de fora
   ============================================================
   Regras: Regras_de_negocio/modulos/ia/ia-pacote-contexto.md

     PACOTE-CONT   o que entra e, sobretudo, o que fica de fora.
     PACOTE-VERD   SÓ verdade validada sai daqui. Hipótese não é
                   marcada como hipótese: ela simplesmente não vai.

   Este módulo NÃO é o `contexto.ts`. Aquele monta o pedido para o
   modelo que roda aqui dentro; este monta um documento para uma IA
   que não é nossa, escolhida pela pessoa.

   E a diferença entre os dois não é só de formato — é de garantia.
   Lá dentro, o `contexto.ts` PODE mandar as hipóteses marcadas,
   porque `verificacao.ts` confere a resposta depois e não depende
   de o modelo ter obedecido (IA-GARANT-003). Aqui não existe
   "depois": o arquivo sai da plataforma e nunca mais é visto. Um
   rótulo "não validada" viraria um pedido de boa vontade a um
   modelo que não controlamos.

   Por isso a fronteira aqui não separa seções — ela decide o que
   existe no arquivo.
   ============================================================ */

import { ehVerdadeValidada, type IdeiaContexto } from './contexto.js';

export type DadosPacote = {
  empresaNome: string;
  empresaDescricao: string | null;
  projetoNome: string;
  /* Recebe TODAS as idéias e filtra aqui dentro, de propósito: quem
     chama não precisa conhecer a fronteira, e ela continua morando
     num lugar só (`ehVerdadeValidada`). */
  ideias: IdeiaContexto[];
  geradoEm: Date;
};

function listar(ideias: IdeiaContexto[]): string {
  return ideias
    .map((i) =>
      [
        `### ${i.titulo}`,
        '',
        i.descricao,
        '',
        `*Importância declarada pela equipe: ${i.importancia} de 5.*`,
      ].join('\n'),
    )
    .join('\n\n');
}

function secaoEmpresa(d: DadosPacote): string {
  const linhas = ['## A empresa', '', `**Nome:** ${d.empresaNome}`, ''];

  if (d.empresaDescricao && d.empresaDescricao.trim()) {
    linhas.push(
      '**O que ela faz, nas palavras de quem a cadastrou:**',
      '',
      d.empresaDescricao.trim(),
    );
  } else {
    /* IA-VAZIO-007: o nome não serve como base para raciocinar sobre
       o negócio — uma loja de bairro pode se chamar "Nike", e o
       modelo tem conhecimento de mundo farto sobre a Nike de
       verdade. Sem descrição, o silêncio seria preenchido por
       suposição — e numa IA de fora, sem as nossas travas, com
       ainda mais confiança. */
    linhas.push(
      '**O que ela faz:** não foi preenchido na plataforma.',
      '',
      '> Não deduza o ramo da empresa a partir do nome. Nomes se repetem, e',
      '> uma empresa pequena pode ter o mesmo nome de uma marca conhecida.',
      '> Se precisar dessa informação, pergunte antes de assumir.',
    );
  }

  return linhas.join('\n');
}

/* O cabeçalho é curto de propósito. Não há mais duas categorias
   para explicar: tudo que está no arquivo tem o mesmo peso. */
function comoLer(): string {
  return [
    '## Como ler este documento',
    '',
    'Tudo neste arquivo é **decisão fechada** deste projeto: o que a equipe',
    'já validou e considera fato. Não há rascunho, hipótese ou possibilidade',
    'aqui dentro — o que ainda estava em aberto foi deixado de fora de',
    'propósito (ver o final do documento).',
    '',
    'Então você pode se apoiar em tudo o que está aqui, sem ressalva.',
    '',
    'O que você **não** pode fazer é preencher o que falta. Se precisar de',
    'algo que não consta, pergunte — não invente, e não deduza a partir do',
    'nome da empresa ou do setor.',
  ].join('\n');
}

/* Não é rodapé decorativo: é o que impede a IA de tratar a ausência
   como esquecimento e "ajudar" preenchendo (PACOTE-CONT-004). */
function limites(): string {
  return [
    '## O que este pacote não contém, e por quê',
    '',
    'As idéias que ainda estão **em aberto** neste projeto — as que a equipe',
    'ainda não validou — **não** entram neste arquivo. Isso é deliberado.',
    '',
    'Uma hipótese que ainda está sendo testada, lida por uma IA, vira',
    'facilmente uma premissa de trabalho — e o que era dúvida acaba dentro',
    'do que se constrói, sem que ninguém tenha decidido isso. Se aquilo',
    'ainda não foi validado, ainda não deve influenciar o desenvolvimento.',
    '',
    'Também ficam de fora:',
    '',
    '- As **tarefas** de cada idéia e o conteúdo dos **quadros de trabalho**,',
    '  onde a pesquisa é anotada enquanto acontece.',
    '- As **conversas com o assistente** da plataforma, que são privadas de',
    '  cada pessoa.',
    '- Qualquer coisa de outras empresas ou de outros projetos.',
    '',
    'Se o que você precisa está numa dessas categorias, peça à pessoa — ela',
    'tem acesso e pode validar ou trazer a informação.',
  ].join('\n');
}

/* Projeto sem nenhuma idéia validada é um caso real e precisa ser
   dito em voz alta. O arquivo continua sendo gerado — a empresa
   ainda é contexto legítimo —, mas calar sobre o vazio faria a IA
   assumir que o projeto simplesmente não tem muito a dizer, em vez
   de entender que ele ainda não decidiu nada (PACOTE-VERD-005). */
function avisoSemValidadas(): string {
  return [
    '> **Este projeto ainda não validou nenhuma idéia.**',
    '>',
    '> Não há decisão fechada para se apoiar. O que existe abaixo é apenas o',
    '> contexto da empresa. Trate qualquer proposta sua como ponto de partida',
    '> para discussão, não como desdobramento de algo já decidido — e diga',
    '> isso à pessoa.',
  ].join('\n');
}

function dataLegivel(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function montarPacote(d: DadosPacote): string {
  const validadas = d.ideias.filter((i) => ehVerdadeValidada(i.status));

  const partes = [
    `# ${d.empresaNome} — ${d.projetoNome}`,
    '',
    `> Pacote de contexto gerado pela Plataforma de Design em ${dataLegivel(d.geradoEm)}.`,
    '> Reúne o que este projeto já deu por decidido, para que uma IA de sua',
    '> escolha trabalhe com o mesmo entendimento que a equipe tem.',
    '',
  ];

  if (!validadas.length) partes.push(avisoSemValidadas(), '');

  partes.push(
    comoLer(),
    '',
    secaoEmpresa(d),
    '',
    '## O projeto',
    '',
    `**Nome:** ${d.projetoNome}`,
    '',
    '## Decisões validadas do projeto',
    '',
    validadas.length
      ? listar(validadas)
      : '*Nenhuma até agora — ver o aviso no início deste documento.*',
    '',
    limites(),
    '',
  );

  return partes.join('\n');
}

/* O nome do arquivo que a pessoa vai ver na pasta de downloads.
   Acento e barra viram problema em alguns sistemas — e uma barra
   viraria caminho, não nome. */
export function nomeDoArquivo(empresaNome: string, projetoNome: string, geradoEm: Date): string {
  const limpar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'projeto';

  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${geradoEm.getFullYear()}-${p(geradoEm.getMonth() + 1)}-${p(geradoEm.getDate())}`;

  return `contexto-${limpar(empresaNome)}-${limpar(projetoNome)}-${data}.md`;
}
