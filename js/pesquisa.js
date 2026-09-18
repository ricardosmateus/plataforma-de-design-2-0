/* ============================================================
   Painel de pesquisa de concorrentes — board.html
   ============================================================
   Planejamento: planejamento-pesquisa-concorrentes.md

   Vive no painel lateral, ao lado do assistente, e NUNCA desenha nada
   dentro de `#canvasStage`. O motivo é BOARD-SALVA-002: o `lerDaTela()`
   do board serializa o canvas e o PUT grava o que está na tela. Um
   resultado de pesquisa — que chega assíncrono, segundos ou minutos
   depois — desenhado ali dentro viraria estado do quadro sem ninguém
   ter pedido, e o quadro passaria a ser um segundo dono de dados que
   `pesquisa_entidades` já guarda. Dois donos do mesmo fato divergem em
   silêncio.

   A ponte entre painel e canvas é um GESTO: "Virar card" chama
   `window.BoardCanvas.adicionarCard`, que passa pelo mesmo caminho do
   modal de novo registro. A partir daí o card é do quadro, e a sessão
   de pesquisa guarda o registro como procedência.

   ------------------------------------------------------------
   PERGUNTAR É DOIS PASSOS, DE PROPÓSITO
   ------------------------------------------------------------
   Toda pergunta passa primeiro por `planejar`, que roteia sem gastar
   nada, e só vira `consultar` depois que a pessoa confirma. É PES-007:
   a diferença de custo entre o nível mais barato e o mais caro é de
   cerca de cem vezes, e ninguém deve descobrir isso pela fatura.

   Efeito prático hoje: o painel funciona inteiro mesmo sem provedor de
   busca configurado. A classificação, a resolução de "concorrente 01"
   e de "ele" já acontecem — só a execução fica recusada, com o motivo
   dito na tela em vez de um erro genérico.
   ============================================================ */

(function () {
  'use strict';

  /* ------------------------------------------------------------
     Por que um plano não é executável — e o que dá para fazer
     ------------------------------------------------------------
     O texto costumava ser escrito AQUI, numa função
     `motivoNaoExecutavel()`, enquanto o servidor escrevia o seu nas
     mensagens de 501/503. Duas cópias do mesmo texto de produto,
     escritas em momentos diferentes, já divergindo — e qual delas o
     usuário lia dependia de por qual caminho ele tinha chegado.

     Agora o texto vem no `impedimento` de `planejar`, e as opções
     no `saidas`, os dois de `api/src/pesquisa/saidas.ts`. A tela
     desenha; não redige. O texto local que sobrou é a rede de
     segurança para um servidor antigo responder sem os campos
     novos — e, de propósito, ele também não manda reescrever nada.

     Ver BOARD-PESQUISA-012. */
  function impedimentoDoPlano(plano) {
    if (plano && plano.impedimento) return plano.impedimento;
    return 'Não consigo executar esta busca agora.';
  }

  function saidasDoPlano(plano) {
    return (plano && plano.saidas) || [];
  }

  /* A narração vive em js/ia.js, dono do DOM da thread do
     assistente. Se o painel não existir na página, tudo aqui vira
     no-op e a pesquisa continua funcionando — ela nunca dependeu
     dele para rodar. */
  var NADA = function () {};
  function narracao() {
    return window.IaNarracao || {
      abrir: function () { return null; },
      passo: NADA, fechar: NADA, retomar: NADA, remover: NADA,
    };
  }

  var corpo = document.getElementById('pesquisaCorpo');
  var entrada = document.getElementById('pesquisaInput');
  var botao = document.getElementById('pesquisaEnviar');
  var aviso = document.getElementById('pesquisaAviso');
  var abaAssistente = document.getElementById('tabAssistente');
  var abaPesquisa = document.getElementById('tabPesquisa');
  var paneAssistente = document.getElementById('paneAssistente');
  var panePesquisa = document.getElementById('panePesquisa');

  if (!corpo || !entrada || !botao || !abaPesquisa) return;

  var q = new URLSearchParams(location.search);
  var empresaId = q.get('empresa');
  var projetoId = q.get('projeto');
  var tarefaId = q.get('tarefa');

  var sessaoId = null;
  var ocupado = false;

  /* ---------- Abas ---------- */
  function mostrarAba(qual) {
    var ehPesquisa = qual === 'pesquisa';
    abaPesquisa.setAttribute('aria-selected', ehPesquisa ? 'true' : 'false');
    abaAssistente.setAttribute('aria-selected', ehPesquisa ? 'false' : 'true');
    panePesquisa.hidden = !ehPesquisa;
    paneAssistente.hidden = ehPesquisa;
    if (ehPesquisa) entrada.focus();
  }

  abaPesquisa.addEventListener('click', function () { mostrarAba('pesquisa'); });
  abaAssistente.addEventListener('click', function () { mostrarAba('assistente'); });

  /* ---------- Rede ---------- */
  function chamar(caminho, opcoes) {
    return window.API.chamar(caminho, opcoes).catch(function (e) {
      /* Mesma renovação de sessão que board.js faz: um 401 aqui
         costuma ser o token de acesso vencido, não a pessoa
         deslogada. */
      if (e.status === 401) {
        return window.API.chamar('/auth/sessao').then(function () {
          return window.API.chamar(caminho, opcoes);
        });
      }
      throw e;
    });
  }

  /* A sessão é criada NA PRIMEIRA PERGUNTA, não ao abrir a aba: quem
     só clicou para ver o que é não deve deixar uma investigação vazia
     no banco. E ela é reencontrada pela tarefa a cada visita — sem
     isso, o "concorrente 01" da semana passada não significaria mais
     nada hoje. */
  function garantirSessao() {
    if (sessaoId) return Promise.resolve(sessaoId);
    if (!tarefaId) return Promise.reject(new Error('sem tarefa'));

    return chamar('/pesquisa/sessoes?tarefaId=' + encodeURIComponent(tarefaId))
      .then(function (r) {
        var existente = (r && r.sessoes && r.sessoes[0]) || null;
        if (existente) return existente.id;

        return chamar('/pesquisa/sessoes', {
          metodo: 'POST',
          corpo: {
            titulo: 'Concorrentes',
            empresaId: empresaId || undefined,
            projetoId: projetoId || undefined,
            tarefaId: tarefaId,
          },
        }).then(function (nova) { return nova.id; });
      })
      .then(function (id) { sessaoId = id; return id; });
  }

  /* ---------- Desenho ---------- */
  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    return el;
  }

  function limparAjuda() {
    var ajuda = document.getElementById('pesquisaAjuda');
    if (ajuda) ajuda.remove();
  }

  function rolarParaOFim() {
    corpo.scrollTop = corpo.scrollHeight;
  }

  var ROTULO_NIVEL = {
    conhecimento: 'resposta direta',
    busca: 'busca com fontes',
    lugares: 'unidades e endereços',
    navegacao: 'entrar num site',
  };

  function desenharPergunta(texto) {
    var bloco = elemento('div', 'pesquisa-plano');
    var linha = elemento('div', 'pesquisa-plano-linha');
    linha.appendChild(elemento('span', 'pesquisa-rotulo', 'Você perguntou'));
    bloco.appendChild(linha);
    bloco.appendChild(elemento('p', null, texto));
    corpo.appendChild(bloco);
    return bloco;
  }

  function desenharPlano(plano) {
    var bloco = elemento('div', 'pesquisa-plano');

    var linhaNivel = elemento('div', 'pesquisa-plano-linha');
    linhaNivel.appendChild(elemento('span', 'pesquisa-rotulo', 'Tipo'));
    linhaNivel.appendChild(
      elemento('span', 'pesquisa-nivel pesquisa-nivel--' + plano.nivel,
               ROTULO_NIVEL[plano.nivel] || plano.nivel)
    );
    bloco.appendChild(linhaNivel);

    /* Mostrar a pergunta RESOLVIDA é o que torna a resolução de
       referência auditável: a pessoa vê que "ele" virou o nome da
       empresa certa antes de qualquer coisa sair daqui. */
    if (plano.pergunta_resolvida && plano.citadas && plano.citadas.length) {
      var linhaRes = elemento('div', 'pesquisa-plano-linha');
      linhaRes.appendChild(elemento('span', 'pesquisa-rotulo', 'Entendi'));
      bloco.appendChild(linhaRes);
      bloco.appendChild(elemento('p', null, plano.pergunta_resolvida));
    }

    corpo.appendChild(bloco);
    return bloco;
  }

  function desenharAlerta(texto) {
    corpo.appendChild(elemento('div', 'pesquisa-alerta', texto));
  }

  /* BOARD-PESQUISA-012 no painel lateral: nenhuma recusa termina sem
     um caminho. O botão reenvia a MESMA pergunta com o nível que a
     pessoa escolheu — não pede reescrita, não perde o que ela já
     digitou. */
  function desenharSaidas(saidas, perguntaOriginal) {
    if (!saidas || !saidas.length) return;

    var bloco = elemento('div', 'pesquisa-saidas');
    saidas.forEach(function (s) {
      var b = elemento('button', 'pesquisa-saida', s.rotulo);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (ocupado) return;
        /* Uma escolha só: um segundo clique seria uma segunda busca
           paga. */
        var irmaos = bloco.querySelectorAll('button');
        for (var k = 0; k < irmaos.length; k++) irmaos[k].disabled = true;
        executarConfirmado(perguntaOriginal, s.nivel);
      });
      bloco.appendChild(b);
      if (s.explicacao) bloco.appendChild(elemento('span', 'pesquisa-saida-exp', s.explicacao));
    });
    corpo.appendChild(bloco);
    rolarParaOFim();
  }

  /* O segundo passo, já com o nível decidido por uma pessoa. É o
     caminho que o servidor aceita desde 02/09 (`nivelConfirmado` em
     `corpoPergunta`) e que o cliente nunca tinha percorrido — o
     limite L3 do plano. */
  function executarConfirmado(pergunta, nivel) {
    trabalhando(true, 'Pesquisando...');
    chamar('/pesquisa/sessoes/' + sessaoId + '/consultar', {
      metodo: 'POST',
      corpo: { pergunta: pergunta, nivelConfirmado: nivel },
    })
      .then(function (r) { mostrarResultadoNoPainel(r); })
      .catch(function (e) { desenharAlerta(mensagemDeErro(e)); })
      .then(function () { trabalhando(false); rolarParaOFim(); });
  }

  /* O servidor redige; a tela desenha. O caso 402 tinha texto
     próprio aqui — "Sem crédito suficiente para esta pesquisa." — e
     ele engolia a mensagem do servidor, que é mais precisa: hoje a
     investigação gasta em duas etapas, e saber se faltou crédito
     para PLANEJAR ou para BUSCAR muda o que a pessoa faz a seguir.
     Mesmo princípio do `impedimento` de BOARD-PESQUISA-012: um
     texto de produto com duas cópias tem duas versões da verdade. */
  function mensagemDeErro(e) {
    if (e && e.rede) return 'Não consegui falar com o servidor agora.';
    if (e && e.message) return e.message;
    return 'Não consegui falar com o servidor agora.';
  }

  function mostrarResultadoNoPainel(r) {
    if (!r) return;
    if (r.resultado === 'falhou') {
      desenharAlerta('A busca não completou. Nada foi cobrado — tente de novo.');
      return;
    }
    if (r.resultado === 'vazio') {
      desenharAlerta('Procurei e não encontrei nada sobre isso.');
      return;
    }
    if (r.resposta) {
      var fonteTexto = (r.fontes || [])
        .map(function (f) { return f.titulo || f.url; })
        .join(' · ');
      desenharAchado('Resposta', r.resposta, fonteTexto);
    }
    (r.lugares || []).forEach(function (l) {
      desenharAchado(l.nome, l.endereco || '', l.avaliacao ? ('nota ' + l.avaliacao) : '');
    });
  }

  /* PES-004 na tela: referência sem dono vira uma pergunta à pessoa,
     nunca uma consulta chutada. */
  function desenharNaoResolvida(plano) {
    desenharAlerta(
      'Não sei a quem "' + plano.nao_resolvidas[0] + '" se refere nesta ' +
      'investigação. Escreva o nome da empresa e eu sigo daí.'
    );
  }

  /* Um achado do painel pode render mais de um card: se o texto traz
     perguntas, cada uma vira post-it com o convite a responder, igual
     ao caminho do botão "Pesquisar". Devolve true se algum card entrou
     no quadro — é o que o botão usa para virar "Está no quadro". */
  function promoverParaOQuadro(titulo, descricao, fonte) {
    var texto = descricao || fonte || '';
    if (!texto) return window.BoardCanvas.adicionarCard(semMarcacao(titulo), '');

    var itens = cardsDaResposta(texto);
    var entrou = false;
    itens.forEach(function (c) {
      if (window.BoardCanvas.adicionarCard(c.titulo, c.descricao)) entrou = true;
    });
    return entrou;
  }

  function desenharAchado(titulo, descricao, fonte) {
    var bloco = elemento('div', 'pesquisa-achado');
    bloco.appendChild(elemento('h3', 'pesquisa-achado-titulo', titulo));
    if (descricao) bloco.appendChild(elemento('p', null, semMarcacao(descricao)));
    if (fonte) bloco.appendChild(elemento('p', 'pesquisa-achado-fonte', fonte));

    var botaoCard = elemento('button', 'pesquisa-promover', 'Virar card');
    botaoCard.type = 'button';
    botaoCard.addEventListener('click', function () {
      if (!window.BoardCanvas) return;

      /* Este é o SEGUNDO caminho que transforma resposta em card — o
         painel lateral, separado do botão "Pesquisar" do cabeçalho.
         Ele criava um único card "Resposta" com o texto inteiro e o
         markdown à mostra, porque a correção de formato tinha sido
         feita só no outro caminho.

         Dois caminhos para a mesma ação são duas chances de
         divergirem: agora os dois passam por `cardsDaResposta`, e um
         achado com perguntas vira um post-it por pergunta aqui
         também. */
      var ok = promoverParaOQuadro(titulo, descricao, fonte);
      if (ok) {
        botaoCard.disabled = true;
        botaoCard.textContent = 'Está no quadro';
      }
    });
    bloco.appendChild(botaoCard);

    corpo.appendChild(bloco);
  }

  /* ---------- O fluxo ---------- */
  /* ---- A espera longa ----
     Uma pergunta ampla ("quem são meus concorrentes") encadeia várias
     buscas e leva perto de vinte segundos. Um "Pesquisando..." parado
     esse tempo todo não parece demorado: parece travado — e a pessoa
     recarrega a página no meio, perdendo a consulta que ela já pagou.

     O contador não é barra de progresso, de propósito: não sabemos
     quanto falta, e uma barra que enche sozinha seria invenção. Mostrar
     o tempo correndo é honesto — diz que está vivo sem prometer prazo.

     Depois de oito segundos o texto explica POR QUE está demorando, que
     é a informação que a pessoa realmente quer nesse momento. */
  var LIMIAR_DEMORA = 8;
  var ticker = null;

  function trabalhando(ligado, texto) {
    ocupado = ligado;
    botao.disabled = ligado;
    entrada.disabled = ligado;

    clearInterval(ticker);
    ticker = null;

    if (!ligado) {
      aviso.textContent = '';
      return;
    }

    var base = texto || 'Pensando...';
    var inicio = Date.now();

    function pintar() {
      var s = Math.floor((Date.now() - inicio) / 1000);
      if (s < LIMIAR_DEMORA) {
        aviso.textContent = base + (s >= 2 ? ' ' + s + 's' : '');
        return;
      }
      /* Perguntas amplas consultam várias fontes; dizer isso vale mais
         que repetir "aguarde". */
      aviso.textContent = 'Consultando várias fontes... ' + s + 's';
    }

    pintar();
    ticker = setInterval(pintar, 1000);
  }

  /* ------------------------------------------------------------
     A pergunta que ficou esperando esclarecimento
     ------------------------------------------------------------
     Quando o servidor devolve `nao_resolvidas`, a tela pede o nome da
     empresa e promete "eu sigo daí". A promessa nao era cumprida: o
     que a pessoa digitava em seguida virava pergunta NOVA, a pergunta
     original era descartada, e "Correios" saia sozinho como consulta —
     por isso a busca voltava com um monte de empresa que ninguem
     pediu. Perguntar e ignorar a resposta e pior do que nao perguntar,
     porque gasta a atencao da pessoa e ainda entrega resultado errado.
     ------------------------------------------------------------ */
  var pendente = null;   /* { pergunta, referencia } */

  var REF_POSSESSIVO = /\b(dele|dela|deles|delas)\b/gi;
  var REF_SUJEITO    = /\b(ele|ela|eles|elas)\b/gi;

  /* Mesma substituicao que roteador.ts faz quando a sessao tem foco:
     possessivo vira "de <nome>", sujeito vira "<nome>". Fazer igual
     aqui e o que mantem a pergunta costurada identica a que o servidor
     teria montado sozinho se ja conhecesse a entidade. */
  function costurarResposta(pergunta, resposta) {
    return String(pergunta)
      .replace(REF_POSSESSIVO, 'de ' + resposta)
      .replace(REF_SUJEITO, resposta)
      .replace(/\s+/g, ' ')
      .trim();
  }

  var COMECO_DE_PERGUNTA =
    /^(quais|qual|quantas|quantos|quanto|onde|quando|como|por ?que|o que|quem)\b/i;

  /* Se a pessoa escreveu outra pergunta, ela desistiu do
     esclarecimento — costurar assim mesmo produziria uma frase que
     ninguem pediu. Tamanho sozinho nao serve como teste: "Correios,
     Jadlog, Loggi e Total Express" e resposta legitima e passa de
     sessenta caracteres. O que separa e a FORMA: interrogacao, ou
     abertura de pergunta. */
  function pareceResposta(texto) {
    if (texto.indexOf('?') !== -1) return false;
    if (COMECO_DE_PERGUNTA.test(texto)) return false;
    return texto.length <= 160;
  }

  function perguntar() {
    var digitado = entrada.value.trim();
    if (!digitado || ocupado) return;

    limparAjuda();
    desenharPergunta(digitado);
    entrada.value = '';

    /* Havia pergunta esperando: o que veio agora e a RESPOSTA dela. */
    var texto = digitado;
    if (pendente) {
      var costurada = costurarResposta(pendente.pergunta, digitado);

      /* Duas condicoes, e a segunda e exata: se a costura nao mudou
         nada, nao havia onde encaixar a resposta — tratar como
         pergunta nova e o unico caminho honesto, em vez de reenviar a
         pergunta velha fingindo que a resposta entrou. */
      if (pareceResposta(digitado) && costurada !== pendente.pergunta) {
        texto = costurada;
        /* Mostra a pergunta costurada ANTES de gastar: a pessoa
           confere que "eles" virou "Correios" e nao outra coisa. */
        desenharAlerta('Entendi: ' + texto);
      }
      pendente = null;
    }

    rolarParaOFim();
    trabalhando(true, 'Analisando...');

    /* Guardada porque o 409 chega no `catch`, longe daqui, e a saída
       precisa reenviar a MESMA pergunta — inclusive a costurada, se
       houve costura. Perder isso faria o botão buscar outra coisa. */
    entrada.dataset.ultimaPergunta = texto;

    garantirSessao()
      .then(function (id) {
        /* Passo 1: planejar. Não gasta nada. */
        return chamar('/pesquisa/sessoes/' + id + '/planejar', {
          metodo: 'POST',
          corpo: { pergunta: texto },
        });
      })
      .then(function (plano) {
        desenharPlano(plano);

        if (plano.nao_resolvidas && plano.nao_resolvidas.length) {
          /* Guarda a pergunta INTEIRA, nao so a referencia solta: e ela
             que a proxima mensagem vai completar. Sem isto, a resposta
             chegaria sem ter onde encaixar. */
          pendente = { pergunta: texto, referencia: plano.nao_resolvidas[0] };
          desenharNaoResolvida(plano);
          return null;
        }

        /* PES-007: a heurística não teve certeza de que tipo de
           pergunta é esta, e os candidatos custam ordens diferentes.
           Escolher por conta própria aqui seria escolher o custo por
           conta própria.

           Não ofereço botões de nível: "entrar no site deles e ver as
           unidades perto de mim" são duas perguntas de verdade, e
           pedir para separar resolve melhor do que fazer a pessoa
           escolher entre rótulos técnicos que não são dela. */
        if (!plano.decidido) {
          /* Antes isto pedia para separar em duas perguntas. Era a
             tela devolvendo o problema para quem não tem como
             resolvê-lo: a ambiguidade é da nossa heurística, não da
             pergunta. Agora as duas leituras viram botões. */
          desenharAlerta(
            'Essa pergunta dá para ler de mais de um jeito, e cada um custa diferente. ' +
            'Escolha qual:'
          );
          desenharSaidas(saidasDoPlano(plano), texto);
          return null;
        }

        if (!plano.executavel) {
          desenharAlerta(impedimentoDoPlano(plano));
          desenharSaidas(saidasDoPlano(plano), texto);
          return null;
        }

        /* Passo 2: executar. Só chega aqui o que é executável. */
        trabalhando(true, 'Pesquisando...');
        return chamar('/pesquisa/sessoes/' + sessaoId + '/consultar', {
          metodo: 'POST',
          corpo: { pergunta: texto },
        });
      })
      /* Mesmo desenhador do caminho confirmado. Eram duas cópias
         deste trecho — uma aqui, outra em `executarConfirmado` —, e
         duas cópias do mesmo desenho divergem no primeiro ajuste. */
      .then(mostrarResultadoNoPainel)
      .catch(function (e) {
        /* `js/api.js` lança um Error com a mensagem do servidor em
           `.message` e o corpo inteiro em `.dados` — não em `.corpo`.

           O 409 chega por aqui: o servidor manda `saidas` junto, e
           elas viram botões em vez de um texto pedindo para separar
           a pergunta em duas (BOARD-PESQUISA-012). */
        var dados = (e && e.dados) || {};
        desenharAlerta(mensagemDeErro(e));
        if (dados.saidas && dados.saidas.length) {
          desenharSaidas(dados.saidas, entrada.dataset.ultimaPergunta || '');
        }
      })
      .then(function () {
        trabalhando(false);
        rolarParaOFim();
      });
  }

  /* ---------- Os limites do quadro ----------
     `api/src/rotas/board.ts` recusa registro com titulo acima de 260
     ou descricao acima de 280 caracteres, e o PUT do board grava
     TUDO de uma vez: um unico card fora do limite derruba a gravacao
     inteira, com 400. Era o que acontecia — a resposta da IA passa
     dos 280 com folga, o quadro nao era gravado, e como o "Voltar"
     navega logo depois o toast de erro morria junto com a pagina.
     A impressao era de que tinha salvo.

     Dividir e melhor do que cortar: o quadro fica com a resposta
     INTEIRA, repartida em cards, em vez de um pedaco dela. */
  /* Marcador de versão. Serve para responder, em um olhar no console,
     a pergunta que custou várias rodadas: "o navegador está rodando o
     arquivo novo ou um em cache?" */
  var PESQUISA_VERSAO = 'v2 — post-it por pergunta, markdown limpo';
  console.log('[Pesquisa] ' + PESQUISA_VERSAO + ' | MAX_TITULO=260');

  var MAX_TITULO = 260;
  var MAX_DESCRICAO = 280;

  function cortar(texto, limite) {
    var t = String(texto == null ? '' : texto).trim();
    return t.length <= limite ? t : t.slice(0, limite - 1).trim() + '…';
  }

  /* Quebra sempre num espaco: cortar no meio da palavra faz o card
     seguinte comecar com meia silaba. Palavra maior que o limite
     inteiro (uma URL comprida) corta seco, que e o unico jeito. */
  function emPedacos(texto) {
    var t = String(texto == null ? '' : texto).trim();
    var partes = [];
    while (t.length > MAX_DESCRICAO) {
      var corte = t.lastIndexOf(' ', MAX_DESCRICAO);
      if (corte < MAX_DESCRICAO * 0.6) corte = MAX_DESCRICAO;
      partes.push(t.slice(0, corte).trim());
      t = t.slice(corte).trim();
    }
    if (t) partes.push(t);
    return partes;
  }


  /* ------------------------------------------------------------
     Resposta que faz perguntas vira um post-it por pergunta
     ------------------------------------------------------------
     Quando a busca devolve um pedido de esclarecimento, o conteúdo
     útil são as perguntas — e num quadro elas não são texto para ler,
     são trabalho a fazer. Fatiadas a cada 280 caracteres viravam
     "Resposta (1/2)" com duas perguntas e meia dentro, que ninguém
     responde porque não há onde.

     Uma pergunta por card, com a descrição já convidando a resposta,
     transforma o quadro no lugar onde ela é respondida — que é o que
     um post-it é.

     O texto que não é pergunta continua virando card comum: descartá-lo
     perderia o achado quando a resposta traz conteúdo E uma dúvida no
     fim, que é o caso mais comum de uma busca parcial. */
  var CONVITE = 'Responda aqui...';

  function emSentencas(normal) {
    /* Sem lookbehind de propósito — Safari só passou a suportar em
       2023, e um quadro que não abre é pior que um regex mais longo.
       Recebe o texto JÁ normalizado para que cada sentença seja
       substring exata dele: é isso que permite remover as perguntas
       depois sem reconstruir o resto emendando pedaços, que trocava
       "etc.)" por "etc. )". */
    return (normal.match(/[^.!?]+[.!?]*/g) || [])
      .map(function (f) { return f.trim(); })
      .filter(Boolean);
  }

  function ehPergunta(f) { return /\?$/.test(f); }

  /* O provedor responde em markdown, e o card usa textContent — então
     `**negrito**` chegava ao post-it com os asteriscos à mostra. Tirar
     a marcação aqui é melhor que renderizá-la: um post-it é uma
     anotação curta, não um documento formatado. */
  function semMarcacao(t) {
    return String(t == null ? '' : t)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1$2')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Uma pergunta longa costuma ser núcleo + qualificação: "Qual modal
     a iHouseLog deve contratar" + "para entregas entre condomínios
     (courier, transportadora)". O núcleo sozinho já é a pergunta; o
     resto é detalhe.

     Cortar no conectivo preserva uma pergunta legível dentro dos 60
     caracteres que o servidor aceita (board.ts, regra IDEIA-CRIA-001),
     em vez de truncar no meio de uma palavra. Devolve null quando não
     há corte que sirva — aí quem chama decide. */
  function nucleoDaPergunta(q, limite) {
    var corpo = q.replace(/\?+\s*$/, '').trim();
    var marcas = [' para ', ' entre ', ' considerando ', ' quando ', ' com ', ' (', ', '];
    var melhor = '';

    marcas.forEach(function (m) {
      var i = corpo.indexOf(m);
      while (i > 0) {
        var cand = corpo.slice(0, i).trim().replace(/[,;:]$/, '');
        if (cand.length + 1 <= limite && cand.length > melhor.length) melhor = cand;
        i = corpo.indexOf(m, i + 1);
      }
    });

    return melhor ? melhor + '?' : null;
  }

  function cardsDePerguntas(perguntas) {
    return perguntas.map(function (bruta) {
      var q = semMarcacao(bruta);

      /* O caso bom: a pergunta inteira é o título e a descrição só
         convida a resposta. */
      if (q.length <= MAX_TITULO) {
        return { titulo: q, descricao: CONVITE };
      }

      /* Longa demais para o título. A pergunta completa NÃO é jogada
         fora nem repetida inteira: o título leva o núcleo, a descrição
         leva a qualificação que não coube — o que ficaria perdido se
         só truncássemos. */
      var nucleo = nucleoDaPergunta(q, MAX_TITULO);
      if (nucleo) {
        var sobra = q.slice(nucleo.length - 1).replace(/^[\s,;:]+/, '').trim();
        return {
          titulo: nucleo,
          descricao: cortar(sobra ? sobra + '\n\n' + CONVITE : CONVITE, MAX_DESCRICAO)
        };
      }

      return {
        titulo: cortar(q, MAX_TITULO),
        descricao: cortar(q + '\n\n' + CONVITE, MAX_DESCRICAO)
      };
    });
  }


  /* ============================================================
     De uma resposta para um ou mais quadros
     ============================================================
     Duas decisões vivem aqui, e as duas nasceram de defeitos reais.

     PRIMEIRA — um assunto por quadro. Uma pergunta como "mudanças de
     preço, novos entrantes, mudanças de regulação e as fontes de cada
     um" traz quatro investigações diferentes. Empilhadas no mesmo
     quadro, viram uma pilha em que nada se acha: o quadro é o lugar
     onde um assunto é trabalhado, e misturar quatro nele é o mesmo
     que não ter quadro nenhum. Quando a resposta vem em seções, cada
     seção vira um quadro com o nome do assunto.

     SEGUNDA — texto longo não é post-it. Um post-it é uma anotação
     que se lê de relance; uma resposta de pesquisa densa é um texto
     que se lê do começo ao fim, com as referências no fim. Fatiada em
     cartões de 280 caracteres ela virava "Resposta (1/4)" — deixava
     de ser texto sem virar anotação. Acima do limite abaixo, o
     resultado vai para um quadro-documento.

     O que continua em post-it, sempre: pergunta que a busca devolveu.
     Ela não é conteúdo para ler, é trabalho a fazer — e um quadro de
     perguntas com "Responda aqui..." é onde esse trabalho acontece.
     ============================================================ */

  /* A fronteira é o próprio post-it: o que não cabe em um cartão não
     é anotação. Fatiar 400 caracteres em dois cartões não devolve a
     legibilidade que o texto corrido tem — só reparte o problema.
     Por isso o limite é MAX_DESCRICAO, e não um número escolhido à
     parte que precisaria ser mantido em sincronia com ele. */
  var LIMITE_DOCUMENTO = MAX_DESCRICAO;

  /* Cabeçalhos que o provedor usa para separar assuntos: markdown
     (`## Preços`), negrito em linha própria (`**Preços**`) ou rótulo
     seguido de dois-pontos. Procurados no texto CRU, antes de
     `semMarcacao` — que é justamente o que apaga essas marcas. */
  function secoesDaResposta(bruto) {
    var texto = String(bruto == null ? '' : bruto);

    /* As linhas vem com o deslocamento em que cada uma comeca. E isso
       que permite dizer que uma citacao no caractere 812 pertence a
       secao "Novos competidores": o provedor manda a posicao, nao a
       URL dentro do texto. Um split() comum jogaria fora o que
       importa — e o separador pode ser \n ou \r\n, entao a conta tem
       de vir do proprio scan, nao de somar tamanhos. */
    var linhas = [];
    var re = /\r?\n/g, m, ini = 0;
    while ((m = re.exec(texto))) {
      linhas.push({ txt: texto.slice(ini, m.index), ini: ini });
      ini = m.index + m[0].length;
    }
    linhas.push({ txt: texto.slice(ini), ini: ini });

    var secoes = [];
    var atual = null;

    /* ---- Três formas de título, e só UMA delas é inequívoca ----
       `# Assunto` é marcação: a linha É um título, não importa o
       tamanho. As outras duas — negrito sozinho, e Frase Capitalizada
       terminada em dois-pontos — são palpites sobre prosa, e por isso
       continuam curtas: um limite baixo é o que impede um parágrafo
       inteiro em negrito de virar título de quadro.

       O teto de 80 valia para as três, e foi o defeito de 14/09/2026.
       Desde a Fase 1a o provedor responde várias perguntas por vez e
       repete cada uma como cabeçalho — e pergunta é longa. Duas das
       quatro passavam de 80 caracteres, não eram reconhecidas como
       título, caíam no CORPO da seção anterior, e lá `partirSecao`
       as via como perguntas soltas: a resposta ia para o quadro da
       pergunta errada e a pergunta virava post-it "Responda aqui",
       como se ninguém a tivesse respondido. Ela tinha sido
       respondida — logo abaixo dela.

       200 é folga para cabeçalho de pergunta sem deixar um parágrafo
       com `#` na frente virar título. */
    function titulo(linha) {
      var t = linha.trim();
      if (!t) return null;
      var m = t.match(/^#{1,6}\s+(.{2,200})$/);
      if (m) return semMarcacao(m[1]);
      m = t.match(/^\*\*(.{2,80}?)\*\*:?$/);
      if (m) return semMarcacao(m[1]);
      m = t.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^.!?]{2,60}):$/);
      if (m) return semMarcacao(m[1]);
      return null;
    }

    linhas.forEach(function (reg) {
      var linha = reg.txt;
      var t = titulo(linha);
      if (t) {
        atual = { titulo: t, corpo: [], inicio: reg.ini };
        secoes.push(atual);
        return;
      }
      if (!atual) {
        atual = { titulo: '', corpo: [], inicio: reg.ini };
        secoes.push(atual);
      }
      atual.corpo.push(linha);
    });

    /* Cada secao vai ate onde a proxima comeca; a ultima, ate o fim.
       Sao faixas contiguas que cobrem o texto inteiro, entao toda
       posicao de citacao cai em exatamente uma delas. */
    secoes.forEach(function (sec, i) {
      sec.fim = i + 1 < secoes.length ? secoes[i + 1].inicio : texto.length;
    });

    return secoes
      .map(function (sec) {
        var cru = sec.corpo.join('\n');
        /* inicio/fim seguem junto ate planejarQuadros. */
        /* `bruto` acompanha a secao porque a associacao de referencias
           precisa do texto ANTES da limpeza: semMarcacao transforma
           [Tabela](https://fedex.com/x) em "Tabela" e apaga justamente
           a evidencia de qual assunto cita qual fonte. */
        return {
          titulo: sec.titulo,
          corpo: semMarcacao(cru),
          bruto: cru,
          inicio: sec.inicio,
          fim: sec.fim,
        };
      })
      .filter(function (sec) { return sec.corpo || sec.titulo; });
  }

  /* Separa, dentro de uma seção, o que é texto do que é pergunta.
     A pergunta sai do corpo sempre — mesmo no meio de um parágrafo
     denso — porque ela não pertence ao mesmo lugar que o conteúdo:
     texto vai para onde se lê, pergunta vai para onde se responde. */
  /* "Pergunta em aberto" é pergunta que o PROVEDOR fez a quem lê —
     "Qual o seu ticket médio?" —, não pergunta que ele próprio
     respondeu. A diferença estava implícita e quebrou na Fase 1a:
     agora o provedor recebe uma lista de perguntas e as repete como
     cabeçalho antes de cada resposta.

     Cabeçalho já é filtrado por `secoesDaResposta` (vira título de
     seção, não corpo). Esta segunda guarda existe para o caso de
     um cabeçalho escapar daquela — linha começando com `#` nunca é
     pergunta a responder, é rótulo do que vem abaixo. */
  function ehCabecalho(s) {
    return /^\s*#{1,6}\s/.test(String(s == null ? '' : s));
  }

  function partirSecao(corpo) {
    var sentencas = emSentencas(corpo);
    var perguntas = sentencas.filter(function (s) {
      return ehPergunta(s) && !ehCabecalho(s);
    });
    if (!perguntas.length) return { texto: corpo, perguntas: [] };

    var texto = corpo;
    perguntas.forEach(function (q) { texto = texto.split(q).join(' '); });
    return {
      texto: texto.replace(/\s+/g, ' ').trim(),
      perguntas: cardsDePerguntas(perguntas),
    };
  }

  /* Chaves pelas quais uma fonte pode ser reconhecida dentro do
     texto de uma secao, da mais forte para a mais fraca:

       - a URL inteira, sem protocolo e sem www;
       - o host sozinho (fedex.com), que pega tanto o link markdown
         quanto a mencao solta no meio da frase;
       - o titulo, e so quando tem 8 caracteres ou mais. Titulo curto
         ("FedEx", "Tabela") casa por acaso com prosa e espalharia a
         referencia por quadros que nao a citam. */
  function chavesDaFonte(f) {
    var chaves = [];
    var url = String(f.url == null ? '' : f.url).trim();

    if (url) {
      var limpa = url
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/[\/#?]+$/, '')
        .toLowerCase();
      if (limpa) chaves.push(limpa);
      var host = limpa.split('/')[0];
      if (host && host.indexOf('.') > 0 && host !== limpa) chaves.push(host);
    }

    var titulo = String(f.titulo == null ? '' : f.titulo).trim();
    if (titulo.length >= 8) chaves.push(titulo.toLowerCase());

    return chaves;
  }

  function citaFonte(bruto, f) {
    var t = String(bruto == null ? '' : bruto).toLowerCase();
    if (!t) return false;
    return chavesDaFonte(f).some(function (k) { return t.indexOf(k) !== -1; });
  }

  /* Aceita tanto {url, titulo} quanto a string ja rotulada, porque
     quem chama variou com o tempo. Sem url nao ha o que casar — essa
     fonte cai no primeiro quadro, como caia antes. */
  function normalizarFontes(fontes) {
    return (fontes || [])
      .map(function (f) {
        if (!f) return null;
        return typeof f === 'string' ? { url: '', titulo: f } : f;
      })
      .filter(function (f) { return f && (f.url || f.titulo); });
  }

  /* Titulo E url na mesma linha. So o titulo deixava a referencia sem
     como ser conferida — um nome de pagina que nao leva a lugar
     nenhum, justamente quando alguem foi checar a afirmacao.

     O separador ' — ' e contrato com o board: e por ele que o
     `criarQuadroDocumento` remonta o link ao desenhar. Precisa ser
     texto porque a fonte atravessa o banco como uma string so, dentro
     do registro "Referencias". */
  function rotuloDaFonte(f) {
    var t = String(f.titulo == null ? '' : f.titulo).trim();
    var u = String(f.url == null ? '' : f.url).trim();
    if (t && u) return t + ' — ' + u;
    return u || t;
  }

  /* Devolve a lista de quadros a criar, na ordem em que devem
     aparecer. Cada item: { tipo, titulo, texto, fontes, itens }. */
  function planejarQuadros(bruto, fontes, pergunta) {
    var secoes = secoesDaResposta(bruto);
    var nomeadas = secoes.filter(function (s) { return s.titulo; });
    if (nomeadas.length < 2) {
      secoes = [{
        titulo: '',
        corpo: semMarcacao(bruto),
        bruto: bruto,
        inicio: 0,
        fim: String(bruto == null ? '' : bruto).length,
      }];
    }

    var perguntasSoltas = [];
    var conteudo = [];

    secoes.forEach(function (sec) {
      if (!sec.corpo) return;
      var parte = partirSecao(sec.corpo);
      perguntasSoltas = perguntasSoltas.concat(parte.perguntas);

      /* Sobra curta depois de tirar as perguntas é andaime — "Preciso
         de mais informações para ajudar você" anuncia a pergunta, não
         acrescenta nada a ela, e vira um quadro que ninguém usa. Só
         entra como conteúdo o que se sustenta sem a pergunta ao lado. */
      /* Seção que alguém nomeou é conteúdo por definição, por mais
         curta que fique depois de tirar a pergunta: "Mudanças de
         regulação" com uma frase é um achado, não sobra. O andaime é
         o texto SEM título que só existe para anunciar a pergunta. */
      var soAndaime = !sec.titulo && parte.perguntas.length && parte.texto.length < 80;
      if (parte.texto && !soAndaime) {
        conteudo.push({
          titulo: sec.titulo,
          texto: parte.texto,
          bruto: sec.bruto,
          inicio: sec.inicio,
          fim: sec.fim,
        });
      }
    });

    /* Formato decidido UMA vez, para a resposta inteira. Seções irmãs
       do mesmo resultado com formatos diferentes — uma em documento,
       a vizinha em cartões — não é adaptação ao conteúdo, é board
       incoerente: quem lê não tem como saber por que "Preços" virou
       texto e "Novos entrantes" virou post-it, já que ambos são o
       mesmo tipo de achado. Se um assunto pede documento, todos vão
       de documento. */
    /* Duas portas para o formato documento, e a segunda importa tanto
       quanto a primeira:

       — algum assunto não cabe num post-it; ou
       — a resposta veio dividida em assuntos nomeados. Uma resposta
         que o provedor organizou em seções É um texto de leitura, por
         mais que cada seção isolada caiba num cartão. Sem esta
         segunda porta, três parágrafos de 270 caracteres viravam
         três cartões "Resposta" — exatamente o resultado ilegível que
         o quadro-documento existe para evitar. */
    var comoDocumento =
      conteudo.some(function (c) { return c.texto.length >= LIMITE_DOCUMENTO; }) ||
      conteudo.filter(function (c) { return c.titulo; }).length >= 2;

    var planos = conteudo.map(function (c) {
      if (comoDocumento) {
        return {
          tipo: 'documento',
          titulo: c.titulo || tituloDoDocumento(pergunta),
          texto: c.texto,
          fontes: [],
        };
      }
      return {
        tipo: 'postits',
        titulo: c.titulo || 'Resultado da pesquisa',
        itens: cardsDaResposta(c.texto),
      };
    });

    /* Cada referência fica no quadro que a cita. Antes todas caíam no
       primeiro, e num board dividido por assunto isso é errado de um
       jeito que atrapalha: quem lê "Tabela de preços em vigor" quer a
       fonte daquela tabela ao lado dela, não amontoada num quadro
       anterior junto com as fontes de outros dois assuntos.

       `conteudo` e `planos` são o mesmo índice (planos veio de um map
       sobre conteudo), então o bruto da seção i responde pelo plano i.

       Uma fonte citada por dois assuntos entra nos dois: cada quadro
       precisa se sustentar sozinho, e repetir a referência custa uma
       linha. Uma fonte que nenhum assunto cita não some — vai para o
       primeiro quadro, exatamente onde ela estava antes. */
    var lista = normalizarFontes(fontes);

    if (lista.length && planos.length) {
      var porPlano = planos.map(function () { return []; });
      var orfas = [];

      lista.forEach(function (f) {
        var achou = false;
        var posicoes = (f.inicios || []).filter(function (n) {
          return typeof n === 'number' && n >= 0;
        });

        /* 1. Posicao — o sinal exato. A citacao vem presa ao trecho da
              resposta que ela sustenta, entao a faixa da secao decide
              sozinha, sem depender de a URL aparecer no texto (ela
              nao aparece: a resposta e prosa, as citacoes sao
              metadados). */
        if (posicoes.length) {
          conteudo.forEach(function (c, i) {
            var dentro = posicoes.some(function (n) {
              return n >= c.inicio && n < c.fim;
            });
            if (dentro) { porPlano[i].push(rotuloDaFonte(f)); achou = true; }
          });

          /* 2. A posicao caiu numa secao que nao virou quadro (sobra
                curta, so-pergunta). Vai para a secao mantida mais
                proxima antes dela — o vizinho de cima e de quem
                aquele trecho estava falando. */
          if (!achou) {
            var melhor = -1, dist = Infinity;
            conteudo.forEach(function (c, i) {
              posicoes.forEach(function (n) {
                if (c.inicio <= n && n - c.inicio < dist) { dist = n - c.inicio; melhor = i; }
              });
            });
            if (melhor >= 0) { porPlano[melhor].push(rotuloDaFonte(f)); achou = true; }
          }
        }

        /* 3. Sem posicao: provedor antigo, ou resposta que traz o link
              escrito no texto. Reconhece pela URL/host/titulo. */
        if (!achou) {
          conteudo.forEach(function (c, i) {
            if (citaFonte(c.bruto, f)) { porPlano[i].push(rotuloDaFonte(f)); achou = true; }
          });
        }

        if (!achou) orfas.push(rotuloDaFonte(f));
      });

      orfas.forEach(function (r) { porPlano[0].push(r); });

      planos.forEach(function (p, i) {
        var fs = porPlano[i];
        if (!fs.length) return;
        if (p.tipo === 'documento') p.fontes = fs;
        else p.itens = p.itens.concat(cardsDeTexto('Fontes', fs.join(' · ')));
      });
    } else if (lista.length) {
      planos.push({
        tipo: 'postits',
        titulo: 'Fontes',
        itens: cardsDeTexto('Fontes', lista.map(rotuloDaFonte).join(' · ')),
      });
    }

    if (perguntasSoltas.length) {
      planos.push({
        tipo: 'postits',
        titulo: 'Perguntas em aberto',
        itens: perguntasSoltas,
      });
    }

    return planos;
  }

  function tituloDoDocumento(pergunta) {
    var t = semMarcacao(pergunta || '').replace(/\?+\s*$/, '').trim();
    return t ? cortar(t, MAX_TITULO) : 'Resultado da pesquisa';
  }

  function cardsDaResposta(texto) {
    /* A marcação sai ANTES de segmentar, não depois. Segmentar
       primeiro parte o par `**...**` entre duas sentenças, e aí cada
       metade fica com um `**` órfão que nenhum regex de negrito casa
       — o asterisco chegava ao post-it mesmo com a limpeza ligada.
       `semMarcacao` também normaliza os espaços, então faz o trabalho
       que era feito aqui. */
    var normal = semMarcacao(texto);
    var sentencas = emSentencas(normal);
    var perguntas = sentencas.filter(ehPergunta);

    if (!perguntas.length) return cardsDeTexto('Resposta', normal);

    /* Perguntas dominando a resposta = pedido de esclarecimento. Aí o
       que sobra é andaime — "Preciso de mais informações para ajudar
       você" anuncia a pergunta, não acrescenta nada a ela, e num quadro
       vira um post-it que ninguém usa. Só as perguntas viram cards.

       Uma resposta longa com uma dúvida no fim não cai nesta regra, e
       o conteúdo dela é preservado abaixo — é a diferença entre a busca
       não ter entendido a pergunta e ter respondido com uma ressalva. */
    /* Conta só o que tem substância: o segmentador quebra em
       abreviação ("etc.") e produz fragmentos como ")." que não são
       sentença nenhuma. Contá-los inflava o denominador e fazia o
       andaime escapar da regra justamente no caso mais comum. */
    var densas = sentencas.filter(function (f) { return f.length > 15; });
    var perguntasDensas = densas.filter(ehPergunta);

    if (perguntasDensas.length * 2 >= densas.length) {
      return cardsDePerguntas(perguntas);
    }

    var resto = normal;
    perguntas.forEach(function (q) { resto = resto.split(q).join(' '); });
    resto = resto.replace(/\s+/g, ' ').trim();

    var itens = cardsDePerguntas(perguntas);
    if (resto.length > 40) itens = cardsDeTexto('Resposta', resto).concat(itens);
    return itens;
  }

  function cardsDeTexto(titulo, texto) {
    var partes = emPedacos(texto);
    return partes.map(function (parte, i) {
      var rotulo = partes.length > 1
        ? titulo + ' (' + (i + 1) + '/' + partes.length + ')'
        : titulo;
      return { titulo: cortar(rotulo, MAX_TITULO), descricao: parte };
    });
  }

  /* O board tem toast proprio (`window.mostrarMensagem`); o painel so
     e visivel se a pessoa o tiver aberto. Toast primeiro, alerta no
     painel como reserva. */
  function avisarNaTela(msg) {
    if (typeof window.mostrarMensagem === 'function') window.mostrarMensagem(msg);
    else desenharAlerta(msg);
  }

  /* ---------- A porta para quem está fora ----------
     O botão "Pesquisar" do cabeçalho da tarefa (board.html) abre este
     painel já com a descrição da tarefa na caixa — é o "a tarefa chega
     com conteúdo" de board-lista.md §5.

     Não dispara a pergunta sozinho: deixa o texto pronto para a pessoa
     ler, ajustar e enviar. Perguntar por conta própria seria gastar
     por ela, que é o oposto de PES-007. */
  /* Exposto para o board poder normalizar cards que já estão
     gravados: o formato dos post-its foi corrigido depois que muitos
     quadros já tinham sido salvos, e o que está no banco não se
     conserta sozinho. */
  /* ------------------------------------------------------------
     A investigação, de ponta a ponta — e narrada
     ------------------------------------------------------------
     Era um encadeamento dentro de `pesquisarNoQuadro`. Virou função
     própria por uma razão só: a pessoa agora pode escolher um nível
     depois de uma recusa (BOARD-PESQUISA-012), e a segunda tentativa
     precisa percorrer exatamente o mesmo caminho da primeira. Duas
     cópias do fluxo divergiriam no primeiro ajuste — é o defeito que
     este arquivo já teve entre "Virar card" e o botão "Pesquisar".

     `nivelConfirmado` nulo = primeira tentativa, passa por
     `planejar`. Preenchido = a pessoa já decidiu, vai direto para
     `consultar`; replanejar aqui seria reperguntar à heurística
     algo que uma pessoa acabou de responder.

     `idN` é a entrada da narração no assistente (IA-CONV-NARRA).
     Pode ser `null` — a pesquisa nunca dependeu do painel para
     funcionar. */
  /* ------------------------------------------------------------
     Ler um text/event-stream
     ------------------------------------------------------------
     Formato SSE, na parte que usamos: quadros separados por linha
     em branco, cada um com `event:` e uma ou mais `data:`. O resto
     da especificação (`id:`, `retry:`, reconexão automática) é do
     `EventSource`, que não serve aqui porque só faz GET — e esta
     rota precisa de corpo.

     O buffer existe porque um `read()` não respeita fronteira de
     quadro: um evento pode chegar partido em dois pedaços, e dois
     eventos podem chegar no mesmo. Tratar cada pedaço como um
     evento é o erro clássico, e ele só aparece em produção, com
     rede lenta. */
  function lerEventos(resposta, aoEvento) {
    var leitor = resposta.body.getReader();
    var decodificador = new TextDecoder();
    var buffer = '';

    function despachar(quadro) {
      var evento = 'message';
      var dados = '';
      quadro.split('\n').forEach(function (linha) {
        if (linha.indexOf('event:') === 0) evento = linha.slice(6).trim();
        else if (linha.indexOf('data:') === 0) dados += linha.slice(5).trim();
      });
      if (!dados) return;
      var corpo;
      try { corpo = JSON.parse(dados); } catch (_) { return; }
      aoEvento(evento, corpo);
    }

    function passo() {
      return leitor.read().then(function (r) {
        if (r.done) {
          /* Um último quadro sem linha em branco no fim ainda vale:
             o servidor fecha a conexão logo depois do `fim`. */
          if (buffer.trim()) despachar(buffer);
          return;
        }
        buffer += decodificador.decode(r.value, { stream: true });
        var corte;
        while ((corte = buffer.indexOf('\n\n')) !== -1) {
          despachar(buffer.slice(0, corte));
          buffer = buffer.slice(corte + 2);
        }
        return passo();
      });
    }

    return passo();
  }

  /* ------------------------------------------------------------
     A investigação em etapas (Fase 1a)
     ------------------------------------------------------------
     A estrada principal do botão da tarefa. A diferença para
     `investigar()` não é o resultado — é que aqui o servidor conta
     o que está fazendo enquanto faz, e lê o conhecimento da empresa
     antes de ir à web.

     `investigar()` não morreu: ele continua sendo a saída de
     emergência. Quando o planejador diz "não há nada verificável
     aqui", as saídas de BOARD-PESQUISA-012 aparecem, e clicar numa
     delas cai no caminho direto — `consultar` com `nivelConfirmado`,
     sem replanejar o que uma pessoa acabou de decidir. */
  /* O PORTÃO SAIU DO CAMINHO AO VIVO em 15/09/2026, por decisão do
     Ricardo: "ele já clicou, e já sabemos que ele quer pesquisar".
     "Buscar agora" e "Agora não" perguntavam de novo o que o botão
     "Pesquisar" já tinha perguntado — uma segunda confirmação para o
     mesmo gesto, e a única informação que ela carregava (o preço)
     tinha saído dali um pouco antes.

     O GESTO NÃO SUMIU, mudou de lugar: quem autoriza o gasto é o
     clique em "Pesquisar". O servidor continua igual — o estado
     `aguardando` é gravado e a rota `/buscar` continua sendo uma
     segunda chamada —, então BOARD-PESQUISA-038 (sobreviver a fechar
     a aba), 040 (confirmar duas vezes busca uma vez) e 041 (sem
     saldo, volta à espera) continuam valendo. O cliente é que deixou
     de parar.

     Sobra um caso em que a espera aparece: a aba morreu entre
     planejar e buscar, ou faltou crédito na confirmação. Aí NÃO
     houve clique hoje, e buscar sozinho ao abrir a página gastaria
     sem gesto nenhum. É para esse caso que CONTINUAR existe — um
     botão só, porque "agora não" é fechar a aba, e o plano fica
     guardado de qualquer jeito. */
  var CONTINUAR = {
    nivel: 'buscar',
    rotulo: 'Continuar a pesquisa',
    explicacao: 'O plano abaixo já foi escrito; falta ir à web.',
  };

  /* Um tratador de eventos, dois streams.
     `investigar` planeja e para no portão; `buscar` atravessa o
     portão e entrega. Os eventos são os mesmos, e ter dois
     tratadores faria os dois divergirem no primeiro ajuste — foi
     exatamente por isso que a recuperação da 1b reusa
     `entregarResultado` em vez de montar quadro por conta própria. */
  /* `seguirSozinho` só é verdade no stream que PLANEJA. O stream de
     `/buscar` nunca o recebe, e é isso que impede um laço: se o
     servidor pedir espera de novo (ele faz isso quando o preço subiu
     entre planejar e confirmar, BOARD-PESQUISA-039), o cliente para e
     mostra "Continuar a pesquisa" em vez de confirmar para sempre.
     Um laço aqui não seria uma tela travada — seria dinheiro saindo
     em rodadas, que é o pior defeito que este arquivo pode ter. */
  function correrStream(abrir, texto, idN, seguirSozinho) {
    var N = narracao();
    var entregue = false;

    trabalhando(true, 'Pesquisando...');

    return abrir()
      .then(function (resposta) {
        return lerEventos(resposta, function (evento, dados) {
          if (evento === 'passo') {
            N.passo(idN, dados.texto);
            return;
          }

          if (evento === 'plano') {
            /* O plano à vista antes da busca sair (PES-007). O PREÇO
               não sai aqui: ele sai no evento `aguardando`, colado
               nos botões. Número numa linha e escolha em outra vira
               aviso; número em cima do botão vira decisão. */
            var linhas = (dados.perguntas || []).map(function (p, i) {
              return (i + 1) + '. ' + p.pergunta;
            });
            N.passo(idN, 'Vou buscar:\n' + linhas.join('\n'));
            return;
          }

          if (evento === 'aguardando') {
            /* O servidor terminou de planejar e gravou `aguardando`.
               Este stream acaba aqui de propósito — não é queda de
               conexão —, por isso `entregue = true`.

               Antes o cliente parava neste ponto e perguntava. Não
               pergunta mais (decisão do Ricardo, 15/09/2026): quem
               clicou em "Pesquisar" já disse o que queria. A narração
               NÃO fecha; ela continua correndo na mesma entrada, e o
               segundo stream escreve dentro dela. Para quem lê, planejar
               e buscar viraram uma coisa só — que é o que sempre foram.

               `dados.mudou` deixou de ter para onde ir. Ele existia
               para reabrir o portão quando o preço subia entre planejar
               e confirmar (BOARD-PESQUISA-039); sem portão e sem preço
               na tela, não há o que reabrir. O teto continua valendo no
               servidor, e é ele que segura o gasto. */
            entregue = true;
            if (!seguirSozinho) {
              /* Segunda espera no mesmo caminho: o servidor está
                 insistindo em perguntar. Aí a pessoa decide. */
              N.fechar(idN, 'aguardando',
                'Esta pesquisa parou antes de ir à web. O plano ficou guardado.',
                [CONTINUAR], function (_nivel, id) {  /* eslint-disable-line */
                  N.retomar(id, 'Continuando de onde parou.');
                  confirmarBusca(dados.investigacao_id, texto, id);
                });
              return;
            }
            N.passo(idN, 'Plano fechado. Indo à web.');
            confirmarBusca(dados.investigacao_id, texto, idN);
            return;
          }

          if (evento === 'parado') {
            /* O planejador recusou — e a recusa dele é lida, não por
               palavra-chave. BOARD-PESQUISA-012 vale igual: trocar um
               portão burro por um portão esperto ainda seria um
               portão. */
            entregue = true;
            var saidas = dados.saidas || [];
            N.fechar(idN, saidas.length ? 'parada' : 'falha', dados.mensagem, saidas, function (nivel, id) {
              var escolhida = null;
              for (var i = 0; i < saidas.length; i++) {
                if (saidas[i].nivel === nivel) escolhida = saidas[i];
              }
              N.retomar(id, 'Você escolheu: ' + (escolhida ? escolhida.rotulo : nivel) + '.');
              investigar(texto, nivel, id);
            });
            if (!saidas.length) avisarNaTela(dados.mensagem);
            return;
          }

          if (evento === 'erro') {
            entregue = true;
            N.fechar(idN, 'falha', dados.mensagem || 'A investigação não completou.');
            avisarNaTela(dados.mensagem || 'A investigacao nao completou.');
            return;
          }

          if (evento === 'fim') {
            entregue = true;

            /* O RASCUNHO SAIU em 15/09/2026, por decisão do Ricardo:
               a pesquisa termina e os quadros já nascem no board.

               Era a primeira metade da Fase 2 — um dialog que abria
               entre a busca e o board para a pessoa escolher, afirmação
               por afirmação, o que valia guardar. Ele resolvia um
               problema real (o quadro nascia sujo, e limpar era por
               card depois de gravado), mas cobrava uma decisão longa
               de quem só queria o resultado.

               O QUE A CURADORIA GARANTIA, E ONDE ISSO FOI PARAR: apagar
               continua existindo no próprio board, card a card, que é
               onde a pessoa já sabe mexer; e a procedência de tudo que
               foi lido e pago continua em "Ver as fontes" e no
               relatório, que não dependiam do rascunho.

               O QUE MUDOU DE VERDADE: afirmação sem fonte chegava
               DESLIGADA no rascunho (BOARD-PESQUISA-035) e agora entra
               no quadro como as outras. Ela continua marcada como sem
               fonte — PES-006 vale igual —, mas quem tira é a pessoa,
               depois, e não mais o padrão. */
            entregarResultado(dados, texto, idN);
          }
        });
      })
      .then(function () {
        /* Stream que termina sem `fim`, `parado` nem `erro` é conexão
           cortada no meio — e o silêncio seria pior do que o aviso,
           porque a narração ficaria girando para sempre. */
        if (!entregue) {
          N.fechar(idN, 'falha', 'A conexão caiu no meio da investigação.');
        }
        return entregue;
      })
      .catch(function (e) {
        /* Erro ANTES do stream abrir chega aqui com status e corpo
           JSON — inclusive o 503 com as saídas, quando a busca não
           está configurada. */
        var dados = (e && e.dados) || {};
        var saidas = dados.saidas || [];
        if (saidas.length) {
          N.fechar(idN, 'parada', mensagemDeErro(e), saidas, function (nivel, id) {
            /* O rótulo, não o nível: "Você escolheu: busca" é nome
               interno, e a pessoa clicou num botão escrito "Buscar
               assim mesmo". */
            var escolhida = null;
            for (var i = 0; i < saidas.length; i++) {
              if (saidas[i].nivel === nivel) escolhida = saidas[i];
            }
            N.retomar(id, 'Você escolheu: ' + (escolhida ? escolhida.rotulo : nivel) + '.');

            /* "Esta tarefa já foi investigada" (BOARD-PESQUISA-077):
               as duas saídas não são níveis de busca, são o que fazer
               diante de uma resposta que já existe. Mandá-las para
               `investigar()` como se fossem nível gastaria dinheiro
               justamente no caminho criado para não gastar. */
            if (nivel === 'ver-anterior') {
              narracao().remover(id);
              recuperarInvestigacao(null, 0, true);
              return;
            }
            if (nivel === 'refazer') {
              correrStream(
                function () {
                  return garantirSessao().then(function (sid) {
                    return window.API.fluxo('/pesquisa/sessoes/' + sid + '/investigar', {
                      corpo: { pergunta: texto, refazer: true },
                    });
                  });
                },
                texto,
                id,
                true
              );
              return;
            }

            investigar(texto, nivel, id);
          });
        } else {
          N.fechar(idN, 'falha', mensagemDeErro(e));
          avisarNaTela(mensagemDeErro(e));
        }
        return false;
      })
      .then(function (ok) {
        trabalhando(false);
        return !!ok;
      });
  }

  function investigarEmEtapas(texto, idN) {
    return correrStream(
      function () {
        return garantirSessao().then(function (id) {
          return window.API.fluxo('/pesquisa/sessoes/' + id + '/investigar', {
            corpo: { pergunta: texto },
          });
        });
      },
      texto,
      idN,
      true
    );
  }

  /* A confirmação. Corpo vazio de propósito: o que vai ser buscado e
     por quanto já está gravado no servidor. Mandar o plano de volta
     daqui deixaria o cliente escolher o que se busca depois de o
     preço ter sido combinado — e o preço foi combinado para AQUELE
     plano. */
  function confirmarBusca(invId, texto, idN) {
    return correrStream(
      function () {
        return window.API.fluxo(
          '/pesquisa/sessoes/' + sessaoId + '/investigar/' + invId + '/buscar',
          { corpo: {} }
        );
      },
      texto,
      idN
    );
  }

  /* ------------------------------------------------------------
     Reencontrar a investigação de antes (Fase 1b)
     ------------------------------------------------------------
     Uma investigação não morre com a aba. O servidor termina,
     cobra e grava mesmo sem cliente — o que sumia era só o quadro,
     que nasce no navegador. Quem fechava a aba no meio pagava por
     uma busca e não recebia nada, com o resultado guardado no
     banco o tempo todo.

     Ao carregar a página, esta função reencontra a última
     investigação da tarefa e a remonta no assistente.

     O RESULTADO NÃO VIRA QUADRO SOZINHO, e isso é de propósito. A
     pessoa pode ter visto o quadro nascer antes de recarregar, e
     recriá-lo duplicaria conteúdo no board. Saber se ela viu é
     coisa que o servidor não tem como saber. Então vale a regra
     que já existe: a ponte entre painel e canvas é um GESTO
     explícito (BOARD-PESQUISA-003). Aqui o gesto é um botão. */
  var TRAZER = {
    nivel: 'trazer',
    rotulo: 'Trazer o resultado para o quadro',
    explicacao: 'Não custa nada: a busca já foi feita e paga.',
  };

  /* Rascunho que ficou aberto. Desde 14/09/2026 ele é GRAVADO, então
     fechar a aba no meio da curadoria não joga fora nem a busca nem
     o que já tinha sido decidido.

     Reabre por botão, não sozinho. Um modal que salta na cara de
     quem acabou de abrir a página rouba o controle de quem talvez
     tenha vindo fazer outra coisa — e o gesto explícito é a mesma
     regra que já vale para a ponte entre painel e canvas
     (`BOARD-PESQUISA-003`). */
  /* Fase 3a. A investigação deixa de ser um resultado que se lê uma
     vez e vira um lugar para perguntar. O botão não custa nada ao ser
     mostrado — a pergunta é que custa, e custa centavos, por isso ela
     não tem portão (decisão do Ricardo, 14/09/2026). */
  var PERGUNTAR = {
    nivel: 'caderno',
    rotulo: 'Perguntar sobre estas fontes',
    explicacao: 'Sem busca nova: respondo só com o que esta investigação já trouxe.',
  };

  /* Enquanto a investigação estiver correndo, pergunta de novo. Não
     é polling de tela viva — é o rabo de uma investigação que já
     estava em andamento quando a página recarregou, e que termina
     em segundos. Por isso o teto baixo: passado isso, ou ela travou
     ou a pessoa foi embora, e continuar perguntando seria carga
     por nada. */
  var ESPERA_MS = 4000;
  var MAX_ESPERAS = 20;

  /* Uma vez por carregamento de página: `recuperarInvestigacao` se
     repete enquanto a investigação corre, e remontar a conversa a
     cada volta a duplicaria na tela. */
  var restaurouCaderno = false;

  /* `aPedido` = alguém clicou para ver. A carga da página passa
     `false`; "Ver a resposta que já existe" passa `true`. A diferença
     decide se uma investigação TERMINADA vira entrada no assistente —
     ver o bloco "ABRIR A TAREFA NÃO REMONTA" abaixo. */
  function recuperarInvestigacao(idN, tentativas, aPedido) {
    if (!sessaoId) return;

    chamar('/pesquisa/sessoes/' + sessaoId + '/investigacao')
      .then(function (r) {
        var inv = r && r.investigacao;
        if (!inv) return;

        var N = narracao();
        var duracao = inv.encerrado_em
          ? new Date(inv.encerrado_em) - new Date(inv.criado_em)
          : Date.now() - new Date(inv.criado_em);

        /* Estados do servidor para estados da narração. `parada` e
           `falhou` não viram o mesmo desenho: uma teve motivo, a
           outra teve defeito. */
        var estado = inv.estado === 'entregue' ? 'ok'
          : inv.estado === 'aguardando' ? 'aguardando'
          : inv.estado === 'parada' ? 'parada'
          : inv.estado === 'falhou' ? 'falha'
          : 'correndo';

        var temResultado = inv.estado === 'entregue' && inv.resultado === 'entregue' && inv.resposta;

        /* Ninguém decidiu ainda sobre uma busca já paga. O servidor
           diz isso em uma palavra em vez de a tela deduzir varrendo
           a lista. */
        /* `inv.rascunho_pendente` continua vindo do servidor e deixou
           de significar alguma coisa aqui: sem curadoria, nada é
           "decidido", e o campo ficaria verdadeiro para sempre — o que
           faria toda investigação antiga oferecer um rascunho que não
           existe mais. Quem reabre uma tarefa com resultado recebe a
           mesma oferta de sempre: trazer o resultado para o quadro. */

        /* Já decidido: o que volta para o quadro é o que SOBROU, e as
           posições das fontes são recalculadas em cima disso. É o que
           conserta a limitação registrada em BOARD-PESQUISA-031 —
           antes, a recuperação empilhava todas as fontes no primeiro
           quadro, porque não sabia onde cada uma entrava. */
        function guardado() {
          if (!(inv.afirmacoes || []).length) {
            return {
              resultado: inv.resultado,
              resposta: inv.resposta,
              fontes: inv.fontes || [],
              consulta_id: inv.consulta_id || null,
              caderno: { fontes: inv.fontes || [], afirmacoes: inv.afirmacoes || [], resposta: inv.resposta },
              perguntas: (inv.plano && inv.plano.perguntas) || [],
              ja_sabido: (inv.plano && inv.plano.ja_sabido) || [],
            };
          }
          var grupos = agruparEmSecoes(inv.resposta, inv.afirmacoes);
          var r = remontar(grupos, inv.fontes || []);
          return {
            resultado: 'entregue',
            resposta: r.texto,
            fontes: r.fontes,
            consulta_id: inv.consulta_id || null,
            /* A lista inteira, com quem saiu — e não só as que
               sobreviveram ao corte, que é o que vai para o quadro. */
            caderno: { fontes: inv.fontes || [], afirmacoes: inv.afirmacoes || [], resposta: inv.resposta },
            perguntas: (inv.plano && inv.plano.perguntas) || [],
            ja_sabido: (inv.plano && inv.plano.ja_sabido) || [],
          };
        }

        /* Descartou tudo. Oferecer "trazer para o quadro" aqui seria
           desfazer uma decisão que a pessoa tomou — e trazer um texto
           vazio. A investigação continua no histórico, com as fontes e
           o gasto (BOARD-PESQUISA-036). */
        var descartado =
          temResultado &&
          (inv.afirmacoes || []).length > 0 &&
          (inv.afirmacoes || []).every(function (a) { return a.removida === true; });

        /* O portão sobrevive a fechar a aba, e é para isso que ele
           foi gravado (BOARD-PESQUISA-038). Quem viu o plano ontem e
           foi embora reencontra o mesmo plano e o mesmo botão hoje —
           o planejamento já foi pago, e refazê-lo cobraria duas vezes
           pelo mesmo trabalho. */
        var esperando = inv.estado === 'aguardando';

        /* O "Download" do painel aparece já no carregamento, sem
           esperar por "Trazer o resultado". A investigação existe, foi
           paga e está guardada — o relatório dela existe junto, e
           obrigar a pessoa a trazer os quadros de volta só para poder
           baixar o arquivo seria cobrar um gesto por outro.

           Descartada não entra: se todas as afirmações foram tiradas,
           o relatório sairia com os achados vazios. A investigação
           continua no histórico; o arquivo é que não tem o que dizer. */
        if (temResultado && !descartado) {
          publicarRelatorio(function () {
            var afirmacoes = inv.afirmacoes || [];
            return {
              tarefa: inv.pergunta,
              fontes: inv.fontes || [],
              afirmacoes: afirmacoes,
              lacunas: lacunasDe(inv.resposta || '', afirmacoes),
              perguntas: (inv.plano && inv.plano.perguntas) || [],
              jaSabido: (inv.plano && inv.plano.ja_sabido) || [],
              rodadas: window.IaCaderno ? window.IaCaderno.rodadas() : [],
            };
          });
        }

        /* A CONVERSA COM O CADERNO volta em qualquer caso: ela é do
           usuário, não da narração, e some junto com a narração seria
           perder o que ele escreveu. */
        function devolverCaderno() {
          if (restaurouCaderno) return;
          if (!(inv.perguntas || []).length || !window.IaCaderno) return;
          restaurouCaderno = true;
          window.IaCaderno.restaurar(inv.perguntas);
        }

        /* ABRIR A TAREFA NÃO REMONTA INVESTIGAÇÃO JÁ TERMINADA
           (decisão do Ricardo, 16/09/2026).

           A entrada "Investigação anterior" fazia sentido quando o
           resultado só virava quadro por um gesto: ela era a ponte. Com
           a Fase 2 fora do caminho, a pesquisa termina e os quadros já
           nascem no board — então reabrir a tarefa mostrava um resumo
           do que já estava na tela, com um botão que só duplicaria.

           `!idN` é o que separa os dois casos, e ele é essencial:

           · SEM `idN` — página recém-aberta. A investigação acabou
             faz tempo, os quadros estão gravados, não há o que dizer.

           · COM `idN` — esta função está se repetindo porque encontrou
             uma investigação CORRENDO quando a página abriu, e a pessoa
             está vendo a narração acontecer. Quando ela terminar, os
             quadros NÃO existem neste navegador (quem terminou foi o
             servidor), e "Trazer o resultado" é a única ponte. É o
             defeito que a Fase 1b existe para consertar; ele continua
             consertado.

           · COM `aPedido` — alguém PEDIU para ver. É o "Ver a resposta
             que já existe" de BOARD-PESQUISA-077, oferecido quando se
             pesquisa uma tarefa já investigada. Calar aqui não seria
             limpeza: seria um botão morto, que é o defeito que esta
             base menos tolera.

           `aguardando` também segue pelo caminho normal: é busca paga
           parada antes de ir à web, e calar ali perderia o plano. */
        var terminada = inv.estado !== 'correndo' && inv.estado !== 'aguardando';
        if (terminada && !idN && !aPedido) {
          devolverCaderno();
          return;
        }

        var dados = {
          titulo: inv.estado === 'correndo' ? 'Investigando'
            : esperando ? 'Investigação à espera'
            : 'Investigação anterior',
          tarefa: inv.pergunta,
          estado: estado,
          passos: (inv.passos || []).slice(),
          fecho: descartado
            ? 'Você descartou o resultado. A investigação fica no histórico, com as fontes.'
            : esperando
            /* A ÚNICA espera que sobrou. No caminho ao vivo a busca
               sai sozinha depois do plano; chegar aqui significa que
               algo cortou no meio — a aba morreu, ou faltou crédito
               na confirmação (BOARD-PESQUISA-041). Dizer QUE parou
               importa: senão o botão abaixo parece um segundo pedido
               de permissão, que é justamente o que saiu. */
            ? 'Esta pesquisa parou antes de ir à web. O plano ficou guardado.'
            : (inv.fecho || ''),
          duracaoMs: duracao,
          saidas: esperando
            ? [CONTINUAR]
            : descartado ? []
            : temResultado ? [TRAZER]
            : [],
          aoEscolher: esperando
            /* Um botão só: "agora não" é fechar a aba, e o plano fica
               guardado de qualquer jeito — não precisa de um botão
               para não fazer nada. */
            ? function (_nivel, id) {  /* eslint-disable-line */
                narracao().retomar(id, 'Continuando de onde parou.');
                confirmarBusca(inv.id, inv.pergunta, id);
              }
            : temResultado
            ? function (_nivel, id) {
                /* Mesmo caminho do resultado ao vivo: `entregarResultado`
                   é quem monta os quadros nos dois casos. Dois caminhos
                   para o mesmo desenho divergiriam no primeiro ajuste. */
                narracao().retomar(id, 'Trazendo o resultado guardado.');
                entregarResultado(guardado(), inv.pergunta, id);
              }
            : null,
        };

        /* Uma entrada só: em vez de empilhar uma remontagem a cada
           pergunta ao servidor, a anterior sai e a nova entra. */
        if (idN) narracao().remover(idN);
        var novoId = N.restaurar(dados);

        /* A conversa com o caderno volta junto — uma vez só, e só
           quando há alguma. Sem isto o caderno seria um lugar para
           voltar onde não há nada do que foi conversado. */
        devolverCaderno();

        if (inv.estado === 'correndo' && (tentativas || 0) < MAX_ESPERAS) {
          setTimeout(function () {
            recuperarInvestigacao(novoId, (tentativas || 0) + 1, aPedido);
          }, ESPERA_MS);
        }
      })
      .catch(function () {
        /* Recuperação é conforto: se falhar, a página continua
           inteira. Um erro aqui na cara de quem acabou de abrir a
           tela seria pior do que o silêncio. */
      });
  }

  /* Só procura quando há tarefa — sem ela não existe investigação a
     reencontrar. E só depois de a sessão existir: `garantirSessao`
     CRIA uma quando não há, e criar sessão vazia ao abrir a página é
     exatamente o que o comentário dela diz para não fazer. Por isso
     a busca é pela sessão existente, sem criar nada. */
  function procurarInvestigacaoAnterior() {
    if (!tarefaId) return;

    chamar('/pesquisa/sessoes?tarefaId=' + encodeURIComponent(tarefaId))
      .then(function (r) {
        var existente = (r && r.sessoes && r.sessoes[0]) || null;
        if (!existente) return;
        sessaoId = existente.id;
        recuperarInvestigacao(null, 0);
      })
      .catch(function () { /* idem */ });
  }

  /* ============================================================
     Afirmações, seções e o que sobrou de um rascunho que já não existe
     ============================================================
     Estas duas funções — `agruparEmSecoes` e `remontar` — nasceram
     para o RASCUNHO DA INVESTIGAÇÃO (Fase 2, primeira metade): um
     dialog que abria entre a busca e o board, com cada afirmação ao
     lado da fonte que a sustentava, para a pessoa escolher o que
     virava quadro. A decisão D1 o tinha tornado obrigatório.

     O rascunho SAIU em 15/09/2026, por decisão do Ricardo: a pesquisa
     termina e os quadros já nascem no board. O que ele fazia de
     bom — deixar apagar o que não se quer — continua existindo no
     próprio board, card a card, onde a pessoa já sabe mexer; e a
     procedência continua em "Ver as fontes" e no relatório.

     ESTAS DUAS FUNÇÕES FICARAM, e não por inércia: a RECUPERAÇÃO
     precisa delas. Uma investigação curada enquanto o rascunho
     existia tem `removida_pelo_usuario` gravado por afirmação, e
     reabrir aquela tarefa tem de devolver ao quadro o que a pessoa
     manteve — nem mais, nem menos. Sem elas, a decisão de quem leu
     morreria junto com a tela que a coletou.
     ============================================================ */

  /* Casa cada afirmação com a seção em que ela cai, pela posição.
     A posição vem do provedor, não de uma releitura do texto — é a
     mesma procedência que sustenta a fonte por afirmação. */
  function agruparEmSecoes(resposta, afirmacoes) {
    var secoes = secoesDaResposta(resposta).filter(function (s) {
      return (s.corpo || '').trim() || s.titulo;
    });

    var grupos = secoes.map(function (s) {
      return { titulo: s.titulo || '', inicio: s.inicio, fim: s.fim, itens: [] };
    });

    if (!grupos.length) {
      grupos = [{ titulo: '', inicio: 0, fim: String(resposta || '').length, itens: [] }];
    }

    (afirmacoes || []).forEach(function (a) {
      var alvo = grupos[0];
      for (var i = 0; i < grupos.length; i++) {
        if (a.inicio >= grupos[i].inicio) alvo = grupos[i];
      }
      alvo.itens.push({
        /* O id da linha gravada, quando existe. É por ele que a
           decisão volta ao servidor; sem ele (provedor sem citações,
           ou gravação que falhou) o rascunho ainda funciona, só não
           fica registrado. */
        id: a.id || null,
        /* A POSIÇÃO viaja com o item. Sem ela, qualquer lista
           remontada a partir daqui volta a `agruparEmSecoes` com
           `inicio` indefinido — e `undefined >= 0` é falso, então
           TUDO cai na primeira seção, em silêncio. Foi assim que as
           lacunas nasceram erradas em 14/09/2026. */
        inicio: a.inicio,
        texto: a.texto,
        fonteIds: a.fonteIds || [],
        trechos: a.trechos || [],
        semFonte: !!a.semFonte,
        /* Sem decisão gravada, TUDO fica. Até 15/09/2026 o padrão era
           o contrário — afirmação sem fonte chegava desligada, porque
           havia um rascunho onde a pessoa podia ligá-la de volta
           (BOARD-PESQUISA-035). Sem esse rascunho, manter o padrão
           antigo aqui faria a recuperação entregar MENOS do que o
           caminho ao vivo entrega, e pelo mesmo resultado: a mesma
           investigação daria quadros diferentes conforme a pessoa
           tivesse ou não recarregado a página.

           Quem decidiu antes continua mandando: `removida` explícito
           (das investigações curadas enquanto o rascunho existiu) vale
           por cima do padrão, nas duas direções. */
        fica: a.removida !== true,
      });
    });

    /* Provedor sem citações estruturadas: cada seção vira um item
       só, com o corpo inteiro. Continua passando pelo rascunho —
       "nada vira quadro sozinho" não tem exceção por formato de
       resposta. */
    grupos.forEach(function (g, i) {
      if (g.itens.length) return;
      var corpo = (secoes[i] && secoes[i].corpo ? secoes[i].corpo : '').trim();
      if (corpo) {
        g.itens.push({
          id: null,
          inicio: g.inicio,
          texto: corpo,
          fonteIds: [],
          trechos: [],
          semFonte: true,
          fica: true,
        });
      }
    });

    return grupos.filter(function (g) { return g.itens.length; });
  }

  /* Remonta o texto com o que sobrou, e RECALCULA a posição de cada
     fonte dentro dele. Sem isso, `planejarQuadros` casaria fonte com
     quadro por posições do texto antigo — e apagar uma afirmação no
     começo empurraria todas as fontes para o quadro errado. */
  function remontar(grupos, fontes) {
    var partes = [];
    var novas = (fontes || []).map(function (f) {
      return { url: f.url, titulo: f.titulo, trecho: f.trecho, inicios: [] };
    });
    var offset = 0;

    grupos.forEach(function (g) {
      var vivos = g.itens.filter(function (i) { return i.fica; });
      if (!vivos.length) return;

      if (g.titulo) {
        var cabecalho = '## ' + g.titulo + '\n\n';
        partes.push(cabecalho);
        offset += cabecalho.length;
      }

      vivos.forEach(function (item) {
        item.fonteIds.forEach(function (id) {
          if (novas[id] && novas[id].inicios.indexOf(offset) === -1) novas[id].inicios.push(offset);
        });
        var bloco = item.texto + '\n\n';
        partes.push(bloco);
        offset += bloco.length;
      });
    });

    /* Fonte que só sustentava afirmação apagada sai da lista: uma
       fonte listada sem nada que ela sustente é procedência de
       coisa nenhuma. */
    var usadas = novas.filter(function (f) { return f.inicios.length; });

    return { texto: partes.join('').trim(), fontes: usadas.length ? usadas : novas };
  }

  /* Põe o compositor do assistente em modo caderno. Quem desenha a
     marca e manda a pergunta é `js/ia.js` — aqui só se diz QUAL
     investigação, porque é esta tela que sabe. */
  function perguntarAoCaderno(consultaId, tarefa) {
    if (!window.IaCaderno || !sessaoId || !consultaId) return false;
    return window.IaCaderno.ligar({
      sessaoId: sessaoId,
      consultaId: consultaId,
      rotulo: (tarefa || '').slice(0, 60),
    });
  }


  /* ============================================================
     O caderno visível — Fase 3b
     ============================================================
     "De onde saiu isso?" é a pergunta que o produto inteiro existe
     para responder, e até agora ela só tinha resposta no momento do
     rascunho — que passa. Aqui a procedência fica, e vira um lugar
     para voltar.

     SEM ROTA NOVA, DE PROPÓSITO
     A tela se monta com o que o cliente já tem: `fontes` e
     `afirmacoes`, que chegam iguais no fim de uma busca e na
     recuperação de uma investigação antiga. Um endpoint novo seria
     uma segunda maneira de perguntar a mesma coisa — e duas maneiras
     divergem no primeiro ajuste.

     SÓ LEITURA, TAMBÉM DE PROPÓSITO
     O plano previa apagar fonte por aqui. Não faz: a curadoria já
     aconteceu no momento certo (o rascunho), e um segundo lugar para
     desfazê-la criaria dois donos da mesma decisão — exatamente o
     que `BOARD-PESQUISA-002` existe para impedir. Pior: uma fonte
     apagada aqui deixaria órfãs afirmações que já estão no quadro, e
     esta tela não tem como consertar o quadro.
     ============================================================ */


  /* ============================================================
     O relatório da investigação — Fase 3c
     ============================================================
     A investigação inteira num arquivo que sai do produto: a tarefa,
     as perguntas que foram escritas, os achados com fonte, **o que
     foi descartado** e a conversa com o caderno. O custo saiu daqui
     em 15/09/2026 — valor mora em Créditos de uso, e só lá.

     POR QUE O DESCARTADO ENTRA
     Porque é isso que separa um relatório de um resumo. Quem lê
     amanhã precisa poder perguntar "o que mais apareceu e não ficou?"
     — e um documento que esconde o que foi jogado fora não é
     auditável, é propaganda do próprio resultado.

     POR QUE MARKDOWN, E NÃO PDF
     Markdown abre em qualquer lugar, cola no Notion e no Docs, entra
     num diff e continua editável. O relatório é material de
     trabalho, não peça final. PDF custaria uma biblioteca no
     navegador para entregar um texto que ninguém pode corrigir.

     POR QUE NO NAVEGADOR, E NÃO NO SERVIDOR
     Tudo que ele precisa já está na tela: o mesmo dado que desenhou
     o rascunho e a lista de fontes. Uma rota que remontasse isso
     seria uma segunda verdade sobre a mesma investigação
     (BOARD-PESQUISA-002), e divergiria no primeiro ajuste.
     ============================================================ */


  /* ============================================================
     As lacunas — Fase 3c, parte 2
     ============================================================
     O que a investigação NÃO respondeu. É a informação que diz se o
     resultado dá para confiar — e ela some justamente quando mais
     importa, porque o quadro nasce bonito com o que deu certo.

     DERIVADA, NÃO PERGUNTADA
     Nenhuma chamada de modelo. As lacunas saem da estrutura que já
     está na mão: uma parte da resposta ou tem afirmação com fonte
     sobrevivendo, ou não tem. Pagar um modelo para dizer o que a
     contagem diz seria cobrar por aritmética.

     POR QUE PELA SEÇÃO, E NÃO PELA PERGUNTA DO PLANO
     Seria mais bonito dizer "a pergunta 3 ficou sem resposta". Mas o
     provedor parafraseia o cabeçalho — no caso real de 14/09/2026 a
     pergunta era *"Quais são as principais empresas de logtech que
     atuam no Brasil atualmente?"* e o cabeçalho virou *"1. Principais
     empresas de logtech que atuam no Brasil"*. Casar os dois exigiria
     comparação difusa, que erra em silêncio. A seção é o que existe
     de verdade no texto, e o cabeçalho dela É a pergunta, na prática.

     O QUE NÃO SE AFIRMA
     Uma seção vazia pode ser busca que não achou nada OU a pessoa que
     apagou tudo. A tela não sabe a diferença e não finge saber: diz
     que ficou sem nada no quadro, e não por quê.
     ============================================================ */

  function lacunasDe(resposta, afirmacoes) {
    var grupos = agruparEmSecoes(resposta, afirmacoes);

    return grupos
      .map(function (g) {
        var vivas = g.itens.filter(function (i) { return i.removida !== true && i.fica !== false; });
        var comFonte = vivas.filter(function (i) { return !i.semFonte; });

        if (comFonte.length) return null;
        return {
          titulo: (g.titulo || '').trim(),
          motivo: vivas.length ? 'sem-fonte' : 'vazia',
        };
      })
      .filter(Boolean)
      /* Seção sem título é o corpo solto de uma resposta sem
         cabeçalho — apontá-la como lacuna diria "esta parte" sem
         dizer qual parte. */
      .filter(function (l) { return l.titulo; });
  }

  /* O motivo vai em CADA linha, e não numa contagem no fim. Os dois
     pedem coisas diferentes de quem lê: texto sem fonte é para
     conferir, parte vazia é para buscar de novo. A primeira versão
     resumia os dois numa frase só — e quando as lacunas eram todas
     do mesmo tipo, o motivo simplesmente sumia. */
  function frasesDasLacunas(lacunas, totalSecoes) {
    if (!lacunas.length) return [];

    var linhas = lacunas.map(function (l) {
      return '· “' + l.titulo + '” — ' +
        (l.motivo === 'sem-fonte'
          ? 'tem texto, mas nenhuma fonte.'
          : 'não ficou nada no quadro.');
    });

    return [
      lacunas.length + ' de ' + totalSecoes + ' parte(s) ficaram sem resposta com fonte:\n' +
        linhas.join('\n'),
    ];
  }

  /* ============================================================
     LACUNA → TAREFA — o último item da Fase 3
     ============================================================
     Até 15/09/2026 a investigação DIZIA o que não respondeu e
     parava aí. A lacuna era um aviso; agora é um começo.

     Três decisões que valem estar escritas:

     1. **O board propõe; quem cria é o modal que já existe.** A
        tentação era um POST daqui — são três campos e a rota
        existe. Mas a criação de tarefa tem dono (`atividade.html`),
        com suas validações, seu papel-pode-escrever e seu ATV-TAR.
        Um segundo caminho divergiria dele no primeiro ajuste, e
        divergência em criação de dado é a pior de todas.

     2. **Nada é gravado até a pessoa salvar** (`ATV-GERAR-001`). A
        proposta chega no modal, editável, com o modal aberto. É o
        mesmo padrão de proposta/confirmação de `IA-ACAO` — e é o
        que separa "a IA sugeriu" de "a IA fez".

     3. **A descrição é uma pergunta** (`ATV-GERAR-005`), porque
        `board.html` vai classificá-la antes de executar e uma
        descrição reflexiva nasceria impossível de investigar. Quando
        a seção é numerada, a pergunta é a que o PLANEJADOR escreveu
        para ela — já é verificável, já foi paga, e é literalmente o
        que ficou sem resposta. O dado já estava aí.

     O motivo da lacuna vai no TÍTULO e no botão, nunca na
     descrição: "sem fonte" e "não ficou nada" pedem trabalhos
     diferentes de quem pega a tarefa, mas a descrição precisa
     continuar sendo uma pergunta limpa para a investigação seguinte
     funcionar. */

  /* Três é o suficiente para agir e pouco o bastante para não virar
     mural. Uma resposta com sete lacunas é um problema de busca, não
     uma lista de tarefas a criar. */
  var MAX_TAREFAS_OFERECIDAS = 3;

  function semNumero(t) {
    return String(t || '').replace(/^\s*\d+\s*[.)\-]\s*/, '').trim();
  }

  /* A seção "## 2. E-commerces com..." corresponde à segunda
     pergunta do plano. Quando a numeração não está lá, não se
     adivinha: cai no texto genérico abaixo. Adivinhar qual pergunta
     é qual poria na tarefa nova uma pergunta que ninguém fez. */
  function perguntaDaSecao(titulo, perguntas) {
    var m = /^\s*(\d+)\s*[.)\-]\s/.exec(String(titulo || ''));
    if (!m) return null;
    var p = (perguntas || [])[Number(m[1]) - 1];
    if (!p) return null;
    var texto = (p && p.pergunta) || p;
    return typeof texto === 'string' && texto.trim() ? texto.trim() : null;
  }

  function propostaDeTarefa(lacuna, perguntas) {
    var nome = semNumero(lacuna && lacuna.titulo);
    var pergunta = perguntaDaSecao(lacuna && lacuna.titulo, perguntas);
    var prefixo = (lacuna && lacuna.motivo) === 'vazia'
      ? 'Buscar de novo: '
      : 'Confirmar com fonte: ';
    return {
      titulo: cortar(prefixo + nome, 260),
      /* 280 é o `maxlength` do campo em atividade.html. Cortar aqui
         evita a proposta chegar maior do que o campo aceita e a
         pessoa descobrir isso ao salvar. */
      descricao: cortar(pergunta || ('O que se sabe, com fonte, sobre ' + nome + '?'), 280),
      tipo: 'pesquisa'
    };
  }

  /* Mesma origem, navegação normal da aplicação: a proposta viaja na
     URL porque é ela que atravessa a troca de página. É texto que a
     própria pessoa vai ler e editar no campo seguinte. */
  function urlNovaTarefa(proposta) {
    var base = window.BoardVoltarUrl ? window.BoardVoltarUrl() : 'atividade.html';
    return base + (base.indexOf('?') >= 0 ? '&' : '?') +
      'nova_tarefa=1' +
      '&titulo=' + encodeURIComponent(proposta.titulo) +
      '&descricao=' + encodeURIComponent(proposta.descricao) +
      '&tipo=' + encodeURIComponent(proposta.tipo);
  }

  function saidasDeLacunas(lacunas, perguntas) {
    return (lacunas || []).slice(0, MAX_TAREFAS_OFERECIDAS).map(function (l, i) {
      return {
        nivel: 'lacuna-' + i,
        rotulo: 'Criar tarefa: ' + semNumero(l.titulo),
        explicacao: l.motivo === 'vazia'
          ? 'Nada ficou no quadro aqui. A tarefa nova busca de novo.'
          : 'Tem texto, mas nenhuma fonte. A tarefa nova procura a fonte.',
        href: urlNovaTarefa(propostaDeTarefa(l, perguntas))
      };
    });
  }

  function linhaFonte(f, i) {
    var nome = (f.titulo || '').trim() || f.url;
    return '[' + (i + 1) + '] ' + nome + ' — ' + f.url;
  }

  function montarRelatorio(d) {
    var fontes = d.fontes || [];
    var afirmacoes = d.afirmacoes || [];
    var ficaram = afirmacoes.filter(function (a) { return a.removida !== true; });
    var sairam = afirmacoes.filter(function (a) { return a.removida === true; });

    function comReferencias(a) {
      var refs = (a.fonteIds || [])
        .filter(function (id) { return fontes[id]; })
        .map(function (id) { return '[' + (id + 1) + ']'; })
        .join('');
      return '- ' + semMarcacao(a.texto) + (refs ? ' ' + refs : a.semFonte ? ' _(sem fonte declarada)_' : '');
    }

    var L = [];
    L.push('# Investigação — ' + (d.tarefa || 'sem título'));
    L.push('');
    L.push('_Gerado em ' + new Date().toLocaleString('pt-BR') + '._');
    L.push('');

    if (d.perguntas && d.perguntas.length) {
      L.push('## O que foi perguntado');
      L.push('');
      d.perguntas.forEach(function (p, i) {
        L.push((i + 1) + '. ' + (p.pergunta || p));
        if (p.porque) L.push('   - _' + p.porque + '_');
      });
      L.push('');
    }

    if (d.jaSabido && d.jaSabido.length) {
      /* O que a empresa já sabia e por isso não foi perguntado. É a
         prova visível de que ler o conhecimento interno economiza
         busca — sem isto o ganho existe e ninguém vê. */
      L.push('## O que a empresa já sabia (não foi perguntado)');
      L.push('');
      d.jaSabido.forEach(function (j) { L.push('- ' + j); });
      L.push('');
    }

    L.push('## Achados');
    L.push('');
    if (!ficaram.length) L.push('_Nada foi mantido desta investigação._');
    ficaram.forEach(function (a) { L.push(comReferencias(a)); });
    L.push('');

    if (sairam.length) {
      /* "Não foi mantido", e não "descartado por quem leu". A seção
         nasceu quando afirmação sem fonte chegava desligada sozinha
         (BOARD-PESQUISA-035): ninguém a tinha tirado, e dizer
         "descartado" atribuiria à pessoa um ato que ela não praticou.
         Desde 15/09/2026 não há mais rascunho e nada chega desligado,
         então esta seção só se enche com investigações curadas quando
         ele existia. O nome continua certo pelo mesmo motivo: o
         relatório não pode inventar decisão de ninguém. */
      L.push('## Apareceu e não foi mantido');
      L.push('');
      L.push('_Veio da busca e não entrou no quadro — por escolha de quem leu, ou por ter chegado sem fonte. Fica registrado para a investigação poder ser conferida._');
      L.push('');
      sairam.forEach(function (a) { L.push(comReferencias(a)); });
      L.push('');
    }

    L.push('## Fontes');
    L.push('');
    if (!fontes.length) L.push('_Nenhuma fonte declarada._');
    fontes.forEach(function (f, i) {
      L.push(linhaFonte(f, i));
      if (f.trecho) L.push('    > ' + f.trecho);
    });
    L.push('');

    if (d.lacunas && d.lacunas.length) {
      /* Entra ANTES do caderno e depois das fontes: quem lê o
         relatório precisa saber o que falta antes de tirar
         conclusão do que tem. */
      L.push('## O que ficou em aberto');
      L.push('');
      d.lacunas.forEach(function (l) {
        L.push(
          '- ' + l.titulo +
          (l.motivo === 'sem-fonte'
            ? ' — tem texto, mas nenhuma afirmação com fonte.'
            : ' — não ficou nada no quadro.')
        );
      });
      L.push('');
    }

    if (d.rodadas && d.rodadas.length) {
      L.push('## Perguntas ao caderno');
      L.push('');
      L.push('_Respondidas apenas com as fontes acima._');
      L.push('');
      d.rodadas.forEach(function (r) {
        L.push('**' + r.pergunta + '**');
        L.push('');
        L.push(r.resposta);
        L.push('');
      });
    }

    L.push('---');
    L.push('');
    /* O custo SAIU daqui em 15/09/2026, por decisão do Ricardo: valor
       aparece num lugar só, em Configurações → Créditos de uso →
       Histórico de uso. O relatório continua dizendo o tamanho do que
       foi apurado — quantas fontes, quantas afirmações, quantas não
       ficaram —, que é o que se audita aqui. */
    L.push(
      fontes.length + ' fonte(s) lida(s)  ·  ' +
      afirmacoes.length + ' afirmação(ões), ' + sairam.length + ' não mantida(s).'
    );

    return L.join('\n');
  }

  /* O nome do arquivo sai da tarefa: uma pasta com cinco
     "investigacao.md" não serve para nada. */
  function nomeDoArquivo(tarefa) {
    var base = String(tarefa || 'investigacao')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    var hoje = new Date().toISOString().slice(0, 10);
    return (base || 'investigacao') + '-' + hoje + '.md';
  }

  function baixarRelatorio(d) {
    var texto = montarRelatorio(d);
    var nome = nomeDoArquivo(d.tarefa);

    try {
      var blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* Solto depois de um tiquinho: revogar na mesma volta do laço
         cancela o download em alguns navegadores. */
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return nome;
    } catch (_) {
      return null;
    }
  }

  /* O RELATÓRIO SAIU DA NARRAÇÃO em 16/09/2026, por decisão do
     Ricardo: virou o botão "Download" no painel da tarefa, à esquerda,
     junto das outras ações sobre a tarefa.

     Por que a mudança é mais do que de lugar: a narração é um relato
     do que aconteceu, e rola. Uma ação que a pessoa vai querer refazer
     dias depois não podia morar num histórico que ela precisa rolar
     para reencontrar. O painel não rola.

     O que a tela de fora precisa saber: SE existe relatório. Enquanto
     não existe, o botão fica escondido — botão que não faz nada é pior
     que botão nenhum, que é o critério que a própria board.html já
     aplicou ao tirar "Solicitar ajuda do Designer". */
  var relatorioAtual = null;

  function publicarRelatorio(dados) {
    relatorioAtual = dados || null;
    try {
      document.dispatchEvent(new CustomEvent('pesquisa:relatorio', {
        detail: { disponivel: !!relatorioAtual },
      }));
    } catch (_) {
      /* Navegador sem CustomEvent construível: o botão simplesmente
         não aparece. Perder o atalho é melhor do que quebrar a
         entrega do quadro, que é o que importa aqui. */
    }
  }

  var fontesAberto = null;

  /* Casa fonte com afirmação pelos índices que o servidor mandou.
     A afirmação sabe de quais fontes ela depende; a pergunta desta
     tela é a inversa, e ela se responde virando a lista do avesso. */
  function porFonte(fontes, afirmacoes) {
    var mapa = (fontes || []).map(function (f) {
      return { fonte: f, itens: [] };
    });
    var semFonte = [];

    (afirmacoes || []).forEach(function (a) {
      var ids = a.fonteIds || [];
      if (!ids.length) {
        semFonte.push(a);
        return;
      }
      ids.forEach(function (id, k) {
        if (!mapa[id]) return;
        mapa[id].itens.push({
          texto: a.texto,
          /* A decisão da pessoa viaja junto: uma fonte cujas frases
             foram todas apagadas continua tendo sido lida e paga, e
             ver isso é parte de entender o que a investigação
             custou. */
          removida: a.removida === true,
          trecho: (a.trechos || [])[k] || '',
        });
      });
    });

    return { mapa: mapa, semFonte: semFonte };
  }

  function abrirFontes(dados, idN) {
    var fontes = dados.fontes || [];
    if (!fontes.length && !(dados.afirmacoes || []).length) return false;

    if (fontesAberto) fontesAberto.remove();

    var agrupado = porFonte(fontes, dados.afirmacoes);

    /* O CABEÇALHO DO SISTEMA (16/09/2026). Este dialog usava a casca
       `.modal` e pulava tudo que vem com ela no styleguide: o selo
       amarelo ao lado do título, o X no canto, a régua embaixo. Ficava
       uma caixa branca com um texto em cima — correta e anônima.

       O selo é onde a marca aparece: círculo em `--fill-primary`, o
       mesmo amarelo do rail e do painel do assistente. */
    var dlg = elemento('dialog', 'modal fontes-caderno');

    var cab = elemento('div', 'modal-header');
    var titulo = elemento('h2', 'modal-title');
    var selo = elemento('span', 'modal-title-icon');
    selo.setAttribute('aria-hidden', 'true');
    selo.innerHTML =
      '<svg viewBox="0 0 24 24">' +
      '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/>' +
      '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' +
      '</svg>';
    titulo.appendChild(selo);
    titulo.appendChild(elemento('span', null, 'As fontes desta investigação'));
    cab.appendChild(titulo);

    var fecharX = elemento('button', 'modal-close');
    fecharX.type = 'button';
    fecharX.setAttribute('aria-label', 'Fechar');
    fecharX.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    cab.appendChild(fecharX);
    dlg.appendChild(cab);

    dlg.appendChild(elemento('div', 'modal-rule'));

    dlg.appendChild(elemento('p', 'caderno-tarefa', dados.tarefa || ''));

    var usadas = agrupado.mapa.filter(function (g) {
      return g.itens.some(function (i) { return !i.removida; });
    }).length;
    dlg.appendChild(
      elemento(
        'p',
        'caderno-resumo',
        fontes.length + ' fonte(s) lida(s) · ' + usadas + ' sustenta(m) o que ficou no quadro'
      )
    );

    var lista = elemento('div', 'caderno-lista');
    dlg.appendChild(lista);

    /* Ordem: primeiro as que sustentam alguma coisa que ficou. Uma
       lista que começa pelo que não serviu esconde o que serviu. */
    var ordenadas = agrupado.mapa.slice().sort(function (a, b) {
      var va = a.itens.some(function (i) { return !i.removida; }) ? 0 : 1;
      var vb = b.itens.some(function (i) { return !i.removida; }) ? 0 : 1;
      return va - vb;
    });

    ordenadas.forEach(function (g) {
      var viva = g.itens.some(function (i) { return !i.removida; });
      var bloco = elemento('div', 'fonte-bloco' + (viva ? '' : ' fonte-bloco--orfa'));

      var cabecalho = elemento('p', 'fonte-titulo');
      /* O link do sistema, sublinhado — é o mesmo desenho que a
         conversa passou a usar. Aqui ele leva a OUTRA tela, então é um
         `<a href>` de verdade. */
      var a = elemento('a', 'link link--sublinhado', g.fonte.titulo || g.fonte.url);
      a.href = g.fonte.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      cabecalho.appendChild(a);
      bloco.appendChild(cabecalho);

      if (g.fonte.url) bloco.appendChild(elemento('p', 'fonte-url', g.fonte.url));

      if (g.fonte.trecho) {
        bloco.appendChild(elemento('p', 'fonte-trecho', '“' + g.fonte.trecho + '”'));
      }

      if (!g.itens.length) {
        /* Lida e citada por nada. Acontece, e esconder seria fingir
           que toda página lida rendeu alguma coisa. */
        bloco.appendChild(
          elemento('p', 'fonte-nota', 'Lida, mas nenhuma afirmação citou esta fonte.')
        );
      } else {
        bloco.appendChild(
          elemento('p', 'fonte-nota', g.itens.length + ' afirmação(ões) apoiada(s) nesta fonte:')
        );
        var ul = elemento('ul', 'fonte-itens');
        g.itens.forEach(function (i) {
          var li = elemento('li', i.removida ? 'fonte-item fonte-item--fora' : 'fonte-item');
          li.appendChild(elemento('span', null, semMarcacao(i.texto)));
          if (i.removida) {
            li.appendChild(elemento('span', 'fonte-marca', ' — você tirou esta do quadro'));
          }
          ul.appendChild(li);
        });
        bloco.appendChild(ul);
      }

      lista.appendChild(bloco);
    });

    /* PES-006 até o fim: o que não tem procedência é contado aqui
       também, e não some por não caber em nenhuma fonte. */
    if (agrupado.semFonte.length) {
      var bloco2 = elemento('div', 'fonte-bloco fonte-bloco--sem');
      bloco2.appendChild(elemento('p', 'fonte-titulo', 'Sem fonte declarada'));
      bloco2.appendChild(
        elemento(
          'p',
          'fonte-nota',
          agrupado.semFonte.length + ' afirmação(ões) que o provedor não prendeu a nenhuma página.'
        )
      );
      var ul2 = elemento('ul', 'fonte-itens');
      agrupado.semFonte.forEach(function (i) {
        var li = elemento('li', i.removida === true ? 'fonte-item fonte-item--fora' : 'fonte-item');
        li.appendChild(elemento('span', null, semMarcacao(i.texto)));
        if (i.removida === true) {
          li.appendChild(elemento('span', 'fonte-marca', ' — você tirou esta do quadro'));
        }
        ul2.appendChild(li);
      });
      bloco2.appendChild(ul2);
      lista.appendChild(bloco2);
    }

    var rodape = elemento('div', 'modal-footer');
    /* `btn--ghost`, e não `btn` pelado: sem variante o botão herda só
       a base — sem fundo, sem borda — e vira um texto em negrito no
       canto, que foi como este "Fechar" viveu até 16/09/2026. É a
       mesma variante que o modal do styleguide usa na ação de saída. */
    var fechar = elemento('button', 'btn btn--ghost', 'Fechar');
    fechar.type = 'button';
    rodape.appendChild(fechar);
    dlg.appendChild(rodape);

    function sair() {
      try { dlg.close(); } catch (_) { /* já fechado */ }
      dlg.remove();
      if (fontesAberto === dlg) fontesAberto = null;
    }

    fechar.addEventListener('click', sair);
    fecharX.addEventListener('click', sair);
    dlg.addEventListener('cancel', function (ev) {
      ev.preventDefault();
      sair();
    });

    document.body.appendChild(dlg);
    fontesAberto = dlg;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    return true;
  }

  var VER_FONTES = {
    nivel: 'fontes',
    rotulo: 'Ver as fontes',
    explicacao: 'De onde saiu cada afirmação. Não custa nada.',
  };

  /* ---------- A entrega ----------
     Extraído de `investigar()` quando a rota em etapas chegou: os
     dois caminhos — a investigação com SSE e a busca direta com
     nível confirmado — terminam exatamente igual, montando quadros
     a partir da mesma resposta. Duas cópias disto divergiriam no
     primeiro ajuste, que é o defeito que este arquivo já teve entre
     "Virar card" e o botão "Pesquisar". */
  function entregarResultado(r, texto, idN) {
    var N = narracao();
    function passo(t) { N.passo(idN, t); }

      if (!r) return false;

      /* PES-008: "não achei" e "falhou" são coisas diferentes. Um
         disfarce aqui faria o concorrente parecer inexistente
         quando a busca é que caiu. */
      if (r.resultado === 'falhou') {
        N.fechar(idN, 'falha', 'A busca não completou. Nada foi cobrado.');
        avisarNaTela('A busca nao completou. Nada foi cobrado — tente de novo.');
        return false;
      }
      if (r.resultado === 'vazio') {
        N.fechar(idN, 'ok', 'Procurei e não encontrei nada sobre isso.');
        avisarNaTela('Procurei e nao encontrei nada sobre isso.');
        return false;
      }

      var fontes = (r.fontes || []).filter(function (f) {
        return f && (f.url || f.titulo);
      });

      passo(
        fontes.length
          ? 'Busquei — ' + fontes.length + (fontes.length === 1 ? ' fonte.' : ' fontes.')
          : 'Busquei — sem fonte declarada.'
      );

      console.log('[Pesquisa] resposta bruta do provedor:\n' + (r.resposta || '(vazia)'));

      var planos = planejarQuadros(r.resposta || '', fontes, texto);

      var cardsLugares = (r.lugares || []).map(function (l) {
        return {
          titulo: cortar(l.nome || 'Sem nome', MAX_TITULO),
          descricao: cortar(
            [l.endereco, l.avaliacao ? 'nota ' + l.avaliacao : '']
              .filter(Boolean)
              .join(' — '),
            MAX_DESCRICAO
          ),
        };
      });
      if (cardsLugares.length) {
        planos.push({ tipo: 'postits', titulo: 'Lugares', itens: cardsLugares });
      }

      if (!planos.length) {
        N.fechar(idN, 'ok', 'A busca voltou sem nada que desse um quadro.');
        avisarNaTela('A busca voltou sem nada que desse um quadro.');
        return false;
      }

      if (typeof window.criarQuadroResultado !== 'function' ||
          typeof window.criarQuadroDocumento !== 'function') {
        N.fechar(idN, 'falha', 'Não consegui montar o quadro com o resultado.');
        avisarNaTela('Nao consegui montar o quadro com o resultado.');
        return false;
      }

      /* Um quadro por assunto. O primeiro `null` diz que a tarefa
         está concluída (BOARD-LEITURA-003). */
      var criados = 0;
      for (var i = 0; i < planos.length; i++) {
        var plano = planos[i];
        var quadro = plano.tipo === 'documento'
          ? window.criarQuadroDocumento(plano.titulo, plano.texto, plano.fontes)
          : window.criarQuadroResultado(plano.titulo, plano.itens);
        if (!quadro) {
          if (!criados) {
            N.fechar(idN, 'parada', 'Tarefa concluída não recebe resultado novo. Reabra para pesquisar.');
            avisarNaTela('Tarefa concluida nao recebe resultado novo. Reabra para pesquisar.');
            return false;
          }
          break;
        }
        criados++;
      }

      passo('Montei ' + criados + (criados === 1 ? ' quadro no board.' : ' quadros no board.'));

      /* MONTAR NÃO É GRAVAR, e até 16/09/2026 a narração tratava as
         duas como a mesma coisa: dizia "Montei 3 quadros no board" e
         disparava o autosave sem olhar no que dava. Se o PUT falhasse
         — 400 do servidor, sessão expirada, rede morta —, o board
         ficava vazio na volta e a única coisa que a pessoa tinha lido
         era uma confirmação.

         O passo de cima continua: os quadros ESTÃO na tela, e isso é
         verdade. O que se acrescenta é a segunda verdade, quando ela
         for má. `dispararAutosave` devolve `undefined` quando outro
         autosave já está no ar — aí o pedido fica na fila daquele
         (BOARD-SALVA-002) e não há falha a relatar. */
      var gravando = window.dispararAutosave ? window.dispararAutosave() : null;
      if (gravando && gravando.then) {
        gravando.then(function (gravou) {
          if (gravou === false) {
            N.passo(idN, 'Mas NÃO consegui gravar o quadro. Ele está na tela e '
              + 'some se você sair — tente de novo, ou recarregue a página.');
          }
        });
      }

      /* Fase 3a: a investigação não acaba no quadro. O que foi
         coletado continua ali para ser perguntado — e o botão diz
         isso, em vez de a pessoa ter de descobrir que dá. */
      var consultaId = r.consulta_id || null;
      var caderno = r.caderno || { fontes: r.fontes || [], afirmacoes: r.afirmacoes || [], resposta: r.resposta };

      /* O texto em que as posições das afirmações fazem sentido. NÃO
         é `r.resposta` quando veio do rascunho: lá ele já é o
         remontado. */
      var respostaOriginal = caderno.resposta || r.resposta || '';

      /* As lacunas (Fase 3c). Ditas depois do quadro, porque é aí que
         a pessoa está decidindo se confia no que acabou de receber —
         e o quadro nasce bonito com o que deu certo, escondendo o que
         não deu. Silêncio quando não há lacuna: dizer "0 lacunas"
         transformaria a boa notícia em ruído. */
      var lacunas = lacunasDe(respostaOriginal, caderno.afirmacoes);
      frasesDasLacunas(lacunas, secoesDaResposta(respostaOriginal).length).forEach(passo);

      var temCaderno = caderno.fontes.length || caderno.afirmacoes.length;

      var saidas = [];
      if (temCaderno) saidas.push(VER_FONTES);
      if (consultaId && window.IaCaderno) saidas.push(PERGUNTAR);

      /* As lacunas viram oferta de tarefa DEPOIS das ações sobre o
         que se tem. A ordem é a do trabalho: primeiro conferir o que
         veio, depois decidir o que falta. Sem lacuna, nenhum botão —
         mesma razão do silêncio em `frasesDasLacunas`. */
      var deLacunas = saidasDeLacunas(lacunas, r.perguntas || []);
      deLacunas.forEach(function (s) { saidas.push(s); });

      /* O relatório é montado NA HORA do clique, e não aqui: entre
         entregar o resultado e baixar o arquivo a pessoa pode ter
         perguntado ao caderno, e essas perguntas fazem parte do que
         a investigação apurou. */
      function dadosDoRelatorio() {
        return {
          tarefa: texto,
          fontes: caderno.fontes,
          afirmacoes: caderno.afirmacoes,
          lacunas: lacunasDe(respostaOriginal, caderno.afirmacoes),
          perguntas: r.perguntas || [],
          jaSabido: r.ja_sabido || [],
          rodadas: window.IaCaderno ? window.IaCaderno.rodadas() : [],
        };
      }

      /* A FUNÇÃO, e não o resultado dela. O relatório continua sendo
         montado na hora do clique: entre entregar o quadro e baixar o
         arquivo a pessoa pode ter perguntado ao caderno, e essas
         perguntas fazem parte do que a investigação apurou. Guardar o
         texto pronto aqui congelaria o relatório no instante errado. */
      if (temCaderno) publicarRelatorio(dadosDoRelatorio);

      /* Nenhuma das duas ações fecha o assunto: ver as fontes e
         perguntar são coisas que se fazem mais de uma vez. Por isso a
         narração é refechada com os MESMOS botões depois de cada
         escolha — sem isso, ver as fontes uma vez custaria a
         possibilidade de vê-las de novo. */
      function escolher(nivel, id) {
        if (nivel === 'fontes') {
          abrirFontes({ tarefa: texto, fontes: caderno.fontes, afirmacoes: caderno.afirmacoes }, id);
        } else if (perguntarAoCaderno(consultaId, texto)) {
          narracao().passo(id, 'Pergunte no campo abaixo — respondo só com estas fontes.');
        }
        narracao().fechar(id, 'ok', 'Pronto.', saidas, escolher);
      }

      if (saidas.length) {
        N.fechar(idN, 'ok', 'Pronto.', saidas, escolher);
      } else {
        N.fechar(idN, 'ok', 'Pronto.');
      }
      avisarNaTela(criados > 1
        ? 'Pesquisa concluida — ' + criados + ' quadros no board.'
        : 'Pesquisa concluida — resultado no quadro.');
      return true;
  }

  function investigar(texto, nivelConfirmado, idN) {
    var N = narracao();

    function passo(t) { N.passo(idN, t); }

    /* Fecha a narração oferecendo caminho. `aoEscolher` reabre a
       MESMA entrada e roda de novo — a pessoa acompanha uma
       investigação, não duas. */
    function parar(mensagem, saidas) {
      var lista = saidas || [];
      N.fechar(idN, lista.length ? 'parada' : 'falha', mensagem, lista, function (nivel, id) {
        var escolhida = null;
        for (var i = 0; i < lista.length; i++) {
          if (lista[i].nivel === nivel) escolhida = lista[i];
        }
        N.retomar(id, 'Você escolheu: ' + (escolhida ? escolhida.rotulo : nivel) + '.');
        investigar(texto, nivel, id);
      });
      /* Sem saída nenhuma, o toast ainda vale: pode não haver painel
         aberto, e uma recusa sem eco em lugar nenhum é pior do que
         uma repetida. */
      if (!lista.length) avisarNaTela(mensagem);
      return false;
    }

    trabalhando(true, nivelConfirmado ? 'Pesquisando...' : 'Analisando...');

    return garantirSessao()
      .then(function (id) {
        /* Passo 1: planejar. Não gasta nada — e por isso a segunda
           tentativa o pula sem culpa. */
        if (nivelConfirmado) return null;
        return chamar('/pesquisa/sessoes/' + id + '/planejar', {
          metodo: 'POST',
          corpo: { pergunta: texto },
        });
      })
      .then(function (plano) {
        if (!plano) return true; /* nível já confirmado por uma pessoa */

        /* PES-004: referência sem dono. Aqui não há saída possível —
           ninguém além de quem escreveu sabe a quem "ele" se refere,
           e chutar traria resposta sobre qualquer um. */
        if (plano.nao_resolvidas && plano.nao_resolvidas.length) {
          return parar(
            'Não sei a quem "' + plano.nao_resolvidas[0] + '" se refere. ' +
            'Escreva o nome da empresa na descrição da tarefa.',
            []
          );
        }

        /* Primeiro passo narrado, e ele é fato consumado: a leitura
           já aconteceu. Dizer como a tarefa foi lida é o que torna a
           recusa seguinte compreensível — e o botão ao lado, uma
           oferta em vez de teimosia. */
        passo('Li a tarefa como "' + (ROTULO_NIVEL[plano.nivel] || plano.nivel) + '".');

        if (!plano.decidido) {
          return parar(
            'Essa tarefa dá para ler de mais de um jeito, e cada um custa diferente.',
            saidasDoPlano(plano)
          );
        }

        if (!plano.executavel) {
          return parar(impedimentoDoPlano(plano), saidasDoPlano(plano));
        }

        return true;
      })
      .then(function (segue) {
        if (segue !== true) return false;

        /* Passo 2: executar. Daqui para baixo, gasta.

           Nenhum passo é narrado enquanto a busca corre, e isso é de
           propósito: a rota é uma chamada só, então não há etapa
           concluída para relatar. O tempo correndo é o que há de
           verdadeiro para mostrar (IA-CONV-NARRA-005/006). As etapas
           de verdade chegam na Fase 1, com SSE. */
        trabalhando(true, 'Pesquisando...');
        return chamar('/pesquisa/sessoes/' + sessaoId + '/consultar', {
          metodo: 'POST',
          corpo: nivelConfirmado
            ? { pergunta: texto, nivelConfirmado: nivelConfirmado }
            : { pergunta: texto },
        });
      })
      .then(function (r) {
        return entregarResultado(r, texto, idN);
      })
      .catch(function (e) {
        /* O 409 chega aqui: a heurística não decidiu e ninguém
           confirmou. Ele existia no servidor desde 02/09 sem
           ninguém para atendê-lo — o cliente parava antes, em
           `planejar`. Agora as opções viram botões, e o servidor
           manda as mesmas saídas de `planejar`, sem a tela ter que
           reimplementar a decisão de custo.

           501 e 503 também trazem `saidas` desde a Fase 0. */
        var dados = (e && e.dados) || {};
        if (dados.saidas && dados.saidas.length) {
          return parar(mensagemDeErro(e), dados.saidas);
        }
        return parar(mensagemDeErro(e), []);
      })
      .then(function (ok) {
        trabalhando(false);
        return !!ok;
      });
  }

  window.PesquisaFormato = {
    semMarcacao: semMarcacao,
    cardsDaResposta: cardsDaResposta,
    CONVITE: CONVITE
  };

  window.PesquisaPainel = {
    abrir: function (perguntaInicial) {
      mostrarAba('pesquisa');
      if (perguntaInicial && !entrada.value.trim()) {
        entrada.value = perguntaInicial;
      }
      entrada.focus();
    },

    /* ---------- Busca sem painel ----------
       O botao "Pesquisar" do cabecalho da tarefa nao abre mais o
       painel lateral: ele roda a busca ali mesmo e devolve o
       resultado como um quadro novo no board.

       Isto substitui a espera de PES-007 (deixar a pessoa revisar a
       pergunta antes de gastar) por um gesto so. A pergunta e a
       descricao da tarefa, que a pessoa mesma escreveu — o consenso
       existe, so nao passa mais por uma segunda tela.

       Nunca rejeita: devolve `true` se virou quadro e `false` em
       qualquer outro caso, sempre depois de avisar na tela. Quem
       chama so precisa saber quando parar o indicador. */
    pesquisarNoQuadro: function (pergunta) {
      var texto = (pergunta || '').trim();

      /* Validações de porta: acontecem ANTES de a narração abrir, e
         por isso continuam no toast. Abrir uma entrada no assistente
         só para dizer "esta tarefa não tem descrição" deixaria um
         registro de investigação que nunca existiu. */
      if (!texto) {
        avisarNaTela('Esta tarefa nao tem descricao para pesquisar.');
        return Promise.resolve(false);
      }
      if (ocupado) return Promise.resolve(false);
      if (!tarefaId) {
        avisarNaTela('Abra a tarefa pela tela de atividades para pesquisar.');
        return Promise.resolve(false);
      }

      /* Daqui para frente a investigação se explica no assistente
         (IA-CONV-NARRA-001). Os ~10 s de "Pesquisando..." parado no
         rodapé do compositor eram indistinguíveis de travamento —
         e quem recarregava a página perdia a consulta já paga.

         Desde a Fase 1a a estrada é a rota em etapas: ela lê o que a
         empresa já sabe, planeja com um modelo em vez de uma lista
         de palavras, e conta cada etapa conforme acontece. */
      var idN = narracao().abrir('Investigando', texto);
      return investigarEmEtapas(texto, idN);
    },

    /* O que o botão "Download" do painel da tarefa chama. Devolve o
       nome do arquivo, ou `null` se o navegador recusou o Blob — quem
       chama decide o que dizer, porque quem chama é que sabe onde a
       mensagem cabe. */
    baixarRelatorio: function () {
      if (!relatorioAtual) return null;
      return baixarRelatorio(relatorioAtual());
    },

    /* Para a tela saber se mostra o botão sem ter de ouvir o evento —
       necessário porque board.html pode se ligar depois de a
       investigação já ter sido recuperada. */
    temRelatorio: function () {
      return !!relatorioAtual;
    },

    /* Remonta no assistente a investigação anterior desta tarefa, A
       PEDIDO. Abrir a tarefa não faz mais isso sozinho (16/09/2026) —
       os quadros já estão no board e o resumo era eco. Continua sendo
       o que "Ver a resposta que já existe" chama, e é a porta para
       quem precisar remontar o resultado guardado. */
    verInvestigacaoAnterior: function () {
      return recuperarInvestigacao(null, 0, true);
    },
  };

  /* Ao abrir a página: reencontra a investigação anterior, se
     houver. Vai para o fim da fila de eventos para não disputar a
     carga inicial do board — nada aqui é urgente, e a narração
     aparecer meio segundo depois é melhor do que a tela demorar
     meio segundo a mais para existir. */
  setTimeout(procurarInvestigacaoAnterior, 0);

  botao.addEventListener('click', perguntar);
  entrada.addEventListener('keydown', function (e) {
    /* Enter envia, Shift+Enter quebra linha — mesma convenção do
       composer do assistente. */
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      perguntar();
    }
  });
})();
