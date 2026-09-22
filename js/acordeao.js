/* ============================================================
   ACORDEÃO — comportamento
   ============================================================
   Par de css/acordeao.css. Documentado em styleguide.html.

   Marcação mínima:

     <div class="acordeao" data-acordeao>
       <div>
         <button class="acc-trigger" aria-expanded="false"
                 aria-controls="p1">…</button>
         <div class="acc-panel" id="p1" hidden>…</div>
       </div>
     </div>

   Atributos no container:

     data-acordeao            liga o componente (obrigatório)
     data-acordeao-exclusivo  abrir um fecha os outros
     data-acordeao-selecao    as `.acc-opcao` viram um grupo de
                              escolha única e emitem `acordeao:escolha`

   ------------------------------------------------------------
   POR QUE DELEGAÇÃO, E NÃO UM LISTENER POR BOTÃO
   ------------------------------------------------------------
   O conteúdo do acordeão costuma ser desenhado por JS depois que a
   página carrega — é o caso da modal "Novo projeto". Com um
   listener por botão, tudo que nascesse depois da ligação ficaria
   mudo, e o defeito apareceria só no item novo: o tipo de falha que
   passa em teste manual e quebra em produção.

   Um listener no documento não tem esse estado para errar.
   ------------------------------------------------------------ */
(function () {
  'use strict';

  function container(el) { return el.closest('[data-acordeao]'); }

  function painelDe(trigger) {
    var id = trigger.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  function fechar(trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    var p = painelDe(trigger);
    if (p) p.hidden = true;
  }

  function abrir(trigger) {
    trigger.setAttribute('aria-expanded', 'true');
    var p = painelDe(trigger);
    if (p) p.hidden = false;
  }

  document.addEventListener('click', function (ev) {
    var trigger = ev.target.closest('.acc-trigger');
    if (trigger && container(trigger)) {
      var raiz = container(trigger);
      var aberto = trigger.getAttribute('aria-expanded') === 'true';

      if (!aberto && raiz.hasAttribute('data-acordeao-exclusivo')) {
        raiz.querySelectorAll('.acc-trigger[aria-expanded="true"]').forEach(function (outro) {
          if (outro !== trigger) fechar(outro);
        });
      }

      if (aberto) { fechar(trigger); } else { abrir(trigger); }
      return;
    }

    var opcao = ev.target.closest('.acc-opcao');
    if (!opcao) return;

    var raizOpcao = container(opcao);
    if (!raizOpcao || !raizOpcao.hasAttribute('data-acordeao-selecao')) return;

    raizOpcao.querySelectorAll('.acc-opcao[aria-checked="true"]').forEach(function (o) {
      o.setAttribute('aria-checked', 'false');
    });
    opcao.setAttribute('aria-checked', 'true');

    var painel = opcao.closest('.acc-panel');

    /* O evento sobe do container, não do botão: quem escuta quer
       saber "escolheram algo aqui dentro", e não precisa conhecer a
       árvore para isso. */
    raizOpcao.dispatchEvent(new CustomEvent('acordeao:escolha', {
      bubbles: true,
      detail: {
        valor: opcao.dataset.valor || opcao.textContent.trim(),
        categoria: painel ? (painel.dataset.categoria || null) : null,
        elemento: opcao
      }
    }));
  });

  /* Abre o acordeão que contém a opção já marcada — serve para
     reabrir a modal no estado em que ela foi fechada, sem o cliente
     ter de descobrir qual categoria destravar. */
  window.Acordeao = {
    revelarEscolhido: function (raiz) {
      if (!raiz) return;
      var marcado = raiz.querySelector('.acc-opcao[aria-checked="true"]');
      if (!marcado) return;
      var painel = marcado.closest('.acc-panel');
      if (!painel) return;
      var trigger = raiz.querySelector('[aria-controls="' + painel.id + '"]');
      if (trigger) abrir(trigger);
    }
  };
})();
