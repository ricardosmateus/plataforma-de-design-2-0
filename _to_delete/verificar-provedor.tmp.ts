import { loadEnvFile } from 'node:process';

async function main() {
  loadEnvFile();
  const { criarBuscaClaude } = await import('./src/pesquisa/provedor-claude-busca.js');
  const p = criarBuscaClaude();
  if (!p) { console.error('não construiu — falta IA_API_KEY ou IA_MODELO'); return; }

  const r = await p.buscar('Quantas unidades a Starbucks tem no Brasil e em quais regiões?');

  console.log('--- ERRO ---'); console.log(r.erro ?? '(nenhum)');
  console.log('\n--- RESPOSTA ---'); console.log(r.resposta);
  console.log('\n--- FONTES ---');
  for (const f of r.fontes) {
    console.log(`  ${f.titulo ?? '(sem título)'}`);
    console.log(`    ${f.url}`);
    console.log(`    trecho: ${(f.trecho ?? '(sem trecho)').slice(0, 80)}...`);
  }
  console.log('\n--- CUSTO (unidades) ---'); console.log(r.custo);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
