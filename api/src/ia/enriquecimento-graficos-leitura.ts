/* ============================================================
   Gráficos — leitura da resposta do modelo
   ============================================================
   Regras: Documentacao/enriquecimento-tema.md

   Sem `import`, mesmo motivo de outros módulos de leitura pura:
   esta é a parte que é decisão pura — o que da resposta vale, o que
   se descarta — separada de rede e banco, testável sem subir nada.

   Diferente de `enriquecimento-leitura.ts`, aqui o modelo EXTRAI dados
   do texto (números, valores) em vez de só rotular seções. Cada ponto
   de um gráfico é obrigado a citar sua `origem` — o número do recorte
   de onde aquele valor veio. Sem origem válida, o ponto some.
   ============================================================ */

export type PontoGrafico = {
  rotulo: string;
  valor: number;
  origem: string; // recorteId
};

export type Grafico = {
  tipo: 'barra' | 'linha' | 'pizza';
  titulo: string;
  eixoX?: string;
  eixoY?: string;
  dados: PontoGrafico[];
};

/* Títulos curtos — um gráfico com 300 caracteres de título não é
   título, é legenda. Mesmo critério de leitura guiada. */
export const TETO_TITULO_GRAFICO = 100;

export type RecorteNumerado = {
  n: number;
  recorteId: string;
};

/* ------------------------------------------------------------
   interpretar
   ------------------------------------------------------------ */
export function interpretar(bruto: string, recortes: RecorteNumerado[]): Grafico[] | null {
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let dados: unknown;
  try {
    dados = JSON.parse(limpo);
  } catch {
    /* Mesma recuperação de cerca/truncação de enriquecimento-leitura.ts */
    const i = limpo.indexOf('{');
    const corte = limpo.lastIndexOf('}');
    if (i === -1 || corte <= i) return null;

    const miolo = limpo.slice(i, corte + 1);
    try {
      dados = JSON.parse(miolo + ']}');
    } catch {
      try {
        dados = JSON.parse(miolo);
      } catch {
        return null;
      }
    }
  }

  const lista = (dados as { graficos?: unknown })?.graficos;
  if (!Array.isArray(lista)) return null;

  const porNumero = new Map(recortes.map((r) => [r.n, r.recorteId]));
  const graficos: Grafico[] = [];

  for (const item of lista) {
    const tipo = (item as { tipo?: unknown })?.tipo;
    const titulo = (item as { titulo?: unknown })?.titulo;
    const eixoX = (item as { eixo_x?: unknown })?.eixo_x;
    const eixoY = (item as { eixo_y?: unknown })?.eixo_y;
    const dadosGrafico = (item as { dados?: unknown })?.dados;

    // Validar tipo
    if (typeof tipo !== 'string' || !['barra', 'linha', 'pizza'].includes(tipo)) continue;

    // Validar título
    if (typeof titulo !== 'string' || !titulo.trim()) continue;

    // Validar dados
    if (!Array.isArray(dadosGrafico)) continue;

    const pontos: PontoGrafico[] = [];
    for (const ponto of dadosGrafico) {
      const rotulo = (ponto as { rotulo?: unknown })?.rotulo;
      const valor = (ponto as { valor?: unknown })?.valor;
      const origem = (ponto as { origem?: unknown })?.origem;

      // Validar rótulo
      if (typeof rotulo !== 'string' || !rotulo.trim()) continue;

      // Validar valor (deve ser número)
      if (typeof valor !== 'number' || isNaN(valor) || !isFinite(valor)) continue;

      // Validar origem (número do recorte)
      if (typeof origem !== 'number') continue;
      const recorteId = porNumero.get(origem);
      if (!recorteId) continue; // Número inexistente no tema

      pontos.push({
        rotulo: rotulo.trim(),
        valor,
        origem: recorteId,
      });
    }

    // Gráfico precisa de pelo menos 2 pontos para fazer sentido
    if (pontos.length < 2) continue;

    graficos.push({
      tipo: tipo as 'barra' | 'linha' | 'pizza',
      titulo: titulo.trim().slice(0, TETO_TITULO_GRAFICO),
      eixoX: typeof eixoX === 'string' ? eixoX.trim() : undefined,
      eixoY: typeof eixoY === 'string' ? eixoY.trim() : undefined,
      dados: pontos,
    });
  }

  return graficos;
}
