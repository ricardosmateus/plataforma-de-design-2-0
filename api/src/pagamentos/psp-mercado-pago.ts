/* ============================================================
   PSP Mercado Pago — Fase 4
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §7, Fase 4.
   Decisão C3 (§2): Mercado Pago.

   Implementa a mesma interface `Psp` do sandbox — nenhuma rota
   precisa saber que trocou (é o ponto inteiro de `psp.ts` existir).
   Usa a API clássica de pagamentos (POST /v1/payments,
   payment_method_id: "pix"), não a Orders API mais nova: para uma
   cobrança avulsa — sem parcelamento, sem outros meios de
   pagamento no mesmo pedido — é a que casa exatamente com o
   desenho deste módulo, um Pix por vez.

   ------------------------------------------------------------
   O TXID AQUI É O ID DO PAGAMENTO NO MERCADO PAGO
   ------------------------------------------------------------
   Diferente do sandbox, que gera o próprio txid em `brcode.ts`,
   aqui `txid` = `payment.id` (convertido pra string). Isso mantém
   `consultarCobranca(txid)` uma chamada direta a
   `GET /v1/payments/:id`, sem precisar de uma tabela de
   correspondência txid-nosso ↔ id-deles.

   O BR Code (`brcode`) sai pronto da resposta deles — mas o QR
   Code em si não: `rotas/creditos.ts` gera o nosso próprio, a
   partir do MESMO texto do `brcode`, com o pacote `qrcode` (não
   usa o `qr_code_base64` que o Mercado Pago também devolve). Uma
   fonte só pros dois nunca poderem divergir.

   ------------------------------------------------------------
   CONFIRMADO CONTRA A API DE VERDADE (conta oficial, dinheiro real)
   ------------------------------------------------------------
   O mapeamento `approved → 'pago'` foi validado com um Pix real,
   pago de verdade e creditado na plataforma. Dois pontos AINDA não
   passaram por um teste real (não bloqueiam se o dinheiro entra —
   só a auditoria):

   1. O mapeamento de `status`/`status_detail` para 'expirado' —
      `statusDe()` assume que `status_detail` contém "expir"; ainda
      sem um Pix vencido de verdade para confirmar o texto exato.
   2. O campo do id ponta-a-ponta (e2e) do Pix — `consultarCobranca`
      tenta dois nomes plausíveis e cai para `null` se nenhum bater.

   ------------------------------------------------------------
   TAXA DO MERCADO PAGO — SEMPRE A DA TRANSAÇÃO, NUNCA UM PERCENTUAL FIXO
   ------------------------------------------------------------
   `fee_details` vem na resposta de `GET /v1/payments/:id` com a taxa
   REAL retida nesta cobrança específica (confirmado ao vivo: R$ 10,00
   cobrados, R$ 9,90 líquidos — 1% neste caso, mas o código nunca
   assume esse número; soma `fee_details[].amount`). É esse valor,
   convertido pra micros, que sai em `StatusConsultado.taxaMicros` e
   que `confirmarPagamento()` (rotas/webhooks.ts) desconta do bruto
   antes de creditar o usuário.
   ============================================================ */

import { randomUUID } from 'node:crypto';

import { microsParaCentavos, reaisParaMicros } from '../creditos/dinheiro.js';
import type { Psp, CobrancaCriada, StatusConsultado, StatusCobranca } from './psp.js';

const BASE_URL = 'https://api.mercadopago.com';
const MINUTOS_PARA_EXPIRAR = 30;

/* Só os campos que este arquivo lê. A resposta de verdade do
   Mercado Pago tem muito mais coisa — o resto vai inteiro para
   `retornoBruto`, sem precisar de tipo nenhum para isso. */
type PagamentoMercadoPago = {
  id: number | string;
  status: string;
  status_detail?: string;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      end_to_end_id?: string;
      bank_transfer_id?: string | number;
    };
  };
  /* A taxa de verdade cobrada NESTA transação — não um percentual
     fixo nosso. `amount` já vem em reais, igual `transaction_amount`.
     Pode ter mais de uma linha (ex.: taxa do meio de pagamento +
     taxa de antecipação); soma todas — é o total retido, não uma
     categoria específica, que interessa pra saber quanto sobrou. */
  fee_details?: Array<{ type?: string; amount?: number; fee_payer?: string }>;
};

function statusDe(p: Pick<PagamentoMercadoPago, 'status' | 'status_detail'>): StatusCobranca {
  if (p.status === 'approved') return 'pago';
  if (p.status === 'cancelled' || p.status === 'rejected') {
    /* Ver o cabeçalho deste arquivo — não confirmado ao vivo ainda.
       Na dúvida, cai em 'cancelado': nunca afirma "expirado" sem
       ter certeza. */
    return p.status_detail?.toLowerCase().includes('expir') ? 'expirado' : 'cancelado';
  }
  // pending, in_process, authorized, in_mediation, ...
  return 'aguardando';
}

/* Mercado Pago quer o valor em reais, decimal, duas casas — não em
   micros. Passa pelo mesmo arredondamento-pra-cima de
   `microsParaCentavos` (nunca cobrar menos do que o registrado) em
   vez de dividir direto: um caminho só pra virar centavo, o mesmo
   que a tela usa. */
function microsParaReaisNumero(micros: number): number {
  return microsParaCentavos(micros) / 100;
}

/* Soma de `fee_details[].amount` — a taxa REAL desta transação,
   como o Mercado Pago mesmo reportou, não um percentual fixo que a
   gente assume e que pode ficar desatualizado sem avisar. `null`
   quando o campo não vem (pagamento ainda não aprovado, ou algum
   tipo de pagamento que este PSP não cobra taxa) — nunca `0` por
   ausência: `0` afirmaria "cobraram e a taxa deu zero". */
function taxaMicrosDe(p: Pick<PagamentoMercadoPago, 'fee_details'>): number | null {
  if (!p.fee_details?.length) return null;
  const totalReais = p.fee_details.reduce((soma, f) => soma + (f.amount ?? 0), 0);
  return reaisParaMicros(totalReais);
}

/* Formato exigido pelo Mercado Pago: yyyy-MM-ddTHH:mm:ss.SSSzzz,
   com offset explícito. Fixo em -03:00 (horário de Brasília, sem
   horário de verão desde 2019) — é o fuso de negócio da plataforma,
   não o fuso da máquina que hospeda a API. */
function paraIso8601ComOffset(data: Date): string {
  const comOffset = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return comOffset.toISOString().replace('Z', '-03:00');
}

export class PspMercadoPago implements Psp {
  constructor(private readonly accessToken: string) {}

  private async chamar<T>(caminho: string, opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; idempotente?: boolean }): Promise<T> {
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (opcoes.idempotente) cabecalhos['X-Idempotency-Key'] = randomUUID();

    const resposta = await fetch(`${BASE_URL}${caminho}`, {
      method: opcoes.metodo,
      headers: cabecalhos,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    });
    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new Error(`Mercado Pago recusou ${opcoes.metodo} ${caminho}: ${resposta.status} ${JSON.stringify(corpo)}`);
    }
    return corpo as T;
  }

  async criarCobranca(input: { valorMicros: number; descricao: string; payerEmail?: string }): Promise<CobrancaCriada> {
    const expiraEm = new Date(Date.now() + MINUTOS_PARA_EXPIRAR * 60_000);

    const payer: { email: string; first_name?: string } = {
      email: input.payerEmail || 'sem-email@plataformadedesign.com',
    };
    /* Truque documentado pelo Mercado Pago para aprovar automaticamente
       um pagamento de TESTE, sem precisar pagar de verdade — oficialmente
       descrito para a Orders API (/v1/orders), não confirmado ainda para
       esta API clássica (/v1/payments). Vale a pena tentar: é seguro
       (só entra com token de teste) e, se não bater, o pagamento
       simplesmente fica 'pending' como qualquer Pix real — não quebra
       nada, só não confirma sozinho. */
    if (this.accessToken.startsWith('TEST-')) payer.first_name = 'APRO';

    const pagamento = await this.chamar<PagamentoMercadoPago>('/v1/payments', {
      metodo: 'POST',
      idempotente: true,
      corpo: {
        transaction_amount: microsParaReaisNumero(input.valorMicros),
        description: input.descricao,
        payment_method_id: 'pix',
        payer,
        date_of_expiration: paraIso8601ComOffset(expiraEm),
        external_reference: randomUUID(),
      },
    });

    const brcode = pagamento.point_of_interaction?.transaction_data?.qr_code;
    if (!brcode) {
      throw new Error('Mercado Pago não devolveu o payload Pix (qr_code) na criação do pagamento.');
    }

    return { txid: String(pagamento.id), brcode, expiraEm };
  }

  async consultarCobranca(txid: string): Promise<StatusConsultado | null> {
    let pagamento: PagamentoMercadoPago;
    try {
      pagamento = await this.chamar<PagamentoMercadoPago>(`/v1/payments/${encodeURIComponent(txid)}`, { metodo: 'GET' });
    } catch {
      /* Cobre tanto "não existe" (404 deles) quanto falha de rede —
         não há como diferenciar barato aqui sem inspecionar o
         status HTTP guardado dentro do throw. Tratar os dois como
         "não encontrado" é o lado seguro: nunca credita por engano,
         e quem chamou já loga esse `null`. */
      return null;
    }

    const td = pagamento.point_of_interaction?.transaction_data;
    return {
      status: statusDe(pagamento),
      pagoEm: pagamento.date_approved ? new Date(pagamento.date_approved) : null,
      e2eId: td?.end_to_end_id ?? (td?.bank_transfer_id != null ? String(td.bank_transfer_id) : null),
      taxaMicros: taxaMicrosDe(pagamento),
      bruto: pagamento,
    };
  }
}
