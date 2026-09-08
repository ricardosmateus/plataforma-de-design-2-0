/* ============================================================
   Sessão — token de acesso, refresh e dispositivo confiável
   ============================================================
   ACS-SESSAO-001 a 004, ACS-LOGIN-008 e 011.

   DECISÃO: os dois tokens viajam em cookie httpOnly, não no corpo
   da resposta. O frontend é HTML estático sem build; se ele
   precisasse guardar o token, o único lugar seria localStorage, e
   qualquer XSS levaria a sessão junto. Em cookie httpOnly, o
   JavaScript da página não alcança o token nem se for
   comprometido.

   O preço é CSRF, que fica coberto por três camadas: SameSite=
   Strict, allowlist de origem no CORS, e corpo JSON (que obriga
   preflight em requisição cross-site).
   ============================================================ */

import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyReply } from 'fastify';
import { env, producao } from '../env.js';

const segredoJwt = new TextEncoder().encode(env.JWT_SEGREDO);

export const COOKIE_ACESSO = 'pd_acesso';
export const COOKIE_REFRESH = 'pd_refresh';
export const COOKIE_DISPOSITIVO = 'pd_dispositivo';

/* Token opaco de alta entropia. Para estes não usamos argon2: com
   256 bits de aleatoriedade não há o que adivinhar, e SHA-256 dá
   busca indexada barata no banco. */
export function gerarTokenOpaco(): string {
  return randomBytes(32).toString('base64url');
}

export function digerir(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function assinarAcesso(usuarioId: string, sessaoId: string): Promise<string> {
  return new SignJWT({ sid: sessaoId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACESSO_MINUTOS}m`)
    .sign(segredoJwt);
}

export async function lerAcesso(token: string): Promise<{ usuarioId: string; sessaoId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, segredoJwt);
    if (!payload.sub || typeof payload.sid !== 'string') return null;
    return { usuarioId: payload.sub, sessaoId: payload.sid };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
   Cookies
   ------------------------------------------------------------ */

function base(maxAgeSegundos?: number) {
  return {
    httpOnly: true,
    secure: producao,          // em desenvolvimento o localhost é http
    sameSite: 'strict' as const,
    path: '/',
    domain: env.COOKIE_DOMINIO,
    ...(maxAgeSegundos !== undefined ? { maxAge: maxAgeSegundos } : {}),
  };
}

export function duracaoRefresh(lembrarDeMim: boolean): number {
  return lembrarDeMim
    ? env.REFRESH_DIAS_LEMBRAR * 86_400
    : env.REFRESH_HORAS_SESSAO * 3_600;
}

export function porCookies(
  resposta: FastifyReply,
  acesso: string,
  refresh: string,
  lembrarDeMim: boolean
) {
  resposta.setCookie(COOKIE_ACESSO, acesso, base(env.ACESSO_MINUTOS * 60));

  /* Sem "lembrar de mim" o refresh vira cookie de sessão: morre
     quando o navegador fecha (ACS-LOGIN-008). */
  resposta.setCookie(
    COOKIE_REFRESH,
    refresh,
    lembrarDeMim ? base(duracaoRefresh(true)) : base()
  );
}

export function marcarDispositivo(resposta: FastifyReply, token: string) {
  resposta.setCookie(COOKIE_DISPOSITIVO, token, base(env.DISPOSITIVO_DIAS * 86_400));
}

export function limparCookies(resposta: FastifyReply) {
  /* O cookie de dispositivo NÃO é apagado no logout: ele diz "este
     navegador já foi verificado", não "alguém está logado". Apagá-lo
     faria a pessoa receber um código a cada logout, que é o atrito
     que a decisão D7 justamente evitou. */
  for (const nome of [COOKIE_ACESSO, COOKIE_REFRESH]) {
    resposta.clearCookie(nome, { path: '/', domain: env.COOKIE_DOMINIO });
  }
}
