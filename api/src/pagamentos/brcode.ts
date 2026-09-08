/* ============================================================
   BR Code — o payload EMV do Pix (o "copia e cola" / QR Code)
   ============================================================
   Planejamento: planejamento-creditos-e-pagamento.md §7, Fase 3

   Módulo PURO. Nenhum banco, nenhuma rede, nenhum provedor. É a
   peça que o planejamento pede como prova sem depender de nada
   externo: "função pura, e tem vetores de teste conhecidos — dá
   para provar que está certo sem banco e sem rede".

   ------------------------------------------------------------
   O FORMATO — TLV (Tag-Length-Value)
   ------------------------------------------------------------
   Cada campo do payload é: um ID de 2 dígitos, um TAMANHO de 2
   dígitos (quantos bytes tem o valor), e o VALOR. Campos podem
   aninhar outros campos (é o caso do 26 e do 62 aqui). O padrão é
   o EMV QR Code Specification, que o Pix usa como base — não é
   invenção deste arquivo, é o mesmo formato que qualquer banco lê.

   Este módulo gera um BR Code ESTÁTICO com valor: tudo que o
   pagador precisa está dentro do próprio payload — chave, valor,
   identificador — sem depender de uma URL que o nosso PSP hospede
   (por isso o Método de Iniciação é "11", não "12" — o "12" exige
   um campo de URL que este payload não tem). Isso é o que permite
   o QR funcionar em sandbox sem expor endpoint nenhum.

   ------------------------------------------------------------
   O CRC16 — por que é a parte que mais importa acertar
   ------------------------------------------------------------
   O último campo (63) é uma soma de verificação sobre o payload
   INTEIRO até ali, incluindo o próprio "6304" (o ID e o tamanho do
   campo do CRC, mas não o valor — que é justamente o que está
   sendo calculado). Um CRC errado faz QUALQUER aplicativo de banco
   recusar o código na hora de escanear, silenciosamente — por
   isso ele é testado contra um vetor de referência CONHECIDO
   (CRC-16/CCITT-FALSE sobre "123456789" = 0x29B1, valor publicado
   no catálogo de CRCs), não só contra a lógica do próprio arquivo.
   ============================================================ */

const GUI_PIX = 'br.gov.bcb.pix';

export type DadosCobranca = {
  /** A chave Pix do recebedor (e-mail, telefone, CPF/CNPJ ou
   * aleatória). Em sandbox, uma chave de teste — nunca uma chave
   * real até a Fase 4. */
  chavePix: string;
  /** DIN-001: sempre micro de real, nunca decimal solto. */
  valorMicros: number;
  /** Identificador da cobrança. Alfanumérico, sem hífen — o campo
   * de referência do EMV não aceita os caracteres de um UUID cru.
   * Ver `gerarTxid()`. */
  txid: string;
  /** Nome de quem recebe. Truncado a 25 caracteres, sem acento —
   * é o limite e o alfabeto que o campo 59 do EMV aceita. */
  nomeRecebedor: string;
  /** Cidade de quem recebe. Truncado a 15 caracteres, sem acento —
   * limite do campo 60. */
  cidadeRecebedor: string;
  /** Texto livre opcional, visível para quem paga antes de
   * confirmar. */
  descricao?: string;
};

/* ------------------------------------------------------------
   Sanitização — o alfabeto do EMV
   ------------------------------------------------------------
   O padrão exige um subconjunto de ASCII (letras maiúsculas,
   dígitos, poucos símbolos). Acento e minúscula não são só
   "feios" aqui — alguns leitores de QR recusam o payload inteiro.
   Normaliza removendo acento, maiuscula, e mantém só letras,
   números e espaço — nunca lança erro por causa de um caractere
   estranho, só o descarta (o nome do recebedor não é dado
   auditável; truncar é seguro, gravar o valor original fica em
   outra coluna, fora deste módulo). */
function paraAlfabetoEmv(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '');
}

/** Um txid válido para o campo de referência do EMV: só
 * maiúsculas e dígitos, sem hífen (um UUID cru tem hífen e
 * excede o tamanho). 25 caracteres é o teto do campo — geramos
 * exatamente isso, nunca mais. */
export function gerarTxid(aleatorio: () => number = Math.random): string {
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let txid = '';
  for (let i = 0; i < 25; i++) {
    txid += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)];
  }
  return txid;
}

/* ------------------------------------------------------------
   TLV
   ------------------------------------------------------------ */
function campo(id: string, valor: string): string {
  if (valor.length > 99) {
    /* O tamanho do campo é sempre 2 dígitos (00–99 bytes). Um
       valor maior que isso é erro de quem chamou, não algo para
       truncar em silêncio — silêncio aqui geraria um payload que
       PARECE válido e não é. */
    throw new RangeError(`campo EMV "${id}" excede 99 bytes: "${valor}"`);
  }
  return id + String(valor.length).padStart(2, '0') + valor;
}

/** Converte micro de real em "12.34" — o formato decimal que o
 * campo 54 exige — por ARITMÉTICA INTEIRA, nunca dividindo por
 * 100 em ponto flutuante. Mesma razão de `dinheiro.ts` inteiro:
 * um valor de cobrança errado por causa de arredondamento de
 * ponto flutuante é o tipo de bug que corrompe dinheiro de
 * verdade, não só um pixel na tela. */
function microsParaValorEmv(micros: number): string {
  if (!Number.isInteger(micros) || micros <= 0) {
    throw new RangeError('valorMicros precisa ser um inteiro positivo');
  }
  const centavos = Math.round(micros / 10_000); // MICROS_POR_CENTAVO, ver dinheiro.ts
  const inteiros = Math.floor(centavos / 100);
  const resto = centavos % 100;
  return `${inteiros}.${String(resto).padStart(2, '0')}`;
}

/* ------------------------------------------------------------
   CRC16/CCITT-FALSE — poly 0x1021, init 0xFFFF, sem reflexão,
   xorout 0x0000. É o algoritmo que o Pix usa, não uma escolha
   deste arquivo — mudar qualquer uma dessas quatro constantes
   produz um payload que todo banco recusa.
   ------------------------------------------------------------ */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Monta o BR Code inteiro, pronto para virar QR Code ou ser
 * mostrado como "copia e cola". Lança erro de validação — nunca
 * devolve um payload capenga: um BR Code malformado que passa
 * batido é dinheiro que não vai chegar a lugar nenhum, e o
 * pagador só descobre isso no banco dele, não no nosso. */
export function montarBrcode(dados: DadosCobranca): string {
  const chave = dados.chavePix.trim();
  if (!chave) throw new RangeError('chavePix não pode ser vazia');

  const txid = dados.txid.trim();
  if (!/^[A-Za-z0-9]{1,25}$/.test(txid)) {
    throw new RangeError('txid precisa ser alfanumérico, sem hífen, até 25 caracteres');
  }

  const nome = paraAlfabetoEmv(dados.nomeRecebedor).slice(0, 25).trim() || 'RECEBEDOR';
  const cidade = paraAlfabetoEmv(dados.cidadeRecebedor).slice(0, 15).trim() || 'BRASIL';
  const descricao = dados.descricao ? paraAlfabetoEmv(dados.descricao).slice(0, 72) : undefined;

  const contaComerciante =
    campo('00', GUI_PIX) + campo('01', chave) + (descricao ? campo('02', descricao) : '');

  const dadosAdicionais = campo('05', txid.toUpperCase());

  const semCrc =
    campo('00', '01') + // Payload Format Indicator
    campo('01', '11') + // Método de Iniciação: estático (sem URL)
    campo('26', contaComerciante) + // Conta Pix do recebedor
    campo('52', '0000') + // Merchant Category Code — não informado
    campo('53', '986') + // Moeda: BRL (ISO 4217)
    campo('54', microsParaValorEmv(dados.valorMicros)) + // Valor
    campo('58', 'BR') + // País
    campo('59', nome) + // Nome do recebedor
    campo('60', cidade) + // Cidade do recebedor
    campo('62', dadosAdicionais) + // Referência (nosso txid)
    '6304'; // ID + tamanho do CRC — o valor vem a seguir

  return semCrc + crc16(semCrc);
}
