/* ============================================================
   Gráficos de um tema — desenho em SVG
   ============================================================
   Regras: Documentacao/enriquecimento-tema.md

   Tipos: barra, linha, pizza. Sem biblioteca externa, pela mesma
   razão de `grafo.js` (canvas próprio, sem d3): três formas simples
   a partir de um spec pequeno não pagam uma dependência a mais para
   auditar.

   Este arquivo DESENHA e mais nada. Quem sabe para onde cada ponto
   leva é `tema.js`, que tem o mapa de recortes e monta os links de
   origem embaixo de cada gráfico — aqui só sai, por ponto, o
   `data-origem` que o clique devolve.

   Acessibilidade: o SVG é `role="img"` com um resumo em `aria-label`
   que enumera os pares rótulo/valor. Quem usa leitor de tela recebe
   os dados; quem usa teclado chega neles pela lista de origens que
   `tema.js` desenha logo abaixo. O clique na forma é um atalho de
   mouse, nunca o único caminho.
   ============================================================ */

const GraficoSVG = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* Uma caixa larga e baixa: estes gráficos moram dentro de um texto
     corrido, não num painel. */
  var LARGURA  = 600;
  var ALTURA   = 320;
  var PAD_ESQ  = 56;   // nome do eixo Y + folga
  var PAD_DIR  = 16;
  var PAD_TOPO = 46;   // título + o valor escrito sobre a barra
  var PAD_BASE = 62;   // rótulos do eixo X + nome do eixo

  function el(nome, atributos) {
    var n = document.createElementNS(NS, nome);
    for (var k in atributos) {
      if (Object.prototype.hasOwnProperty.call(atributos, k)) {
        n.setAttribute(k, atributos[k]);
      }
    }
    return n;
  }

  function texto(conteudo, atributos) {
    var t = el('text', atributos);
    t.textContent = conteudo;
    return t;
  }

  function formatar(v) {
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  }

  /* O resumo que o leitor de tela lê no lugar do desenho. É a mesma
     informação, em outra forma — não uma legenda do tipo "gráfico de
     barras", que não diz nada a quem não vê. */
  function descrever(grafico) {
    var partes = (grafico.dados || []).map(function (d) {
      return d.rotulo + ': ' + formatar(d.valor);
    });
    var tipo = {
      barra: 'Gráfico de barras',
      linha: 'Gráfico de linha',
      pizza: 'Gráfico de pizza'
    }[grafico.tipo] || 'Gráfico';
    return tipo + ' — ' + grafico.titulo + '. ' + partes.join('; ') + '.';
  }

  function criarSVG(largura, altura, grafico) {
    var svg = el('svg', {
      viewBox: '0 0 ' + largura + ' ' + altura,
      class: 'tema-grafico-svg',
      role: 'img',
      'aria-label': descrever(grafico)
    });
    /* `<title>` é o que aparece ao parar o mouse em cima; o
       `aria-label` acima é o que o leitor de tela usa. */
    var t = document.createElementNS(NS, 'title');
    t.textContent = grafico.titulo;
    svg.appendChild(t);
    return svg;
  }

  function desenharTitulo(svg, grafico, x) {
    svg.appendChild(texto(grafico.titulo, { x: x, y: 24, class: 'tema-grafico-titulo' }));
  }

  /* Os nomes dos eixos vêm do modelo (`eixo_x`/`eixo_y`) e são
     opcionais. Valem o espaço que ocupam: "45" e "45 R$ milhões" são
     leituras diferentes do mesmo desenho. */
  function desenharEixos(svg, grafico, alturaUtil) {
    if (grafico.eixoX) {
      svg.appendChild(texto(grafico.eixoX, {
        x: PAD_ESQ + (LARGURA - PAD_ESQ - PAD_DIR) / 2,
        y: ALTURA - 8,
        'text-anchor': 'middle',
        class: 'tema-grafico-eixo'
      }));
    }
    if (grafico.eixoY) {
      svg.appendChild(texto(grafico.eixoY, {
        x: 0, y: 0,
        transform: 'translate(16 ' + (PAD_TOPO + alturaUtil / 2) + ') rotate(-90)',
        'text-anchor': 'middle',
        class: 'tema-grafico-eixo'
      }));
    }
  }

  function linhaDeBase(svg, y) {
    svg.appendChild(el('line', {
      x1: PAD_ESQ, y1: y, x2: LARGURA - PAD_DIR, y2: y,
      class: 'tema-grafico-eixo-linha'
    }));
  }

  /* ------------------------------------------------------------
     Barra
     ------------------------------------------------------------
     A base é o zero, não o menor valor. Escalar de min a max faria a
     menor barra ter altura nenhuma e a diferença entre 98 e 100
     parecer a diferença entre nada e tudo — que é a forma clássica
     de um gráfico honesto mentir. */
  function renderizarBarra(grafico) {
    var dados = grafico.dados || [];
    if (dados.length < 2) return null;

    var svg = criarSVG(LARGURA, ALTURA, grafico);
    var largura = LARGURA - PAD_ESQ - PAD_DIR;
    var altura  = ALTURA - PAD_TOPO - PAD_BASE;

    var valores = dados.map(function (d) { return d.valor; });
    var base = Math.min(0, Math.min.apply(null, valores));
    var topo = Math.max(0, Math.max.apply(null, valores));
    var amplitude = topo - base || 1;
    var yDe = function (v) { return PAD_TOPO + altura - ((v - base) / amplitude) * altura; };

    desenharTitulo(svg, grafico, PAD_ESQ);

    var passo = largura / dados.length;
    var larguraBarra = Math.min(passo * 0.62, 72);

    dados.forEach(function (d, i) {
      var centro = PAD_ESQ + passo * i + passo / 2;
      var y0 = yDe(0);
      var y1 = yDe(d.valor);

      svg.appendChild(el('rect', {
        x: centro - larguraBarra / 2,
        y: Math.min(y0, y1),
        width: larguraBarra,
        height: Math.max(Math.abs(y1 - y0), 1),
        rx: 3,
        class: 'tema-grafico-barra',
        'data-origem': d.origem
      }));

      svg.appendChild(texto(formatar(d.valor), {
        x: centro, y: Math.min(y0, y1) - 7,
        'text-anchor': 'middle', class: 'tema-grafico-valor'
      }));

      svg.appendChild(texto(d.rotulo, {
        x: centro, y: ALTURA - PAD_BASE + 20,
        'text-anchor': 'middle', class: 'tema-grafico-label'
      }));
    });

    linhaDeBase(svg, yDe(0));
    desenharEixos(svg, grafico, altura);
    return svg;
  }

  /* ------------------------------------------------------------
     Linha
     ------------------------------------------------------------
     Aqui a escala é min–max com folga: linha é sobre a FORMA da
     variação, e ancorar no zero achataria a curva que é justamente
     o que se foi ver. */
  function renderizarLinha(grafico) {
    var dados = grafico.dados || [];
    if (dados.length < 2) return null;

    var svg = criarSVG(LARGURA, ALTURA, grafico);
    var largura = LARGURA - PAD_ESQ - PAD_DIR;
    var altura  = ALTURA - PAD_TOPO - PAD_BASE;

    var valores = dados.map(function (d) { return d.valor; });
    var min = Math.min.apply(null, valores);
    var max = Math.max.apply(null, valores);
    var folga = (max - min) * 0.15 || Math.abs(max) * 0.15 || 1;
    var base = min - folga;
    var amplitude = (max + folga) - base || 1;

    desenharTitulo(svg, grafico, PAD_ESQ);

    /* Recuo nas pontas: o primeiro e o último ponto ficam na borda
       exata da área útil, e os rótulos deles são centralizados no
       ponto — metade do texto sairia do viewBox. */
    var recuo = 22;
    var faixa = largura - recuo * 2;

    var pontos = dados.map(function (d, i) {
      return {
        x: PAD_ESQ + recuo + (faixa * i) / (dados.length - 1),
        y: PAD_TOPO + altura - ((d.valor - base) / amplitude) * altura,
        d: d
      };
    });

    svg.appendChild(el('polyline', {
      points: pontos.map(function (p) { return p.x + ',' + p.y; }).join(' '),
      class: 'tema-grafico-linha'
    }));

    pontos.forEach(function (p) {
      svg.appendChild(el('circle', {
        cx: p.x, cy: p.y, r: 5,
        class: 'tema-grafico-ponto',
        'data-origem': p.d.origem
      }));
      svg.appendChild(texto(formatar(p.d.valor), {
        x: p.x, y: p.y - 13,
        'text-anchor': 'middle', class: 'tema-grafico-valor'
      }));
      svg.appendChild(texto(p.d.rotulo, {
        x: p.x, y: ALTURA - PAD_BASE + 20,
        'text-anchor': 'middle', class: 'tema-grafico-label'
      }));
    });

    linhaDeBase(svg, PAD_TOPO + altura);
    desenharEixos(svg, grafico, altura);
    return svg;
  }

  /* ------------------------------------------------------------
     Pizza
     ------------------------------------------------------------
     Sem eixos — `eixo_x`/`eixo_y` não se aplicam e são ignorados de
     propósito. A legenda traz rótulo, valor e porcentagem: a fatia
     sozinha não deixa ninguém comparar 22% com 26%. */
  function renderizarPizza(grafico) {
    var dados = (grafico.dados || []).filter(function (d) { return d.valor > 0; });
    if (dados.length < 2) return null;

    var total = dados.reduce(function (s, d) { return s + d.valor; }, 0);
    if (!total) return null;

    /* Legenda à direita da rosca, não embaixo: embaixo, o desenho
       ocupava um terço da largura e sobrava metade da caixa vazia —
       e a lista ainda empurrava o gráfico seguinte para longe. */
    var cx = 130, cy = 168, r = 92;
    var legendaX = 268;
    var altura = Math.max(290, 96 + dados.length * 22);
    var svg = criarSVG(LARGURA, altura, grafico);

    cy = Math.max(cy, r + 60);
    desenharTitulo(svg, grafico, 16);

    var inicio = -Math.PI / 2;
    dados.forEach(function (d, i) {
      var fracao = d.valor / total;
      var fim = inicio + fracao * 2 * Math.PI;
      var serie = 'tema-grafico-serie-' + ((i % 6) + 1);

      /* Uma fatia de 100% não tem arco: os dois pontos coincidem e o
         `A` não sabe para que lado ir. Vira círculo. */
      if (fracao >= 0.999) {
        svg.appendChild(el('circle', {
          cx: cx, cy: cy, r: r,
          class: 'tema-grafico-fatia ' + serie,
          'data-origem': d.origem
        }));
      } else {
        var x1 = cx + r * Math.cos(inicio), y1 = cy + r * Math.sin(inicio);
        var x2 = cx + r * Math.cos(fim),    y2 = cy + r * Math.sin(fim);
        svg.appendChild(el('path', {
          d: 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 +
             ' A ' + r + ' ' + r + ' 0 ' + (fracao > 0.5 ? 1 : 0) + ' 1 ' + x2 + ' ' + y2 + ' Z',
          class: 'tema-grafico-fatia ' + serie,
          'data-origem': d.origem
        }));
      }

      var ly = cy - (dados.length - 1) * 11 + i * 22;
      svg.appendChild(el('rect', {
        x: legendaX, y: ly - 9, width: 11, height: 11, rx: 2,
        class: 'tema-grafico-chave ' + serie
      }));
      svg.appendChild(texto(
        d.rotulo + ' — ' + formatar(d.valor) + ' (' + Math.round(fracao * 100) + '%)',
        { x: legendaX + 19, y: ly, class: 'tema-grafico-label' }
      ));

      inicio = fim;
    });

    return svg;
  }

  /* ------------------------------------------------------------
     renderizar
     ------------------------------------------------------------
     `aoEscolher` recebe o id do recorte de origem. É atalho de
     mouse: a mesma navegação existe, por teclado, na lista de
     origens que `tema.js` desenha abaixo do gráfico. */
  function renderizar(grafico, aoEscolher) {
    if (!grafico) return null;

    var svg =
      grafico.tipo === 'barra' ? renderizarBarra(grafico) :
      grafico.tipo === 'linha' ? renderizarLinha(grafico) :
      grafico.tipo === 'pizza' ? renderizarPizza(grafico) : null;

    if (svg && aoEscolher) {
      svg.addEventListener('click', function (e) {
        var alvo = e.target;
        if (alvo && alvo.getAttribute && alvo.getAttribute('data-origem')) {
          aoEscolher(alvo.getAttribute('data-origem'));
        }
      });
    }

    return svg;
  }

  return { renderizar: renderizar, descrever: descrever };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GraficoSVG;
}
