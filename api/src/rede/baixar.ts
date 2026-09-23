/* ============================================================
   Baixar um arquivo da web — com as travas que isso exige
   ============================================================
   Regras: Regras_de_negocio/modulos/atividades/board-lista.md, BOARD-REF-009

   Usado quando a IA acha, na web, o site, o logotipo ou o manual de
   marca de um concorrente (ATV-GERAR, tarefa de Referência). Quem
   escolhe o endereço é um modelo lendo páginas de terceiros — ou
   seja, o endereço é dado NÃO CONFIÁVEL. Buscar qualquer URL a
   partir do servidor é a porta clássica para alguém fazer o servidor
   ler o que só ele alcança (rede interna, metadados da nuvem).

   As travas, todas em código:
     1. só http e https, só nas portas padrão;
     2. o nome é resolvido ANTES da conexão, e endereço privado,
        de loopback, link-local ou reservado é recusado;
     3. redirecionamento é seguido à mão (no máximo 3), e cada salto
        passa de novo pelas travas 1 e 2;
     4. tempo e tamanho têm teto: o corpo é lido em pedaços e a
        leitura para no primeiro byte além do limite.

   Limite conhecido: entre a resolução do nome (2) e a conexão, o
   DNS pode mudar de resposta (DNS rebinding). Fechar isso exige
   fixar o IP na conexão, o que o fetch nativo não expõe. O risco
   restante é pequeno — quem controla o DNS precisaria também fazer
   a IA escolher o seu domínio — e fica registrado aqui.
   ============================================================ */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type ResultadoDownload =
  | { ok: true; dados: Buffer; tipo: string | null; urlFinal: string }
  | { ok: false; motivo: string };

export const REDIRECIONAMENTOS_MAX = 3;
const AGENTE = 'Mozilla/5.0 (compatible; PlataformaDeDesign/1.0; referencias)';

/* ------------------------------------------------------------
   Endereço que o servidor NÃO pode visitar — pura, testada
   ------------------------------------------------------------ */
function ipv4Privado(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;          // "esta rede", privada, loopback
  if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT
  if (a === 169 && b === 254) return true;                    // link-local (metadados da nuvem)
  if (a === 172 && b >= 16 && b <= 31) return true;           // privada
  if (a === 192 && b === 168) return true;                    // privada
  if (a === 192 && b === 0) return true;                      // 192.0.0.0/24 e 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;       // testes de rede
  if (a >= 224) return true;                                  // multicast e reservado
  return false;
}

export function ipPrivado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Privado(ip);
  if (v !== 6) return true; // o que não é IP não é endereço visitável
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  /* IPv4 embutido (::ffff:10.0.0.1) é o IPv4 que ele carrega. */
  const embutido = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (embutido) return ipv4Privado(embutido[1] as string);
  if (/^f[cd]/.test(x)) return true;                          // fc00::/7, única local
  if (/^fe[89ab]/.test(x)) return true;                       // fe80::/10, link-local
  if (/^ff/.test(x)) return true;                             // multicast
  return false;
}

/* A URL passa pelas travas de forma e porta? (sem rede) */
export function urlVisitavel(texto: string): URL | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return null;
  }
  if (isIP(host) && ipPrivado(host)) return null;
  return url;
}

async function resolveParaPublico(host: string): Promise<boolean> {
  const limpo = host.replace(/^\[|\]$/g, '');
  if (isIP(limpo)) return !ipPrivado(limpo);
  try {
    const enderecos = await lookup(limpo, { all: true, verbatim: true });
    return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------
   O download
   ------------------------------------------------------------ */
export async function baixarSeguro(
  endereco: string,
  opcoes: { maxBytes: number; timeoutMs?: number; aceitar?: string },
): Promise<ResultadoDownload> {
  const prazo = AbortSignal.timeout(opcoes.timeoutMs ?? 12_000);
  let atual = endereco;

  for (let salto = 0; salto <= REDIRECIONAMENTOS_MAX; salto++) {
    const url = urlVisitavel(atual);
    if (!url) return { ok: false, motivo: 'endereço não permitido' };
    if (!(await resolveParaPublico(url.hostname))) return { ok: false, motivo: 'endereço não permitido' };

    let r: Response;
    try {
      r = await fetch(url, {
        redirect: 'manual',
        signal: prazo,
        headers: { 'user-agent': AGENTE, accept: opcoes.aceitar ?? '*/*' },
      });
    } catch {
      return { ok: false, motivo: 'não respondeu' };
    }

    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location');
      await r.body?.cancel().catch(() => undefined);
      if (!destino) return { ok: false, motivo: 'redirecionamento sem destino' };
      atual = new URL(destino, url).toString();
      continue;
    }
    if (!r.ok || !r.body) {
      await r.body?.cancel().catch(() => undefined);
      return { ok: false, motivo: `respondeu ${r.status}` };
    }

    const declarado = Number(r.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declarado) && declarado > opcoes.maxBytes) {
      await r.body.cancel().catch(() => undefined);
      return { ok: false, motivo: 'grande demais' };
    }

    const pedacos: Uint8Array[] = [];
    let total = 0;
    try {
      const leitor = r.body.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > opcoes.maxBytes) {
          await leitor.cancel().catch(() => undefined);
          return { ok: false, motivo: 'grande demais' };
        }
        pedacos.push(value);
      }
    } catch {
      return { ok: false, motivo: 'leitura interrompida' };
    }

    return {
      ok: true,
      dados: Buffer.concat(pedacos),
      tipo: r.headers.get('content-type'),
      urlFinal: url.toString(),
    };
  }
  return { ok: false, motivo: 'redirecionamentos demais' };
}
