/* ============================================================
   Buscar referências com a IA — o caminho único (BOARD-REF-009/010)
   ============================================================
   Dois gatilhos chegam aqui, e é de propósito que cheguem ao MESMO
   código:
     - "Gerar com ajuda da IA" no modal "Nova tarefa", com Referência
       escolhida (rotas/gerar-tarefa.ts) — cria a tarefa e busca;
     - "Pesquisar" no board de uma tarefa de Referência
       (rotas/referencias.ts, POST .../referencias/buscar) — busca e
       ACRESCENTA à tarefa que já existe.
   Dois caminhos para "buscar referências dos concorrentes" divergiriam
   no primeiro ajuste de prompt ou de teto.

   Quem chama reserva o teto (tetoDaBusca) ANTES — na geração, a
   reserva precisa acontecer antes de a tarefa existir. Esta função
   faz a busca, grava os cards e acerta a reserva.
   ============================================================ */

import { db } from '../db.js';
import { env } from '../env.js';
import {
  SISTEMA_REFERENCIAS,
  MAX_TOKENS_REFERENCIAS,
  BUSCAS_REFERENCIAS,
  montarMensagemReferencias,
  interpretarReferencias,
  buscarReferencias,
} from '../ia/gerar-tarefa.js';
import { mesmaEmpresa } from '../pesquisa/entidades.js';
import { tetoBuscaUsdMicros } from '../creditos/precos.js';
import { usdParaMicrosBrl, comissaoSobre, cotacaoParaMilesimos } from '../creditos/dinheiro.js';
import { liberar, consumir } from '../creditos/reserva.js';
import { registrarPesquisa, custoDe } from '../creditos/registro-pesquisa.js';
import { coletarReferencias, type JaExistentes, type ResultadoColeta } from './coleta.js';

export type PedidoDeBusca = {
  empresaNome: string;
  empresaDescricao: string | null;
  atividadeTitulo: string;
  tarefaDescricao: string;
  concorrentesConhecidos: string[];
};

function emReais(usdMicros: number): number {
  return comissaoSobre(usdParaMicrosBrl(usdMicros, cotacaoParaMilesimos(env.COTACAO_USD_BRL))).totalMicros;
}

/* ATV-GERAR-011: os concorrentes que a EMPRESA já nomeou em qualquer
   pesquisa. A própria empresa não entra. */
export async function concorrentesConhecidos(empresaId: string, empresaNome: string, extras: string[] = []): Promise<string[]> {
  const linhas = await db.pesquisaEntidade.findMany({
    where: { tipo: 'empresa', sessao: { empresaId } },
    orderBy: { criadoEm: 'desc' },
    select: { nome: true },
    take: 60,
  });
  const nomes: string[] = [];
  for (const n0 of [...extras, ...linhas.map((l) => l.nome)]) {
    const n = n0.trim();
    if (!n || mesmaEmpresa(n, empresaNome)) continue;
    if (nomes.some((x) => mesmaEmpresa(x, n))) continue;
    nomes.push(n);
    if (nomes.length >= 8) break;
  }
  return nomes;
}

/* O teto, em reais com comissão, para reservar. A descrição da tarefa
   entra no tamanho máximo quando ainda não existe (geração). */
export function tetoDaBusca(modelo: string, pedido: PedidoDeBusca): number | null {
  const usd = tetoBuscaUsdMicros(
    modelo,
    SISTEMA_REFERENCIAS + '\n' + montarMensagemReferencias(pedido),
    MAX_TOKENS_REFERENCIAS,
    BUSCAS_REFERENCIAS,
  );
  return usd === null ? null : emReais(usd);
}

export async function executarBusca(p: {
  usuarioId: string;
  tarefaId: string;
  modelo: string;
  pedido: PedidoDeBusca;
  tetoReservado: number;
  operacaoId: string;
  ja?: JaExistentes;
}): Promise<{ coleta: ResultadoColeta; concorrentes: number }> {
  const b = await buscarReferencias(montarMensagemReferencias(p.pedido), p.modelo);
  const achados = b.ok ? interpretarReferencias(b.bruto, b.urlsVistas) : [];
  const coleta: ResultadoColeta = achados.length
    ? await coletarReferencias(p.tarefaId, p.usuarioId, achados, p.ja)
    : {
        sites: 0, imagens: 0, documentos: 0, criadas: [],
        avisos: [b.ok ? 'A busca não encontrou concorrentes com site oficial.' : 'A busca na web não completou.'],
      };

  const entregou = coleta.criadas.length > 0;
  const consumo = {
    usuarioId: p.usuarioId,
    nivel: 'busca' as const,
    provedor: 'referencias',
    resultado: b.ok ? (entregou ? ('entregue' as const) : ('vazio' as const)) : ('falhou' as const),
    modelo: b.modelo ?? p.modelo,
    tokensEntrada: b.uso?.entrada,
    tokensSaida: b.uso?.saida,
    requisicoes: 1,
    buscas: b.buscas,
  };
  await liberar(p.usuarioId, p.tetoReservado, p.operacaoId, 'pesquisa');
  /* BOARD-PESQUISA-010: `falhou` não cobra; `vazio` cobra, porque a
     busca rodou e o provedor cobrou. */
  const custo = custoDe(consumo);
  if (b.ok && custo && custo.totalMicros > 0) await consumir(p.usuarioId, custo.totalMicros, p.operacaoId, 'pesquisa');
  registrarPesquisa({ ...consumo, operacaoId: p.operacaoId });

  return { coleta, concorrentes: achados.length };
}
