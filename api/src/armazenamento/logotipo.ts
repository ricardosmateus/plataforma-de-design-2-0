/* ============================================================
   Armazenamento do logotipo de empresa — adaptador
   ============================================================
   Regras: Regras_de_negocio/modulos/empresas/empresas-criacao.md
     EMP-CRIA-003  formato e tamanho aceitos
     EMP-CRIA-004  arquivo vive fora do banco; o banco guarda a URL
     EMP-CRIA-005  sem driver configurado, upload é recusado com
                   mensagem clara — criar empresa sem logo continua
                   funcionando

   Mesmo desenho do adaptador de e-mail (src/email/index.ts): dois
   drivers atrás da mesma interface, trocados por variável de
   ambiente. 'none' é o que roda sem nenhuma conta criada em lugar
   nenhum; 's3' fala com qualquer serviço compatível com a API do
   S3 — Cloudflare R2 incluído.
   ============================================================ */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

import { env } from '../env.js';

export const FORMATOS_ACEITOS = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export const TAMANHO_MAXIMO = 2 * 1024 * 1024; // 2MB — EMP-CRIA-003

const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  /* Documentos de referência — BOARD-REF-008. */
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf',
  'text/plain; charset=utf-8': 'txt',
  'text/csv; charset=utf-8': 'csv',
  'text/markdown; charset=utf-8': 'md',
};

export class LogotipoIndisponivel extends Error {}

/* `nomeDownload`: o nome original do arquivo. O objeto no bucket é
   um UUID; sem isto quem baixa um documento de referência recebe
   "3f2e….docx" em vez de "Briefing.docx". */
export type OpcoesEnvio = { nomeDownload?: string };

function disposicao(nome: string): string {
  const limpo = nome.replace(/[\u0000-\u001f"\\]/g, '').slice(0, 150);
  const ascii = limpo.replace(/[^\x20-\x7e]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpo).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

export interface ArmazenamentoLogotipo {
  /* `pasta` separa os usos no mesmo bucket: logotipos de empresa e
     imagens de referência visual (BOARD-REF). */
  enviar(dados: Buffer, tipo: string, pasta?: string, opcoes?: OpcoesEnvio): Promise<string>;
  /* Apaga um arquivo que ESTE armazenamento enviou, pela URL pública
     que ele mesmo devolveu. URL de fora é ignorada: nunca apagar o que
     não foi este código que gravou. */
  apagar(url: string): Promise<void>;
}

/* ------------------------------------------------------------
   Sem armazenamento configurado
   ------------------------------------------------------------ */
class ArmazenamentoIndisponivel implements ArmazenamentoLogotipo {
  async enviar(): Promise<string> {
    /* A rota traduz isto em 400 com campo "logotipo" — nunca em
       500. Não ter armazenamento configurado não é uma falha do
       servidor, é uma peça que ainda falta instalar. */
    throw new LogotipoIndisponivel('Envio de logotipo indisponível no momento.');
  }

  async apagar(): Promise<void> {
    /* Sem armazenamento não existe arquivo nenhum para apagar. */
  }
}

/* ------------------------------------------------------------
   S3 / R2
   ------------------------------------------------------------ */
class ArmazenamentoS3 implements ArmazenamentoLogotipo {
  private cliente: S3Client;

  constructor(
    private bucket: string,
    private urlPublica: string,
    endpoint: string,
    regiao: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.cliente = new S3Client({
      endpoint,
      region: regiao,
      credentials: { accessKeyId, secretAccessKey },
      /* R2 exige path-style (bucket na URL, não em subdomínio);
         AWS S3 aceita os dois. Path-style funciona nos dois casos,
         então é a escolha que não exige saber qual dos dois é. */
      forcePathStyle: true,
    });
  }

  async enviar(dados: Buffer, tipo: string, pasta = 'logotipos', opcoes: OpcoesEnvio = {}): Promise<string> {
    const nome = `${pasta}/${randomUUID()}.${EXTENSAO[tipo] ?? 'bin'}`;

    await this.cliente.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: nome,
      Body: dados,
      ContentType: tipo,
      ...(opcoes.nomeDownload ? { ContentDisposition: disposicao(opcoes.nomeDownload) } : {}),
      /* Uma semana de cache: o nome do arquivo é um UUID novo a
         cada upload, então o arquivo antigo nunca é sobrescrito —
         cache longo é seguro, não existe "versão desatualizada" do
         mesmo nome. */
      CacheControl: 'public, max-age=604800, immutable',
    }));

    return `${this.urlPublica.replace(/\/$/, '')}/${nome}`;
  }

  async apagar(url: string): Promise<void> {
    const base = `${this.urlPublica.replace(/\/$/, '')}/`;
    if (!url.startsWith(base)) return;
    const chave = url.slice(base.length);
    /* Só nomes que este código gera: pasta/uuid.ext. Qualquer outra
       coisa (../, chave vazia) não é apagada. */
    if (!/^[a-z-]+\/[0-9a-f-]{36}\.[a-z]+$/.test(chave)) return;
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }
}

/* A ausência de credencial já é barrada na partida, em env.ts.
   Aqui só resta construir o driver escolhido. */
export const armazenamentoLogotipo: ArmazenamentoLogotipo =
  env.S3_DRIVER === 's3'
    ? new ArmazenamentoS3(
        String(env.S3_BUCKET),
        String(env.S3_URL_PUBLICA),
        String(env.S3_ENDPOINT),
        env.S3_REGIAO,
        String(env.S3_ACCESS_KEY_ID),
        String(env.S3_SECRET_ACCESS_KEY),
      )
    : new ArmazenamentoIndisponivel();
