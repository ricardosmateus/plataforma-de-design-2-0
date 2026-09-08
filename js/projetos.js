/* ============================================================
   LISTAGEM DE PROJETOS DE UMA EMPRESA — projetos.html
   ============================================================
   Regras: Regras_de_negocio/modulos/projetos/projetos-listagem.md

     PROJ-ISO-002  a página só existe no contexto de uma empresa
     PROJ-ISO-003  vínculo checado antes de qualquer coisa
     PROJ-LIST-006 sem empresa válida, volta para empresas.html

   Mesma separação de responsabilidade de empresas.html/js/empresas.js:
   este arquivo NÃO DESENHA NADA — só decide qual estado mostrar,
   mexendo apenas no que projetos.html já tem (body.is-empty, #grid,
   #toast, window.ProjetosView).
   ============================================================ */

(function () {
  'use strict';

  var LOGIN = 'login.html';
  var EMPRESAS = 'empresas.html';

  var grid = document.getElementById('grid');

  function aviso(msg, permanente) {
    if (window.avisoProjetos) window.avisoProjetos(msg, permanente);
  }

  /* Os mesmos quatro estados de js/empresas.js: carregando, lista,
     vazio, erro — e o mesmo cuidado de nunca confundir "ainda não
     perguntei" ou "a pergunta falhou" com "perguntei e a resposta
     foi zero" (EMP-LIST-010, reaproveitado aqui). */
  function mostrar(estado) {
    /* Os quatro estados, agora distintos NA TELA e não só no nome.
       Antes 'carregando' e 'erro' faziam a mesma coisa — esvaziar a
       grade — e uma grade vazia se lê como "esta empresa não tem
       projetos", exatamente o que EMP-LIST-010 manda não confundir. */
    var vista = window.ProjetosView || {};

    document.body.classList.toggle('is-carregando-lista', estado === 'carregando');
    document.body.classList.toggle('is-empty', estado === 'vazio');

    if (estado === 'carregando') {
      if (vista.esqueleto) vista.esqueleto();
      return;
    }
    if (estado === 'erro') {
      if (vista.falha) vista.falha();
      return;
    }
    if (estado === 'vazio') {
      grid.innerHTML = '';
      return;
    }
    /* 'lista': render() acabou de escrever na grade — limpar aqui
       apagaria o que ele desenhou. */
  }

  function irPara(url) { window.location.href = url; }

  /* Mesma renovação silenciosa de js/empresas.js: 401 aqui não é
     "vá pro login", é "o token de acesso venceu" — só se o
     /auth/sessao também recusar é que a sessão acabou de verdade. */
  function chamarComRenovacao(caminho, jaRenovou) {
    return API.chamar(caminho).catch(function (e) {
      if (e.status === 401 && !jaRenovou) {
        return API.chamar('/auth/sessao').then(
          function () { return chamarComRenovacao(caminho, true); },
          function () { throw e; }
        );
      }
      throw e;
    });
  }

  /* true = já tratou (redirecionou); false = quem chamou trata o resto. */
  function tratarErroFatal(e) {
    if (e.status === 401) {
      irPara(LOGIN + '?motivo=sessao-expirada&destino=' + encodeURIComponent(location.pathname + location.search));
      return true;
    }
    if (e.status === 403) {
      var tipo = (e.dados && e.dados.suspensao) || 'violacao';
      irPara(LOGIN + '?motivo=suspenso&tipo=' + encodeURIComponent(tipo));
      return true;
    }
    return false;
  }

  function carregarProjetos(empresaId, papel) {
    chamarComRenovacao('/empresas/' + encodeURIComponent(empresaId) + '/projetos', false).then(
      function (r) {
        var lista = (r && r.projetos) || [];

        /* PROJ-LIST: só com um 200 na mão é que a tela tem o direito
           de dizer que não há projetos. */
        if (lista.length === 0) {
          /* O estado vazio precisa do botão "Novo projeto" tanto
             quanto a lista — é o único caminho para criar o primeiro
             projeto da empresa (PROJ-CRIA-004). Sem esta linha ele
             continuaria com o `hidden` que veio do HTML. */
          window.ProjetosView.permissoes(papel);
          mostrar('vazio');
          return;
        }

        window.ProjetosView.render(lista, papel);
        mostrar('lista');
      },
      function (e) {
        if (tratarErroFatal(e)) return;
        mostrar('erro');
        aviso(
          e.rede
            ? 'Não conseguimos falar com o servidor. Verifique sua conexão e recarregue a página.'
            : 'Não foi possível carregar os projetos. Recarregue a página para tentar de novo.',
          true
        );
      }
    );
  }

  function carregar() {
    var empresaId = new URLSearchParams(location.search).get('empresa');

    /* PROJ-ISO-002/PROJ-LIST-006: sem id de empresa na URL, esta
       página não tem o que mostrar — nem existe "estado vazio" que
       sirva aqui, é navegação inválida, não ausência de dado. */
    if (!empresaId) { irPara(EMPRESAS); return; }

    mostrar('carregando');

    /* Confirma o acesso e pega nome/papel da empresa reaproveitando
       GET /empresas — a mesma chamada que empresas.html já faz, e
       que já aplica o filtro de vínculo que PROJ-ISO-003 exige. Sem
       endpoint novo: se o id não aparecer na resposta, a pessoa não
       tem vínculo ativo com ele (ou ele não existe), e as duas coisas
       levam para o mesmo lugar. */
    chamarComRenovacao('/empresas', false).then(
      function (r) {
        var empresas = (r && r.empresas) || [];
        var empresa = null;
        for (var i = 0; i < empresas.length; i++) {
          if (empresas[i].id === empresaId) { empresa = empresas[i]; break; }
        }

        if (!empresa) { irPara(EMPRESAS); return; }

        window.EmpresaAtual = empresa;
        window.ProjetosView.cabecalho(empresa);
        carregarProjetos(empresaId, empresa.papel);
      },
      function (e) {
        if (tratarErroFatal(e)) return;
        /* Sem empresa não há nome para o título — nem faz sentido
           deixar a barra do esqueleto pulsando por um nome que não
           vem mais. */
        if (window.ProjetosView && window.ProjetosView.tituloIndisponivel) {
          window.ProjetosView.tituloIndisponivel();
        }
        mostrar('erro');
        aviso(
          e.rede
            ? 'Não conseguimos falar com o servidor. Verifique sua conexão e recarregue a página.'
            : 'Não foi possível carregar a empresa. Recarregue a página para tentar de novo.',
          true
        );
      }
    );
  }

  carregar();

  window.recarregarProjetos = carregar;
})();
