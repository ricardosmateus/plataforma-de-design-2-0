# Regras de Negócio — Créditos e Pagamentos

> **Status:** Fase 4 concluída (01/09/2026)  
> **Última atualização:** 01/09/2026  
> **Escopo:** Recarga via Pix real, desconto de taxa, portabilidade para todas as páginas

---

## Sumário das Regras

### DIN — Regras de Dinheiro (Integridade)

| ID | Regra | Aplicação |
|---|---|---|
| **DIN-001** | Tudo em **micros de real** (número inteiro). Zero decimais em lugar nenhum. | Todas as colunas de dinheiro (`valor_micros`, `taxa_micros`, `saldo_micros`). Centavo aparece só na tela e no Pix. |
| **DIN-002** | A **razão é a verdade**; o saldo é cache. Todo movimento é uma linha nova, nunca edição. | Tabela `creditos_lancamentos` é append-only. Saldo em `users.saldo_micros` é recalculado por transação, após cada lançamento. |
| **DIN-003** | O valor a creditar vem **do nosso registro**, nunca do navegador ou webhook. | Navegador diz "quero R$ 50"; servidor cria cobrança com R$ 50 e guarda. Webhook só diz qual cobrança foi paga — credita-se do valor guardado. |
| **DIN-004** | Todo crédito é **idempotente**. | `txid` com restrição de unicidade. Webhook repetido não credita duas vezes. `npm run reconciliar` é seguro rodar múltiplas vezes. |
| **DIN-005** | Custo e comissão são **duas colunas**, nunca uma. | Auditoria: "quanto paguei ao provedor?" e "quanto lucrei?" — e se os 5% estão corretos. Cada consumidor tem origem própria em `creditos_lancamentos` (`uso_ia`, `pesquisa`, …), senão "quanto gastei com pesquisa?" deixa de ter resposta. |
| **DIN-006** | "Falha ao carregar saldo" **nunca parece "saldo zero"**. | Duas telas diferentes, com textos diferentes. Um número que já veio errado é pior do que nenhum número. |

### SEG-PAG — Regras de Segurança (Pagamento)

| ID | Regra | Aplicação |
|---|---|---|
| **SEG-PAG-001** | Webhook valida autenticidade de quem chamou. | Assinatura HMAC-SHA256 do Mercado Pago sobre manifest: `id:...;request-id:...;ts:...;`. Sandbox usa assinatura diferente. |
| **SEG-PAG-002** | Webhook é **campainha, não entrega**. Nunca credita com base só no corpo recebido. | Servidor reconsulta `GET /v1/payments/:id` ao Mercado Pago ANTES de creditar. Navegador também: polling a cada 4s até confirmação. |
| **SEG-PAG-003** | Webhook precisa de **URL pública com HTTPS válido**. | Desenvolvimento: ngrok ou túnel similar. Produção: domínio + certificado. |
| **SEG-PAG-004** | Certificados e chaves **nunca entram no repositório**. | `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` no `.env`. |
| **SEG-PAG-005** | Webhook responde `200` rápido e processa em seguida. | Demora faz provedor reenviar. Idempotência (DIN-004) impede duplicação. |
| **SEG-PAG-006** | Rota de ajuste manual é **restrita e sempre registrada**. | Script `npm run creditar`, não rota HTTP. Acesso: máquina + `.env`. |

---

## Fluxo de Recarga via Pix (Fase 4 — Completo)

1. **Usuário clica "Gerar QR Code Pix"** e entra o valor
2. **Frontend chama** `POST /creditos/recarga` com o valor
3. **Backend cria cobrança** via Mercado Pago (`POST /v1/payments`)
4. **Grava em `cobrancas_pix`** com status='aguardando'
5. **Devolve QR real** (PNG/base64) + código "copia e cola"
6. **Usuário paga** via Pix
7. **Mercado Pago notifica** via webhook
8. **Validação:** assinatura HMAC (SEG-PAG-001) + reconsulta API (SEG-PAG-002)
9. **Desconto de taxa:** `credito = valor - taxa` (vem de `fee_details`)
10. **Crédito lançado** em `creditos_lancamentos` tipo='recarga'
11. **Frontend vê** novo status via polling → mostra confirmação

Se webhook não chegar:
```bash
npm run reconciliar
```

---

## Desconto de Taxa (Crédito Líquido)

- **Nunca é % fixo.** Taxa vem de `fee_details` da API (transação por transação).
- **Guardada:** coluna `cobrancas_pix.taxa_micros` (auditoria).
- **Exibida:** extrato mostra "Pago R$ 10,00 · taxa R$ 0,10".
- **Fórmula:** `credito_micros = valor_micros - taxa_micros`.

Exemplo: R$ 10,00 (1M micros) - R$ 0,10 taxa (10k micros) = R$ 9,90 creditado (990k micros).

---

## Portabilidade para 7 Páginas (01/09/2026)

**Antes:** 7 páginas tinham botão "Comprar" que gerava Pix **fake** com `gerarCodigoPixFake()`.

**Agora:** Todas têm fluxo **real**.

- ✅ Script real (chama `/creditos/recarga`, polling até pago)
- ✅ Todos os IDs HTML necessários presentes
- ✅ `js/creditos.js` carregado
- ✅ Sem encenação: 0 instâncias de `gerarCodigoPixFake()`
- ✅ Saldo e extrato reais

**Páginas:** Sobre_a_empresa, Sobre_a_empresa_Semana2, atividade, board, matriz_csd, projetos, visao_do_projeto.

---

## Checklist de Integridade

- [x] **DIN-001** — Tudo em micros (sem float)
- [x] **DIN-002** — Razão append-only, saldo é cache
- [x] **DIN-003** — Valor vem do registro, não do webhook
- [x] **DIN-004** — Idempotência (txid único)
- [x] **DIN-005** — Custo e comissão separados
- [x] **DIN-006** — Falha ≠ saldo zero
- [x] **SEG-PAG-001** — Assinatura validada
- [x] **SEG-PAG-002** — Reconsulta ao PSP
- [x] **SEG-PAG-003** — URL pública + HTTPS (ngrok em dev)
- [x] **SEG-PAG-004** — Chaves no `.env`
- [x] **SEG-PAG-005** — Webhook responde 200 rápido
- [x] **SEG-PAG-006** — Ajuste manual = script terminal

---

## Próximas Fases

**Fase 5:** Reconciliação automática + dashboard  
**Fase 6:** Marketplace (depende de decisão jurídica)
