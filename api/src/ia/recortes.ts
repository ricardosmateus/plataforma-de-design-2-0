/* ============================================================
   Recortes — o texto da idéia finalizada partido por tema
   ============================================================
   Regras: Skills/categorizacao-taxonomia.skill

   A classificação já dizia QUE a idéia fala de "Mercado, Estratégia
   e Concorrentes". Não dizia ONDE. Para saber o que ela diz sobre
   concorrentes era preciso reler a atividade inteira — que é
   justamente o trabalho que a classificação existia para poupar.

   ------------------------------------------------------------
   A decisão central: o modelo ROTULA, ele não ESCREVE
   ------------------------------------------------------------
   O caminho óbvio seria pedir ao modelo "devolva o texto de
   Concorrentes". É o caminho errado, por três motivos que aparecem
   todos na tela:

     1. Ele reescreveria. O que a página mostraria não seria mais o
        que a pessoa escreveu no quadro, e o botão "editar no
        quadro" levaria a um texto que não bate com o que ela
        acabou de ler.
     2. Ele poderia inventar. Um resumo plausível de um concorrente
        que não está no material é indistinguível de um verdadeiro.
     3. Ele poderia repetir o mesmo parágrafo em dois temas — que é
        exatamente a mistura que esta funcionalidade existe para
        acabar.

   Então o modelo recebe os blocos JÁ NUMERADOS e devolve só
   números e categorias: {"blocos":[{"n":1,"c":"Concorrentes"}]}.
   O texto é montado aqui, a partir do banco. Assim:

     - o trecho é literalmente o registro de origem, sempre;
     - inventar é impossível (não há campo de texto na resposta);
     - misturar é impossível (um `n` aparece uma vez, e a UNIQUE em
       `registro_id` recusa a violação mesmo se a resposta insistir);
     - a saída é minúscula — a chamada custa quase nada, o que
       importa porque isto roda sozinho, em todo volume.
   ============================================================ */

import { env } from '../env.js';
import { db } from '../db.js';
import { lerUso, type Uso, tetoUsdMicros, custoUsdMicros } from '../creditos/precos.js';
import { registrar } from '../creditos/registro.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { reservar, liberar, consumir, SaldoInsuficiente } from '../creditos/reserva.js';
import { iaConfigurada } from './provedor.js';
import { randomUUID } from 'node:crypto';

import { CATEGORIAS } from './taxonomia-vocabulario.js';
import { enriquecerLeituraEmSegundoPlano } from './enriquecimento.js';
import { enriquecerGraficosEmSegundoPlano } from './enriquecimento-graficos.js';
import {
  escolherBlocos,
  interpretar,
  type Bloco,
} from './recortes-leitura.js';

export { interpretar };
export type { Bloco };


/* ------------------------------------------------------------
   Os blocos de uma idéia
   ------------------------------------------------------------
   Um registro = um bloco. Não parágrafo, não frase: o registro é a
   unidade que a pessoa criou, move e edita no quadro. Recortar
   abaixo dele produziria trechos que não existem em lugar nenhum
   para serem corrigidos.
   ------------------------------------------------------------ */
export async function blocosDaIdeia(ideiaId: string): Promise<Bloco[]> {
  const tarefas = await db.tarefa.findMany({
    where: { ideiaId },
    orderBy: { ordem: 'asc' },
    include: {
      quadros: {
        orderBy: { ordem: 'asc' },
        include: {
          colunas: {
            orderBy: { ordem: 'asc' },
            include: { registros: { orderBy: { ordem: 'asc' } } },
          },
        },
      },
    },
  });

  /* Só a leitura mora aqui. Qual registro vira bloco é decisão, e
     ela vive em `escolherBlocos` (recortes-leitura.ts), testável sem
     banco — inclusive o piso de `MINIMO_UTIL`, que vale por quadro
     e não por idéia. */
  return escolherBlocos(
    tarefas.flatMap((t) =>
      t.quadros.map((q) => ({
        id: q.id,
        titulo: q.titulo,
        tarefaId: t.id,
        colunas: q.colunas.map((c) => ({ registros: c.registros })),
      })),
    ),
  );
}

/* ------------------------------------------------------------
   A chamada ao provedor
   ------------------------------------------------------------
   Só a parte fixa entra em cache: a lista de categorias muda por
   idéia (é o `assunto` + `tags` daquela idéia), então ela vai na
   mensagem do usuário, junto com os blocos.
   ------------------------------------------------------------ */
const SISTEMA = [
  'Você separa o conteúdo de uma atividade de Product Design por tema.',
  '',
  'Recebe blocos numerados e uma lista de temas. Para cada bloco, diz a',
  'qual tema ele pertence — ou omite o bloco, se ele não pertencer a',
  'nenhum.',
  '',
  'Responda SOMENTE com JSON, sem cercas de código e sem comentários:',
  '{"blocos":[{"n":1,"c":"<tema>"},{"n":2,"c":"<tema>"}]}',
  '',
  'Regras:',
  '- "c" é copiado literalmente de um dos temas oferecidos. Nunca invente tema.',
  '- Cada bloco aparece NO MÁXIMO UMA VEZ. Um bloco pertence a um tema só.',
  '- Bloco que não trata claramente de nenhum dos temas fica DE FORA.',
  '  Omitir é a resposta certa nesse caso, não escolher o tema mais próximo:',
  '  um trecho fora de tema polui a página do tema para sempre.',
  '- Não escreva, não resuma e não reescreva os blocos. Só numere e rotule.',
].join('\n');

export type DiagnosticoRecortes = {
  /* registroId → categoria. Vazio não é falha: uma atividade pode
     não ter bloco nenhum que se enquadre. */
  porRegistro: Map<string, string>;
  motivo: 'ok' | 'sem-ia' | 'sem-blocos' | 'rede' | 'recusa-http' | 'vazio' | 'ilegivel';
  bruto: string;
  uso?: Uso;
  modelo?: string;
  requisicaoId?: string;
};

export async function segmentarComDiagnostico(
  blocos: Bloco[],
  categorias: string[],
): Promise<DiagnosticoRecortes> {
  const vazio = new Map<string, string>();

  if (!blocos.length) return { porRegistro: vazio, motivo: 'sem-blocos', bruto: '' };
  if (env.IA_DRIVER !== 'anthropic' || !env.IA_API_KEY || !env.IA_MODELO) {
    return { porRegistro: vazio, motivo: 'sem-ia', bruto: '' };
  }

  /* Só as categorias que a classificação atribuiu a ESTA idéia. Um
     tema que a idéia não tem não pode ganhar recorte: apareceria no
     mapa uma pasta que a classificação não declarou. */
  const permitidas = categorias.filter((c) => CATEGORIAS.includes(c));
  if (!permitidas.length) return { porRegistro: vazio, motivo: 'sem-blocos', bruto: '' };

  const texto = [
    'Temas: ' + permitidas.join(', '),
    '',
    ...blocos.map((b) => `[${b.n}]\n${b.texto}`),
  ].join('\n\n');

  let resposta: Response;
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.IA_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.IA_MODELO,
        /* A saída é uma lista de pares número/tema: ~15 tokens por
           bloco. Com o teto de 80 blocos, 2048 sobra. */
        max_tokens: 2048,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: texto.slice(0, 60000) },
          /* Mesmo pré-preenchimento da classificação: sem lugar por
             onde escrever saudação ou cerca de código. */
          { role: 'assistant', content: '{"blocos":[' },
        ],
      }),
    });
  } catch {
    return { porRegistro: vazio, motivo: 'rede', bruto: '' };
  }

  if (!resposta.ok) {
    return {
      porRegistro: vazio,
      motivo: 'recusa-http',
      bruto: await resposta.text().catch(() => ''),
    };
  }

  const corpo = (await resposta.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
  };

  const medicao = {
    uso: lerUso(corpo.usage),
    modelo: env.IA_MODELO,
    requisicaoId: resposta.headers.get('request-id') ?? undefined,
  };

  const bruto = ('{"blocos":[' + (corpo.content ?? [])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')).trim();

  if (bruto === '{"blocos":[') {
    return { porRegistro: vazio, motivo: 'vazio', bruto, ...medicao };
  }

  const lido = interpretar(bruto, blocos, permitidas);
  if (lido === null) {
    return { porRegistro: vazio, motivo: 'ilegivel', bruto, ...medicao };
  }
  return { porRegistro: lido, motivo: 'ok', bruto, ...medicao };
}

/* Apagar é barato e não pode falhar — mesma assimetria de
   `limparTaxonomia`. O que saiu de "finalizado" some do mapa E das
   páginas de tema na mesma escrita: um recorte sobrevivente
   mostraria, numa página pública da empresa, texto que a pessoa
   acabou de retirar de lá. */
export function apagarRecortes(ideiaId: string) {
  return db.recorteTaxonomia.deleteMany({ where: { ideiaId } });
}

/* ------------------------------------------------------------
   Segmentar e gravar
   ------------------------------------------------------------
   Roda depois de uma classificação bem-sucedida, no mesmo disparo em
   segundo plano. Cobra como `classificacao` de propósito: é o custo
   de classificar aquela idéia, e a pergunta que chega depois
   ("quanto custou classificar?") deve ter uma resposta só.
   ------------------------------------------------------------ */
export async function segmentarIdeiaEmSegundoPlano(ideiaId: string): Promise<void> {
  try {
    const ideia = await db.ideia.findUnique({
      where: { id: ideiaId },
      select: {
        id: true, status: true, arquivadoEm: true,
        assunto: true, tags: true,
        criadoPor: true, projetoId: true,
        projeto: { select: { empresaId: true } },
      },
    });
    /* As três saídas abaixo são as únicas que terminam a segmentação
       sem chamar o modelo — e portanto sem custo, sem registro em
       `creditos` e, até aqui, sem log. Era isso que tornava a pasta
       vazia impossível de diagnosticar em produção: o sintoma
       aparecia na tela e o servidor não dizia uma palavra. Cada uma
       agora se anuncia, com o motivo exato. */
    if (!ideia || ideia.status !== 'finalizado' || ideia.arquivadoEm) {
      console.warn(`[recortes] ${ideiaId} fora de "finalizado" ou arquivada — não segmentou`);
      return;
    }

    const categorias = [ideia.assunto, ...(ideia.tags ?? [])].filter(
      (c): c is string => typeof c === 'string' && c.trim() !== '',
    );
    if (!categorias.length) {
      console.warn(`[recortes] ${ideia.id} sem assunto nem tags — recortes apagados`);
      await apagarRecortes(ideia.id);
      return;
    }

    const blocos = await blocosDaIdeia(ideia.id);
    if (!blocos.length) {
      /* Sem conteúdo nos quadros não há o que recortar. Apagar o que
         existia é o certo: os quadros podem ter sido esvaziados, e o
         recorte antigo passaria a citar texto que não existe mais. */
      console.warn(
        `[recortes] ${ideia.id} sem blocos aproveitáveis ` +
          '(idéia sem tarefas, quadros vazios ou só "Perguntas em aberto") — recortes apagados',
      );
      await apagarRecortes(ideia.id);
      return;
    }

    console.info(
      `[recortes] ${ideia.id} segmentando ${blocos.length} bloco(s) em [${categorias.join(', ')}]`,
    );

    /* Mesma reserva da classificação (IA-CUSTO-002). Sem saldo, a
       segmentação simplesmente não acontece agora — a idéia fica
       classificada e sem recortes, que é um estado válido: as
       páginas de tema mostram o que existe. */
    const operacaoId = randomUUID();
    let tetoTotalMicros = 0;
    const usuarioId = ideia.criadoPor;

    if (iaConfigurada() && env.CREDITOS_COBRAR === 'sim' && usuarioId) {
      const amostra = blocos.map((b) => b.texto).join('\n\n').slice(0, 60000);
      const tetoUsd = tetoUsdMicros(env.IA_MODELO as string, amostra, 2048);

      if (tetoUsd === null) {
        console.warn(`[recortes] ${ideia.id} sem preço de tabela para o modelo — não segmentou`);
        return;
      }

      const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
      tetoTotalMicros = comissaoSobre(usdParaMicrosBrl(tetoUsd, cotacao)).totalMicros;

      try {
        await reservar(usuarioId, tetoTotalMicros, operacaoId, 'classificacao');
      } catch (e) {
        if (e instanceof SaldoInsuficiente) {
          console.warn(`[recortes] ${ideia.id} não segmentada (sem saldo)`);
          return;
        }
        throw e;
      }
    }

    const d = await segmentarComDiagnostico(blocos, categorias);

    if (d.uso && d.modelo) {
      registrar({
        usuarioId: ideia.criadoPor,
        empresaId: ideia.projeto?.empresaId ?? null,
        projetoId: ideia.projetoId,
        ideiaId: ideia.id,
        tipo: 'classificacao',
        resultado: d.motivo === 'ok' ? 'entregue' : 'descartado',
        modelo: d.modelo,
        uso: d.uso,
        requisicaoId: d.requisicaoId,
        operacaoId,
      });
    }

    if (tetoTotalMicros > 0 && usuarioId) {
      await liberar(usuarioId, tetoTotalMicros, operacaoId, 'classificacao');

      if (d.motivo === 'ok' && d.uso && d.modelo) {
        const usdReal = custoUsdMicros(d.modelo, d.uso);
        if (usdReal !== null) {
          const cotacao = cotacaoParaMilesimos(env.COTACAO_USD_BRL);
          const totalReal = comissaoSobre(usdParaMicrosBrl(usdReal, cotacao)).totalMicros;
          if (totalReal > 0) {
            await consumir(usuarioId, totalReal, operacaoId, 'classificacao');
          }
        }
      }
    }

    /* Rede fora ou provedor recusando NÃO apaga o que já existia:
       mesmo raciocínio da classificação — um soluço de conexão não
       pode esvaziar as páginas de tema de ninguém. */
    if (
      d.motivo === 'rede' ||
      d.motivo === 'recusa-http' ||
      d.motivo === 'sem-ia' ||
      d.motivo === 'ilegivel' ||
      d.motivo === 'vazio'
    ) {
      /* `ilegivel` e `vazio` entram aqui, e é uma escolha diferente
         da que a classificação faz para o caso equivalente.

         Lá, apagar é seguro: a idéia cai no balde "Sem categoria",
         que aparece na tela com um botão de tentar de novo. A falha
         fica VISÍVEL.

         Aqui não existe balde. Uma página de tema esvaziada por uma
         resposta que não deu para ler é indistinguível de um tema
         sobre o qual nunca se escreveu nada — e ninguém vai
         desconfiar de um vazio que parece normal. Preservar o que
         estava é o único jeito de a falha não virar dano invisível;
         a próxima finalização ou correção de pasta tenta de novo. */
      console.warn(`[recortes] ${ideia.id} não segmentada (${d.motivo}) — mantendo o que estava`);
      return;
    }

    const porOrdem = blocos.filter((b) => d.porRegistro.has(b.registroId));

    /* Troca atômica. Sem a transação existiria uma janela — curta, e
       exatamente durante a leitura mais provável, logo depois de
       finalizar — em que a página do tema abriria vazia. */
    await db.$transaction([
      db.recorteTaxonomia.deleteMany({ where: { ideiaId: ideia.id } }),
      ...(porOrdem.length
        ? [
            db.recorteTaxonomia.createMany({
              data: porOrdem.map((b, i) => ({
                ideiaId: ideia.id,
                categoria: d.porRegistro.get(b.registroId) as string,
                texto: b.texto,
                tarefaId: b.tarefaId,
                quadroId: b.quadroId,
                registroId: b.registroId,
                ordem: i,
              })),
            }),
          ]
        : []),
    ]);

    /* A idéia pode ter saído de "finalizado" durante a chamada ao
       modelo. A limpeza que roda no `status` já apagou os recortes
       antigos; os que acabamos de gravar são novos e ela não os viu.
       Reler o status e desfazer é o que fecha essa corrida. */
    const aindaFinalizada = await db.ideia.count({
      where: { id: ideia.id, status: 'finalizado', arquivadoEm: null },
    });
    if (aindaFinalizada === 0) {
      await apagarRecortes(ideia.id);
      console.warn(`[recortes] ${ideia.id} saiu de finalizado durante a segmentação`);
    } else {
      /* Terceira etapa da cadeia (Documentacao/enriquecimento-tema.md):
         para cada categoria que esta idéia toca, o TEMA inteiro pode
         ter mudado (recorte novo, recorte que sumiu). Sem `await` —
         mesmo padrão de disparo em segundo plano de sempre: gerar a
         leitura guiada é mais uma etapa cara e opcional, e não pode
         atrasar a resposta que já terminou de gravar os recortes.
         Cada chamada confere seu próprio fingerprint e decide sozinha
         se há algo novo para reler. */
      const empresaId = ideia.projeto?.empresaId;
      if (empresaId) {
        for (const categoria of categorias) {
          void enriquecerGraficosEmSegundoPlano(empresaId, categoria, ideia.criadoPor);
          void enriquecerLeituraEmSegundoPlano(empresaId, categoria, ideia.criadoPor);
        }
      }
    }
  } catch (e) {
    /* Falhar aqui é aceitável e não pode escalar: a idéia fica
       classificada, só sem os recortes, até a próxima vez que entrar
       em "finalizado". */
    console.error('[recortes] falha ao segmentar', ideiaId, e);
  }
}
