/* ============================================================
   Calibração do JEV — analisar as marcações
   ============================================================
   Rodar:  pbpaste | npm run calibrar:analisar -- -        (depois de "Copiar marcações")
           npm run calibrar:analisar -- ~/Downloads/marcacoes-jev-AAAA-MM-DD.json

   Regras: ia-avaliacao.md, IA-AVAL-014 · Plano §7, Fase 1

   Junta o que a pessoa marcou na página de `calibrar:exportar` com
   as notas gravadas em `avaliacoes_ia` e mostra:
     · quanto a faixa do JEV concorda com a da pessoa (e onde erra);
     · que cortes de faixa concordariam mais;
     · para cada alerta (inventa fato, genérica, duplicada), acerto,
       precisão e revocação no limiar de hoje e o limiar sugerido.

   NÃO muda nenhum número do código. Grava o relatório em
   `calibracao/relatorio-AAAA-MM-DD.md` para ser lido, discutido e,
   se aprovado, registrado em ia-avaliacao.md (IA-AVAL-014).
   ============================================================ */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';
import { analisar, lerMarcacoes, secaoRelatorio, type LinhaAvaliada } from '../src/ia/avaliacao/calibracao.js';
import type { Criterio } from '../src/ia/avaliacao/normalizar.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error('Uso: pbpaste | npm run calibrar:analisar -- -');
    console.error('  ou: npm run calibrar:analisar -- <arquivo de marcações .json>');
    process.exitCode = 1;
    return;
  }
  /* "-" lê da entrada padrão: é o caminho do botão "Copiar marcações". */
  let texto: string;
  try {
    texto = arquivo === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(arquivo), 'utf8');
  } catch {
    console.error(`Não encontrei o arquivo ${arquivo}. Use "Copiar marcações" na página e rode: pbpaste | npm run calibrar:analisar -- -`);
    process.exitCode = 1;
    return;
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    console.error('O conteúdo não é o JSON de marcações. Clique em "Copiar marcações" de novo e rode o comando logo em seguida.');
    process.exitCode = 1;
    return;
  }
  const marcacoes = lerMarcacoes(bruto);
  if (!marcacoes.length) {
    console.error('O arquivo não tem nenhuma etapa marcada.');
    process.exitCode = 1;
    return;
  }

  const avaliacoes = await db.avaliacaoIa.findMany({ where: { id: { in: marcacoes.map((m) => m.id) } } });
  const linhas: LinhaAvaliada[] = avaliacoes.map((a) => ({
    id: a.id,
    geral: a.geral,
    faixa: a.faixa,
    avaliador: a.avaliador,
    criterios: (a.criterios ?? {}) as Record<string, Criterio>,
  }));

  const r = analisar(linhas, marcacoes);
  const origem = arquivo === '-' ? 'área de transferência' : `\`${arquivo}\``;
  const md = `# Calibração do JEV — ${new Date().toISOString().slice(0, 10)}\n\n` +
    secaoRelatorio(r, 'Marcações da pessoa', `Marcações: ${origem}`) +
    '\nNada foi alterado no código. Se os números convencerem, registre a decisão em `ia-avaliacao.md` (IA-AVAL-014) e ajuste `normalizar.ts`.\n';

  const pasta = join(raiz, 'calibracao');
  mkdirSync(pasta, { recursive: true });
  const saida = join(pasta, `relatorio-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(saida, md);

  console.log('\n' + md);
  console.log(`Relatório gravado em:\n  ${saida}\n`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
