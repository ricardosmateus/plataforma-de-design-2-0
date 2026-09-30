/* ============================================================
   Avaliação — a nota acompanha o destino do texto (IA-AVAL-011/012)
   ============================================================
   Saiu de `rotas/ideias.ts` em 30/09/2026 (planejamento-jev-tarefas.md
   §4.2): a tarefa gerada precisa da mesma regra, e duas cópias dela
   divergiriam no primeiro ajuste.

   Registro paralelo — nunca derruba a edição nem a exclusão.
   ============================================================ */

import { db } from '../../db.js';

export type AlvoAvaliavel = 'ideia' | 'tarefa';

export function marcarAvaliacao(alvoTipo: AlvoAvaliavel, alvoId: string, estado: 'desatualizada' | 'excluida'): void {
  void db.avaliacaoIa
    .updateMany({ where: { alvoTipo, alvoId, estado: 'ativa' }, data: { estado } })
    .catch((e: unknown) => console.error(`[avaliacao] falha ao marcar a nota (${alvoTipo}) como ${estado}`, e));
}
