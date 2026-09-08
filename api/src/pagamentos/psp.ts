/* ============================================================
   Psp — a interface trocável
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §7, Fase 3

   Mesma forma de `Provedor` em `ia/provedor.ts` — o padrão desta
   casa para "peça que vai mudar por decisão de negócio, não de
   engenharia" (aqui, a decisão C3: qual PSP, ainda em aberto).
   Nenhuma rota conhece o provedor por trás disto, só este
   contrato. Trocar sandbox por um PSP de verdade na Fase 4 é
   escrever outra classe com o mesmo `Psp` — não reescrever rota.
   ============================================================ */

export type StatusCobranca = 'aguardando' | 'pago' | 'expirado' | 'cancelado';

export type CobrancaCriada = {
  txid: string;
  /** O payload EMV completo — o "copia e cola" / fonte do QR Code. */
  brcode: string;
  expiraEm: Date;
};

export type StatusConsultado = {
  status: StatusCobranca;
  pagoEm: Date | null;
  /** Id que o Banco Central dá ao Pix pago de verdade. Nulo até
   * `status === 'pago'`. */
  e2eId: string | null;
  /** Quanto o PSP reteve de taxa sobre esta cobrança, em micros de
   * real. `null` quando o PSP não reporta taxa nenhuma (o sandbox,
   * de propósito — não existe taxa fictícia) ou quando o pagamento
   * ainda não está `pago`. Quem credita decide o resto: o valor que
   * entra na conta do usuário é sempre bruto menos esta taxa. */
  taxaMicros: number | null;
  /** O retorno cru do PSP, para `retorno_bruto` — auditoria e
   * disputa, sem reconstrução a partir de colunas já interpretadas. */
  bruto: unknown;
};

export interface Psp {
  /* `payerEmail` é opcional e só o Mercado Pago usa — o sandbox
     ignora. Fica na assinatura comum porque é dado que a rota tem
     disponível (o e-mail do usuário) e que o provedor real pede;
     não vale a pena um segundo método só pra isso. */
  criarCobranca(input: { valorMicros: number; descricao: string; payerEmail?: string }): Promise<CobrancaCriada>;

  /* SEG-PAG-002: é ISTO que o webhook chama depois de tocar a
     campainha — nunca confia no corpo do aviso sozinho. Devolve
     `null` quando o PSP não reconhece o txid (nunca deveria
     acontecer com um txid nosso, mas "nunca deveria" não é
     garantia — um `null` aqui é erro de programação para quem
     chamou tratar, não um 500 estourado sem contexto). */
  consultarCobranca(txid: string): Promise<StatusConsultado | null>;
}

/* ------------------------------------------------------------
   Qual PSP usar — decisão C3, ainda em aberto (§2 do planejamento)
   ------------------------------------------------------------
   Só sandbox por enquanto. Quando C3 for decidida (Fase 4), este é
   o único lugar que muda: uma nova classe implementando `Psp`,
   escolhida aqui por configuração — nenhuma rota precisa saber.
   Mesmo padrão de `provedorAtual()` em `ia/provedor.ts`.
   ------------------------------------------------------------ */
import { env } from '../env.js';
import { PspSandbox } from './psp-sandbox.js';
import { PspMercadoPago } from './psp-mercado-pago.js';

let instancia: Psp | null = null;

export function pspAtual(): Psp {
  if (!instancia) {
    /* `env.ts` já garante, na partida, que MERCADO_PAGO_ACCESS_TOKEN
       existe quando PSP_DRIVER=mercado_pago — o `!` aqui não é uma
       aposta, é o resultado dessa checagem já ter acontecido antes
       de qualquer rota rodar. */
    instancia = env.PSP_DRIVER === 'mercado_pago'
      ? new PspMercadoPago(env.MERCADO_PAGO_ACCESS_TOKEN!)
      : new PspSandbox(env.PIX_CHAVE_SANDBOX, env.PIX_NOME_RECEBEDOR, env.PIX_CIDADE_RECEBEDOR);
  }
  return instancia;
}
