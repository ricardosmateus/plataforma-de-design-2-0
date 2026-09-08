/* ============================================================
   RESPOSTA PARA QUADROS — Converte respostas em múltiplos boards
   ============================================================

   Responsável por:
   1. Dividir resposta por seções/assuntos
   2. Separar conteúdo de perguntas dentro cada seção
   3. Agrupar referências com sua seção de origem
   4. Decidir formato (documento vs post-its) para a resposta
   5. Criar um board por seção, mantendo referências associadas

   Execução:
   - Gatilho: quando board.html recebe resposta da IA
   - Usa: window.criarQuadroResultado ou window.criarQuadroDocumento
   - Expõe: window.RespostaParaQuadros

   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     LIMPEZA DE MARKDOWN
     ============================================================ */

  /**
   * Remove formatação markdown de um texto, deixando conteúdo limpo.
   * Executa ANTES da separação por seções — evita orphanar caracteres.
   *
   * Remove: **negrito**, __sublinhado__, `monospace`, [link](),
   *         # cabeçalhos, - listas, números de lista
   */
  function semMarcacao(texto) {
    if (!texto) return '';

    var s = String(texto);

    /* Remove markdown de links [texto](url) → texto */
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

    /* Remove negrito e sublinhado **texto** → texto */
    s = s.replace(/\*\*([^\*]+)\*\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/\*([^\*]+)\*/g, '$1');
    s = s.replace(/_([^_]+)_/g, '$1');

    /* Remove monospace `código` → código */
    s = s.replace(/`([^`]+)`/g, '$1');

    /* Remove cabeçalhos ## Título → Título */
    s = s.replace(/^#+\s+/gm, '');

    /* Remove listas (- e números) */
    s = s.replace(/^\s*[-*]\s+/gm, '');
    s = s.replace(/^\s*\d+\.\s+/gm, '');

    return s.trim();
  }

  /* ============================================================
     DIVIDIR RESPOSTA POR SEÇÕES
     ============================================================ */

  /**
   * Divide a resposta por seções baseado em padrões de header.
   * Suporta três padrões:
   * - ## Assunto (markdown h2)
   * - **Assunto** (markdown bold)
   * - Assunto: (plain text com dois-pontos)
   *
   * Retorna array de seções: [{ titulo, conteudo, indice }]
   * O índice marca a posição original (para rastrear referências).
   */
  function secoesDaResposta(texto) {
    if (!texto || typeof texto !== 'string') return [];

    var linhas = texto.split('\n');
    var secoes = [];
    var secaoAtual = null;

    for (var i = 0; i < linhas.length; i++) {
      var linha = linhas[i];
      var match = null;

      /* Padrão 1: ## Assunto */
      match = linha.match(/^##\s+(.+)$/);
      if (match) {
        if (secaoAtual) secoes.push(secaoAtual);
        secaoAtual = {
          titulo: semMarcacao(match[1].trim()),
          conteudo: [],
          indice: i,
          tipo: 'h2'
        };
        continue;
      }

      /* Padrão 2: **Assunto** ou **Assunto:** */
      match = linha.match(/^\*\*([^*]+)\*\*:?\s*$/);
      if (match) {
        if (secaoAtual) secoes.push(secaoAtual);
        secaoAtual = {
          titulo: semMarcacao(match[1].trim()),
          conteudo: [],
          indice: i,
          tipo: 'bold'
        };
        continue;
      }

      /* Padrão 3: Assunto: (no início da linha, seguido de conteúdo) */
      match = linha.match(/^([A-Za-z][A-Za-záéíóú\s]+):\s*/);
      if (match && secaoAtual === null) {
        /* Só aplica se for no início da resposta ou sozinha na linha */
        var restante = linha.substring(match[0].length).trim();
        if (!restante || i + 1 < linhas.length) {
          if (secaoAtual) secoes.push(secaoAtual);
          secaoAtual = {
            titulo: match[1].trim(),
            conteudo: restante ? [restante] : [],
            indice: i,
            tipo: 'colon'
          };
          continue;
        }
      }

      /* Linha normal: adiciona ao conteúdo da seção atual */
      if (secaoAtual) {
        secaoAtual.conteudo.push(linha);
      }
    }

    /* Não esqueça a última seção */
    if (secaoAtual) {
      secoes.push(secaoAtual);
    }

    /* Se não encontrou nenhuma seção, a resposta inteira é uma só */
    if (secoes.length === 0) {
      return [{
        titulo: 'Resposta',
        conteudo: linhas,
        indice: 0,
        tipo: 'none'
      }];
    }

    return secoes;
  }

  /* ============================================================
     SEPARAR CONTEÚDO DE PERGUNTAS
     ============================================================ */

  /**
   * Dentro de cada seção, separa o conteúdo das perguntas.
   * Padrões de pergunta:
   * - "Quem faz X?" (começa com Qu / Por que / Como / O que)
   * - Termina com "?"
   *
   * Retorna: {
   *   conteudo: string (o corpo da seção),
   *   perguntas: string[] (perguntas encontradas)
   * }
   */
  function partirSecao(linhasConteudo) {
    if (!linhasConteudo || linhasConteudo.length === 0) {
      return { conteudo: '', perguntas: [] };
    }

    var conteudo = [];
    var perguntas = [];

    linhasConteudo.forEach(function (linha) {
      var t = linha.trim();

      /* Linha vazia passa */
      if (!t) {
        conteudo.push(linha);
        return;
      }

      /* Começa com palavra de pergunta E termina com ? */
      var ehPergunta = /^(Quem|Qual|Quanto|Quantos|Quantas|Por que|Como|O que|Aonde|Onde|Quando)/i.test(t) &&
                       /\?$/.test(t);

      if (ehPergunta) {
        perguntas.push(t);
      } else {
        conteudo.push(linha);
      }
    });

    return {
      conteudo: conteudo.join('\n').trim(),
      perguntas: perguntas
    };
  }

  /* ============================================================
     EXTRAIR REFERÊNCIAS
     ============================================================ */

  /**
   * Extrai referências (fontes, URLs) de um texto.
   * Padrões: "Fonte: URL", "Referência: ...", URLs soltas, etc.
   *
   * Associa cada referência à seção em que apareceu.
   * Retorna array: [{ titulo, url, secaoTitulo }]
   */
  function extrairReferencias(texto, secaoTitulo) {
    if (!texto) return [];

    var refs = [];

    /* Padrão: [Texto](URL) */
    var linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    var m;
    while ((m = linkRegex.exec(texto)) !== null) {
      refs.push({
        titulo: m[1],
        url: m[2],
        secaoTitulo: secaoTitulo
      });
    }

    /* Padrão: Fonte: URL ou Referência: URL */
    var fonteRegex = /(?:Fonte|Referência|Fonte|Fonte:|Referência:)\s*(.+?)(?:\n|$)/gi;
    while ((m = fonteRegex.exec(texto)) !== null) {
      var item = m[1].trim();
      if (item && item !== texto) {
        /* Tenta extrair URL */
        var urlMatch = item.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          refs.push({
            titulo: item.replace(urlMatch[0], '').trim() || urlMatch[0],
            url: urlMatch[0],
            secaoTitulo: secaoTitulo
          });
        } else {
          refs.push({
            titulo: item,
            url: '',
            secaoTitulo: secaoTitulo
          });
        }
      }
    }

    /* Padrão: URL solta (http...ou https...) */
    var urlSoltaRegex = /https?:\/\/[^\s]+/g;
    while ((m = urlSoltaRegex.exec(texto)) !== null) {
      /* Evita duplicatas se já foi extraída pelo padrão anterior */
      var jáExiste = refs.some(function (r) { return r.url === m[0]; });
      if (!jáExiste) {
        refs.push({
          titulo: m[0],
          url: m[0],
          secaoTitulo: secaoTitulo
        });
      }
    }

    return refs;
  }

  /* ============================================================
     PLANEJAMENTO DE QUADROS
     ============================================================ */

  /**
   * Decide como organizar a resposta em boards.
   * Retorna plano: {
   *   tipo: 'documento' | 'postits',
   *   quadros: [
   *     {
   *       titulo: string,
   *       conteudo: string,
   *       perguntas: string[],
   *       referencias: [...],
   *       descricao: string (para post-it)
   *     }
   *   ]
   * }
   */
  function planejarQuadros(resposta, fontes) {
    if (!resposta || typeof resposta !== 'string') {
      return {
        tipo: 'postits',
        quadros: []
      };
    }

    var secoesRaw = secoesDaResposta(resposta);
    var totalChars = resposta.length;
    var temMultiplaSeções = secoesRaw.length > 1;

    /* Threshold: se ultrapassar 280 chars (limite de post-it) ou
       tiver múltiplas seções com conteúdo, usa documento */
    var MAX_DESCRICAO = 280;
    var tipo = (totalChars > MAX_DESCRICAO || temMultiplaSeções) ? 'documento' : 'postits';

    var quadros = [];

    secoesRaw.forEach(function (secao) {
      var partes = partirSecao(secao.conteudo);
      var conteudoLimpo = semMarcacao(partes.conteudo);

      /* Referências desta seção */
      var refsSeção = extrairReferencias(partes.conteudo, secao.titulo);

      quadros.push({
        titulo: secao.titulo,
        conteudo: conteudoLimpo,
        perguntas: partes.perguntas,
        referencias: refsSeção,
        descricao: conteudoLimpo.substring(0, MAX_DESCRICAO) +
                   (conteudoLimpo.length > MAX_DESCRICAO ? '…' : '')
      });
    });

    /* Se a resposta inteira tiver referências globais, distribui para
       cada quadro (ou deixa para adicionar no final) */
    if (fontes && fontes.length) {
      fontes.forEach(function (fonte) {
        /* Tenta associar a uma seção */
        var encontrou = false;
        quadros.forEach(function (q) {
          if (fonte.toLowerCase().indexOf(q.titulo.toLowerCase()) !== -1 ||
              q.conteudo.toLowerCase().indexOf(fonte.substring(0, 30).toLowerCase()) !== -1) {
            q.referencias.push({
              titulo: fonte,
              url: '',
              secaoTitulo: q.titulo
            });
            encontrou = true;
          }
        });

        /* Se não encontrou seção relacionada, adiciona ao primeiro */
        if (!encontrou && quadros.length > 0) {
          quadros[0].referencias.push({
            titulo: fonte,
            url: '',
            secaoTitulo: quadros[0].titulo
          });
        }
      });
    }

    return {
      tipo: tipo,
      quadros: quadros
    };
  }

  /* ============================================================
     INTERFACE PÚBLICA
     ============================================================ */

  window.RespostaParaQuadros = {
    semMarcacao: semMarcacao,
    secoesDaResposta: secoesDaResposta,
    partirSecao: partirSecao,
    extrairReferencias: extrairReferencias,
    planejarQuadros: planejarQuadros
  };

})();
