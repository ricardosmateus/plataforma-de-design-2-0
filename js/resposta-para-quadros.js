/**
 * Parseador de Respostas para Múltiplos Quadros
 * 
 * Funcionalidade:
 * - Divide uma resposta em múltiplas seções (por ## headers)
 * - Associa referências a cada seção
 * - Decide formato (documento vs post-its)
 * - Retorna plano estruturado para criar quadros
 * 
 * Exports: window.RespostaParaQuadros.planejarQuadros(resposta, fontes)
 */

window.RespostaParaQuadros = (function () {
  'use strict';

  /**
   * Remove marcação markdown de um texto.
   * Remove: **bold**, __underline__, `code`, [links](), headings, lists
   */
  function semMarcacao(texto) {
    if (!texto) return '';
    
    return texto
      .replace(/\*\*(.+?)\*\*/g, '$1')           /* **bold** → bold */
      .replace(/__(.+?)__/g, '$1')               /* __underline__ → underline */
      .replace(/`([^`]+)`/g, '$1')               /* `code` → code */
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  /* [text](url) → text */
      .replace(/^#+\s+/gm, '')                   /* Remove headers */
      .replace(/^[-*+]\s+/gm, '')                /* Remove list markers */
      .trim();
  }

  /**
   * Divide uma resposta em seções por headers.
   * Detecta: ## Título, **Título** ou Título:
   */
  function secoesDaResposta(texto) {
    if (!texto) return [];

    var linhas = texto.split('\n');
    var secoes = [];
    var secaoAtual = null;

    linhas.forEach(function (linha) {
      var match = null;
      var titulo = null;

      /* ## Título */
      if ((match = linha.match(/^##\s+(.+)$/))) {
        titulo = match[1].trim();
      }
      /* **Título** */
      else if ((match = linha.match(/^\*\*(.+?)\*\*\s*$/))) {
        titulo = match[1].trim();
      }
      /* Título: */
      else if ((match = linha.match(/^([^:]+):\s*$/)) && linha.length < 100) {
        titulo = match[1].trim();
      }

      if (titulo) {
        if (secaoAtual) {
          secoes.push(secaoAtual);
        }
        secaoAtual = {
          titulo: semMarcacao(titulo),
          linhas: []
        };
      } else if (secaoAtual) {
        secaoAtual.linhas.push(linha);
      }
    });

    if (secaoAtual) {
      secoes.push(secaoAtual);
    }

    return secoes;
  }

  /**
   * Separa conteúdo de perguntas dentro de uma seção.
   */
  function partirSecao(linhasConteudo) {
    var conteudo = [];
    var perguntas = [];
    var inPerguntas = false;

    linhasConteudo.forEach(function (linha) {
      if (linha.match(/^#+\s*(Pergunta|Question|Dúvida|Questão)/i)) {
        inPerguntas = true;
      }

      if (inPerguntas) {
        if (linha.trim()) {
          perguntas.push(linha.trim());
        }
      } else {
        conteudo.push(linha);
      }
    });

    return {
      conteudo: conteudo.join('\n').trim(),
      perguntas: perguntas
    };
  }

  /**
   * Extrai e associa referências a uma seção.
   * Detecta: [texto](url), Fonte: url, Referência: url
   */
  function extrairReferencias(texto, secaoTitulo) {
    var referencias = [];
    var padoes = [
      /\[([^\]]+)\]\(([^)]+)\)/g,        /* [texto](url) */
      /Fonte:\s*([^\n]+)/gi,             /* Fonte: url */
      /Referência:\s*([^\n]+)/gi,        /* Referência: url */
      /https?:\/\/[^\s]+/g               /* URLs diretas */
    ];

    padoes.forEach(function (padrao) {
      var match;
      while ((match = padrao.exec(texto))) {
        var titulo = null;
        var url = null;

        if (match[2]) {
          /* [texto](url) */
          titulo = match[1].trim();
          url = match[2].trim();
        } else {
          /* Outras capturas */
          url = match[1].trim();
          titulo = url.length > 50 ? url.substring(0, 50) + '…' : url;
        }

        if (url && !referencias.some(function (r) { return r.url === url; })) {
          referencias.push({ titulo: titulo, url: url });
        }
      }
    });

    return referencias;
  }

  /**
   * Planeja os quadros que serão criados a partir de uma resposta.
   * Retorna: {tipo: 'documento'|'postits', quadros: [...]}
   */
  function planejarQuadros(resposta, fontes) {
    if (!resposta) {
      return { tipo: 'documento', quadros: [] };
    }

    /* Converter array de strings em array de objetos */
    var fontesObj = (fontes || []).map(function (f) {
      return typeof f === 'string' ? { url: f } : f;
    });

    /* Dividir em seções */
    var secoes = secoesDaResposta(resposta);

    if (secoes.length === 0) {
      /* Sem headers — tudo em uma seção */
      var partes = partirSecao(resposta.split('\n'));
      secoes = [{
        titulo: '',
        linhas: resposta.split('\n')
      }];
    }

    /* Processar cada seção */
    var quadros = secoes.map(function (secao) {
      var partes = partirSecao(secao.linhas);
      var referencias = extrairReferencias(partes.conteudo, secao.titulo);

      /* Adicionar fontes globais se não houver referências locais */
      if (referencias.length === 0 && fontesObj.length > 0) {
        referencias = fontesObj;
      }

      return {
        titulo: secao.titulo || 'Resultado',
        conteudo: partes.conteudo,
        perguntas: partes.perguntas,
        referencias: referencias,
        descricao: partes.conteudo.substring(0, 200)
      };
    });

    /* Decidir formato baseado no tamanho total */
    var totalChars = resposta.length;
    var tipo = totalChars > 2000 ? 'documento' : 'postits';

    return {
      tipo: tipo,
      quadros: quadros
    };
  }

  /* Exportar API pública */
  return {
    planejarQuadros: planejarQuadros,
    semMarcacao: semMarcacao,
    secoesDaResposta: secoesDaResposta,
    extrairReferencias: extrairReferencias
  };
})();
