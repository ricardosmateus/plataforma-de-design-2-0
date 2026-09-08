/* ============================================================
   CADASTRO — comportamento de tela
   ============================================================
   Ligado na API (api/). Extraído de cadastro.html em 22/08/2026,
   onde vivia embutido em 468 linhas dentro do HTML.

   Regras — Regras_de_negocio/modulos/acesso/cadastro.md:
     CAD-CONTA-001  coleta nome, e-mail e senha, nada além
     CAD-CONTA-003  e-mail já cadastrado é revelado, com link p/ login
     CAD-CONTA-004  nome exige ao menos duas palavras
     CAD-SENHA-001  mínimo de 8 caracteres
     CAD-SENHA-002  blocklist de senhas comuns e vazadas
     CAD-SENHA-003  sem exigência de maiúscula, número ou símbolo
     CAD-SENHA-004  o medidor mede comprimento, não composição
     CAD-ACEITE-001 aceite obrigatório e explícito
     CAD-DESTINO-001 conta nova segue a cascata → empresas.html

   A lista local de senhas comuns existe só para dar resposta
   enquanto a pessoa digita. A conferência que vale é no servidor,
   contra a base de vazamentos — ver api/src/seguranca/senha.ts.
   ============================================================ */

(function(){
  'use strict';

  var form = document.getElementById('cadastroForm');
  if(!form) return;

  var nome        = document.getElementById('nome');
  var email       = document.getElementById('email');
  var senha       = document.getElementById('senha');
  var aceite      = document.getElementById('aceite');
  var btnCriar    = document.getElementById('btnCriar');
  var alertDuplicado = document.getElementById('alertDuplicado');
  var alertOffline   = document.getElementById('alertOffline');

  /* ---------- Estado offline — estado obrigatório ----------
     Sem rede, nem tenta: a requisição falharia com erro genérico e a
     pessoa não saberia que o problema é a conexão dela. */
  function offline(){ return navigator.onLine === false; }

  function sincronizarRede(){
    alertOffline.hidden = !offline();
    form.classList.toggle('is-locked', offline());
    btnCriar.disabled = offline();
  }

  window.addEventListener('online',  sincronizarRede);
  window.addEventListener('offline', sincronizarRede);
  sincronizarRede();

  /* ---------- Erro por campo ---------- */
  function marcarErro(idCampo, idErro, mensagem){
    var campo = document.getElementById(idCampo);
    var erro  = document.getElementById(idErro);
    campo.classList.add('field--error');
    if(mensagem){
      var texto = erro.querySelector('span');
      if(texto) texto.textContent = mensagem;
    }
    erro.hidden = false;
    var input = campo.querySelector('input');
    if(input) input.setAttribute('aria-invalid', 'true');
  }

  function limparErro(idCampo, idErro){
    var campo = document.getElementById(idCampo);
    var erro  = document.getElementById(idErro);
    campo.classList.remove('field--error');
    erro.hidden = true;
    var input = campo.querySelector('input');
    if(input) input.removeAttribute('aria-invalid');
  }

  /* ---------- Política de senha — CAD-SENHA-001 e 002 ----------
     Duas regras, não quatro. Exigir maiúscula, número e símbolo é o
     que o NIST SP 800-63B Rev 4 chama de "arbitrary composition
     requirement" e proíbe: essas regras produzem "Senha1!" e barram
     "cavalo bateria grampo correto". O que entra no lugar é conferir
     contra listas de vazamento.

     O piso de 8 vale porque há segundo fator (ACS-LOGIN-002); em
     sistema de fator único a recomendação sobe para 15. */
  var MINIMO = 8;

  /* Amostra local, só para dar resposta imediata enquanto a pessoa
     digita. A conferência que vale é no servidor, contra base de
     vazamentos — «TROCAR POR CHAMADA REAL» na Fase 4. */
  var COMUNS = [
    'senha', 'senha123', '12345678', '123456789', '1234567890',
    'password', 'password1', 'qwerty123', 'abc12345', 'admin123',
    'plataforma', 'designer', 'brasil123', '11111111', 'iloveyou'
  ];

  var REGRAS = {
    tamanho:  function(v){ return v.length >= MINIMO; },
    naoComum: function(v){
      if(v.length < MINIMO) return false;
      var limpo = v.toLowerCase().replace(/\s+/g, '');
      return COMUNS.indexOf(limpo) === -1;
    }
  };

  /* O medidor premia COMPRIMENTO, que é o que de fato aumenta o
     custo de quebrar a senha — e não a variedade de caracteres. */
  var ROTULOS = ['Força da senha', 'Senha curta demais', 'Senha razoável', 'Senha boa', 'Senha forte'];

  function nivelPorComprimento(v){
    if(v.length === 0)  return 0;
    if(v.length < MINIMO) return 1;
    if(v.length < 12)   return 2;
    if(v.length < 16)   return 3;
    return 4;
  }

  var forca      = document.getElementById('senhaForca');
  var forcaLabel = document.getElementById('senhaForcaLabel');
  var requisitos = Array.prototype.slice.call(document.querySelectorAll('.requisito'));

  function avaliarSenha(){
    var valor = senha.value;
    var tudoOk = true;

    requisitos.forEach(function(item){
      var regra = REGRAS[item.getAttribute('data-regra')];
      if(!regra) return;
      var ok = valor !== '' && regra(valor);
      item.classList.toggle('is-ok', ok);
      if(!ok) tudoOk = false;
    });

    var nivel = nivelPorComprimento(valor);
    /* Senha comum nunca passa de "curta demais", por mais longa que
       seja: "senhasenhasenha" é longa e péssima. */
    if(valor !== '' && !REGRAS.naoComum(valor)) nivel = 1;

    forca.setAttribute('data-nivel', String(nivel));
    forcaLabel.textContent = ROTULOS[nivel];
    return valor !== '' && tudoOk;
  }

  senha.addEventListener('input', function(){
    avaliarSenha();
    limparErro('fieldSenha', 'senhaErro');
  });

  nome.addEventListener('input',  function(){ limparErro('fieldNome', 'nomeErro'); });
  email.addEventListener('input', function(){ limparErro('fieldEmail', 'emailErro'); });
  aceite.addEventListener('change', function(){ limparErro('fieldAceite', 'aceiteErro'); });

  /* ---------- Mostrar / ocultar senha ---------- */
  function ligarToggle(idBotao, idInput){
    var botao = document.getElementById(idBotao);
    var input = document.getElementById(idInput);
    botao.addEventListener('click', function(){
      var revelado = botao.getAttribute('aria-pressed') === 'true';
      botao.setAttribute('aria-pressed', String(!revelado));
      botao.setAttribute('aria-label', revelado ? 'Mostrar senha' : 'Ocultar senha');
      input.type = revelado ? 'password' : 'text';
      input.focus();
    });
  }
  ligarToggle('toggleSenha', 'senha');

  /* ---------- Envio ---------- */
  form.addEventListener('submit', function(e){
    e.preventDefault();

    if(offline()){ sincronizarRede(); return; }

    alertDuplicado.hidden = true;
    ['fieldNome','fieldEmail','fieldSenha','fieldAceite']
      .forEach(function(id, i){
        limparErro(id, ['nomeErro','emailErro','senhaErro','aceiteErro'][i]);
      });

    var primeiroInvalido = null;
    function reprovar(idCampo, idErro, mensagem){
      marcarErro(idCampo, idErro, mensagem);
      if(!primeiroInvalido) primeiroInvalido = document.getElementById(idCampo).querySelector('input');
    }

    // Nome: exige ao menos duas palavras, para pegar "nome completo"
    var nomeLimpo = nome.value.trim().replace(/\s+/g, ' ');
    if(!nomeLimpo){
      reprovar('fieldNome', 'nomeErro', 'Informe seu nome completo.');
    } else if(nomeLimpo.split(' ').length < 2){
      reprovar('fieldNome', 'nomeErro', 'Informe seu nome e sobrenome.');
    }

    if(!email.value.trim()){
      reprovar('fieldEmail', 'emailErro', 'Informe seu e-mail.');
    } else if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())){
      reprovar('fieldEmail', 'emailErro', 'Informe um e-mail válido.');
    }

    if(!senha.value){
      reprovar('fieldSenha', 'senhaErro', 'Crie uma senha.');
    } else if(senha.value.length < MINIMO){
      reprovar('fieldSenha', 'senhaErro', 'A senha precisa ter pelo menos ' + MINIMO + ' caracteres.');
    } else if(!REGRAS.naoComum(senha.value)){
      /* Mensagem explica o que fazer, não só o que deu errado. */
      reprovar('fieldSenha', 'senhaErro', 'Essa senha é comum demais. Tente uma frase que só você lembraria.');
    }
    avaliarSenha();

    if(!aceite.checked){
      reprovar('fieldAceite', 'aceiteErro', 'É preciso aceitar os termos para continuar.');
    }

    if(primeiroInvalido){
      primeiroInvalido.focus();
      return;
    }

    /* POST /auth/registrar. A validação que vale é do servidor: o
       que roda acima é só formato, para não gastar uma ida à rede
       com algo que dá para ver daqui. */
    btnCriar.classList.add('is-loading');
    btnCriar.disabled = true;

    API.chamar('/auth/registrar', {
      corpo: {
        nome:   nome.value.trim(),
        email:  email.value.trim(),
        senha:  senha.value,
        aceite: true
      }
    }).then(function(r){
      // O formulário preenchido continua ao fundo, atrás da modal
      abrirModal(r.enviado);
    }).catch(function(falha){
      if(falha.rede){
        alertOffline.hidden = false;
        return;
      }

      /* CAD-CONTA-003 — aqui a existência da conta É revelada, ao
         contrário do login: sem isso o cadastro vira beco sem saída. */
      if(falha.status === 409){
        alertDuplicado.hidden = false;
        alertDuplicado.scrollIntoView({ block:'nearest', behavior:'smooth' });
        email.focus();
        return;
      }

      /* A API devolve {campo, mensagem}; a tela já sabe marcar o
         campo certo com essa dupla. */
      var mapa = {
        nome:  ['fieldNome',  'nomeErro'],
        email: ['fieldEmail', 'emailErro'],
        senha: ['fieldSenha', 'senhaErro'],
        aceite:['fieldAceite','aceiteErro']
      };
      var alvo = mapa[falha.campo];
      if(alvo){
        marcarErro(alvo[0], alvo[1], falha.message);
        var campo = document.getElementById(alvo[0]).querySelector('input');
        if(campo) campo.focus();
      } else {
        marcarErro('fieldEmail', 'emailErro', falha.message);
      }
    }).finally(function(){
      btnCriar.classList.remove('is-loading');
      btnCriar.disabled = false;
    });
  });

  /* ============================================================
     MODAL — verificação do e-mail do novo cadastro
     Mesmo componente do login: código de 6 dígitos, avanço
     automático entre os campos, colar o código inteiro e reenvio
     com contagem regressiva. Aqui ele confirma a conta criada.
     ============================================================ */
  /* Toda conta entra pela listagem de empresas — inclusive a recém
     criada, que a encontra vazia. É o estado vazio que convida a
     criar a primeira, e daí para o fluxo completo (EMP-LIST-004).

     A pessoa aprende primeiro onde fica a casa, depois o que colocar
     dentro. Cair direto no formulário de criação sem nunca ter visto
     a tela principal deixa quem desiste no meio sem saber para onde
     voltar. */
  var DESTINO   = 'empresas.html';
  var REENVIO_S = 30;

  var modal     = document.getElementById('codeModal');
  var codeForm  = document.getElementById('codeForm');
  var otp       = document.getElementById('otp');
  var digitos   = Array.prototype.slice.call(otp.querySelectorAll('.otp-input'));
  var erroCode  = document.getElementById('codeErro');
  var erroTexto = document.getElementById('codeErroTexto');
  var confirmarCodigo = document.getElementById('codeConfirm');
  var resend    = document.getElementById('codeResend');
  var contagem  = document.getElementById('codeCountdown');
  var timerId   = null;

  function carregando(botao, ligado){
    botao.classList.toggle('is-loading', ligado);
    botao.disabled = ligado;
  }

  function abrirModal(enviado){
    document.getElementById('codeEmail').textContent = email.value.trim();
    limparCodigo();
    erroCode.hidden = true;
    otp.classList.remove('is-error');

    /* Estado "integração indisponível": a conta foi criada e o
       código gerado, mas o provedor de e-mail não entregou. Dizer
       isso é melhor que deixar a pessoa esperando algo que não vem. */
    if(enviado === false){
      erroTexto.textContent = 'Não conseguimos enviar o código agora. Tente reenviar em instantes.';
      erroCode.hidden = false;
    }

    modal.showModal();
    digitos[0].focus();
    iniciarContagem();
  }

  function fecharModal(){
    if(modal.open) modal.close();
  }

  /* ---------- Campo de 6 dígitos ---------- */
  function limparCodigo(){
    digitos.forEach(function(d){ d.value = ''; d.disabled = false; });
    otp.classList.remove('is-error');
    erroCode.hidden = true;
    modal.classList.remove('is-verifying');
    carregando(confirmarCodigo, false);
  }

  function codigoAtual(){
    return digitos.map(function(d){ return d.value; }).join('');
  }

  digitos.forEach(function(input, i){
    input.addEventListener('input', function(){
      // Mantém só dígitos e avança sozinho para o próximo campo
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      otp.classList.remove('is-error');
      erroCode.hidden = true;
      if(input.value && i < digitos.length - 1) digitos[i + 1].focus();
    });

    input.addEventListener('keydown', function(e){
      if(e.key === 'Backspace' && !input.value && i > 0){
        digitos[i - 1].focus();
        digitos[i - 1].value = '';
        e.preventDefault();
      }
      if(e.key === 'ArrowLeft'  && i > 0)                   { digitos[i - 1].focus(); e.preventDefault(); }
      if(e.key === 'ArrowRight' && i < digitos.length - 1)  { digitos[i + 1].focus(); e.preventDefault(); }
    });

    // Colar o código inteiro em qualquer um dos campos distribui os dígitos
    input.addEventListener('paste', function(e){
      var texto = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if(!texto) return;
      e.preventDefault();
      texto.slice(0, digitos.length - i).split('').forEach(function(ch, k){
        digitos[i + k].value = ch;
      });
      var proximo = Math.min(i + texto.length, digitos.length - 1);
      digitos[proximo].focus();
    });
  });

  /* ---------- Confirmar → conclui o cadastro ---------- */
  codeForm.addEventListener('submit', function(e){
    e.preventDefault();
    var codigo = codigoAtual();

    if(codigo.length < digitos.length){
      otp.classList.add('is-error');
      erroTexto.textContent = 'Digite os 6 dígitos do código.';
      erroCode.hidden = false;
      (digitos.filter(function(d){ return !d.value; })[0] || digitos[0]).focus();
      return;
    }

    modal.classList.add('is-verifying');
    carregando(confirmarCodigo, true);

    API.chamar('/auth/otp/verificar', { corpo: { codigo: codigo } })
      .then(function(r){
        clearInterval(timerId);
        modal.close();
        /* Todo mundo entra pela listagem: com ou sem vínculo, é a
           mesma porta. Quem chega sem empresa encontra o estado
           vazio, que convida a criar a primeira. */
        window.location.href = DESTINO;
      })
      .catch(function(falha){
        if(falha.rede){
          modal.close();
          alertOffline.hidden = false;
          return;
        }
        /* 440 — o desafio expirou; recomeçar é o único caminho. */
        if(falha.status === 440){
          modal.close();
          marcarErro('fieldEmail', 'emailErro', 'A verificação expirou. Crie a conta novamente.');
          return;
        }
        otp.classList.add('is-error');
        erroTexto.textContent = falha.message;
        erroCode.hidden = false;
        limparCodigo();
        digitos[0].focus();
      })
      .finally(function(){
        modal.classList.remove('is-verifying');
        carregando(confirmarCodigo, false);
      });
  });

  /* ---------- Reenvio com contagem regressiva ---------- */
  function iniciarContagem(){
    var restante = REENVIO_S;
    resend.disabled = true;
    contagem.hidden = false;
    contagem.textContent = restante + 's';
    resend.firstChild.textContent = 'Reenviar código em ';

    clearInterval(timerId);
    timerId = setInterval(function(){
      restante -= 1;
      if(restante <= 0){
        clearInterval(timerId);
        resend.disabled = false;
        resend.firstChild.textContent = 'Reenviar código';
        contagem.textContent = '';
        return;
      }
      contagem.textContent = restante + 's';
    }, 1000);
  }

  resend.addEventListener('click', function(){
    limparCodigo();
    erroCode.hidden = true;
    otp.classList.remove('is-error');
    digitos[0].focus();
    iniciarContagem();

    API.chamar('/auth/otp/reenviar', { corpo: {} })
      .then(function(r){
        if(r.enviado === false){
          erroTexto.textContent = 'Não conseguimos enviar o código agora. Tente novamente em instantes.';
          erroCode.hidden = false;
        }
      })
      .catch(function(falha){
        if(falha.status === 440){
          modal.close();
          marcarErro('fieldEmail', 'emailErro', 'A verificação expirou. Crie a conta novamente.');
          return;
        }
        erroTexto.textContent = falha.message;
        erroCode.hidden = false;
      });
  });

  /* ---------- Fechar ---------- */
  document.getElementById('codeClose').addEventListener('click', fecharModal);
  document.getElementById('codeBack').addEventListener('click', fecharModal);

  // Clique no backdrop (fora do conteúdo) fecha
  modal.addEventListener('click', function(e){
    var r = modal.getBoundingClientRect();
    var dentro = e.clientX >= r.left && e.clientX <= r.right &&
                 e.clientY >= r.top  && e.clientY <= r.bottom;
    if(!dentro) fecharModal();
  });

  // Esc já fecha sozinho no <dialog>; aqui só limpamos o estado
  modal.addEventListener('close', function(){
    clearInterval(timerId);
    limparCodigo();
    btnCriar.focus();
  });
})();
