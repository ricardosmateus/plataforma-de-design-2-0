/* ============================================================
   A investigação como registro — Fase 1b
   ============================================================
   Único lugar do código que toca `pesquisa_investigacoes`.

   ------------------------------------------------------------
   POR QUE ESTA TABELA EXISTE
   ------------------------------------------------------------
   Não é para "a narração sobreviver ao F5" — isso é consequência.
   O defeito real é maior: hoje o servidor TERMINA a investigação
   mesmo se a aba fechar. A busca completa, é cobrada, a consulta é
   gravada. O que some é só o cliente — e é ele quem monta o quadro.
   Resultado: fechar a aba no meio perde o resultado de uma busca
   JÁ PAGA, que está no banco o tempo todo.

   Com este registro, recarregar a página reencontra a investigação
   e o quadro nasce do que ficou gravado.

   ------------------------------------------------------------
   NOTA HISTÓRICA — o cast que existiu por algumas horas
   ------------------------------------------------------------
   Este arquivo nasceu (14/09/2026) antes de a migração rodar, e
   `db.pesquisaInvestigacao` ainda não existia no cliente do Prisma.
   Em vez de deixar o projeto inteiro sem compilar até alguém rodar
   `prisma migrate dev` — o que impediria até de revisar o resto —,
   havia aqui uma interface escrita à mão com as três operações
   usadas e UM cast contra ela. Os pontos de chamada continuavam
   tipados; o que estava desligado era só a conferência contra o
   cliente ainda não regerado.

   A migração `20260914035727_investigacao_persistida` rodou no
   mesmo dia e o cast saiu. Fica registrado porque o padrão vale
   para a próxima tabela: um cast único, nomeado e datado, é
   dívida que se paga; um `any` espalhado por três arquivos é
   dívida que apodrece.

   E ele voltou no mesmo dia, pelo mesmo motivo: o portão de
   confirmação (Fase 2) acrescentou o estado `aguardando` e as
   colunas `pergunta_busca` / `estimativa_micros`. A migração
   `20260914132503_portao_confirmacao` rodou horas depois e o cast
   saiu de novo — duas vezes no mesmo dia, pagas nas duas.
   ============================================================ */

import { db } from '../db.js';

export type EstadoInvestigacao =
  | 'correndo'
  | 'aguardando'
  | 'entregue'
  | 'parada'
  | 'falhou';

export type PassoGravado = { texto: string; em: string };

export type PlanoGravado = {
  perguntas: { pergunta: string; porque: string }[];
  ja_sabido: string[];
};

export type Investigacao = {
  id: string;
  sessaoId: string;
  tarefaId: string | null;
  pergunta: string;
  perguntaResolvida: string;
  estado: EstadoInvestigacao;
  plano: PlanoGravado | null;
  passos: PassoGravado[];
  fecho: string | null;
  perguntaBusca: string | null;
  estimativaMicros: number | null;
  consultaId: string | null;
  criadoEm: Date;
  encerradoEm: Date | null;
};

/* A linha como o banco a devolve: `plano` e `passos` são Json, e
   Json é `unknown` até alguém olhar. Quem olha são `lerPlano` e
   `lerPassos`, logo abaixo. */
type LinhaCrua = Omit<Investigacao, 'plano' | 'passos'> & { plano: unknown; passos: unknown };

/* ---- leitura tolerante do que está em Json ----
   Uma linha gravada por uma versão anterior do formato não pode
   derrubar a tela que a está lendo. Formato que não bate vira
   vazio, nunca exceção. */
function lerPassos(v: unknown): PassoGravado[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({ texto: String(p.texto ?? ''), em: String(p.em ?? '') }))
    .filter((p) => p.texto);
}

function lerPlano(v: unknown): PlanoGravado | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const perguntas = Array.isArray(o.perguntas)
    ? o.perguntas
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({ pergunta: String(p.pergunta ?? ''), porque: String(p.porque ?? '') }))
        .filter((p) => p.pergunta)
    : [];
  const jaSabido = Array.isArray(o.ja_sabido) ? o.ja_sabido.map(String).filter(Boolean) : [];
  if (!perguntas.length && !jaSabido.length) return null;
  return { perguntas, ja_sabido: jaSabido };
}

export function lerLinha(linha: LinhaCrua): Investigacao {
  return { ...linha, plano: lerPlano(linha.plano), passos: lerPassos(linha.passos) };
}

/* ------------------------------------------------------------
   Escrita
   ------------------------------------------------------------
   NADA aqui pode derrubar o stream. O registro é paralelo ao
   trabalho: se a gravação falhar, quem está esperando perde o
   histórico, não a investigação — e ela já foi paga. Mesmo
   princípio de `creditos/registro.ts`.

   As escritas de passo são SERIALIZADAS por investigação. Cada
   passo é um read-modify-write do mesmo array Json, e dois em voo
   ao mesmo tempo fariam o segundo apagar o primeiro. A fila é por
   id e some quando a investigação fecha. */
const filas = new Map<string, Promise<unknown>>();

function enfileirar(id: string, tarefa: () => Promise<unknown>): Promise<unknown> {
  const anterior = filas.get(id) ?? Promise.resolve();
  const proxima = anterior.then(tarefa, tarefa).catch((e) => {
    console.warn('[investigacao] gravação falhou, seguindo assim mesmo:', e);
  });
  filas.set(id, proxima);
  return proxima;
}

export async function abrirInvestigacao(entrada: {
  sessaoId: string;
  tarefaId: string | null;
  pergunta: string;
  perguntaResolvida: string;
}): Promise<string | null> {
  try {
    const linha = await db.pesquisaInvestigacao.create({
      data: {
        sessaoId: entrada.sessaoId,
        tarefaId: entrada.tarefaId,
        pergunta: entrada.pergunta,
        perguntaResolvida: entrada.perguntaResolvida,
        estado: 'correndo',
        passos: [],
      },
    });
    return linha.id;
  } catch (e) {
    /* Sem registro, a investigação continua — ela só não vai poder
       ser recuperada depois. Melhor do que recusar a busca por causa
       da contabilidade do histórico. */
    console.warn('[investigacao] não consegui abrir o registro:', e);
    return null;
  }
}

/* Guarda os passos em memória e regrava o array inteiro. Um `push`
   no banco exigiria SQL cru ou uma tabela por passo; com meia dúzia
   de passos por investigação, regravar é mais simples e igualmente
   correto — desde que serializado. */
const memoria = new Map<string, PassoGravado[]>();

export function anotarPasso(id: string | null, texto: string): void {
  if (!id || !texto) return;
  const lista = memoria.get(id) ?? [];
  lista.push({ texto, em: new Date().toISOString() });
  memoria.set(id, lista);
  void enfileirar(id, () => db.pesquisaInvestigacao.update({ where: { id }, data: { passos: lista } }));
}

export function anotarPlano(id: string | null, plano: PlanoGravado): void {
  if (!id) return;
  void enfileirar(id, () => db.pesquisaInvestigacao.update({ where: { id }, data: { plano } }));
}

/* ------------------------------------------------------------
   O portão de confirmação (Fase 2)
   ------------------------------------------------------------
   Entre planejar e buscar, a investigação para e espera uma pessoa.
   `aguardando` não é um fim: é o único estado que pode voltar para
   `correndo`, e é por isso que ele não passa por
   `fecharInvestigacao` — quem escreve `encerradoEm` está dizendo
   que acabou.

   Espera SEM prazo, de propósito. Um plano que expira sozinho joga
   fora um planejamento já pago, e o preço é reconferido na hora de
   confirmar de qualquer jeito (BOARD-PESQUISA-039) — então o que um
   prazo protegeria já está protegido. */
export function aguardarConfirmacao(
  id: string | null,
  dados: { perguntaBusca: string; estimativaMicros: number },
): Promise<unknown> {
  if (!id) return Promise.resolve();
  return enfileirar(id, () =>
    db.pesquisaInvestigacao.update({
      where: { id },
      data: {
        estado: 'aguardando',
        perguntaBusca: dados.perguntaBusca,
        estimativaMicros: dados.estimativaMicros,
      },
    }),
  );
}

/* A confirmação chegou: a investigação volta a correr. O preço vai
   junto porque ele pode ter sido reconferido — e o que fica gravado
   tem que ser o que vai ser cobrado, não o que foi cotado antes. */
export function retomarInvestigacao(
  id: string | null,
  estimativaMicros?: number,
): Promise<unknown> {
  if (!id) return Promise.resolve();
  return enfileirar(id, () =>
    db.pesquisaInvestigacao.update({
      where: { id },
      data:
        estimativaMicros === undefined
          ? { estado: 'correndo' }
          : { estado: 'correndo', estimativaMicros },
    }),
  );
}

export function fecharInvestigacao(
  id: string | null,
  dados: { estado: EstadoInvestigacao; fecho?: string | null; consultaId?: string | null },
): Promise<unknown> {
  if (!id) return Promise.resolve();
  const p = enfileirar(id, () =>
    db.pesquisaInvestigacao.update({
      where: { id },
      data: {
        estado: dados.estado,
        fecho: dados.fecho ?? null,
        consultaId: dados.consultaId ?? null,
        encerradoEm: new Date(),
      },
    }),
  );
  /* A fila e a memória morrem com a investigação: sem isto, um
     servidor de vida longa acumularia um array por investigação já
     encerrada, para sempre. */
  void p.then(() => {
    filas.delete(id);
    memoria.delete(id);
  });
  return p;
}

/* ------------------------------------------------------------
   Leitura — a recuperação
   ------------------------------------------------------------ */

/* A investigação por id, presa à sessão. O `sessaoId` no `where`
   não é enfeite: é ele que impede alguém de confirmar o gasto de
   uma investigação alheia com um id adivinhado. A sessão, essa sim,
   já passou por `sessaoDoDono`. */
export async function investigacaoPorId(
  id: string,
  sessaoId: string,
): Promise<Investigacao | null> {
  try {
    const linha = await db.pesquisaInvestigacao.findFirst({ where: { id, sessaoId } });
    return linha ? lerLinha(linha) : null;
  } catch (e) {
    console.warn('[investigacao] não consegui ler o registro:', e);
    return null;
  }
}
export async function ultimaInvestigacaoDaTarefa(
  sessaoId: string,
  tarefaId: string,
): Promise<Investigacao | null> {
  try {
    const linha = await db.pesquisaInvestigacao.findFirst({
      where: { sessaoId, tarefaId },
      orderBy: { criadoEm: 'desc' },
    });
    return linha ? lerLinha(linha) : null;
  } catch (e) {
    console.warn('[investigacao] não consegui ler o registro:', e);
    return null;
  }
}
