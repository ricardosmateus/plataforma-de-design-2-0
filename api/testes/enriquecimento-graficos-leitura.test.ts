import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { interpretar, type RecorteNumerado } from '../src/ia/enriquecimento-graficos-leitura.js';

const recortes: RecorteNumerado[] = [
  { n: 1, recorteId: 'rec-001' },
  { n: 2, recorteId: 'rec-002' },
  { n: 3, recorteId: 'rec-003' },
  { n: 4, recorteId: 'rec-004' },
  { n: 5, recorteId: 'rec-005' },
];

test('JSON válido com múltiplos gráficos', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: 'Crescimento por segmento',
        eixo_x: 'Segmento',
        eixo_y: 'Percentual',
        dados: [
          { rotulo: 'B2C', valor: 45, origem: 1 },
          { rotulo: 'B2B', valor: 25, origem: 2 },
        ],
      },
      {
        tipo: 'linha',
        titulo: 'Tendência de mercado',
        eixo_x: 'Ano',
        eixo_y: 'Volume',
        dados: [
          { rotulo: '2024', valor: 100, origem: 3 },
          { rotulo: '2025', valor: 150, origem: 4 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 2);
  assert.equal(resultado?.[0]?.tipo, 'barra');
  assert.equal(resultado?.[0]?.dados.length, 2);
  assert.equal(resultado?.[1]?.tipo, 'linha');
});

test('Ponto sem origem válido é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: 'Teste',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 20, origem: 999 },
          { rotulo: 'C', valor: 30, origem: 2 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
  assert.equal(resultado?.[0]?.dados.length, 2);
  assert.equal(resultado?.[0]?.dados?.[0]?.origem, 'rec-001');
  assert.equal(resultado?.[0]?.dados?.[1]?.origem, 'rec-002');
});

test('Ponto com valor não-numérico é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: 'Teste',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 'não-é-número', origem: 2 },
          { rotulo: 'C', valor: 30, origem: 3 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
  assert.equal(resultado?.[0]?.dados.length, 2);
});

test('Gráfico com menos de 2 pontos válidos é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: 'Gráfico com só 1 ponto',
        dados: [{ rotulo: 'A', valor: 10, origem: 1 }],
      },
      {
        tipo: 'barra',
        titulo: 'Gráfico válido',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 20, origem: 2 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
  assert.equal(resultado?.[0]?.titulo, 'Gráfico válido');
});

test('Tipo de gráfico inválido é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'radar',
        titulo: 'Teste',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 20, origem: 2 },
        ],
      },
      {
        tipo: 'barra',
        titulo: 'Válido',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 20, origem: 2 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
});

test('Titulo vazio é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: '',
        dados: [
          { rotulo: 'A', valor: 10, origem: 1 },
          { rotulo: 'B', valor: 20, origem: 2 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 0);
});

test('Resposta ilegível retorna null', () => {
  const bruto = '{"graficos": [invalid json';
  const resultado = interpretar(bruto, recortes);
  assert.equal(resultado, null);
});

test('Gráfico sem campo dados é descartado', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'barra',
        titulo: 'Sem dados',
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 0);
});

test('Pizza funciona igual', () => {
  const bruto = JSON.stringify({
    graficos: [
      {
        tipo: 'pizza',
        titulo: 'Distribuição de mercado',
        dados: [
          { rotulo: 'Concorrente A', valor: 35, origem: 1 },
          { rotulo: 'Concorrente B', valor: 25, origem: 2 },
          { rotulo: 'Nós', valor: 40, origem: 3 },
        ],
      },
    ],
  });

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
  assert.equal(resultado?.[0]?.tipo, 'pizza');
  assert.equal(resultado?.[0]?.dados.length, 3);
});

test('Cercas de código são removidas', () => {
  const bruto = `
\`\`\`json
${JSON.stringify({
  graficos: [
    {
      tipo: 'barra',
      titulo: 'Teste',
      dados: [
        { rotulo: 'A', valor: 10, origem: 1 },
        { rotulo: 'B', valor: 20, origem: 2 },
      ],
    },
  ],
})}
\`\`\`
  `;

  const resultado = interpretar(bruto, recortes);
  assert.ok(resultado !== null);
  assert.equal(resultado?.length, 1);
});
