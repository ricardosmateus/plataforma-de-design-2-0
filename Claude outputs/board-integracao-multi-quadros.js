/* ============================================================
   INTEGRAÇÃO — Como usar RespostaParaQuadros em board.html
   ============================================================

   Este arquivo mostra o código que deve ser ADICIONADO a
   board.html para criar múltiplos quadros com referências
   associadas a cada um.

   LOCAL: Depois de criarQuadroResultado(), antes do BoardView.

   ============================================================ */

/**
 * Versão melhorada de criarQuadroResultado que:
 * 1. Divide resposta por seções (assuntos)
 * 2. Cria um board por seção
 * 3. Mantém referências com sua seção de origem
 *
 * @param {string} tituloBase - Título do resultado (ex: "Resultado da pesquisa")
 * @param {array} itens - Array de {titulo, descricao} (formato antigo, compatível)
 * @param {object} opcoes - {resposta, fontes} para usar novo modo multi-quadro
 *
 * @returns {element} O primeiro quadro criado, ou null
 */
window.criarQuadroResultadoV2 = function(tituloBase, itens, opcoes) {
  /* BOARD-LEITURA-003 */
  if (modoLeitura) return null;

  /* Modo compatível: usar o antigo se itens for passado */
  if (itens && itens.length && !opcoes) {
    return window.criarQuadroResultado(tituloBase, itens);
  }

  opcoes = opcoes || {};
  var resposta = opcoes.resposta;
  var fontes = opcoes.fontes;

  if (!resposta || typeof resposta !== 'string') {
    return window.criarQuadroResultado(tituloBase, itens || []);
  }

  /* Usar RespostaParaQuadros para dividir e agrupar */
  if (!window.RespostaParaQuadros) {
    console.error('[Board] RespostaParaQuadros não está carregado.');
    return window.criarQuadroResultado(tituloBase, itens || []);
  }

  var plano = window.RespostaParaQuadros.planejarQuadros(resposta, fontes);
  var primeiroQuadro = null;

  plano.quadros.forEach(function (secao, indice) {
    var titulo = indice === 0 ? tituloBase : tituloBase + ' — ' + secao.titulo;
    var quadro = null;

    if (plano.tipo === 'documento') {
      /* Criar quadro documento */
      quadro = criarQuadroDocumento(titulo, secao);
    } else {
      /* Criar quadro com post-its */
      quadro = criarQuadroComPostits(titulo, secao);
    }

    if (quadro && indice === 0) {
      primeiroQuadro = quadro;
    }
  });

  atualizarColunas();
  dispararAutosave();
  return primeiroQuadro;
};

/**
 * Cria um quadro do tipo "documento" com conteúdo fluente.
 * Usado quando a resposta é muito longa ou tem múltiplas seções.
 */
function criarQuadroDocumento(titulo, secao) {
  if (modoLeitura) return null;

  var quadro = criarQuadro(titulo, 1, ['']);
  if (!quadro) return null;

  var lista = quadro.querySelector('.card-list');
  if (!lista) return null;

  /* O "card" de documento é um único elemento com contenteditable */
  var cardDoc = document.createElement('div');
  cardDoc.className = 'idea card-documento';
  cardDoc.setAttribute('contenteditable', 'true');
  cardDoc.setAttribute('data-tipo', 'documento');

  /* Cabeçalho do documento */
  var cabeca = document.createElement('div');
  cabeca.className = 'documento-cabeca';
  cabeca.textContent = secao.titulo;
  cardDoc.appendChild(cabeca);

  /* Conteúdo principal */
  var corpo = document.createElement('div');
  corpo.className = 'documento-corpo';
  corpo.textContent = secao.conteudo;
  cardDoc.appendChild(corpo);

  /* Perguntas em aberto */
  if (secao.perguntas && secao.perguntas.length) {
    var perguntasEl = document.createElement('div');
    perguntasEl.className = 'documento-perguntas';

    var perguntasTitulo = document.createElement('h4');
    perguntasTitulo.textContent = 'Perguntas em aberto';
    perguntasEl.appendChild(perguntasTitulo);

    secao.perguntas.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'pergunta-item';
      item.textContent = p;
      perguntasEl.appendChild(item);
    });

    cardDoc.appendChild(perguntasEl);
  }

  /* Referências / Fontes */
  if (secao.referencias && secao.referencias.length) {
    var refEl = document.createElement('div');
    refEl.className = 'documento-referencias';

    var refTitulo = document.createElement('h4');
    refTitulo.textContent = 'Referências';
    refEl.appendChild(refTitulo);

    secao.referencias.forEach(function (ref) {
      var refItem = document.createElement('div');
      refItem.className = 'referencia-item';

      if (ref.url) {
        var link = document.createElement('a');
        link.href = ref.url;
        link.target = '_blank';
        link.textContent = ref.titulo || ref.url;
        refItem.appendChild(link);
      } else {
        refItem.textContent = ref.titulo;
      }

      refEl.appendChild(refItem);
    });

    cardDoc.appendChild(refEl);
  }

  lista.appendChild(cardDoc);
  return quadro;
}

/**
 * Cria um quadro com post-its para respostas curtas.
 * Um post-it por parágrafo ou item.
 */
function criarQuadroComPostits(titulo, secao) {
  if (modoLeitura) return null;

  var quadro = criarQuadro(titulo, 1, ['']);
  if (!quadro) return null;

  var lista = quadro.querySelector('.card-list');
  if (!lista) return null;

  /* Dividir conteúdo em parágrafos */
  var paragrafos = secao.conteudo
    .split('\n\n')
    .map(function (p) { return p.trim(); })
    .filter(Boolean);

  var desc = paragrafos.length > 0
    ? paragrafos[0]
    : 'Resposta: ' + secao.titulo;

  if (desc.length > 280) {
    desc = desc.substring(0, 277) + '…';
  }

  var card = criarCard(secao.titulo || 'Resultado', desc);
  lista.appendChild(card);

  /* Referências em um post-it separado */
  if (secao.referencias && secao.referencias.length) {
    var refDesc = 'Fontes:\n' + secao.referencias
      .map(function (r) { return '• ' + (r.titulo || r.url); })
      .join('\n');

    var refCard = criarCard('Referências', refDesc);
    lista.appendChild(refCard);
  }

  return quadro;
}

/**
 * Versão integrada ao fluxo de pesquisa (pesquisarNoQuadro em pesquisa.js)
 * Chamada quando a busca termina com uma resposta longa
 */
window.criarQuadroResultadoComReferencias = function(titulo, resposta, fontes) {
  return window.criarQuadroResultadoV2(titulo, null, {
    resposta: resposta,
    fontes: fontes
  });
};
