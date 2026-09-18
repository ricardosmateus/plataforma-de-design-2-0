/**
 * Saldo e extrato de créditos — Fase 1
 * Planejamento: planejamento-creditos-e-pagamento.md
 *
 * Substitui o que era encenação: o "500 créditos disponíveis" estava
 * FIXO no HTML, e o histórico não tinha origem de dados nenhuma.
 *
 * A regra que governa este arquivo é a DIN-006, que por sua vez vem
 * da lição do "bug que durou uma semana" (ver
 * Documentacao/grafo-de-conhecimento.md): FALHA AO CARREGAR NUNCA
 * PODE PARECER SALDO ZERO. São estados diferentes, com mensagens
 * diferentes. Num saldo, confundir os dois faz a pessoa achar que o
 * dinheiro dela sumiu.
 */

(function () {
  'use strict';

  var valor = document.getElementById('pfSaldoValor');
  var falha = document.getElementById('pfSaldoFalha');
  var hint = document.getElementById('pfSaldoHint');
  var lista = document.getElementById('timelineContainer');
  var btnHistorico = document.getElementById('verHistoricoBtn');

  if (!valor) return;

  var carregouExtrato = false;

  function mostrarFalha() {
    /* O traço, e não "R$ 0,00": um zero aqui seria uma AFIRMAÇÃO
       sobre o dinheiro da pessoa que o servidor não fez. */
    valor.textContent = '—';
    if (falha) falha.hidden = false;
    if (hint) hint.hidden = true;
  }

  function mostrarSaldo(formatado) {
    valor.textContent = formatado;
    if (falha) falha.hidden = true;
    if (hint) hint.hidden = false;
  }

  function carregarSaldo() {
    return window.API.buscar('/creditos/saldo')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        mostrarSaldo(d.saldo_formatado);
      })
      .catch(function (e) {
        console.error('[creditos] não foi possível carregar o saldo:', e);
        mostrarFalha();
      });
  }

  function escapar(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function dataCurta(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + ' ' +
           String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  }

  function carregarExtrato() {
    if (!lista) return;

    /* `API.buscar`, não `fetch` cru — o mesmo motivo que já está
       escrito em js/api.js, que cita este arquivo pelo nome: o token
       de acesso vive 15 minutos (ACS-SESSAO-001), e sem renovação
       silenciosa o extrato falha sozinho depois desse tempo.

       O saldo, dez linhas acima, já usava `API.buscar`. Este ficou
       para trás na migração — e o resultado era exatamente o sintoma
       que api.js descreve: a modal abria com o saldo certo e o
       histórico dizendo "não foi possível carregar", sem nada na tela
       explicando por que um funcionou e o outro não.

       `buscar` devolve a Response crua e não lança, então o `r.ok`
       abaixo continua valendo sem mais nenhuma mudança. */
    window.API.buscar('/creditos/extrato')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var itens = d.lancamentos || [];
        if (!itens.length) {
          /* Só é honesto dizer "nada aconteceu" DEPOIS que o
             servidor respondeu. Este ramo só roda em resposta ok. */
          lista.innerHTML = '<p class="pf-extrato-vazio">Nenhuma movimentação ainda.</p>';
          return;
        }

        var html = '<ul class="pf-extrato">';
        itens.forEach(function (l) {
          /* Recarga por Pix credita o líquido: o PSP retém uma taxa
             sobre o valor pago. Sem dizer isso aqui, "paguei R$ 10,00
             e entraram R$ 9,90" parece a plataforma ficando com a
             diferença. O servidor só manda estes campos quando houve
             taxa de verdade — a tela mostra pela presença deles, sem
             adivinhar pelo tipo do lançamento. */
          var detalhe = '';
          if (l.valor_pago_formatado && l.taxa_formatada) {
            detalhe =
              '<span class="pf-extrato-detalhe">' +
                'Pago ' + escapar(l.valor_pago_formatado) +
                ' · taxa da transação ' + escapar(l.taxa_formatada) +
              '</span>';
          }

          /* DIN-014: linha medida que não virou lançamento. Acontece
             com `CREDITOS_COBRAR=nao` — a medição continua (DIN-011) e
             a razão fica sem a linha. Ela aparece aqui porque, desde
             DIN-013, este é o único lugar onde valor aparece: esconder
             deixaria um gasto real invisível em todo o produto.

             `cobrado !== false` e não `!l.cobrado`: resposta antiga,
             de antes deste campo existir, não deve virar "não cobrado"
             por ausência. */
          var naoCobrado = l.cobrado === false;
          var etiqueta = naoCobrado
            ? '<span class="pf-extrato-etiqueta">medido, não cobrado</span>'
            : '';

          html += '<li class="pf-extrato-item' + (naoCobrado ? ' is-nao-cobrado' : '') + '">' +
            '<span class="pf-extrato-desc">' + escapar(l.descricao) + etiqueta + detalhe + '</span>' +
            '<span class="pf-extrato-data">' + dataCurta(l.criado_em) + '</span>' +
            '<span class="pf-extrato-valor ' + (naoCobrado ? 'is-neutro' : (l.entrou ? 'is-entrada' : 'is-saida')) + '">' +
              (naoCobrado ? '' : (l.entrou ? '+' : '−') + ' ') + escapar(l.valor_formatado) +
            '</span>' +
          '</li>';
        });
        html += '</ul>';
        lista.innerHTML = html;
      })
      .catch(function (e) {
        console.error('[creditos] não foi possível carregar o extrato:', e);
        /* Mesma regra do saldo: falha tem texto próprio, e não o
           texto de "não há movimentação". */
        lista.innerHTML = '<p class="pf-extrato-vazio">Não foi possível carregar o histórico agora.</p>';
      });
  }

  /* O extrato só é buscado quando alguém abre o histórico — não faz
     sentido pedir 50 lançamentos para uma seção que está fechada. */
  if (btnHistorico) {
    btnHistorico.addEventListener('click', function () {
      if (!carregouExtrato) {
        carregouExtrato = true;
        carregarExtrato();
      }
    });
  }

  function iniciar() {
    carregarSaldo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.Creditos = { recarregar: carregarSaldo, extrato: carregarExtrato };
})();
