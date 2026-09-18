# Regras de Negócio — Taxonomia de uma Idéia (pasta e tags)

> **Versão:** 1.0.0 · **Status:** Implementado
> **Conferido em:** 13/09/2026, contra `api/src/rotas/ideias.ts`, `api/src/ia/taxonomia.ts`, `api/src/ia/taxonomia-vocabulario.ts` e `js/grafo-painel.js`
> **Módulo:** Idéias · **Páginas:** `visao_do_projeto.html` (a coluna decide se há taxonomia), `Sobre_a_empresa.html` (onde a pasta aparece e onde ela é corrigida)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ideias-movimentacao.md`](ideias-movimentacao.md) — IDEIA-MOV-017/018, que ligam e desligam a taxonomia · [`../grafo-conhecimento-v2.md`](../grafo-conhecimento-v2.md) — o planejamento de onde estas regras vêm

---

Este documento existia apenas como prosa em `../grafo-conhecimento-v2.md` ("Regra 1/2/3"), sem identificadores, sem versionamento e fora do módulo da entidade que ele governa. A rota `PATCH …/ideias/:id/taxonomia` estava implementada e no ar sem nenhuma regra citável. Foi registrado em 13/09/2026, a partir do código, na conferência de `visao_do_projeto.html`.

## Identificação

| Campo | Valor |
|---|---|
| Nome | Taxonomia da idéia (pasta e tags) |
| Módulo | Idéias |
| Endpoint | `PATCH /empresas/:empresaId/projetos/:projetoId/ideias/:id/taxonomia` |
| Entidades | `ideias` (`assunto`, `tags`, `taxonomia_manual`), `recortes_taxonomia` |
| Vocabulário | `api/src/ia/taxonomia-vocabulario.ts` — cinco domínios (Descoberta, Produto, Experiência, Negócio, Tecnologia) e as categorias dentro deles |
| Componentes | Painel de pasta em "Sobre a empresa" (`js/grafo-painel.js`) |

---

## 1. Regras

### 1.1 Quando existe taxonomia — `IDEIA-TAX`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-TAX-001 | **Só idéia em `finalizado` tem taxonomia.** Em `ideias` e `andamento`, `assunto` é nulo e `tags` é vazio — sempre, sem exceção. A taxonomia é consequência da coluna, não um atributo independente. | `../grafo-conhecimento-v2.md` Regra 1; registrado 13/09/2026 |
| IDEIA-TAX-002 | A taxonomia tem **um `assunto`** (a pasta, exatamente um) e **até três `tags`** (temas transversais). Pasta é onde a idéia mora; tag é por onde ela também é encontrada. | `grafo-conhecimento-v2.md` Regra 3 + limite lido do código |
| IDEIA-TAX-003 | `assunto` e `tags` só aceitam valores **do vocabulário fechado** (`taxonomia-vocabulario.ts`). Valor fora dele é `400` — "Essa pasta não existe na taxonomia." ou "Há tag fora da taxonomia.". Não é campo livre. | Registrado 13/09/2026, a partir do código |
| IDEIA-TAX-004 | O `assunto` **nunca se repete entre as `tags`**. Se vier repetido no pedido, o servidor o remove da lista em vez de recusar — a pasta já é a categoria principal, repeti-la como tema secundário não acrescenta nada. | Registrado 13/09/2026, a partir do código |
| IDEIA-TAX-005 | A idéia entra em `finalizado` e a IA **propõe** a classificação; a pessoa **confirma ou corrige**. A proposta chega em segundo plano (IDEIA-MOV-018), então a pasta aparece alguns instantes depois do card chegar à coluna. | `grafo-conhecimento-v2.md`; registrado 13/09/2026 |

### 1.2 Correção manual — `IDEIA-TAX`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-TAX-006 | Corrigir a pasta à mão marca a idéia como **`taxonomia_manual`**. Sem essa marca a correção duraria até a próxima reclassificação, e a pessoa veria a pasta errada voltar sozinha. | Registrado 13/09/2026, a partir do código |
| IDEIA-TAX-007 | Pedir taxonomia para uma idéia que **não está em `finalizado`** devolve **`409`** — "Só idéias finalizadas têm pasta." Aceitar criaria, pela porta dos fundos, exatamente o estado que IDEIA-TAX-001 existe para impedir. | Registrado 13/09/2026, a partir do código |
| IDEIA-TAX-008 | **Quem move, classifica**: proprietário, membro e especialista. Mesma régua de IDEIA-MOV-004, e pelo mesmo motivo — corrigir a pasta é organizar, não destruir. Papel sem permissão recebe `403` "Seu papel não permite classificar idéias." | Registrado 13/09/2026; decorre de IDEIA-MOV-004 |
| IDEIA-TAX-009 | Corrigir a pasta **refaz os recortes por tema** daquela idéia, em segundo plano. Sem isso a correção valeria pela metade: pasta certa no mapa, texto ainda servido na página do tema antigo. | Registrado 13/09/2026, a partir do código |

**Por que a correção manual precisou existir.** O planejamento prometia "a taxonomia que a IA propõe e o usuário confirma". Até esta rota existir, só havia a proposta: consertar uma pasta errada exigia tirar a idéia de "Finalizado" e devolver — o que apaga tudo (IDEIA-MOV-017) e reclassifica no escuro, na esperança de sair diferente. Esta rota é a metade que faltava da promessa.

**Por que o vocabulário é fechado (IDEIA-TAX-003).** Pasta livre viraria cinquenta pastas com o mesmo significado escrito de jeitos diferentes, e o mapa de conhecimento perde a serventia exatamente quando começa a ter volume. O custo aceito é que uma idéia sobre algo fora dos cinco domínios não tem onde morar direito — acrescentar categoria é decisão de negócio, registrada no vocabulário, não digitação de quem classifica.

**A ligação com a movimentação.** Esta é a metade estática; `ideias-movimentacao.md` IDEIA-MOV-017/018/019 é a dinâmica. As duas descrevem o mesmo invariante por ângulos diferentes: **idéia fora de `finalizado` não tem taxonomia, e nada pode criar o estado contrário.**

---

## 2. Contrato da API — `PATCH …/ideias/:id/taxonomia`

Requisição autenticada pelo cookie de acesso.

| Campo do corpo | Obrigatório | Regra |
|---|---|---|
| `assunto` | Sim | Uma categoria do vocabulário. Ausente → `400` "Escolha a pasta." |
| `tags` | Não (padrão `[]`) | Até três, todas do vocabulário. Acima disso → `400` "No máximo três tags." |

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ ideia }` | Atualiza a pasta exibida e marca a idéia como corrigida à mão |
| Corpo inválido (IDEIA-TAX-002/003) | `400` com `campo` | Mostra o erro no campo |
| Sessão inválida | `401` | Renovação silenciosa via `/auth/sessao`; só então login |
| Conta suspensa | `403` com `suspensao` | Mostra a mensagem |
| Papel sem permissão (IDEIA-TAX-008) | `403` | "Seu papel não permite classificar idéias." |
| Qualquer elo da corrente falha (IDEIA-ISO-003) | `404` | Redireciona |
| Idéia não está em `finalizado` (IDEIA-TAX-007) | `409` | "Só idéias finalizadas têm pasta." |

O `200` volta assim que a idéia é gravada. A re-segmentação de IDEIA-TAX-009 corre depois, em segundo plano — quem corrigiu está olhando para um `<select>` e não pode esperar o modelo.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| T1 | Pasta é campo livre ou vocabulário fechado? | Fechado. Ver a justificativa em §1.2. | Registrado 13/09/2026, a partir do código em produção |
| T2 | Quantas tags por idéia? | Até três. Acima disso "tema transversal" deixa de discriminar qualquer coisa. | Registrado 13/09/2026 |
| T3 | A correção manual sobrevive a uma reclassificação? | Sim — é para isso que existe `taxonomia_manual` (IDEIA-TAX-006). | Registrado 13/09/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Origem das decisões T1 a T3 | Foram **lidas do código**, não de uma decisão registrada em conversa. Estão certas quanto ao que o sistema faz; falta confirmar que refletem o que se quer que ele faça — em especial o teto de três tags. |
| Categoria nova no vocabulário | Acrescentar categoria é mudança de regra de negócio, não de copy: mexe em `taxonomia-vocabulario.ts`, na cópia do cliente em `js/tema.js` e no que já foi classificado. Falta registrar o procedimento, como PROJ-CRIA-007 fez para tipo de projeto. |
| Reclassificar o que já existe | Quando uma categoria entra ou sai, as idéias já classificadas continuam com a taxonomia antiga. Não há migração definida. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-09-13 | Documento criado na conferência de `visao_do_projeto.html`. As regras existiam como prosa sem identificadores em `../grafo-conhecimento-v2.md`, e a rota `PATCH …/taxonomia` estava implementada sem regra citável. IDEIA-TAX-001 a 009 registradas a partir do código, decisões T1 a T3 e três pendências abertas. |
