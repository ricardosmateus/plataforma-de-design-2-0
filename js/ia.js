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

  /* ------------------------------------------------------------
     O modo caderno — Fase 3a
     ------------------------------------------------------------
     Quando ligado, o que a pessoa escreve não vai ao assistente do
     projeto: vai à investigação que ela está lendo, e é respondido
     SÓ com as fontes que aquela busca trouxe.

     Por que um modo, e não um roteador que adivinha: as duas
     perguntas parecem iguais ("e quantas lojas eles têm?") e têm
     respostas de naturezas diferentes — uma lê o conhecimento da
     empresa, a outra não pode sair de um material fechado. Um
     roteador que escolhe sozinho erraria em silêncio, e a pessoa não
     teria como saber qual dos dois respondeu. O modo é ligado por
     gesto e fica VISÍVEL enquanto durar. */
  var caderno = null;

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

    /* IDEIA-DUPL na porta da IA (16/09/2026). `m.avisoDuplicata` é
       campo do CLIENTE, não do servidor: aparece quando a pessoa já
       clicou em "Confirmar" e o servidor respondeu "achei uma
       parecida, não gravei nada". A sugestão continua pendente, e o
       "Confirmar" vira "Criar mesmo assim" — a mesma escolha de duas
       saídas do alerta da tela do quadro (IDEIA-DUPL-006), dita em
       linha, do jeito da conversa.

       Fica dentro do cartão, e não num toast, porque a decisão é
       sobre ESTA sugestão: tirar o aviso de perto dela obrigaria a
       pessoa a lembrar a qual das mensagens ele se referia. */
    var d = m.avisoDuplicata;
    var rotuloConfirmar = d
      ? (a.tipo === 'editar_ideia' ? 'Salvar mesmo assim' : 'Criar mesmo assim')
      : 'Confirmar';

    return (
      '<div class="ia-acao" data-mensagem-id="' + escapar(m.id) + '">' +
      '<div class="ia-acao-corpo">' + ICON_CARTAO + '<span>' + escapar(resumoAcao(a)) + '</span></div>' +
      (d
        ? '<p class="ia-acao-duplicata">Já existe uma idéia parecida: “' + escapar(d.titulo)
          + '”, em ' + escapar(ROTULO_COLUNA[d.status] || d.status) + '. Nada foi gravado.</p>'
        : '') +
      '<div class="ia-acao-botoes">' +
      /* Links, e não botões (decisão do Ricardo, 16/09/2026): dentro
         da conversa, um botão sólido é um objeto no meio do texto.
         As classes vêm do sistema — `.link--sublinhado` e, no "não
         fazer", `.link--apoio` —, e o elemento continua sendo
         `<button>` porque o clique acontece AQUI; um `<a>` sem `href`
         não é link para leitor de tela nenhum. */
      '<button type="button" class="link link--sublinhado ia-acao-btn ia-acao-btn--confirmar" data-acao="confirmar">'
      + escapar(rotuloConfirmar) + '</button>' +
      '<button type="button" class="link link--sublinhado link--apoio ia-acao-btn ia-acao-btn--descartar" data-acao="descartar">Descartar</button>' +
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
      '<article class="msg msg--bot' + (m.caderno ? ' msg--caderno' : '') + '">' +
      '<span class="msg-avatar msg-avatar--bot" aria-hidden="true">' + ICON_BOT + '</span>' +
      '<div>' +
      (m.sem_verdade_validada ? avisoSemVerdade(!!(m.fontes && m.fontes.length)) : '') +
      (m.alerta_acao_sem_proposta ? avisoAcaoNaoExecutada() : '') +
      /* Dito na resposta, e não só no compositor: quem rolar a
         conversa depois precisa saber que ESTA resposta não leu o
         conhecimento da empresa — leu as fontes de uma busca. */
      (m.caderno ? '<span class="msg-origem">Respondido com as fontes da investigação</span>' : '') +
      '<p class="msg-bubble">' + comQuebras(m.texto) + '</p>' +
      fontes(m.fontes) +
      /* O custo saiu daqui em 15/09/2026 (decisão do Ricardo): valor
         aparece num lugar só, em Configurações → Créditos de uso →
         Histórico de uso. Mostrá-lo aqui espalhava o mesmo número por
         várias jornadas — e o preço colado na resposta não ajudava a
         decidir nada, porque a decisão já tinha sido tomada. */
      (m.cortado ? '<span class="msg-origem">Parte do material ficou de fora por limite de tamanho.</span>' : '') +
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

  /* ------------------------------------------------------------
     A ORDEM DA CONVERSA
     ------------------------------------------------------------
     Mensagens e narrações vivem em listas separadas — e isso é regra,
     não arrumação (ver o bloco da narração logo abaixo). Mas a TELA é
     uma só, e até 16/09/2026 ela desenhava todas as mensagens e depois
     todas as narrações. O efeito: uma investigação de ontem aparecia
     DEPOIS de uma pergunta feita agora, sempre grudada no fim. A
     pessoa mandava uma mensagem e a narração pulava para baixo dela.

     `ordem` é um contador que cresce e é carimbado no item quando ele
     ENTRA na tela — não importa de que lista ele venha. Desenhar pela
     ordem devolve a sequência da conversa sem juntar as duas listas,
     que é justamente o que não pode acontecer.

     Por que um contador e não a data: mensagem vinda do servidor tem
     data, mensagem otimista (a pergunta que acabou de ser digitada)
     não tem, e narração tem `inicio` em outro relógio. Um contador
     único responde a única pergunta que importa aqui — o que veio
     antes do quê — sem depender de três fontes de tempo concordarem. */
  var proximaOrdem = 1;

  function comOrdem(item) {
    if (item && item.ordem == null) item.ordem = proximaOrdem++;
    return item;
  }

  /* ------------------------------------------------------------
     A narração da investigação — IA-CONV-NARRA
     ------------------------------------------------------------
     Lista SEPARADA de `mensagens`, e essa separação é a regra, não
     uma escolha de organização.

     `mensagens` é a conversa: ela é persistida em `ia_mensagens`, e
     o servidor a relê para montar o contexto das perguntas
     seguintes (IA-CONV-004). Uma linha de progresso que entrasse
     ali seria paga em tokens em toda pergunta futura, e o modelo
     teria que adivinhar quem disse "buscando 2 de 4".

     Aqui, isso não pode acontecer por construção: a narração nunca
     entra em `mensagens`, nunca é enviada em lugar nenhum, e morre
     com a aba. É desenho de tela, não fala de ninguém
     (IA-CONV-NARRA-002/003).

     Ela vive nesta lista e não em DOM solto porque `desenhar()`
     reescreve o `innerHTML` inteiro a cada mudança — DOM anexado
     por fora sumiria na primeira resposta do assistente. */
  var narracoes = [];

  function narracaoPorId(id) {
    for (var i = 0; i < narracoes.length; i++) {
      if (narracoes[i].id === id) return narracoes[i];
    }
    return null;
  }

  function segundosDe(n) {
    return Math.floor(((n.fim || Date.now()) - n.inicio) / 1000);
  }

  /* Só o tempo, e sem redesenhar nada: um `desenhar()` por segundo
     destruiria os botões de saída no meio de um clique. */
  function pintarTempos() {
    var vivos = 0;
    for (var i = 0; i < narracoes.length; i++) {
      var n = narracoes[i];
      if (n.estado !== 'correndo') continue;
      vivos++;
      var alvo = thread.querySelector('[data-tempo="' + n.id + '"]');
      if (alvo) alvo.textContent = segundosDe(n) + 's';
    }
    if (!vivos && relogio) { clearInterval(relogio); relogio = null; }
  }

  var relogio = null;

  function ligarRelogio() {
    if (relogio) return;
    relogio = setInterval(pintarTempos, 1000);
  }

  var ICONE_ESTADO = {
    correndo: '🔎',
    ok: '✅',
    falha: '⚠️',
    parada: '⏸️',
    /* `aguardando` não é `parada`: parada é o assistente dizendo que
       não dá para seguir, aguardando é ele esperando VOCÊ. A mão
       levantada diz "sua vez" — e a diferença importa porque só uma
       das duas tem dinheiro do outro lado do botão. */
    aguardando: '✋',
  };

  function narracaoHtml(n) {
    var passos = n.passos.length
      ? '<ul class="ia-narracao-passos">' +
        n.passos.map(function (t) { return '<li>' + escapar(t) + '</li>'; }).join('') +
        '</ul>'
      : '';

    /* O tempo continua visível depois de terminar: quanto uma
       investigação demorou é informação, e apagá-la no fim deixaria
       a pessoa sem saber se foram 4 segundos ou 40. */
    var tempo = '<span class="ia-narracao-tempo" data-tempo="' + escapar(n.id) + '">' +
      segundosDe(n) + 's</span>';

    var fecho = n.fecho
      ? '<p class="ia-narracao-fecho">' + escapar(n.fecho) + '</p>'
      : '';

    /* BOARD-PESQUISA-012 chegando na tela: a recusa vem com o que
       dá para fazer, e o botão manda de volta com `nivelConfirmado`.
       O texto e as opções vêm do servidor (`pesquisa/saidas.ts`) —
       a tela desenha, não redige. */
    var saidas = (n.saidas && n.saidas.length)
      ? '<div class="ia-narracao-saidas">' +
        n.saidas.map(function (s) {
          /* Saída com `href` é uma ida a outra tela, não uma ação
             aqui dentro — então é um link, e não um botão que
             teleporta. Três coisas vêm de graça com isso: a pessoa
             vê para onde vai antes de clicar, pode abrir em outra
             aba sem perder a investigação que está lendo, e o
             teclado trata como navegação, que é o que é. */
          var CLASSES = 'link link--sublinhado ia-narracao-btn';
          var miolo = s.href
            ? '<a class="' + CLASSES + '" href="' + escapar(s.href) + '">' + escapar(s.rotulo) + '</a>'
            : '<button type="button" class="' + CLASSES + '" ' +
              'data-narracao-saida="' + escapar(s.nivel) + '" ' +
              'data-narracao="' + escapar(n.id) + '">' + escapar(s.rotulo) + '</button>';
          return miolo +
            '<span class="ia-narracao-exp">' + escapar(s.explicacao || '') + '</span>';
        }).join('') +
        '</div>'
      : '';

    return (
      '<section class="ia-narracao ia-narracao--' + escapar(n.estado) + '" ' +
      'data-narracao="' + escapar(n.id) + '" aria-live="polite">' +
      '<div class="ia-narracao-topo">' +
      '<span class="ia-narracao-icone" aria-hidden="true">' + (ICONE_ESTADO[n.estado] || '🔎') + '</span>' +
      '<span class="ia-narracao-titulo">' + escapar(n.titulo) + '</span>' +
      tempo +
      '</div>' +
      '<p class="ia-narracao-tarefa">' + escapar(n.tarefa) + '</p>' +
      passos +
      fecho +
      saidas +
      '</section>'
    );
  }

  function desenhar(extra) {
    var temConversa = mensagens.length > 0;

    /* Uma fila só, na ordem em que as coisas aconteceram. As duas
       listas continuam separadas na memória — o que se junta aqui é
       só o desenho. */
    var itens = [];
    var i;
    for (i = 0; i < mensagens.length; i++) {
      itens.push({ ordem: mensagens[i].ordem || 0, html: bolha(mensagens[i]) });
    }
    for (i = 0; i < narracoes.length; i++) {
      itens.push({ ordem: narracoes[i].ordem || 0, html: narracaoHtml(narracoes[i]) });
    }
    itens.sort(function (a, b) { return a.ordem - b.ordem; });

    var corpo = itens.map(function (x) { return x.html; }).join('');

    /* O convite sai de cena quando há uma investigação correndo:
       "por onde começar?" ao lado de uma busca em andamento é
       conselho para quem já começou. */
    if (!temConversa && !narracoes.length) corpo = convite();

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
    desenharMarcaCaderno();
  }

  /* A marca fica ENTRE a conversa e o campo, onde o olho passa antes
     de digitar. Um modo que muda para onde a pergunta vai não pode
     ser invisível — e sair dele tem que custar um clique, não uma
     descoberta. */
  function desenharMarcaCaderno() {
    var atual = document.getElementById('iaMarcaCaderno');
    if (!caderno) {
      if (atual) atual.remove();
      campo.setAttribute('placeholder', campo.dataset.placeholderOriginal || campo.placeholder || '');
      return;
    }

    if (!campo.dataset.placeholderOriginal) {
      campo.dataset.placeholderOriginal = campo.getAttribute('placeholder') || '';
    }
    campo.setAttribute('placeholder', 'Pergunte sobre as fontes desta investigação…');

    if (!atual) {
      atual = document.createElement('div');
      atual.id = 'iaMarcaCaderno';
      atual.className = 'ia-marca-caderno';
      campo.parentNode.insertBefore(atual, campo);
    }
    atual.innerHTML =
      '<span class="ia-marca-caderno-txt">Perguntando às fontes de: <b>' +
      escapar(caderno.rotulo || 'investigação') + '</b></span>' +
      '<button type="button" class="ia-marca-caderno-sair" id="iaSairCaderno" ' +
      'aria-label="Voltar a falar com o assistente do projeto">✕</button>';

    var sair = document.getElementById('iaSairCaderno');
    if (sair) sair.addEventListener('click', function () { desligarCaderno(); });
  }

  function desligarCaderno() {
    caderno = null;
    atualizarCompositor();
    campo.focus();
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
        /* O histórico chega em ordem e é o começo de tudo: carimbar
           aqui garante que qualquer narração aberta depois caia
           embaixo dele. */
        mensagens = ((r && r.mensagens) || []).map(comOrdem);
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
    mensagens.push(comOrdem({ autor: 'pessoa', texto: texto }));
    pensando = true;
    definirAviso('');
    atualizarCompositor();
    mostrarPensando();

    /* O destino depende do modo, e o modo está à vista. O assistente
       do projeto lê o conhecimento da empresa; o caderno não pode sair
       das fontes de uma investigação. */
    var destino = caderno
      ? { caminho: '/pesquisa/sessoes/' + caderno.sessaoId + '/consultas/' + caderno.consultaId + '/perguntar' }
      : { caminho: b + '/perguntas' };

    chamarComRenovacao(destino.caminho, { metodo: 'POST', corpo: { pergunta: texto } }, false).then(
      function (r) {
        pensando = false;
        campo.value = '';
        atualizarCompositor();
        if (caderno) {
          /* A resposta do caderno NÃO é gravada em `ia_mensagens` e
             nunca volta ao modelo nas perguntas seguintes ao
             assistente: ela vive aqui como desenho, e no banco como
             conversa daquela consulta. Se voltasse, um achado da web
             — que só vale com a fonte colada — reapareceria depois
             como coisa que a empresa sabe (IA-GERAL-005). */
          if (r && r.resposta) {
            mensagens.push(comOrdem({
              autor: 'ia',
              texto: r.resposta,
              caderno: true,
              cortado: !!r.material_cortado,
            }));
          }
        } else if (r && r.mensagem) {
          mensagens.push(comOrdem(r.mensagem));
        }
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
  function responderAcao(mensagemId, tipo, botoesDoCartao, ignorarDuplicata) {
    var b = base();
    if (!b) return;

    for (var i = 0; i < botoesDoCartao.length; i++) botoesDoCartao[i].disabled = true;

    var caminho = b + '/mensagens/' + encodeURIComponent(mensagemId) + '/' + tipo;
    var pedido = { metodo: 'POST' };
    /* Só no reenvio: um "Confirmar" comum continua sendo um POST sem
       corpo, e é a ausência da flag que faz a checagem rodar. */
    if (ignorarDuplicata) pedido.corpo = { ignorar_duplicata: true };

    chamarComRenovacao(caminho, pedido, false).then(
      function (r) {
        /* IDEIA-DUPL-003: resposta de SUCESSO que não gravou nada.
           Não é erro e não é `r.mensagem` — a sugestão segue
           pendente, só ganhou um aviso. Por isso volta aqui em cima,
           antes de qualquer troca de mensagem. */
        if (r.possivel_duplicata) {
          for (var k = 0; k < mensagens.length; k++) {
            if (mensagens[k].id === mensagemId) { mensagens[k].avisoDuplicata = r.possivel_duplicata; break; }
          }
          desenhar();
          return;
        }

        for (var i = 0; i < mensagens.length; i++) {
          if (mensagens[i].id === mensagemId) {
            /* A `ordem` é do LUGAR na conversa, não do objeto: trocar
               a mensagem por uma versão nova do servidor não pode
               mandá-la para o fim da tela. */
            r.mensagem.ordem = mensagens[i].ordem;
            /* Gravou (ou descartou): o aviso morre junto — deixá-lo
               de pé mostraria "já existe uma parecida" ao lado de
               "Idéia criada no quadro". */
            mensagens[i] = comOrdem(r.mensagem);
            break;
          }
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

    /* Segundo clique em "Confirmar" DEPOIS do aviso = "mesmo assim".
       Quem sabe que o aviso está na tela é o próprio cartão, então a
       decisão sai daqui e não de um estado solto no módulo. */
    var jaAvisado = false;
    for (var i = 0; i < mensagens.length; i++) {
      if (mensagens[i].id === mensagemId) { jaAvisado = !!mensagens[i].avisoDuplicata; break; }
    }

    responderAcao(mensagemId, tipo, cartao.querySelectorAll('.ia-acao-btn'), tipo === 'confirmar' && jaAvisado);
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

  /* ------------------------------------------------------------
     A porta da narração — quem usa é js/pesquisa.js
     ------------------------------------------------------------
     Fica aqui, e não lá, porque quem é dono do DOM da thread é este
     arquivo. Dois módulos escrevendo no mesmo `innerHTML` é a
     receita para um apagar o outro — e, pior, seria fácil um deles
     empurrar a narração para dentro de `mensagens` sem perceber.
     Expondo só estas quatro funções, isso não tem como acontecer.

     `aoEscolher` é guardado no objeto da narração, não no DOM: o
     `innerHTML` é reescrito a cada passo, e um listener preso ao
     botão morreria no primeiro redesenho. */
  var proximoId = 1;

  window.IaNarracao = {
    /* Abre a entrada e devolve o id. `tarefa` é o texto que a
       pessoa escreveu — aparece entre aspas, para ela reconhecer
       qual investigação é esta. */
    abrir: function (titulo, tarefa) {
      var n = {
        id: 'n' + (proximoId++),
        titulo: titulo || 'Investigando',
        tarefa: tarefa || '',
        inicio: Date.now(),
        fim: null,
        estado: 'correndo',
        passos: [],
        fecho: '',
        saidas: [],
        aoEscolher: null,
      };
      narracoes.push(comOrdem(n));
      ligarRelogio();
      desenhar();
      return n.id;
    },

    /* Um passo que JÁ ACONTECEU (IA-CONV-NARRA-005). Nada de
       "vou buscar": só "busquei". */
    passo: function (id, texto) {
      var n = narracaoPorId(id);
      if (!n || !texto) return;
      n.passos.push(texto);
      desenhar();
    },

    /* Fecha com um estado e, quando houver, com o que dá para
       fazer a seguir.
       `estado`: 'ok' | 'falha' | 'parada' | 'aguardando'.

       `aguardando` fecha o desenho sem fechar o assunto: o stream
       acabou, mas a investigação continua viva no servidor esperando
       um clique (BOARD-PESQUISA-037). O relógio para junto, e é
       certo que pare — o tempo que a pessoa leva para decidir não é
       tempo de investigação. */
    fechar: function (id, estado, fecho, saidas, aoEscolher) {
      var n = narracaoPorId(id);
      if (!n) return;
      n.estado = estado || 'ok';
      n.fim = Date.now();
      n.fecho = fecho || '';
      n.saidas = saidas || [];
      n.aoEscolher = aoEscolher || null;
      pintarTempos();
      desenhar();
    },

    /* Remonta uma entrada inteira a partir do que ficou gravado no
       servidor (Fase 1b). Existe porque uma investigação não morre
       com a aba: o servidor termina, cobra e grava mesmo sem
       cliente. Ao voltar, a pessoa precisa ver o que aconteceu
       enquanto ela não estava olhando — inclusive o resultado que
       ela já pagou.

       `duracaoMs` vem do servidor: sem ela, uma investigação de
       ontem apareceria como "0s", que é a única coisa que
       certamente não é verdade. */
    restaurar: function (dados) {
      var n = {
        id: 'n' + (proximoId++),
        titulo: dados.titulo || 'Investigação anterior',
        tarefa: dados.tarefa || '',
        inicio: Date.now() - (dados.duracaoMs || 0),
        fim: dados.estado === 'correndo' ? null : Date.now(),
        estado: dados.estado || 'ok',
        passos: (dados.passos || []).slice(),
        fecho: dados.fecho || '',
        saidas: dados.saidas || [],
        aoEscolher: dados.aoEscolher || null,
      };
      narracoes.push(comOrdem(n));
      if (n.estado === 'correndo') ligarRelogio();
      desenhar();
      return n.id;
    },

    /* Volta a correr. É o que acontece quando a pessoa escolhe uma
       saída: a MESMA entrada continua, com um passo a mais dizendo
       o que ela escolheu. Abrir uma segunda entrada faria parecer
       que rodaram duas investigações, e perderia o motivo pelo qual
       esta recomeçou. */
    retomar: function (id, passo) {
      var n = narracaoPorId(id);
      if (!n) return;
      n.estado = 'correndo';
      n.inicio = Date.now();
      n.fim = null;
      n.fecho = '';
      n.saidas = [];
      n.aoEscolher = null;
      if (passo) n.passos.push(passo);
      ligarRelogio();
      desenhar();
    },

    /* Some com a entrada. Usado quando a pessoa escolheu uma saída:
       a investigação recomeça numa entrada nova, e deixar as duas
       na tela faria parecer que rodaram duas buscas. */
    remover: function (id) {
      narracoes = narracoes.filter(function (n) { return n.id !== id; });
      desenhar();
    },
  };

  /* Clique numa saída. Delegado na thread pelo mesmo motivo do
     bloco de ação: o `innerHTML` é reescrito o tempo todo. */
  thread.addEventListener('click', function (ev) {
    var botao = ev.target.closest ? ev.target.closest('[data-narracao-saida]') : null;
    if (!botao) return;

    var n = narracaoPorId(botao.getAttribute('data-narracao'));
    if (!n || !n.aoEscolher) return;

    /* Trava os dois botões antes de chamar: uma segunda escolha
       enquanto a primeira está saindo seria uma segunda busca paga.
       Mesmo raciocínio de IA-ACAO-006. */
    var todos = thread.querySelectorAll('[data-narracao="' + n.id + '"][data-narracao-saida]');
    for (var i = 0; i < todos.length; i++) todos[i].disabled = true;

    n.aoEscolher(botao.getAttribute('data-narracao-saida'), n.id);
  });

  /* O painel só carrega depois que js/ideias.js resolveu empresa e
     projeto — é de lá que sai o endereço das chamadas. */
  /* ------------------------------------------------------------
     O caderno, para quem liga o modo — Fase 3a
     ------------------------------------------------------------
     Quem liga é `js/pesquisa.js`, pelo botão da narração. O painel
     não decide sozinho que uma pergunta é sobre a investigação: ele
     obedece a um gesto e o mostra enquanto durar. */
  window.IaCaderno = {
    ligar: function (dados) {
      if (!dados || !dados.sessaoId || !dados.consultaId) return false;
      caderno = { sessaoId: dados.sessaoId, consultaId: dados.consultaId, rotulo: dados.rotulo || '' };
      atualizarCompositor();
      campo.focus();
      return true;
    },
    desligar: desligarCaderno,
    ligado: function () { return !!caderno; },

    /* O que foi conversado com o caderno, para quem vai montar o
       relatório. Lê da mesma lista que a tela desenha — sem uma
       segunda cópia, que divergiria. */
    rodadas: function () {
      var saida = [];
      for (var i = 0; i < mensagens.length; i++) {
        var m = mensagens[i];
        if (!m.caderno) continue;
        var antes = mensagens[i - 1];
        if (!antes || antes.autor !== 'pessoa') continue;
        saida.push({ pergunta: antes.texto, resposta: m.texto });
      }
      return saida;
    },

    /* Remonta uma conversa de caderno já gravada, ao reabrir a
       tarefa. Sem isto o caderno seria um lugar para voltar onde não
       há nada do que foi conversado — que é o contrário da promessa. */
    restaurar: function (rodadas) {
      (rodadas || []).forEach(function (r) {
        if (!r || !r.pergunta) return;
        mensagens.push(comOrdem({ autor: 'pessoa', texto: r.pergunta }));
        mensagens.push(comOrdem({ autor: 'ia', texto: r.resposta || '', caderno: true }));
      });
      if ((rodadas || []).length) desenhar();
    },
  };

  window.IaAssistente = { carregar: carregar };
})();
