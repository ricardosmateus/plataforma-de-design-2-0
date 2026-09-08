/* ============================================================
   Código de verificação (OTP)
   ============================================================
   ACS-LOGIN-006: 6 dígitos, expira em 10 minutos, uso único, com
   limite de tentativas.

   POR QUE HMAC E NÃO HASH SIMPLES
   Seis dígitos são um milhão de combinações. Um SHA-256 puro cai
   em segundos numa GPU se o banco vazar. Um argon2 seria seguro
   mas caro demais para um código que morre em dez minutos. HMAC
   com pimenta resolve: o segredo não vive no banco, então quem
   levar só o dump não tem por onde começar.
   ============================================================ */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

export function gerarCodigo(): string {
  /* randomInt é criptograficamente seguro; Math.random não é, e
     um código previsível derruba o segundo fator inteiro. */
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function selar(codigo: string): string {
  return createHmac('sha256', env.OTP_PIMENTA).update(codigo).digest('hex');
}

export function codigoConfere(codigo: string, selo: string): boolean {
  const calculado = Buffer.from(selar(codigo), 'hex');
  const guardado = Buffer.from(selo, 'hex');
  if (calculado.length !== guardado.length) return false;
  /* Comparação em tempo constante: comparar com === vaza, pelo
     tempo de resposta, quantos bytes iniciais bateram. */
  return timingSafeEqual(calculado, guardado);
}

export function expiraEm(): Date {
  return new Date(Date.now() + env.OTP_MINUTOS * 60_000);
}
