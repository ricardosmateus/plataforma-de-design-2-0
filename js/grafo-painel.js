/* ============================================================
   Painel do grafo — clicar num nó
   ============================================================
   O canvas é `aria-hidden` e não recebe foco. Este painel é o que
   torna o grafo NAVEGÁVEL: ele é HTML de verdade — foco, teclado,
   leitor de tela — e é aberto tanto pelo clique no desenho quanto
   pelos botões de categoria da lista de pastas.

   Por isso ele não depende do canvas para existir: recebe os nós
   quando o grafo carrega, mas sabe se virar sem eles.
   ============================================================ */
(function () {
  'use strict';

  var painel = document.getElementById('grafoPainel');
  if (!painel) return;

  var titulo  = document.getElementById('grafoPainelTitulo');
  var meta    = document.getElementById('grafoPainelMeta');
  var lista   = document.getElementById('grafoPainelLista');
  var fechar  = document.getElementById('grafoPainelFechar');

  var nos = [];
  var arestas = [];
  var focoAnterior = null;
  var abriuDaUrl = false;

  function empresa() {
    return new URLSearchParams(window.location.search).get('empresa');
  }

  /* O link de uma idéia precisa do projeto DELA, não do projeto que
     está na URL desta página. Uma pasta cruza os projetos da
     empresa: "Personas" pode reunir idéias de três projetos
     diferentes, e mandar todas para o projeto da barra de endereço
     leva a atividade errada — ou a um redirecionamento de volta,
     que é como o bug apareceria primeiro. `/grafo` já devolve
     `projeto_id` por idéia justamente para isto. */
  function linkDaIdeia(dados) {
    var emp = empresa();
    var proj = dados && dados.projeto_id;
    if (!emp || !proj || !dados.ideia_id) return null;
    return 'atividade.html?empresa=' + encodeURIComponent(emp) +
      '&projeto=' + encodeURIComponent(proj) +
      '&ideia=' + encodeURIComponent(dados.ideia_id);
  }

  /* O endereço da página do tema. Leva `projeto` junto quando existe
     na URL: o tema não pertence a um projeto (cruza os da empresa),
     mas a trilha e o menu da página de destino precisam saber de
     onde a pessoa veio para a volta não perder o contexto. */
  function linkDoTema(categoria) {
    var emp = empresa();
    if (!emp || !categoria) return null;
    var projeto = new URLSearchParams(window.location.search).get('projeto');
    return 'tema.html?empresa=' + encodeURIComponent(emp) +
      (projeto ? '&projeto=' + encodeURIComponent(projeto) : '') +
      '&categoria=' + encodeURIComponent(categoria);
  }

  function vizinhos(no) {
    var fora = [];
    arestas.forEach(function (e) {
      if (e.a === no) fora.push({ no: e.b, tipo: e.tipo });
      if (e.b === no) fora.push({ no: e.a, tipo: e.tipo });
    });
    return fora;
  }

  /* A pasta aberta vira endereço. Sem isto, "Acessar pasta" não tem
     como ser compartilhada nem sobreviver a um F5 — e a pessoa que
     manda o link de uma pasta para o time manda, na prática, a
     página inteira e a instrução de procurar. `replaceState` e não
     `pushState`: abrir e trocar de pasta é folhear, não navegar, e
     encher o histórico faz o botão Voltar do navegador parar de
     fazer o que a pessoa espera. */
  function marcarNaUrl(nome) {
    try {
      var u = new URL(window.location.href);
      if (nome) u.searchParams.set('pasta', nome);
      else u.searchParams.delete('pasta');
      window.history.replaceState(null, '', u);
    } catch (e) { /* URL exótica: a pasta abre do mesmo jeito */ }
  }

  function abrir(no) {
    focoAnterior = document.activeElement;
    lista.innerHTML = '';
    marcarNaUrl(no.tipo === 'categoria' ? no.rotulo : null);

    var ligados = vizinhos(no);

    if (no.tipo === 'categoria') {
      titulo.textContent = no.rotulo;
      var comoPasta = ligados.filter(function (l) { return l.tipo === 'assunto'; });
      var comoTag   = ligados.filter(function (l) { return l.tipo === 'tag'; });
      meta.textContent = frase(comoPasta.length, 'idéia nesta pasta', 'idéias nesta pasta') +
        (comoTag.length ? ' · ' + frase(comoTag.length, 'menção como tag', 'menções como tag') : '');

      /* ------------------------------------------------------------
         A pergunta que o painel não respondia
         ------------------------------------------------------------
         Listar os títulos das idéias diz ONDE o assunto aparece.
         Quem abre "Concorrentes" quase sempre quer a outra coisa: o
         que foi efetivamente escrito sobre concorrentes. Até aqui a
         única forma de descobrir era abrir as idéias uma a uma e
         reler as atividades inteiras, separando na cabeça o que era
         de mercado e o que era de estratégia.

         Por isso este botão vem ANTES das listas, e é o primário: em
         boa parte das visitas ele é o motivo da visita. As listas
         continuam logo abaixo, para quem quer o mapa e não o texto.
         ------------------------------------------------------------ */
      var hrefTema = linkDoTema(no.rotulo);
      if (hrefTema) {
        var ler = document.createElement('a');
        ler.className = 'btn btn--primary gp-abrir';
        ler.textContent = 'Ler o que foi escrito sobre ' + no.rotulo;
        ler.href = hrefTema;
        lista.appendChild(ler);
      }

      if (comoPasta.length) lista.appendChild(grupo('Nesta pasta', comoPasta));
      if (comoTag.length)   lista.appendChild(grupo('Mencionam como tag', comoTag));
    } else {
      titulo.textContent = no.rotulo;
      var d = no.dados || {};
      var partes = [];
      if (d.assunto) partes.push('Pasta: ' + d.assunto);
      if (d.tags && d.tags.length) partes.push('Tags: ' + d.tags.join(', '));
      meta.textContent = partes.join(' · ') || 'Idéia finalizada';

      lista.appendChild(corretor(no, d));

      var href = linkDaIdeia(d);
      if (href) {
        var ir = document.createElement('a');
        ir.className = 'btn btn--primary gp-abrir';
        ir.textContent = 'Abrir idéia';
        ir.href = href;
        lista.appendChild(ir);
      }
    }

    painel.hidden = false;
    fechar.focus();
    document.addEventListener('keydown', aoTeclar);
  }

  /* ------------------------------------------------------------
     Corrigir a pasta
     ------------------------------------------------------------
     "A taxonomia que a IA propõe e o usuário confirma" — até aqui
     só existia a proposta. Sem isto, arrumar uma pasta errada
     significava tirar a idéia de "finalizado" e devolver, o que
     apaga tudo e reclassifica no escuro, torcendo para sair
     diferente.

     O <select> só oferece as 24 categorias: o vocabulário é fechado
     para a pessoa pelo mesmo motivo que é fechado para a IA. Campo
     livre aqui reabriria pela interface o problema que ele existe
     para evitar.
     ------------------------------------------------------------ */
  function corretor(no, d) {
    var bloco = document.createElement('div');
    bloco.className = 'gp-corrigir';

    var rotulo = document.createElement('label');
    rotulo.className = 'gp-grupo-titulo';
    rotulo.textContent = 'Pasta';
    var idSelect = 'gpPasta';
    rotulo.setAttribute('for', idSelect);
    bloco.appendChild(rotulo);

    var linha = document.createElement('div');
    linha.className = 'gp-corrigir-linha';

    var select = document.createElement('select');
    select.className = 'gp-select';
    select.id = idSelect;

    var dominios = (window.Grafo && window.Grafo.dominios) || {};
    Object.keys(dominios).forEach(function (dom) {
      var g = document.createElement('optgroup');
      g.label = dom;
      dominios[dom].forEach(function (cat) {
        var o = document.createElement('option');
        o.value = cat;
        o.textContent = cat;
        if (cat === d.assunto) o.selected = true;
        g.appendChild(o);
      });
      select.appendChild(g);
    });

    /* Dizer QUEM classificou muda como a pessoa lê a pasta: proposta
       da IA se olha com desconfiança, decisão de alguém do time
       não. Criada antes do botão porque o handler dele a usa. */
    var marca = document.createElement('p');
    marca.className = 'gp-marca';
    marca.textContent = 'Pasta definida por uma pessoa.';
    marca.hidden = !d.taxonomia_manual;

    var salvar = document.createElement('button');
    salvar.type = 'button';
    salvar.className = 'btn btn--secondary';
    salvar.textContent = 'Salvar';
    salvar.disabled = true;

    /* Só habilita quando há mudança de verdade: um botão sempre
       clicável convida a gravar o que já estava lá. */
    select.addEventListener('change', function () {
      salvar.disabled = select.value === d.assunto;
    });

    salvar.addEventListener('click', function () {
      salvar.disabled = true;
      salvar.textContent = 'Salvando…';
      gravarPasta(d, select.value).then(
        function () {
          d.assunto = select.value;
          salvar.textContent = 'Salvo';
          marca.hidden = false;
          /* Pastas e grafo mostram o mesmo dado; deixar uma
             desatualizada depois de uma correção é pior do que não
             ter a correção — a tela passaria a se contradizer. */
          if (window.Grafo) window.Grafo.recarregar();
        },
        function (e) {
          console.error('[taxonomia]', e);
          salvar.textContent = 'Não deu certo';
          salvar.disabled = false;
        }
      );
    });

    linha.appendChild(select);
    linha.appendChild(salvar);
    bloco.appendChild(linha);
    bloco.appendChild(marca);

    return bloco;
  }

  function gravarPasta(d, assunto) {
    var emp = empresa();
    if (!emp || !d.projeto_id || !d.ideia_id) return Promise.reject(new Error('sem contexto'));

    return fetch(
      '/empresas/' + encodeURIComponent(emp) +
      '/projetos/' + encodeURIComponent(d.projeto_id) +
      '/ideias/' + encodeURIComponent(d.ideia_id) + '/taxonomia',
      {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        /* As tags continuam as que estavam: esta tela corrige a
           pasta, que é o que a pessoa vê errado. Mexer nas tags
           junto seria decidir por ela algo que ela não pediu. */
        body: JSON.stringify({ assunto: assunto, tags: d.tags || [] })
      }
    ).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function grupo(rotulo, itens) {
    var bloco = document.createElement('div');
    bloco.className = 'gp-grupo';

    var h = document.createElement('h4');
    h.className = 'gp-grupo-titulo';
    h.textContent = rotulo;
    bloco.appendChild(h);

    var ul = document.createElement('ul');
    ul.className = 'gp-lista';
    itens.forEach(function (item) {
      var li = document.createElement('li');
      var d = item.no.dados || {};
      var destino = item.no.tipo === 'ideia' ? linkDaIdeia(d) : null;

      /* Idéia sem link possível vira <span>: um <a href="#"> que não
         vai a lugar nenhum é pior do que texto, porque promete
         navegação e recebe foco do teclado à toa. */
      var navegavel = Boolean(destino) || item.no.tipo === 'categoria';
      var a = document.createElement(navegavel ? 'a' : 'span');
      a.className = 'gp-item';
      a.textContent = item.no.rotulo;
      if (destino) a.href = destino;
      if (item.no.tipo === 'categoria') {
        a.href = '#';
        /* Categoria dentro do painel não navega: aprofunda no
           próprio painel. Sair da página para ver a categoria
           vizinha quebraria a leitura no meio. */
        a.addEventListener('click', function (ev) { ev.preventDefault(); abrir(item.no); });
      }
      li.appendChild(a);
      ul.appendChild(li);
    });
    bloco.appendChild(ul);
    return bloco;
  }

  function frase(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  function fecharPainel() {
    painel.hidden = true;
    marcarNaUrl(null);
    document.removeEventListener('keydown', aoTeclar);
    /* Devolver o foco de onde ele veio é o que impede a pessoa que
       navega por teclado de voltar ao topo da página a cada
       fechamento. */
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  function aoTeclar(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); fecharPainel(); }
  }

  fechar.addEventListener('click', fecharPainel);

  window.GrafoPainel = {
    pronto: function (n, a) {
      nos = n; arestas = a;
      /* Entrar direto num link de pasta abre o painel sozinho. Só
         na primeira carga: reabrir a cada atualização do grafo
         reabriria por cima do que a pessoa estiver lendo. */
      if (!abriuDaUrl) {
        abriuDaUrl = true;
        var pedida = new URLSearchParams(window.location.search).get('pasta');
        if (pedida) window.GrafoPainel.porCategoria(pedida);
      }
    },
    abrir: abrir,
    porCategoria: function (nome) {
      var achado = nos.filter(function (n) {
        return n.tipo === 'categoria' && n.rotulo === nome;
      })[0];
      if (achado) abrir(achado);
      return !!achado;
    }
  };
})();
