/* ============================================================
   QUADRO DE IDÉIAS DE UM PROJETO — visao_do_projeto.html
   ============================================================
   Regras: Regras_de_negocio/modulos/ideias/

     IDEIA-ISO-002    a página só existe no contexto de um projeto
     IDEIA-ISO-003    a corrente inteira é validada pelo servidor
     IDEIA-QUADRO-007 sem empresa/projeto válidos, volta para trás
     IDEIA-QUADRO-008 carregando, vazio e erro são estados distintos
     IDEIA-DUPL       criar/editar pode voltar com uma idéia parecida
                      em vez de gravar — quem decide o que fazer é a
                      pessoa, no alerta flutuante

   Mesma divisão de empresas.js e projetos.js: este arquivo NÃO
   DESENHA NADA. Ele decide qual estado mostrar e é o único que fala
   com a API — window.IdeiasView desenha, window.IdeiasAcoes é o que
   a tela chama quando algo precisa virar gravação.
   ============================================================ */

(function () {
  'use strict';

  var LOGIN = 'login.html';
  var EMPRESAS = 'empresas.html';
  var PROJETOS = 'projetos.html';

  var empresaAtual = null;
  var projetoAtual = null;
  var papelAtual = null;

  function aviso(msg) {
    if (window.mostrarMensagem) window.mostrarMensagem(msg);
  }
  /* Falha usa a variante vermelha do toast. Um "não foi possível…"
     em verde com um ✓ ao lado se lê como sucesso antes de a pessoa
     terminar a frase. */
  function avisoErro(msg) {
    if (window.mostrarMensagem) window.mostrarMensagem(msg, 'erro');
  }

  /* Os mesmos quatro estados dos outros módulos. O cuidado de sempre:
     nunca confundir "ainda não perguntei" nem "a pergunta falhou" com
     "perguntei e a resposta foi zero" (IDEIA-QUADRO-008). */
  function mostrar(estado) {
    /* Os quatro estados, agora de fato distintos na tela. Antes só
       'vazio' tinha efeito: 'carregando' nunca era chamado (a marcação
       já nascia `is-empty`, afirmando "nenhuma idéia" antes de
       perguntar) e 'erro' caía numa grade de colunas vazias, que se lê
       como "não tem nada" — exatamente a confusão que
       IDEIA-QUADRO-008 manda evitar. */
    document.body.classList.toggle('is-carregando-quadro', estado === 'carregando');
    document.body.classList.toggle('is-empty', estado === 'vazio');

    if (estado === 'erro' && window.IdeiasView && window.IdeiasView.falha) {
      window.IdeiasView.falha();
    }
  }

  function irPara(url) { window.location.href = url; }

  function base() {
    return '/empresas/' + encodeURIComponent(empresaAtual.id) +
           '/projetos/' + encodeURIComponent(projetoAtual.id) + '/ideias';
  }

  /* Renovação silenciosa, igual aos outros módulos: um 401 aqui não é
     "vá para o login", é "o token de acesso venceu". Só se o
     /auth/sessao também recusar é que a sessão acabou de verdade. */
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

  /* true = já tratou (redirecionou); false = quem chamou trata. */
  function tratarErroFatal(e) {
    if (e.status === 401) {
      irPara(LOGIN + '?motivo=sessao-expirada&destino=' +
             encodeURIComponent(location.pathname + location.search));
      return true;
    }
    if (e.status === 403 && e.dados && e.dados.suspensao) {
      irPara(LOGIN + '?motivo=suspenso&tipo=' + encodeURIComponent(e.dados.suspensao));
      return true;
    }
    return false;
  }

  function mensagemDeFalha(e, oQue) {
    return e.rede
      ? 'Não conseguimos falar com o servidor. Verifique sua conexão.'
      : (e.dados && e.dados.mensagem) || oQue;
  }

  /* ------------------------------------------------------------
     Ações — o que a tela chama quando algo precisa ser gravado.
     ------------------------------------------------------------
     Todas devolvem Promise. A tela usa o `catch` para se recompor
     (devolver o card, reabilitar o botão); a mensagem para o usuário
     é responsabilidade daqui, para não ficar espalhada em dois
     arquivos.
     ------------------------------------------------------------ */
  window.IdeiasAcoes = {
    /* IDEIA-DUPL-003: `opcoes.ignorarDuplicata` é o único jeito de
       pular a checagem do servidor — é isto que os botões
       "Criar"/"Salvar" do alerta de duplicidade mandam no reenvio,
       depois que a pessoa já viu o alerta e decidiu que quer mesmo
       assim.

       A resolução da Promise passa a ter DUAS formas possíveis:
       `{ ideia }` quando gravou de verdade, ou `{ duplicata }`
       quando o servidor achou uma parecida e NÃO gravou nada — a
       tela (visao_do_projeto.html) é quem decide o que fazer com
       cada uma. Isto não é erro: por isso não cai no `catch`. */
    /* IDEIA-GERAR — "Gerar com ajuda da IA".
       O servidor cria as idéias (já em ordem de execução) e devolve
       as que criou; aqui o quadro é recarregado inteiro, porque são
       várias de uma vez e a ordem certa é a do servidor.

       As três saídas dizem coisas diferentes e pedem ações
       diferentes: criou (começar pela primeira), não criou nada
       porque já existiam parecidas (nada a fazer), falhou (tentar de
       novo). `parecidas` nunca some em silêncio — IDEIA-GERAR-005. */
    /* IDEIA-GERAR-011: `orientacao` é o texto opcional da modal. Vazio
       não vai no corpo — o servidor gera como sempre gerou. */
    gerar: function (orientacao) {
      var corpo = {};
      var texto = typeof orientacao === 'string' ? orientacao.trim() : '';
      if (texto) corpo.orientacao = texto;
      return chamarComRenovacao(base() + '/gerar', { metodo: 'POST', corpo: corpo }, false).then(function (r) {
        var criadas = (r && r.ideias) || [];
        var parecidas = (r && r.parecidas) || 0;

        if (criadas.length === 0) {
          aviso('As idéias sugeridas já estão no quadro. Nenhuma idéia nova foi criada.');
          return r;
        }

        return carregarQuadro().then(function () {
          var texto = criadas.length === 1
            ? '1 idéia criada em Minhas idéias.'
            : criadas.length + ' idéias criadas em Minhas idéias, na ordem de execução. Comece pela primeira.';
          if (parecidas > 0) {
            texto += parecidas === 1
              ? ' 1 ficou de fora por ser parecida com uma que já existe.'
              : ' ' + parecidas + ' ficaram de fora por serem parecidas com idéias que já existem.';
          }
          window.IdeiasView.anunciar(texto);
          aviso(texto);
          return r;
        });
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        avisoErro(mensagemDeFalha(e, 'Não foi possível gerar idéias agora. Tente de novo em instantes.'));
        throw e;
      });
    },

    criar: function (titulo, descricao, importancia, opcoes) {
      var ignorar = !!(opcoes && opcoes.ignorarDuplicata);
      return chamarComRenovacao(base(), {
        metodo: 'POST',
        corpo: { titulo: titulo, descricao: descricao, importancia: importancia, ignorar_duplicata: ignorar },
      }, false).then(function (r) {
        if (r.possivel_duplicata) return { duplicata: r.possivel_duplicata };
        window.IdeiasView.acrescentar(r.ideia);
        window.IdeiasView.anunciar('“' + r.ideia.titulo + '” adicionada a Minhas idéias.');
        aviso('Idéia criada com sucesso.');
        return { ideia: r.ideia };
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 404) { irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaAtual.id)); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível criar a idéia.'));
        throw e;
      });
    },

    editar: function (id, titulo, descricao, importancia, opcoes) {
      var ignorar = !!(opcoes && opcoes.ignorarDuplicata);
      return chamarComRenovacao(base() + '/' + encodeURIComponent(id), {
        metodo: 'PUT',
        corpo: { titulo: titulo, descricao: descricao, importancia: importancia, ignorar_duplicata: ignorar },
      }, false).then(function (r) {
        if (r.possivel_duplicata) return { duplicata: r.possivel_duplicata };
        window.IdeiasView.atualizar(r.ideia);
        window.IdeiasView.anunciar('“' + r.ideia.titulo + '” editada.');
        aviso('Idéia editada com sucesso.');
        return { ideia: r.ideia };
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        /* 404 aqui significa que a idéia sumiu (arquivada por outra
           pessoa, projeto arquivado). Recarregar é a resposta certa —
           insistir na edição de algo que não existe mais, não. */
        if (e.status === 404) { carregarQuadro(); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível salvar a idéia.'));
        throw e;
      });
    },

    /* IDEIA-ORDEM-003/004: grava a coluna inteira na ordem nova.
       Chamada depois de o card já ter andado na tela; se falhar, quem
       reverte é a tela. Um 409 é a coluna que mudou desde que a tela
       carregou (outra pessoa criou, moveu ou excluiu uma idéia): o
       quadro é recarregado para mostrar a ordem que vale de verdade. */
    reordenar: function (status, ids) {
      return chamarComRenovacao(base() + '/ordem', {
        metodo: 'PUT',
        corpo: { status: status, ids: ids },
      }, false).then(function (r) {
        return r;
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 409 || e.status === 404) {
          carregarQuadro();
          if (e.status === 409) aviso(mensagemDeFalha(e, 'O quadro mudou enquanto você reorganizava. Atualizamos para você ver a ordem atual.'));
          throw e;
        }
        avisoErro(mensagemDeFalha(e, 'Não foi possível reorganizar a idéia.'));
        throw e;
      });
    },

    /* Chamada DEPOIS de o card já ter andado na tela
       (IDEIA-MOV-011). Se falhar, quem reverte é a tela — por isso
       aqui o erro é apenas relatado e repassado. */
    mover: function (id, status) {
      return chamarComRenovacao(base() + '/' + encodeURIComponent(id) + '/status', {
        metodo: 'PATCH',
        corpo: { status: status },
      }, false).then(function (r) {
        return r.ideia;
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 404) { carregarQuadro(); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível mover a idéia.'));
        throw e;
      });
    },

    excluir: function (id) {
      return chamarComRenovacao(base() + '/' + encodeURIComponent(id), {
        metodo: 'DELETE',
      }, false).then(function () {
        var restantes = window.IdeiasView.remover(id);
        /* Excluir a última idéia devolve a tela ao estado vazio — que
           precisa vir com o botão de criar visível para quem pode
           (IDEIA-VAZIO-002). */
        if (restantes === 0) {
          window.IdeiasView.permissoes(papelAtual);
          mostrar('vazio');
        }
        aviso('Idéia excluída com sucesso.');
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 404) { carregarQuadro(); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível excluir a idéia.'));
        throw e;
      });
    },
  };

  /* ------------------------------------------------------------
     Carga
     ------------------------------------------------------------ */
  function carregarQuadro() {
    return chamarComRenovacao(base(), {}, false).then(
      function (r) {
        var lista = (r && r.ideias) || [];
        papelAtual = (r && r.papel) || null;

        /* Só com um 200 na mão é que a tela tem o direito de dizer
           que não há idéias. */
        if (lista.length === 0) {
          window.IdeiasView.permissoes(papelAtual);
          mostrar('vazio');
          return;
        }

        window.IdeiasView.render(lista, papelAtual);
        mostrar('lista');
      },
      function (e) {
        if (tratarErroFatal(e)) return;
        if (e.status === 404) {
          irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaAtual.id));
          return;
        }
        mostrar('erro');
        avisoErro(mensagemDeFalha(e, 'Não foi possível carregar as idéias. Recarregue a página.'));
      }
    );
  }

  function carregar() {
    var q = new URLSearchParams(location.search);
    var empresaId = q.get('empresa');
    var projetoId = q.get('projeto');

    /* IDEIA-ISO-002 / IDEIA-QUADRO-007: sem os dois ids esta página
       não tem o que mostrar. Não é "estado vazio" — é navegação
       inválida, e cada caso volta para o lugar mais próximo que
       ainda faz sentido. */
    if (!empresaId) { irPara(EMPRESAS); return; }
    if (!projetoId) { irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaId)); return; }

    mostrar('carregando');

    /* Reaproveita GET /empresas e GET /empresas/:id/projetos — as
       mesmas chamadas que as outras telas já fazem, e que já aplicam
       o filtro de vínculo. Sem endpoint novo: se um id não aparecer
       na resposta, a pessoa não tem acesso a ele (ou ele não existe),
       e as duas coisas levam ao mesmo lugar. */
    chamarComRenovacao('/empresas', {}, false).then(
      function (r) {
        var empresas = (r && r.empresas) || [];
        var empresa = null;
        for (var i = 0; i < empresas.length; i++) {
          if (empresas[i].id === empresaId) { empresa = empresas[i]; break; }
        }
        if (!empresa) { irPara(EMPRESAS); return; }
        empresaAtual = empresa;

        return chamarComRenovacao('/empresas/' + encodeURIComponent(empresaId) + '/projetos', {}, false)
          .then(function (rp) {
            var projetos = (rp && rp.projetos) || [];
            var projeto = null;
            for (var j = 0; j < projetos.length; j++) {
              if (projetos[j].id === projetoId) { projeto = projetos[j]; break; }
            }
            if (!projeto) { irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaId)); return; }
            projetoAtual = projeto;

            window.EmpresaAtual = empresa;
            window.ProjetoAtual = projeto;
            window.IdeiasView.cabecalho(empresa, projeto);

            /* O painel do assistente depende de empresa e projeto
               resolvidos — é daqui que sai o endereço das chamadas
               dele. Por isso ele carrega depois, e não sozinho. */
            if (window.IaAssistente) window.IaAssistente.carregar();

            return carregarQuadro();
          });
      },
      function (e) {
        if (tratarErroFatal(e)) return;
        if (window.IdeiasView && window.IdeiasView.tituloIndisponivel) {
          window.IdeiasView.tituloIndisponivel();
        }
        mostrar('erro');
        avisoErro(mensagemDeFalha(e, 'Não foi possível carregar o projeto. Recarregue a página.'));
      }
    );
  }

  carregar();

  window.recarregarIdeias = carregar;
})();
