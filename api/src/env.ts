/* ============================================================
   Configuração — validada na partida
   ============================================================
   Falhar aqui, alto e cedo, é melhor do que descobrir em produção
   que JWT_SEGREDO estava vazio e todo mundo entrou.
   ============================================================ */

import { loadEnvFile } from 'node:process';
import { z } from 'zod';

/* Carrega o .env. A CLI do Prisma faz isso sozinha, o Node não —
   por isso `prisma migrate` enxergava DATABASE_URL e a aplicação
   não enxergava nada.

   loadEnvFile é nativo do Node (20.12+), então não entra dependência
   para isso. Variáveis já presentes no ambiente têm precedência, que
   é o comportamento certo: em produção a configuração vem do
   provedor de hospedagem, e não deve haver .env nenhum lá. */
try {
  loadEnvFile();
} catch {
  /* Sem .env é situação normal em produção. Se algo obrigatório
     estiver faltando, a validação abaixo reclama com nome e tudo. */
}

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().default(3333),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  /* Segredos: 32 bytes em base64url. Gere com
     `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` */
  JWT_SEGREDO: z.string().min(32, 'JWT_SEGREDO precisa de pelo menos 32 caracteres'),
  OTP_PIMENTA: z.string().min(32, 'OTP_PIMENTA precisa de pelo menos 32 caracteres'),

  /* Allowlist de origens do frontend, separadas por vírgula.
     Fora desta lista, a API recusa (plano §6). */
  ORIGENS: z.string().default('http://localhost:8000'),

  /* Argon2id — OWASP: m=19456 (19 MiB), t=2, p=1 é o mínimo.
     Suba a memória se o hardware aguentar; é o parâmetro que mais
     encarece o ataque por GPU. */
  ARGON_MEMORIA: z.coerce.number().default(19456),
  ARGON_ITERACOES: z.coerce.number().default(2),
  ARGON_PARALELISMO: z.coerce.number().default(1),

  /* Tempos de vida */
  ACESSO_MINUTOS: z.coerce.number().default(15),
  REFRESH_DIAS_LEMBRAR: z.coerce.number().default(30),
  REFRESH_HORAS_SESSAO: z.coerce.number().default(12),
  DISPOSITIVO_DIAS: z.coerce.number().default(90),
  OTP_MINUTOS: z.coerce.number().default(10),
  OTP_MAX_TENTATIVAS: z.coerce.number().default(5),

  /* Limite por e-mail antes do 429 (ACS-LOGIN-005) */
  LOGIN_MAX_TENTATIVAS: z.coerce.number().default(3),
  LOGIN_JANELA_SEGUNDOS: z.coerce.number().default(30),

  /* E-mail: 'console' escreve o código no log (desenvolvimento);
     'resend' envia de verdade. */
  EMAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_REMETENTE: z.string().default('Plataforma de Design <nao-responda@localhost>'),

  /* Armazenamento do logotipo de empresa — EMP-CRIA-004.
     'none' recusa upload com mensagem clara, mas não impede criar
     empresa sem logotipo (EMP-CRIA-005). 's3' grava de verdade, em
     qualquer serviço compatível com a API do S3 — Cloudflare R2
     incluído, bastando apontar S3_ENDPOINT para ele. */
  S3_DRIVER: z.enum(['none', 's3']).default('none'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGIAO: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /* URL pública de onde os arquivos ficam acessíveis — o bucket em
     si normalmente não é servido direto; um domínio público (R2
     "public bucket" ou um CDN na frente do S3) fica aqui. */
  S3_URL_PUBLICA: z.string().optional(),

  /* ---------- Assistente de IA ----------
     Mesmo padrão de S3_DRIVER: 'none' é o default e recusa a
     pergunta com mensagem clara, sem derrubar nada — o quadro de
     idéias segue funcionando sem assistente.

     Qual provedor usar é decisão de negócio ainda aberta
     (ia-assistente-isolamento.md §4): o que trafega no contexto é
     dado dos clientes, então o contrato do provedor precede a
     publicação. 'anthropic' é a única implementação escrita até
     agora; acrescentar outra é implementar a mesma interface em
     src/ia/provedor.ts. */
  IA_DRIVER: z.enum(['none', 'anthropic']).default('none'),
  IA_API_KEY: z.string().optional(),
  IA_MODELO: z.string().optional(),
  IA_MODELO_SONNET: z.string().optional(),
  /* 1024 era pouco desde que o contexto passou a levar o conteudo
     das atividades finalizadas (IA-CONHEC-007): pergunta que pede
     enumeracao estourava o teto e a resposta chegava cortada. */
  IA_MAX_TOKENS: z.coerce.number().default(2048),
  /* Quantas trocas anteriores entram no contexto — IA-CONV-004,
     decisão A12. O teto é do servidor, não da tela: mandar a
     conversa inteira cresce custo sem limite e empurra o quadro para
     fora da janela do modelo. */
  IA_HISTORICO_TROCAS: z.coerce.number().default(10),
  /* Tamanho máximo da pergunta — IA-CUSTO-004. Recusa antes de
     gastar chamada. */
  IA_PERGUNTA_MAX: z.coerce.number().default(2000),

  /* ---------- Créditos ----------
     Cotação do dólar usada para converter o custo do provedor em
     real. Fase 0 do módulo de créditos: número de configuração, não
     consulta — a Fase 1 troca isto pela PTAX do Banco Central.

     Ficar desatualizado aqui NÃO corrompe o histórico: cada linha de
     consumo grava `custo_usd_micros` (o custo na moeda de origem) E a
     cotação usada, então o valor em real se recalcula depois. */
  COTACAO_USD_BRL: z.coerce.number().positive().default(5.4),

  /* Interruptor da Fase 2 — desliga a COBRANÇA sem desligar a IA.
     Com 'nao', o assistente e a classificação continuam respondendo
     normalmente, mas `reservar()`/`consumir()` nunca são chamados:
     nada sai do saldo de ninguém. A Fase 0 (registro em `consumos_ia`)
     continua rodando de qualquer jeito — é medição, não cobrança, e
     serve justamente para ver o que SERIA cobrado antes de ligar.
     Pensado para testar o assistente à vontade sem ficar recarregando
     saldo de teste. Em produção, isto tem que ser 'sim'. */
  CREDITOS_COBRAR: z.enum(['sim', 'nao']).default('sim'),

  /* ---------- Pix — Fase 3 (sandbox) ---------- */
  /* Segredo do HMAC que autentica o webhook de pagamento
     (SEG-PAG-001). Sem assinatura válida, o webhook não credita
     nada — opcional aqui (só a rota falha sem ele, não o boot
     inteiro) porque nem todo ambiente precisa do webhook ligado,
     mesmo padrão de OTP_PIMENTA sendo obrigatória mas isolada. */
  WEBHOOK_PIX_SECRET: z.string().min(32, 'WEBHOOK_PIX_SECRET precisa de pelo menos 32 caracteres').optional(),

  /* Identidade do recebedor que aparece no BR Code. Em sandbox, uma
     chave de teste — nunca uma chave real até a Fase 4 (C3, ainda
     em aberto no planejamento). */
  PIX_CHAVE_SANDBOX: z.string().default('sandbox@plataformadedesign.com'),
  PIX_NOME_RECEBEDOR: z.string().default('Plataforma de Design'),
  PIX_CIDADE_RECEBEDOR: z.string().default('Sao Paulo'),

  /* ---------- Pix — Fase 4 (Mercado Pago, C3) ---------- */
  /* Qual Psp usar. 'sandbox' (padrão) é o que já existia — não fala
     com rede nenhuma. 'mercado_pago' liga o provedor de verdade;
     as duas variáveis abaixo passam a ser obrigatórias nesse caso
     (checado mais adiante, mesmo padrão de S3_DRIVER/EMAIL_DRIVER:
     a obrigatoriedade depende da COMBINAÇÃO, não dá para expressar
     só com o zod). */
  PSP_DRIVER: z.enum(['sandbox', 'mercado_pago']).default('sandbox'),

  /* Access Token da conta do Mercado Pago (Suas integrações →
     Credenciais). Em teste, começa com TEST-; em produção, com
     APP_USR-. Só a CHAVE fica aqui — o valor mora no .env de cada
     máquina, nunca commitado. */
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),

  /* Chave secreta de "Webhooks → Configurar notificações" no painel
     do Mercado Pago — valida a assinatura HMAC do header
     x-signature (SEG-PAG-001, formato deles — ver
     pagamentos/assinatura-mercado-pago.ts). Diferente de
     WEBHOOK_PIX_SECRET, que é só do PSP sandbox: cada Psp assina do
     seu próprio jeito, e por isso tem segredo próprio. */
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),

  /* ---- Módulo de pesquisa de concorrentes ----
     Planejamento: planejamento-pesquisa-concorrentes.md §4 (PES-009)

     Mesmo padrão de IA_DRIVER e S3_DRIVER: 'none' é o default e
     recusa com mensagem clara, sem derrubar nada — a plataforma
     inteira funciona sem pesquisa configurada.

     Os dois são separados porque são capacidades distintas, não dois
     provedores da mesma coisa: 'busca' responde fato com fonte,
     'lugares' responde quantas unidades existem num raio. Dá para
     ligar uma sem a outra, e provavelmente é assim que vai começar.

     'claude' usa a ferramenta web_search da Messages API com a MESMA
     IA_API_KEY do assistente — não é fornecedor novo, e o custo já cai
     em consumos_ia/precos.ts. Escolhido em 02/09/2026 pela comparação
     de scripts/comparar-provedores.ts: ver o cabeçalho de
     pesquisa/provedor-claude-busca.ts para o porquê. */
  PESQUISA_DRIVER: z.enum(['none', 'claude']).default('none'),
  LUGARES_DRIVER: z.enum(['none']).default('none'),

  /* Conferência de senha vazada via k-anonymity do Have I Been
     Pwned. Desligue em ambiente sem rede. */
  VERIFICAR_VAZAMENTO: z.enum(['sim', 'nao']).default('sim'),

  COOKIE_DOMINIO: z.string().optional(),

  /* Servir o frontend pela própria API. Padrão ligado em
     desenvolvimento (um processo só) e desligado em produção, onde
     o frontend vai para CDN. Ver servidor.ts. */
  SERVIR_FRONTEND: z.enum(['sim', 'nao']).optional(),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error('Configuração inválida:\n' + problemas);
  process.exit(1);
}

export const producao = resultado.data.NODE_ENV === 'production';

export const env = {
  ...resultado.data,
  /* Não declarado: liga em desenvolvimento, desliga em produção. */
  SERVIR_FRONTEND: resultado.data.SERVIR_FRONTEND ?? (producao ? 'nao' : 'sim'),
};

export const origensPermitidas = env.ORIGENS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/* Falhas de configuração que o esquema sozinho não pega, porque
   dependem da combinação entre dois campos. */
if (env.EMAIL_DRIVER === 'resend' && !env.RESEND_API_KEY?.trim()) {
  /* String vazia não é ausência: `RESEND_API_KEY=""` passava pelo
     `optional()` e a API subia anunciando "driver: resend" para
     depois tomar 401 no primeiro envio. Falhar aqui é o ponto
     inteiro deste arquivo. */
  console.error(
    'Configuração inválida:\n' +
    '  · RESEND_API_KEY: obrigatória quando EMAIL_DRIVER=resend (está vazia).\n' +
    '    Gere uma chave em https://resend.com → API Keys e grave no .env,\n' +
    '    ou volte para EMAIL_DRIVER=console enquanto isso.'
  );
  process.exit(1);
}

if (producao && env.EMAIL_DRIVER === 'console') {
  console.warn(
    '[aviso] EMAIL_DRIVER=console em produção: nenhum código de verificação será entregue.'
  );
}

/* Mesmo padrão de S3_DRIVER: a obrigatoriedade depende da COMBINAÇÃO
   entre dois campos, e isso o zod sozinho não expressa. */
if (env.PESQUISA_DRIVER === 'claude') {
  const faltando = (['IA_API_KEY', 'IA_MODELO'] as const).filter((c) => !env[c]?.trim());
  if (faltando.length) {
    console.error(
      '\nConfiguração incompleta:\n' +
      faltando.map((c) => `  · ${c}: obrigatória quando PESQUISA_DRIVER=claude (está vazia).`).join('\n') +
      '\n    A busca usa a mesma chave e o mesmo modelo do assistente.\n' +
      '    Preencha as duas, ou volte para PESQUISA_DRIVER=none enquanto isso.'
    );
    process.exit(1);
  }
}

if (env.S3_DRIVER === 's3') {
  const faltando = (['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_URL_PUBLICA'] as const)
    .filter((chave) => !env[chave]?.trim());
  if (faltando.length) {
    console.error(
      'Configuração inválida:\n' +
      faltando.map((c) => `  · ${c}: obrigatória quando S3_DRIVER=s3 (está vazia).`).join('\n') +
      '\n    Crie um bucket no Cloudflare R2 (ou outro serviço compatível com S3),\n' +
      '    grave as credenciais no .env, ou volte para S3_DRIVER=none enquanto isso.'
    );
    process.exit(1);
  }
}

if (producao && env.S3_DRIVER === 'none') {
  console.warn(
    '[aviso] S3_DRIVER=none em produção: anexar logotipo será recusado (EMP-CRIA-005).'
  );
}

if (env.PSP_DRIVER === 'mercado_pago') {
  const faltando = (['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'] as const)
    .filter((chave) => !env[chave]?.trim());
  if (faltando.length) {
    console.error(
      'Configuração inválida:\n' +
      faltando.map((c) => `  · ${c}: obrigatória quando PSP_DRIVER=mercado_pago (está vazia).`).join('\n') +
      '\n    Pegue as credenciais em Suas integrações → Credenciais no painel do\n' +
      '    Mercado Pago, grave no .env, ou volte para PSP_DRIVER=sandbox enquanto isso.'
    );
    process.exit(1);
  }
}

if (producao && env.PSP_DRIVER === 'sandbox') {
  console.warn(
    '[aviso] PSP_DRIVER=sandbox em produção: nenhuma cobrança Pix real será criada — o dinheiro é falso.'
  );
}
