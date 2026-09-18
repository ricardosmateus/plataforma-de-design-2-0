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

/* ------------------------------------------------------------
   DIN-014 — o consumo medido que não virou lançamento
   ------------------------------------------------------------
   `CREDITOS_COBRAR=nao` desliga a cobrança e NÃO desliga a medição
   (DIN-011): o consumo é gravado em `consumos_ia`/`consumos_pesquisa`
   e nenhuma linha entra na razão. Isso sempre foi assim, e sempre foi
   invisível — até DIN-013 fazer do Histórico de uso o ÚNICO lugar
   onde valor aparece. Aí as duas decisões juntas produziram o que
   nenhuma delas pretendia: um gasto medido, gravado, e invisível em
   todo o produto.

   A correção NÃO é lançar na razão quando a cobrança está desligada —
   isso mentiria sobre o saldo e quebraria DIN-002. É mostrar, no
   Histórico, as linhas medidas que não têm lançamento, marcadas como
   não cobradas. A razão continua sendo a verdade do saldo; o Histórico
   passa a ser a verdade do CONSUMO, que é o que a tela promete.

   DIN-007 continua intacto: daqui sai só `totalMicros`. `custoMicros`
   e `comissaoMicros` não são nem selecionados — não é uma questão de
   não mandar, é de não ler.
   ------------------------------------------------------------ */
type MedidoNaoCobrado = {
  id: string;
  origem: 'uso_ia' | 'pesquisa';
  totalMicros: number;
  criadoEm: Date;
  descricao: string;
};

async function medidosSemLancamento(usuarioId: string, limite: number): Promise<MedidoNaoCobrado[]> {
  /* `operacaoId: { not: null }` é o que protege contra contar duas
     vezes: linha anterior a 17/09/2026 não guardava a chave, então
     não há como saber se foi cobrada. Fica de fora — mostrar um gasto
     que já aparece como lançamento seria pior que não mostrá-lo. */
  const comum = {
    usuarioId,
    operacaoId: { not: null },
    totalMicros: { gt: 0 },
  } as const;

  const [ia, pesquisa] = await Promise.all([
    db.consumoIa.findMany({
      where: comum,
      select: { id: true, operacaoId: true, totalMicros: true, criadoEm: true, tipo: true },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    }),
    db.consumoPesquisa.findMany({
      where: comum,
      select: { id: true, operacaoId: true, totalMicros: true, criadoEm: true, nivel: true },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    }),
  ]);

  const operacoes = [...ia, ...pesquisa].map((c) => c.operacaoId as string);
  if (!operacoes.length) return [];

  /* Uma consulta só, pelo conjunto de chaves. `tipo: 'consumo'`
     porque reserva e liberação também carregam o mesmo `origemId`, e
     elas se anulam — quem diz "isto foi cobrado" é o consumo. */
  const cobrados = await db.creditoLancamento.findMany({
    where: { usuarioId, tipo: 'consumo', origemId: { in: operacoes } },
    select: { origemId: true },
  });
  const jaCobrado = new Set(cobrados.map((l) => l.origemId as string));

  const NOME_IA: Record<string, string> = {
    assistente: 'assistente',
    classificacao: 'classificação automática',
    sintese_tema: 'leitura guiada de tema',
  };

  const linhas: MedidoNaoCobrado[] = [];
  for (const c of ia) {
    if (jaCobrado.has(c.operacaoId as string)) continue;
    linhas.push({
      id: c.id,
      origem: 'uso_ia',
      totalMicros: c.totalMicros as number,
      criadoEm: c.criadoEm,
      /* Mesmo vocabulário de `descricaoDe` em creditos/reserva.ts: a
         linha não cobrada tem de ler igual à cobrada, senão a etiqueta
         "não cobrado" some no meio de duas frases diferentes. */
      descricao: `Uso da plataforma — ${NOME_IA[c.tipo] ?? String(c.tipo)}`,
    });
  }
  for (const c of pesquisa) {
    if (jaCobrado.has(c.operacaoId as string)) continue;
    linhas.push({
      id: c.id,
      origem: 'pesquisa',
      totalMicros: c.totalMicros as number,
      criadoEm: c.criadoEm,
      descricao: 'Uso da plataforma — pesquisa de concorrentes',
    });
  }
  return linhas;
}

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

    const PAGINA = 50;
    const [linhas, medidos] = await Promise.all([
      extratoDe(usuarioId, PAGINA),
      medidosSemLancamento(usuarioId, PAGINA),
    ]);

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

    /* As duas listas viram uma, na ordem do tempo. O `cobrado` é o que
       separa: `true` para tudo que veio da razão, `false` para o que
       foi medido e não lançado. A tela decide como dizer isso. */
    type Item = {
      ordem: number;
      linha: Record<string, unknown>;
    };
    const itens: Item[] = medidos.map((m) => ({
      ordem: m.criadoEm.getTime(),
      linha: {
        id: m.id,
        tipo: 'consumo',
        rotulo: ROTULO.consumo,
        entrou: false,
        valor_micros: -Math.abs(m.totalMicros),
        valor_formatado: formatarReais(m.totalMicros),
        /* Nulo, e não o saldo de agora: esta linha não mexeu no saldo,
           e repetir o saldo atual em cada uma daria a impressão de que
           mexeu e não mudou nada. */
        saldo_depois_formatado: null,
        descricao: m.descricao,
        criado_em: m.criadoEm.toISOString(),
        valor_pago_formatado: null,
        taxa_formatada: null,
        cobrado: false,
      },
    }));

    const daRazao: Item[] = linhas.map((l) => {
        const cobranca = l.origemId ? porId.get(l.origemId) : undefined;
        /* Só vale a pena mostrar o detalhe quando houve taxa: numa
           recarga sem taxa nenhuma, "pagou R$ X, taxa R$ 0,00,
           creditado R$ X" é ruído que não explica nada. */
        const temTaxa = Boolean(cobranca?.taxaMicros && cobranca.taxaMicros > 0);

        return {
          ordem: l.criadoEm.getTime(),
          linha: {
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
          cobrado: true,
        },
      };
    });

    return resposta.send({
      lancamentos: daRazao
        .concat(itens)
        .sort((a, b) => b.ordem - a.ordem)
        .slice(0, PAGINA)
        .map((x) => x.linha),
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
