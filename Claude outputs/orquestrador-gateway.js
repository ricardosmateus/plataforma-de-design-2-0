/* ============================================================
   ORQUESTRADOR DE ATIVIDADES — Gateway
   ============================================================

   Ponte entre os gatilhos da Plataforma (botões em atividade.html
   e board.html) e a Skill Orquestrador de Atividades.

   O que faz:
   1. Monta o contexto completo (empresa, projeto, ideia, atividade,
      tarefas já existentes)
   2. Encaminha a solicitação ao Orquestrador
   3. Recebe o resultado do especialista
   4. Mostra o resultado na tela

   O que NÃO faz (por decisão da Skill): não valida ideia, não
   aprova nada, não executa o trabalho especializado.
   ============================================================ */

(function () {
  'use strict';

  /* ------------------------------------------------------------
     Toast — cada tela batizou o seu com um nome diferente.
     ------------------------------------------------------------
     atividade.html expõe `mostrarMensagemAtividade(msg)` (um
     argumento só); outras telas expõem `mostrarMensagem(msg, tipo)`.
     Chamar o nome errado não quebra nada visivelmente — só some, que
     foi exatamente o defeito da primeira versão deste arquivo: o
     fluxo rodava e nenhum aviso chegava à tela. */
  function toast(msg, tipo) {
    if (typeof window.mostrarMensagemAtividade === 'function') {
      window.mostrarMensagemAtividade(msg);
      return;
    }
    if (typeof window.mostrarMensagem === 'function') {
      window.mostrarMensagem(msg, tipo);
      return;
    }
    console.log('[Orquestrador]', msg);
  }

  /* ============================================================
     Montagem do contexto
     ============================================================ */

  function idsDaUrl() {
    var q = new URLSearchParams(location.search);
    return {
      empresa: q.get('empresa'),
      projeto: q.get('projeto'),
      ideia: q.get('ideia'),
      tarefa: q.get('tarefa')
    };
  }

  /* As tarefas já existentes na atividade, lidas do próprio quadro.
     A estrutura vem de cardHTML() em js/atividade.js:
     <ul class="task-list"> <li class="task" data-id data-tipo>
       … <h3 class="task-title"> <p class="task-desc"> … */
  function tarefasNaTela() {
    var itens = [];
    document.querySelectorAll('.task-list .task').forEach(function (card) {
      var titulo = card.querySelector('.task-title');
      var desc = card.querySelector('.task-desc');
      var status = card.querySelector('.task-status');
      if (!titulo) return;
      itens.push({
        id: card.dataset.id || null,
        tipo: card.dataset.tipo || null,
        nome: titulo.textContent.trim(),
        descricao: desc ? desc.textContent.trim() : '',
        /* "Resultado da tarefa" ainda não existe como campo — quando
           existir, é aqui que ele entra e vira memória da atividade. */
        resultado: null,
        concluida: !!(status && status.className.indexOf('task-status--done') !== -1)
      });
    });
    return itens;
  }

  /**
   * Monta a árvore de contexto que a Skill exige antes de encaminhar
   * qualquer pedido a um especialista.
   */
  function montarContexto() {
    var ids = idsDaUrl();
    var tituloEl = document.querySelector('.page-title');

    return {
      empresa: window.EmpresaAtual || (ids.empresa ? { id: ids.empresa } : null),
      projeto: window.ProjetoAtual || (ids.projeto ? { id: ids.projeto } : null),
      ideia: window.IdeiaAtual || (ids.ideia ? { id: ids.ideia } : null),
      atividade: {
        /* A atividade É a idéia nesta tela — atividade.html abre pelo
           id da idéia e o <h1> mostra o nome dela. */
        id: ids.ideia,
        nome: (window.IdeiaAtual && window.IdeiaAtual.titulo) ||
              (tituloEl ? tituloEl.textContent.trim() : ''),
        tarefa_aberta: ids.tarefa || null
      },
      tarefas_anteriores: tarefasNaTela()
    };
  }

  /* ============================================================
     Chamada ao Orquestrador
     ============================================================ */

  /**
   * @param {String} solicitacao - o pedido, como a pessoa escreveu
   * @param {String} gatilho - 'gerar_tarefa' | 'pesquisar'
   * @returns {Promise<Object>} resultado do especialista
   */
  function chamarOrquestrador(solicitacao, gatilho) {
    var contexto = montarContexto();

    /* Contexto menor NÃO bloqueia — é regra explícita da Skill
       ("Tratamento de contexto incompleto"). A primeira versão daqui
       rejeitava quando faltava qualquer peça, e como dois dos globais
       que ela checava nem existiam nesta tela, o pedido morria sempre
       antes de chegar ao especialista. Só a falta de empresa+projeto
       impede de fato montar qualquer coisa útil. */
    if (!contexto.empresa || !contexto.projeto) {
      return Promise.reject({
        dados: { mensagem: 'A atividade ainda não terminou de carregar. Tente de novo em instantes.' }
      });
    }

    console.log('[Orquestrador] pedido recebido', {
      gatilho: gatilho,
      empresa: contexto.empresa.nome || contexto.empresa.id,
      ideia: contexto.ideia && (contexto.ideia.titulo || contexto.ideia.id),
      atividade: contexto.atividade.nome,
      tarefas_anteriores: contexto.tarefas_anteriores.length,
      solicitacao: solicitacao
    });

    /* ------------------------------------------------------------
       PONTO DE LIGAÇÃO COM O BACKEND
       ------------------------------------------------------------
       Enquanto não existe rota de orquestração, devolve um resultado
       de demonstração que ESPELHA o contexto realmente montado — é o
       que permite conferir, olhando a tela, se o contexto chegou
       inteiro. Quando a rota existir, troque este bloco por:

         return API.chamar('/orquestrador', {
           metodo: 'POST',
           corpo: { gatilho: gatilho, solicitacao: solicitacao, contexto: contexto }
         });
       ------------------------------------------------------------ */
    return new Promise(function (resolve) {
      setTimeout(function () {
        var listaTarefas = contexto.tarefas_anteriores.length
          ? contexto.tarefas_anteriores.map(function (t, i) {
              return '  ' + (i + 1) + '. ' + t.nome +
                     (t.concluida ? ' — concluída' : ' — pendente');
            }).join('\n')
          : '  (nenhuma tarefa registrada ainda)';

        resolve({
          especialista: 'Product Designer',
          necessidade: 'diagnóstico de UX + proposta de solução',
          resultado:
            'CONTEXTO RECEBIDO PELO ORQUESTRADOR\n' +
            '------------------------------------\n' +
            'Empresa:   ' + ((contexto.empresa && (contexto.empresa.nome || contexto.empresa.id)) || '—') + '\n' +
            'Projeto:   ' + ((contexto.projeto && (contexto.projeto.nome || contexto.projeto.id)) || '—') + '\n' +
            'Idéia:     ' + ((contexto.ideia && (contexto.ideia.titulo || contexto.ideia.id)) || '—') + '\n' +
            'Atividade: ' + (contexto.atividade.nome || '—') + '\n\n' +
            'Tarefas já na atividade (' + contexto.tarefas_anteriores.length + '):\n' +
            listaTarefas + '\n\n' +
            'Solicitação:\n  "' + solicitacao + '"\n\n' +
            'ENCAMINHAMENTO\n' +
            '------------------------------------\n' +
            'Necessidade identificada: diagnóstico de UX + proposta de solução\n' +
            'Especialista escolhido:   Product Designer\n\n' +
            'O especialista ainda não está ligado a um backend, então o\n' +
            'diagnóstico e a proposta não são produzidos aqui. O que esta\n' +
            'tela confirma é que o contexto acima chegou inteiro — que era\n' +
            'a parte que faltava para o especialista não trabalhar às cegas.',
          contexto: contexto
        });
      }, 400);
    });
  }

  /* ============================================================
     Exibição do resultado
     ============================================================ */

  function modalResultado() {
    var existente = document.getElementById('orqResultadoModal');
    if (existente) return existente;

    var dlg = document.createElement('dialog');
    dlg.id = 'orqResultadoModal';
    dlg.setAttribute('aria-labelledby', 'orqResultadoTitulo');
    dlg.innerHTML =
      '<div class="orq-head">' +
        '<div>' +
          '<h2 id="orqResultadoTitulo">Resultado</h2>' +
          '<p class="orq-sub" id="orqResultadoSub"></p>' +
        '</div>' +
        '<button type="button" class="orq-x" data-orq-fechar aria-label="Fechar">&times;</button>' +
      '</div>' +
      '<pre class="orq-corpo" id="orqResultadoCorpo"></pre>' +
      '<div class="orq-pe">' +
        '<button type="button" class="btn btn--secondary" data-orq-fechar>Fechar</button>' +
      '</div>';

    var css = document.createElement('style');
    css.textContent =
      '#orqResultadoModal{width:min(680px,92vw);max-height:82vh;padding:0;border:none;' +
      'border-radius:var(--radius-lg,12px);background:var(--surface-2,#fff);' +
      'color:var(--text-primary,#111);box-shadow:var(--shadow-lg,0 12px 48px rgba(0,0,0,.18));' +
      'font:inherit;display:flex;flex-direction:column;overflow:hidden}' +
      '#orqResultadoModal::backdrop{background:rgba(0,0,0,.45)}' +
      '#orqResultadoModal .orq-head{display:flex;align-items:flex-start;justify-content:space-between;' +
      'gap:16px;padding:24px 24px 12px}' +
      '#orqResultadoModal h2{font-size:20px;line-height:28px;font-weight:600;margin:0}' +
      '#orqResultadoModal .orq-sub{margin:4px 0 0;font-size:13px;color:var(--text-secondary,#666)}' +
      '#orqResultadoModal .orq-x{font-size:24px;line-height:1;width:32px;height:32px;flex:0 0 32px;' +
      'border:none;background:none;cursor:pointer;color:var(--text-secondary,#666);border-radius:var(--radius,8px)}' +
      '#orqResultadoModal .orq-x:hover{background:var(--surface-1,#f2f2f2)}' +
      '#orqResultadoModal .orq-corpo{margin:0;padding:0 24px;overflow:auto;flex:1;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.65;' +
      'white-space:pre-wrap;word-break:break-word;color:var(--text-primary,#111)}' +
      '#orqResultadoModal .orq-pe{display:flex;justify-content:flex-end;gap:12px;padding:16px 24px 24px}';

    document.head.appendChild(css);
    document.body.appendChild(dlg);

    dlg.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-orq-fechar]') || ev.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', function () {
      document.body.classList.remove('modal-open');
    });

    return dlg;
  }

  function exibirResultado(resultado) {
    console.log('[Orquestrador] resultado', resultado);

    var dlg = modalResultado();
    dlg.querySelector('#orqResultadoTitulo').textContent =
      'Resultado — ' + resultado.especialista;
    dlg.querySelector('#orqResultadoSub').textContent =
      'Necessidade identificada: ' + resultado.necessidade;
    dlg.querySelector('#orqResultadoCorpo').textContent = resultado.resultado;

    /* Um <dialog> já aberto lança InvalidStateError em showModal(). */
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-open');
  }

  function tratarErro(e, fallback) {
    var msg = e && e.rede
      ? 'Não conseguimos falar com o servidor. Verifique sua conexão.'
      : (e && e.dados && e.dados.mensagem) || fallback;
    console.error('[Orquestrador]', msg, e);
    toast(msg, 'erro');
  }

  /* ============================================================
     GATILHO 1 — "Gerar com ajuda da IA" (atividade.html)
     ============================================================ */

  function conectarGatilho1() {
    var btn = document.getElementById('generateWithAIBtn');
    if (!btn) return false;

    /* O listener original (fechar modal → abrir modal de geração)
       está registrado pelo <script> inline da página. Clonar o nó é
       o jeito de trocá-lo sem editar aquele bloco. */
    var novo = btn.cloneNode(true);
    btn.parentNode.replaceChild(novo, btn);

    novo.addEventListener('click', function () {
      var tituloEl = document.getElementById('taskTitle');
      var descEl = document.getElementById('taskDesc');
      var tipoEl = document.getElementById('taskTipo');

      var titulo = tituloEl ? tituloEl.value.trim() : '';
      if (!titulo) {
        toast('Descreva o que você precisa antes de pedir ajuda da IA.', 'erro');
        if (tituloEl) tituloEl.focus();
        return;
      }
      var descricao = descEl ? descEl.value.trim() : '';
      var tipo = tipoEl ? tipoEl.value : 'pesquisa';

      /* Fecha o modal de nova tarefa: dois <dialog> modais abertos ao
         mesmo tempo fariam o showModal() do resultado falhar. */
      var taskModal = document.getElementById('taskModal');
      if (taskModal && taskModal.open) taskModal.close();
      document.body.classList.remove('modal-open');

      novo.disabled = true;
      toast('Analisando o contexto da atividade…');

      chamarOrquestrador(titulo + (descricao ? '\n\n' + descricao : ''), 'gerar_tarefa')
        .then(function (resultado) {
          exibirResultado(resultado);

          /* A tarefa é criada de verdade: AtividadeAcoes.criar já
             insere o card em .task-list e dá o toast de sucesso. */
          if (window.AtividadeAcoes && window.AtividadeAcoes.criar) {
            return window.AtividadeAcoes.criar(
              titulo,
              descricao || 'Tarefa encaminhada pelo Orquestrador ao especialista ' + resultado.especialista + '.',
              tipo
            ).catch(function () {
              /* AtividadeAcoes.criar já avisou o usuário. */
            });
          }
        })
        .catch(function (e) {
          tratarErro(e, 'Não foi possível processar o pedido.');
        })
        .then(function () {
          novo.disabled = false;
        });
    });

    return true;
  }

  /* ============================================================
     GATILHO 2 — "Pesquisar" (board.html)
     ============================================================ */

  function conectarGatilho2() {
    var btn = document.getElementById('btnGerarIA');
    if (!btn) return false;

    /* Aqui NÃO se clona: o botão já tem o fluxo real de pesquisa
       (PesquisaPainel) ligado a ele, e derrubá-lo tiraria da tela a
       única busca que hoje funciona de verdade. Este listener roda
       na fase de captura só para registrar o encaminhamento que o
       Orquestrador faria — quando os especialistas existirem, é aqui
       que o preventDefault entra. */
    btn.addEventListener('click', function () {
      chamarOrquestrador(
        'Pesquisar no contexto desta tarefa.',
        'pesquisar'
      ).catch(function () { /* silencioso: não atrapalha a busca real */ });
    }, true);

    return true;
  }

  /* ============================================================
     Inicialização
     ============================================================ */

  function iniciar() {
    var g1 = conectarGatilho1();
    var g2 = conectarGatilho2();
    console.log('[Orquestrador] gateway pronto —',
      'gatilho 1 (gerar com IA):', g1 ? 'conectado' : 'ausente nesta tela,',
      '| gatilho 2 (pesquisar):', g2 ? 'conectado' : 'ausente nesta tela');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.OrquestradorGateway = {
    montarContexto: montarContexto,
    chamarOrquestrador: chamarOrquestrador,
    exibirResultado: exibirResultado
  };
})();
