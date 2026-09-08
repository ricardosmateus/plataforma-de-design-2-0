/* ============================================================
   API — camada de acesso
   ============================================================
   Um lugar só para saber onde a API mora, como os erros chegam e
   como a sessão viaja. As telas não falam com fetch diretamente.

   SESSÃO EM COOKIE, NÃO EM localStorage
   A API devolve os tokens em cookie httpOnly, que o JavaScript
   desta página não enxerga — é isso que impede um XSS de levar a
   sessão embora. Em troca, todo pedido precisa de
   `credentials: 'include'`, senão o navegador não manda o cookie.

   SOBRE PORTA DIFERENTE
   localhost:8000 e localhost:3333 são origens diferentes, mas o
   mesmo *site* — e SameSite olha para o site, não para a porta.
   Por isso o cookie funciona em desenvolvimento. Em produção, a
   mesma lógica exige que frontend e API dividam o domínio
   registrável (app.exemplo.com e api.exemplo.com). Domínios
   distintos, como vercel.app e railway.app, quebram isso.
   ============================================================ */

window.API = (function () {
  'use strict';

  /* Onde a API mora, em ordem de precedência:

       1. <meta name="api-base" content="https://api.exemplo.com">
          no <head> da página — é assim que se troca de ambiente sem
          tocar em JavaScript nem em build.
       2. localhost:3333 quando a página roda em localhost.
       3. mesma origem, que é o caso de API e frontend atrás do
          mesmo domínio em produção.

     Endereço fixo no código é o que faz alguém publicar apontando
     para o próprio computador. */
  const declarado = document.querySelector('meta[name="api-base"]');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);

  /* Quando a própria API serve esta página (porta 3333), falar com
     a mesma origem — pedir para localhost:3333 de dentro de
     localhost:3333 funcionaria, mas seria uma volta desnecessária e
     esconderia o fato de que já estamos em casa. */
  const servidoPelaApi = local && location.port === '3333';

  const BASE = (declarado && declarado.content.trim())
    || (local && !servidoPelaApi ? 'http://localhost:3333' : '');

  /* Erro normalizado: as telas só precisam olhar `campo`, `status`
     e `mensagem`, sem saber se veio da rede ou do servidor. */
  function Falha(mensagem, extras) {
    const e = new Error(mensagem);
    Object.assign(e, extras);
    return e;
  }

  async function chamar(caminho, opcoes) {
    const { corpo, metodo } = opcoes || {};

    /* FormData é para os envios com arquivo (multipart/form-data,
       ex.: POST /empresas com logotipo — EMP-CRIA-003). Nesse caso o
       corpo já vai pronto, e o Content-Type NÃO pode ser setado à
       mão: é o próprio navegador que precisa escrever o boundary do
       multipart, e um header manual sem boundary quebra o envio. */
    const ehFormData = typeof FormData !== 'undefined' && corpo instanceof FormData;
    let resposta;

    try {
      resposta = await fetch(BASE + caminho, {
        method: metodo || (corpo ? 'POST' : 'GET'),
        credentials: 'include',
        headers: (corpo && !ehFormData) ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? (ehFormData ? corpo : JSON.stringify(corpo)) : undefined,
      });
    } catch (_) {
      /* Rede fora, API fora, DNS, CORS bloqueado — do ponto de
         vista da tela é tudo a mesma coisa: não deu para falar com
         o servidor. */
      throw Falha('Não foi possível falar com o servidor.', { rede: true, status: 0, campo: null });
    }

    let dados = null;
    try { dados = await resposta.json(); } catch (_) { /* 204 ou corpo vazio */ }

    if (!resposta.ok) {
      throw Falha(
        (dados && dados.mensagem) || 'Erro inesperado. Tente novamente.',
        {
          status: resposta.status,
          campo: (dados && dados.campo) || null,
          dados: dados || {},
        }
      );
    }

    return dados || {};
  }

  /* ------------------------------------------------------------
     Para respostas que NÃO são JSON — hoje só o pacote de contexto
     em markdown (PACOTE-CONT-005).
     ------------------------------------------------------------
     Devolve a `Response` crua, porque quem chama precisa do corpo
     como blob e dos cabeçalhos (o nome do arquivo vem no
     Content-Disposition). O tratamento de erro segue igual ao de
     `chamar`: um 401 daqui também passa pela renovação silenciosa
     de quem chamou, e um erro do servidor ainda vem em JSON.
     ------------------------------------------------------------ */
  async function bruto(caminho, opcoes) {
    const { metodo } = opcoes || {};
    let resposta;

    try {
      resposta = await fetch(BASE + caminho, {
        method: metodo || 'GET',
        credentials: 'include',
      });
    } catch (_) {
      throw Falha('Não foi possível falar com o servidor.', { rede: true, status: 0, campo: null });
    }

    if (!resposta.ok) {
      /* O corpo de erro continua sendo JSON, mesmo quando o corpo de
         sucesso não é. */
      let dados = null;
      try { dados = await resposta.json(); } catch (_) { /* corpo vazio */ }
      throw Falha(
        (dados && dados.mensagem) || 'Erro inesperado. Tente novamente.',
        { status: resposta.status, campo: (dados && dados.campo) || null, dados: dados || {} }
      );
    }

    return resposta;
  }

  /* ------------------------------------------------------------
     `buscar` — fetch cru COM renovação silenciosa
     ------------------------------------------------------------
     Existe porque a renovação estava sendo reimplementada em cada
     tela, e nem todas a implementavam. `grafo.js`,
     `sobre-empresa-semana2.js` e `creditos.js` chamavam `fetch`
     direto: com o token vencido, cada uma falhava sozinha enquanto a
     vizinha na MESMA página se recuperava. O sintoma era uma tela
     meio carregada, sem erro que explicasse por quê.

     Diferente de `chamar`, devolve a `Response` crua e NÃO lança em
     erro — é o que as telas que usam `r.ok` esperam, e o que permite
     trocar o `fetch` delas por esta função sem reescrever o resto.

     Um 401 não é "vá para o login": é "o token de acesso venceu".
     Só depois de a renovação também falhar é que a sessão acabou de
     verdade — e aí o 401 original volta, para quem chamou decidir. */
  async function buscar(caminho, jaRenovou) {
    const resposta = await fetch(BASE + caminho, { credentials: 'include' });
    if (resposta.status !== 401 || jaRenovou) return resposta;

    let renovou = false;
    try {
      const nova = await fetch(BASE + '/auth/sessao', { credentials: 'include' });
      renovou = nova.ok;
    } catch (_) { /* rede caiu: devolve o 401 original */ }

    /* Sem `return` da renovação: repetir aqui viraria duas chamadas
       por ciclo numa tela que faz polling. */
    return renovou ? buscar(caminho, true) : resposta;
  }

  return { chamar, bruto, buscar, BASE };
})();
