/* BOARD-VISUAL-012 a 017 — a análise visual inteira, com o Claude e a
   leitura dos sites SIMULADOS (nada sai para a rede, nada é gasto).
   A evidência de cada site é a REAL, das fixtures. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { montarEvidencia } from '../src/referencias/leitura-visual.js';
import type { LeituraVisual } from '../src/referencias/leitura-visual-rede.js';
import { interpretarEmpresas, investigarVisual, modeloDaAnalise, EMPRESAS_MAX, type Chamar } from '../src/referencias/analise-visual-rede.js';

function leituraReal(host: string, extra: Partial<LeituraVisual> = {}): LeituraVisual {
  const dir = new URL(`./fixtures/sites/${host}/`, import.meta.url);
  const html = readFileSync(new URL('pagina.html', dir), 'utf8');
  const folhas = readdirSync(dir).filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8'));
  return {
    ...montarEvidencia({ site: `https://${host}/`, html, folhas, svgs: [], logo: { url: `https://${host}/logo.png`, formato: 'image/png' } }),
    logoBytes: Buffer.from('png'), logoSvg: null, candidatos: [], bruto: { html, folhas: [] },
    ...extra,
  };
}

test('empresas: só site cujo domínio apareceu na busca; sem a própria empresa; sem repetir', () => {
  const bruto = JSON.stringify({ empresas: [
    { nome: 'Loggi', site: 'https://www.loggi.com/sobre' },
    { nome: 'Inventada', site: 'https://site-que-ninguem-viu.com.br' },
    { nome: 'iHouseLog', site: 'https://ihouselog.com.br' },
    { nome: 'Loggi Brasil', site: 'https://loggi.com' },
    { nome: 'Jadlog', site: 'https://www.jadlog.com.br' },
  ] });
  const vistas = new Set(['https://www.loggi.com/', 'https://www.jadlog.com.br/jadlog/home', 'https://ihouselog.com.br/']);
  assert.deepEqual(interpretarEmpresas(bruto, vistas, 'iHouseLog'), [
    { nome: 'Loggi', site: 'https://www.loggi.com/' },
    { nome: 'Jadlog', site: 'https://www.jadlog.com.br/' },
  ]);
});

test('empresas: no máximo EMPRESAS_MAX (8)', () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({ nome: `E${i}`, site: `https://e${i}.com.br` }));
  const vistas = new Set(lista.map((e) => e.site));
  assert.equal(interpretarEmpresas(JSON.stringify({ empresas: lista }), vistas, 'x').length, EMPRESAS_MAX);
});

test('modelo da análise: Sonnet por padrão, e só se tiver preço na tabela', () => {
  const m = modeloDaAnalise();
  assert.ok(m && /sonnet/.test(m), String(m));
});

test('caminho inteiro: tabela com as 3 empresas; só é pago o que rodou; a trava registra o descarte', async () => {
  const chamadas: Array<Record<string, unknown>> = [];
  const chamar: Chamar = async (corpo) => {
    chamadas.push(corpo);
    if (corpo.tools) {
      return { ok: true, corpo: {
        content: [
          { type: 'web_search_tool_result', content: [{ url: 'https://www.jadlog.com.br/' }, { url: 'https://www.kangu.com.br/' }, { url: 'https://www.frenet.com.br/' }] },
          { type: 'text', text: JSON.stringify({ empresas: [
            { nome: 'Jadlog', site: 'https://www.jadlog.com.br' },
            { nome: 'Kangu', site: 'https://www.kangu.com.br' },
            { nome: 'Frenet', site: 'https://www.frenet.com.br' },
          ] }) },
        ],
        usage: { input_tokens: 2000, output_tokens: 300, server_tool_use: { web_search_requests: 3 } },
      } };
    }
    return { ok: true, corpo: {
      content: [{ type: 'text', text: '{"tipo_de_marca":"só nome","estilo":"Sólida.","cores":["#ba1e34","#00ff00"],"tipografia":["Pluto Sans DPD"],"comunica":"Robustez."}' }],
      usage: { input_tokens: 1800, output_tokens: 200 },
    } };
  };
  const lerSite = async (site: string): Promise<LeituraVisual> => {
    if (site.includes('jadlog')) return leituraReal('www.jadlog.com.br');
    if (site.includes('kangu')) return leituraReal('www.mercadolivre.com.br', { redirecionouPara: 'mercadolivre.com.br', avisos: ['kangu.com.br redireciona para mercadolivre.com.br.'] });
    const vazio = montarEvidencia({ site, html: '', folhas: [], svgs: [], logo: null, avisos: ['O site não abriu (respondeu 403).'] });
    return { ...vazio, logoBytes: null, logoSvg: null, candidatos: [], bruto: { html: '', folhas: [] } };
  };

  const r = await investigarVisual(
    { tarefa: 'Logotipos atuais das logtechs brasileiras', empresaNome: 'iHouseLog', empresaDescricao: null, modeloEmpresas: 'claude-haiku-4-5', modeloAnalise: 'claude-sonnet-4-5' },
    { chamar, lerSite },
  );

  assert.match(r.resposta, /^\| Critério \| Jadlog \| Kangu \| Frenet \|$/m);
  assert.deepEqual(r.usos.map((u) => `${u.etapa}:${u.modelo}`), ['empresas:claude-haiku-4-5', 'analise:claude-sonnet-4-5'],
    'só a descoberta e a Jadlog podem custar — Kangu redirecionou e Frenet não abriu');
  assert.equal(chamadas.filter((c) => !c.tools).length, 1, 'o Sonnet foi chamado para site que não dava para analisar');
  assert.match(r.resposta, /Jadlog: cor citada pela análise e ausente do site, descartada: #00ff00/);
  assert.match(r.resposta, /redireciona para mercadolivre/);
  const imagem = (chamadas.find((c) => !c.tools)!.messages as Array<{ content: Array<{ type: string }> }>)[0]!.content[0]!;
  assert.equal(imagem.type, 'image', 'o logotipo não foi ao Sonnet como imagem');
});

test('nenhuma empresa achada: resposta vazia, com o motivo, e só a descoberta foi paga', async () => {
  const chamar: Chamar = async () => ({ ok: true, corpo: { content: [{ type: 'text', text: '{"empresas":[]}' }], usage: { input_tokens: 900, output_tokens: 20 } } });
  const r = await investigarVisual({ tarefa: 'x', empresaNome: 'y', empresaDescricao: null, modeloEmpresas: 'claude-haiku-4-5', modeloAnalise: 'claude-sonnet-4-5' }, { chamar, lerSite: async () => { throw new Error('não devia ler site'); } });
  assert.equal(r.marcas.length, 0);
  assert.equal(r.motivo, 'nenhuma-empresa');
  assert.equal(r.usos.length, 1);
});
