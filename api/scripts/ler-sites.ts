/* Lê sites de verdade e mostra o que a leitura visual extraiu.
   Uso (na pasta api):  npx tsx scripts/ler-sites.ts https://www.loggi.com https://www.jadlog.com.br
   Salva o HTML, o CSS e o resultado em testes/fixtures/sites/<host>/, para os testes
   da subfase 1b nascerem do dado real ("fixture inventada é fixture limpa", §8.6). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { lerSiteVisual } from '../src/referencias/leitura-visual-rede.js';

const sites = process.argv.slice(2);
if (!sites.length) { console.error('Informe um ou mais sites.'); process.exit(1); }

for (const site of sites) {
  const r = await lerSiteVisual(site);
  const host = (() => { try { return new URL(r.site).hostname; } catch { return site.replace(/\W+/g, '_'); } })();
  const pasta = new URL(`../testes/fixtures/sites/${host}/`, import.meta.url);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(new URL('pagina.html', pasta), r.bruto.html);
  r.bruto.folhas.forEach((f, i) => writeFileSync(new URL(`estilo-${i + 1}.css`, pasta), `/* ${f.url} */\n${f.css}`));
  const { logoBytes, bruto, logoSvg, candidatos, ...evidencia } = r;
  writeFileSync(new URL('evidencia.json', pasta), JSON.stringify(evidencia, null, 2));
  console.log(`\n== ${r.site}`);
  console.log('  logotipo:', r.logo ? `${r.logo.formato} ${r.logo.url}` : (r.logoSvg ? 'SVG (lido como texto)' : '—'), r.coresDoLogo.length ? `| cores do SVG: ${r.coresDoLogo.join(' ')}` : '');
  console.log('  por quê: ', candidatos[0] ? `${candidatos[0].tipo}, ${candidatos[0].pontos} pontos: ${candidatos[0].motivos.join(', ')}` : '—');
  console.log('  cores:   ', r.cores.map((c) => `${c.hex}${c.neutra ? '·' : ''}(${c.origens.join('+')})`).join('  ') || '—');
  console.log('  fontes:  ', r.fontes.map((f) => `${f.familia}${f.sistema ? '·' : ''}(${f.origens.join('+')})`).join('  ') || '—');
  for (const a of r.avisos) console.log('  aviso:   ', a);
}
console.log('\n· = neutra (cor) ou de sistema (fonte). Fixtures em testes/fixtures/sites/.');
