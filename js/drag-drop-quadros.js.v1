/* ============================================================
   DRAG AND DROP DE QUADROS — board.html
   ============================================================

   Funcionalidade:
   - Clicar e segurar em um quadro permite arrastar
   - Enquanto arrasta, o quadro fica com feedback visual
   - Ao soltar, quadros se reorganizam por posição
   - Ordem é persistida no autosave

   Requisitos:
   - Canvas com quadros (position: absolute)
   - Quadros com classe .ideas-panel
   - Function reorganizarQuadros() disponível

   ============================================================ */

(function () {
  'use strict';

  var stage = document.getElementById('canvasStage');
  if (!stage) return;

  var painelemDrag = null;           /* Painel sendo arrastado */
  var offsetX = 0, offsetY = 0;      /* Deslocamento do cursor dentro do painel */
  var posicaoOriginalX = 0;          /* Left original (para cancelar se necessário) */
  var posicaoOriginalY = 0;          /* Top original (para cancelar se necessário) */
  var precisaReorganizar = false;    /* Flag para reorganizar ao soltar */

  /* ============================================================
     INICIALIZAÇÃO — Adicionar listeners aos painéis existentes
     ============================================================ */

  /**
   * Preparar um painel para drag and drop.
   * Adiciona classe, cursor e listeners.
   */
  function prepararPaineParaDrag(painel) {
    if (painel.dataset.dragSetup === 'true') return;
    painel.dataset.dragSetup = 'true';

    /* Cabeçalho do painel é a "alça" para arrastar */
    var cabeca = painel.querySelector('.ideas-head');
    if (cabeca) {
      cabeca.style.cursor = 'grab';
      cabeca.addEventListener('mousedown', iniciarDrag);
    }
  }

  /**
   * Quando um novo painel é criado, também preparar para drag.
   * Observa mudanças no DOM e configura painéis novos.
   */
  var observer = new MutationObserver(function (mutacoes) {
    mutacoes.forEach(function (mutacao) {
      if (mutacao.type === 'childList') {
        Array.prototype.forEach.call(mutacao.addedNodes, function (node) {
          if (node.nodeType === 1 && node.classList.contains('ideas-panel')) {
            prepararPaineParaDrag(node);
          }
        });
      }
    });
  });

  observer.observe(stage, { childList: true });

  /* Preparar painéis que já existem na tela */
  var paineisCriados = stage.querySelectorAll('.ideas-panel');
  Array.prototype.forEach.call(paineisCriados, prepararPaineParaDrag);

  /* ============================================================
     DRAG — Iniciar, mover, soltar
     ============================================================ */

  /**
   * Inicia o drag quando o usuário clica no cabeçalho do painel.
   */
  function iniciarDrag(e) {
    if (e.button !== 0) return; /* Só botão esquerdo */

    painelemDrag = e.target.closest('.ideas-panel');
    if (!painelemDrag) return;

    e.preventDefault();

    /* Calcular offset do cursor em relação ao painel */
    var rect = painelemDrag.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    /* Guardar posição original (em case de cancelamento) */
    posicaoOriginalX = painelemDrag.offsetLeft;
    posicaoOriginalY = painelemDrag.offsetTop;

    /* Feedback visual: o painel fica semi-transparente e levantado */
    painelemDrag.style.opacity = '0.8';
    painelemDrag.style.zIndex = '1000';
    painelemDrag.style.boxShadow = 'var(--shadow-lg, 0 12px 48px rgba(0,0,0,.25))';
    painelemDrag.style.cursor = 'grabbing';

    /* Listeners de movimento e soltura */
    document.addEventListener('mousemove', moverPainel);
    document.addEventListener('mouseup', soltarPainel);

    /* Impedir seleção de texto enquanto arrasta */
    document.body.style.userSelect = 'none';
  }

  /**
   * Atualiza posição do painel enquanto o usuário arrasta.
   */
  function moverPainel(e) {
    if (!painelemDrag) return;

    e.preventDefault();

    /* Calcular nova posição (em relação ao viewport) */
    var novoX = e.clientX - offsetX;
    var novoY = e.clientY - offsetY;

    /* Converter para coordenadas do stage (levando em conta seu scroll/pan) */
    var stageRect = stage.getBoundingClientRect();
    novoX -= stageRect.left;
    novoY -= stageRect.top;

    /* Aplicar novo left/top */
    painelemDrag.style.left = novoX + 'px';
    painelemDrag.style.top = novoY + 'px';

    precisaReorganizar = true;
  }

  /**
   * Finaliza o drag quando o usuário solta o mouse.
   * Reorganiza os painéis por posição (esquerda → direita).
   */
  function soltarPainel(e) {
    if (!painelemDrag) return;

    /* Remover listeners */
    document.removeEventListener('mousemove', moverPainel);
    document.removeEventListener('mouseup', soltarPainel);

    /* Remover feedback visual */
    painelemDrag.style.opacity = '';
    painelemDrag.style.zIndex = '';
    painelemDrag.style.boxShadow = '';
    painelemDrag.style.cursor = 'grab';

    /* Restaurar seleção de texto */
    document.body.style.userSelect = '';

    if (precisaReorganizar) {
      /* Reorganizar painéis por posição */
      reordenarPaineisAposArrastar();
      precisaReorganizar = false;

      /* Salvar nova ordem */
      if (window.dispararAutosave) {
        window.dispararAutosave();
      }

      mostrarFeedback('Quadros reorganizados.');
    }

    painelemDrag = null;
  }

  /* ============================================================
     REORGANIZAÇÃO — Reordenar painéis por posição horizontal
     ============================================================ */

  /**
   * Reordena os painéis no DOM baseado em sua posição no eixo X.
   * Depois recalcula as posições para mantê-los contíguos (sem buracos).
   */
  function reordenarPaineisAposArrastar() {
    var paineis = stage.querySelectorAll('.ideas-panel');
    if (paineis.length < 2) return;

    /* Converter NodeList para Array para poder sort */
    var paineisPorPosicao = Array.prototype.slice.call(paineis);

    /* Ordenar por posição X (left) */
    paineisPorPosicao.sort(function (a, b) {
      var leftA = a.offsetLeft || parseFloat(a.style.left) || 456;
      var leftB = b.offsetLeft || parseFloat(b.style.left) || 456;
      return leftA - leftB;
    });

    /* Reordenar no DOM (append move para o final) */
    paineisPorPosicao.forEach(function (painel) {
      stage.appendChild(painel);
    });

    /* Recalcular posições para ficar contíguo (sem buracos) */
    reorganizarQuadros();
  }

  /**
   * Recalcula posições dos painéis para ficarem contíguos.
   * Mesma lógica de criarQuadro(), mas para todos.
   *
   * Se reorganizarQuadros() não está disponível, implementa aqui.
   */
  function reorganizarQuadros() {
    if (window.reorganizarQuadros) {
      window.reorganizarQuadros();
      return;
    }

    /* Fallback (se a função externa não foi carregada) */
    var paineis = stage.querySelectorAll('.ideas-panel');
    var posicaoX = 456;

    Array.prototype.forEach.call(paineis, function (painel) {
      var largura = painel.offsetWidth || parseFloat(painel.style.width) || 936;
      painel.style.left = posicaoX + 'px';
      posicaoX = posicaoX + largura + 32;
    });
  }

  /* ============================================================
     FEEDBACK — Toast ao usuário
     ============================================================ */

  function mostrarFeedback(msg) {
    /* Tenta usar função existente de toast, senão faz nada silencioso */
    if (window.mostrarMensagem) {
      window.mostrarMensagem(msg);
    }
  }

  /* ============================================================
     EXPORTAR — Tornar disponível para uso externo
     ============================================================ */

  window.DragDropQuadros = {
    iniciar: function () {
      var paineis = stage.querySelectorAll('.ideas-panel');
      Array.prototype.forEach.call(paineis, prepararPaineParaDrag);
    }
  };

})();
