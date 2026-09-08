/* ============================================================
   ORQUESTRADOR DE ATIVIDADES — Gateway
   ============================================================

   Ponte entre os gatilhos da Plataforma e a Skill
   Skills/orquestrador-atividades.skill.

   Gatilho 1 — "Gerar com ajuda da IA" (atividade.html)
     A pessoa não digita nada. Clica com o formulário vazio, e o
     orquestrador propõe qual deveria ser a próxima tarefa da
     atividade, preenchendo Título, Descrição e Tipo. O modal
     continua aberto: a proposta é editável e nada é gravado até
     que a pessoa clique em Salvar.

   Gatilho 2 — "Pesquisar" (board.html)
     Apenas registra o encaminhamento; não intercepta a busca real.
   ============================================================ */

(function () {
  'use strict';

  /* ------------------------------------------------------------
     Toast — cada tela batizou o seu com um nome diferente.
     atividade.html expõe `mostrarMensagemAtividade(msg)`; outras
     telas expõem `mostrarMensagem(msg, tipo)`. Chamar o nome errado
     não quebra nada visivelmente: o aviso simplesmente some, e some
     junto com a explicação do que deu errado.
     ------------------------------------------------------------ */
  function toast(msg, tipo) {
    if (typeof window.mostrarMensagemAtividade === 'function') {
      window.mostrarMensagemAtividade(msg);
      return;
    }
    if (typeof window.mostrarMensagem === 'function') {
      window.mostrarMensagem(msg, tipo);
      return;
    }
    console.log('[Orquestrador]', msg);
  }

  /* ============================================================
     Contexto da atividade
     ============================================================ */

  function idsDaUrl() {
    var q = new URLSearchParams(location.search);
    return {
      empresa: q.get('empresa'),
      projeto: q.get('projeto'),
      ideia: q.get('ideia'),
      tarefa: q.get('tarefa')
    };
  }

  /* As tarefas já existentes, lidas do próprio quadro. A estrutura
     vem de cardHTML() em js/atividade.js:
     <ul class="task-list"> <li class="task" data-id data-tipo>
       … <h3 class="task-title"> <p class="task-desc"> … */
  function tarefasNaTela() {
    var itens = [];
    var cards = document.querySelectorAll('.task-list .task:not(.esq-tarefa)');
    Array.prototype.forEach.call(cards, function (card) {
      var titulo = card.querySelector('.task-title');
      if (!titulo) return;
      var desc = card.querySelector('.task-desc');
      var status = card.querySelector('.task-status');
      itens.push({
        id: card.dataset.id || null,
        tipo: card.dataset.tipo || null,
        nome: titulo.textContent.trim(),
        descricao: desc ? desc.textContent.trim() : '',
        /* "Resultado da tarefa" ainda não existe como campo na
           plataforma. Enquanto não existir, o orquestrador sabe que
           uma tarefa foi concluída, mas não o que ela descobriu — e
           é a descoberta que deveria guiar a próxima proposta. */
        resultado: null,
        concluida: !!(status && status.className.indexOf('task-status--done') !== -1)
      });
    });
    return itens;
  }

  function montarContexto() {
    var ids = idsDaUrl();
    var tituloEl = document.querySelector('.page-title');

    return {
      empresa: window.EmpresaAtual || (ids.empresa ? { id: ids.empresa } : null),
      projeto: window.ProjetoAtual || (ids.projeto ? { id: ids.projeto } : null),
      ideia: window.IdeiaAtual || (ids.ideia ? { id: ids.ideia } : null),
      atividade: {
        /* A atividade É a idéia nesta tela: atividade.html abre pelo
           id da idéia. */
        id: ids.ideia,
        nome: (window.IdeiaAtual && window.IdeiaAtual.titulo) ||
              (tituloEl ? tituloEl.textContent.trim() : ''),
        tarefa_aberta: ids.tarefa || null
      },
      tarefas_anteriores: tarefasNaTela(),
      /* Previsto em "Contexto obrigatório": é este campo que faz o
         UX Research entregar síntese de achados em vez de plano de
         pesquisa. A plataforma ainda não tem onde anexar material
         bruto, então hoje vai sempre vazio. */
      material_bruto: []
    };
  }

  /* ============================================================
     Proposta de próxima tarefa (Gatilho 1)
     ============================================================
     Implementa "Propondo a próxima tarefa" da Skill. As regras aqui
     são a leitura mais grosseira possível daquela seção — só a forma
     da atividade, sem entender uma linha do que ela investiga.

     É provisório e assumidamente burro: a proposta boa depende de ler
     o problema, as hipóteses e o que cada tarefa concluída descobriu,
     e isso exige a rota de orquestração no servidor. O que este bloco
     entrega é a mecânica (campos preenchidos, tipo coerente, sem
     repetir o que já existe) para a tela poder ser exercitada
     enquanto o raciocínio de verdade não chega.
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     Trava: a proposta de pesquisa precisa ser executável
     ------------------------------------------------------------
     Espelho da lista FATO de api/src/pesquisa/roteador.ts. É ela que
     decide se board.html classifica a descrição como 'busca' (executa)
     ou 'conhecimento' (recusa) — sem nenhuma destas palavras, a tarefa
     nasce impossível de pesquisar.

     Duplicar um regex do servidor é dívida assumida. A alternativa era
     pior: sem trava, qualquer reescrita das descrições volta a produzir
     tarefa impesquisável, e o defeito só aparece lá na frente, quando
     alguém abre o quadro e recebe uma recusa que parece falha da
     plataforma. Se a lista mudar no servidor, esta cópia para de
     acusar — por isso o aviso abaixo aponta o arquivo de origem. */
  var FATO_BUSCA = new RegExp(
    '\\b(quantas|quantos|quanto|qual|quais|onde|quando|em (que|qual)|' +
    'reclamação|reclamacao|reclamações|reclamacoes|' +
    'avaliação|avaliacao|avaliações|avaliacoes|' +
    'preço|preco|preços|precos|faturamento|fundada|fundado|cnpj)\\b', 'i');

  /* Espelho de PRONOME_POSSESSIVO/PRONOME_SUJEITO em roteador.ts. O
     servidor recusa a consulta inteira quando a pergunta tem pronome
     sem antecedente — mandar "sem depender do resultado dela" ao
     provedor traria resposta sobre qualquer um, que é o modo de falha
     que PES-004 existe para impedir. */
  var PRONOME_SOLTO = /\b(dele|dela|deles|delas|ele|ela|eles|elas)\b/i;

  function conferirExecutavel(p) {
    if (p.tipo !== 'pesquisa') return p;

    var pron = p.descricao.match(PRONOME_SOLTO);
    if (pron) {
      console.warn(
        '[Orquestrador] a descrição proposta usa o pronome "' + pron[0] + '" sem antecedente. ' +
        'board.html recusa a busca inteira (PES-004): o provedor não tem como saber a quem ' +
        'o pronome se refere. Escreva o nome por extenso.\n  Descrição: ' + p.descricao
      );
    }

    if (FATO_BUSCA.test(p.descricao)) return p;
    console.warn(
      '[Orquestrador] a descrição proposta não tem nenhum sinal de fato verificável, ' +
      'então board.html a classificaria como "conhecimento" e recusaria a busca. ' +
      'Reescreva-a como pergunta (quantas / quais / onde / quando / preço / faturamento…) ' +
      'ou confira se a lista FATO mudou em api/src/pesquisa/roteador.ts.\n  Descrição: ' +
      p.descricao
    );
    return p;
  }

  /* Os campos têm limite no formulário (60 e 280). Estourar não dá
     erro visível: o maxlength corta calado, e a proposta chega
     truncada no meio de uma frase. */
  function curto(s, n) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:.-]+$/, '') + '…';
  }

  /* ------------------------------------------------------------
     Os achados das tarefas concluidas
     ------------------------------------------------------------
     Uma proposta so e "a proxima" se souber o que as anteriores ja
     responderam. Isso esta gravado e ninguem lia: cada pesquisa deixa
     um quadro "Perguntas em aberto" — literalmente a lista do que
     ficou sem resposta — alem dos quadros-documento com o que foi
     achado. A proposta era decidida so por CONTAGEM de tarefas, e por
     isso voltava igual assim que a atividade entrava num estado que
     nao mudava mais (tudo concluido, por exemplo).
     ------------------------------------------------------------ */

  var TITULO_PERGUNTAS = /perguntas?\s+em\s+aberto/i;

  function lerQuadrosDaTarefa(ids, tarefaId) {
    var caminho = '/empresas/'  + encodeURIComponent(ids.empresa) +
                  '/projetos/'  + encodeURIComponent(ids.projeto) +
                  '/ideias/'    + encodeURIComponent(ids.ideia)   +
                  '/tarefas/'   + encodeURIComponent(tarefaId)    + '/quadros';

    return window.API.chamar(caminho)
      .catch(function (e) {
        /* Mesma renovacao silenciosa de board.js e pesquisa.js: um 401
           aqui costuma ser token vencido, nao pessoa deslogada. */
        if (e && e.status === 401) {
          return window.API.chamar('/auth/sessao').then(function () {
            return window.API.chamar(caminho);
          });
        }
        throw e;
      })
      .then(
        function (r) { return (r && r.quadros) || []; },
        function (e) {
          /* Um quadro que nao carrega nao pode derrubar a sugestao
             inteira — a heuristica continua valendo como piso. */
          console.warn('[Orquestrador] nao li os quadros da tarefa ' + tarefaId, e);
          return [];
        }
      );
  }

  function colherAchados(quadros) {
    var perguntas = [], assuntos = [];

    (quadros || []).forEach(function (q) {
      var registros = [];
      (q.colunas || []).forEach(function (c) {
        (c.registros || []).forEach(function (r) { registros.push(r); });
      });

      if (TITULO_PERGUNTAS.test(q.titulo || '')) {
        registros.forEach(function (r) {
          var t = (r.titulo || '').trim();
          if (t) perguntas.push(t);
        });
        return;
      }

      if (q.titulo) assuntos.push(q.titulo.trim());
    });

    return { perguntas: perguntas, assuntos: assuntos, empresas: [] };
  }

  /* ------------------------------------------------------------
     As empresas que este projeto ja nomeou
     ------------------------------------------------------------
     Elas vivem em `pesquisa_entidades`: toda vez que uma busca resolve
     "concorrente 01" para um nome real, o nome fica gravado na sessao.
     Sao os unicos nomes que a plataforma sabe COM CERTEZA que
     pertencem a este projeto — valem mais que qualquer palpite sobre
     quem sao os concorrentes.

     O alcance e o PROJETO, nao a atividade: quem levantou concorrentes
     numa atividade "Concorrentes da iHouseLog" espera que a proxima
     atividade ja os conheca. Sem isso, cada atividade recomecaria do
     zero perguntando quem sao. */
  function empresasDoProjeto(ids) {
    if (!ids.projeto) return Promise.resolve([]);

    return window.API
      .chamar('/pesquisa/sessoes?projetoId=' + encodeURIComponent(ids.projeto))
      .then(function (r) {
        /* Teto de 8: sao 8 requisicoes, e as mais recentes carregam o
           que o projeto sabe hoje. Ler as 50 custaria espera sem
           acrescentar nome novo. */
        var sessoes = ((r && r.sessoes) || []).slice(0, 8);
        return Promise.all(sessoes.map(function (sess) {
          return window.API
            .chamar('/pesquisa/sessoes/' + encodeURIComponent(sess.id))
            .catch(function () { return null; });
        }));
      })
      .then(function (detalhes) {
        var nomes = [], vistos = {};
        detalhes.forEach(function (d) {
          ((d && d.entidades) || []).forEach(function (e) {
            var n = String(e.nome || '').trim();
            var k = chave(n);
            if (!n || !k || vistos[k]) return;
            vistos[k] = true;
            nomes.push(n);
          });
        });
        return nomes;
      })
      .catch(function (e) {
        console.warn('[Orquestrador] não li as entidades do projeto', e);
        return [];
      });
  }

  /* Comparacao por forma reduzida. Acento, pontuacao e caixa mudam
     entre o que a pessoa digitou e o que a busca gravou — sem
     normalizar, a mesma pergunta passaria como nova. */
  function chave(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function jaExiste(texto, tarefas) {
    var k = chave(texto);
    if (!k) return true;
    return tarefas.some(function (t) {
      var kt = chave(t.nome), kd = chave(t.descricao);
      if (kt === k || kd === k) return true;
      /* Conter tambem conta, mas so em texto longo: trecho curto
         casaria por acaso e esconderia proposta legitima. */
      return k.length > 24 && (kt.indexOf(k) !== -1 || kd.indexOf(k) !== -1);
    });
  }

  function proporProximaTarefa(contexto) {
    var tarefas = contexto.tarefas_anteriores;
    var achados = contexto.achados || { perguntas: [], assuntos: [] };
    var tema = (contexto.ideia && contexto.ideia.titulo) ||
               contexto.atividade.nome || 'esta idéia';
    var temCsd = tarefas.some(function (t) { return t.tipo === 'matriz_csd'; });
    var pesquisas = tarefas.filter(function (t) { return t.tipo === 'pesquisa'; });
    var pendentes = tarefas.filter(function (t) { return !t.concluida; });

    /* ------------------------------------------------------------
       Por que as descricoes de `pesquisa` sao escritas como pergunta
       ------------------------------------------------------------
       board.html classifica a descricao da tarefa antes de executar e
       recusa o nivel 'conhecimento' — o que se responde por raciocinio
       em vez de por fonte (api/src/pesquisa/roteador.ts). Uma descricao
       reflexiva nasceria impossivel de executar, e a pessoa so
       descobriria ao abrir o quadro.
       ------------------------------------------------------------ */

    /* Atividade nova: separar o que se sabe do que se supoe antes de
       gastar pesquisa confirmando o obvio. */
    if (tarefas.length === 0) {
      return {
        titulo: curto('Mapear certezas, suposições e dúvidas', 260),
        descricao: curto(
          'Separar o que já se sabe sobre ' + tema + ' do que ainda é suposição. ' +
          'Evita gastar a primeira pesquisa confirmando o que já era certo — ' +
          'e as dúvidas que sobrarem viram as próximas tarefas.', 280),
        tipo: 'matriz_csd',
        porque: 'a atividade ainda não tem nenhuma tarefa'
      };
    }

    /* ------------------------------------------------------------
       A pergunta que a propria pesquisa deixou em aberto
       ------------------------------------------------------------
       E a melhor candidata a proxima tarefa: nasceu do material que
       ja foi lido, nao de um palpite sobre o tema. Entram so as que o
       classificador de board.html aceitaria como buscaveis — propor
       uma pergunta reflexiva criaria tarefa que nao executa. */
    var abertas = (achados.perguntas || []).filter(function (q) {
      /* Pronome solto e recusado pelo servidor (PES-004) e a pessoa
         nao tem como destravar respondendo: o que a busca pede — o
         nome da empresa — costuma ser justamente o que a tarefa ia
         descobrir. A pergunta volta em loop. Melhor nao propor. */
      if (PRONOME_SOLTO.test(q)) {
        console.warn('[Orquestrador] pergunta em aberto descartada — pronome sem ' +
                     'antecedente criaria tarefa que trava em loop: ' + q);
        return false;
      }
      return FATO_BUSCA.test(q) && !jaExiste(q, tarefas);
    });

    if (abertas.length) {
      return {
        titulo: curto(abertas[0], 260),
        descricao: curto(abertas[0], 280),
        tipo: 'pesquisa',
        porque: 'pergunta deixada em aberto por tarefa concluída' +
                (abertas.length > 1 ? ' (' + abertas.length + ' disponíveis)' : '')
      };
    }

    /* Ja separou certezas de suposicoes: a duvida mais cara vira
       investigacao — agora em forma buscavel. */
    if (temCsd && pesquisas.length === 0) {
      var mercado = {
        titulo: curto('Levantar o mercado de ' + tema, 260),
        descricao: curto(
          'Quais empresas atuam hoje com ' + tema + ' no Brasil, quantas são as principais, ' +
          'o que cada uma cobra e desde quando operam?', 280),
        tipo: 'pesquisa',
        porque: 'existe matriz CSD e nenhuma pesquisa ainda'
      };
      if (!jaExiste(mercado.titulo, tarefas)) return mercado;
    }

    /* ------------------------------------------------------------
       Sem pergunta em aberto aproveitavel: a proposta vem de uma lista
       de angulos, e o primeiro que ainda NAO esta na atividade vence.
       Antes havia um texto constante aqui — era ele que voltava igual
       toda vez, porque nada olhava para o que ja existia.
       ------------------------------------------------------------ */
    /* ------------------------------------------------------------
       Duas familias de pergunta — e misturar as duas foi o defeito
       ------------------------------------------------------------
       Reclamacao, preco e avaliacao sao propriedades de EMPRESA.
       Perguntadas sobre um tema — "quantas reclamacoes existem sobre
       Meio de transporte de encomendas" — produzem uma pergunta sem
       sujeito capaz de responde-la: ninguem reclama de um assunto,
       reclama-se de quem prestou o servico. A busca entao devolve
       qualquer empresa, ou pede o nome de volta.

       Entao pergunta de empresa so entra quando o projeto JA nomeou
       empresas — e entra com os nomes escritos. */
    var empresas = achados.empresas || [];
    var nomeados = empresas.slice(0, 3).join(', ');

    var angulosComEmpresa = empresas.length ? [
      { t: 'Preços de ' + nomeados,
        d: 'Quanto ' + nomeados + ' cobram hoje no Brasil e desde quando cada preço vale?' },
      { t: 'Reclamações sobre ' + nomeados,
        d: 'Quantas reclamações existem no Reclame Aqui e no Procon sobre ' + nomeados +
           ', quais os motivos mais frequentes e qual a avaliação média de cada uma?' },
      { t: 'Onde ' + nomeados + ' atuam',
        d: 'Em que cidades e estados do Brasil ' + nomeados + ' operam hoje, quando cada uma ' +
           'foi fundada e qual o CNPJ de cada uma?' }
    ] : [];

    /* Perguntas de MERCADO valem sem nome nenhum, porque o sujeito e o
       proprio mercado. E por elas que se comeca quando o projeto ainda
       nao nomeou ninguem — e a primeira e justamente a que descobre os
       nomes, alimentando `pesquisa_entidades` para as proximas. */
    var angulosDeMercado = [
      { t: 'Quem opera com ' + tema,
        d: 'Quais empresas oferecem ' + tema + ' no Brasil, quantas são as principais, ' +
           'onde atuam e desde quando operam?' },
      { t: 'Tamanho do mercado de ' + tema,
        d: 'Qual o tamanho do mercado de ' + tema + ' no Brasil em faturamento e em número de ' +
           'operações por ano, e qual a fonte de cada número?' },
      { t: 'Regras que se aplicam a ' + tema,
        d: 'Quais normas e regulações valem hoje para ' + tema + ' no Brasil, qual órgão ' +
           'responde por cada uma e quando entraram em vigor?' },
      { t: 'Dados recentes sobre ' + tema,
        d: 'Que dados dos últimos 12 meses existem sobre ' + tema + ' no Brasil: mudanças de ' +
           'preço, novos entrantes, mudanças de regulação, e qual a fonte de cada um?' }
    ];

    /* Nomeadas primeiro: uma pergunta que nomeia o sujeito e sempre
       mais respondivel que a que descreve o mercado por atributo. */
    var angulos = angulosComEmpresa.concat(angulosDeMercado);

    var escolhido = null;
    for (var i = 0; i < angulos.length; i++) {
      if (!jaExiste(angulos[i].t, tarefas) && !jaExiste(angulos[i].d, tarefas)) {
        escolhido = angulos[i];
        break;
      }
    }

    /* Todos os angulos ja viraram tarefa. Repetir o primeiro seria
       mentir; dizer que acabou e honesto e ainda deixa a pessoa
       escrever a dela. */
    if (!escolhido) {
      return {
        titulo: curto('Nova pesquisa sobre ' + tema, 260),
        descricao: curto(
          'Os ângulos que eu saberia propor sozinho já viraram tarefa, e as pesquisas ' +
          'concluídas não deixaram pergunta em aberto. Escreva a pergunta que falta — ' +
          'nomeando a empresa' + (empresas.length ? ' (' + nomeados + ')' : '') +
          ' e com um fato verificável (quanto, quantas, quais, onde, quando).', 280),
        tipo: 'pesquisa',
        porque: 'todos os ângulos conhecidos já existem na atividade'
      };
    }

    return {
      titulo: curto(escolhido.t, 260),
      descricao: curto(escolhido.d, 280),
      tipo: 'pesquisa',
      porque: pendentes.length > 0
        ? pendentes.length + ' tarefa(s) pendente(s) — proposta que não depende delas'
        : 'ângulo ainda não coberto pelas tarefas existentes'
    };
  }

  function pedirProposta() {
    var contexto = montarContexto();

    /* Contexto menor NÃO bloqueia — é regra explícita da Skill
       ("Tratamento de contexto incompleto"). Só a falta de
       empresa+projeto impede de montar qualquer coisa, e isso
       significa que a página ainda não terminou de carregar. */
    if (!contexto.empresa || !contexto.projeto) {
      return Promise.reject({
        dados: { mensagem: 'A atividade ainda não terminou de carregar. Tente de novo em instantes.' }
      });
    }

    console.log('[Orquestrador] propondo próxima tarefa', {
      atividade: contexto.atividade.nome,
      tarefas_existentes: contexto.tarefas_anteriores.length,
      contexto: contexto
    });

    var ids = idsDaUrl();

    /* So as CONCLUIDAS. Tarefa pendente ainda nao tem o que ensinar, e
       ler o quadro dela devolveria as perguntas que ela mesma vai
       responder — a proposta competiria com trabalho ja em curso. */
    var concluidas = contexto.tarefas_anteriores.filter(function (t) {
      return t.concluida && t.id;
    });

    /* ------------------------------------------------------------
       PONTO DE LIGAÇÃO COM O BACKEND
       Enquanto `/orquestrador/proxima-tarefa` nao existir, a proposta
       e montada aqui — mas agora em cima do que esta GRAVADO, nao so
       da contagem de tarefas. Quando a rota existir, ela deve receber
       `contexto` ja com `achados` e devolver { titulo, descricao,
       tipo, porque }.
       ------------------------------------------------------------ */
    /* Em paralelo: os quadros contam o que ESTA atividade descobriu;
       as entidades contam quem o PROJETO inteiro ja nomeou. As duas
       coisas entram na mesma proposta e nenhuma espera a outra. */
    return Promise.all([
      Promise.all(concluidas.map(function (t) { return lerQuadrosDaTarefa(ids, t.id); })),
      empresasDoProjeto(ids)
    ]).then(function (par) {
      var quadros = [];
      par[0].forEach(function (l) { quadros = quadros.concat(l); });

      contexto.achados = colherAchados(quadros);
      contexto.achados.empresas = par[1];

      console.log('[Orquestrador] li ' + quadros.length + ' quadro(s) de ' +
                  concluidas.length + ' tarefa(s) concluída(s):', {
        perguntas_em_aberto: contexto.achados.perguntas,
        assuntos_ja_cobertos: contexto.achados.assuntos,
        empresas_conhecidas_no_projeto: contexto.achados.empresas
      });

      var p = conferirExecutavel(proporProximaTarefa(contexto));
      console.log('[Orquestrador] proposta:', p.titulo,
                  '| tipo:', p.tipo, '| motivo:', p.porque);
      return p;
    });
  }

  /* ============================================================
     Esqueleto nos campos do formulário
     ============================================================
     O esqueleto vive onde o conteúdo vai aparecer. Como neste fluxo
     nada é inserido na lista de tarefas — a tarefa só existe depois
     que a pessoa salvar —, um card fantasma na lista prometeria algo
     que ainda não vai acontecer. Os campos do formulário é que estão
     esperando conteúdo, então é neles que o carregamento aparece.

     Reaproveita a animação `esq-brilho` de css/esqueleto.css: mesma
     cadência do esqueleto que a lista já usa, sem keyframe novo para
     manter em sincronia. */
  var CSS_ID = 'orq-estilo-carregando';

  function garantirEstilo() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent =
      '.orq-gerando{position:relative;overflow:hidden;' +
      'color:transparent!important;-webkit-text-fill-color:transparent;' +
      'caret-color:transparent;pointer-events:none}' +
      '.orq-gerando::after{content:"";position:absolute;inset:0;' +
      'background:linear-gradient(90deg,transparent,rgba(0,0,0,.06),transparent);' +
      'transform:translateX(-100%);animation:esq-brilho 1.4s var(--ease-in-out,ease-in-out) infinite}' +
      '#generateWithAIBtn[aria-busy="true"]{opacity:.6;pointer-events:none}';
    document.head.appendChild(s);
  }

  function campos() {
    return {
      titulo: document.getElementById('taskTitle'),
      desc: document.getElementById('taskDesc'),
      tipo: document.getElementById('taskTipo')
    };
  }

  function marcarGerando(ligado) {
    garantirEstilo();
    var c = campos();
    [c.titulo, c.desc, c.tipo].forEach(function (el) {
      if (!el) return;
      el.classList.toggle('orq-gerando', ligado);
      el.readOnly = ligado && el.tagName !== 'SELECT';
      if (el.tagName === 'SELECT') el.disabled = ligado;
    });
    var btn = document.getElementById('generateWithAIBtn');
    if (btn) {
      btn.setAttribute('aria-busy', ligado ? 'true' : 'false');
      if (ligado) btn.dataset.orqRotulo = btn.textContent.trim();
    }
  }

  /* Preenche o formulário com a proposta. Dispara `input`/`change`
     porque a página pode ter contadores ou validações escutando —
     atribuir .value direto não os acorda. */
  function preencher(p) {
    var c = campos();
    if (c.titulo) {
      c.titulo.value = p.titulo;
      c.titulo.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (c.desc) {
      c.desc.value = p.descricao;
      c.desc.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (c.tipo) {
      c.tipo.value = p.tipo;
      c.tipo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    /* Foco no título: a proposta é rascunho para revisar, e o cursor
       no primeiro campo diz isso sem precisar de texto explicando. */
    if (c.titulo) {
      c.titulo.focus();
      c.titulo.setSelectionRange(c.titulo.value.length, c.titulo.value.length);
    }
  }

  function tratarErro(e, fallback) {
    var msg = e && e.rede
      ? 'Não conseguimos falar com o servidor. Verifique sua conexão.'
      : (e && e.dados && e.dados.mensagem) || fallback;
    console.error('[Orquestrador]', msg, e);
    toast(msg, 'erro');
  }

  /* ============================================================
     GATILHO 1 — "Gerar com ajuda da IA" (atividade.html)
     ============================================================ */

  function conectarGatilho1() {
    var btn = document.getElementById('generateWithAIBtn');
    if (!btn) return false;

    /* O listener original (fechar este modal e abrir outro) está
       registrado pelo <script> inline da página. Clonar o nó troca o
       comportamento sem editar aquele bloco. */
    var novo = btn.cloneNode(true);
    btn.parentNode.replaceChild(novo, btn);

    novo.addEventListener('click', function () {
      /* O modal NÃO fecha: é nele que a proposta vai aparecer, e é
         nele que a pessoa revisa antes de salvar. */
      marcarGerando(true);

      pedirProposta()
        .then(function (p) {
          marcarGerando(false);
          preencher(p);
          toast('Sugestão preenchida. Revise e salve, ou ajuste o que quiser.');
        })
        .catch(function (e) {
          marcarGerando(false);
          tratarErro(e, 'Não foi possível sugerir uma tarefa agora.');
        });
    });

    return true;
  }

  /* ============================================================
     GATILHO 2 — "Pesquisar" (board.html)
     ============================================================ */

  function conectarGatilho2() {
    var btn = document.getElementById('btnGerarIA');
    if (!btn) return false;

    /* Aqui NÃO se clona nem se cancela o evento: o botão já tem o
       fluxo real de pesquisa (PesquisaPainel) ligado a ele, e
       derrubá-lo tiraria da plataforma a única busca que hoje
       funciona de verdade. Este listener roda em captura só para
       registrar o encaminhamento que o orquestrador faria. */
    btn.addEventListener('click', function () {
      /* board.html não envia a descrição do banco: envia o texto de
         `.explainer-text`, que board.js preencheu com `t.descricao`.
         Como a recusa por nível 'conhecimento' não diz QUAL texto foi
         classificado, é aqui que dá para ver — antes de o pedido sair. */
      var el = document.querySelector('.explainer-text');
      var desc = el ? el.textContent.trim() : '';
      var m = desc.match(FATO_BUSCA);

      console.log('[Orquestrador] "Pesquisar" vai enviar esta descrição:\n  ' +
                  (desc || '(VAZIA — a tarefa não tem descrição)'));
      console.log('[Orquestrador] classificação prevista: ' +
                  (m ? 'busca → executa (casou "' + m[0] + '")'
                     : 'conhecimento → recusa (nenhuma palavra de fato: ' +
                       'quantas/quantos/qual/quais/onde/quando/preço/faturamento/fundada/cnpj)'));

      console.log('[Orquestrador] contexto disponível', montarContexto());
    }, true);

    return true;
  }

  /* ============================================================
     Inicialização
     ============================================================ */

  function iniciar() {
    var g1 = conectarGatilho1();
    var g2 = conectarGatilho2();
    console.log('[Orquestrador] gateway pronto — gatilho 1:',
      g1 ? 'conectado' : 'ausente nesta tela',
      '| gatilho 2:', g2 ? 'conectado' : 'ausente nesta tela');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.OrquestradorGateway = {
    montarContexto: montarContexto,
    proporProximaTarefa: proporProximaTarefa,
    pedirProposta: pedirProposta
  };
})();
