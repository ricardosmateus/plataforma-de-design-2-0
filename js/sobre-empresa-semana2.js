/**
 * SEMANA 2: Pastas Dinâmicas
 * Carrega assuntos (categorias) da API: GET /empresas/:id/sobre
 *
 * Regras de comportamento:
 *  - O spinner aparece SÓ na primeira carga. Nas atualizações seguintes
 *    a lista não é limpa, senão a tela pisca a cada 5s e parece recarregar.
 *  - Só re-renderiza quando os dados realmente mudaram.
 *  - Erro depois de uma carga boa não apaga o que já está na tela.
 */
(function () {
  'use strict';

  var emptyState   = document.getElementById('emptyState');
  var loadingState = document.getElementById('loadingState');
  var taskList     = document.getElementById('taskList');

  var semCat       = document.getElementById('semCategoria');
  var semCatTitulo = document.getElementById('semCategoriaTitulo');
  var semCatBtn    = document.getElementById('semCategoriaBtn');

  var ring     = document.getElementById('contextoRing');
  var ringVal  = document.getElementById('contextoValor');
  var ringPct  = document.getElementById('contextoPct');
  var ctxTit   = document.getElementById('contextoTitulo');
  var ctxDesc  = document.getElementById('contextoDesc');

  var CIRCUNFERENCIA = 326.7;   // 2πr, r=52 — igual ao CSS

  var primeiraCarga = true;
  var ultimoEstado  = null;   // JSON da última resposta renderizada
  var jaRenderizou  = false;  // já mostramos dados válidos alguma vez?

  /* ------------------------------------------------------------
     Ritmo da atualização
     ------------------------------------------------------------
     Antes era um `setInterval` de 5s, fixo. Isso significa que cada
     aba aberta bate na API doze vezes por minuto para sempre —
     inclusive minimizada, inclusive esquecida aberta no fim de
     semana. Com muitas empresas, é carga constante para não mostrar
     nada de novo.

     Três correções, nessa ordem de importância:

     1. Aba oculta não pergunta nada. Ninguém está lendo.
     2. Sem novidade, o intervalo cresce (5s → 30s). Uma tela que
        está mudando continua respondendo rápido; uma parada há
        vinte minutos não merece o mesmo esforço.
     3. Voltar o foco pergunta na hora e reinicia o ritmo — que é
        exatamente quando a pessoa quer ver o que mudou.
     ------------------------------------------------------------ */
  var RITMO_MIN = 5000;
  var RITMO_MAX = 30000;
  var ritmo = RITMO_MIN;
  var agendado = null;

  /* Esta tela exige empresa E projeto na URL (js/sobre-empresa.js
     redireciona se faltar). Guardamos os dois para os links saírem
     daqui com contexto. */
  function params() {
    var q = new URLSearchParams(window.location.search);
    return { empresa: q.get('empresa'), projeto: q.get('projeto') };
  }

  function carregarPastas() {
    var p = params();
    if (!p.empresa) return Promise.resolve();

    if (primeiraCarga && loadingState) loadingState.style.display = 'block';

    return window.API.buscar('/empresas/' + encodeURIComponent(p.empresa) + '/sobre')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (dados) {
        var assinatura = JSON.stringify(dados);
        if (assinatura === ultimoEstado) {
          /* Nada mudou: não mexe na tela e afrouxa o ritmo. */
          ritmo = Math.min(ritmo * 1.6, RITMO_MAX);
          return;
        }
        /* Mudou: volta ao ritmo curto, porque provavelmente vai
           mudar de novo — quem acabou de finalizar uma idéia está
           mexendo no quadro agora. */
        ritmo = RITMO_MIN;
        ultimoEstado = assinatura;
        jaRenderizou = true;
        renderizar((dados && dados.assuntos) || [], p);
        renderizarSemCategoria(
          (dados && dados.sem_categoria) || 0,
          (dados && dados.sem_recortes) || 0
        );
        renderizarCobertura(dados && dados.cobertura);
      })
      .catch(function (e) {
        console.error('[pastas]', e);
        /* Nunca apagar o que já está bom na tela por causa de uma
           falha. */
        if (jaRenderizou) return;

        /* E, se não havia nada, NÃO mostrar o estado vazio: durante
           todo o desenvolvimento a rota devolveu 500 e esta tela
           dizia "nenhuma atividade finalizada ainda" — uma frase
           tranquilizadora e falsa, que escondeu um bug de banco por
           dias. Estado vazio é uma afirmação sobre os dados; sem
           resposta do servidor, não há o que afirmar. */
        mostrarFalha();
      })
      .then(function () {
        if (loadingState) loadingState.style.display = 'none';
        primeiraCarga = false;
      });
  }

  function renderizar(assuntos, p) {
    if (!assuntos.length) { mostrarEmptyState(); return; }

    if (emptyState) emptyState.style.display = 'none';
    if (!taskList) return;

    taskList.innerHTML = '';
    for (var i = 0; i < assuntos.length; i++) {
      taskList.appendChild(criarItem(assuntos[i], p));
    }
  }

  function criarItem(assunto, p) {
    var categoria  = String(assunto.categoria || assunto.assunto || '');
    var quantidade = Number(assunto.quantidade || 0);
    var finalizadas = Number(assunto.finalizadas || 0);
    var semTrecho   = Number(assunto.sem_trecho || 0);

    var li = document.createElement('li');
    li.className = 'task';
    li.dataset.id = slug(categoria);

    var alca = document.createElement('span');
    alca.className = 'task-drag';
    alca.setAttribute('role', 'button');
    alca.setAttribute('tabindex', '0');
    alca.setAttribute('title', 'Arraste para reordenar');
    alca.setAttribute('aria-label', 'Reordenar ' + categoria);
    alca.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v16M15 4v16"/></svg>';

    var pasta = document.createElement('span');
    pasta.className = 'task-folder';
    pasta.setAttribute('aria-hidden', 'true');
    pasta.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

    /* O nome da pasta abre o painel do grafo na mesma categoria.
       Lista e desenho são duas leituras do mesmo dado; sem esse elo
       a pessoa precisa achar o ponto certo no canvas para ver o que
       a linha da lista já nomeia. Botão, e não link: não navega. */
    var nome = document.createElement('button');
    nome.type = 'button';
    nome.className = 'task-name task-name--acao';
    nome.textContent = categoria;
    nome.title = 'Ver ' + categoria + ' no grafo';
    nome.addEventListener('click', function () {
      if (window.GrafoPainel) window.GrafoPainel.porCategoria(categoria);
    });

    var contagem = document.createElement('span');
    contagem.className = 'task-count';
    contagem.style.color = 'var(--text-secondary)';
    contagem.style.fontSize = '13px';
    contagem.style.marginLeft = '10px';
    contagem.textContent = quantidade + (quantidade === 1 ? ' ideia' : ' ideias');

    /* Toda finalizada desta pasta caiu aqui pela classificação e
       nenhuma tem trecho recortado sob este nome — a pasta abre sem
       citação nenhuma. Dizer isto ANTES do clique poupa a viagem; a
       página do tema explica o porquê e leva às idéias. */
    if (finalizadas > 0 && semTrecho >= finalizadas) {
      contagem.textContent += ' · sem trecho recortado';
    }

    /* ------------------------------------------------------------
       "Acessar pasta" agora ENTRA na pasta
       ------------------------------------------------------------
       Duas correções de destino, em ordem:

       Antes apontava para `visao_do_projeto.html?categoria=…`, que é
       o quadro de UM projeto e ignorava o parâmetro. Não era só
       falta de implementação: uma pasta cruza os projetos da
       empresa, e nenhum quadro de projeto pode mostrá-la inteira.

       Passou então a abrir o painel lateral — melhor, mas o painel
       lista TÍTULOS. Quem clica em "Acessar" numa pasta chamada
       Concorrentes está pedindo o conteúdo, e recebia um índice: a
       leitura de verdade continuava exigindo abrir cada idéia e
       reler a atividade inteira.

       O destino certo é a página do tema, que serve o texto já
       separado, cada trecho com o caminho de volta para o quadro
       onde foi escrito. O painel não se perde: o NOME da pasta,
       ao lado, continua abrindo ele para quem quer o mapa. */
    var link = document.createElement('a');
    link.className = 'btn btn--secondary';
    link.setAttribute('draggable', 'false');
    link.textContent = 'Acessar pasta';
    link.title = 'Ler o que foi escrito sobre ' + categoria;

    var q = new URLSearchParams(window.location.search);
    var emp = q.get('empresa');
    var projeto = q.get('projeto');

    if (emp) {
      link.href = 'tema.html?empresa=' + encodeURIComponent(emp) +
        (projeto ? '&projeto=' + encodeURIComponent(projeto) : '') +
        '&categoria=' + encodeURIComponent(categoria);
    } else {
      /* Sem empresa na URL não há página de tema possível. O painel
         é o que ainda funciona — e continua sendo um link de
         verdade, que se compartilha e abre em nova aba. */
      var url = new URL(window.location.href);
      url.searchParams.set('pasta', categoria);
      link.href = url.pathname + url.search;
      link.addEventListener('click', function (ev) {
        if (window.GrafoPainel && window.GrafoPainel.porCategoria(categoria)) {
          ev.preventDefault();
        }
      });
    }

    li.appendChild(alca);
    li.appendChild(pasta);
    li.appendChild(nome);
    li.appendChild(contagem);
    li.appendChild(link);
    return li;
  }

  /* ------------------------------------------------------------
     Finalizadas sem pasta
     ------------------------------------------------------------
     Aparecem como número, não como categoria inventada. O botão
     existe porque a alternativa era pedir à pessoa que rodasse um
     script no terminal — o que, para quem usa o produto, é o mesmo
     que não ter saída.
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     Duas formas de uma finalizada estar incompleta
     ------------------------------------------------------------
     `semPasta`    → a classificação não rodou ou falhou.
     `semRecortes` → tem as tags, mas a página do tema abre vazia.
                     É o estado de toda idéia finalizada antes de os
                     recortes existirem.

     O mesmo bloco serve as duas porque o remédio é o mesmo botão, e
     porque duas caixas de aviso lado a lado dizendo "falta algo" se
     leem como um problema maior do que é. O TEXTO é que muda: as
     causas são diferentes, e "sem pasta" não explica uma página de
     tema vazia para quem está vendo as tags na tela.
     ------------------------------------------------------------ */
  function renderizarSemCategoria(semPasta, semRecortes) {
    if (!semCat) return;
    if (!semPasta && !semRecortes) { semCat.hidden = true; return; }
    semCat.hidden = false;

    var partes = [];
    if (semPasta) {
      partes.push(semPasta + (semPasta === 1 ? ' idéia sem pasta' : ' idéias sem pasta'));
    }
    if (semRecortes) {
      partes.push(
        semRecortes + (semRecortes === 1 ? ' idéia sem trechos' : ' idéias sem trechos')
      );
    }
    semCatTitulo.textContent = partes.join(' · ');

    /* O botão diz o que vai fazer. "Tentar classificar" numa idéia
       que já tem pasta faria a pessoa achar que ia perder a
       classificação que já está certa. */
    if (semCatBtn && !semCatBtn.disabled) {
      semCatBtn.textContent = semPasta ? 'Tentar classificar' : 'Gerar os trechos';
    }
  }

  /* Renovação silenciosa, igual a `ideias.js`: um 401 aqui não é
     "vá para o login", é "o token de acesso venceu". Só se o
     /auth/sessao também recusar é que a sessão acabou de verdade. */
  function chamarComRenovacao(caminho, opcoes, jaRenovou) {
    return window.API.chamar(caminho, opcoes).catch(function (e) {
      if (e && e.status === 401 && !jaRenovou) {
        return window.API.chamar('/auth/sessao').then(
          function () { return chamarComRenovacao(caminho, opcoes, true); },
          function () { throw e; }
        );
      }
      throw e;
    });
  }

  function reclassificar() {
    var p = params();
    if (!p.empresa || !semCatBtn) return;

    var rotulo = semCatBtn.textContent;
    semCatBtn.disabled = true;
    /* "Classificando…" numa idéia que já tem pasta descreveria a
       operação errada — e a errada é justamente a que a pessoa teme
       (perder a classificação que já está certa). O rótulo em curso
       segue o rótulo em repouso, que `renderizarSemCategoria` já
       ajustou ao que de fato falta. */
    semCatBtn.textContent = rotulo.indexOf('trechos') !== -1
      ? 'Gerando…'
      : 'Classificando…';

    /* Era `fetch` cru com caminho absoluto e `same-origin`. Três
       problemas que só apareceriam com a rota existindo: ignorava o
       `API.BASE` (API em outra origem = URL errada), não mandava o
       cookie cross-origin, e não renovava o token — numa tela que
       fica minutos aberta em polling, o 401 é o caso comum, não o
       raro. `API.chamar` resolve os dois primeiros; a renovação vai
       no `catch`, no mesmo formato dos outros módulos. */
    chamarComRenovacao(
      '/empresas/' + encodeURIComponent(p.empresa) + '/reclassificar',
      { metodo: 'POST' },
      false
    )
      .then(function (d) {
        /* Força o próximo ciclo a redesenhar mesmo que a contagem
           coincida: o conteúdo das pastas mudou. */
        ultimoEstado = null;
        carregarPastas();
        /* O trabalho foi ENFILEIRADO, não concluído: as chamadas
           rodam em segundo plano e levam segundos. Dizer "pronto"
           aqui seria mentir por alguns ciclos — e o polling, que já
           está de pé, mostra o resultado chegando sozinho. */
        if (d && d.restantes) {
          semCatBtn.textContent = 'Continuar (' + d.restantes + ' restantes)';
        } else {
          semCatBtn.textContent = rotulo;
        }
      })
      .catch(function (e) {
        console.error('[reclassificar]', e);
        semCatBtn.textContent = 'Não deu certo — tentar de novo';
      })
      .then(function () { semCatBtn.disabled = false; });
  }

  if (semCatBtn) semCatBtn.addEventListener('click', reclassificar);

  /* ------------------------------------------------------------
     Anel de contexto
     ------------------------------------------------------------
     Mede cobertura da taxonomia: quantos dos cinco domínios já têm
     alguma idéia finalizada. Antes era um 68% fixo do protótipo —
     numa tela que passou a mostrar dado real, um número inventado
     ao lado dele não é enfeite, é desinformação.
     ------------------------------------------------------------ */
  function renderizarCobertura(cobertura) {
    if (!ring || !cobertura || !cobertura.total) return;

    var pct = Math.round((cobertura.cobertos / cobertura.total) * 100);
    ringPct.textContent = pct + '%';
    ringVal.style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - pct / 100));

    var texto = 'Contexto do projeto: ' + cobertura.cobertos + ' de ' +
      cobertura.total + ' áreas cobertas';
    ctxTit.textContent = texto;
    ring.setAttribute('aria-label', texto);

    var faltando = (cobertura.dominios || [])
      .filter(function (d) { return !d.ideias; })
      .map(function (d) { return d.nome; });

    ctxDesc.textContent = faltando.length
      ? 'Ainda sem nada finalizado em: ' + faltando.join(', ') + '.'
      : 'Todas as áreas da taxonomia já têm conhecimento registrado.';
  }

  function mostrarFalha() {
    if (emptyState) emptyState.style.display = 'none';
    if (!taskList) return;
    taskList.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'task task--falha';
    li.setAttribute('role', 'status');
    li.textContent = 'Não foi possível carregar as pastas agora. Tentando de novo…';
    taskList.appendChild(li);
  }

  function mostrarEmptyState() {
    if (taskList) taskList.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
  }

  function slug(t) {
    return t.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  }

  /* Encadeado, não `setInterval`: uma resposta lenta não empilha
     chamadas em cima da anterior. */
  function agendar() {
    clearTimeout(agendado);
    if (document.visibilityState === 'hidden') return;
    /* Sem empresa na URL não há o que perguntar; agendar aqui seria
       um laço perpétuo sem nenhuma chamada dentro. */
    if (!params().empresa) return;
    agendado = setTimeout(function () {
      carregarPastas().then(agendar, agendar);
    }, ritmo);
  }

  function iniciar() {
    carregarPastas().then(agendar, agendar);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        clearTimeout(agendado);
        return;
      }
      /* Voltou para a aba: pergunta agora, não daqui a 30 segundos. */
      ritmo = RITMO_MIN;
      carregarPastas().then(agendar, agendar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.debugSemana2 = { carregarPastas: carregarPastas, params: params };
})();
