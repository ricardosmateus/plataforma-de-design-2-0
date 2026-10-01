/* BOARD-VISUAL-018 a 021 — a ORDEM do que mexe com dinheiro na rota de
   busca. Lido do código-fonte: a rota depende de banco e de stream, e o
   que se quer travar aqui é a sequência, que um rearranjo desfaria sem
   nenhum teste de unidade perceber. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rota = readFileSync(new URL('../src/rotas/pesquisa.ts', import.meta.url), 'utf8');
const busca = rota.slice(rota.indexOf("app.post('/pesquisa/sessoes/:sessaoId/investigar/:invId/buscar'"));
const pos = (trecho: string) => {
  const i = busca.indexOf(trecho);
  assert.ok(i >= 0, `não achei na rota de busca: ${trecho}`);
  return i;
};

test('a análise visual roda DEPOIS de a busca ser cobrada, e ANTES da gravação', () => {
  const cobrouBusca = pos("await consumir(usuarioId, custoBusca.totalMicros, operacaoBusca, 'pesquisa')");
  const visual = pos('empresasQueCabem({');
  const gravou = pos('const gravado = await gravarInvestigacao({');
  assert.ok(cobrouBusca < visual && visual < gravou);
});

test('o espaço no teto é calculado contra o que a busca GASTOU, não contra a reserva dela', () => {
  assert.match(busca, /reservadoBuscaMicros: custoBusca\?\.totalMicros \?\? estimativaBusca/);
});

test('reserva própria, liberada no finally, e débito do real com o mesmo operacaoId', () => {
  const reservou = pos("await reservar(usuarioId, cabe.estimativaMicros, operacaoVisual, 'pesquisa')");
  const liberou = pos("await liberar(usuarioId, cabe.estimativaMicros, operacaoVisual, 'pesquisa')");
  const consumiu = pos("await consumir(usuarioId, custoVisual, operacaoVisual, 'pesquisa')");
  assert.ok(reservou < liberou && liberou < consumiu);
  assert.match(busca.slice(liberou - 200, liberou), /finally \{/);
  assert.match(busca, /registrarPesquisa\(\{ \.\.\.r, consultaId: gravado\.consultaId, operacaoId: operacaoVisual \}\)/);
});

test('só quando a busca respondeu e a tarefa pede algo visual', () => {
  assert.match(busca, /if \(veredito\.respondeu && pedidoVisual\(inv\.pergunta\) && modeloAnalise\)/);
});

test('o que é gravado e o que vai ao navegador é o resultado JUNTO', () => {
  const gravacao = busca.slice(pos('const gravado = await gravarInvestigacao({'), pos('const gravado = await gravarInvestigacao({') + 400);
  assert.match(gravacao, /resposta: final\.resposta/);
  assert.match(gravacao, /afirmacoes: final\.afirmacoes/);
  const fim = busca.slice(pos("enviar('fim', {"), pos("enviar('fim', {") + 1200);
  assert.match(fim, /resposta: final\.resposta/);
  assert.match(fim, /matriz: matrizFinal/);
});
