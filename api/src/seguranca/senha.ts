/* ============================================================
   Senha — hash e política
   ============================================================
   Regras CAD-SENHA-001 a 006.

   A política segue o NIST SP 800-63B Rev 4: comprimento mínimo e
   conferência contra listas de vazamento, SEM exigir maiúscula,
   número ou símbolo. A norma proíbe essas exigências porque elas
   produzem "Senha1!" e barram "cavalo bateria grampo correto".

   O piso é 8 porque há segundo fator (ACS-LOGIN-002). Em sistema
   de fator único a recomendação sobe para 15.
   ============================================================ */

import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { env } from '../env.js';

export const MINIMO = 8;
export const MAXIMO = 256; // aceita frases longas; corta abuso de payload

/* Amostra local. A conferência que realmente importa é contra a
   base de vazamentos — esta lista só cobre o caso de a rede estar
   indisponível. */
const COMUNS = new Set([
  'senha', 'senha123', 'senha1234', '12345678', '123456789', '1234567890',
  'password', 'password1', 'password123', 'qwerty123', 'abc12345',
  'admin123', 'iloveyou', '11111111', '00000000', 'brasil123',
  'plataforma', 'designer', 'flamengo', 'corinthians', 'principal',
]);

export async function hashear(senha: string): Promise<string> {
  return argon2.hash(senha, {
    type: argon2.argon2id,
    memoryCost: env.ARGON_MEMORIA,
    timeCost: env.ARGON_ITERACOES,
    parallelism: env.ARGON_PARALELISMO,
  });
}

export async function conferir(hash: string, senha: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    /* Hash corrompido ou de formato desconhecido: trata como
       senha errada em vez de derrubar a requisição. */
    return false;
  }
}

/* ------------------------------------------------------------
   Have I Been Pwned, com k-anonymity: enviamos apenas os cinco
   primeiros caracteres do SHA-1 e recebemos a faixa inteira de
   sufixos. A senha em si nunca sai daqui, nem o hash completo.
   ------------------------------------------------------------ */
async function vazada(senha: string): Promise<boolean> {
  if (env.VERIFICAR_VAZAMENTO === 'nao') return false;

  const sha1 = createHash('sha1').update(senha, 'utf8').digest('hex').toUpperCase();
  const prefixo = sha1.slice(0, 5);
  const sufixo = sha1.slice(5);

  try {
    const controle = AbortSignal.timeout(2500);
    const resposta = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controle,
    });
    if (!resposta.ok) return false;

    const corpo = await resposta.text();
    return corpo.split('\n').some((linha) => {
      const [suf, cont] = linha.trim().split(':');
      return suf === sufixo && Number(cont) > 0;
    });
  } catch {
    /* Serviço fora do ar não pode impedir cadastro. A lista local
       continua valendo como rede de segurança. */
    return false;
  }
}

export type Reprovacao = { campo: 'senha'; mensagem: string };

export async function validarPolitica(senha: string, contexto: string[] = []): Promise<Reprovacao | null> {
  if (senha.length < MINIMO) {
    return { campo: 'senha', mensagem: `A senha precisa ter pelo menos ${MINIMO} caracteres.` };
  }
  if (senha.length > MAXIMO) {
    return { campo: 'senha', mensagem: `A senha pode ter no máximo ${MAXIMO} caracteres.` };
  }

  const normalizada = senha.toLowerCase().replace(/\s+/g, '');

  if (COMUNS.has(normalizada)) {
    return {
      campo: 'senha',
      mensagem: 'Essa senha é comum demais. Tente uma frase que só você lembraria.',
    };
  }

  /* Termos do próprio contexto — nome e e-mail da pessoa, nome do
     produto. O NIST pede isso explicitamente: "context-specific
     words" entram na blocklist. */
  for (const termo of contexto) {
    const limpo = termo.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (limpo.length >= 4 && normalizada.includes(limpo)) {
      return {
        campo: 'senha',
        mensagem: 'A senha não pode conter seu nome ou e-mail.',
      };
    }
  }

  if (await vazada(senha)) {
    return {
      campo: 'senha',
      mensagem: 'Essa senha apareceu em vazamentos conhecidos. Escolha outra.',
    };
  }

  return null;
}
