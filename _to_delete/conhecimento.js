/* ============================================================
   Conhecimento em HTML — a terceira projeção
   ============================================================
   O plano prevê três leituras do mesmo dado:

     pastas  → resumo por categoria    (quantas, onde)
     grafo   → rede                    (o que se liga a quê)
     ESTA    → lista completa          (o que exatamente existe)

   É a única das três que o Ctrl+F encontra, que o leitor de tela
   percorre e que sobrevive com JavaScript pela metade. É também a
   razão de o canvas poder ser `aria-hidden` sem que nada se perca:
   ele é exploração opcional, não a única porta.

   Consome `/grafo`, que já traz idéia, pasta e tags — nenhuma rota
   nova. Reaproveita a carga que o desenho já faz.
   ============================================================ */
(function () {
  'use strict';

  var wrap   = document.getElementById('conhecimentoWrap');
  var lista  = document.getElementById('conhecimentoLista');
  var resumo = document.getElementById('conhecimentoResumo');
  var busca  = document.getElementById('conhecimentoBusca');
  if (!wrap || !lista) return;

  var ideias = [];
  var filtro = '';

  function empresa() {
    return new URLSearchParams(window.location.search).get('empresa');
  }

  function carregar() {
    var emp = empresa();
    if (!emp) return;

    /* API.buscar em vez de fetch: renova o token vencido em
       silencio. Com fetch cru, abrir a pagina com o token ja
       vencido derrubava esta secao sozinha. */
    window.API.buscar('/empresas/' + encodeURIComponent(emp) + '/grafo')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        ideias = ((d && d.nos) || []).filter(function (n) { return n.tipo === 'ideia'; });
        desenhar();
      })
      .catch(function (e) {
        /* Some em silêncio, e aqui isso é defensável: a seção é uma
           terceira leitura de um dado que as pastas acima já
           mostraram, e elas têm o próprio aviso de falha. Duas
           mensagens de erro para a mesma causa é ruído. */
        console.error('[conhecimento]', e);
        wrap.hidden = true;
      });
  }

  function normalizar(t) {
    return String(t || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function combina(ideia) {
    if (!filtro) return true;
    var alvo = normalizar(
      ideia.rotulo + ' ' + (ideia.assunto || '') + ' ' + (ideia.tags || []).join(' ')
    );
    /* Todos os termos precisam aparecer, em qualquer ordem: quem
       digita "personas mercado" quer o cruzamento, não a união. */
    return normalizar(filtro).split(/\s+/).every(function (t) {
      return !t || alvo.indexOf(t) !== -1;
    });
  }

  function linkDaIdeia(n) {
    var emp = empresa();
    if (!emp || !n.projeto_id || !n.ideia_id) return null;
    return 'atividade.html?empresa=' + encodeURIComponent(emp) +
      '&projeto=' + encodeURIComponent(n.projeto_id) +
      '&ideia=' + encodeURIComponent(n.ideia_id);
  }

  function desenhar() {
    if (!ideias.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    lista.innerHTML = '';

    var visiveis = ideias.filter(combina);

    resumo.textContent = filtro
      ? visiveis.length + ' de ' + ideias.length + ' idéias'
      : ideias.length + (ideias.length === 1 ? ' idéia finalizada' : ' idéias finalizadas');

    if (!visiveis.length) {
      var nada = document.createElement('p');
      nada.className = 'ch-vazio';
      nada.textContent = 'Nada encontrado para “' + filtro + '”.';
      lista.appendChild(nada);
      return;
    }

    /* Agrupadas pela pasta PRINCIPAL, e só por ela — diferente das
       pastas acima, que desde a mudança contam também as tags.

       A diferença é de propósito e vem do que cada seção é. Lá em
       cima, uma pasta responde "em que a empresa tem conhecimento",
       e uma idéia que fala de mercado E de concorrentes conta nas
       duas. Aqui é uma LISTA DE IDÉIAS: repetir a mesma idéia em
       três seções faria a contagem no topo ("1 idéia finalizada")
       contradizer o que se vê logo abaixo.

       As tags não somem — vão ao lado do título, como links para a
       página do tema. Quem quer a leitura por categoria clica nelas;
       quem quer o inventário lê a lista. */
    var pastas = {};
    visiveis.forEach(function (n) {
      var chave = n.assunto || 'Sem pasta';
      (pastas[chave] = pastas[chave] || []).push(n);
    });

    Object.keys(pastas).sort(function (a, b) {
      return pastas[b].length - pastas[a].length || a.localeCompare(b, 'pt');
    }).forEach(function (nome) {
      lista.appendChild(secaoDaPasta(nome, pastas[nome]));
    });
  }

  function secaoDaPasta(nome, itens) {
    var bloco = document.createElement('section');
    bloco.className = 'ch-pasta';

    var h = document.createElement('h3');
    h.className = 'ch-pasta-nome';
    h.appendChild(document.createTextNode(nome));
    var conta = document.createElement('span');
    conta.className = 'ch-pasta-conta';
    conta.textContent = itens.length + (itens.length === 1 ? ' idéia' : ' idéias');
    h.appendChild(conta);
    bloco.appendChild(h);

    var ul = document.createElement('ul');
    ul.className = 'ch-itens';
    itens.forEach(function (n) { ul.appendChild(item(n)); });
    bloco.appendChild(ul);
    return bloco;
  }

  /* O endereço da página de um tema. Leva `projeto` junto quando ele
     existe na URL — não porque o tema pertença a um projeto (ele
     cruza os projetos da empresa), mas para a volta pela trilha e
     pelo menu lateral não perder o contexto de onde a pessoa veio. */
  function linkDoTema(categoria) {
    var emp = empresa();
    if (!emp || !categoria) return null;
    var q = new URLSearchParams(window.location.search);
    var projeto = q.get('projeto');
    return 'tema.html?empresa=' + encodeURIComponent(emp) +
      (projeto ? '&projeto=' + encodeURIComponent(projeto) : '') +
      '&categoria=' + encodeURIComponent(categoria);
  }

  function item(n) {
    var li = document.createElement('li');
    li.className = 'ch-linha';
    var href = linkDaIdeia(n);

    /* Sem destino possível vira <span>: link que não navega recebe
       foco do teclado e não faz nada, o que é pior do que texto. */
    var alvo = document.createElement(href ? 'a' : 'span');
    alvo.className = 'ch-item';
    if (href) alvo.href = href;

    var titulo = document.createElement('span');
    titulo.className = 'ch-item-titulo';
    titulo.textContent = n.rotulo;
    alvo.appendChild(titulo);

    li.appendChild(alvo);

    /* ------------------------------------------------------------
       As tags viraram links, e saíram de dentro do link da idéia
       ------------------------------------------------------------
       Antes elas eram <span> dentro do <a> da idéia — decorativas, e
       clicá-las levava à idéia como qualquer outro ponto da linha.
       Mas "Concorrentes" numa idéia é a pergunta "o que sabemos
       sobre concorrentes?", e a resposta não é aquela idéia: é o
       tema inteiro, atravessando as atividades da empresa.

       Ficam FORA do <a> por obrigação, não por estilo: <a> dentro de
       <a> é marcação inválida, e o navegador desmonta o segundo —
       o clique voltaria a cair na idéia sem nenhum aviso de que algo
       estava errado.
       ------------------------------------------------------------ */
    if (n.tags && n.tags.length) {
      var tags = document.createElement('span');
      tags.className = 'ch-tags';
      n.tags.forEach(function (t) {
        var destino = linkDoTema(t);
        var tag = document.createElement(destino ? 'a' : 'span');
        tag.className = 'ch-tag';
        tag.textContent = t;
        if (destino) {
          tag.href = destino;
          tag.title = 'Ler o que foi escrito sobre ' + t;
        }
        tags.appendChild(tag);
      });
      li.appendChild(tags);
    }

    return li;
  }

  if (busca) {
    var atraso = null;
    busca.addEventListener('input', function () {
      /* Filtrar a cada tecla redesenha a lista inteira; 120ms tira
         isso do caminho da digitação sem que a espera se perceba. */
      clearTimeout(atraso);
      atraso = setTimeout(function () {
        filtro = busca.value.trim();
        desenhar();
      }, 120);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregar);
  } else {
    carregar();
  }

  window.Conhecimento = { recarregar: carregar };
})();
