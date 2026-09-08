/* ============================================================
   PÁGINA DE UM TEMA — tema.html
   ============================================================
   Regras: Skills/categorizacao-taxonomia.skill

   A página "Sobre a empresa" responde de QUE a empresa fala:
   Mercado, Estratégia, Concorrentes. Esta responde O QUE ela diz
   sobre um deles — e é a metade da pergunta que faltava.

   Ela não pensa: `GET /empresas/:id/temas/:categoria` devolve os
   trechos já separados (a segmentação aconteceu uma vez, quando a
   idéia foi finalizada). Aqui é leitura, e por isso abrir um tema é
   instantâneo e não custa crédito.

   O que esta tela NÃO faz, de propósito:

     - não junta trechos de tarefas diferentes num texto só. Cada
       bloco é uma tarefa, porque cada bloco termina num link para
       UM quadro. Fundir dois mandaria a pessoa para o lugar errado
       na metade das vezes;
     - não reescreve nem resume o que recebe. O texto é o registro
       do quadro, letra por letra — é isso que faz "editar no
       quadro" encontrar o que a pessoa acabou de ler.
   ============================================================ */
(function () {
  'use strict';

  var EMPRESAS = 'empresas.html';
  var SOBRE = 'Sobre_a_empresa.html';

  var elTitulo     = document.getElementById('temaTitulo');
  var elTituloText = document.getElementById('temaTituloText');
  var elIntro       = document.getElementById('temaIntro');
  var elIntroTitulo = document.getElementById('temaIntroTitulo');
  var elIntroTexto  = document.getElementById('temaIntroTexto');
  var elBlocos  = document.getElementById('temaBlocos');
  var elEsq     = document.getElementById('temaEsqueleto');
  var elVazio   = document.getElementById('temaVazio');
  var elErro    = document.getElementById('temaErro');
  var elErroTxt = document.getElementById('temaErroTexto');
  var live      = document.getElementById('temaLive');

  var elLeitura       = document.getElementById('temaLeitura');
  var elGraficos      = document.getElementById('temaGraficos');

  var empresaId = null;
  var projetoId = null;
  var categoria = null;

  /* ------------------------------------------------------------
     Leitura guiada (Fase 1 — Documentacao/enriquecimento-tema.md)
     ------------------------------------------------------------
     Busca separada de `carregar()`, de propósito: a leitura guiada
     é aditiva e pode demorar mais, falhar, ou simplesmente ainda não
     ter rodado para este tema — nada disso pode atrasar nem quebrar
     a lista bruta, que é a garantia de sempre. As duas correm em
     paralelo e cada uma desenha sua parte quando chega.
     ------------------------------------------------------------ */
  var leituraPronta   = false;   // status_leitura === "ok" e há seções com conteúdo
  var leituraSecoes   = null;    // [{titulo, recorte_ids}]
  var leituraRecortes = {};      // recorteId -> {texto, projeto_id, ideia_id, tarefa_id, ...}
  var estadoAtual = 'carregando';
  var graficosPronto  = false;   // status_graficos === "ok"
  var graficosArray   = [];      // [{tipo, titulo, dados: [...]}]

  /* ------------------------------------------------------------
     Introdução — o que cada categoria significa
     ------------------------------------------------------------
     Skills/categorizacao-taxonomia.skill: toda categoria nova exige
     uma entrada aqui ANTES de entrar em uso. "Mercado" e "Benchmark"
     têm leitura ambígua fora deste vocabulário específico — sem a
     frase, quem abre a página pelo grafo ou por uma tag lê os
     trechos sem saber o que a categoria promete conter.

     Fonte da verdade das 24 categorias é
     api/src/ia/taxonomia-vocabulario.ts (TAXONOMIA); esta cópia é
     só de apresentação e não participa da classificação. Uma
     categoria sem entrada aqui não quebra a página — cai no
     `unhide` mais abaixo, que mantém o parágrafo oculto — mas é
     lida como esquecimento, não como omissão proposital.
     ------------------------------------------------------------ */
  var DESCRICOES = {
    // Descoberta
    'Personas': 'Representações fictícias dos perfis típicos de usuário ou cliente, construídas a partir de pesquisa, usadas para guiar decisões de produto e comunicação.',
    'Concorrentes': 'Outras empresas ou produtos que disputam o mesmo público ou resolvem o mesmo problema — o que fazem, como se posicionam e onde deixam espaço.',
    'Mercado': 'O contexto econômico e competitivo em que a empresa atua: tamanho, tendências, demanda e oportunidades de crescimento.',
    'Benchmark': 'Comparações estruturadas com outros produtos ou empresas de referência, dentro ou fora do setor, para calibrar o que é bom o suficiente.',
    'Pesquisa Qualitativa': 'Investigação que busca entender motivações, percepções e comportamentos por meio de entrevistas, observações e conversas — não medida em números.',
    'Pesquisa Quantitativa': 'Investigação que mede e testa hipóteses com dados numéricos e estatísticos, geralmente a partir de amostras maiores.',
    // Produto
    'Funcionalidades': 'Os recursos e capacidades específicas que o produto oferece a quem o usa.',
    'MVP': 'A versão mais simples do produto capaz de validar uma hipótese central com usuários reais, antes de investir no restante.',
    'Roadmap': 'O planejamento de prioridades e prazos futuros do produto — o que vem antes do quê, e por quê.',
    'Requisitos': 'As condições e especificações que o produto precisa atender, sejam técnicas ou de negócio.',
    'Backlog': 'A lista organizada de tarefas, melhorias e correções pendentes para o produto.',
    // Experiência
    'Jornada do Usuário': 'O caminho completo que uma pessoa percorre ao interagir com o produto, do primeiro contato até o objetivo final.',
    'UX': 'A experiência geral de quem usa o produto — usabilidade, satisfação e os atritos encontrados pelo caminho.',
    'UI': 'Os elementos visuais e interativos com que a pessoa efetivamente interage na tela: botões, telas, componentes.',
    'Design System': 'O conjunto de padrões, componentes e diretrizes reutilizáveis que garante consistência visual e funcional entre telas.',
    'Acessibilidade': 'As práticas que garantem que o produto possa ser usado por pessoas com diferentes capacidades e necessidades.',
    // Negócio
    'Estratégia': 'As decisões de alto nível sobre direção, posicionamento e prioridades do negócio.',
    'KPIs': 'As métricas usadas para medir se o negócio ou o produto está atingindo os objetivos que se propôs.',
    'Posicionamento': 'Como a empresa ou o produto se diferencia e é percebido no mercado em relação aos concorrentes.',
    // Tecnologia
    'APIs': 'As interfaces que permitem que sistemas diferentes troquem dados e funcionalidades entre si.',
    'IA': 'Tecnologias que permitem que sistemas aprendam, decidam ou automatizem tarefas com base em dados.',
    'Arquitetura': 'A estrutura técnica geral do sistema — como os componentes se organizam e se comunicam entre si.',
    'Integrações': 'As conexões entre o produto e outras ferramentas, sistemas ou serviços externos.'
  };

  /* Mesma tolerância de leitura do backend (taxonomia-vocabulario.ts:
     normalizar): sem acento e sem diferença de caixa, porque a
     categoria chega pela URL e um link antigo ou digitado à mão não
     deve deixar a introdução muda por causa de um acento. */
  function normalizar(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  }
  /* Guarda o nome CANÔNICO junto do texto, não só o texto: o
     subtítulo da introdução precisa mostrar "Mercado" com a grafia
     exata da taxonomia, mesmo que a URL chegue como "mercado" ou
     "MERCADO" (link antigo, digitado à mão). */
  var DESCRICOES_POR_CHAVE = {};
  Object.keys(DESCRICOES).forEach(function (nome) {
    DESCRICOES_POR_CHAVE[normalizar(nome)] = { nome: nome, texto: DESCRICOES[nome] };
  });

  function mostrarIntro(nomeCategoria) {
    var entrada = DESCRICOES_POR_CHAVE[normalizar(nomeCategoria)];
    if (!entrada) { elIntro.hidden = true; return; }
    elIntroTitulo.textContent = entrada.nome;
    elIntroTexto.textContent = entrada.texto;
    elIntro.hidden = false;
  }

  /* ------------------------------------------------------------
     Estados — quatro, e de fato distintos
     ------------------------------------------------------------
     Mesma regra de IDEIA-QUADRO-008: "ainda não perguntei", "a
     pergunta falhou" e "perguntei e a resposta foi zero" pedem
     ações opostas de quem está lendo, então nunca compartilham
     aparência. Um tema vazio por erro de rede, desenhado como tema
     vazio de verdade, faria alguém concluir que a empresa não sabe
     nada sobre concorrentes.
     ------------------------------------------------------------ */
  function mostrar(estado) {
    estadoAtual = estado;
    elEsq.hidden   = estado !== 'carregando';
    elVazio.hidden = estado !== 'vazio';
    elErro.hidden  = estado !== 'erro';
    aplicarModo();
  }

  /* ------------------------------------------------------------
     Qual vista fica visível
     ------------------------------------------------------------
     Não é mais uma escolha de quem lê: a leitura guiada é a vista
     do tema quando existe, e a lista por atividade de origem é o
     que a tela mostra enquanto ela não existe (ou não roda para
     este tema). As duas nunca aparecem juntas, e nenhuma precisa
     ser pedida.

     Trocar de vista era uma pergunta que a página fazia e que
     ninguém tinha como responder antes de ler as duas — e ler as
     duas é ler o mesmo conteúdo duas vezes, que é justamente o que
     a leitura guiada existe para evitar.

     Fora do estado "lista" não existe vista nenhuma para mostrar —
     "vazio" e "erro" já dizem tudo o que precisam sozinhos. */
  function aplicarModo() {
    var lista = estadoAtual === 'lista';
    elLeitura.hidden = !lista || !leituraPronta;
    elBlocos.hidden  = !lista || leituraPronta;

    /* Os gráficos têm status e fingerprint próprios (ver
       SinteseTema): um tema pode ter gráfico e não ter leitura
       guiada, e o contrário. Enquanto moravam dentro do bloco da
       leitura, o primeiro caso desenhava um gráfico dentro de um
       container escondido — trabalho feito e invisível. */
    elGraficos.hidden = !lista || !graficosPronto;
  }

  function contexto() {
    var q = '?empresa=' + encodeURIComponent(empresaId);
    if (projetoId) q += '&projeto=' + encodeURIComponent(projetoId);
    return q;
  }

  function irPara(url) { window.location.href = url; }

  /* ------------------------------------------------------------
     O link de volta — a razão de a página existir
     ------------------------------------------------------------
     `board.html` precisa dos QUATRO ids (BOARD-ACESSO-003), e o
     projeto tem que ser o da IDÉIA, não o que está na barra de
     endereço: um tema cruza os projetos da empresa, e "Concorrentes"
     pode reunir trechos de três projetos diferentes. Mandar todos
     para o projeto da URL levaria ao quadro errado — ou a um
     redirecionamento de volta, que é como o bug apareceria primeiro.
     É o mesmo cuidado que `grafo-painel.js` já toma.
     ------------------------------------------------------------ */
  function linkDoQuadro(b) {
    if (!empresaId || !b.projeto_id || !b.ideia_id || !b.tarefa_id) return null;
    return 'board.html?empresa=' + encodeURIComponent(empresaId) +
      '&projeto=' + encodeURIComponent(b.projeto_id) +
      '&ideia='   + encodeURIComponent(b.ideia_id) +
      '&tarefa='  + encodeURIComponent(b.tarefa_id);
  }

  function frase(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  /* ------------------------------------------------------------
     Leitura guiada — desenho
     ------------------------------------------------------------
     Mesmo link de board.html que linkDoQuadro() monta para a lista
     bruta, mas por TRECHO em vez de por bloco: uma seção aqui pode
     misturar recortes de tarefas diferentes, então o link não pode
     mais viver só no fim de um bloco maior (Documentacao/
     enriquecimento-tema.md, "Onde o link de cada trecho aparece").
     ------------------------------------------------------------ */
  function linkDoRecorte(rec) {
    if (!empresaId || !rec.projeto_id || !rec.ideia_id || !rec.tarefa_id) return null;
    return 'board.html?empresa=' + encodeURIComponent(empresaId) +
      '&projeto=' + encodeURIComponent(rec.projeto_id) +
      '&ideia='   + encodeURIComponent(rec.ideia_id) +
      '&tarefa='  + encodeURIComponent(rec.tarefa_id);
  }

  /* Um parágrafo por recorte citado na seção, com a própria
     referência ao final — nunca o texto da resposta do modelo: o
     texto vem sempre de `leituraRecortes`, montado no servidor a
     partir do banco (grafo.ts), pela mesma razão de sempre: o que a
     pessoa escreveu não pode ser reescrito por quem só organiza. */
  function desenharTrechoDaSecao(recorteId) {
    var rec = leituraRecortes[recorteId];
    /* Defensivo: o servidor já filtra ids órfãos antes de responder,
       mas um `undefined` aqui não pode virar um trecho em branco na
       tela. */
    if (!rec) return null;

    var p = document.createElement('p');
    p.className = 'tema-secao-trecho';

    var textoBase = String(rec.texto);
    var corte = textoBase.indexOf('\n\n');
    if (corte > 0) {
      var forte = document.createElement('strong');
      forte.textContent = textoBase.slice(0, corte);
      p.appendChild(forte);
      p.appendChild(document.createTextNode('\n\n' + textoBase.slice(corte + 2)));
    } else {
      p.appendChild(document.createTextNode(textoBase));
    }

    var href = linkDoRecorte(rec);
    if (href) {
      var a = document.createElement('a');
      a.className = 'tema-secao-ref';
      a.href = href;
      a.title = (rec.ideia_titulo ? 'De “' + rec.ideia_titulo + '”' : 'Abre a tarefa de origem') +
        (rec.tarefa_titulo ? ' · ' + rec.tarefa_titulo : '');
      a.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
        '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
        '</svg>';
      a.appendChild(document.createTextNode('Ver origem'));
      p.appendChild(document.createTextNode(' '));
      p.appendChild(a);
    }

    return p;
  }

  function desenharLeitura() {
    elLeitura.innerHTML = '';
    (leituraSecoes || []).forEach(function (s) {
      var trechos = (s.recorte_ids || [])
        .map(desenharTrechoDaSecao)
        .filter(function (p) { return p !== null; });
      /* Uma seção sem nenhum trecho válido (todos órfãos) não vira
         um card vazio na tela. */
      if (!trechos.length) return;

      var sec = document.createElement('section');
      sec.className = 'tema-secao';

      var h = document.createElement('h2');
      h.className = 'tema-secao-titulo';
      h.textContent = s.titulo;
      sec.appendChild(h);

      var corpo = document.createElement('div');
      corpo.className = 'tema-secao-corpo';
      trechos.forEach(function (p) { corpo.appendChild(p); });
      sec.appendChild(corpo);

      elLeitura.appendChild(sec);
    });
  }

  /* ------------------------------------------------------------
     Desenhar
     ------------------------------------------------------------
     Tudo por `createElement` e `textContent`. O texto vem de
     registros que pessoas digitaram nos quadros: montar isto por
     `innerHTML` executaria, na página de conhecimento da empresa,
     o que alguém escreveu num post-it.
     ------------------------------------------------------------ */
  function desenharBloco(b) {
    var art = document.createElement('article');
    art.className = 'tema-bloco';

    var origem = document.createElement('div');
    origem.className = 'tema-bloco-origem';

    var ideia = document.createElement('h2');
    ideia.className = 'tema-bloco-ideia';
    ideia.textContent = b.ideia_titulo || 'Idéia sem título';
    origem.appendChild(ideia);

    if (b.projeto_nome) {
      var proj = document.createElement('span');
      proj.className = 'tema-bloco-projeto';
      proj.textContent = 'em ' + b.projeto_nome;
      origem.appendChild(proj);
    }
    art.appendChild(origem);

    (b.trechos || []).forEach(function (t) {
      var p = document.createElement('p');
      p.className = 'tema-trecho';

      /* A primeira linha do registro é o título dele no quadro. Sai
         em peso maior para o trecho continuar reconhecível quando a
         pessoa clicar em "editar" e chegar lá — sem isso, ela
         procura no quadro um parágrafo que começa no meio. */
      var corte = String(t).indexOf('\n\n');
      if (corte > 0) {
        var forte = document.createElement('strong');
        forte.textContent = String(t).slice(0, corte);
        p.appendChild(forte);
        p.appendChild(document.createTextNode('\n\n' + String(t).slice(corte + 2)));
      } else {
        p.textContent = t;
      }
      art.appendChild(p);
    });

    var pe = document.createElement('div');
    pe.className = 'tema-bloco-pe';

    var href = linkDoQuadro(b);
    if (href) {
      var a = document.createElement('a');
      a.className = 'tema-voltar';
      a.href = href;
      a.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 20h9"/>' +
        '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' +
        '</svg>';
      a.appendChild(document.createTextNode('Editar no quadro'));
      pe.appendChild(a);

      var nota = document.createElement('span');
      nota.className = 'tema-voltar-nota';
      /* Dizer o nome da tarefa antes do clique evita a viagem de
         volta: quem já sabe que não é aquela tarefa não abre. */
      nota.textContent = b.tarefa_titulo
        ? 'Gerado em “' + b.tarefa_titulo + '”'
        : 'Abre a tarefa onde este trecho foi gerado';
      pe.appendChild(nota);
    } else {
      /* Sem os ids não há para onde ir. Um link morto é pior do que
         nenhum: promete navegação e recebe foco à toa. */
      var aviso = document.createElement('span');
      aviso.className = 'tema-voltar-nota';
      aviso.textContent = 'A tarefa de origem não está mais disponível.';
      pe.appendChild(aviso);
    }

    art.appendChild(pe);
    return art;
  }

  function desenhar(r) {
    var blocos = (r && r.blocos) || [];

    document.title = r.categoria + ' · Plataforma de Design';
    document.getElementById('trilhaTema').textContent = r.categoria;
    /* A grafia canônica é a do servidor. Já mostramos a introdução
       com o nome da URL em mostrarIntro(categoria) lá em iniciar() —
       isto só corrige o raro caso de capitalização diferente entre
       os dois, sem esperar a resposta para a pessoa ver o texto. */
    mostrarIntro(r.categoria);

    if (!blocos.length) {
      document.getElementById('temaVazioTitulo').textContent =
        'Nada escrito sobre ' + r.categoria + ' ainda';
      mostrar('vazio');
      live.textContent = 'Nenhum trecho em ' + r.categoria + '.';
      return;
    }

    elBlocos.innerHTML = '';
    blocos.forEach(function (b) { elBlocos.appendChild(desenharBloco(b)); });

    mostrar('lista');
    live.textContent = r.categoria + ': ' + frase(r.total_trechos || 0, 'trecho', 'trechos') + '.';
  }

  /* ------------------------------------------------------------
     O título é o nome da EMPRESA
     ------------------------------------------------------------
     Mesmo cabeçalho das outras telas: empresa no <h1>, caminho no
     breadcrumb. O nome do tema não repete aqui — ele já é o último
     item da trilha, e um título que repete a trilha logo abaixo
     gasta a linha mais visível da página dizendo duas vezes a mesma
     coisa.

     Chamada à parte, de propósito: o nome da empresa não depende de
     o tema ter conteúdo, então ele aparece mesmo quando a carga do
     texto falha e a tela cai no estado de erro.
     ------------------------------------------------------------ */
  function definirTitulo(nome) {
    elTituloText.textContent = nome;
    elTitulo.classList.remove('is-carregando');
    elTitulo.removeAttribute('aria-busy');
  }

  function carregarEmpresa() {
    window.API.buscar('/empresas')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var lista = (d && d.empresas) || [];
        for (var i = 0; i < lista.length; i++) {
          if (lista[i].id === empresaId) { definirTitulo(lista[i].nome); return; }
        }
        /* Sem o nome, a trilha ainda diz onde a pessoa está. Deixar o
           esqueleto pulsando para sempre é que não serve. */
        definirTitulo('Sobre a empresa');
      })
      .catch(function () { definirTitulo('Sobre a empresa'); });
  }

  /* ------------------------------------------------------------
     Carga
     ------------------------------------------------------------ */
  function carregar() {
    mostrar('carregando');

    /* Cada chamada de carregar() é uma carga do zero (inclusive via
       "Tentar de novo") — sem isto, uma leitura guiada da tentativa
       anterior ficaria acesa por cima de um tema que a carga atual
       ainda nem confirmou que tem conteúdo. */
    leituraPronta  = false;
    leituraSecoes  = null;
    leituraRecortes = {};
    graficosPronto = false;
    graficosArray  = [];

    carregarGraficos();

    window.API.buscar(
      '/empresas/' + encodeURIComponent(empresaId) +
      '/temas/' + encodeURIComponent(categoria)
    ).then(function (resposta) {
      if (resposta.status === 401) {
        irPara('login.html?motivo=sessao-expirada&destino=' +
               encodeURIComponent(location.pathname + location.search));
        return null;
      }
      if (resposta.status === 403) {
        return resposta.json().catch(function () { return {}; }).then(function (d) {
          if (d && d.suspensao) {
            irPara('login.html?motivo=suspenso&tipo=' + encodeURIComponent(d.suspensao));
            return null;
          }
          throw new Error('403');
        });
      }
      /* 404 é "esta empresa não existe para você" OU "este tema não
         existe na taxonomia" — e as duas levam de volta ao mesmo
         lugar, que é a página que sabe quais temas existem. */
      if (resposta.status === 404) { irPara(SOBRE + contexto()); return null; }
      if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
      return resposta.json();
    }).then(function (r) {
      if (r) desenhar(r);
    }).catch(function (e) {
      console.error('[tema]', e);
      elErroTxt.textContent = 'Verifique sua conexão e tente de novo.';
      mostrar('erro');
    });
  }

  function iniciar() {
    var q = new URLSearchParams(location.search);
    empresaId = q.get('empresa');
    projetoId = q.get('projeto');
    categoria = q.get('categoria') || q.get('tema');

    /* Mesmo raciocínio de IDEIA-QUADRO-007: sem os parâmetros esta
       página não tem do que falar. Não é estado vazio, é navegação
       inválida, e cada caso volta para o lugar mais próximo que
       ainda faz sentido. */
    if (!empresaId) { irPara(EMPRESAS); return; }
    if (!categoria) { irPara(SOBRE + contexto()); return; }

    mostrarIntro(categoria);
    carregarEmpresa();

    var voltar = SOBRE + contexto();
    var trilhaVoltar = document.getElementById('trilhaVoltar');
    if (trilhaVoltar) trilhaVoltar.href = voltar;
    document.getElementById('trilhaSobre').href = voltar;
    document.getElementById('temaVazioVoltar').href = voltar;

    /* O rail é o mesmo de Sobre a empresa e leva o contexto junto —
       sem isso, sair daqui perderia a empresa e o projeto. */
    var destinos = {
      'Empresas': 'empresas.html',
      'Projetos': 'projetos.html?empresa=' + encodeURIComponent(empresaId),
      'Idéias': projetoId ? 'visao_do_projeto.html' + contexto() : null,
      'Sobre a empresa': voltar
    };
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item[data-label]'), function (btn) {
      var destino = destinos[btn.getAttribute('data-label')];
      if (!destino) return;
      btn.addEventListener('click', function () { window.location.href = destino; });
    });

    document.getElementById('temaErroTentar').addEventListener('click', carregar);

    carregar();
  }


  /* ------------------------------------------------------------
     Gráficos (Fase 2)
     ------------------------------------------------------------
     Cada gráfico sai com a lista das origens dos seus dados logo
     abaixo — links de verdade, um por recorte citado. Não é enfeite
     de rastreabilidade: é o único caminho até a origem que funciona
     sem mouse. Clicar na barra é o atalho; o link é a porta.

     Um recorte citado por dois pontos do mesmo gráfico aparece uma
     vez só na lista: a pessoa quer chegar ao trecho, não contar
     quantas vezes ele foi usado. */
  function desenharGraficos() {
    elGraficos.innerHTML = '';
    if (!graficosPronto || !graficosArray.length) return;

    var titulo = document.createElement('h2');
    titulo.className = 'tema-graficos-titulo';
    titulo.textContent = 'Números citados neste tema';
    elGraficos.appendChild(titulo);

    graficosArray.forEach(function (g) {
      if (!g || !g.tipo) return;

      var svg = GraficoSVG.renderizar(g, function (recorteId) {
        var rec  = leituraRecortes[recorteId];
        var href = rec ? linkDoRecorte(rec) : null;
        /* Um ponto pode citar um recorte que já não tem tarefa viva —
           aí não há para onde ir, e mandar a pessoa para "null" seria
           pior do que não fazer nada. */
        if (href) window.location.href = href;
      });
      if (!svg) return;

      var figura = document.createElement('figure');
      figura.className = 'tema-grafico-container';
      figura.appendChild(svg);

      var origens = document.createElement('figcaption');
      origens.className = 'tema-grafico-origens';

      var vistos = {};
      (g.dados || []).forEach(function (d) {
        if (!d || vistos[d.origem]) return;
        vistos[d.origem] = true;

        var rec  = leituraRecortes[d.origem];
        var href = rec ? linkDoRecorte(rec) : null;
        if (!href) return;

        var a = document.createElement('a');
        a.className = 'tema-grafico-origem';
        a.href = href;
        /* O nome da tarefa, não "ver origem": numa lista de três, três
           links iguais não dizem qual é qual. */
        a.textContent = rec.tarefa_titulo || rec.ideia_titulo || 'ver o trecho de origem';
        origens.appendChild(a);
      });

      if (origens.childNodes.length) {
        var rotulo = document.createElement('span');
        rotulo.className = 'tema-grafico-origens-rotulo';
        rotulo.textContent = origens.childNodes.length === 1
          ? 'Trecho de onde vieram estes dados:'
          : 'Trechos de onde vieram estes dados:';
        origens.insertBefore(rotulo, origens.firstChild);
        figura.appendChild(origens);
      }

      elGraficos.appendChild(figura);
    });
  }

  /* Carrega leitura E gráficos em paralelo */
  function carregarGraficos() {
    window.API.buscar(
      '/empresas/' + encodeURIComponent(empresaId) +
      '/temas/' + encodeURIComponent(categoria) + '/sintese'
    ).then(function (resposta) {
      return resposta.ok ? resposta.json() : null;
    }).then(function (d) {
      if (!d) return;

      // Leitura guiada
      if (d.status_leitura === 'ok' && Array.isArray(d.secoes) && d.secoes.length) {
        leituraSecoes   = d.secoes;
        leituraRecortes = d.recortes || {};
        leituraPronta   = true;
        desenharLeitura();
        aplicarModo();
      }

      // Gráficos
      if (d.status_graficos === 'ok' && Array.isArray(d.graficos) && d.graficos.length) {
        graficosArray  = d.graficos;
        graficosPronto = true;
        desenharGraficos();
        aplicarModo();
      }
    }).catch(function () { /* silencioso */ });
  }

  iniciar();
})();
