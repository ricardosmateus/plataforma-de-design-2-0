/* ============================================================
   Envio de e-mail — adaptador
   ============================================================
   Dois drivers atrás da mesma interface:

     console  escreve o código no log. É o de desenvolvimento, e
              faz o fluxo inteiro funcionar sem conta em lugar
              nenhum.
     resend   envia de verdade.

   Trocar é uma variável de ambiente. Nenhuma rota conhece o
   fornecedor, então acrescentar SES ou Postmark depois é escrever
   um arquivo, não mexer no fluxo.
   ============================================================ */

import { env } from '../env.js';

export type Mensagem = {
  para: string;
  assunto: string;
  texto: string;
  html: string;
};

export interface Correio {
  enviar(mensagem: Mensagem): Promise<void>;
}

/* ------------------------------------------------------------
   Desenvolvimento
   ------------------------------------------------------------ */
class CorreioConsole implements Correio {
  async enviar(mensagem: Mensagem): Promise<void> {
    console.log(
      `\n┌─ e-mail (driver console) ─────────────────────────\n` +
      `│ para:    ${mensagem.para}\n` +
      `│ assunto: ${mensagem.assunto}\n` +
      `│\n` +
      mensagem.texto.split('\n').map((l) => `│ ${l}`).join('\n') +
      `\n└───────────────────────────────────────────────────\n`
    );
  }
}

/* ------------------------------------------------------------
   Produção
   ------------------------------------------------------------ */
class CorreioResend implements Correio {
  constructor(private chave: string) {}

  async enviar(mensagem: Mensagem): Promise<void> {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_REMETENTE,
        to: [mensagem.para],
        subject: mensagem.assunto,
        text: mensagem.texto,
        html: mensagem.html,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      /* Estourar aqui é proposital: a rota traduz isso no estado
         "integração indisponível", em vez de fingir que o código
         foi enviado e deixar a pessoa esperando um e-mail que
         nunca chega. */
      throw new Error(`Resend recusou o envio (${resposta.status}): ${detalhe}`);
    }
  }
}

/* A ausência de chave já é barrada na partida, em env.ts — inclusive
   o caso de string vazia, que `??` deixava passar. Aqui só resta
   construir o driver escolhido. */
export const correio: Correio =
  env.EMAIL_DRIVER === 'resend'
    ? new CorreioResend(String(env.RESEND_API_KEY))
    : new CorreioConsole();

/* ------------------------------------------------------------
   Mensagem do código de verificação
   ------------------------------------------------------------ */
export function mensagemCodigo(codigo: string, proposito: 'login' | 'cadastro'): Omit<Mensagem, 'para'> {
  const contexto =
    proposito === 'cadastro'
      ? 'para confirmar seu e-mail e ativar sua conta'
      : 'para entrar na sua conta a partir deste dispositivo';

  const minutos = env.OTP_MINUTOS;

  return {
    assunto: `${codigo} é o seu código de verificação`,
    texto:
      `Seu código de verificação é ${codigo}.\n\n` +
      `Use-o ${contexto}. Ele vale por ${minutos} minutos e só pode ser usado uma vez.\n\n` +
      `Se não foi você que pediu, ignore este e-mail — nada acontece sem o código.\n`,
    html:
      `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px">` +
      `<p style="font-size:16px;line-height:24px;color:#181D27">Seu código de verificação é:</p>` +
      `<p style="font-size:32px;line-height:40px;font-weight:700;letter-spacing:.12em;` +
      `font-variant-numeric:tabular-nums;color:#181D27;margin:16px 0">${codigo}</p>` +
      `<p style="font-size:14px;line-height:20px;color:#535862">Use-o ${contexto}. ` +
      `Ele vale por ${minutos} minutos e só pode ser usado uma vez.</p>` +
      `<p style="font-size:14px;line-height:20px;color:#717680">Se não foi você que pediu, ` +
      `ignore este e-mail — nada acontece sem o código.</p></div>`,
  };
}
