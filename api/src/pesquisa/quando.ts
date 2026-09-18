/* ============================================================
   Quanto tempo faz, em palavras — 15/09/2026
   ============================================================
   Existe por causa de uma decisão de dinheiro. Quando a tarefa já
   tem resposta, a pessoa escolhe entre ver a que existe (de graça)
   e investigar de novo (pago) — e o que decide isso não é a data
   absoluta, é a DISTÂNCIA. "há 20 minutos" e "há três meses" pedem
   decisões opostas; "14/09 às 18:32" obriga quem lê a fazer a conta
   antes de decidir.

   Mora fora de `rotas/pesquisa.ts` de propósito: é função pura, e
   enquanto estava lá o teste dela arrastava o módulo de rotas e o
   cliente do Prisma junto. Teste de formatar data não deveria
   precisar de banco para rodar.
   ============================================================ */

export function formatarQuando(quando: Date, agora = new Date()): string {
  const minutos = Math.max(0, Math.round((+agora - +quando) / 60_000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} minuto(s)`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} hora(s)`;

  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} dia(s)`;

  const meses = Math.round(dias / 30);
  return `há ${meses} mês(es)`;
}
