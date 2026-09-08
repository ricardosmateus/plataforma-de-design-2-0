/* ============================================================
   LOGIN — comportamento de tela
   ============================================================
   Ligado na API (api/). Não há mais simulação: quem decide se a
   credencial vale, se a conta está suspensa e se este dispositivo
   já foi verificado é o servidor.

   Regras — Regras_de_negocio/modulos/acesso/login.md:
     ACS-LOGIN-002  OTP só em dispositivo novo   (decidido na API)
     ACS-LOGIN-004  erro não revela se o e-mail existe
     ACS-LOGIN-005  bloqueio após 3 tentativas   (429 da API)
     ACS-LOGIN-009  suspensão revelada após a credencial validada
     ACS-LOGIN-010  cascata de roteamento (§4)
     ACS-LOGIN-012  suspensão por violação ou inadimplência
     ACS-LOGIN-014  destino retomado aceita só caminho relativo
     ACS-LOGIN-015  a cascata é avaliada antes do segundo fator
     ACS-LOGIN-016  destino retomado só vale para quem tem vínculo
     ACS-SESSAO-002 sessão expirada preserva o destino pretendido
     ACS-SESSAO-004 vínculo revogado → estado sem permissão

   O que a tela NÃO faz mais, porque virou responsabilidade do
   servidor: reconhecer o dispositivo (cookie assinado pela API),
   contar tentativas e guardar qualquer token. A sessão vive em
   cookie httpOnly — esta página não a alcança, e é essa a graça.

   Estados de chegada, por parâmetro na URL:
     ?motivo=sessao-expirada&destino=projetos.html
     ?motivo=sem-permissao
     ?motivo=suspenso&tipo=violacao|inadimplencia
   ============================================================ */

(function () {
  'use strict';

  /* ---- Rotas da cascata (§4 das regras) ---------------------
     `existe:false` marca tela ainda não construída. Quando ela
     nascer, vire para true e apague o andaime do HTML. */
  const ROTAS = {
    admin:    { href: 'admin.html',    nome: 'Console administrativo', existe: false },
    empresas: { href: 'empresas.html', nome: 'Minhas empresas',        existe: true  },
  };

  /* ---- Elementos -------------------------------------------- */
  const form        = document.getElementById('loginForm');
  const email       = document.getElementById('email');
  const senha       = document.getElementById('senha');
  const fieldEmail  = document.getElementById('fieldEmail');
  const fieldSenha  = document.getElementById('fieldSenha');
  const emailErro   = document.getElementById('emailErro');
  const senhaErro   = document.getElementById('senhaErro');
  const toggleSenha = document.getElementById('toggleSenha');
  const btnEntrar   = document.getElementById('btnEntrar');
  const lembrar     = document.getElementById('lembrar');
  const linkRecuperar = document.getElementById('linkRecuperar');

  const alertas = {
    credencial:   document.getElementById('alertCredencial'),
    servidor:     document.getElementById('alertServidor'),
    bloqueio:     document.getElementById('alertBloqueio'),
    recuperacao:  document.getElementById('alertRecuperacao'),
    offline:      document.getElementById('alertOffline'),
    expirada:     document.getElementById('alertSessaoExpirada'),
    semPermissao: document.getElementById('alertSemPermissao'),
    violacao:     document.getElementById('alertSuspensaoViolacao'),
    pagamento:    document.getElementById('alertSuspensaoPagamento'),
    telaPendente: document.getElementById('alertTelaPendente'),
  };
  const bloqueioContagem = document.getElementById('bloqueioContagem');
  const telaPendenteNome = document.getElementById('telaPendenteNome');

  const modal         = document.getElementById('codeModal');
  const codeForm      = document.getElementById('codeForm');
  const codeEmail     = document.getElementById('codeEmail');
  const otp           = document.getElementById('otp');
  const otpInputs     = Array.from(otp.querySelectorAll('.otp-input'));
  const codeErro      = document.getElementById('codeErro');
  const codeErroTexto = document.getElementById('codeErroTexto');
  const codeConfirm   = document.getElementById('codeConfirm');
  const codeResend    = document.getElementById('codeResend');
  const codeClose     = document.getElementById('codeClose');
  const codeBack      = document.getElementById('codeBack');

  /* ---- Estado ----------------------------------------------- */
  let timerReenvio = null;
  let timerBloqueio = null;
  let destinoPretendido = null;

  /* ============================================================
     Utilitários
     ============================================================ */

  function mostrar(el)  { if (el) el.hidden = false; }
  function esconder(el) { if (el) el.hidden = true; }

  /* Alertas de chegada (sessão expirada, sem permissão) sobrevivem à
     primeira tentativa de login; os de resultado, não. */
  function limparAlertasDeResultado() {
    ['credencial', 'servidor', 'bloqueio', 'recuperacao', 'violacao', 'pagamento', 'telaPendente']
      .forEach(function (k) { esconder(alertas[k]); });
  }

  function carregando(botao, ativo) {
    botao.classList.toggle('is-loading', ativo);
    botao.disabled = ativo;
  }

  function travarFormulario(travado) {
    form.classList.toggle('is-locked', travado);
    btnEntrar.disabled = travado;
  }

  function contagem(segundos, onTick, onFim) {
    let restante = segundos;
    onTick(restante);
    const id = setInterval(function () {
      restante -= 1;
      if (restante <= 0) {
        clearInterval(id);
        onFim();
      } else {
        onTick(restante);
      }
    }, 1000);
    return id;
  }

  /* ============================================================
     CASCATA DE ROTEAMENTO — ACS-LOGIN-010, §4 das regras
     ============================================================
     A ORDEM É A REGRA: a primeira condição verdadeira decide.
     Mexer na ordem aqui é mexer na regra de negócio.

     As duas primeiras condições a API já resolve antes de devolver
     uma conta — ficam aqui como segunda linha de defesa, para o
     caso de uma versão futura do servidor deixar passar.

     A cascata responde "você pode entrar?", não "o que você vê lá
     dentro". Antes ela também escolhia entre criar-empresa,
     painel-especialista e a listagem conforme vínculos e perfil —
     três rotas para três situações que a própria listagem já sabe
     distinguir pelas variantes do estado vazio (EMP-LIST-003 e
     EMP-LIST-005). Decidir isso aqui obrigava o login a conhecer
     regras do módulo de empresas.
     ============================================================ */

  function decidirAcesso(conta) {
    // 1 — e-mail não verificado
    if (!conta.email_verificado) return { acao: 'verificar-email' };
    // 2 — conta suspensa
    if (conta.suspenso_em)       return { acao: 'suspenso', motivo: conta.suspensao_motivo };
    // 3 — administrador da plataforma
    if (conta.administrador)     return { acao: 'navegar', rota: ROTAS.admin };
    // 4 — todos os demais entram pela listagem de empresas
    return { acao: 'navegar', rota: ROTAS.empresas };
  }

  function executarAcesso(conta) {
    const decisao = decidirAcesso(conta);

    if (decisao.acao === 'verificar-email') { abrirModal('cadastro'); return; }
    if (decisao.acao === 'suspenso')        { suspender(decisao.motivo); return; }

    /* ACS-LOGIN-016 — destino retomado só vale para quem tem
       vínculo; sem empresa, a tela interna daria "sem permissão". */
    if (destinoPretendido && conta.vinculos > 0) {
      window.location.href = destinoPretendido;
      return;
    }

    if (!decisao.rota.existe) {
      /* ANDAIME — remover quando as telas existirem. */
      telaPendenteNome.textContent = decisao.rota.nome;
      mostrar(alertas.telaPendente);
      return;
    }

    window.location.href = decisao.rota.href;
  }

  /* ============================================================
     Estados de chegada — ACS-SESSAO-002 e ACS-SESSAO-004
     ============================================================ */

  (function estadoDeChegada() {
    const params = new URLSearchParams(window.location.search);

    /* ACS-LOGIN-014 — só caminho relativo interno. Aceitar URL
       absoluta abriria um open redirect, que é como se rouba sessão
       com link de phishing. */
    const destino = params.get('destino');
    if (destino && /^[\w.-]+\.html$/.test(destino)) destinoPretendido = destino;

    const motivo = params.get('motivo');
    if (motivo === 'sessao-expirada') mostrar(alertas.expirada);
    if (motivo === 'sem-permissao')   mostrar(alertas.semPermissao);
    /* Chegou expulso da listagem por conta suspensa (403 do
       GET /empresas). Quem explica motivo e saída é esta tela,
       não a listagem — ACS-LOGIN-012. */
    if (motivo === 'suspenso')        suspender(params.get('tipo'));
  })();

  /* ============================================================
     Rede
     ============================================================ */

  function offline() { return navigator.onLine === false; }

  function sincronizarRede() {
    if (offline()) {
      mostrar(alertas.offline);
      travarFormulario(true);
    } else {
      esconder(alertas.offline);
      const travadoPorOutroMotivo =
        !alertas.bloqueio.hidden || !alertas.violacao.hidden || !alertas.pagamento.hidden;
      if (!travadoPorOutroMotivo) travarFormulario(false);
    }
  }

  window.addEventListener('online', sincronizarRede);
  window.addEventListener('offline', sincronizarRede);
  sincronizarRede();

  /* ============================================================
     Validação de formato — a de verdade é no servidor
     ============================================================ */

  function validarEmail() {
    const valor = email.value.trim();
    const ok = valor !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
    fieldEmail.classList.toggle('field--error', !ok);
    emailErro.hidden = ok;
    email.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  function validarSenha() {
    const ok = senha.value !== '';
    fieldSenha.classList.toggle('field--error', !ok);
    senhaErro.hidden = ok;
    senha.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  ['blur', 'input'].forEach(function (evento) {
    email.addEventListener(evento, function () {
      if (fieldEmail.classList.contains('field--error')) validarEmail();
    });
    senha.addEventListener(evento, function () {
      if (fieldSenha.classList.contains('field--error')) validarSenha();
    });
  });

  /* ============================================================
     Mostrar / ocultar senha
     ============================================================ */

  toggleSenha.addEventListener('click', function () {
    const visivel = senha.type === 'text';
    senha.type = visivel ? 'password' : 'text';
    toggleSenha.setAttribute('aria-pressed', String(!visivel));
    toggleSenha.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    const fim = senha.value.length;
    senha.focus();
    senha.setSelectionRange(fim, fim);
  });

  /* ============================================================
     Bloqueio e suspensão
     ============================================================ */

  /* A contagem vem do servidor: ele é quem sabe há quanto tempo as
     tentativas começaram. Confiar num contador do navegador seria
     deixar o atacante escolher quando o bloqueio acaba. */
  function bloquear(segundos) {
    limparAlertasDeResultado();
    mostrar(alertas.bloqueio);
    travarFormulario(true);

    clearInterval(timerBloqueio);
    timerBloqueio = contagem(
      segundos > 0 ? segundos : 30,
      function (s) { bloqueioContagem.textContent = s + 's'; },
      function () {
        esconder(alertas.bloqueio);
        travarFormulario(false);
        email.focus();
      }
    );
  }

  function suspender(motivo) {
    limparAlertasDeResultado();
    mostrar(motivo === 'inadimplencia' ? alertas.pagamento : alertas.violacao);
    travarFormulario(true);
  }

  /* Traduz a falha da API em estado de tela. Um lugar só, para as
     duas chamadas que podem falhar do mesmo jeito. */
  function tratarFalha(falha, aoInvalidar) {
    if (falha.rede) { mostrar(alertas.offline); return; }

    if (falha.status === 429) {
      bloquear(Number(falha.dados.segundosRestantes) || 30);
      return;
    }
    if (falha.status === 403 && falha.dados.suspensao) {
      suspender(falha.dados.suspensao);
      return;
    }

    /* 5xx NÃO é credencial errada.
       Antes de 22/08/2026 tudo o que não fosse rede, 429 ou 403 caía
       em "e-mail ou senha incorretos" — inclusive um 500. A pessoa
       com a senha certa era informada de que a senha estava errada,
       e ia trocar a senha para resolver um problema do servidor.
       Mesmo defeito de fundo da EMP-LIST-010: transformar "não deu
       para saber" em uma afirmação específica e falsa. */
    if (falha.status >= 500) {
      mostrar(alertas.servidor);
      return;
    }

    if (typeof aoInvalidar === 'function') { aoInvalidar(falha); return; }

    mostrar(alertas.credencial);
  }

  /* ============================================================
     Envio do formulário
     ============================================================ */

  form.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    if (offline()) { sincronizarRede(); return; }

    limparAlertasDeResultado();

    const okEmail = validarEmail();
    const okSenha = validarSenha();
    if (!okEmail || !okSenha) {
      (okEmail ? senha : email).focus();
      return;
    }

    carregando(btnEntrar, true);

    try {
      const r = await API.chamar('/auth/login', {
        corpo: {
          email: email.value.trim(),
          senha: senha.value,
          lembrarDeMim: !!(lembrar && lembrar.checked),
        },
      });

      if (r.proximo === 'entrar') {
        executarAcesso(r.conta);
      } else {
        /* Dispositivo novo, ou e-mail ainda por confirmar: em ambos
           os casos a API já disparou o código. */
        abrirModal(r.proposito || 'login', r.enviado);
      }
    } catch (falha) {
      tratarFalha(falha, function () {
        /* ACS-LOGIN-004 — a mensagem não distingue e-mail inexistente
           de senha errada; a API já devolve genérica. */
        mostrar(alertas.credencial);
        senha.value = '';
        senha.focus();
      });
    } finally {
      carregando(btnEntrar, false);
    }
  });

  /* ============================================================
     Recuperação de senha — endpoint ainda não existe (Fase 2 do
     roadmap). A tela avisa em vez de prometer.
     ============================================================ */

  linkRecuperar.addEventListener('click', function (evento) {
    evento.preventDefault();
    if (offline()) { sincronizarRede(); return; }

    limparAlertasDeResultado();
    if (!validarEmail()) { email.focus(); return; }

    mostrar(alertas.recuperacao);
    alertas.recuperacao.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* ============================================================
     Modal de verificação por código
     ============================================================ */

  function abrirModal(proposito, enviado) {
    codeEmail.textContent = email.value.trim();
    limparOtp();
    esconder(codeErro);
    otp.classList.remove('is-error');

    /* Estado "integração indisponível": a conta existe e o código
       foi gerado, mas o provedor de e-mail não entregou. Dizer isso
       é melhor que deixar a pessoa esperando algo que não vem. */
    if (enviado === false) {
      codeErroTexto.textContent =
        'Não conseguimos enviar o código agora. Tente reenviar em instantes.';
      mostrar(codeErro);
    }

    modal.dataset.proposito = proposito || 'login';
    modal.showModal();
    otpInputs[0].focus();
    iniciarCooldown(30);
  }

  function fecharModal() {
    clearInterval(timerReenvio);
    modal.close();
  }

  function limparOtp() { otpInputs.forEach(function (i) { i.value = ''; }); }
  function lerCodigo() { return otpInputs.map(function (i) { return i.value; }).join(''); }

  function iniciarCooldown(segundos) {
    codeResend.disabled = true;
    clearInterval(timerReenvio);
    timerReenvio = contagem(
      segundos,
      function (s) {
        /* O elemento é recriado a cada reenvio, por isso é buscado a
           cada tique em vez de guardado numa referência. */
        const alvo = document.getElementById('codeCountdown');
        if (alvo) alvo.textContent = s + 's';
      },
      function () {
        codeResend.disabled = false;
        codeResend.textContent = 'Reenviar código';
      }
    );
  }

  /* ---- Digitação nos seis campos ---------------------------- */

  otpInputs.forEach(function (campo, indice) {
    campo.addEventListener('input', function () {
      campo.value = campo.value.replace(/\D/g, '').slice(-1);
      otp.classList.remove('is-error');
      esconder(codeErro);
      if (campo.value && indice < otpInputs.length - 1) otpInputs[indice + 1].focus();
    });

    campo.addEventListener('keydown', function (evento) {
      if (evento.key === 'Backspace' && campo.value === '' && indice > 0) {
        evento.preventDefault();
        otpInputs[indice - 1].focus();
        otpInputs[indice - 1].value = '';
      }
      if (evento.key === 'ArrowLeft' && indice > 0) {
        evento.preventDefault();
        otpInputs[indice - 1].focus();
      }
      if (evento.key === 'ArrowRight' && indice < otpInputs.length - 1) {
        evento.preventDefault();
        otpInputs[indice + 1].focus();
      }
    });

    /* Colar o código inteiro em qualquer campo distribui os dígitos
       a partir dali — é como as pessoas colam direto do e-mail. */
    campo.addEventListener('paste', function (evento) {
      evento.preventDefault();
      const texto = (evento.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '');
      if (!texto) return;
      texto.split('').forEach(function (digito, deslocamento) {
        const alvo = otpInputs[indice + deslocamento];
        if (alvo) alvo.value = digito;
      });
      otpInputs[Math.min(indice + texto.length, otpInputs.length - 1)].focus();
    });
  });

  /* ---- Confirmar o código ----------------------------------- */

  function erroNoCodigo(mensagem) {
    otp.classList.add('is-error');
    codeErroTexto.textContent = mensagem;
    mostrar(codeErro);
    limparOtp();
    otpInputs[0].focus();
  }

  codeForm.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    if (offline()) { fecharModal(); sincronizarRede(); return; }

    const codigo = lerCodigo();
    if (codigo.length < 6) {
      otp.classList.add('is-error');
      codeErroTexto.textContent = 'Digite os 6 dígitos do código.';
      mostrar(codeErro);
      return;
    }

    carregando(codeConfirm, true);
    modal.classList.add('is-verifying');

    try {
      const r = await API.chamar('/auth/otp/verificar', { corpo: { codigo: codigo } });
      clearInterval(timerReenvio);
      modal.close();
      executarAcesso(r.conta);
    } catch (falha) {
      if (falha.rede) { fecharModal(); mostrar(alertas.offline); return; }

      /* 440 — o desafio expirou; não há como continuar daqui. */
      if (falha.status === 440) {
        fecharModal();
        limparAlertasDeResultado();
        mostrar(alertas.expirada);
        senha.value = '';
        email.focus();
        return;
      }
      if (falha.status === 403 && falha.dados.suspensao) {
        fecharModal();
        suspender(falha.dados.suspensao);
        return;
      }
      erroNoCodigo(falha.message);
    } finally {
      carregando(codeConfirm, false);
      modal.classList.remove('is-verifying');
    }
  });

  /* ---- Reenviar o código ------------------------------------ */

  codeResend.addEventListener('click', async function () {
    if (codeResend.disabled) return;

    codeResend.innerHTML = 'Reenviar código em <span id="codeCountdown">30s</span>';
    limparOtp();
    esconder(codeErro);
    otp.classList.remove('is-error');
    otpInputs[0].focus();
    iniciarCooldown(30);

    try {
      const r = await API.chamar('/auth/otp/reenviar', { corpo: {} });
      if (r.enviado === false) {
        codeErroTexto.textContent =
          'Não conseguimos enviar o código agora. Tente novamente em instantes.';
        mostrar(codeErro);
      }
    } catch (falha) {
      /* O servidor manda a espera restante quando o pedido veio cedo
         demais — obedecer a ele mantém tela e API em acordo. */
      if (falha.status === 429 && falha.dados.segundosRestantes) {
        iniciarCooldown(Number(falha.dados.segundosRestantes));
        return;
      }
      if (falha.status === 440) {
        fecharModal();
        limparAlertasDeResultado();
        mostrar(alertas.expirada);
        return;
      }
      codeErroTexto.textContent = falha.message;
      mostrar(codeErro);
    }
  });

  /* ---- Fechar ----------------------------------------------- */

  codeClose.addEventListener('click', fecharModal);
  codeBack.addEventListener('click', fecharModal);

  modal.addEventListener('close', function () { clearInterval(timerReenvio); });

  /* O <dialog> ocupa a tela inteira: o alvo só é o próprio dialog
     quando o clique cai no véu, fora do painel. */
  modal.addEventListener('click', function (evento) {
    if (evento.target === modal) fecharModal();
  });
})();
