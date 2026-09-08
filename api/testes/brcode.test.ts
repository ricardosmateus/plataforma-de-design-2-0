/* Testes de `src/pagamentos/brcode.ts` — puros, sem banco e sem rede. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, montarBrcode, gerarTxid } from '../src/pagamentos/brcode.js';

describe('CRC16/CCITT-FALSE', () => {
  test('bate com o vetor de referência publicado no catálogo de CRCs', () => {
    /* poly=0x1021 init=0xFFFF refin=false refout=false xorout=0x0000,
       sobre a string ASCII "123456789" — o valor "check" oficial
       deste algoritmo é 0x29B1. Se isto quebrar, TODO BR Code gerado
       está errado, mesmo que o resto do arquivo pareça certo. */
    assert.equal(crc16('123456789'), '29B1');
  });

  test('string vazia não quebra', () => {
    assert.equal(crc16(''), 'FFFF');
  });

  test('é determinístico — mesmo texto, mesmo CRC sempre', () => {
    const texto = '00020101021126360014br.gov.bcb.pix';
    assert.equal(crc16(texto), crc16(texto));
  });

  test('um caractere diferente muda o CRC', () => {
    assert.notEqual(crc16('0002010102'), crc16('0002010103'));
  });
});

describe('gerarTxid', () => {
  test('sempre 25 caracteres, só maiúsculas e dígitos', () => {
    const txid = gerarTxid();
    assert.equal(txid.length, 25);
    assert.match(txid, /^[A-Z0-9]{25}$/);
  });

  test('gerador determinístico produz o mesmo txid duas vezes', () => {
    let chamadas = 0;
    const sequencia = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05,
      0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.02,
      0.12, 0.22, 0.32, 0.42, 0.52];
    const aleatorioFalso = () => sequencia[chamadas++ % sequencia.length] as number;
    const a = gerarTxid(aleatorioFalso);
    chamadas = 0;
    const b = gerarTxid(aleatorioFalso);
    assert.equal(a, b);
  });
});

describe('montarBrcode', () => {
  const BASE = {
    chavePix: 'financeiro@plataformadedesign.com',
    valorMicros: 50_000_000, // R$ 50,00
    txid: 'ABC123XYZ0000000000000001',
    nomeRecebedor: 'Plataforma de Design',
    cidadeRecebedor: 'São Paulo',
  };

  test('começa com o Payload Format Indicator e o Método de Iniciação estático', () => {
    const bc = montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25) });
    assert.ok(bc.startsWith('000201'), 'campo 00 (payload format) tem que vir primeiro');
    assert.ok(bc.includes('010211'), 'campo 01 (método de iniciação) tem que ser "11" (estático)');
  });

  test('o CRC dos últimos 4 caracteres bate com o CRC recalculado sobre o resto', () => {
    /* A prova mais forte: pega o payload MONTADO, separa o que o
       próprio módulo diz ser o CRC, recalcula por fora com a mesma
       função, e confere que os dois concordam — isso pega qualquer
       erro de "esqueci de incluir o 6304 na conta" ou similar. */
    const bc = montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25) });
    const semCrc = bc.slice(0, -4);
    const crcEmbutido = bc.slice(-4);
    assert.equal(crcEmbutido, crc16(semCrc));
  });

  test('contém a chave Pix, o GUI do Pix e o valor formatado', () => {
    const bc = montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25) });
    assert.ok(bc.includes('br.gov.bcb.pix'));
    assert.ok(bc.includes(BASE.chavePix));
    assert.ok(bc.includes('540550.00'), 'campo 54 (valor), com o tamanho "05" na frente, precisa aparecer como "50.00"');
  });

  test('nome e cidade perdem acento e viram maiúsculo', () => {
    const bc = montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25), cidadeRecebedor: 'São Paulo' });
    assert.ok(bc.includes('SAO PAULO'), 'cidade sem acento e maiúscula tem que aparecer no payload');
    assert.ok(!bc.includes('São'), 'acento não pode sobreviver no EMV');
  });

  test('valor zero ou negativo é recusado, nunca vira "0.00" no payload', () => {
    assert.throws(() => montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25), valorMicros: 0 }), RangeError);
    assert.throws(() => montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25), valorMicros: -1 }), RangeError);
  });

  test('txid com hífen (um UUID cru, por exemplo) é recusado', () => {
    assert.throws(
      () => montarBrcode({ ...BASE, txid: '123e4567-e89b-12d3-a456-426614174000' }),
      RangeError,
    );
  });

  test('chave Pix vazia é recusada', () => {
    assert.throws(() => montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25), chavePix: '' }), RangeError);
  });

  test('um centavo (o menor valor possível) ainda produz payload válido', () => {
    const bc = montarBrcode({ ...BASE, txid: BASE.txid.slice(0, 25), valorMicros: 10_000 });
    assert.ok(bc.includes('0.01'));
    const semCrc = bc.slice(0, -4);
    assert.equal(bc.slice(-4), crc16(semCrc));
  });
});
