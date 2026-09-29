# Planejamento — JEV como avaliador do conteúdo de IA na Visão do Projeto

> **Data:** 29/09/2026 · **Página:** `visao_do_projeto.html` · **Status:** Fase 0 e Fase 1 (modo sombra) construídas no branch `feat/jev-avaliacao`; Fases 2 a 5 pendentes
> **Não substitui nada:** o Claude continua gerando e buscando o conteúdo com as regras que já existem. O JEV entra **depois**, para avaliar o que o Claude trouxe.
> **Regras afetadas:** `ideias/ideias-criacao.md` §1.5 (`IDEIA-GERAR`), `ia/ia-assistente-conhecimento.md` (`IA-GARANT`, `IA-ACAO`), `creditos-pagamentos-regras.md`
> **Regras novas:** `ia/ia-avaliacao.md` (`IA-AVAL-001` a `017`)

---

## 0. O que este plano responde

O pedido, nas palavras de quem pediu: *o Claude faz a busca do conteúdo com base nas regras que já existem, e o JEV analisa e classifica o que ele trouxe. O JEV verifica se não é um dado fake, dá a porcentagem de confiança do dado, vê se o conteúdo é compatível com a tarefa ou atividade e quanto a resposta atende ao que foi pedido, além de outras avaliações que fizerem sentido. O JEV é a análise principal. Se ele falhar, o Claude faz a análise. O percentual aparece na tela, para a pessoa decidir se mantém ou exclui.*

A resposta curta:

- **Quem gera continua sendo o Claude.** Nada muda em `gerar-ideias.ts` nem no assistente.
- **Quem avalia passa a ser o JEV.** São perguntas objetivas sobre o conteúdo, feitas numa chamada só, que voltam como probabilidade e viram percentual na tela.
- **Se o JEV falhar, quem avalia é o Claude.** Ele recebe as mesmas perguntas, e a resposta sai no mesmo formato.
- **Se os dois falharem, o conteúdo chega assim mesmo**, marcado como "não avaliado". A avaliação nunca impede a entrega.
- **Todo custo é repassado ao usuário.** A chamada ao JEV, e a do Claude quando ele avalia no lugar do JEV, é debitada do saldo de créditos de quem fez a ação, como já acontece com a geração (§5.5).
- **Quem decide é a pessoa.** A avaliação não apaga nada sozinha: ela só mostra o percentual. Para manter ou excluir, a pessoa usa os controles que o card já tem.

### 0.1 Um limite que precisa ficar claro desde já

O JEV **não consulta a internet nem o banco**. Ele julga só o que recebe. Então "não é dado fake" quer dizer, na prática:

> **"Esta afirmação está sustentada pelas evidências que a plataforma tem?"**

As evidências são a ficha da empresa, as idéias em *Finalizado* (as verdades validadas, `IA-CONHEC`) e os trechos das fontes da web que a busca trouxe. O JEV responde uma de três coisas: **sustentada**, **sem base** (não dá para confirmar) ou **contradiz** as evidências.

Por isso o percentual precisa aparecer na tela como **"Confiança do dado"**, e não como "verdadeiro". Um dado sem base não é necessariamente falso, mas a pessoa precisa saber que ninguém conferiu.

---

## 1. As frentes de IA da Visão do Projeto

Conferido em 29/09/2026 contra `visao_do_projeto.html`, `js/ideias.js`, `js/ia.js`, `api/src/rotas/ideias.ts` e `api/src/rotas/ia.ts`.

| # | Frente | O que o Claude produz | Onde aparece |
|---|---|---|---|
| F1 | **Gerar com ajuda da IA** (`POST .../ideias/gerar`) | 4 a 7 etapas (título + descrição) | Cards em *Minhas idéias* |
| F2 | **Assistente, resposta** (`POST .../ia/perguntas`) | Texto + fontes (idéias citadas, `validada`/`hipotese`) | Balão no painel do assistente |
| F3 | **Assistente, ação proposta** (`criar_ideia`, `editar_ideia`, `mover_ideia`) | Proposta de mudança no quadro | Bloco com Confirmar/Descartar |
| F4 | **Assistente, modo caderno** | Resposta feita só com as fontes da investigação (web) | Balão com "Respondido com as fontes da investigação" |
| F5 | **Taxonomia** (`classificarIdeiaEmSegundoPlano`) | Pasta e tags quando a idéia vai para *Finalizado* | Filtros e grafo |

A F5 é classificação interna e já tem regra própria (`taxonomiaManual`). Ela fica **fora da primeira leva**. Entra na Fase 5, só no modo sombra.

---

## 2. O fluxo, de ponta a ponta

```
Pessoa pede (botão "Gerar", pergunta no assistente…)
  │
  ├─ 1. CLAUDE GERA / BUSCA ─────────── exatamente como hoje (regras IDEIA-GERAR, IA-GARANT…)
  │
  ├─ 2. REGRAS DURAS DO SERVIDOR ────── como hoje: limites de texto, formato, fonte fora do projeto
  │                                      (o que é regra de sistema não vira percentual)
  │
  ├─ 3. AVALIAÇÃO ──────────────────── avaliar(conteúdo, evidências, pedido)
  │     ├─ 3a. JEV (principal) ────── 1 chamada, todas as perguntas em lote, timeout 4 s
  │     │      ok ─────────────────► avaliador = "jev"
  │     ├─ 3b. CLAUDE (reserva) ───── JEV falhou → mesmas perguntas, resposta JSON com probabilidades
  │     │      ok ─────────────────► avaliador = "claude"
  │     └─ 3c. nenhum ────────────── os dois falharam → avaliador = "nenhum" ("Não avaliado")
  │
  ├─ 4. GRAVA ─────────────────────── conteúdo + avaliação (tabela nova avaliacoes_ia)
  │
  └─ 5. TELA ──────────────────────── selo com o percentual em cada item
                                        → a pessoa mantém ou exclui pelos controles que o card já tem
```

**O que conta como "JEV falhou"** (`IA-AVAL-004`):

- erro de rede, timeout ou HTTP 4xx/5xx;
- resposta fora do formato;
- falta de resposta para alguma pergunta obrigatória;
- chave `TYPESAFE_API_KEY` ausente.

**Confiança baixa não é falha.** Se o JEV responde com `confidence < 0,5`, a nota vale e aparece com o aviso "avaliação incerta". Chamar o Claude por causa disso seria pagar duas vezes pela mesma dúvida. Fica como decisão D4.

---

## 3. O que o JEV avalia

Todas as perguntas vão **numa única chamada por item**, ou numa chamada para a lista inteira na F1. O JEV cobra por chamada e responde em cerca de 100 ms por pergunta, em paralelo.

### 3.1 Critérios comuns a todas as frentes

| Critério | Tipo JEV | Pergunta (resumo) | Vira na tela |
|---|---|---|---|
| **C1. Confiança do dado** | `choice` sustentada / sem base / contradiz | As afirmações de fato (números, nomes, concorrentes, público) estão sustentadas pelas `evidencias`? | % = P(sustentada) |
| **C2. Atende ao pedido** | `score` 0–4 | Quanto o conteúdo atende a `pedido` (orientação, pergunta, tipo de projeto)? | % = nota esperada ÷ 4 |
| **C3. Compatível com o projeto** | `noul` | O conteúdo pertence ao trabalho de `projeto.nome` ("Identidade Visual" ≠ "Landing Page")? | % |
| **C4. Inventa fato** | `noul` | Afirma algo sobre a empresa que não está em `evidencias`? | Alerta, se > 50% |
| **C5. Hipótese como verdade** | `noul` | Trata como certo algo que só está em idéias fora de *Finalizado*? | Alerta, se > 50% |

### 3.2 Critérios por frente

| Frente | Critérios a mais |
|---|---|
| **F1 Gerar idéias** | **C6 Específica** (não serve a qualquer projeto) · **C7 Tem entrega concreta** · **C8 Repete idéia existente com outras palavras**, que complementa o Jaccard de `duplicidade.ts` · **C9 Ordem de dependência da lista** (`score`, uma vez para a lista) · **C10 Respeita a orientação** (só quando houver orientação) |
| **F2 Resposta do assistente** | **C11 Responde à pergunta** (em vez de desviar) · **C12 Cada afirmação tem fonte** citada |
| **F3 Ação proposta** | **C13 A ação é a que a pessoa pediu** (criar ≠ mover) · **C14 A idéia-alvo é a certa** (editar/mover) · C6 e C8 quando for `criar_ideia` |
| **F4 Modo caderno** | **C15 O trecho da fonte sustenta a afirmação** (por fonte) · **C16 A fonte parece confiável** (site institucional, imprensa, fórum anônimo…) · **C17 O dado é atual** (quando a fonte traz data) |

**Regra de escrita das perguntas (`IA-AVAL-006`):** uma pergunta, um julgamento. "É específica **e** tem entrega?" vira duas perguntas. Quem combina as respostas é o código, não o JEV.

### 3.3 A nota geral

Na tela aparece **um número só**: a nota geral.

```
geral = média ponderada( C1 × 0,40 · C2 × 0,30 · C3 × 0,15 · específicos × 0,15 )
teto:   geral nunca passa de C1 + 10 pontos
```

O teto existe porque um conteúdo que atende bem ao pedido mas se apoia em dado sem base **não pode aparecer como "confiança alta"**. É a mesma leitura de `IA-GARANT`: convencer não é o mesmo que ser verdade.

Quando C4 ou C5 passam de 50%, aparece um **alerta** junto do número, independentemente da nota geral.

| Faixa | Rótulo | Token de cor |
|---|---|---|
| 80–100% | Confiança alta | `--bg-success` / `--text-success` |
| 50–79% | Revisar | `--bg-warning` / `--text-warning` |
| 0–49% | Confiança baixa | `--bg-danger` / `--text-danger` |
| — | Não avaliado | `--surface-2` / `--text-muted` |

Os pesos e as faixas são um **ponto de partida**. Eles só são fixados depois da calibração da Fase 1 (ver §7).

---

## 4. Na tela

### 4.1 Card de idéia gerada (F1)

```
┌──────────────────────────────────────────┐
│ Definir a paleta de cores da marca       │
│ Escolha 3 a 5 cores que remetam à…       │
│                                          │
│ [✦ 86% · Confiança alta]          ☆☆☆☆☆  │
└──────────────────────────────────────────┘
```

- O selo só aparece em idéia **criada pela IA**. Ele é **só informativo**: não abre painel e não tem botões próprios.
- O tooltip do selo diz quem avaliou (JEV ou Claude) e, quando houver, o alerta mais grave (C4/C5) em uma frase.
- Para manter ou excluir, a pessoa usa o que o card **já tem**. Manter é não fazer nada. Excluir é a exclusão de sempre (`ideiaDeleteModal`), com a mesma regra de papel: o **especialista não exclui** (`IDEIA-CRIA-008`).
- **Editar** a idéia à mão marca a avaliação como **desatualizada** e o selo some. O texto agora é da pessoa, e a nota era do texto antigo (`IA-AVAL-011`).
- Acessibilidade: o número e o rótulo sempre aparecem escritos, nunca só a cor, e o tooltip também abre pelo foco do teclado.

**Toast depois de gerar** (amplia `IDEIA-GERAR-010`):
> "6 idéias criadas em Minhas idéias. **2 pedem revisão.** 1 ficou de fora por ser parecida com uma existente."

**Filtro novo no quadro** (opcional, D6): "Pedem revisão", que mostra só as idéias com selo amarelo ou vermelho.

### 4.2 Assistente (F2, F3, F4)

- Abaixo de cada resposta vai uma linha discreta: `✦ Confiança 74% · Atende à pergunta 90%`.
- Numa **ação proposta**, o percentual aparece **antes** do "Confirmar", para a pessoa decidir já sabendo.
- No **modo caderno**, cada fonte ganha o seu percentual (C15/C16), ao lado do chip que já existe (`.ia-fonte`).
- Aqui "Excluir" não se aplica a mensagens. As ações possíveis continuam sendo Confirmar/Descartar a proposta.

### 4.3 Texto de interface

| Situação | Texto |
|---|---|
| Legenda do selo (tooltip) | "Percentual estimado pela IA a partir da ficha da empresa e das idéias validadas. Não é uma garantia." |
| Tooltip, avaliado pelo Claude | "Avaliado pelo Claude — o avaliador principal não respondeu." |
| Não avaliado | "Não foi possível avaliar este conteúdo agora." |
| Avaliação incerta | "O avaliador ficou em dúvida. Leia com atenção." |

---

## 5. Arquitetura

### 5.1 Arquivos novos

```
api/src/ia/avaliacao/
  perguntas.ts      PURO  monta o lote de perguntas por frente (F1…F4) a partir de conteúdo + evidências + pedido
  normalizar.ts     PURO  converte resposta JEV ou Claude → Avaliacao (mesmo formato), calcula geral e faixa
  jev.ts            REDE  POST https://api.typesafe.ai/v1/systemone · Bearer TYPESAFE_API_KEY · timeout 4 s
  claude-juiz.ts    REDE  reserva: mesmas perguntas via provedor.ts, resposta pré-preenchida em JSON
  avaliar.ts        orquestra: jev → claude → nenhum; nunca lança
api/testes/avaliacao-*.test.ts
js/avaliacao.js       selo e tooltip (reusado por ideias.js e ia.js)
css/…                 .aval-selo (tokens do styleguide)
```

É a mesma divisão PURO/REDE de `gerar-ideias.ts`: o que monta e o que interpreta é testado sem rede.

### 5.2 Contrato único

```ts
type Avaliacao = {
  avaliador: 'jev' | 'claude' | 'nenhum';
  modelo: string | null;            // "jev-1.13.0", "claude-…"
  geral: number | null;             // 0–100
  faixa: 'alta' | 'revisar' | 'baixa' | 'nao_avaliado';
  incerta: boolean;                 // alguma confiança < 0,5
  criterios: Record<string, { pct: number; confianca: number | null }>;
  alertas: Array<{ codigo: 'inventa_fato' | 'hipotese_como_verdade' | 'duplicata_semantica'; texto: string }>;
  avaliadoEm: string;
};
```

As duas rotas que já existem passam a devolver o campo `avaliacao` junto do conteúdo: `gerar` em cada idéia, e `perguntas` em cada mensagem. `GET` de idéias e da conversa também o devolvem.

### 5.3 Banco

Tabela nova `avaliacoes_ia`. A avaliação não entra como coluna em `Ideia`, porque serve também a mensagens e ações e precisa guardar histórico para auditoria.

| Campo | Para quê |
|---|---|
| `alvo_tipo` (`ideia`/`mensagem`/`acao`/`fonte`), `alvo_id` | O que foi avaliado |
| `avaliador`, `modelo`, `geral`, `faixa`, `criterios` (json), `alertas` (json) | A avaliação |
| `estado` (`ativa`/`excluida`/`desatualizada`) | Se a nota ainda vale para o texto do card |
| `evidencias_hash` | Qual versão das evidências foi usada, para auditar sem gravar a ficha de novo |

Não há rota nova de revisão: excluir usa a rota que já existe e marca a avaliação como `excluida`; editar marca `desatualizada`.

### 5.4 Latência e ordem

- **F1:** a avaliação é **síncrona**. A geração já leva cerca de 10 s, e o JEV acrescenta menos de 1 s. As idéias chegam ao quadro já com o selo.
- **F2/F3/F4:** o JEV é síncrono (é rápido). Se ele falhar, a reserva pelo Claude roda **em segundo plano**: a mensagem chega com o selo "avaliando…" e o `GET` da conversa traz a nota depois. Assim a resposta não fica esperando uma segunda chamada ao Claude.

### 5.5 Custo: todo custo é repassado ao usuário (`IA-AVAL-013`, `IA-AVAL-017`)

**Princípio (instrução do Ricardo, 29/09/2026):** toda ação que gera custo para a plataforma, seja de LLM ou de qualquer outro fornecedor, é **repassada ao usuário** e debitada do saldo de créditos dele. Isso vale para o JEV, para a avaliação feita pelo Claude quando o JEV falha e para qualquer fornecedor que entrar depois.

Como isso entra no sistema de créditos que já existe:

- **Mesmo caminho de sempre.** A avaliação usa `reservar` → `liberar` → `consumir` (`reserva.ts`), sem lançamento por fora (`DIN-010`). A cobrança é o custo do fornecedor convertido para real, mais a comissão vigente (`comissaoSobre`, `DIN-008`), e o usuário vê só o total (`DIN-007`).
- **Reserva antes de chamar.** O teto da operação passa a somar:
  1. a geração ou resposta do Claude, como hoje;
  2. a chamada ao JEV;
  3. o teto da avaliação pelo Claude, para o caso de o JEV falhar.

  Sem saldo para o total, a ação é recusada com `402` **antes** de qualquer chamada (`IA-CUSTO-002`). Depois, só o que foi realmente gasto é consumido, e o resto da reserva é liberado.
- **Preço do JEV na tabela.** É preciso adicionar a entrada `jev-*` em `creditos/precos.ts` com o preço oficial da TypeSafe, conferido na documentação e com data, como as outras. Pela regra do arquivo, **modelo sem preço devolve `null`, nunca um palpite**: sem o preço cadastrado, o JEV não pode ir para produção com cobrança ligada. Se a TypeSafe cobrar por chamada e não por token, entra como unidade própria, como a busca web (`DIN-009`).
- **Registro separado.** Cada chamada gera uma linha própria em `consumos_ia`, com um tipo novo `avaliacao` em `TipoConsumoIa` e o mesmo `operacao_id` do conteúdo avaliado. Assim, "quanto gastei com avaliação?" tem resposta, e o Histórico de uso mostra a linha (`DIN-005`, `DIN-014`).
- **O que é cobrado.** Tudo o que o fornecedor cobrou de nós é repassado, inclusive a chamada ao Claude que voltou fora do formato. Pela decisão D8, isso vale também para a **geração e a resposta do assistente**: o que foi pago e descartado é cobrado (`IA-CUSTO-003` e `IDEIA-GERAR-008` revistas, §6). Não há débito só quando o fornecedor não cobrou (erro de rede, timeout sem resposta, HTTP 5xx), porque aí não houve custo a repassar.
- **Valor na tela.** Continua só no Histórico de uso (`DIN-013`): o selo e o toast não mostram preço.
- **Estimativa de hoje.** Cerca de 700 tokens de entrada e 120 de saída por chamada ao JEV (teste de 29/09). O valor em reais depende do preço oficial acima.

### 5.6 Privacidade

A ficha da empresa, as idéias finalizadas e os trechos de fontes passam a ir também para a **TypeSafe (typesafe.ai)**, um fornecedor novo. Isso precisa entrar na política de privacidade e nas regras (`IA-AVAL-015`). Enviar só o necessário: nada de nome ou e-mail de usuário no `state`.

---

## 6. Regras novas (proposta para `ia/ia-avaliacao.md`)

| Regra | Texto |
|---|---|
| IA-AVAL-001 | Todo conteúdo que a IA entrega na Visão do Projeto (F1–F4) é avaliado antes de chegar à tela. |
| IA-AVAL-002 | O **JEV é o avaliador principal**. O Claude avalia só quando o JEV falha (`IA-AVAL-004`). |
| IA-AVAL-003 | Se os dois falham, o conteúdo é entregue como "Não avaliado". A avaliação nunca bloqueia a entrega. |
| IA-AVAL-004 | Falha do JEV é rede, timeout, HTTP de erro, formato inválido, pergunta sem resposta ou chave ausente. Confiança baixa não é falha. |
| IA-AVAL-005 | O JEV só julga o que recebe. "Confiança do dado" é o quanto a afirmação está sustentada pelas evidências da plataforma, e a tela nunca diz "verdadeiro" nem "falso". |
| IA-AVAL-006 | Uma pergunta, um julgamento. Todas as perguntas de um item vão numa única chamada. |
| IA-AVAL-007 | O avaliador **não apaga nem edita** conteúdo. Ele marca, e quem decide é a pessoa (mesmo princípio de `IA-GARANT-005`). |
| IA-AVAL-008 | A nota geral nunca passa de C1 + 10 pontos. |
| IA-AVAL-009 | O selo mostra o número e o rótulo escritos. A cor nunca é o único sinal. |
| IA-AVAL-010 | O tooltip do selo diz sempre quem avaliou (JEV ou Claude). O modelo fica gravado para auditoria. |
| IA-AVAL-011 | Uma edição feita pela pessoa torna a avaliação `desatualizada`, e o selo some. |
| IA-AVAL-012 | O selo não tem ações próprias. Excluir continua pelo controle do card, com os papéis que já existem (o especialista não exclui, `IDEIA-CRIA-008`). |
| IA-AVAL-013 | O custo da avaliação (JEV e, na falha dele, Claude) é **debitado do saldo do usuário**, na mesma operação do conteúdo avaliado, com o custo convertido para real mais a comissão vigente. Só não há débito quando o fornecedor não cobrou (rede, timeout sem resposta, 5xx). |
| IA-AVAL-017 | **Todo custo é repassado.** Qualquer ação que gere custo à plataforma, de LLM ou de outro fornecedor, é debitada do saldo do usuário pelo caminho `reservar`/`liberar`/`consumir`. Fornecedor novo só entra em produção com preço cadastrado em `precos.ts`. |
| IA-AVAL-014 | Os limites de faixa e os pesos só mudam com uma nova rodada de calibração registrada. |
| IA-AVAL-015 | O `state` enviado ao avaliador leva só o necessário: sem dados pessoais de usuários. |
| IA-AVAL-016 | O selo fica no card enquanto o texto for o que a IA gerou. Ele não some com o tempo, só quando a pessoa edita (`IA-AVAL-011`). |

**Mudanças em regras existentes:**
- `IDEIA-GERAR-005`: a duplicata detectada pelo **Jaccard continua sendo descartada** (regra dura, como hoje). A duplicata **semântica** (C8) **não descarta**: vira alerta no selo, porque é julgamento e a decisão é da pessoa.
- `IDEIA-GERAR-010`: o toast passa a contar as idéias que "pedem revisão".
- `IA-GARANT`: a verificação de procedência de `verificacao.ts` **continua** e roda antes do JEV. A C5 complementa, mas não substitui essa verificação.
- `IA-CUSTO-003` (decisão D8): **passa de** "falha do provedor não consome crédito" **para** "todo custo que o provedor cobrou é repassado, mesmo que a resposta não chegue ao usuário". Só não há débito quando o provedor não cobrou nada (erro de rede, timeout sem resposta, `5xx`).
- `IDEIA-GERAR-008` (decisão D8): a resposta que não vira nenhuma idéia gravada, porque todas eram parecidas ou vieram fora do formato, **passa a ser cobrada**. Ela continua registrada como `descartado` no consumo, para o Histórico mostrar que foi paga e não entregue. A reserva, o `402` sem saldo e o valor só no Histórico de uso (`DIN-013`) não mudam.
- `IDEIA-GERAR-010`: no desfecho "não criou nada porque todas eram parecidas", o aviso deixa claro que a geração foi feita e consumiu créditos: "A IA gerou as etapas, mas todas eram parecidas com idéias que já existem. Nada foi criado."
- `ResultadoConsumoIa.descartado`: o comentário "pagamos, mas a resposta não passou na verificação" ganha "e o usuário também paga (`IA-AVAL-017`)".

**Fora desta página, com o mesmo princípio.** Estas regras também deixam de cobrar custo que a plataforma pagou, e ficam registradas como pendência para um plano próprio, já que este cobre só a Visão do Projeto:
- `BOARD-PESQUISA-010` (`board-lista.md`): consulta de pesquisa que falhou não cobra;
- `ATV-GERAR-016` (`atividade-lista.md`): custo do "Gerar com ajuda da IA" das tarefas;
- as demais rotas que gravam consumo `descartado`: `rotas/pesquisa.ts`, `rotas/board.ts`, `rotas/grafo.ts`, `rotas/gerar-tarefa.ts` e a taxonomia.

---

## 7. Fases

| Fase | O quê | Muda para o usuário? | Critério para avançar |
|---|---|---|---|
| **0. Base** | Regras `IA-AVAL` escritas; `IA-CUSTO-003`, `IDEIA-GERAR-008` e `IDEIA-GERAR-010` reescritas (D8); `rotas/ideias.ts` e `rotas/ia.ts` passam a consumir também o que for `descartado`; `avaliacao/` (puro + rede); tabela; preço do JEV em `precos.ts` e tipo `avaliacao` em `TipoConsumoIa`; reserva somando geração + JEV + teto do Claude; `TYPESAFE_API_KEY` no `.env` e no `render.yaml`; testes de falha (timeout, 500, formato, chave ausente) | Não | Testes passando; reserva pelo Claude testada com o JEV desligado |
| **1. Sombra + calibração** | F1 avalia e **só grava**, sem selo. Montar um conjunto de 40–60 etapas marcadas à mão (boas, genéricas, com fato inventado, duplicadas). Comparar JEV × Claude × marcação humana | Não | Erro aceitável por critério (ex.: C4 com ≥ 90% de acerto); pesos e faixas fixados |
| **2. Selo nas idéias (F1)** | Selo com tooltip, toast novo, estado `desatualizada` | **Sim** | Uso real por 1–2 semanas; medir quantas idéias com selo vermelho as pessoas excluem |
| **3. Assistente (F2 + F3)** | Linha de confiança nas respostas; percentual antes do Confirmar | Sim | — |
| **4. Modo caderno (F4)** | Percentual por fonte (C15–C17) | Sim | — |
| **5. Taxonomia (F5)** | Só em sombra: o JEV confere a pasta e as tags sugeridas | Não | Decidir se vira selo |

No teste de 29/09 o JEV **acertou** "etapa genérica" (96%), "fato inventado" (97%) e "duplicata com outras palavras" (72%). Mas **errou** ao marcar como genérica uma etapa de paleta de cores específica (70%). É por isso que a Fase 1 vem antes de qualquer selo.

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| O pacote/API do JEV é novo (v0.1.0, 16/09/2026, um mantenedor) | Reserva pelo Claude + "não avaliado"; o contrato `Avaliacao` não depende do fornecedor |
| A pessoa lê 90% como "é verdade" | Rótulo "Confiança do dado", tooltip e `IA-AVAL-005` |
| Falso positivo gera exclusão de coisa boa | O avaliador não apaga (`IA-AVAL-007`); calibração antes do selo |
| JEV e Claude dão notas diferentes para a mesma coisa | O tooltip diz quem avaliou; a Fase 1 mede a concordância entre os dois |
| O custo sobe quando o JEV cai por muito tempo | Alerta no log quando a taxa de reserva pelo Claude passar de 20% em 1 h |
| Selo demais vira ruído | Selo só em conteúdo da IA; some quando a pessoa edita |

---

## 9. Decisões para o Ricardo

| # | Decisão | Recomendação |
|---|---|---|
| D1 | O custo da avaliação é cobrado do usuário ou absorvido pela plataforma? | **Decidido em 29/09/2026:** repassado ao usuário (`IA-AVAL-013`, `IA-AVAL-017`) |
| D2 | Pesos da nota geral (40/30/15/15) | Aceitar como ponto de partida e revisar na Fase 1 |
| D3 | Duplicata semântica descarta ou só alerta? | Só alerta (a pessoa decide, como foi pedido) |
| D4 | Com o JEV incerto (confiança < 0,5), chamar o Claude para desempatar? | Não na primeira versão; só marcar "avaliação incerta" |
| D5 | Mostrar a nota também para quem tem papel de leitura? | Sim |
| D6 | Filtro "Pedem revisão" no quadro | Sim, na Fase 2 |
| D7 | Aviso de privacidade sobre o novo fornecedor | Sim, antes da Fase 2 |
| D8 | Estender "todo custo é repassado" às regras `IA-CUSTO-003` e `IDEIA-GERAR-008`? | **Decidido em 29/09/2026:** sim. Ver as mudanças em §6 |

---

## 10. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.5.0 | 2026-09-29 | **Fase 0 e 1 construídas.** `api/src/ia/avaliacao/` (perguntas, normalizar, jev, claude-juiz, avaliar, config), tabela `avaliacoes_ia`, `TipoConsumoIa.avaliacao`, `AVALIACAO_MODO`/`TYPESAFE_*` no env, repasse total (D8) em `rotas/ia.ts` e `rotas/ideias.ts`, gravação em modo sombra no Gerar idéias, nota marcada `desatualizada`/`excluida` ao editar/excluir. 37 testes novos. Preço do JEV ainda não cadastrado: consumo medido, não cobrado. Teste real com o JEV (3 etapas): paleta 95 (alta), "Planejar o projeto" 67 (revisar), etapa com fatos inventados 13 (baixa). |
| 0.4.0 | 2026-09-29 | D8 decidida: o repasse total vale também para a geração de idéias e o assistente. Propostas de nova redação para `IA-CUSTO-003`, `IDEIA-GERAR-008` e `IDEIA-GERAR-010` em §6; pendências fora da página listadas; Fase 0 e §5.5 ajustadas. |
| 0.3.0 | 2026-09-29 | Todo custo é repassado ao usuário: §5.5 reescrita, `IA-AVAL-013` revista, `IA-AVAL-017` nova, preço do JEV e tipo `avaliacao` na Fase 0, D1 decidida, D8 nova (conflito com `IA-CUSTO-003` e `IDEIA-GERAR-008`). |
| 0.2.0 | 2026-09-29 | O selo passa a ser só informativo: sai o popover com o detalhe por critério e os botões Manter/Excluir. Manter e excluir continuam pelos controles do card. Ajustados §0, §2, §3.3, §4, §5.1, §5.3, `IA-AVAL-010/012/016`, §7, §8 e D5. |
| 0.1.0 | 2026-09-29 | Primeira versão do plano. |
