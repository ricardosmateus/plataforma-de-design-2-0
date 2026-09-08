/* ============================================================
   ASSISTENTE DE IA — painel de visao_do_projeto.html
   ============================================================
   Regras: Regras_de_negocio/modulos/ia/

     IA-CONV-002  a conversa persiste
     IA-CONV-006  começa vazia, com convite — nada de conversa falsa
     IA-CONV-008  "pensando" é estado visível
     IA-CONV-010  falha preserva a pergunta digitada
     IA-GARANT    a procedência aparece marcada, e o servidor é quem
                  decide o que valia
     IA-ACAO      o assistente pode PROPOR criar/editar/mover uma
                  idéia, mas só a pessoa confirma — nunca executa
                  sozinho

   Este arquivo desenha a conversa e fala com a API. Ele NÃO decide
   o que é verdade nem executa ação nenhuma no quadro: quem decide é
   o servidor, e o que chega aqui em `fontes`/`acao` já vem
   verificado. Os botões de Confirmar/Descartar só existem para dar
   à pessoa um jeito explícito de autorizar — ou não — o que a rota
   de confirmação vai escrever de verdade.
   ============================================================ */

(function () {
  'use strict';

  var thread = document.getElementById('iaThread');
  var campo = document.getElementById('assistantInput');
  var enviar = document.getElementById('iaEnviar');
  var aviso = document.getElementById('iaAviso');

  /* A página de idéias pode existir sem o painel (ele é opcional no
     desenho). Sem os elementos, este arquivo não faz nada. */
  if (!thread || !campo || !enviar) return;

  var carregando = false;
  var pensando = false;
  var iaDisponivel = true;

  function base() {
    var e = window.EmpresaAtual;
    var p = window.ProjetoAtual;
    if (!e || !p) return null;
    return '/empresas/' + encodeURIComponent(e.id) + '/projetos/' + encodeURIComponent(p.id) + '/ia';
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Quebra de linha da pessoa precisa sobreviver, mas só depois de
     escapar — na ordem inversa, um <br> digitado viraria marcação. */
  function comQuebras(t) {
    return escapar(t).replace(/\n/g, '<br>');
  }

  function definirAviso(texto) {
    aviso.textContent = texto || '';
  }

  /* ------------------------------------------------------------
     Desenho
     ------------------------------------------------------------ */
  var ICON_BOT =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-.9 0-1.8-.1-2.6-.3l-4.9 1.6 1.3-3.8c-1.4-1.2-2.3-2.8-2.3-4.5 0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_BUSSOLA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>';
  var ICON_ALERTA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/></svg>';
  var ICON_CARTAO =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 9.5h17"/></svg>';

  /* IA-GARANT: as marcações. O rótulo diz o que a idéia É segundo o
     servidor (`categoriaReal`), nunca o que o modelo alegou. Quando
     as duas divergem, o texto diz isso na cara — é o caso que a
     regra do quadro existe para pegar. */
  function fontes(lista) {
    if (!lista || !lista.length) return '';
    var itens = lista
      .map(function (f) {
        var validada = f.categoriaReal === 'validada';
        var rotulo = validada ? 'Validada' : 'Não validada';
        if (f.rebaixada) rotulo = 'Não validada — citada como fato';
        return (
          '<span class="ia-fonte ia-fonte--' + (validada ? 'validada' : 'hipotese') + '">' +
          (validada ? ICON_CHECK : ICON_ALERTA) + escapar(rotulo) +
          '</span>'
        );
      })
      .join('');
    return '<div class="ia-fontes">' + itens + '</div>';
  }

  /* Duas situações diferentes chegam com `sem_verdade_validada`, e
     merecem enquadramentos diferentes:

       · a resposta se APOIOU em idéias não validadas → é um alerta,
         porque algo foi usado como base sem estar validado;
       · a resposta não citou fonte nenhuma → é orientação
         (IA-VAZIO-005), e o alerta soaria como acusação sobre uma
         sugestão que nunca alegou ser fato.

     A distinção sai de dado que o servidor já manda — a lista de
     fontes estar vazia ou não. Nenhuma das duas depende de o modelo
     classificar a própria resposta, que é exatamente o tipo de
     autodeclaração em que não podemos confiar. */
  function avisoSemVerdade(temFontes) {
    if (temFontes) {
      return (
        '<div class="ia-sem-verdade">' + ICON_ALERTA +
        '<span>Esta resposta se apoia em idéias ainda não validadas. Só o que está em “Finalizado” vale como verdade do projeto.</span>' +
        '</div>'
      );
    }
    return (
      '<div class="ia-sem-verdade ia-sem-verdade--guia">' + ICON_BUSSOLA +
      '<span>Este projeto ainda não tem idéias validadas. O que vem abaixo são sugestões de ponto de partida — nada disso é fato do projeto até virar idéia e ir para “Finalizado”.</span>' +
      '</div>'
    );
  }

  /* IA-ACAO-009: o modelo às vezes alega ter criado/editado/movido um
     card sem propor a ação de verdade (ex.: responder "ok" produz
     "Card criado!" no texto, mas sem confirmação nenhuma por trás).
     O servidor já verificou isso; aqui só se avisa — sem reescrever
     a frase do modelo, mesmo princípio de IA-GARANT-005. */
  function avisoAcaoNaoExecutada() {
    return (
      '<div class="ia-sem-verdade">' + ICON_ALERTA +
      '<span>O texto abaixo pode estar equivocado: nada foi criado, editado ou movido no quadro ainda. Peça a ação de novo, ou confirme pelo botão de uma sugestão anterior nesta conversa.</span>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------
     Ação proposta — IA-ACAO
     ------------------------------------------------------------
     A IA NUNCA executa: `m.acao` chega da mensagem já verificado
     pelo servidor, e o que este bloco desenha é sempre uma escolha
     pendente da pessoa (ou o registro do que ela já escolheu). Os
     dois botões chamam rotas próprias — não existe caminho em que
     digitar "sim" no chat mova um card sozinho.
     ------------------------------------------------------------ */
  var ROTULO_COLUNA = { ideias: 'Minhas idéias', andamento: 'Em andamento', finalizado: 'Finalizado' };

  function resumoAcao(a) {
    var d = a.dados || {};
    if (a.tipo === 'criar_ideia') {
      return 'Criar “' + (d.titulo || '') + '” — ' + (d.descricao || '');
    }
    if (a.tipo === 'editar_ideia') {
      return 'Editar para “' + (d.titulo || '') + '” — ' + (d.descricao || '');
    }
    if (a.tipo === 'mover_ideia') {
      return 'Mover para “' + (ROTULO_COLUNA[d.status] || d.status) + '”.';
    }
    return '';
  }

  function textoFeito(tipo) {
    if (tipo === 'criar_ideia') return 'Idéia criada no quadro.';
    if (tipo === 'editar_ideia') return 'Idéia atualizada no quadro.';
    if (tipo === 'mover_ideia') return 'Idéia movida no quadro.';
    return 'Feito.';
  }

  function blocoAcao(m) {
    var a = m.acao;
    if (!a) return '';

    if (a.status === 'confirmada') {
      return '<div class="ia-acao ia-acao--feita">' + ICON_CHECK + '<span>' + escapar(textoFeito(a.tipo)) + '</span></div>';
    }
    if (a.status === 'descartada') {
      return '<div class="ia-acao ia-acao--descartada"><span>Sugestão descartada.</span></div>';
    }
    /* pendente: só aqui aparecem botões — é o único estado em que
       a confirmação ainda vale (IA-ACAO-006). */
    return (
      '<div class="ia-acao" data-mensagem-id="' + escapar(m.id) + '">' +
      '<div class="ia-acao-corpo">' + ICON_CARTAO + '<span>' + escapar(resumoAcao(a)) + '</span></div>' +
      '<div class="ia-acao-botoes">' +
      '<button type="button" class="ia-acao-btn ia-acao-btn--confirmar" data-acao="confirmar">Confirmar</button>' +
      '<button type="button" class="ia-acao-btn ia-acao-btn--descartar" data-acao="descartar">Descartar</button>' +
      '</div>' +
      '</div>'
    );
  }

  function bolha(m) {
    if (m.autor === 'pessoa') {
      return (
        '<article class="msg msg--user">' +
        '<span class="msg-avatar"><img src="https://i.pravatar.cc/80?img=47" alt=""></span>' +
        '<p class="msg-bubble">' + comQuebras(m.texto) + '</p>' +
        '</article>'
      );
    }
    return (
      '<article class="msg msg--bot">' +
      '<span class="msg-avatar msg-avatar--bot" aria-hidden="true">' + ICON_BOT + '</span>' +
      '<div>' +
      (m.sem_verdade_validada ? avisoSemVerdade(!!(m.fontes && m.fontes.length)) : '') +
      (m.alerta_acao_sem_proposta ? avisoAcaoNaoExecutada() : '') +
      '<p class="msg-bubble">' + comQuebras(m.texto) + '</p>' +
      fontes(m.fontes) +
      blocoAcao(m) +
      '</div>' +
      '</article>'
    );
  }

  function convite() {
    return (
      '<div class="ia-convite">' +
      '<b>Por onde começar?</b>' +
      '<span>Se o quadro ainda está vazio, peça sugestões de primeiros passos — pesquisar concorrentes, mapear o público, escrever as primeiras hipóteses. O assistente trata como verdade apenas o que está em “Finalizado”; o resto vem sempre marcado.</span>' +
      '</div>'
    );
  }

  var mensagens = [];

  function desenhar(extra) {
    var corpo = mensagens.length ? mensagens.map(bolha).join('') : convite();
    thread.innerHTML = corpo + (extra || '');
    thread.scrollTop = thread.scrollHeight;
  }

  function mostrarPensando() {
    desenhar('<div class="ia-pensando" aria-label="Pensando"><span></span><span></span><span></span></div>');
  }

  function mostrarErro(msg) {
    desenhar('<div class="ia-erro">' + escapar(msg) + '</div>');
  }

  function atualizarCompositor() {
    var travado = carregando || pensando || !iaDisponivel;
    enviar.disabled = travado;
    campo.disabled = travado;
  }

  /* ------------------------------------------------------------
     API
     ------------------------------------------------------------ */
  function chamarComRenovacao(caminho, opcoes, jaRenovou) {
    return API.chamar(caminho, opcoes).catch(function (e) {
      if (e.status === 401 && !jaRenovou) {
        return API.chamar('/auth/sessao').then(
          function () { return chamarComRenovacao(caminho, opcoes, true); },
          function () { throw e; }
        );
      }
      throw e;
    });
  }

  function mensagemDeFalha(e) {
    if (e.rede) return 'Não conseguimos falar com o servidor.';
    if (e.status === 402) return 'Sem créditos para usar o assistente.';
    return (e.dados && e.dados.mensagem) || 'Não foi possível falar com o assistente.';
  }

  function carregar() {
    var b = base();
    if (!b) return;

    carregando = true;
    atualizarCompositor();
    thread.setAttribute('aria-busy', 'true');

    chamarComRenovacao(b + '/conversa', {}, false).then(
      function (r) {
        mensagens = (r && r.mensagens) || [];
        iaDisponivel = !(r && r.ia_disponivel === false);
        if (!iaDisponivel) {
          definirAviso('Assistente ainda não configurado neste ambiente.');
        }
        carregando = false;
        thread.setAttribute('aria-busy', 'false');
        atualizarCompositor();
        desenhar();
      },
      function (e) {
        carregando = false;
        thread.setAttribute('aria-busy', 'false');
        atualizarCompositor();
        /* 401/403/404 aqui não são tratados com redirecionamento: a
           página inteira já é governada por js/ideias.js, e dois
           arquivos disputando o mesmo redirect produziriam saltos
           imprevisíveis. Aqui o painel só se declara indisponível. */
        mostrarErro(mensagemDeFalha(e));
      }
    );
  }

  function perguntar() {
    var b = base();
    var texto = campo.value.trim();
    if (!b || !texto || pensando || !iaDisponivel) return;

    /* Otimista só na pergunta: ela é da pessoa e não depende de
       verificação nenhuma. A resposta, essa, só aparece depois de o
       servidor conferir a procedência. */
    mensagens.push({ autor: 'pessoa', texto: texto });
    pensando = true;
    definirAviso('');
    atualizarCompositor();
    mostrarPensando();

    chamarComRenovacao(b + '/perguntas', { metodo: 'POST', corpo: { pergunta: texto } }, false).then(
      function (r) {
        pensando = false;
        campo.value = '';
        atualizarCompositor();
        if (r && r.mensagem) mensagens.push(r.mensagem);
        desenhar();
        campo.focus();
      },
      function (e) {
        pensando = false;
        /* IA-CONV-010: a pergunta digitada NÃO é apagada. Quem
           acabou de escrever um parágrafo e viu a rede cair não pode
           ser obrigado a escrever de novo. */
        mensagens.pop();
        atualizarCompositor();
        if (e.status === 402) definirAviso('Sem créditos para usar o assistente.');
        mostrarErro(mensagemDeFalha(e));
        campo.focus();
      }
    );
  }

  /* ------------------------------------------------------------
     Confirmar / descartar uma ação proposta — IA-ACAO-004 a 006
     ------------------------------------------------------------
     Delegado em `thread`, e não um listener por botão: os balões
     são inteiramente reconstruídos a cada `desenhar()` via
     innerHTML, então um listener preso a um botão específico
     morreria no redesenho seguinte. */
  function responderAcao(mensagemId, tipo, botoesDoCartao) {
    var b = base();
    if (!b) return;

    for (var i = 0; i < botoesDoCartao.length; i++) botoesDoCartao[i].disabled = true;

    var caminho = b + '/mensagens/' + encodeURIComponent(mensagemId) + '/' + tipo;
    chamarComRenovacao(caminho, { metodo: 'POST' }, false).then(
      function (r) {
        for (var i = 0; i < mensagens.length; i++) {
          if (mensagens[i].id === mensagemId) { mensagens[i] = r.mensagem; break; }
        }
        desenhar();

        /* Só criar/editar/mover confirmados tocam o quadro — descartar
           não muda idéia nenhuma, só o estado da própria mensagem. */
        if (r.ideia) {
          try {
            if (!window.IdeiasView) throw new Error('IdeiasView indisponível');
            if (r.mensagem.acao && r.mensagem.acao.tipo === 'criar_ideia') {
              window.IdeiasView.acrescentar(r.ideia);
            } else {
              window.IdeiasView.atualizar(r.ideia);
            }
            window.IdeiasView.anunciar('“' + r.ideia.titulo + '” atualizada a partir do assistente.');
          } catch (erroQuadro) {
            /* A idéia já foi escrita no servidor — a criação/edição/
               movimentação não falhou. O que pode ter falhado é só a
               atualização otimista na tela, e isso NUNCA pode deixar
               o quadro desatualizado silenciosamente: recarrega do
               servidor, que é sempre a verdade. */
            if (window.console && window.console.error) {
              window.console.error('IA-ACAO: atualização otimista do quadro falhou, recarregando', erroQuadro);
            }
            if (window.recarregarIdeias) window.recarregarIdeias();
          }
        }
      },
      function (e) {
        for (var i = 0; i < botoesDoCartao.length; i++) botoesDoCartao[i].disabled = false;
        /* 409/422: a sugestão não vale mais (já respondida, ou a
           idéia sumiu enquanto a pessoa pensava). Recarrega a
           conversa para mostrar o estado de verdade. */
        if (e.status === 409 || e.status === 422) carregar();
        if (window.mostrarMensagem) window.mostrarMensagem(mensagemDeFalha(e), 'erro');
      }
    );
  }

  thread.addEventListener('click', function (e) {
    var botao = e.target.closest ? e.target.closest('.ia-acao-btn') : null;
    if (!botao) return;

    var cartao = botao.closest('.ia-acao');
    var mensagemId = cartao && cartao.getAttribute('data-mensagem-id');
    if (!mensagemId) return;

    var tipo = botao.getAttribute('data-acao') === 'confirmar' ? 'confirmar' : 'descartar';
    responderAcao(mensagemId, tipo, cartao.querySelectorAll('.ia-acao-btn'));
  });

  enviar.addEventListener('click', perguntar);

  /* Enter envia, Shift+Enter quebra linha — convenção de todo chat.
     Sem isso, a pessoa aperta Enter esperando enviar e ganha uma
     linha em branco. */
  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      perguntar();
    }
  });

  /* O painel só carrega depois que js/ideias.js resolveu empresa e
     projeto — é de lá que sai o endereço das chamadas. */
  window.IaAssistente = { carregar: carregar };
})();
