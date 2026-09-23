/* ============================================================
   MATRIZ CSD — matriz_csd.html
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/matriz-csd.md
     MATRIZ-001  a tarefa `matriz_csd` tem UM quadro: a matriz, com
                 as colunas Certeza, Suposição e Dúvidas.
     MATRIZ-002  todo card mora numa coluna.
     MATRIZ-003  a matriz é gravada pelo mesmo PUT de quadros do board
                 (BOARD-SALVA-001), como um quadro de post-its de três
                 colunas — sem tabela nova.
     MATRIZ-IA   "Gerar classificação com IA": o Senior Product
                 Designer classifica as tarefas da atividade.

   Até 23/09/2026 esta tela era protótipo: nada era lido nem gravado,
   o "Salvando..." era um relógio e o "Voltar" ia para uma atividade
   sem ids. Mesma divisão de board.js: este arquivo fala com a API; o
   <script> da página desenha e reage aos gestos (window.MatrizTela).
   ============================================================ */

(function () {
  'use strict';

  var q = new URLSearchParams(location.search);
  var ids = { empresa: q.get('empresa'), projeto: q.get('projeto'), ideia: q.get('ideia'), tarefa: q.get('tarefa') };
  var COLUNAS = [
    { chave: 'certeza', titulo: 'Certeza' },
    { chave: 'suposicao', titulo: 'Suposição' },
    { chave: 'duvida', titulo: 'Dúvidas' }
  ];
  var TITULO_QUADRO = 'Matriz CSD';

  var tarefaAtual = null;
  var carregado = false;

  function tela() { return window.MatrizTela; }
  function aviso(msg) { if (tela()) tela().mostrarMensagem(msg); }
  function irPara(url) { window.location.href = url; }

  function urlAtividade() {
    if (!ids.empresa || !ids.projeto || !ids.ideia) return 'atividade.html';
    return 'atividade.html?empresa=' + encodeURIComponent(ids.empresa) +
      '&projeto=' + encodeURIComponent(ids.projeto) +
      '&ideia=' + encodeURIComponent(ids.ideia);
  }
  function baseTarefas() {
    return '/empresas/' + encodeURIComponent(ids.empresa) +
      '/projetos/' + encodeURIComponent(ids.projeto) +
      '/ideias/' + encodeURIComponent(ids.ideia) + '/tarefas';
  }
  function baseTarefa() { return baseTarefas() + '/' + encodeURIComponent(ids.tarefa); }

  function chamar(caminho, opcoes, jaRenovou) {
    return window.API.chamar(caminho, opcoes).catch(function (e) {
      if (e.status === 401 && !jaRenovou) {
        return window.API.chamar('/auth/sessao').then(
          function () { return chamar(caminho, opcoes, true); },
          function () { throw e; }
        );
      }
      throw e;
    });
  }
  function tratarErroFatal(e) {
    if (e.status === 401) {
      irPara('login.html?motivo=sessao-expirada&destino=' + encodeURIComponent(location.pathname + location.search));
      return true;
    }
    if (e.status === 403 && e.dados && e.dados.suspensao) {
      irPara('login.html?motivo=suspenso&tipo=' + encodeURIComponent(e.dados.suspensao));
      return true;
    }
    return false;
  }
  function mensagemDeFalha(e, oQue) {
    return e && e.rede ? 'Não conseguimos falar com o servidor. Verifique sua conexão.'
      : (e && e.dados && e.dados.mensagem) || oQue;
  }

  /* ------------------------------------------------------------
     Ler e desenhar
     ------------------------------------------------------------ */
  function chaveDaColuna(titulo) {
    var k = String(titulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (k.indexOf('cert') === 0) return 'certeza';
    if (k.indexOf('supos') === 0) return 'suposicao';
    if (k.indexOf('duvid') === 0) return 'duvida';
    return null;
  }

  function limparColunas() {
    COLUNAS.forEach(function (c) {
      var l = tela().listaDaColuna(c.chave);
      if (l) l.innerHTML = '';
    });
  }

  function desenhar(quadros) {
    limparColunas();
    /* A matriz é o quadro de três colunas desta tarefa. Coluna com
       título que não é C, S nem D (dado antigo, ou mexido à mão) cai
       em Dúvidas — sumir com registro seria pior. */
    (quadros || []).forEach(function (qd) {
      (qd.colunas || []).forEach(function (col) {
        var chave = chaveDaColuna(col.titulo) || 'duvida';
        var lista = tela().listaDaColuna(chave);
        (col.registros || []).forEach(function (r) {
          lista.appendChild(tela().criarCard(r.titulo || '', r.descricao || ''));
        });
      });
    });
    tela().atualizarColunas();
  }

  function lerDaTela() {
    return {
      quadros: [{
        titulo: TITULO_QUADRO,
        tipo: 'postits',
        colunas: COLUNAS.map(function (c) {
          var lista = tela().listaDaColuna(c.chave);
          var cards = lista ? lista.querySelectorAll('.idea') : [];
          return {
            titulo: c.titulo,
            registros: Array.prototype.map.call(cards, function (card) {
              var t = card.querySelector('.idea-title');
              var d = card.querySelector('.idea-desc');
              return {
                titulo: (t ? t.textContent : '').trim().slice(0, 260) || 'Sem título',
                /* Post-it: 280 (BOARD-SALVA). A edição no lugar não tem
                   maxlength; cortar aqui evita um 400 que perderia tudo. */
                descricao: (d ? d.textContent : '').trim().slice(0, 280)
              };
            })
          };
        })
      }]
    };
  }

  /* ------------------------------------------------------------
     Gravar — um PUT por vez; gesto no meio de uma gravação pede outra
     ------------------------------------------------------------ */
  var gravando = null;
  var deNovo = false;

  function salvar() {
    if (!carregado || !tarefaAtual || tarefaAtual.status === 'concluida') return Promise.resolve(false);
    if (gravando) { deNovo = true; return gravando; }
    tela().mostrarSalvando(true);
    gravando = chamar(baseTarefa() + '/quadros', { metodo: 'PUT', corpo: lerDaTela() })
      .then(function () { return true; }, function (e) {
        if (tratarErroFatal(e)) return false;
        aviso(mensagemDeFalha(e, 'Não foi possível salvar a matriz. Tente de novo.'));
        return false;
      })
      .then(function (ok) {
        gravando = null;
        if (deNovo) { deNovo = false; return salvar(); }
        tela().mostrarSalvando(false);
        return ok;
      });
    return gravando;
  }

  /* ------------------------------------------------------------
     "Gerar classificação com IA" — MATRIZ-IA
     ------------------------------------------------------------ */
  var classificando = false;
  /* Mesmo estado do "Pesquisar" do board: o ícone vira o indicador
     girando e só o rótulo muda — trocar o textContent do botão
     inteiro apagaria os ícones. */
  function botaoIA(ligado) {
    var b = document.getElementById('btnGerarIA');
    if (!b) return;
    var rotulo = document.getElementById('btnGerarIALabel');
    b.disabled = ligado;
    b.classList.toggle('is-pesquisando', ligado);
    b.setAttribute('aria-busy', ligado ? 'true' : 'false');
    if (rotulo) rotulo.textContent = ligado ? 'Classificando...' : 'Gerar classificação com IA';
  }

  function jaNaMatriz() {
    var s = {};
    Array.prototype.forEach.call(document.querySelectorAll('.matrix-columns .idea-title'), function (t) {
      s[t.textContent.trim().toLowerCase()] = true;
    });
    return s;
  }

  function classificar() {
    if (classificando || !carregado || !tarefaAtual || tarefaAtual.status === 'concluida') return Promise.resolve(false);
    classificando = true;
    botaoIA(true);
    return chamar(baseTarefa() + '/matriz/classificar', { metodo: 'POST', corpo: {} })
      .then(function (r) {
        var cards = (r && r.cards) || [];
        var ja = jaNaMatriz();
        var novos = 0;
        cards.forEach(function (c) {
          if (ja[String(c.titulo).trim().toLowerCase()]) return;
          var lista = tela().listaDaColuna(c.coluna) || tela().listaDaColuna('duvida');
          lista.appendChild(tela().criarCard(c.titulo, c.descricao || ''));
          novos++;
        });
        tela().atualizarColunas();
        if (novos) {
          aviso(novos === 1 ? '1 item classificado na matriz. Arraste para outra coluna se discordar.'
            : novos + ' itens classificados na matriz. Arraste para outra coluna se discordar.');
          return salvar();
        }
        aviso('A matriz já tem tudo o que a IA encontrou nesta atividade.');
        return true;
      }, function (e) {
        if (tratarErroFatal(e)) return false;
        aviso(mensagemDeFalha(e, 'Não foi possível classificar agora.'));
        return false;
      })
      .then(function (ok) { classificando = false; botaoIA(false); return ok; });
  }

  /* ------------------------------------------------------------
     Reabrir e voltar
     ------------------------------------------------------------ */
  function reabrir() {
    return chamar(baseTarefa() + '/status', { metodo: 'PATCH', corpo: { status: 'pendente' } })
      .then(function (r) {
        tarefaAtual = (r && r.tarefa) || tarefaAtual;
        if (tarefaAtual) tarefaAtual.status = 'pendente';
        return true;
      }, function (e) {
        if (!tratarErroFatal(e)) aviso(mensagemDeFalha(e, 'Não foi possível reabrir a tarefa.'));
        throw e;
      });
  }

  function voltar() {
    var pendente = gravando || Promise.resolve(true);
    pendente.then(function () { irPara(urlAtividade()); });
  }

  window.MatrizAcoes = { salvar: salvar, classificar: classificar, reabrir: reabrir, voltar: voltar };

  /* ------------------------------------------------------------
     Carga
     ------------------------------------------------------------ */
  function carregar() {
    if (!tela()) return;
    if (!ids.empresa || !ids.projeto || !ids.ideia || !ids.tarefa || !window.API) {
      /* Sem os quatro ids não há de que tarefa falar (o link antigo,
         "matriz_csd.html" puro). A matriz fica vazia e só leitura, em
         vez de fingir que grava. */
      tela().aplicarLeitura(true);
      var reabrirBtn = document.getElementById('btnReabrirTarefa');
      if (reabrirBtn) reabrirBtn.hidden = true;
      limparColunas();
      tela().atualizarColunas();
      aviso('Abra a Matriz CSD pela lista de tarefas da atividade.');
      return;
    }
    Promise.all([
      chamar(baseTarefas(), {}),
      chamar(baseTarefa() + '/quadros', {})
    ]).then(function (rs) {
      var tarefas = (rs[0] && rs[0].tarefas) || [];
      tarefaAtual = null;
      for (var i = 0; i < tarefas.length; i++) if (tarefas[i].id === ids.tarefa) tarefaAtual = tarefas[i];
      if (!tarefaAtual) { irPara(urlAtividade()); return; }

      var titulo = document.getElementById('matrixTitle');
      if (titulo) titulo.textContent = tarefaAtual.titulo || TITULO_QUADRO;
      document.title = (tarefaAtual.titulo || TITULO_QUADRO) + ' — Matriz CSD';

      tela().aplicarLeitura(tarefaAtual.status === 'concluida');
      desenhar((rs[1] && rs[1].quadros) || []);
      carregado = true;

      /* ATV-GERAR-015: tarefa criada pelo "Gerar com ajuda da IA" chega
         com `classificar=1` e já classifica, uma vez só. */
      if (q.get('classificar') === '1') {
        q.delete('classificar');
        history.replaceState(null, '', location.pathname + '?' + q.toString());
        if (tarefaAtual.status !== 'concluida') classificar();
      }
    }, function (e) {
      if (tratarErroFatal(e)) return;
      if (e.status === 404) { irPara(urlAtividade()); return; }
      tela().aplicarLeitura(true);
      aviso(mensagemDeFalha(e, 'Não foi possível carregar a matriz. Recarregue a página.'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carregar);
  else carregar();
})();
