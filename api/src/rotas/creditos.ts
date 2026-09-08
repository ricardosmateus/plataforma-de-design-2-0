/* ============================================================
   Rotas de crédito — saldo e extrato
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md, Fase 1

   SÓ LEITURA. Não existe aqui rota que MEXA em saldo, e isso é
   deliberado: nesta fase o crédito entra por `npm run creditar`
   (ver o cabeçalho de scripts/creditar.ts para por que script e não
   rota de administrador). O Pix chega na Fase 3/4, e vai entrar
   pelo webhook — não por uma rota que o navegador possa chamar.

   O saldo é sempre o do DONO DA SESSÃO. Não existe parâmetro de
   usuário: uma rota que aceita "de quem é o saldo" é uma rota que
   alguém vai chamar com o id de outra pessoa.
   ============================================================ */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import QRCode from 'qrcode';

import { db } from '../db.js';
import * as sessao from '../seguranca/sessao.js';
import { saldoDe, extratoDe } from '../creditos/razao.js';
import { formatarReais, microsParaCentavos, reaisParaMicros } from '../creditos/dinheiro.js';
import { pspAtual } from '../pagamentos/psp.js';
import { env } from '../env.js';

/* Mesma corrente de sessão das outras rotas. Reproduzida aqui, e
   não importada, pelo mesmo motivo já registrado em projetos.ts e
   ia.ts: nenhum módulo tem por que depender do outro existir. */
async function quemPede(req: FastifyRequest): Promise<string | null> {
  const acesso = req.cookies[sessao.COOKIE_ACESSO];
  if (!acesso) return null;

  const dados = await sessao.lerAcesso(acesso);
  if (!dados) return null;

  const viva = await db.sessao.findFirst({
    where: { id: dados.sessaoId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  if (!viva) return null;

  return dados.usuarioId;
}

const ROTULO: Record<string, string> = {
  recarga: 'Recarga',
  consumo: 'Uso da plataforma',
  reserva: 'Reserva',
  liberacao: 'Reserva devolvida',
  estorno: 'Estorno',
  ajuste: 'Ajuste',
};

export async function rotasCreditos(app: FastifyInstance) {
  /* ---------- Saldo ---------- */
  app.get('/creditos/saldo', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send({ erro: 'Sessão expirada.' });

    const micros = await saldoDe(usuarioId);
    return resposta.send({
      /* Três formatos porque três consumidores diferentes: a tela
         mostra `formatado`, uma conta futura usa `micros`, e o Pix
         (Fase 3) só entende centavo. Deixar a tela formatar sozinha
         significaria a formatação divergir entre lugares. */
      saldo_micros: micros,
      saldo_centavos: microsParaCentavos(micros),
      saldo_formatado: formatarReais(micros),
    });
  });

  /* ---------- Extrato ---------- */
  app.get('/creditos/extrato', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send({ erro: 'Sessão expirada.' });

    const linhas = await extratoDe(usuarioId, 50);

    /* Recarga por Pix credita o LÍQUIDO (o bruto menos a taxa que o
       PSP reteve — ver `confirmarPagamento` em rotas/webhooks.ts).
       Sem explicar isso na tela, a pessoa vê "paguei R$ 10,00 e
       entraram R$ 9,90" e a conclusão natural é que a plataforma
       ficou com a diferença. Então o extrato mostra os três números:
       o que foi pago, o que a taxa levou, e o que virou crédito.

       Uma consulta só para todas as recargas da página, em vez de
       uma por linha: são no máximo 50 lançamentos, e quase nenhum
       deles é recarga. */
    const idsDeRecarga = linhas
      .filter((l) => l.tipo === 'recarga' && l.origem === 'cobranca_pix' && l.origemId)
      .map((l) => l.origemId as string);

    const cobrancas = idsDeRecarga.length
      ? await db.cobrancaPix.findMany({
          where: { id: { in: idsDeRecarga }, usuarioId },
          select: { id: true, valorMicros: true, taxaMicros: true },
        })
      : [];
    const porId = new Map(cobrancas.map((c) => [c.id, c]));

    return resposta.send({
      lancamentos: linhas.map((l) => {
        const cobranca = l.origemId ? porId.get(l.origemId) : undefined;
        /* Só vale a pena mostrar o detalhe quando houve taxa: numa
           recarga sem taxa nenhuma, "pagou R$ X, taxa R$ 0,00,
           creditado R$ X" é ruído que não explica nada. */
        const temTaxa = Boolean(cobranca?.taxaMicros && cobranca.taxaMicros > 0);

        return {
          id: l.id,
          tipo: l.tipo,
          rotulo: ROTULO[l.tipo] ?? l.tipo,
          /* `entrou` em vez de deixar a tela olhar o sinal: a decisão
             de o que é entrada e o que é saída é do servidor. */
          entrou: l.valorMicros > 0,
          valor_micros: l.valorMicros,
          valor_formatado: formatarReais(Math.abs(l.valorMicros)),
          saldo_depois_formatado: formatarReais(l.saldoDepois),
          descricao: l.descricao,
          criado_em: l.criadoEm.toISOString(),
          /* Presentes só em recarga com taxa; `null` no resto — a
             tela decide mostrar pela presença, não por adivinhar
             pelo tipo. */
          valor_pago_formatado: temTaxa ? formatarReais(cobranca!.valorMicros) : null,
          taxa_formatada: temTaxa ? formatarReais(cobranca!.taxaMicros!) : null,
        };
      }),
    });
  });

  /* ---------- Criar cobrança Pix — Fase 3 ----------
     DIN-003: o valor a creditar vem do NOSSO registro, nunca do
     navegador. Aqui o navegador só escolhe QUANTO PEDIR — o
     servidor cria a cobrança com esse valor e grava; o webhook,
     depois, só confirma QUAL cobrança foi paga. Se o navegador
     mandar "R$ 50" e a pessoa pagar R$ 50, o crédito é R$ 50 porque
     foi ISTO que ficou gravado agora — nunca porque o webhook
     repetiu um número que veio de fora. */
  const MINIMO_RECARGA_MICROS = 10_000_000; // R$ 10,00 — ver planejamento §1.3/§8

  const CORPO_RECARGA = z.object({
    /* Reais, com fração — "10", "10.5", "10,50" todos chegam como
       texto do campo de valor da tela. O parse tolera vírgula OU
       ponto; qualquer outra coisa é 400, não um NaN silencioso. */
    valor: z.union([z.string(), z.number()]),
  });

  app.post('/creditos/recarga', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send({ erro: 'Sessão expirada.' });

    const corpo = CORPO_RECARGA.safeParse(req.body);
    if (!corpo.success) return resposta.code(400).send({ erro: 'Valor inválido.' });

    const bruto = typeof corpo.data.valor === 'number' ? corpo.data.valor : corpo.data.valor.replace(',', '.');
    const valorReais = typeof bruto === 'number' ? bruto : Number.parseFloat(bruto);
    if (!Number.isFinite(valorReais) || valorReais <= 0) {
      return resposta.code(400).send({ erro: 'Informe um valor válido.' });
    }

    const valorMicros = reaisParaMicros(valorReais);
    if (valorMicros < MINIMO_RECARGA_MICROS) {
      return resposta.code(400).send({
        erro: `O valor mínimo de recarga é ${formatarReais(MINIMO_RECARGA_MICROS)}.`,
      });
    }

    /* Só o Mercado Pago usa isto (payer.email); o sandbox ignora.
       Busca aqui, não em `quemPede()`, porque nenhuma outra rota
       de crédito precisa do e-mail — pedir tudo sempre é que faz o
       "único ponto de sessão" virar single point of muita coisa. */
    const usuario = await db.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });

    const cobranca = await pspAtual().criarCobranca({
      valorMicros,
      descricao: 'Recarga de créditos',
      payerEmail: usuario?.email,
    });

    await db.cobrancaPix.create({
      data: {
        usuarioId,
        txid: cobranca.txid,
        valorMicros,
        status: 'aguardando',
        psp: env.PSP_DRIVER,
        brcode: cobranca.brcode,
        expiraEm: cobranca.expiraEm,
      },
    });

    /* O QR nasce AQUI, no servidor — não no navegador. `brcode` já
       é o payload EMV completo (o mesmo que vai no "copia e cola");
       o QR é só outra representação do MESMO texto, e um decodificador
       de QR errado devolveria um Pix que não bate com o que a pessoa
       vê escrito. Gerar os dois a partir da mesma fonte, no mesmo
       lugar, é o que garante que nunca divirjam. */
    const qrDataUrl = await QRCode.toDataURL(cobranca.brcode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 288,
    });

    return resposta.send({
      txid: cobranca.txid,
      brcode: cobranca.brcode,
      qr_data_url: qrDataUrl,
      valor_formatado: formatarReais(valorMicros),
      expira_em: cobranca.expiraEm.toISOString(),
    });
  });

  /* ---------- Consultar uma cobrança — para a tela dar polling ----------
     Só a PRÓPRIA cobrança: um txid de outra pessoa devolve 404, não
     403 — não existe motivo para confirmar que o txid existe e é de
     outra conta. */
  app.get('/creditos/recarga/:txid', async (req, resposta) => {
    const usuarioId = await quemPede(req);
    if (!usuarioId) return resposta.code(401).send({ erro: 'Sessão expirada.' });

    const params = z.object({ txid: z.string().min(1).max(25) }).safeParse(req.params);
    if (!params.success) return resposta.code(404).send({ erro: 'Cobrança não encontrada.' });

    const cobranca = await db.cobrancaPix.findFirst({
      where: { txid: params.data.txid, usuarioId },
    });
    if (!cobranca) return resposta.code(404).send({ erro: 'Cobrança não encontrada.' });

    return resposta.send({
      status: cobranca.status,
      valor_formatado: formatarReais(cobranca.valorMicros),
      pago_em: cobranca.pagoEm?.toISOString() ?? null,
      expira_em: cobranca.expiraEm.toISOString(),
    });
  });
}
