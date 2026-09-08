/* ============================================================
   REORGANIZAÇÃO DE QUADROS — board.html
   ============================================================

   Problema:
   Quando um quadro é excluído, os quadros restantes não se
   reorganizam — ficam com buracos no meio da tela.

   Solução:
   Adicionar função que recalcula posição (left) de todos os
   painéis após uma exclusão, fazendo-os "deslizar" para preencher
   o espaço deixado pelo quadro removido.

   Aplicação:
   Chamar reorganizarQuadros() após deletar um quadro.

   ============================================================ */

/**
 * Reorganiza os painéis (quadros) para que ocupem espaço contínuo.
 *
 * Remove buracos deixados por exclusão: se o quadro 2 é deletado,
 * o quadro 3 (e seguintes) deslizam para a esquerda.
 *
 * Usa a mesma lógica de criarQuadro(): cada novo quadro fica 32px
 * à direita do anterior. Aqui recalcula para todos.
 */
function reorganizarQuadros() {
  var stage = document.getElementById('canvasStage');
  if (!stage) return;

  var paineis = stage.querySelectorAll('.ideas-panel');
  if (!paineis.length) return;

  var posicaoX = 456; // Posição inicial, mesmo que em criarQuadro()

  Array.prototype.forEach.call(paineis, function (painel) {
    /* Calcula largura real do painel */
    var largura = painel.offsetWidth || parseFloat(painel.style.width) || 936;

    /* Posiciona este painel */
    painel.style.left = posicaoX + 'px';

    /* Próximo painel começa 32px depois do final deste */
    posicaoX = posicaoX + largura + 32;
  });
}

/**
 * Exporta para uso global (chamar após deletar um quadro)
 */
window.reorganizarQuadros = reorganizarQuadros;
