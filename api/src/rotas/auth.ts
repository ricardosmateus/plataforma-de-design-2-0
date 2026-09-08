/* ============================================================
   Rotas de autenticação
   ============================================================
   Regras: Regras_de_negocio/modulos/acesso/login.md e cadastro.md

   Formato de erro, combinado com o frontend (plano §5):
     { campo: 'email', mensagem: 'Informe um e-mail válido.' }
   `campo` nulo quer dizer erro geral, que a tela mostra como alerta
   em vez de marcar um campo.
   ============================================================ */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SignJWT, jwtVerify } from 'jose';
import argon2 from 'argon2';

import { db } from '../db.js';
import { env, producao } from '../env.js';
import * as senhas from '../seguranca/senha.js';
import * as otp from '../seguranca/otp.js';
import * as sessao from '../seguranca/sessao.js';
import { correio, mensagemCodigo } from '../email/index.js';

const COOKIE_DESAFIO = 'pd_desafio';
const segredo = new TextEncoder().encode(env.JWT_SEGREDO);

/* Hash descartável usado quando o e-mail não existe. Sem ele, a
   resposta para "e-mail inexistente" volta muito mais rápido que
   para "senha errada", e esse intervalo é suficiente para enumerar
   contas — que é o que ACS-LOGIN-004 quer impedir. */
const HASH_ISCA = await argon2.hash('isca-de-tempo-constante', {
  type: argon2.argon2id,
  memoryCost: env.ARGON_MEMORIA,
  timeCost: env.ARGON_ITERACOES,
  parallelism: env.ARGON_PARALELISMO,
});

type Erro = { campo: string | null; mensagem: string };
const erro = (campo: string | null, mensagem: string): Erro => ({ campo, mensagem });

/* ------------------------------------------------------------
   Retrato da conta que o frontend consome. A cascata de
   roteamento (login.md §4) opera exatamente sobre este formato.

   `vinculos` passou a ser contado de verdade em 22/08/2026, com a
   chegada de `empresa_membros`. Ele serve à ACS-LOGIN-016 — decidir
   se um `?destino=` pretendido pode ser retomado — e NÃO para
   decidir o estado da listagem: essa pergunta é do
   GET /empresas (E3, empresas-listagem.md §7).

   `administrador` e `perfil_especialista` seguem fixos: as tabelas
   `administradores` e `perfil_especialista` ainda não existem.
   Enquanto forem falsos, a cascata leva todo mundo à linha 4.
   ------------------------------------------------------------ */
async function retrato(u: { id: string; nome: string; email: string; emailVerificado: boolean }) {
  /* AUTENTICAR NÃO PODE DEPENDER DISTO.
     `vinculos` serve à ACS-LOGIN-016 — decidir se um `?destino=`
     pretendido vale a pena — e nada mais. Se a contagem falhar
     (tabela ausente porque a migração ainda não rodou, banco
     instável), a resposta correta é 0 e um aviso no log, não
     derrubar o login de quem digitou a senha certa.

     Foi exatamente isso que aconteceu em 22/08/2026: esta contagem
     entrou antes de `npx prisma migrate deploy`, `db.empresaMembro`
     não existia no cliente gerado, e todo login virou 500 — que a
     tela exibia como "e-mail ou senha incorretos". */
  let vinculos = 0;
  try {
    vinculos = await db.empresaMembro.count({
      where: {
        usuarioId: u.id,
        revogadoEm: null,
        OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }],
        empresa: { arquivadoEm: null },
      },
    });
  } catch (e) {
    console.warn(
      '[auth] não foi possível contar vínculos; assumindo 0. ' +
      'A migração 20260822000000_empresas já rodou? ' +
      '(npx prisma migrate deploy && npx prisma generate)',
      e instanceof Error ? e.message : e
    );
  }

  return {
    nome: u.nome,
    email: u.email,
    email_verificado: u.emailVerificado,
    administrador: false,
    vinculos,
    perfil_especialista: false,
  };
}

function ip(req: FastifyRequest): string | undefined {
  return req.ip;
}

/* ------------------------------------------------------------
   Desafio: liga o pedido de código à conta sem que o cliente
   precise informar quem é. Confiar num userId vindo do corpo
   deixaria qualquer um tentar códigos contra qualquer conta.
   ------------------------------------------------------------ */
type Desafio = { usuarioId: string; proposito: 'login' | 'cadastro'; lembrarDeMim: boolean };

async function abrirDesafio(resposta: FastifyReply, d: Desafio) {
  const token = await new SignJWT({ p: d.proposito, l: d.lembrarDeMim })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(d.usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${env.OTP_MINUTOS}m`)
    .sign(segredo);

  resposta.setCookie(COOKIE_DESAFIO, token, {
    httpOnly: true,
    secure: producao,
    sameSite: 'strict',
    path: '/',
    domain: env.COOKIE_DOMINIO,
    maxAge: env.OTP_MINUTOS * 60,
  });
}

async function lerDesafio(req: FastifyRequest): Promise<Desafio | null> {
  const token = req.cookies[COOKIE_DESAFIO];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo);
    if (!payload.sub) return null;
    return {
      usuarioId: payload.sub,
      proposito: payload.p === 'cadastro' ? 'cadastro' : 'login',
      lembrarDeMim: payload.l === true,
    };
  } catch {
    return null;
  }
}

function fecharDesafio(resposta: FastifyReply) {
  resposta.clearCookie(COOKIE_DESAFIO, { path: '/', domain: env.COOKIE_DOMINIO });
}

/* ------------------------------------------------------------
   Emissão de código
   ------------------------------------------------------------ */
async function emitirCodigo(
  usuarioId: string,
  email: string,
  proposito: 'login' | 'cadastro'
): Promise<{ enviado: boolean }> {
  /* Códigos anteriores do mesmo propósito deixam de valer: dois
     códigos vivos ao mesmo tempo dobram a chance de acerto por
     tentativa e confundem quem recebeu dois e-mails. */
  await db.codigoOtp.updateMany({
    where: { usuarioId, proposito, usadoEm: null },
    data: { usadoEm: new Date() },
  });

  const codigo = otp.gerarCodigo();
  await db.codigoOtp.create({
    data: { usuarioId, proposito, codigoHash: otp.selar(codigo), expiraEm: otp.expiraEm() },
  });

  try {
    await correio.enviar({ para: email, ...mensagemCodigo(codigo, proposito) });
    return { enviado: true };
  } catch (e) {
    /* Estado "integração indisponível": o provedor caiu. A conta e
       o código existem; só a entrega falhou. Dizer isso é melhor do
       que deixar a pessoa esperando um e-mail que não vem. */
    console.error('[correio] falha ao enviar código:', e);
    return { enviado: false };
  }
}

/* ------------------------------------------------------------
   Abertura de sessão
   ------------------------------------------------------------ */
async function abrirSessao(
  resposta: FastifyReply,
  req: FastifyRequest,
  usuarioId: string,
  lembrarDeMim: boolean
) {
  const refresh = sessao.gerarTokenOpaco();
  const registro = await db.sessao.create({
    data: {
      usuarioId,
      refreshTokenHash: sessao.digerir(refresh),
      lembrarDeMim,
      expiraEm: new Date(Date.now() + sessao.duracaoRefresh(lembrarDeMim) * 1000),
      ip: ip(req),
      agente: req.headers['user-agent']?.slice(0, 255),
    },
  });

  const acesso = await sessao.assinarAcesso(usuarioId, registro.id);
  sessao.porCookies(resposta, acesso, refresh, lembrarDeMim);
}

/* ------------------------------------------------------------
   Limite por e-mail — ACS-LOGIN-005
   O limite por IP fica no plugin de rate limit; este é o de
   e-mail, que é o que pega ataque distribuído mirando uma conta.
   ------------------------------------------------------------ */
async function emEspera(email: string): Promise<number> {
  const desde = new Date(Date.now() - env.LOGIN_JANELA_SEGUNDOS * 1000);
  const falhas = await db.tentativaLogin.findMany({
    where: { emailTentado: email, sucesso: false, criadoEm: { gte: desde } },
    orderBy: { criadoEm: 'desc' },
    take: env.LOGIN_MAX_TENTATIVAS,
  });

  if (falhas.length < env.LOGIN_MAX_TENTATIVAS) return 0;

  const maisAntiga = falhas[falhas.length - 1]!;
  const liberaEm = maisAntiga.criadoEm.getTime() + env.LOGIN_JANELA_SEGUNDOS * 1000;
  return Math.max(0, Math.ceil((liberaEm - Date.now()) / 1000));
}

/* ============================================================
   Rotas
   ============================================================ */

const emailSchema = z.string().trim().toLowerCase().email('Informe um e-mail válido.');

export async function rotasAuth(app: FastifyInstance) {

  /* ---------- Cadastro — CAD-CONTA-001 ---------- */
  app.post('/auth/registrar', async (req, resposta) => {
    const corpo = z.object({
      nome: z.string().trim().min(1, 'Informe seu nome completo.'),
      email: emailSchema,
      senha: z.string(),
      aceite: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos para continuar.' }) }),
      termosVersao: z.string().default('1.0'),
    }).safeParse(req.body);

    if (!corpo.success) {
      const primeiro = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(primeiro.path[0] ?? ''), primeiro.message));
    }
    const { nome, email, senha, aceite, termosVersao } = corpo.data;

    /* CAD-CONTA-004: nome completo, não só o primeiro nome. */
    const nomeLimpo = nome.replace(/\s+/g, ' ');
    if (nomeLimpo.split(' ').length < 2) {
      return resposta.code(400).send(erro('nome', 'Informe seu nome e sobrenome.'));
    }

    const reprova = await senhas.validarPolitica(senha, [nomeLimpo, email.split('@')[0] ?? '']);
    if (reprova) return resposta.code(400).send(erro(reprova.campo, reprova.mensagem));

    /* CAD-CONTA-003: aqui a existência da conta É revelada, ao
       contrário do login. Sem isso o cadastro vira beco sem saída.
       O raciocínio completo está no documento de regras. */
    const jaExiste = await db.usuario.findUnique({ where: { email }, select: { id: true } });
    if (jaExiste) {
      return resposta.code(409).send(erro('email', 'Esse e-mail já tem conta.'));
    }

    const usuario = await db.usuario.create({
      data: {
        nome: nomeLimpo,
        email,
        senhaHash: await senhas.hashear(senha),
        emailVerificado: false,
        termosVersao,
        termosAceitosEm: aceite ? new Date() : null,
      },
    });

    const { enviado } = await emitirCodigo(usuario.id, email, 'cadastro');
    await abrirDesafio(resposta, { usuarioId: usuario.id, proposito: 'cadastro', lembrarDeMim: false });

    return resposta.code(201).send({ proximo: 'verificar-codigo', proposito: 'cadastro', enviado });
  });

  /* ---------- Login ---------- */
  app.post('/auth/login', async (req, resposta) => {
    const corpo = z.object({
      email: emailSchema,
      senha: z.string().min(1, 'Informe sua senha.'),
      lembrarDeMim: z.boolean().default(false),
    }).safeParse(req.body);

    if (!corpo.success) {
      const primeiro = corpo.error.issues[0]!;
      return resposta.code(400).send(erro(String(primeiro.path[0] ?? ''), primeiro.message));
    }
    const { email, senha, lembrarDeMim } = corpo.data;

    const espera = await emEspera(email);
    if (espera > 0) {
      return resposta.code(429).send({
        ...erro(null, 'Muitas tentativas. Aguarde para tentar de novo.'),
        segundosRestantes: espera,
      });
    }

    const usuario = await db.usuario.findUnique({ where: { email } });

    /* Sempre roda argon2, exista a conta ou não — ver HASH_ISCA. */
    const confere = usuario
      ? await senhas.conferir(usuario.senhaHash, senha)
      : (await senhas.conferir(HASH_ISCA, senha), false);

    await db.tentativaLogin.create({
      data: { usuarioId: usuario?.id ?? null, emailTentado: email, sucesso: confere, ip: ip(req) },
    });

    if (!usuario || !confere) {
      /* ACS-LOGIN-004: a mensagem não distingue os dois casos. */
      const restante = await emEspera(email);
      if (restante > 0) {
        return resposta.code(429).send({
          ...erro(null, 'Muitas tentativas. Aguarde para tentar de novo.'),
          segundosRestantes: restante,
        });
      }
      return resposta.code(401).send(erro('senha', 'E-mail ou senha incorretos.'));
    }

    /* ACS-LOGIN-009: suspensão só depois da credencial validada, e
       sem exigir segundo fator — mandar buscar código para depois
       dizer que a conta está suspensa é fazer perder tempo à toa. */
    if (usuario.suspensoEm) {
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    /* Cascata, linha 1: e-mail não verificado (ACS-LOGIN-015). */
    if (!usuario.emailVerificado) {
      const { enviado } = await emitirCodigo(usuario.id, email, 'cadastro');
      await abrirDesafio(resposta, { usuarioId: usuario.id, proposito: 'cadastro', lembrarDeMim });
      return resposta.send({ proximo: 'verificar-codigo', proposito: 'cadastro', enviado });
    }

    /* ACS-LOGIN-002: código só em dispositivo desconhecido. */
    const tokenDispositivo = req.cookies[sessao.COOKIE_DISPOSITIVO];
    if (tokenDispositivo) {
      const conhecido = await db.dispositivoConfiavel.findUnique({
        where: { tokenHash: sessao.digerir(tokenDispositivo) },
      });
      if (conhecido && conhecido.usuarioId === usuario.id && conhecido.expiraEm > new Date()) {
        await db.dispositivoConfiavel.update({
          where: { id: conhecido.id },
          data: { ultimoUsoEm: new Date() },
        });
        await abrirSessao(resposta, req, usuario.id, lembrarDeMim);
        return resposta.send({ proximo: 'entrar', conta: await retrato(usuario) });
      }
    }

    const { enviado } = await emitirCodigo(usuario.id, email, 'login');
    await abrirDesafio(resposta, { usuarioId: usuario.id, proposito: 'login', lembrarDeMim });
    return resposta.send({ proximo: 'verificar-codigo', proposito: 'login', enviado });
  });

  /* ---------- Verificar código ---------- */
  app.post('/auth/otp/verificar', async (req, resposta) => {
    const corpo = z.object({
      codigo: z.string().regex(/^\d{6}$/, 'Digite os 6 dígitos do código.'),
    }).safeParse(req.body);

    if (!corpo.success) {
      return resposta.code(400).send(erro('codigo', corpo.error.issues[0]!.message));
    }

    const desafio = await lerDesafio(req);
    if (!desafio) {
      return resposta.code(440).send(erro(null, 'Sua verificação expirou. Entre novamente.'));
    }

    const registro = await db.codigoOtp.findFirst({
      where: {
        usuarioId: desafio.usuarioId,
        proposito: desafio.proposito,
        usadoEm: null,
        expiraEm: { gt: new Date() },
      },
      orderBy: { criadoEm: 'desc' },
    });

    if (!registro) {
      return resposta.code(400).send(erro('codigo', 'Código inválido ou expirado. Tente novamente.'));
    }

    if (registro.tentativas >= env.OTP_MAX_TENTATIVAS) {
      await db.codigoOtp.update({ where: { id: registro.id }, data: { usadoEm: new Date() } });
      return resposta.code(429).send(erro(null, 'Muitas tentativas. Peça um novo código.'));
    }

    if (!otp.codigoConfere(corpo.data.codigo, registro.codigoHash)) {
      await db.codigoOtp.update({
        where: { id: registro.id },
        data: { tentativas: { increment: 1 } },
      });
      return resposta.code(400).send(erro('codigo', 'Código inválido ou expirado. Tente novamente.'));
    }

    /* Uso único (ACS-LOGIN-006). */
    await db.codigoOtp.update({ where: { id: registro.id }, data: { usadoEm: new Date() } });

    const usuario = await db.usuario.update({
      where: { id: desafio.usuarioId },
      data: desafio.proposito === 'cadastro' ? { emailVerificado: true } : {},
    });

    if (usuario.suspensoEm) {
      fecharDesafio(resposta);
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    /* Dispositivo passa a ser reconhecido — ACS-LOGIN-011. */
    const tokenDispositivo = sessao.gerarTokenOpaco();
    await db.dispositivoConfiavel.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: sessao.digerir(tokenDispositivo),
        apelido: req.headers['user-agent']?.slice(0, 120),
        expiraEm: new Date(Date.now() + env.DISPOSITIVO_DIAS * 86_400_000),
      },
    });
    sessao.marcarDispositivo(resposta, tokenDispositivo);

    await abrirSessao(resposta, req, usuario.id, desafio.lembrarDeMim);
    fecharDesafio(resposta);

    return resposta.send({ proximo: 'entrar', conta: await retrato(usuario) });
  });

  /* ---------- Reenviar código — ACS-LOGIN-007 ---------- */
  app.post('/auth/otp/reenviar', async (req, resposta) => {
    const desafio = await lerDesafio(req);
    if (!desafio) {
      return resposta.code(440).send(erro(null, 'Sua verificação expirou. Entre novamente.'));
    }

    const ultimo = await db.codigoOtp.findFirst({
      where: { usuarioId: desafio.usuarioId, proposito: desafio.proposito },
      orderBy: { criadoEm: 'desc' },
    });

    if (ultimo) {
      const decorridos = (Date.now() - ultimo.criadoEm.getTime()) / 1000;
      if (decorridos < 30) {
        return resposta.code(429).send({
          ...erro(null, 'Aguarde para pedir outro código.'),
          segundosRestantes: Math.ceil(30 - decorridos),
        });
      }
    }

    const usuario = await db.usuario.findUnique({ where: { id: desafio.usuarioId } });
    if (!usuario) return resposta.code(440).send(erro(null, 'Sua verificação expirou.'));

    const { enviado } = await emitirCodigo(usuario.id, usuario.email, desafio.proposito);
    return resposta.send({ enviado });
  });

  /* ---------- Sessão atual — ACS-SESSAO-001 ---------- */
  app.get('/auth/sessao', async (req, resposta) => {
    const acesso = req.cookies[sessao.COOKIE_ACESSO];
    if (acesso) {
      const conteudo = await sessao.lerAcesso(acesso);
      if (conteudo) {
        const usuario = await db.usuario.findUnique({ where: { id: conteudo.usuarioId } });
        const viva = await db.sessao.findFirst({
          where: { id: conteudo.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
        });
        if (usuario && viva && !usuario.suspensoEm) {
          return resposta.send({ conta: await retrato(usuario) });
        }
      }
    }

    /* Acesso vencido: tenta renovar pelo refresh, com rotação — o
       token usado é revogado e um novo emitido. Se um token
       roubado for reapresentado depois, ele já não vale. */
    const refresh = req.cookies[sessao.COOKIE_REFRESH];
    if (!refresh) return resposta.code(401).send(erro(null, 'Sessão expirada.'));

    const registro = await db.sessao.findUnique({
      where: { refreshTokenHash: sessao.digerir(refresh) },
      include: { usuario: true },
    });

    if (!registro || registro.revogadoEm || registro.expiraEm < new Date()) {
      /* IA-CONV-012: chegar aqui é a própria definição de "deslogado
         por tempo/inatividade" deste sistema — a pessoa parou de usar
         a ferramenta e, na próxima tentativa, não há mais como
         renovar. Com `registro` em mãos, sabe-se de quem é a sessão, e
         a conversa do assistente é apagada em todos os projetos dela.
         Sem `registro` (token nunca existiu, ou já foi limpo), não há
         usuarioId para localizar — nada a fazer. */
      if (registro) {
        await db.iaConversa.deleteMany({ where: { usuarioId: registro.usuarioId } });
      }
      sessao.limparCookies(resposta);
      return resposta.code(401).send(erro(null, 'Sessão expirada.'));
    }

    if (registro.usuario.suspensoEm) {
      sessao.limparCookies(resposta);
      return resposta.code(403).send({
        ...erro(null, 'Conta suspensa.'),
        suspensao: registro.usuario.suspensaoMotivo ?? 'violacao',
      });
    }

    await db.sessao.update({ where: { id: registro.id }, data: { revogadoEm: new Date() } });
    await abrirSessao(resposta, req, registro.usuarioId, registro.lembrarDeMim);

    return resposta.send({ conta: await retrato(registro.usuario) });
  });

  /* ---------- Sair — ACS-SESSAO-003 ---------- */
  app.post('/auth/logout', async (req, resposta) => {
    const refresh = req.cookies[sessao.COOKIE_REFRESH];
    if (refresh) {
      /* Busca antes de revogar: é o único jeito de saber de QUEM é
         esta sessão, e IA-CONV-012 precisa disso para apagar a
         conversa certa. Sem usuarioId aqui, não tem o que limpar. */
      const registro = await db.sessao.findFirst({
        where: { refreshTokenHash: sessao.digerir(refresh), revogadoEm: null },
      });

      if (registro) {
        /* Revoga no servidor, não só no navegador: apagar o cookie
           sozinho deixaria o token válido para quem o tivesse copiado. */
        await db.sessao.update({ where: { id: registro.id }, data: { revogadoEm: new Date() } });

        /* IA-CONV-012: sair de verdade apaga a conversa do assistente
           em TODOS os projetos da pessoa — logout é evento de conta,
           não de projeto. `onDelete: Cascade` em ia_mensagens leva as
           mensagens junto; nenhum outro dado é tocado aqui. */
        await db.iaConversa.deleteMany({ where: { usuarioId: registro.usuarioId } });
      }
    }
    sessao.limparCookies(resposta);
    return resposta.send({ ok: true });
  });
}
