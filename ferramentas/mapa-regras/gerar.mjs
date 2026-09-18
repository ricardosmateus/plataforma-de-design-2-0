#!/usr/bin/env node
/* ============================================================
   Mapa de Regras de Negócio — gerador
   ============================================================
   Lê todos os .md de Regras_de_negocio/ e produz UM arquivo
   HTML autocontido, com o conteúdo já embutido.

   Por que embutido, e não servido pela API: a allowlist de
   api/src/servidor.ts (PERMITIDO) serve apenas .html, .css, .js
   e imagens — .md e .json ficam de fora de propósito, porque
   debaixo da mesma raiz vivem api/.env e a documentação interna.
   Servir a documentação para ver o mapa seria desfazer essa
   decisão. Embutir mantém a allowlist intacta.

   Uso:
     node ferramentas/mapa-regras/gerar.mjs          gera uma vez
     node ferramentas/mapa-regras/gerar.mjs --watch  regenera a
                                                     cada alteração
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const BASE = path.join(RAIZ, 'Regras_de_negocio');
const MODELO = path.join(AQUI, 'modelo.html');
const SAIDA = path.join(RAIZ, 'mapa-regras-negocio.html');

/* Documentos de regra que moram fora de Regras_de_negocio/.
   Lista explícita: um .md novo na raiz do repositório não entra
   no mapa sem alguém decidir que ele é regra de negócio. */
const AVULSOS = ['creditos-pagamentos-regras.md'];

const EMOJI = {
  acesso: '🔐', empresas: '🏢', projetos: '📁',
  ideias: '💡', atividades: '📋', ia: '🤖', temas: '🏷️', geral: '📌',
};

/* ---------- leitura ---------- */

function lerDoc(modulo, arquivo, caminhoCompleto) {
  const md = fs.readFileSync(caminhoCompleto, 'utf8');
  const st = fs.statSync(caminhoCompleto);

  const titulo = (md.match(/^#\s+(.+)$/m)?.[1] ?? arquivo).replace(/`/g, '');
  const versao = md.match(/\*\*Vers[ãa]o:\*\*\s*([^\s·|]+)/)?.[1] ?? null;
  const status = md.match(/\*\*Status:\*\*\s*([^·\n|]+)/)?.[1]?.trim() ?? null;
  const pagina = md.match(/\*\*P[áa]gina:\*\*\s*`([^`]+)`/)?.[1] ?? null;

  /* Identificadores no formato EMP-CRIA-003, DIN-001, IDEIA-MOV-01.
     Servem para contar quantas regras nomeadas existem. */
  const ids = [...new Set(md.match(/\b[A-Z]{2,8}(?:-[A-Z0-9]{2,8}){1,3}\b/g) ?? [])];

  return {
    id: `${modulo}/${arquivo.replace(/\.md$/, '')}`,
    nome: arquivo.replace(/\.md$/, ''),
    titulo, versao, status, pagina,
    ids: ids.slice(0, 60),
    modificado: st.mtime.toISOString(),
    bytes: st.size,
    rel: path.relative(RAIZ, caminhoCompleto),
    md,
  };
}

function coletar() {
  const porModulo = new Map();
  const guardar = (modulo, doc) => {
    if (!porModulo.has(modulo)) porModulo.set(modulo, []);
    porModulo.get(modulo).push(doc);
  };

  const dirModulos = path.join(BASE, 'modulos');
  for (const entrada of fs.readdirSync(dirModulos, { withFileTypes: true })) {
    const completo = path.join(dirModulos, entrada.name);
    if (entrada.isDirectory()) {
      for (const f of fs.readdirSync(completo).filter((f) => f.endsWith('.md'))) {
        guardar(entrada.name, lerDoc(entrada.name, f, path.join(completo, f)));
      }
    } else if (entrada.name.endsWith('.md')) {
      guardar('geral', lerDoc('geral', entrada.name, completo));
    }
  }

  for (const f of AVULSOS) {
    const completo = path.join(RAIZ, f);
    if (fs.existsSync(completo)) guardar('geral', lerDoc('geral', f, completo));
  }

  for (const docs of porModulo.values()) {
    docs.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  }

  return [...porModulo.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt'))
    .map(([nome, docs]) => ({ nome, emoji: EMOJI[nome] ?? '📄', docs }));
}

/* ---------- escrita ---------- */

function gerar() {
  const modulos = coletar();
  const totalDocs = modulos.reduce((n, m) => n + m.docs.length, 0);
  const totalBytes = modulos.reduce(
    (n, m) => n + m.docs.reduce((s, d) => s + d.bytes, 0),
    0,
  );

  const dados = JSON.stringify({
    geradoEm: new Date().toISOString(),
    totalDocs,
    totalKB: (totalBytes / 1024).toFixed(0),
    modulos,
  })
    /* O JSON vai dentro de <script>: qualquer "<" precisa sair
       escapado, senão um "</script>" no meio de uma regra fecha
       a tag e quebra a página. */
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const modelo = fs.readFileSync(MODELO, 'utf8');
  if (!modelo.includes('__DADOS__')) {
    throw new Error('modelo.html não tem o marcador __DADOS__');
  }

  fs.writeFileSync(SAIDA, modelo.replace('__DADOS__', dados));

  const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
  const hora = new Date().toLocaleTimeString('pt-BR');
  console.log(
    `${hora}  ✅ ${path.basename(SAIDA)} — ${modulos.length} módulos, ` +
      `${totalDocs} documentos, ${kb} KB`,
  );
  return { modulos, totalDocs };
}

/* ---------- execução ---------- */

gerar();

if (process.argv.includes('--watch')) {
  console.log(`\n👁  vigiando ${path.relative(RAIZ, BASE)}/ — Ctrl+C para sair\n`);

  let pendente = null;
  const regerar = () => {
    clearTimeout(pendente);
    /* Um "salvar" do editor dispara vários eventos; espera 200 ms
       de silêncio antes de reler tudo. */
    pendente = setTimeout(() => {
      try {
        gerar();
      } catch (erro) {
        console.error(`   ⚠️  ${erro.message}`);
      }
    }, 200);
  };

  fs.watch(BASE, { recursive: true }, (_evento, arquivo) => {
    if (arquivo && arquivo.endsWith('.md')) regerar();
  });

  for (const f of AVULSOS) {
    const completo = path.join(RAIZ, f);
    if (fs.existsSync(completo)) fs.watch(completo, regerar);
  }

  process.on('SIGINT', () => {
    console.log('\n✋ encerrado\n');
    process.exit(0);
  });
}
