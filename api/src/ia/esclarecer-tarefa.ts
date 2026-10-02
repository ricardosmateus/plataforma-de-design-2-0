/* ============================================================
   "Deixar mais clara com IA" — ATV-TAR-CRIA-010 (PURO)
   ============================================================
   A frente 2 (01/10/2026). A régua do gerador mostrou que as tarefas
   GERADAS já são claras; a ambiguidade vem das escritas por PESSOAS —
   "Concorrentes", "Preço", "Pesquisar outras logitechs". No modal,
   quando a descrição é curta ou vaga, a IA sugere uma versão mais
   clara, no mesmo estilo do gerador (ATV-GERAR-024), e a PESSOA decide.

   Decisões do Ricardo (01/10/2026):
   - a sugestão aparece SÓ quando a descrição for curta ou vaga;
   - salvar sem usá-la salva normalmente, sem perguntar nada;
   - vale para todos os tipos que têm descrição (hoje, só a Pesquisa).

   `ehDescricaoVaga` tem uma CÓPIA em atividade.html (a tela decide se
   mostra o convite sem ir ao servidor). As duas são testadas com os
   mesmos casos: tests/esclarecer-tarefa.test.ts e
   ferramentas/provar-esclarecer.mjs.
   ============================================================ */

export const PALAVRAS_MINIMAS = 8;
export const PALAVRAS_SEM_PERGUNTA = 15;

function palavras(t: string): number {
  return String(t ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Curta (menos de 8 palavras) ou vaga (sem pergunta e com menos de 15).
 * Simples de propósito: é só o convite para a sugestão, e errar para
 * o lado de mostrar custa um clique que a pessoa pode ignorar.
 */
export function ehDescricaoVaga(descricao: string): boolean {
  const texto = String(descricao ?? '').trim();
  if (!texto) return false;
  const n = palavras(texto);
  return n < PALAVRAS_MINIMAS || (!texto.includes('?') && n < PALAVRAS_SEM_PERGUNTA);
}

/** O pedido ao gerador: REESCREVER a tarefa da pessoa, não propor outra. */
export function instrucaoEsclarecer(titulo: string, descricao: string): string {
  return [
    'A PESSOA JÁ ESCREVEU ESTA TAREFA, e ela está curta ou vaga:',
    `Título: ${String(titulo ?? '').trim() || '(sem título)'}`,
    `Descrição: ${String(descricao ?? '').trim()}`,
    '',
    /* Desde a E3 da Conversa: as regras do TIPO desta tarefa, que estão no
       prompt do gerador — a Pesquisa e a Conversa pedem coisas diferentes. */
    'NÃO proponha outra tarefa. Reescreva ESTA, com a mesma intenção, seguindo as regras do tipo dela (acima).',
    'Se ela puder ser lida de dois jeitos, escolha a leitura mais provável para esta atividade e deixe-a explícita.',
    'Mantenha os nomes que a pessoa usou, corrigindo só a grafia (por exemplo, "logitechs" → "Logitech").',
    'Responda no mesmo formato JSON; o título pode continuar o da pessoa.',
  ].join('\n');
}
