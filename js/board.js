/* ============================================================
   QUADRO DE TRABALHO DE UMA TAREFA — board.html
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md

     BOARD-ACESSO   a tela abre UMA tarefa, identificada pelos
                     quatro ids da URL. Faltando qualquer um, é
                     navegação inválida — volta, não mostra vazio.
     BOARD-QUADRO   quadro > coluna > registro, tudo da tarefa.
     BOARD-SALVA    grava o quadro inteiro a cada gesto e redesenha
                     a partir do que o servidor devolveu.
     BOARD-TAREFA   finalizar/reabrir e excluir usam as MESMAS
                     rotas de atividade.html — não há uma segunda
                     implementação da mesma escrita.

   Mesma divisão de ideias.js e atividade.js: este arquivo fala com
   a API e decide o que a tela mostra; ele NÃO conhece pan/zoom nem
   os modais — isso continua nos <script> de board.html, que chamam
   window.BoardAcoes quando algo precisa virar gravação.
   ============================================================ */

(function () {
  'use strict';

  var EMPRESAS = 'empresas.html';
  var PROJETOS = 'projetos.html';
  var VISAO = 'visao_do_projeto.html';
  var ATIVIDADE = 'atividade.html';
  var LOGIN = 'login.html';

  var empresaId = null;
  var projetoId = null;
  var ideiaId = null;
  var tarefaId = null;
  var tarefaAtual = null; // { id, titulo, descricao, status, tipo }

  /* BOARD-SALVA-006 — a trava que impede o autosave de apagar o
     quadro de alguém.

     O PUT grava o que está NA TELA. Enquanto a carga não termina (ou
     se ela falha no meio), a tela tem zero painéis — e um autosave
     disparado nessa janela mandaria uma lista vazia, apagando do
     banco um quadro que ninguém pediu para apagar. Já aconteceu em
     teste: o quadro sumiu sozinho.

     Só depois de o servidor ter respondido e a tela ter sido
     desenhada é que o que está nela representa o que está no banco —
     e só aí gravar é seguro. */
  var carregado = false;

  function irPara(url) { window.location.href = url; }

  function aviso(msg) {
    if (window.mostrarMensagem) window.mostrarMensagem(msg);
  }
  function avisoErro(msg) {
    if (window.mostrarMensagem) window.mostrarMensagem(msg, 'erro');
  }

  /* O endereço de volta para a atividade, COM o contexto inteiro.
     O protótipo mandava para `atividade.html` seco, e aquela tela
     (que já é de verdade) redireciona para fora sem os ids
     (ATV-ACESSO) — o "Voltar" levava a pessoa para longe do que
     ela estava fazendo. */
  function urlAtividade() {
    return ATIVIDADE +
      '?empresa=' + encodeURIComponent(empresaId) +
      '&projeto=' + encodeURIComponent(projetoId) +
      '&ideia=' + encodeURIComponent(ideiaId);
  }
  window.BoardVoltarUrl = urlAtividade;

  /* Mesmo motivo de js/atividade.js: o menu lateral é ligado por
     <script> na página, que não conhece os ids. */
  function publicarContexto() {
    window.ContextoUrl = '?empresa=' + encodeURIComponent(empresaId) +
      '&projeto=' + encodeURIComponent(projetoId);
  }

  function baseTarefas() {
    return '/empresas/' + encodeURIComponent(empresaId) +
      '/projetos/' + encodeURIComponent(projetoId) +
      '/ideias/' + encodeURIComponent(ideiaId) + '/tarefas';
  }
  function baseQuadros() {
    return baseTarefas() + '/' + encodeURIComponent(tarefaId) + '/quadros';
  }
  /* BOARD-REF: as referências visuais têm rotas próprias, fora do PUT
     do quadro (ver api/src/rotas/referencias.ts). */
  function baseReferencias() {
    return baseTarefas() + '/' + encodeURIComponent(tarefaId) + '/referencias';
  }
  function ehReferencias(t) { return !!t && t.tipo === 'referencias_visuais'; }

  /* BOARD-CONVERSA-004: "Montar roteiro com IA". Aparece só na
     Conversa e fora de tarefa concluída (BOARD-LEITURA-003). Se a pessoa
     já editou o roteiro, pergunta antes de substituir. O texto é escrito
     no quadro pelo board.html (`escreverRoteiro`), que grava. */
  var montarRoteiroLigado = false;
  function ligarMontarRoteiro(tarefa) {
    var botao = document.getElementById('btnMontarRoteiro');
    var rotulo = document.getElementById('btnMontarRoteiroLabel');
    if (!botao) return;
    botao.hidden = tarefa.status === 'concluida';
    if (montarRoteiroLigado) return;
    montarRoteiroLigado = true;
    /* O mesmo estado do "Pesquisar": `is-pesquisando` troca o ícone pelo
       indicador girando, e o CSS mantém o botão desativado sem apagá-lo
       (trabalhando e indisponível são estados diferentes). */
    function trabalhando(ligado) {
      botao.disabled = ligado;
      botao.classList.toggle('is-pesquisando', ligado);
      botao.setAttribute('aria-busy', ligado ? 'true' : 'false');
      if (rotulo) rotulo.textContent = ligado ? 'Montando roteiro…' : 'Montar roteiro com IA';
    }
    botao.addEventListener('click', function () {
      if (botao.disabled) return;
      if (typeof window.roteiroEditado === 'function' && window.roteiroEditado() &&
          !window.confirm('Substituir o roteiro atual pelo que a IA montar?')) return;
      trabalhando(true);
      chamarComRenovacao(baseTarefas() + '/' + encodeURIComponent(tarefaId) + '/roteiro', { metodo: 'POST', corpo: {} })
        .then(function (r) {
          if (r && r.texto && typeof window.escreverRoteiro === 'function' && window.escreverRoteiro(r.texto)) {
            aviso('Roteiro montado. Edite à vontade.');
          }
        }, function (e) {
          if (tratarErroFatal(e)) return;
          avisoErro(mensagemDeFalha(e, 'Não consegui montar o roteiro agora.'));
        })
        .then(function () { trabalhando(false); });
    });
  }

  /* BOARD-CONVERSA-003 (decisão do Ricardo: só o aviso, sem conferência
     por código). Identificado pelo título, como "Próximos passos". */
  var TITULO_OUVIMOS = 'O que ouvimos';
  var AVISO_DADOS_PESSOAIS = 'Registre o que foi dito, não quem disse: sem nome, apartamento ou contato.';
  function avisarDadosPessoais() {
    [].forEach.call(document.querySelectorAll('.ideas-panel'), function (painel) {
      var t = painel.querySelector('.ideas-title');
      if (!t || t.textContent.trim() !== TITULO_OUVIMOS) return;
      if (painel.querySelector('.conversa-aviso')) return;
      var p = document.createElement('p');
      p.className = 'conversa-aviso';
      p.setAttribute('role', 'note');
      p.style.cssText = 'margin:0;padding:8px 16px 12px;font-size:13px;line-height:20px;color:var(--text-secondary)';
      p.textContent = AVISO_DADOS_PESSOAIS;
      var corpo = painel.querySelector('.ideas-body');
      if (corpo) painel.insertBefore(p, corpo); else painel.appendChild(p);
    });
  }

  /* ATV-TAR-CRIA-009 / BOARD-MATRIZ-TAREFA: o tipo da tarefa que É uma
     matriz, e o modelo de quadro que ela abre. Mesmos nomes de
     MATRIZ_MODELOS (board.html) e de Quadro.modelo no banco. */
  var MODELO_DA_TAREFA = { swot: 'swot', impacto_esforco: 'impacto_esforco', comparativa: 'comparativa' };
  function modeloDaTarefa(t) { return (t && MODELO_DA_TAREFA[t.tipo]) || null; }
  /* A comparativa não tem quadrantes fixos: cada coluna é uma empresa,
     cada card um critério. Vazia, nasce com duas empresas para
     renomear — é o mínimo que uma comparação precisa. */
  function colunasIniciais(modelo) {
    if (modelo !== 'comparativa') return null;
    return [{ titulo: 'Empresa A', registros: [] }, { titulo: 'Empresa B', registros: [] }];
  }


  /* Erro de uma ação de referência: os fatais (sessão, suspensão) e a
     tarefa que sumiu são tratados aqui, como no resto do board; o
     resto volta para a tela, que mostra a mensagem dentro do quadro
     onde a pessoa estava. */
  function falhaDeReferencia(e) {
    if (tratarErroFatal(e)) throw e;
    if (e.status === 404 && !(e.dados && /Referência/.test(e.dados.mensagem || ''))) {
      irPara(urlAtividade());
      throw e;
    }
    throw e;
  }

  /* ============================================================
     BARRA DE PROGRESSO — Feedback visual enquanto os painéis
     do quadro estão sendo carregados (entre tarefa visível e
     quadro pronto). Simula carregamento progressivo para não
     deixar a impressão de travamento.
     ============================================================ */
  /* ------------------------------------------------------------
     A PRIMEIRA versão desta barra animava `.canvas-progress-bar::after`
     por CSS (@keyframes) e o JS tentava reiniciar essa animação
     mexendo em `elemento.style.animation` — só que `::after` é um
     pseudo-elemento, e pseudo-elementos NÃO podem ser lidos nem
     estilizados por `document.getElementById(...).style`. O JS
     estava, sem erro nenhum e sem avisar, mexendo num elemento que
     não tinha relação nenhuma com o que aparecia na tela. Por isso
     nada se mexia.

     A correção: o preenchimento agora é um `<div>` de verdade
     (`#canvasProgressFill`), então o JS consegue ler e mudar a
     largura dele. Em vez de `@keyframes`, a barra usa `transition`
     no CSS — o JS só muda o valor de `width`, e o navegador anima a
     mudança sozinho. Mais simples e possível de inspecionar no
     DevTools (o elemento existe de verdade na árvore).
     ------------------------------------------------------------ */
  var progressoControl = {
    fill: null,
    container: null,
    timer: null,
    mostradoEm: 0,
    /* Tempo mínimo que a barra fica visível, mesmo que os dados
       cheguem quase instantaneamente (ex.: servidor local). Sem
       isto, num carregamento rápido a barra aparece e some no
       mesmo frame — visualmente, nunca chega a existir. */
    MINIMO_VISIVEL: 450,

    elementos: function() {
      if (!this.container) {
        this.container = document.getElementById('canvasProgress');
        this.fill = document.getElementById('canvasProgressFill');
      }
      return !!(this.container && this.fill);
    },

    mostrar: function() {
      if (!this.elementos()) return;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }

      this.container.hidden = false;
      this.mostradoEm = Date.now();

      /* Zera sem transição (senão "recua" visualmente de onde ficou
         da última vez) e força reflow antes de religar a transição,
         para o navegador realmente animar 0% → 70% e não pular direto. */
      this.fill.style.transition = 'none';
      this.fill.style.width = '0%';
      void this.fill.offsetWidth; /* reflow */
      this.fill.style.transition = '';
      /* Não vai a 100%: 100% é reservado para "terminou de verdade" */
      this.fill.style.width = '70%';
    },

    esconder: function() {
      if (!this.elementos()) return;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }

      var completar = function () {
        /* Sobe rápido até 100% para o usuário ver que concluiu. */
        this.fill.style.transition = 'width .25s ease-out';
        this.fill.style.width = '100%';

        this.timer = setTimeout(function () {
          this.container.hidden = true;
          this.fill.style.transition = 'none';
          this.fill.style.width = '0%';
        }.bind(this), 320);
      }.bind(this);

      var decorrido = Date.now() - this.mostradoEm;
      if (decorrido < this.MINIMO_VISIVEL) {
        this.timer = setTimeout(completar, this.MINIMO_VISIVEL - decorrido);
      } else {
        completar();
      }
    },
  };

  /* Expõe para que BoardView possa chamar quando apropriado */
  window.ProgressoBoard = progressoControl;

  /* Renovação silenciosa — mesmo padrão de ideias.js/atividade.js:
     um 401 aqui não é "vá para o login", é "o token de acesso
     venceu". Só se o /auth/sessao também recusar é que a sessão
     acabou de verdade. */
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
     Ler o quadro que está na tela — BOARD-SALVA-002
     ------------------------------------------------------------
     A fonte da verdade na hora de gravar é o DOM: o canvas já
     desenha tudo (criar quadro, arrastar card entre colunas,
     editar, excluir), e duplicar esse estado num objeto paralelo
     seria mais uma coisa para sair de sincronia.
     ------------------------------------------------------------ */
  function lerDaTela() {
    var quadros = [];
    var paineis = document.querySelectorAll('#canvasStage .ideas-panel');

    Array.prototype.forEach.call(paineis, function (painel) {
      var tituloEl = painel.querySelector('.ideas-title');
      var colunas = [];

      /* Quadro-documento: não tem colunas nem cartões para varrer. O
         texto inteiro é um registro só, e as referências são um
         segundo registro com título fixo — explícito de propósito, em
         vez de emendar as fontes no fim do texto e ter que separá-las
         de novo por adivinhação na hora de reabrir. */
      if (painel.dataset.tipo === 'documento') {
        var corpoEl = painel.querySelector('.doc-corpo');
        var titulo = tituloEl ? tituloEl.textContent.trim() : '';
        var registros = [];

        /* `innerText`, nao `textContent`: enquanto a pessoa edita, a
           quebra de linha vive no DOM como `<br>`/`<div>`, e
           `textContent` descarta os dois — o documento voltava do banco
           com os paragrafos emendados numa parede de texto.

           O blur do `.doc-corpo` normaliza o corpo de volta para texto
           puro, mas o autosave pode sair antes disso: a aba some
           (`pagehide`), outro quadro e arrastado, a pesquisa termina. E
           nesses casos que a leitura daqui decide se a quebra se salva
           ou se perde.

           Se `innerText` vier vazio, vale `textContent`: `innerText`
           devolve string vazia quando o elemento nao esta sendo
           renderizado, e gravar isso apagaria o documento inteiro. */
        var corpoTexto = '';
        if (corpoEl) {
          corpoTexto = corpoEl.innerText != null ? corpoEl.innerText : corpoEl.textContent;
          corpoTexto = String(corpoTexto == null ? '' : corpoTexto);
          if (!corpoTexto.trim()) corpoTexto = corpoEl.textContent || '';
        /* Enter dentro de um contenteditable produz `<div><br></div>`, e
           `innerText` conta a quebra do `<br>` E a do bloco: dois Enter
           viravam tres linhas em branco, que se acumulavam a cada
           edicao. Colapsar aqui deixa o espacamento igual ao que
           `js/pesquisa.js` grava — uma linha em branco entre
           paragrafos, sempre. */
        corpoTexto = corpoTexto
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }

        if (titulo) {
          registros.push({
            titulo: titulo,
            descricao: corpoTexto,
          });
        }

        var fontes = [];
        Array.prototype.forEach.call(painel.querySelectorAll('.doc-fontes li'), function (li) {
          /* `dataset.fonte` antes de `textContent`: a referencia e
             desenhada como link, e o texto visivel do <a> e so o
             rotulo — ler dali gravaria a fonte sem a URL, e ela nao
             voltaria mais. O dataset guarda a linha inteira. */
          var t = (li.dataset.fonte || li.textContent).trim();
          if (t) fontes.push(t);
        });
        if (fontes.length) {
          registros.push({ titulo: 'Referências', descricao: fontes.join('\n') });
        }

        if (registros.length) {
          quadros.push({
            titulo: titulo,
            tipo: 'documento',
            colunas: [{ titulo: '', registros: registros }],
          });
        }
        return;
      }

      Array.prototype.forEach.call(painel.querySelectorAll('.column'), function (col) {
        var cabeca = col.querySelector('.column-head');
        /* `.column-head--empty` é a coluna que nasceu sem título —
           o texto dela não é "" por acaso, é escolha de layout. */
        var tituloCol = (cabeca && !cabeca.classList.contains('column-head--empty'))
          ? cabeca.textContent.trim() : '';

        var registros = [];
        Array.prototype.forEach.call(col.querySelectorAll('.card-list .idea'), function (card) {
          var t = card.querySelector('.idea-title');
          var d = card.querySelector('.idea-desc');
          var titulo = t ? t.textContent.trim() : '';
          /* Card sem título nenhum não sobe: o servidor recusaria
             (registros_titulo_nao_vazio) e derrubaria o autosave
             inteiro por causa de um card vazio na tela. */
          if (!titulo) return;
          registros.push({ titulo: titulo, descricao: d ? d.textContent.trim() : '' });
        });

        colunas.push({ titulo: tituloCol, registros: registros });
      });

      /* Quadro-matriz (BOARD-PESQUISA-MATRIZ): lido pelo mesmo caminho
         de colunas — é feito de post-its —, gravado com o tipo e o
         modelo, que é o que faz ele voltar desenhado como matriz. */
      var ehMatriz = painel.dataset.tipo === 'matriz' && !!painel.dataset.modelo;
      var quadro = {
        titulo: tituloEl ? tituloEl.textContent.trim() : '',
        tipo: ehMatriz ? 'matriz' : 'postits',
        colunas: colunas,
      };
      if (ehMatriz) quadro.modelo = painel.dataset.modelo;
      quadros.push(quadro);
    });

    return quadros;
  }

  /* ------------------------------------------------------------
     Ações — o que a tela chama quando algo precisa ser gravado.
     ------------------------------------------------------------ */
  window.BoardAcoes = {
    /* BOARD-SALVA-001: grava o quadro inteiro. Chamado pelo mesmo
       autosave que já existia na tela (o "Salvando..." do botão
       Voltar) — antes ele era só animação. */
    salvar: function () {
      /* BOARD-SALVA-006: antes da carga terminar, a tela vazia não é
         "quadro vazio", é "quadro ainda não chegou". Não gravar é a
         única resposta segura. */
      if (!carregado) return Promise.resolve(null);
      /* BOARD-REF: o board de referências não tem quadro de post-its.
         Gravar a tela aqui mandaria uma lista vazia — inofensivo hoje,
         mas é o mesmo gesto que BOARD-SALVA-006 existe para impedir. */
      if (ehReferencias(tarefaAtual)) return Promise.resolve([]);

      return chamarComRenovacao(baseQuadros(), {
        metodo: 'PUT',
        corpo: { quadros: lerDaTela() },
      }, false).then(function (r) {
        return (r && r.quadros) || [];
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        /* 404 aqui é a tarefa ter deixado de existir enquanto a
           pessoa trabalhava (excluída em atividade.html, idéia
           arquivada). Insistir no quadro de algo que sumiu não
           leva a lugar nenhum — volta para a lista. */
        if (e.status === 404) { irPara(urlAtividade()); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível salvar o quadro.'));
        throw e;
      });
    },

    /* BOARD-TAREFA-001: a MESMA rota que atividade.html usa para
       concluir/reabrir (ATV-TAR-CONCLUIR) — não existe uma segunda
       implementação de "concluir tarefa" no produto. */
    mudarStatus: function (novoStatus) {
      return chamarComRenovacao(
        baseTarefas() + '/' + encodeURIComponent(tarefaId) + '/status',
        { metodo: 'PATCH', corpo: { status: novoStatus } },
        false
      ).then(function (r) {
        if (r && r.tarefa) tarefaAtual = r.tarefa;
        return tarefaAtual;
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 404) { irPara(urlAtividade()); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível mudar o status da tarefa.'));
        throw e;
      });
    },

    /* A tela usa isto para não anunciar "Salvando..." quando não há
       nada a salvar ainda (BOARD-SALVA-006). */
    pronto: function () { return carregado; },

    /* BOARD-REGISTRO-001: transformar um registro do quadro numa
       tarefa da atividade. Usa a MESMA rota de ATV-TAR-CRIA — a
       tarefa nasce no fim da lista e pendente, como qualquer outra.
       Antes isto gravava `nova-tarefa` no localStorage e navegava;
       atividade.html parou de ler essa chave quando virou API, então
       o botão não fazia mais nada. */
    criarTarefa: function (titulo, descricao) {
      return chamarComRenovacao(baseTarefas(), {
        metodo: 'POST',
        corpo: { titulo: titulo, descricao: descricao || titulo, tipo: 'pesquisa' },
      }, false).then(function (r) {
        return r && r.tarefa;
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        if (e.status === 404) { irPara(urlAtividade()); throw e; }
        avisoErro(mensagemDeFalha(e, 'Não foi possível criar a tarefa.'));
        throw e;
      });
    },

    /* ---------- Referências — BOARD-REF-002 a 008 ---------- */
    adicionarSite: function (url, nome) {
      return chamarComRenovacao(baseReferencias(), {
        metodo: 'POST',
        corpo: { url: url, nome: nome || '' },
      }, false).then(function (r) { return r.referencia; }, falhaDeReferencia);
    },

    enviarImagem: function (arquivo, nome) {
      var fd = new FormData();
      /* O nome vai ANTES do arquivo: o servidor lê as partes em ordem,
         e um campo depois do arquivo chegaria só depois do upload. */
      fd.append('nome', nome || '');
      fd.append('imagem', arquivo);
      return chamarComRenovacao(baseReferencias() + '/imagem', {
        metodo: 'POST',
        corpo: fd,
      }, false).then(function (r) { return r.referencia; }, falhaDeReferencia);
    },

    /* BOARD-REF-010: "Pesquisar" numa tarefa de Referência — a IA
       busca e o servidor devolve só os cards NOVOS. */
    buscarReferencias: function () {
      return chamarComRenovacao(baseReferencias() + '/buscar', {
        metodo: 'POST',
        corpo: {},
      }, false).then(function (r) { return r; }, falhaDeReferencia);
    },

    /* BOARD-REF-008: mesmo desenho da imagem, outra rota. */
    enviarDocumento: function (arquivo, nome) {
      var fd = new FormData();
      fd.append('nome', nome || '');
      fd.append('documento', arquivo);
      return chamarComRenovacao(baseReferencias() + '/documento', {
        metodo: 'POST',
        corpo: fd,
      }, false).then(function (r) { return r.referencia; }, falhaDeReferencia);
    },

    excluirReferencia: function (id) {
      return chamarComRenovacao(baseReferencias() + '/' + encodeURIComponent(id), {
        metodo: 'DELETE',
      }, false).then(function () { return true; }, function (e) {
        /* Já não existe: o destino é o mesmo do sucesso. */
        if (e.status === 404 && e.dados && /Referência/.test(e.dados.mensagem || '')) return true;
        return falhaDeReferencia(e);
      });
    },

    /* BOARD-TAREFA-002: a MESMA rota de ATV-TAR-EXCLUI. Apaga a
       linha de verdade — e o quadro vai junto, por cascade. */
    excluir: function () {
      return chamarComRenovacao(
        baseTarefas() + '/' + encodeURIComponent(tarefaId),
        { metodo: 'DELETE' },
        false
      ).then(function () {
        return true;
      }, function (e) {
        if (tratarErroFatal(e)) throw e;
        /* 404 numa exclusão significa que já não existe — o
           destino é o mesmo do sucesso, então não vira erro na
           cara de quem pediu justamente para apagar. */
        if (e.status === 404) return true;
        avisoErro(mensagemDeFalha(e, 'Não foi possível excluir a tarefa.'));
        throw e;
      });
    },
  };

  /* ------------------------------------------------------------
     Carga
     ------------------------------------------------------------ */
  function carregar() {
    var q = new URLSearchParams(location.search);
    empresaId = q.get('empresa');
    projetoId = q.get('projeto');
    ideiaId = q.get('ideia');
    tarefaId = q.get('tarefa');

    /* BOARD-ACESSO-003: sem os quatro ids esta página não sabe de
       qual tarefa está falando — mesmo raciocínio de
       IDEIA-QUADRO-007 e da carga de atividade.js: não é estado
       vazio, é navegação inválida, e cada caso volta para o lugar
       mais próximo que ainda faz sentido. */
    if (!empresaId) { irPara(EMPRESAS); return; }
    if (!projetoId) { irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaId)); return; }
    if (!ideiaId) {
      irPara(VISAO + '?empresa=' + encodeURIComponent(empresaId) +
        '&projeto=' + encodeURIComponent(projetoId));
      return;
    }
    if (!tarefaId) { irPara(urlAtividade()); return; }

    publicarContexto();

    /* Cobre a carga INTEIRA, do primeiro pedido ao último — não só a
       parte de tarefa/quadros. Sem esqueleto próprio no card
       (BOARD-CARGA-003), esta tela é o único aviso de "carregando"
       que existe na página; começar cedo evita uma brecha entre o
       primeiro paint e o momento em que ela aparece. */
    progressoControl.mostrar();

    /* Reaproveita GET /empresas e GET /empresas/:id/projetos — as
       mesmas chamadas das outras telas, que já aplicam o filtro de
       vínculo. Aqui elas servem a dois propósitos: validar o
       caminho e dar ao assistente o par (empresa, projeto) de que
       ele depende. */
    chamarComRenovacao('/empresas', {}, false).then(function (r) {
      var empresas = (r && r.empresas) || [];
      var empresa = null;
      for (var i = 0; i < empresas.length; i++) {
        if (empresas[i].id === empresaId) { empresa = empresas[i]; break; }
      }
      if (!empresa) { irPara(EMPRESAS); return; }

      return chamarComRenovacao('/empresas/' + encodeURIComponent(empresaId) + '/projetos', {}, false)
        .then(function (rp) {
          var projetos = (rp && rp.projetos) || [];
          var projeto = null;
          for (var j = 0; j < projetos.length; j++) {
            if (projetos[j].id === projetoId) { projeto = projetos[j]; break; }
          }
          if (!projeto) { irPara(PROJETOS + '?empresa=' + encodeURIComponent(empresaId)); return; }

          window.EmpresaAtual = empresa;
          window.ProjetoAtual = projeto;
          document.title = empresa.nome + ' / ' + projeto.nome + ' · Plataforma de Design';

          /* O painel do assistente depende de empresa e projeto
             resolvidos — mesma dependência de ideias.js e
             atividade.js. A conversa é a do PROJETO (IA-CONV-001),
             não desta tarefa: o assistente não ganha uma dimensão
             nova por a pessoa ter aberto um quadro. */
          if (window.IaAssistente) window.IaAssistente.carregar();

          /* Não existe rota de "uma tarefa só" — mesmo padrão que
             atividade.js usa para achar a idéia: pede a lista e
             encontra. Não estar na lista significa "não existe ou
             você não tem acesso", e os dois levam ao mesmo lugar.

             BOARD-CARGA-002 — skeleton e quadros nascem e terminam
             JUNTOS.
             Antes, a tarefa era buscada, o card saía do esqueleto
             (revelarPainel) e SÓ DEPOIS os quadros eram pedidos ao
             servidor. Card pronto + canvas vazio faz a tela parecer
             terminada enquanto a segunda metade da carga ainda está a
             caminho — a mesma mentira de completude que o esqueleto
             de empresas.html evita (EMP-LIST-010), só que aqui era o
             próprio código do board que a criava.

             baseQuadros() só depende de tarefaId, que já vem da URL —
             não depende do objeto `achada` abaixo. Então as duas
             chamadas podem sair JUNTAS (Promise.all) em vez de uma
             esperar a outra terminar para começar: mais rápido, e o
             card só sai do estado de carregamento quando TUDO —
             tarefa e quadros — já estiver na mão.

             (progressoControl.mostrar() já rodou lá no início de
             carregar() — chamar de novo aqui reiniciaria o relógio do
             MINIMO_VISIVEL e faria a barra "piscar" de volta a 0% no
             meio da carga, sem necessidade.) */

          return Promise.all([
            chamarComRenovacao(baseTarefas(), {}, false),
            chamarComRenovacao(baseQuadros(), {}, false)
          ]).then(function (resultados) {
            var rt = resultados[0];
            var rq = resultados[1];

            var tarefas = (rt && rt.tarefas) || [];
            var achada = null;
            for (var k = 0; k < tarefas.length; k++) {
              if (tarefas[k].id === tarefaId) { achada = tarefas[k]; break; }
            }
            if (!achada) { irPara(urlAtividade()); return; }
            tarefaAtual = achada;

            /* BOARD-REF-001: tarefa de referências visuais desenha os
               quadros "Sites" e "Imagens" no lugar dos post-its. Só se
               sabe o tipo depois de ler a tarefa, então as referências
               vêm num segundo pedido — e card e quadros continuam
               aparecendo juntos (BOARD-CARGA-002). */
            if (ehReferencias(achada)) {
              return chamarComRenovacao(baseReferencias(), {}, false).then(function (rr) {
                if (window.BoardView) window.BoardView.tarefa(achada);
                if (window.BoardView) window.BoardView.referencias((rr && rr.referencias) || []);
                carregado = true;
                progressoControl.esconder();
              });
            }

            /* Card e quadros aparecem no MESMO instante: nenhum dos
               dois sai do estado de carregamento sozinho. */
            if (window.BoardView) window.BoardView.tarefa(achada);
            if (window.BoardView) window.BoardView.quadros((rq && rq.quadros) || []);

            /* A partir daqui a tela espelha o banco — e só a partir
               daqui gravar o que está nela é seguro. */
            carregado = true;
            /* Esconde a barra de progresso: tudo carregado, de verdade. */
            progressoControl.esconder();

            /* BOARD-MATRIZ-TAREFA: tarefa que é uma matriz. "Pesquisar"
               some — a matriz é preenchida à mão, com post-its. E o board
               vazio ganha a matriz do modelo: só DEPOIS de `carregado`,
               porque é aí que o autosave passa a valer (BOARD-SALVA-006),
               e só com o board vazio, para nunca sobrepor o que já está
               gravado. Concluída não cria nada (criarQuadroMatriz respeita
               o modo leitura). */
            /* BOARD-PESQUISA-100: o botão de "Próximos passos" não é
               gravado — só o quadro —, então volta a cada carga. */
            if (window.PesquisaPainel && typeof window.PesquisaPainel.decorarProximosPassos === 'function') {
              window.PesquisaPainel.decorarProximosPassos();
            }

            /* BOARD-CONVERSA-001 a 003: a tarefa "Conversa com usuários".
               Sem "Pesquisar" — o que se busca aqui não está na web. Board
               vazio ganha o "Roteiro" e "O que ouvimos", só depois de
               `carregado` e só com o board vazio, pelos mesmos motivos da
               matriz logo abaixo. E o aviso sobre dados pessoais, que não
               é gravado: ele volta a cada carga. */
            if (achada && achada.tipo === 'conversa_usuarios') {
              var botaoPesquisar = document.getElementById('btnGerarIA');
              if (botaoPesquisar) botaoPesquisar.hidden = true;
              ligarMontarRoteiro(achada);
              if (!((rq && rq.quadros) || []).length && typeof window.criarQuadrosDaConversa === 'function') {
                window.criarQuadrosDaConversa();
              }
              avisarDadosPessoais();
            }

            var modelo = modeloDaTarefa(achada);
            if (modelo) {
              var btnPesquisar = document.getElementById('btnGerarIA');
              if (btnPesquisar) btnPesquisar.hidden = true;
              if (!((rq && rq.quadros) || []).length && typeof window.criarQuadroMatriz === 'function') {
                window.criarQuadroMatriz(null, modelo, colunasIniciais(modelo));
              }
            }

            /* ATV-GERAR-012: quem precisa agir DEPOIS que a tarefa e os
               quadros estão na tela (a pesquisa pedida pelo "Gerar com
               ajuda da IA") espera por este evento — agir antes faria
               o redesenho dos quadros apagar o que a pesquisa pôs. */
            document.dispatchEvent(new CustomEvent('board:carregado', { detail: { tarefa: achada } }));
          });
        });
    }, function (e) {
      /* A barra pode ter sido mostrada (progressoControl.mostrar() já
         roda antes da Promise.all de tarefa+quadros) e, num erro,
         `esconder()` normal nunca é alcançado — sem isto ela ficaria
         parada na tela prometendo uma carga que não vai terminar. */
      progressoControl.esconder();

      if (tratarErroFatal(e)) return;
      /* Antes do aviso: o esqueleto precisa parar de prometer que a
         tarefa esta a caminho. */
      if (window.BoardView) window.BoardView.tarefaIndisponivel();
      avisoErro(mensagemDeFalha(e, 'Não foi possível carregar a tarefa. Recarregue a página.'));
    });
  }

  carregar();
})();
