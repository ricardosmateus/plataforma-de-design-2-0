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

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

import { env } from '../env.js';

export const FORMATOS_ACEITOS = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export const TAMANHO_MAXIMO = 2 * 1024 * 1024; // 2MB — EMP-CRIA-003

const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

export class LogotipoIndisponivel extends Error {}

export interface ArmazenamentoLogotipo {
  enviar(dados: Buffer, tipo: string): Promise<string>;
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

  async enviar(dados: Buffer, tipo: string): Promise<string> {
    const nome = `logotipos/${randomUUID()}.${EXTENSAO[tipo] ?? 'bin'}`;

    await this.cliente.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: nome,
      Body: dados,
      ContentType: tipo,
      /* Uma semana de cache: o nome do arquivo é um UUID novo a
         cada upload, então o arquivo antigo nunca é sobrescrito —
         cache longo é seguro, não existe "versão desatualizada" do
         mesmo nome. */
      CacheControl: 'public, max-age=604800, immutable',
    }));

    return `${this.urlPublica.replace(/\/$/, '')}/${nome}`;
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
