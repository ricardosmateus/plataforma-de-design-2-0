/* ============================================================
   CPF — máscara e validação
   ============================================================
   Extraído de cadastro.html quando a decisão D5 tirou o CPF do
   cadastro (Regras_de_negocio/modulos/acesso/login.md §7).

   O CPF passou a ser pedido só no primeiro recebimento do
   especialista, onde tem função fiscal — habilitar pagamento e
   emissão de nota. Este arquivo guarda a lógica até aquela tela
   existir, para não reescrever o que já estava correto.

   Uso:
     <script src="js/cpf.js"></script>
     CPF.ligarCampo(document.getElementById('cpf'));
     if (!CPF.valido(campo.value)) { ... }

   ATENÇÃO: validação de dígito verificador prova apenas que o
   número é bem formado — não que pertence a quem o digitou nem
   que existe na Receita. Conferência real é no servidor.
   ============================================================ */

window.CPF = (function () {
  'use strict';

  /* Aplica 000.000.000-00 conforme a pessoa digita. */
  function mascarar(valor) {
    const d = String(valor).replace(/\D/g, '').slice(0, 11);
    if (d.length > 9) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
    if (d.length > 6) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
    if (d.length > 3) return d.slice(0,3) + '.' + d.slice(3);
    return d;
  }

  /* Dígitos verificadores: evita que um número inventado passe
     adiante só por ter 11 dígitos. */
  function valido(valor) {
    const d = String(valor).replace(/\D/g, '');
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;   // 111.111.111-11 e afins

    function digito(ate) {
      let soma = 0;
      const peso = ate + 1;
      for (let i = 0; i < ate; i++) {
        soma += parseInt(d.charAt(i), 10) * (peso - i);
      }
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    }

    return digito(9)  === parseInt(d.charAt(9), 10) &&
           digito(10) === parseInt(d.charAt(10), 10);
  }

  /* Liga a máscara a um input preservando a posição do cursor
     quando ele está no fim — reposicionar no meio da digitação faz
     o campo "pular" e é uma das coisas mais irritantes de formulário. */
  function ligarCampo(input, aoDigitar) {
    if (!input) return;
    input.addEventListener('input', function () {
      const noFim = input.selectionStart === input.value.length;
      input.value = mascarar(input.value);
      if (noFim) input.setSelectionRange(input.value.length, input.value.length);
      if (typeof aoDigitar === 'function') aoDigitar(input.value);
    });
  }

  return { mascarar: mascarar, valido: valido, ligarCampo: ligarCampo };
})();
