/* ============================================================
   A estrutura de um schema Prisma — para a guarda de sincronia
   ============================================================
   Pura, sem importar o Prisma: é usada por `db.ts` na partida e
   testada em `testes/schema-sincronia.test.ts` sem precisar do
   engine nem do banco.

   Devolve o conjunto `Model.campo` e `Enum.valor`. Comentários (de
   bloco e de linha) e atributos de bloco (`@@map`, `@@index`) ficam
   de fora — o `prisma generate` reformata comentários na cópia que
   guarda dentro do client, e comparar texto dispararia à toa.
   ============================================================ */

export function estruturaDoSchema(texto: string): Set<string> {
  const semBlocos = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  const itens = new Set<string>();
  let bloco: string | null = null;
  for (const bruta of semBlocos.split('\n')) {
    const linha = bruta.replace(/\/\/.*$/, '').trim();
    if (!linha) continue;
    const abre = linha.match(/^(model|enum)\s+(\w+)\s*\{/);
    if (abre) { bloco = abre[2] ?? null; continue; }
    if (linha.startsWith('}')) { bloco = null; continue; }
    if (!bloco || linha.startsWith('@@')) continue;
    const nome = linha.split(/\s+/)[0] ?? '';
    if (/^\w+$/.test(nome)) itens.add(`${bloco}.${nome}`);
  }
  return itens;
}
