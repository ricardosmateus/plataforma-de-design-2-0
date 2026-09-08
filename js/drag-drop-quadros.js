/* ============================================================
   DRAG AND DROP DE QUADROS — board.html
   ============================================================

   Arrastar um quadro pelo cabeçalho para trocá-lo de lugar na
   fileira. Três decisões guiam o comportamento:

   1. O canvas tem zoom (transform: scale). Um pixel de mouse não
      é um pixel de board. Todo deslocamento é dividido pela escala
      real do stage — sem isso o quadro "foge" do cursor, que era o
      efeito de andar sozinho.

   2. Segurar não é arrastar. O quadro só começa a se mover depois
      de o ponteiro percorrer LIMIAR px. Assim, clicar no título ou
      abrir o menu do quadro não sacode nada.

   3. Enquanto arrasta, uma marca vertical mostra ONDE o quadro vai
      cair. Nada se reorganiza durante o movimento — a reordenação
      acontece só ao soltar, de uma vez.

   Requisitos: #canvasStage, quadros .ideas-panel, .ideas-head como
   alça. window.reorganizarQuadros() é usada se existir (há fallback).
   ============================================================ */

(function () {
  'use strict';

  var stage = document.getElementById('canvasStage');
  if (!stage) return;

  var LIMIAR = 5;      /* px de ponteiro antes de considerar arrasto */
  var GAP    = 32;     /* mesmo respiro que criarQuadro() usa */
  var BASE_X = 456;    /* primeira coluna, à direita do explainer */

  /* Estado do arrasto em curso. `null` = ninguém está arrastando. */
  var arrasto = null;
  var marca = null;

  /* ============================================================
     ESCALA — quanto o stage está reduzido/ampliado agora
     ============================================================
     Lida da matriz de transform em vez da variável CSS: funciona
     mesmo se o nome de --cz mudar, e já vem resolvida. */

  function escalaAtual() {
    var t = window.getComputedStyle(stage).transform;
    if (!t || t === 'none') return 1;
    try {
      var m = new DOMMatrixReadOnly(t);
      return m.a || 1;
    } catch (_) {
      var nums = t.match(/matrix\(([^)]+)\)/);
      if (nums) {
        var a = parseFloat(nums[1].split(',')[0]);
        if (a) return a;
      }
    }
    return 1;
  }

  /* ============================================================
     MARCA DE DESTINO — a barra que mostra onde o quadro vai cair
     ============================================================ */

  function estiloDaMarca() {
    if (document.getElementById('dragQuadroEstilo')) return;
    var st = document.createElement('style');
    st.id = 'dragQuadroEstilo';
    st.textContent =
      '.quadro-drop-marca{' +
        'position:absolute;width:4px;border-radius:2px;' +
        'background:var(--fill-accent,#0ba5ec);' +
        'box-shadow:0 0 0 6px color-mix(in srgb, var(--fill-accent,#0ba5ec) 18%, transparent);' +
        'pointer-events:none;z-index:900;' +
      '}' +
      '.quadro-drop-marca::before,.quadro-drop-marca::after{' +
        'content:"";position:absolute;left:50%;width:12px;height:12px;' +
        'margin-left:-6px;border-radius:50%;' +
        'background:var(--fill-accent,#0ba5ec);' +
      '}' +
      '.quadro-drop-marca::before{top:-6px}' +
      '.quadro-drop-marca::after{bottom:-6px}' +
      '.ideas-panel.is-arrastando{' +
        'opacity:.9;z-index:1000;cursor:grabbing;' +
        'box-shadow:var(--shadow-lg,0 16px 48px rgba(0,0,0,.22));' +
        'transform:rotate(.4deg);' +
      '}' +
      '.ideas-panel.is-cedendo{' +
        'transition:left var(--dur-base,300ms) var(--ease-out,cubic-bezier(.2,.8,.2,1));' +
      '}' +
      '.ideas-head{cursor:grab}' +
      '.ideas-head:active{cursor:grabbing}';
    document.head.appendChild(st);
  }

  function mostrarMarca(x, topo, altura) {
    if (!marca) {
      marca = document.createElement('div');
      marca.className = 'quadro-drop-marca';
      stage.appendChild(marca);
    }
    marca.style.left = (x - 2) + 'px';
    marca.style.top = topo + 'px';
    marca.style.height = altura + 'px';
  }

  function esconderMarca() {
    if (marca && marca.parentNode) marca.parentNode.removeChild(marca);
    marca = null;
  }

  /* ============================================================
     ÍNDICE DE DESTINO — entre quais vizinhos o quadro vai entrar
     ============================================================
     Compara o CENTRO do quadro arrastado com o centro de cada
     vizinho. Usar o centro (e não a borda) é o que faz a troca
     acontecer quando a pessoa já cobriu metade do vizinho, que é
     quando ela espera que aconteça. */

  function vizinhos() {
    return Array.prototype.filter.call(
      stage.querySelectorAll('.ideas-panel'),
      function (p) { return p !== arrasto.painel; }
    );
  }

  function calcularDestino() {
    var lista = vizinhos();
    var centro = arrasto.painel.offsetLeft + arrasto.painel.offsetWidth / 2;
    var indice = 0;

    for (var i = 0; i < lista.length; i++) {
      var c = lista[i].offsetLeft + lista[i].offsetWidth / 2;
      if (centro > c) indice = i + 1;
    }
    return { indice: indice, lista: lista };
  }

  function posicionarMarca(destino) {
    var lista = destino.lista;
    if (!lista.length) { esconderMarca(); return; }

    var x, ref;
    if (destino.indice === 0) {
      ref = lista[0];
      x = ref.offsetLeft - GAP / 2;
    } else {
      ref = lista[destino.indice - 1];
      x = ref.offsetLeft + ref.offsetWidth + GAP / 2;
    }

    /* A marca acompanha a altura do vizinho de referência, para não
       flutuar solta num board de quadros de alturas diferentes. */
    mostrarMarca(x, ref.offsetTop, ref.offsetHeight);
  }

  /* ============================================================
     ARRASTO — pointerdown → threshold → move → drop
     ============================================================ */

  function podeArrastar(alvo) {
    /* O cabeçalho também abriga o menu do quadro. Clique em botão,
       menu, campo ou texto editável é interação daquele controle —
       não pedido de arrasto. */
    return !alvo.closest(
      'button, a, input, textarea, select, .menu, [contenteditable="true"]'
    );
  }

  function aoPressionar(e) {
    if (e.button !== 0) return;
    if (!podeArrastar(e.target)) return;

    var painel = e.target.closest('.ideas-panel');
    if (!painel || painel.parentNode !== stage) return;

    arrasto = {
      painel: painel,
      pointerId: e.pointerId,
      clienteX: e.clientX,
      clienteY: e.clientY,
      origemLeft: painel.offsetLeft,
      origemTop: painel.offsetTop,
      escala: escalaAtual(),
      ativo: false,        /* vira true só depois do limiar */
      destino: null
    };

    document.addEventListener('pointermove', aoMover);
    document.addEventListener('pointerup', aoSoltar);
    document.addEventListener('pointercancel', cancelar);
    document.addEventListener('keydown', aoTeclar);
  }

  function comecarDeVerdade() {
    arrasto.ativo = true;
    estiloDaMarca();
    arrasto.painel.classList.add('is-arrastando');
    document.body.style.userSelect = 'none';

    /* Os vizinhos ganham transição só agora: assim o reposicionamento
       final desliza, mas o quadro na mão continua colado no cursor. */
    vizinhos().forEach(function (p) { p.classList.add('is-cedendo'); });

    try { arrasto.painel.setPointerCapture(arrasto.pointerId); } catch (_) {}
  }

  function aoMover(e) {
    if (!arrasto) return;

    var dxTela = e.clientX - arrasto.clienteX;
    var dyTela = e.clientY - arrasto.clienteY;

    if (!arrasto.ativo) {
      if (Math.abs(dxTela) < LIMIAR && Math.abs(dyTela) < LIMIAR) return;
      comecarDeVerdade();
    }

    e.preventDefault();

    /* Divisão pela escala: converte pixel de tela em pixel de board. */
    arrasto.painel.style.left = (arrasto.origemLeft + dxTela / arrasto.escala) + 'px';
    arrasto.painel.style.top  = (arrasto.origemTop  + dyTela / arrasto.escala) + 'px';

    arrasto.destino = calcularDestino();
    posicionarMarca(arrasto.destino);
  }

  function limpar() {
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerup', aoSoltar);
    document.removeEventListener('pointercancel', cancelar);
    document.removeEventListener('keydown', aoTeclar);

    if (arrasto) {
      try { arrasto.painel.releasePointerCapture(arrasto.pointerId); } catch (_) {}
      arrasto.painel.classList.remove('is-arrastando');
    }
    esconderMarca();
    document.body.style.userSelect = '';

    Array.prototype.forEach.call(
      stage.querySelectorAll('.ideas-panel'),
      function (p) {
        setTimeout(function () { p.classList.remove('is-cedendo'); }, 320);
      }
    );
    arrasto = null;
  }

  function aoTeclar(e) {
    if (e.key === 'Escape') cancelar();
  }

  /* Desistir devolve o quadro ao lugar de onde saiu — Esc precisa
     desfazer, não confirmar uma posição que a pessoa não escolheu. */
  function cancelar() {
    if (!arrasto) return;
    arrasto.painel.style.left = arrasto.origemLeft + 'px';
    arrasto.painel.style.top = arrasto.origemTop + 'px';
    limpar();
  }

  function aoSoltar() {
    if (!arrasto) return;

    /* Sem limiar vencido foi clique, não arrasto: nada a fazer. */
    if (!arrasto.ativo) { limpar(); return; }

    var painel = arrasto.painel;
    var destino = arrasto.destino;
    var topoOriginal = arrasto.origemTop;
    var mudou = false;

    if (destino && destino.lista.length) {
      var anterior = Array.prototype.indexOf.call(
        stage.querySelectorAll('.ideas-panel'), painel
      );
      /* Reinsere na ordem do DOM — é o DOM que define a fileira. */
      if (destino.indice >= destino.lista.length) {
        stage.appendChild(painel);
      } else {
        stage.insertBefore(painel, destino.lista[destino.indice]);
      }
      var agora = Array.prototype.indexOf.call(
        stage.querySelectorAll('.ideas-panel'), painel
      );
      mudou = anterior !== agora;
    }

    /* O quadro volta à linha: só a ordem horizontal muda. */
    painel.style.top = topoOriginal + 'px';
    painel.classList.add('is-cedendo');

    limpar();
    reorganizar();

    if (mudou) {
      if (window.dispararAutosave) window.dispararAutosave();
      if (window.mostrarMensagem) window.mostrarMensagem('Quadros reorganizados.');
    }
  }

  /* ============================================================
     REPOSICIONAMENTO — fileira contígua, sem buracos
     ============================================================ */

  function reorganizar() {
    if (window.reorganizarQuadros) { window.reorganizarQuadros(); return; }

    var x = BASE_X;
    Array.prototype.forEach.call(
      stage.querySelectorAll('.ideas-panel'),
      function (p) {
        p.style.left = x + 'px';
        x += (p.offsetWidth || parseFloat(p.style.width) || 936) + GAP;
      }
    );
  }

  /* ============================================================
     LIGAÇÃO — um listener no stage cobre painel novo e antigo
     ============================================================
     Delegação em vez de MutationObserver: quadro criado depois já
     nasce arrastável, sem precisar registrar nada. */

  estiloDaMarca();
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.ideas-head')) aoPressionar(e);
  });

  window.DragDropQuadros = { reorganizar: reorganizar };

})();
