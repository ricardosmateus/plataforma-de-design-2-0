# Regras de Negócio — Avaliação do conteúdo de IA (JEV)

> **Versão:** 1.0.0 · **Status:** Fase 0 e Fase 1 (modo sombra) em construção
> **Módulo:** Assistente de IA · **Página:** `visao_do_projeto.html`
> **Planejamento:** [`planejamento-jev-avaliacao.md`](../../../planejamento-jev-avaliacao.md)
> **Documentos irmãos:** [`ia-assistente-conhecimento.md`](ia-assistente-conhecimento.md) · [`ia-assistente-conversa.md`](ia-assistente-conversa.md) · [`../ideias/ideias-criacao.md`](../ideias/ideias-criacao.md)

---

## Estado atual

O código de avaliação está em `api/src/ia/avaliacao/`. Na Fase 1 ele roda só no **Gerar com ajuda da IA** e só **grava** a nota em `avaliacoes_ia`: nada aparece na tela ainda. O selo (§1.3) entra na Fase 2, depois da calibração.

---

## 1. Regras

### 1.1 Quem avalia — `IA-AVAL`

| ID | Regra | Fonte |
|---|---|---|
| IA-AVAL-001 | Todo conteúdo que a IA entrega na Visão do Projeto (idéias geradas, respostas e ações do assistente, modo caderno) é avaliado antes de chegar à tela. | Pedido do Ricardo, 29/09/2026 |
| IA-AVAL-002 | O **JEV** (TypeSafe) é o avaliador principal. O **Claude** avalia só quando o JEV falha (IA-AVAL-004). | Pedido do Ricardo, 29/09/2026 |
| IA-AVAL-003 | Se os dois falham, o conteúdo é entregue como **"Não avaliado"**. A avaliação nunca bloqueia a entrega. | Decorre de IA-AVAL-002 |
| IA-AVAL-004 | Falha do JEV: erro de rede, timeout, HTTP de erro, resposta fora do formato, pergunta sem resposta ou chave `TYPESAFE_API_KEY` ausente. **Confiança baixa não é falha**: a nota vale e sai marcada como incerta. | Planejamento §2 |
| IA-AVAL-005 | O avaliador só julga o que recebe. "Confiança do dado" é o quanto a afirmação está **sustentada pelas evidências da plataforma** (ficha da empresa, idéias em *Finalizado*, fontes da busca). A tela nunca diz "verdadeiro" nem "falso". | Planejamento §0.1 |
| IA-AVAL-006 | Uma pergunta, um julgamento. Todas as perguntas de um item vão numa única chamada, e quem combina as respostas é o código. | Planejamento §3 |
| IA-AVAL-007 | O avaliador **não apaga nem edita** conteúdo. Ele marca, e quem decide é a pessoa (mesmo princípio de IA-GARANT-005). | Pedido do Ricardo, 29/09/2026 |
| IA-AVAL-008 | Nota geral: C1 × 0,40 + C2 × 0,30 + C3 × 0,15 + específicos × 0,15, e **nunca acima de C1 + 10 pontos**. Um conteúdo que convence mas se apoia em dado sem base não pode aparecer como confiança alta. | Planejamento §3.3 |
| IA-AVAL-014 | Os pesos e as faixas só mudam com uma nova rodada de calibração registrada neste documento. | Planejamento §7 |
| IA-AVAL-015 | O `state` enviado ao avaliador leva só o necessário: nada de nome, e-mail ou id de usuário. | LGPD |

### 1.2 Os critérios

| Código | Critério | Tipo JEV | Percentual |
|---|---|---|---|
| C1 | Confiança do dado | `choice` sustentada / sem base / contradiz | P(sustentada) |
| C2 | Atende ao pedido | `score` 0–4 | nota esperada ÷ 4 |
| C3 | Compatível com o projeto | `noul` | P(sim) |
| C4 | Inventa fato sobre a empresa | `noul` | alerta acima de 50% |
| C5 | Trata hipótese como verdade | `noul` | alerta acima de 50% |
| C6 | Específica (não genérica) | `noul` "é genérica?" | 100 − P(genérica) |
| C7 | Tem entrega concreta | `noul` | P(sim) |
| C8 | Repete idéia existente com outras palavras | `noul` | alerta acima de 50% |
| C9 | Ordem de dependência da lista | `score` 0–3, uma vez por lista | nota ÷ 3 |
| C10 | Respeita a orientação (só com orientação) | `noul` | P(sim) |

C11 a C17 (assistente e caderno) entram nas Fases 3 e 4.

### 1.3 Na tela — Fase 2

| ID | Regra | Fonte |
|---|---|---|
| IA-AVAL-009 | O selo mostra número e rótulo escritos ("86% · Confiança alta"). A cor nunca é o único sinal. Faixas: 80–100 alta, 50–79 revisar, 0–49 baixa. | Planejamento §3.3 |
| IA-AVAL-010 | O tooltip do selo diz quem avaliou (JEV ou Claude). O modelo fica gravado para auditoria. | Planejamento §4 |
| IA-AVAL-011 | Uma edição feita pela pessoa torna a avaliação `desatualizada`, e o selo some. | Planejamento §4 |
| IA-AVAL-012 | O selo não tem ações próprias. Manter e excluir continuam pelos controles do card, com os papéis de sempre (o especialista não exclui, IDEIA-CRIA-008). | Pedido do Ricardo, 29/09/2026 |
| IA-AVAL-016 | O selo fica no card enquanto o texto for o que a IA gerou. Ele não some com o tempo. | Planejamento §6 |

### 1.4 Custo

| ID | Regra | Fonte |
|---|---|---|
| IA-AVAL-013 | O custo da avaliação (JEV e, na falha dele, Claude) é **debitado do saldo do usuário**, na mesma operação do conteúdo avaliado, pelo caminho `reservar`/`liberar`/`consumir`, com a comissão vigente (DIN-008). O teto da reserva inclui a avaliação. Só não há débito quando o fornecedor não cobrou (rede, timeout sem resposta, `5xx`). | Pedido do Ricardo, 29/09/2026 |
| IA-AVAL-017 | **Todo custo é repassado.** Qualquer ação que gere custo à plataforma, de LLM ou de outro fornecedor, é debitada do saldo do usuário. Fornecedor novo só é cobrado com preço cadastrado em `creditos/precos.ts`. Sem preço, o consumo é **medido e registrado** com `precoDesconhecido`, e não é inventado (regra do próprio `precos.ts`). | Pedido do Ricardo, 29/09/2026 (decisão D8) |

---

## 2. O que vai para o avaliador

`state` com `conteudo` (as etapas ou a resposta), `evidencias` (ficha da empresa, títulos das idéias em *Finalizado*), `existentes` (títulos das idéias ativas), `pedido` (nome do projeto e orientação). Nada de dados de pessoas (IA-AVAL-015).

---

## 3. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 1.0.0 | 2026-09-29 | Documento criado com IA-AVAL-001 a 017, a partir de `planejamento-jev-avaliacao.md` v0.4.0. |
