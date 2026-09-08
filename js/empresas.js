/* ============================================================
   LISTAGEM DE EMPRESAS — empresas.html
   ============================================================
   Regras: Regras_de_negocio/modulos/empresas/empresas-listagem.md

     EMP-LIST-009  a página não tem dados próprios; pergunta à API
     EMP-LIST-010  vazio, carregando e erro são três coisas distintas
     EMP-LIST-011  arquivada não conta (o filtro é do servidor)

   ESTE ARQUIVO NÃO DESENHA NADA.
   O `empresas.html` está desenhado e aprovado. Aqui só se decide
   qual dos estados que ELE já tem deve aparecer, e isso é feito
   mexendo apenas em coisas que já existiam na página:

     body.is-empty       classe que o CSS aprovado já usa
     .empty              a seção de estado vazio, como desenhada
     #grid               a grade de cards
     #toast              a mensagem de feedback já existente

   Nenhum elemento, classe ou estilo novo é criado por este arquivo.

   O PONTO DELICADO
   Uma listagem que falha em carregar não tem nada para desenhar, e
   a saída preguiçosa é cair no estado vazio. A tela então afirma
   "Nenhuma empresa por aqui ainda" — uma mentira sobre os dados da
   pessoa. Quem tem cinco empresas conclui que perdeu tudo. Por isso
   o estado vazio só é alcançável a partir de um 200 com lista de
   tamanho zero.
   ============================================================ */

(function () {
  'use strict';

  var LOGIN = 'login.html';
  var DESTINO = 'empresas.html';

  var grid = document.getElementById('grid');

  function aviso(msg, permanente) {
    if (window.EmpresasView && window.EmpresasView.aviso) {
      window.EmpresasView.aviso(msg, permanente);
    }
  }

  /* ------------------------------------------------------------
     Os quatro estados, expressos só com o que a página já tem
     ------------------------------------------------------------
       carregando  `is-carregando-lista` com esqueleto. Mostra a forma
                   do que vem — nunca um exemplo inventado. A página
                   nasce assim, para que a tela não afirme "nenhuma
                   empresa" antes de ter perguntado à API.
       lista       grade preenchida, `is-carregando-lista` removido.
       vazio       `is-empty`, exatamente como o desenho aprovado.
       erro        NÃO usa o estado vazio, porque seria falso; fica
                   na grade com mensagem de erro e avisa pelo toast.

     ------------------------------------------------------------ */
  function mostrar(estado) {
    document.body.classList.toggle('is-empty', estado === 'vazio');
    document.body.classList.toggle('is-carregando-lista', estado === 'carregando');
    if (estado === 'carregando' && window.EmpresasView && window.EmpresasView.esqueleto) {
      window.EmpresasView.esqueleto();
    }
  }

  /* ------------------------------------------------------------
     Conversa com a API
     ------------------------------------------------------------
     O 401 aqui não significa "vá para o login". Significa que o
     token de acesso venceu — e ele vence a cada 15 minutos, por
     projeto (ACS-SESSAO-001). Quem sabe renovar é o /auth/sessao,
     que gira o refresh. Só se ELE também recusar é que a sessão
     acabou de verdade. Sem essa segunda chamada, a pessoa seria
     expulsa para o login a cada quinze minutos com sessão válida.
     ------------------------------------------------------------ */
  function buscar(jaRenovou) {
    return API.chamar('/empresas').catch(function (e) {
      if (e.status === 401 && !jaRenovou) {
        return API.chamar('/auth/sessao').then(
          function () { return buscar(true); },
          function () { throw e; }
        );
      }
      throw e;
    });
  }

  function irPara(url) { window.location.href = url; }

  function carregar() {
    mostrar('carregando');

    buscar(false).then(
      function (r) {
        var lista = (r && r.empresas) || [];

        /* EMP-LIST-010: só aqui, com 200 na mão, a tela tem o
           direito de dizer que a pessoa não tem empresa. */
        if (lista.length === 0) { mostrar('vazio'); return; }

        window.EmpresasView.render(lista);
        mostrar('lista');
      },
      function (e) {
        /* Sessão morreu de vez: volta ao login preservando o
           destino pretendido (ACS-SESSAO-002). */
        if (e.status === 401) {
          irPara(LOGIN + '?motivo=sessao-expirada&destino=' + encodeURIComponent(DESTINO));
          return;
        }

        /* Conta suspensa: quem explica motivo e saída é o login
           (ACS-LOGIN-012), não esta tela. */
        if (e.status === 403) {
          var tipo = (e.dados && e.dados.suspensao) || 'violacao';
          irPara(LOGIN + '?motivo=suspenso&tipo=' + encodeURIComponent(tipo));
          return;
        }

        mostrar('erro');
        if (window.EmpresasView && window.EmpresasView.falha) {
          window.EmpresasView.falha();
        }
        aviso(
          e.rede
            ? 'Não conseguimos falar com o servidor. Verifique sua conexão e recarregue a página.'
            : 'Não foi possível carregar suas empresas. Recarregue a página para tentar de novo.',
          true
        );
      }
    );
  }

  /* ------------------------------------------------------------
     Andaime de inspeção
     ------------------------------------------------------------
     ?estado= curto-circuita a API para conferir cada tela sem
     depender de dados reais. Separado do caminho normal: sem o
     parâmetro, quem manda é o servidor.

       ?estado=vazio       estado vazio, como no desenho
       ?estado=lista       grade com os dados de exemplo da página
       ?estado=carregando  grade vazia
       ?estado=erro        grade vazia + aviso no toast
     ------------------------------------------------------------ */
  function inspecionar(forcado) {
    if (forcado === 'lista') {
      window.EmpresasView.render(window.EmpresasView.EXEMPLO);
      mostrar('lista');
    } else if (forcado === 'erro') {
      mostrar('erro');
      aviso('Não foi possível carregar suas empresas. Recarregue a página para tentar de novo.', true);
    } else if (forcado === 'carregando') {
      mostrar('carregando');
    } else {
      mostrar('vazio');
    }
  }

  var forcado = new URLSearchParams(location.search).get('estado');
  if (forcado) inspecionar(forcado);
  else carregar();

  window.recarregarEmpresas = carregar;
})();
