/* ============================================================
   Verificação de procedência — IA-GARANT-003/004
   ============================================================
   Regras: Regras_de_negocio/modulos/ia/ia-assistente-conhecimento.md

   Esta é a camada que faz a regra do Ricardo valer de verdade.

   As instruções no prompt pedem ao modelo que não trate hipótese
   como verdade. Isso funciona quase sempre — e falha exatamente
   quando o texto da idéia é convincente. Aqui não se pede nada: o
   servidor confere, contra o banco, o status real de cada idéia que
   a resposta citou.

   É o mesmo princípio que já governa todas as rotas da plataforma:
   a tela decide o que mostrar, o SERVIDOR decide o que vale.

   O que esta camada NÃO faz: reescrever o texto do modelo
   (IA-GARANT-005). Servidor que corrige a resposta vira coautor
   dela, e aí ninguém mais consegue auditar o que veio de onde. Ela
   marca, rebaixa ou recusa — nunca edita.
   ============================================================ */

import { ehVerdadeValidada, type IdeiaContexto, type TarefaContexto } from './contexto.js';

export type FonteCrua = { ideiaId?: unknown; tarefaId?: unknown; categoria?: unknown };

export type FonteVerificada = {
  /* De que bloco a fonte veio. Tarefa e sempre material de consulta. */
  tipo: 'ideia' | 'tarefa';
  /* O id da fonte, seja ela idéia ou tarefa. */
  id: string;
  /* Mantido para quem já lia este campo; null quando a fonte é tarefa. */
  ideiaId: string | null;
  /* O que o modelo alegou */
  categoriaAlegada: 'validada' | 'hipotese';
  /* O que o banco diz */
  categoriaReal: 'validada' | 'hipotese';
  /* true quando o modelo alegou 'validada' para algo que não está
     em `Finalizado`. É o caso que a regra existe para pegar. */
  rebaixada: boolean;
};

export type Veredito =
  | { ok: true; fontes: FonteVerificada[]; houveRebaixamento: boolean }
  /* Fonte fora do projeto: id inventado ou, pior, vazamento.
     Nenhum dos dois pode chegar ao usuário — IA-GARANT-004. */
  | { ok: false; motivo: 'fonte-fora-do-projeto'; idsEstranhos: string[] };

function normalizarCategoria(v: unknown): 'validada' | 'hipotese' {
  /* Qualquer coisa que não seja exatamente 'hipotese' é tratada
     como alegação de verdade. É a leitura mais severa de propósito:
     um valor malformado não pode virar um passe livre. */
  return v === 'hipotese' ? 'hipotese' : 'validada';
}

/**
 * Confere as fontes citadas contra as idéias que realmente foram ao
 * contexto. `ideiasDoContexto` é a MESMA lista que `contexto.ts`
 * usou — não uma nova consulta —, então qualquer id fora dela é, por
 * definição, algo que o modelo não tinha como conhecer legitimamente.
 */
export function verificar(
  fontesCruas: unknown,
  ideiasDoContexto: IdeiaContexto[],
  tarefasDoContexto: TarefaContexto[] = [],
): Veredito {
  const porId = new Map(ideiasDoContexto.map((i) => [i.id, i]));
  const tarefaPorId = new Map(tarefasDoContexto.map((t) => [t.id, t]));

  const lista: FonteCrua[] = Array.isArray(fontesCruas) ? (fontesCruas as FonteCrua[]) : [];

  const fontes: FonteVerificada[] = [];
  const idsEstranhos: string[] = [];
  const jaVistos = new Set<string>();

  for (const bruta of lista) {
    const idTarefa = typeof bruta?.tarefaId === 'string' ? bruta.tarefaId : null;
    const idIdeia = typeof bruta?.ideiaId === 'string' ? bruta.ideiaId : null;

    /* Uma entrada cita idéia OU tarefa. Se vier com as duas, a tarefa
       manda: ela é a leitura mais conservadora — resultado de tarefa
       nunca pode ser afirmado como verdade validada. */
    const id = idTarefa ?? idIdeia;
    if (!id) continue; // entrada malformada: ignora, não derruba a resposta

    const ehTarefa = idTarefa !== null;
    const achou = ehTarefa ? tarefaPorId.has(id) : porId.has(id);

    /* IA-GARANT-004 vale igual para tarefa: id que não estava no
       contexto é invenção ou vazamento, e derruba a resposta. */
    if (!achou) {
      idsEstranhos.push(id);
      continue;
    }

    if (jaVistos.has(id)) continue;
    jaVistos.add(id);

    const categoriaAlegada = normalizarCategoria(bruta?.categoria);

    /* IA-CONHEC-007: uma tarefa vale como verdade quando a ATIVIDADE
       dela foi finalizada — porque finalizar e o ato pelo qual uma
       pessoa declara validado o que a atividade produziu. Fora disso
       segue hipotese. A decisao nao e tomada aqui: `validada` veio da
       mesma `ehVerdadeValidada` aplicada ao status da ideia, na
       consulta que montou o contexto. */
    const categoriaReal: 'validada' | 'hipotese' = ehTarefa
      ? tarefaPorId.get(id)!.validada
        ? 'validada'
        : 'hipotese'
      : ehVerdadeValidada(porId.get(id)!.status)
        ? 'validada'
        : 'hipotese';

    fontes.push({
      tipo: ehTarefa ? 'tarefa' : 'ideia',
      id,
      ideiaId: ehTarefa ? null : id,
      categoriaAlegada,
      categoriaReal,
      /* O rebaixamento só acontece numa direção. Alegar 'hipotese'
         para algo que está finalizado é conservador demais, não
         perigoso — e não é papel desta camada promover nada. */
      rebaixada: categoriaAlegada === 'validada' && categoriaReal === 'hipotese',
    });
  }

  if (idsEstranhos.length) {
    return { ok: false, motivo: 'fonte-fora-do-projeto', idsEstranhos };
  }

  return {
    ok: true,
    fontes,
    houveRebaixamento: fontes.some((f) => f.rebaixada),
  };
}

/**
 * IA-VAZIO-001: a resposta saiu sem nenhuma verdade validada por
 * trás? Vale tanto para "o projeto não tem nada em Finalizado"
 * quanto para "tem, mas a resposta não usou".
 */
export function semVerdadeValidada(fontes: FonteVerificada[]): boolean {
  return !fontes.some((f) => f.categoriaReal === 'validada');
}

/* ============================================================
   Ação proposta — IA-ACAO-002/005
   ============================================================
   O modelo pode propor criar, editar ou mover uma idéia, mas a
   proposta chega aqui como dado NÃO CONFIÁVEL — igual a `fontes`. A
   diferença é que uma fonte errada só distorce o que o texto alega
   ter usado; uma ação mal verificada escreveria no quadro de
   verdade. Por isso a régua aqui é a MESMA da rota de criação/edição
   de idéias (IDEIA-CRIA-001, 60/280 caracteres, importância 0-5) —
   duplicada de propósito, não importada, pelo mesmo motivo já
   registrado em ideias.ts: nenhum dos dois módulos tem por que
   depender do outro existir.

   O que esta função NÃO faz: gravar nada. Ela só decide se a
   proposta é coerente o bastante para virar um "pendente" que a
   pessoa pode ver e confirmar. A escrita de verdade mora na rota de
   confirmação, que confere tudo de novo contra o banco no momento da
   confirmação (IA-ACAO-005) — o que está aqui pode estar
   desatualizado assim que a resposta chega à tela.
   ============================================================ */

const STATUS_VALIDOS = new Set(['ideias', 'andamento', 'finalizado']);

export type AcaoVerificada =
  | { tipo: 'criar_ideia'; titulo: string; descricao: string; importancia: number }
  | { tipo: 'editar_ideia'; ideiaId: string; titulo: string; descricao: string; importancia: number }
  | { tipo: 'mover_ideia'; ideiaId: string; status: 'ideias' | 'andamento' | 'finalizado' };

function titulo(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length > 0 && t.length <= 60 ? t : null;
}

function descricao(v: unknown): string | null {
  const d = typeof v === 'string' ? v.trim() : '';
  return d.length > 0 && d.length <= 280 ? d : null;
}

/* Igual à regra de IDEIA-CRIA-002: 0 é valor legítimo ("sem
   prioridade definida"), e ausente também vira 0 — nunca recusa a
   proposta inteira por faltar este campo opcional. */
function importancia(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? v : null;
}

/**
 * Confere a proposta de ação contra as MESMAS idéias que foram ao
 * contexto (nunca uma consulta nova — mesmo raciocínio de
 * `verificar`). Qualquer coisa que não fechar vira `null`: a proposta
 * some, mas a resposta em si não é derrubada por causa dela — a ação
 * é um extra sobre a resposta, não a base dela.
 */
export function verificarAcao(
  acaoCrua: unknown,
  ideiasDoContexto: IdeiaContexto[],
): AcaoVerificada | null {
  if (!acaoCrua || typeof acaoCrua !== 'object') return null;

  const bruta = acaoCrua as Record<string, unknown>;
  const porId = new Map(ideiasDoContexto.map((i) => [i.id, i]));

  if (bruta.tipo === 'criar_ideia') {
    const t = titulo(bruta.titulo);
    const d = descricao(bruta.descricao);
    const imp = importancia(bruta.importancia);
    if (t === null || d === null || imp === null) return null;
    return { tipo: 'criar_ideia', titulo: t, descricao: d, importancia: imp };
  }

  if (bruta.tipo === 'editar_ideia') {
    const id = typeof bruta.ideiaId === 'string' ? bruta.ideiaId : null;
    /* Mesmo princípio de IA-GARANT-004: id que não veio no contexto
       não pode virar escrita — é invenção ou vazamento. */
    if (!id || !porId.has(id)) return null;
    const t = titulo(bruta.titulo);
    const d = descricao(bruta.descricao);
    const imp = importancia(bruta.importancia);
    if (t === null || d === null || imp === null) return null;
    return { tipo: 'editar_ideia', ideiaId: id, titulo: t, descricao: d, importancia: imp };
  }

  if (bruta.tipo === 'mover_ideia') {
    const id = typeof bruta.ideiaId === 'string' ? bruta.ideiaId : null;
    if (!id || !porId.has(id)) return null;
    const status = typeof bruta.status === 'string' && STATUS_VALIDOS.has(bruta.status)
      ? (bruta.status as 'ideias' | 'andamento' | 'finalizado')
      : null;
    if (!status) return null;
    return { tipo: 'mover_ideia', ideiaId: id, status };
  }

  /* Nenhum tipo reconhecido — inclui o `null` do caso comum, em que
     nada foi pedido, e qualquer valor malformado. */
  return null;
}

/* ============================================================
   Alegação de ação sem proposta — IA-ACAO-009
   ============================================================
   A instrução em `contexto.ts` pede ao modelo para nunca dizer que
   já criou/editou/moveu um card sem propor a ação de verdade — mas
   pedir não é garantir (mesmo raciocínio de IA-GARANT-003, agora
   aplicado a ações). Na prática, um "ok" digitado depois de uma
   sugestão já produziu "Card criado!" no texto com `acao_proposta`
   nula: nada foi escrito, mas a pessoa leu que sim.

   Esta função não impede a resposta de chegar à tela — impedir
   destruiria respostas legítimas que só CITAM a palavra "criei" em
   outro sentido. Em vez disso, ela dá ao servidor um jeito de
   MARCAR a suspeita, para a tela avisar sem reescrever o texto do
   modelo (IA-GARANT-005 aplicado aqui também).
   ============================================================ */

/* Confere sem acento nem caixa: "Idéia criada", "IDEIA CRIADA" e
   "ideia criada" têm que bater no mesmo padrão. */
function normalizarTexto(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* Verbos na primeira pessoa/particípio, no sentido de "eu já fiz" —
   não captura "você criou" nem discussão em terceira pessoa, que não
   é a alegação perigosa aqui. */
const PADROES_ALEGACAO_DE_ACAO = [
  /\bcriei\b/,
  /\bcard criado\b/,
  /\bidei?a criada\b/,
  /\bja criei\b/,
  /\bmovi\b/,
  /\bja movi\b/,
  /\bcard movido\b/,
  /\bidei?a movida\b/,
  /\beditei\b/,
  /\bja editei\b/,
  /\bcard editado\b/,
  /\bidei?a editada\b/,
  /\batualizei (o|a) (card|idei?a)\b/,
];

/**
 * `temProposta` é só se ESTA resposta trouxe um `acao_proposta` que
 * sobreviveu a `verificarAcao` — nunca se uma ação antiga da
 * conversa foi confirmada depois. Com proposta de verdade junto, a
 * alegação é honesta (a pessoa vê o botão de confirmar bem ali) e
 * não há nada para marcar.
 */
export function alegaAcaoSemProposta(resposta: string, temProposta: boolean): boolean {
  if (temProposta) return false;
  const normalizado = normalizarTexto(resposta);
  return PADROES_ALEGACAO_DE_ACAO.some((padrao) => padrao.test(normalizado));
}
