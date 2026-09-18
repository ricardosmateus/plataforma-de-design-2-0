/* ============================================================
   Grafo de conhecimento — Semana 4 (+ Semana 6: escala)
   ============================================================
   Substitui a ilustração fixa por um desenho dos dados reais.

   Duas decisões que explicam boa parte do arquivo:

   1. CANVAS, não SVG. São centenas de nós redesenhados a cada
      quadro; com SVG isso é o mesmo número de elementos no DOM, e o
      navegador passa mais tempo reconciliando árvore do que
      desenhando. Canvas custa uma chamada de desenho por nó.

   2. SEM BIBLIOTECA. A simulação é ~60 linhas (repulsão, mola,
      centro). Trazer d3-force para isso somaria uma dependência
      externa à página, com o custo de auditoria que o resto do
      projeto evita — `provedor.ts` faz a mesma escolha com o SDK.

   Acessibilidade não é o canvas: é o painel (js/grafo-painel.js)
   e a lista de pastas logo acima, que mostram o mesmo dado em HTML
   navegável. O canvas é `aria-hidden` de
   propósito — desenho decorativo de um conteúdo que já existe em
   texto.

   ESCALA — o próprio planejamento previu o limite: "grafos de força
   ficam ilegíveis acima de ~150 nós". A resposta tem duas partes:

   - Zoom (roda do mouse) e pan (arrastar o fundo), para inspecionar
     um agrupamento sem que o resto suma da tela.
   - Um teto de nós de IDÉIA ativos na simulação (as CATEGORIAS,
     no máximo 24, nunca são escondidas — é o esqueleto da
     taxonomia). Acima do teto, as idéias mais antigas de cada
     categoria ficam "dobradas": existem para o painel e para a
     lista de conhecimento, mas não entram no cálculo de física nem
     são desenhadas. A categoria ganha um "+K" no rótulo. Isto é o
     drill-down que o plano original pedia — só que a expansão
     acontece no painel lateral (que já pagina bem uma lista longa),
     não dentro do canvas.

   Esta página é desktop-only por decisão anterior (body min-width:
   1024px), então a interação é só de mouse — sem gestos de toque.
   ============================================================ */
(function () {
  'use strict';

  var figura = document.querySelector('.graph');
  if (!figura) return;

  /* A caixa que ocupa o lugar do grafo antes de ele existir. Não é
     mais uma ilustração a esconder: é o estado da carga, e ela sai
     da tela só quando há grafo de verdade para pôr no lugar. */
  var estado = document.getElementById('grafoEstado');
  var estadoTexto = document.getElementById('grafoEstadoTexto');

  /* Carregando gira; vazio e falha não. Ver o CSS de
     `.graph-estado--parado`. */
  function mostrarEstado(texto, parado) {
    if (!estado) return;
    estado.hidden = false;
    estado.classList.toggle('graph-estado--parado', !!parado);
    if (estadoTexto) estadoTexto.textContent = texto;
  }

  function esconderEstado() {
    if (estado) estado.hidden = true;
  }
  var canvas = null;
  var ctx = null;
  var botaoReset = null;

  var nos = [];              // todos — inclusive os dobrados (para o painel)
  var arestas = [];          // idem
  var nosAtivos = [];        // só o que a física simula e o canvas desenha
  var arestasAtivas = [];
  var porId = new Map();
  var sobre = null;          // nó sob o cursor
  var animando = false;

  var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Teto de idéias ativas — logo abaixo do limiar de legibilidade
     que o planejamento original citou (~150), descontando espaço
     para as categorias. As mais RECENTES ficam visíveis: a API já
     devolve as idéias nessa ordem, então "os primeiros N" já é "os
     N mais recentes". Categorias inteiras podem ficar sem nenhuma
     idéia individual visível — o nó da categoria continua lá,
     porque o esqueleto da taxonomia não pode sumir. */
  var LIMIAR_IDEIAS_ATIVAS = 130;

  /* Os cinco domínios da taxonomia (espelham src/ia/taxonomia-vocabulario.ts).
     Servem só para a cor: o servidor manda a categoria, não o domínio. */
  var DOMINIOS = {
    Descoberta: ['Personas','Concorrentes','Mercado','Benchmark','Pesquisa Qualitativa','Pesquisa Quantitativa'],
    Produto: ['Funcionalidades','MVP','Roadmap','Requisitos','Backlog'],
    'Experiência': ['Jornada do Usuário','UX','UI','Design System','Acessibilidade'],
    'Negócio': ['Estratégia','KPIs','Posicionamento'],
    Tecnologia: ['APIs','IA','Arquitetura','Integrações']
  };
  var DOMINIO_DE = {};
  Object.keys(DOMINIOS).forEach(function (d) {
    DOMINIOS[d].forEach(function (c) { DOMINIO_DE[c] = d; });
  });

  /* Canvas não entende `var(--kg-2)`; resolve-se uma vez aqui. */
  var css = getComputedStyle(document.documentElement);
  function token(nome, alternativa) {
    var v = css.getPropertyValue(nome).trim();
    return v || alternativa;
  }
  var COR = {
    Descoberta: token('--kg-2', '#0b3b6f'),
    Produto: token('--kg-3', '#1668b8'),
    'Experiência': token('--kg-4', '#0ba5ec'),
    'Negócio': token('--kg-5', '#7dd3fc'),
    Tecnologia: token('--kg-1', '#0f172a'),
    ideia: token('--kg-edge-faint', '#bae6fd'),
    aresta: token('--kg-edge', '#1668b8'),
    texto: token('--text-primary', '#0f172a')
  };
  function corDoNo(no) {
    if (no.tipo === 'ideia') return COR.ideia;
    return COR[DOMINIO_DE[no.rotulo]] || COR.Produto;
  }

  /* ------------------------------------------------------------
     Dados
     ------------------------------------------------------------ */
  function empresaDaUrl() {
    return new URLSearchParams(window.location.search).get('empresa');
  }

  /* Uma linha discreta sob a ilustração. Discreta porque o conteúdo
     real da página (a lista de pastas) não depende do grafo — mas
     presente, porque silêncio aqui vira "está quebrado e não sei
     por quê". Também serve para o aviso de truncamento do servidor,
     que é informativo e não uma falha. */
  var aviso = null;
  function avisar(texto) {
    if (!texto) {
      if (aviso) { aviso.remove(); aviso = null; }
      return;
    }
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.className = 'graph-aviso';
      aviso.setAttribute('role', 'status');
      figura.appendChild(aviso);
    }
    aviso.textContent = texto;
  }

  function carregar() {
    var empresa = empresaDaUrl();
    if (!empresa) return;

    /* API.buscar em vez de fetch: renova o token vencido em
       silencio. Com fetch cru, abrir a pagina com o token ja
       vencido derrubava esta secao sozinha. */
    window.API.buscar('/empresas/' + encodeURIComponent(empresa) + '/grafo')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        /* Vazio de verdade: nenhuma idéia finalizada e classificada
           ainda. Antes esta linha deixava a ilustração do protótipo na
           tela, o que dizia à pessoa exatamente o contrário do que é
           verdade sobre a empresa dela. */
        if (!d || !d.nos || !d.nos.length) {
          avisar(null);
          mostrarEstado(
            'O grafo aparece aqui quando houver idéia finalizada e classificada. ' +
            'Finalize uma idéia no quadro do projeto para ela entrar no mapa.',
            true,
          );
          return;
        }
        montar(d.nos, d.arestas || []);
        /* Teto do SERVIDOR (400 idéias por empresa) é outra coisa que
           o teto do CLIENTE (130 ativas na tela): aquele existe para
           a consulta não explodir; este, para o desenho continuar
           legível. Quando o servidor já cortou, é a única situação em
           que vale um aviso — abrir a pasta pelo tema, acima, é o
           caminho para o resto. */
        avisar(d.truncado
          ? 'Mostrando as ' + d.teto + ' idéias mais recentes. Abra uma pasta em "Sobre a empresa" para ler o resto por tema.'
          : null);
      })
      .catch(function (e) {
        console.error('[grafo]', e);
        /* Cair para a ilustração e não dizer nada foi um erro meu de
           projeto: "sem nenhuma idéia classificada" e "o servidor
           está devolvendo 500" viravam a mesma tela, e a única saída
           era abrir o console. Estado vazio e falha são coisas
           diferentes e precisam parecer diferentes. */
        avisar(null);
        mostrarEstado(
          'Não foi possível carregar o grafo agora. As pastas abaixo continuam válidas.',
          true,
        );
      });
  }

  /* ------------------------------------------------------------
     Montagem
     ------------------------------------------------------------ */
  function montar(nosApi, arestasApi) {
    var caixa = figura.getBoundingClientRect();
    var L = caixa.width || 897;
    var A = Math.round(L * 501 / 897);

    nos = nosApi.map(function (n, i) {
      /* Distribuição inicial em espiral, não aleatória: duas cargas
         da mesma empresa produzem o mesmo desenho, e um grafo que
         muda de forma a cada F5 parece quebrado mesmo quando não
         está. */
      var ang = i * 2.399963;                 // ângulo áureo
      var raio = Math.sqrt(i + 0.5) * (Math.min(L, A) / 14);
      return {
        id: n.id,
        tipo: n.tipo,
        rotulo: n.rotulo,
        peso: n.peso || 0,
        dados: n,
        oculto: false,
        x: L / 2 + Math.cos(ang) * raio,
        y: A / 2 + Math.sin(ang) * raio,
        vx: 0, vy: 0,
        r: n.tipo === 'categoria' ? Math.min(9 + (n.peso || 0) * 2.2, 22) : 4.5
      };
    });

    porId = new Map(nos.map(function (n) { return [n.id, n]; }));
    arestas = arestasApi
      .map(function (a) { return { a: porId.get(a.origem), b: porId.get(a.destino), tipo: a.tipo }; })
      .filter(function (a) { return a.a && a.b; });

    dobrarExcedente();

    prepararCanvas(L, A);
    esconderEstado();

    /* Nova carga, nova vista: um zoom/pan deixado de uma consulta
       anterior não faz sentido para um grafo com outro formato. */
    vista.escala = 1; vista.x = 0; vista.y = 0;
    atualizarBotaoReset();

    if (calmo) {
      /* Sem animação: roda a simulação até assentar e desenha uma
         vez. Quem pediu menos movimento recebe o mesmo grafo, parado. */
      for (var i = 0; i < 300; i++) passo();
      desenhar();
    } else {
      animando = true;
      requestAnimationFrame(quadro);
    }

    window.addEventListener('resize', redimensionar);
    /* O painel recebe o conjunto INTEIRO, dobrado ou não — abrir uma
       categoria continua listando todas as suas idéias. A física e o
       desenho é que trabalham só com `nosAtivos`. */
    if (window.GrafoPainel) window.GrafoPainel.pronto(nos, arestas);
  }

  /* Decide quais idéias entram na física/desenho e quais ficam só
     no dado (painel + lista). As categorias nunca são dobradas —
     sem elas o esqueleto da taxonomia desaparece da tela. */
  function dobrarExcedente() {
    var vistas = 0;
    var contagemOculta = {};

    nos.forEach(function (n) {
      if (n.tipo !== 'ideia') return;
      if (vistas < LIMIAR_IDEIAS_ATIVAS) { vistas++; return; }
      n.oculto = true;
      var cat = n.dados && n.dados.assunto;
      if (cat) contagemOculta[cat] = (contagemOculta[cat] || 0) + 1;
    });

    nos.forEach(function (n) {
      if (n.tipo !== 'categoria') return;
      var k = contagemOculta[n.rotulo];
      n.rotuloExibido = k ? n.rotulo + ' +' + k : n.rotulo;
    });

    /* Nó dobrado nasce grudado na própria categoria: se um dia
       ganhar expansão dentro do canvas, começa no lugar certo em vez
       de voar de um canto da tela. Hoje só evita que ele influencie
       a física por estar em (0,0). */
    var porCategoria = {};
    nos.forEach(function (n) { if (n.tipo === 'categoria') porCategoria[n.rotulo] = n; });
    nos.forEach(function (n) {
      if (!n.oculto) return;
      var pai = n.dados && porCategoria[n.dados.assunto];
      if (pai) { n.x = pai.x; n.y = pai.y; }
    });

    nosAtivos = nos.filter(function (n) { return !n.oculto; });
    arestasAtivas = arestas.filter(function (e) { return !e.a.oculto && !e.b.oculto; });
  }

  function prepararCanvas(L, A) {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'graph-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.cursor = 'grab';
      figura.appendChild(canvas);

      canvas.addEventListener('mousedown', aoDescer);
      window.addEventListener('mousemove', aoArrastarOuMover);
      window.addEventListener('mouseup', aoSoltar);
      canvas.addEventListener('mouseleave', function () {
        if (!arrastando) { sobre = null; if (!animando) desenhar(); }
      });
      canvas.addEventListener('click', aoClicar);
      canvas.addEventListener('wheel', aoRodar, { passive: false });
      canvas.addEventListener('dblclick', function (ev) { ev.preventDefault(); resetarVista(); });

      criarBotaoReset();
    }
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
    canvas.style.aspectRatio = L + '/' + A;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.__L = L; canvas.__A = A;
  }

  var redimensionando = null;
  function redimensionar() {
    clearTimeout(redimensionando);
    redimensionando = setTimeout(function () {
      var caixa = figura.getBoundingClientRect();
      var L = caixa.width || 897;
      prepararCanvas(L, Math.round(L * 501 / 897));
      desenhar();
    }, 150);
  }

  /* ------------------------------------------------------------
     Vista: zoom (roda) e pan (arrastar o fundo)
     ------------------------------------------------------------
     Os nós guardam coordenadas de MUNDO (as mesmas que a física usa
     e nunca mudam por causa do zoom). `vista` é só a lente entre o
     mundo e a tela — mundo × escala + deslocamento = tela. Isso
     mantém a simulação inteira alheia ao zoom: ela nunca soube, e
     não precisa saber, o quanto a pessoa aproximou a imagem.
     ------------------------------------------------------------ */
  var vista = { escala: 1, x: 0, y: 0 };
  var ESCALA_MIN = 0.4, ESCALA_MAX = 4;
  var arrastando = null;

  function pontoTela(ev) {
    var caixa = canvas.getBoundingClientRect();
    var f = canvas.__L / caixa.width;
    return { x: (ev.clientX - caixa.left) * f, y: (ev.clientY - caixa.top) * f };
  }
  function telaParaMundo(p) {
    return { x: (p.x - vista.x) / vista.escala, y: (p.y - vista.y) / vista.escala };
  }

  function aoRodar(ev) {
    ev.preventDefault();
    var p = pontoTela(ev);
    var antes = telaParaMundo(p);
    var fator = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    var nova = Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, vista.escala * fator));
    /* Reancora no ponto sob o cursor: sem isto, dar zoom empurra o
       que se está olhando para fora da tela em vez de ampliá-lo. */
    vista.x = p.x - antes.x * nova;
    vista.y = p.y - antes.y * nova;
    vista.escala = nova;
    atualizarBotaoReset();
    if (!animando) desenhar();
  }

  function aoDescer(ev) {
    if (noEm(ev)) return;   // clicar num nó é clique, não arraste
    var p = pontoTela(ev);
    arrastando = { x0: p.x, y0: p.y, vx0: vista.x, vy0: vista.y, moveu: false };
    canvas.style.cursor = 'grabbing';
  }

  function aoArrastarOuMover(ev) {
    if (!arrastando) { aoMover(ev); return; }
    var p = pontoTela(ev);
    var dx = p.x - arrastando.x0, dy = p.y - arrastando.y0;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) arrastando.moveu = true;
    vista.x = arrastando.vx0 + dx;
    vista.y = arrastando.vy0 + dy;
    atualizarBotaoReset();
    if (!animando) desenhar();
  }

  function aoSoltar() {
    if (!arrastando) return;
    /* O clique dispara de qualquer forma no mouseup; se houve
       arraste de verdade, `aoClicar` precisa saber para não abrir o
       painel do nó que ficou por baixo do cursor ao soltar. */
    houveArrasto = arrastando.moveu;
    arrastando = null;
    canvas.style.cursor = sobre ? 'pointer' : 'grab';
  }

  var houveArrasto = false;

  function resetarVista() {
    vista.escala = 1; vista.x = 0; vista.y = 0;
    atualizarBotaoReset();
    if (!animando) desenhar();
  }

  function criarBotaoReset() {
    botaoReset = document.createElement('button');
    botaoReset.type = 'button';
    botaoReset.className = 'graph-reset';
    botaoReset.textContent = 'Centralizar';
    botaoReset.setAttribute('aria-label', 'Centralizar e redefinir o zoom do grafo');
    botaoReset.hidden = true;
    botaoReset.addEventListener('click', resetarVista);
    figura.appendChild(botaoReset);
  }
  function atualizarBotaoReset() {
    if (!botaoReset) return;
    var padrao = vista.escala === 1 && vista.x === 0 && vista.y === 0;
    botaoReset.hidden = padrao;
  }

  /* ------------------------------------------------------------
     Simulação: repulsão entre todos, mola nas arestas, gravidade
     fraca para o centro. O amortecimento (0.86) é o que faz o
     desenho assentar em vez de vibrar para sempre.

     Opera só sobre `nosAtivos`/`arestasAtivas` — os nós dobrados por
     excesso (ver `dobrarExcedente`) não custam um único ciclo daqui,
     que é o ponto inteiro do teto de escala.
     ------------------------------------------------------------ */
  var energia = 1;

  function passo() {
    var L = canvas.__L, A = canvas.__A;
    var cx = L / 2, cy = A / 2;
    var n = nosAtivos.length;

    for (var i = 0; i < n; i++) {
      var a = nosAtivos[i];
      for (var j = i + 1; j < n; j++) {
        var b = nosAtivos[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 90000) continue;              // longe demais: ignora
        var d = Math.sqrt(d2);
        var f = 900 / d2;
        var ux = dx / d, uy = dy / d;
        a.vx -= ux * f; a.vy -= uy * f;
        b.vx += ux * f; b.vy += uy * f;
      }
      /* Gravidade: sem ela os componentes desconexos saem de cena. */
      a.vx += (cx - a.x) * 0.0016;
      a.vy += (cy - a.y) * 0.0016;
    }

    for (var k = 0; k < arestasAtivas.length; k++) {
      var e = arestasAtivas[k];
      var dx2 = e.b.x - e.a.x, dy2 = e.b.y - e.a.y;
      var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
      /* Aresta de assunto (a pasta da idéia) puxa mais forte que a
         de tag: é isso que faz cada categoria aparecer como um
         agrupamento, com as tags cruzando entre eles. */
      var alvo = e.tipo === 'assunto' ? 58 : 96;
      var forca = (dist - alvo) * (e.tipo === 'assunto' ? 0.012 : 0.005);
      var ux2 = dx2 / dist, uy2 = dy2 / dist;
      e.a.vx += ux2 * forca; e.a.vy += uy2 * forca;
      e.b.vx -= ux2 * forca; e.b.vy -= uy2 * forca;
    }

    var movimento = 0;
    for (var m = 0; m < n; m++) {
      var p = nosAtivos[m];
      p.vx *= 0.86; p.vy *= 0.86;
      p.x += p.vx; p.y += p.vy;
      /* Margem: nó colado na borda fica com o rótulo cortado. */
      p.x = Math.max(p.r + 8, Math.min(L - p.r - 8, p.x));
      p.y = Math.max(p.r + 8, Math.min(A - p.r - 8, p.y));
      movimento += Math.abs(p.vx) + Math.abs(p.vy);
    }
    energia = movimento / Math.max(n, 1);
  }

  function quadro() {
    if (!animando) return;
    passo();
    desenhar();
    /* Para de desenhar quando o grafo assenta. Uma animação eterna
       consome bateria para não mostrar nada de novo. */
    if (energia < 0.02) { animando = false; return; }
    requestAnimationFrame(quadro);
  }

  /* ------------------------------------------------------------
     Desenho
     ------------------------------------------------------------ */
  function vizinhos(no) {
    var s = new Set();
    if (!no) return s;
    arestasAtivas.forEach(function (e) {
      if (e.a === no) s.add(e.b);
      if (e.b === no) s.add(e.a);
    });
    return s;
  }

  function desenhar() {
    if (!ctx) return;
    var L = canvas.__L, A = canvas.__A;
    ctx.clearRect(0, 0, L, A);

    ctx.save();
    ctx.translate(vista.x, vista.y);
    ctx.scale(vista.escala, vista.escala);

    var destaque = sobre ? vizinhos(sobre) : null;

    ctx.lineCap = 'round';
    arestasAtivas.forEach(function (e) {
      var relevante = !sobre || e.a === sobre || e.b === sobre;
      ctx.globalAlpha = relevante ? (e.tipo === 'assunto' ? 0.42 : 0.2) : 0.06;
      ctx.strokeStyle = COR.aresta;
      ctx.lineWidth = e.tipo === 'assunto' ? 1.3 : 0.9;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    });

    nosAtivos.forEach(function (n) {
      var aceso = !sobre || n === sobre || (destaque && destaque.has(n));
      ctx.globalAlpha = aceso ? 1 : 0.18;
      ctx.fillStyle = corDoNo(n);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();

      if (n === sobre) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = COR.texto;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    /* Rótulos só das categorias — e só quando cabem. Escrever o
       título de centenas de idéias produz uma mancha ilegível; o
       texto de cada idéia aparece no hover e no painel. */
    ctx.globalAlpha = 1;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COR.texto;
    nosAtivos.forEach(function (n) {
      if (n.tipo !== 'categoria') return;
      if (sobre && n !== sobre && !(destaque && destaque.has(n))) return;
      ctx.fillText(n.rotuloExibido || n.rotulo, n.x, n.y + n.r + 4);
    });

    if (sobre && sobre.tipo === 'ideia') balao(sobre);

    ctx.restore();
  }

  function balao(no) {
    /* O balão de texto usa `vista.escala` de propósito: com zoom
       aplicado (estamos dentro do save/restore de `desenhar`), um
       balão com tamanho fixo em unidades de mundo cresceria ou
       encolheria junto da imagem — aqui ele é corrigido para
       continuar do mesmo tamanho em tela, como uma legenda deveria. */
    var texto = no.rotulo.length > 48 ? no.rotulo.slice(0, 47) + '…' : no.rotulo;
    var esc = vista.escala;
    ctx.save();
    ctx.translate(no.x, no.y);
    ctx.scale(1 / esc, 1 / esc);
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    var larg = ctx.measureText(texto).width + 14;
    var x = -larg / 2;
    var y = -no.r * esc - 24;
    ctx.fillStyle = 'rgba(15,23,42,.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, larg, 20, 6); else ctx.rect(x, y, larg, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, x + 7, y + 10);
    ctx.restore();
  }

  /* ------------------------------------------------------------
     Interação
     ------------------------------------------------------------ */
  function noEm(ev) {
    var mundo = telaParaMundo(pontoTela(ev));
    var achado = null, menor = Infinity;
    nosAtivos.forEach(function (n) {
      var d = Math.hypot(n.x - mundo.x, n.y - mundo.y);
      /* Alvo mínimo de 10px (em unidades de mundo, então some com o
         zoom) mesmo para o nó pequeno: acertar um ponto de 4px com o
         mouse é exigir pontaria. */
      var alvo = Math.max(n.r, 10 / vista.escala);
      if (d < alvo && d < menor) { menor = d; achado = n; }
    });
    return achado;
  }

  function aoMover(ev) {
    var achado = noEm(ev);
    if (achado === sobre) return;
    sobre = achado;
    canvas.style.cursor = achado ? 'pointer' : 'grab';
    if (!animando) desenhar();
  }

  function aoClicar(ev) {
    if (houveArrasto) { houveArrasto = false; return; }
    var achado = noEm(ev);
    if (achado && window.GrafoPainel) window.GrafoPainel.abrir(achado);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregar);
  } else {
    carregar();
  }

  /* A taxonomia sai daqui para o painel em vez de ser repetida lá:
     duas listas de 24 categorias em arquivos diferentes divergem no
     dia em que alguém acrescentar uma. */
  window.Grafo = {
    dominios: DOMINIOS,
    recarregar: carregar,
    nos: function () { return nos; }
  };
})();
