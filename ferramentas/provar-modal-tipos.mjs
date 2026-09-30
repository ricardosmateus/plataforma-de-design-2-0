/* Prova: no modal "Nova tarefa", a Matriz CSD não pede título nem
   descrição (ATV-TAR-CRIA-008 estendida) e "Gerar com ajuda da IA" só
   aparece na Pesquisa (ATV-GERAR-023). Usa o atividade.html de verdade. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.JSDOM_DE || import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const arquivo = process.argv[2] || new URL('../atividade.html', import.meta.url).pathname;
const html = readFileSync(arquivo, 'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '');
const vc = new VirtualConsole();
const dom = new JSDOM(html, { url: 'https://app.test/atividade?empresa=e&projeto=p&ideia=i', runScripts: 'dangerously', virtualConsole: vc });
const w = dom.window, d = w.document;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
await new Promise((r) => setTimeout(r, 30));
const enviados = [];
w.AtividadeAcoes = { criar: (t, dsc, tipo) => { enviados.push({ t, dsc, tipo }); return Promise.resolve({}); } };
w.openTaskModal();
const $ = (id) => d.getElementById(id);
const tipo = (t) => { const b = d.querySelector(`#taskTipoLateral [data-tipo="${t}"]`); if (b) b.click(); };
const estado = () => ({ titulo: !$('taskTitleField').hidden, desc: !$('taskDescField').hidden, gerar: !$('generateWithAIBtn').hidden, nome: $('taskTipoTitulo').textContent });
let f = 0; const ok = (nome, cond) => { console.log((cond ? 'ok     ' : 'FALHOU ') + nome); if (!cond) f++; };

tipo('pesquisa'); let e = estado();
ok('Pesquisa: pede título e descrição', e.titulo && e.desc);
ok('Pesquisa: mostra "Gerar com ajuda da IA"', e.gerar);
tipo('matriz_csd'); e = estado();
ok('Matriz CSD: NÃO pede título nem descrição', !e.titulo && !e.desc);
ok('Matriz CSD: mostra nome e explicação do tipo', e.nome === 'Matriz CSD' && $('taskTipoDesc').textContent.startsWith('Organize o que o time sabe'));
ok('Matriz CSD: NÃO mostra "Gerar com ajuda da IA"', !e.gerar);
tipo('referencias_visuais'); e = estado();
ok('Referência: NÃO mostra "Gerar com ajuda da IA"', !e.gerar);
tipo('pesquisa'); e = estado();
ok('Voltar para Pesquisa devolve campos e botão', e.titulo && e.desc && e.gerar);
tipo('matriz_csd');
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 10));
const ultimo = enviados[enviados.length - 1];
/* A tela manda vazio e o SERVIDOR preenche (TEXTO_PADRAO) — o que ele
   aceita está provado em api/testes/tipos-matriz.test.ts, não aqui. */
ok('Salvar a Matriz envia vazio, tipo matriz_csd (o servidor preenche)', !!ultimo && ultimo.t === '' && ultimo.dsc === '' && ultimo.tipo === 'matriz_csd');

for (const [t, nome] of [['swot', 'Matriz SWOT'], ['impacto_esforco', 'Impacto × Esforço'], ['comparativa', 'Tabela comparativa']]) {
  const botao = d.querySelector(`#taskTipoLateral [data-tipo="${t}"]`);
  ok(nome + ': aparece na lateral', !!botao);
  if (!botao) continue;
  tipo(t); e = estado();
  ok(nome + ': NÃO pede título nem descrição, sem "Gerar com ajuda da IA"', !e.titulo && !e.desc && !e.gerar && e.nome === nome);
}
tipo('swot');
$('taskForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 10));
const swot = enviados[enviados.length - 1];
ok('Salvar a SWOT envia vazio, tipo swot (o servidor preenche)', !!swot && swot.t === '' && swot.dsc === '' && swot.tipo === 'swot');
console.log(f ? `\n${f} falha(s)` : '\ntodas as conferências passaram');
