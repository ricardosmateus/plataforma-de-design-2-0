# Planejamento — JEV avaliando a tarefa gerada em "Nova tarefa"

> **Data:** 30/09/2026 · **Página:** `atividade.html` (modal "Nova tarefa" → "Gerar com ajuda da IA") · **Status:** Fase 0 ✅ · Limpeza ✅ · Fase 1 🔶 núcleo construído e testado (74/74); faltam as partes que dependem de arquivos fora do pacote da Fase 0 (§8.1)
> **Parte de:** `planejamento-jev-avaliacao.md`. Este plano **não cria outro avaliador**: leva o que a Visão do Projeto já tem (`api/src/ia/avaliacao/`) para a tarefa gerada.
> **Branch de partida:** `feat/jev-avaliacao` — o módulo de avaliação só existe lá.
> **Regras afetadas:** `atividades/atividade-lista.md` (`ATV-GERAR-005`, `012`, `016`), `ia/ia-avaliacao.md` (`IA-AVAL`), `creditos-pagamentos-regras.md`
> **Regras novas:** `IA-AVAL-018` a `023`, `ATV-GERAR-018` a `020` (§7) — as `ATV-GERAR` já estão em `atividade-lista.md` 1.14.0

---

## 0. O que este plano responde

O pedido: usar na página da atividade a mesma lógica do JEV da Visão do Projeto, a partir do clique em **"Nova tarefa" → "Gerar com ajuda da IA"**, funcionando **online** para quem usa a plataforma.

A resposta curta:

- **Quem gera continua sendo o Senior Product Designer** (`gerar-tarefa.ts`). Nada muda no prompt nem no contrato da proposta.
- **Quem avalia é o JEV**, com a reserva pelo Claude e o "não avaliado" que já existem (`IA-AVAL-002` a `004`). É o mesmo orquestrador, não uma cópia.
- **"Online" já está resolvido pela arquitetura.** O JEV é chamado só pelo servidor, com `TYPESAFE_API_KEY` no ambiente do Render. O MCP instalado no Claude Desktop não entra no produto.
- **A diferença que importa:** na Visão, o selo informa e ninguém gastou nada por causa dele. Aqui, uma tarefa de Pesquisa **dispara uma busca paga sozinha** (`ATV-GERAR-012`). É por isso que existe a decisão T1.

---

## 1. Fase 0 — o que a leitura do código mostrou

Conferido em 30/09/2026 contra `planejamento-jev-avaliacao.md`, `api/src/ia/avaliacao/*`, `api/src/rotas/gerar-tarefa.ts`, `api/src/ia/gerar-tarefa.ts`, `api/src/rotas/ideias.ts`, `api/src/env.ts`, `api/src/creditos/precos.ts`, `js/atividade.js`, `atividade.html`, `visao_do_projeto.html`, `api/prisma/schema.prisma` e `atividade-lista.md`.

### 1.1 O que já existe e é reaproveitado sem mudança

| Peça | Arquivo | O que faz |
|---|---|---|
| Cliente do JEV | `avaliacao/jev.ts` | `POST /v1/systemone`, Bearer, timeout; toda falha vira `{ ok: false, motivo }`, nunca exceção |
| Reserva pelo Claude | `avaliacao/claude-juiz.ts` | Mesmas perguntas, mesmo formato de resposta |
| Medição | `avaliacao/chamada.ts` | `Chamada` com `cobrou` honesto (2xx cobra; rede, timeout e HTTP de erro não) |
| Orquestrador | `avaliacao/avaliar.ts` → `avaliarLote` | JEV → Claude → "não avaliado"; nunca lança |
| Custo | `avaliar.ts` → `tetoAvaliacaoUsdMicros`, `custoDasChamadas` | JEV sem preço entra com teto zero e é medido, não cobrado |
| Validação | `normalizar.ts` → `validarRespostas` | Pergunta sem resposta é falha do avaliador, não nota zero |
| Faixas e travas | `normalizar.ts` → `faixaDe`, `aplicarTravas`, `LIMITES` | Calibrados em 29/09/2026 contra gabarito |
| Tabela | `avaliacoes_ia` | Nota, critérios, alertas, `estado` (`ativa`/`excluida`/`desatualizada`) |
| Configuração | `env.ts` | `AVALIACAO_MODO` (`desligada`/`sombra`/`visivel`), `TYPESAFE_*`, `AVALIACAO_CLAUDE_TIMEOUT_MS` |

### 1.2 O que a Fase 0 corrigiu no rascunho anterior

1. **Não é preciso construir cliente nem régua.** Os dois existem: o cliente é o de §1.1, e a calibração tem scripts (`api/scripts/calibracao-*`), gabarito e página de marcação.
2. **O JEV não bloqueia nem pergunta.** A ideia de "confiança baixa vira pergunta com opções" contrariava `IA-AVAL-007` (o avaliador marca, quem decide é a pessoa). Saiu.
3. **O custo é repassado.** A sugestão de absorver o custo contrariava D1 e D8 do plano da Visão (`IA-AVAL-017`). Saiu.
4. **Não existe "pedido" a julgar antes da geração.** A orientação pode vir vazia de propósito (`ATV-GERAR-013`), e o botão gera **uma** tarefa, sem tela de escolha (`ATV-GERAR-010`). O JEV entra entre a proposta e a gravação.

### 1.3 O que falta, achado na leitura

| # | Achado | Onde | Consequência |
|---|---|---|---|
| A1 | O intérprete das respostas está amarrado às idéias: `avaliarLote` chama `avaliarEtapas`, que conhece c1–c10 de "etapa" | `avaliar.ts`, `normalizar.ts` | O intérprete vira parâmetro (§4.1). Sem isso, a tarefa ganharia uma segunda cópia do orquestrador |
| A2 | `AlvoAvaliacaoIa` não tem `tarefa` | `schema.prisma:1526` | Migração aditiva (§4.4) |
| A3 | O selo está **inline** na Visão (CSS em `visao_do_projeto.html:524–553`, JS `seloDeAvaliacao` em `:2140–2170`). O `js/avaliacao.js` compartilhado do plano da Visão (§5.1) nunca foi criado | `visao_do_projeto.html` | Extrair antes de levar o selo para a atividade (Fase 3) |
| A4 | O preço do JEV não está em `precos.ts`, de propósito ("modelo sem preço devolve `null`") | `precos.ts:70` | Consumo medido e não cobrado até o preço entrar. Com o repasse decidido, **nenhuma tela vai para `visivel` sem ele** — nem esta, nem a Visão |
| A5 | `ATV-GERAR-016` diz que "proposta que não vira tarefa não é cobrada", o que contradiz `IA-AVAL-017` | `atividade-lista.md:141` | O plano da Visão lista isso como pendência "fora desta página"; resolvido aqui (T3) |
| A6 | `TYPESAFE_MODELO` tem padrão `jev-latest` | `env.ts:143` | Fixado em `jev-1.13.0` (T4), a versão contra a qual a calibração de 29/09 foi feita |
| A7 | O fallback do Claude tem timeout de 30 s (`AVALIACAO_CLAUDE_TIMEOUT_MS`) | `env.ts:147` | Na Visão isso some dentro dos ~10 s da geração. Aqui atrasaria a criação da tarefa e o início da pesquisa: o Claude roda em segundo plano (§2) |
| A8 | Falso sucesso preso ao **botão real**: modal `generateTasksModal`, ouvinte de `data-task-action="gerar-ia"`, `confirmGenerateTasksBtn` — e, achado só na Limpeza, um ouvinte em `#generateWithAIBtn` (`atividade.html:~2282`) que abria esse modal. O botão só funciona porque `js/orquestrador-gateway.js` clona o nó e descarta esse ouvinte; se o gateway falhasse, a tela diria "Tarefas geradas com sucesso!" sem chamar o servidor | `atividade.html` | ✅ **Removido em 30/09/2026**, as quatro partes. Scripts da página: 6/6 blocos válidos antes e depois |

---

## 2. O fluxo, de ponta a ponta

```
Clique em "Gerar com ajuda da IA" (tipo + orientação opcional)
  │
  ├─ 1. RESERVA ─────────── proposta + JEV + teto do Claude (+ busca, na Referência)   ← amplia ATV-GERAR-016
  │                          sem saldo para o total → 402 antes de qualquer chamada
  │
  ├─ 2. PROPOSTA ────────── Senior Product Designer, exatamente como hoje
  │
  ├─ 3. AVALIAÇÃO (JEV) ─── síncrona, timeout 4 s, uma chamada para a tarefa inteira
  │     ├─ ok ─────────────► avaliador = "jev"
  │     └─ falhou ─────────► segue SEM nota; o Claude avalia depois (passo 6)
  │
  ├─ 4. TAREFA ──────────── criarTarefaNoFim, como hoje; grava a nota em avaliacoes_ia (alvo = tarefa)
  │
  ├─ 5. RESPOSTA ────────── `proximo` decide o que a tela faz:
  │     ├─ pesquisa, JEV ok e t1 abaixo do limite ─► 'revisar'   (T1, só em `visivel`)
  │     ├─ pesquisa, qualquer outro caso ──────────► 'pesquisar' (como hoje)
  │     ├─ referência ─────────────────────────────► 'abrir'     (como hoje, depois da busca)
  │     └─ matriz ─────────────────────────────────► 'classificar'
  │
  └─ 6. RESERVA PELO CLAUDE ─ só se o JEV falhou, em SEGUNDO PLANO, depois da resposta
                              grava a nota quando chegar; acerta a reserva pelo custo real
```

**Por que o Claude não segura a resposta.** Esperar até 30 s por uma nota atrasaria a tarefa que a pessoa pediu, e a pesquisa que começa em seguida. É o mesmo desenho que a Visão usa no assistente (§5.4 daquele plano).

**Por que a falha do JEV não muda `proximo`.** Sem nota do JEV no momento da resposta, a tarefa segue o caminho de hoje. A nota do Claude chega depois e aparece no selo, mas não segura a pesquisa. Falha do avaliador nunca decide sozinha que algo não roda (`IA-AVAL-003`).

**Quando o Claude chega a `revisar`.** Nunca. `revisar` depende de um julgamento feito **antes** da resposta, e só o JEV chega a tempo.

---

## 3. O que o JEV avalia na tarefa

Todas as perguntas vão numa chamada só (`IA-AVAL-006`). Os critérios que significam o mesmo que na Visão mantêm o **mesmo código**, para que as notas das duas telas sejam comparáveis.

### 3.1 Critérios comuns (os mesmos da Visão)

| Código | Tipo JEV | Pergunta (resumo) | Observação |
|---|---|---|---|
| c1 | `choice` | As afirmações de fato da tarefa estão sustentadas por `evidencias`? | Mesmas opções de `OPCOES_C1` |
| c2 | `score` 0–4 | Quanto a tarefa atende ao trabalho da atividade? | `pedido` = atividade (título, descrição) + orientação |
| c3 | `noul` | A tarefa pertence a um projeto de "{projeto}"? | |
| c4 | `noul` | Afirma fatos sobre a empresa que não estão em `evidencias`? | Trava em "baixa" |
| c6 | `noul` | É genérica a ponto de servir a qualquer atividade? | Limite de 90%, da calibração |
| c8 | `noul` | Repete, com outras palavras, alguma tarefa de `existentes`? | `existentes` = tarefas da atividade |
| c10 | `noul` | Respeita `pedido.orientacao`? | Só quando houver orientação |

c7 (entrega concreta) e c9 (ordem da lista) **não entram**. Uma tarefa não é uma etapa com entrega, e não há lista.

### 3.2 Critérios por tipo de tarefa

| Código | Tipo de tarefa | Pergunta | Hoje é |
|---|---|---|---|
| **t1** | Pesquisa | A descrição pede fatos que uma fonte responde (quais, quantos, onde, quanto custa, desde quando), e não raciocínio ou opinião? | Só instrução ao modelo (`ATV-GERAR-005`) |
| **t2** | Pesquisa | A pergunta já está respondida por `evidencias.ideias_validadas`? | Só instrução ao modelo (regra 2 do prompt) |
| **t3** | Matriz CSD | A descrição diz qual recorte da atividade a matriz vai organizar? | Só formato pedido |
| **t4** | Matriz CSD | A descrição diz para que decisão a matriz vai servir? | Só formato pedido |
| **t5** | Referência | A descrição diz de quem são as referências? | Só formato pedido |
| **t6** | Referência | A descrição diz o que se quer observar nas referências? | Só formato pedido |

**Corrigido na construção (30/09/2026):** a versão 0.1.0 deste plano tinha t3 e t4 como perguntas compostas ("qual recorte **e** para que decisão"). Isso é exatamente o que `IA-AVAL-006` proíbe — dois julgamentos numa pergunta. Viraram quatro, e um teste impede que volte (`nenhuma pergunta junta dois julgamentos com "E"`).

**t1 é o critério que justifica o plano.** É ele que transforma `ATV-GERAR-005` de instrução em verificação, e é o único que pode evitar uma busca paga (T1).

**Fora do JEV, de propósito:** "nome das empresas por extenso, nunca pronome". É regra de texto, verificável por código, e regra de sistema não vira percentual (plano da Visão, §2).

### 3.3 A nota

A mesma fórmula da Visão (`calcularGeral`, `aplicarTravas`):

- `especificos` = média de c6 (invertido para "específica"), c10 e os t do tipo — **menos t2**, que é alerta e não qualidade da pergunta.
- **Trava nova:** t1 abaixo do limite limita a nota a "revisar". Uma pergunta que não se responde por fonte não pode aparecer como "confiança alta".
- **Alerta novo:** t2 acima do limite → *"Parece já estar respondida pelo que a empresa sabe."*
- Limites iniciais: **50%** (`LIMITES_TAREFA` em `normalizar.ts`), até a calibração da Fase 2 (`IA-AVAL-014`). Ficam fora de `LIMITES` de propósito: `calibracao.ts` lê aquele objeto, e um campo a mais mudaria a calibração da Visão.

---

## 4. Arquitetura

### 4.1 O intérprete como parâmetro (A1)

```ts
// avaliar.ts — hoje: avaliarLote(lote, quantidade, deps) → chama avaliarEtapas por dentro
// depois:
export async function avaliarLote<T>(
  lote: Lote,
  deps: DependenciasAvaliacao,
  interpretar: (respostas: Record<string, Resposta>, avaliador: 'jev' | 'claude', modelo: string) => T,
  vazio: () => T,
): Promise<ResultadoAvaliacaoDe<T>>
```

`avaliarIdeias` passa a chamar `avaliarLote(lote, deps, (r, a, m) => avaliarEtapas(lote, r, a, m, n), () => etapasNaoAvaliadas(n))`. **Os testes da Visão têm de passar sem mudança.** Essa é a prova de que a refatoração não mexeu em comportamento.

A reserva pelo Claude precisa rodar separada do JEV (§2, passo 6). Por isso `avaliarLote` ganha também uma opção `somenteJev: true`, e a rota chama `avaliarComClaude` depois, em segundo plano.

### 4.2 Arquivos novos e alterados

```
api/src/ia/avaliacao/
  perguntas-tarefa.ts   PURO  montarLoteTarefa(ctx) — c1–c4, c6, c8, c10 + t1..t4 conforme o tipo
  normalizar.ts         PURO  + avaliarTarefa(lote, respostas, avaliador, modelo) → Avaliacao
                              + trava de t1 e alerta de t2; LIMITES ganha t1..t4
  avaliar.ts                  avaliarLote genérico (§4.1); avaliarTarefa(ctx, deps)
  config.ts                   avaliacaoTarefaLigada(), lê AVALIACAO_MODO_TAREFA
api/src/rotas/gerar-tarefa.ts reserva ampliada, avaliação entre proposta e gravação, `proximo: 'revisar'`,
                              reserva pelo Claude em segundo plano
api/src/rotas/tarefas.ts      editar título/descrição → nota `desatualizada`; excluir → `excluida`   [conferir nomes]
api/src/env.ts                AVALIACAO_MODO_TAREFA; TYPESAFE_MODELO padrão → 'jev-1.13.0'
api/prisma/schema.prisma      AlvoAvaliacaoIa += tarefa
api/testes/avaliacao-tarefa.test.ts
css/avaliacao.css, js/avaliacao.js   selo extraído da Visão (Fase 3)
```

`marcarAvaliacao` (hoje em `rotas/ideias.ts:340`, só para idéia) passa a receber `alvoTipo` e sai para um lugar comum. É o mesmo movimento de A1: um dono só.

### 4.3 O que vai no `state`

```
pedido:     { projeto, atividade: { titulo, descricao }, tipo, orientacao? }
evidencias: { empresa: { nome, descricao }, ideias_validadas: [títulos] }
existentes: [títulos das tarefas da atividade]
tarefa:     { titulo, descricao }
```

- As evidências seguem o recorte da Visão: **só o que está validado**. `c1` pergunta pelo que a plataforma **confirma**, e material de consulta não confirma nada (`IA-CONHEC-005`). [conferir: tirar os títulos validados de `pacoteInternoDa`, que a rota já carrega, em vez de uma consulta nova]
- Tetos de `LIMITES` da Visão: 30 validadas, 60 existentes, 1.200 caracteres de descrição da empresa.
- Nada de nome, e-mail ou id de usuário (`IA-AVAL-015`).

### 4.4 Banco

```sql
ALTER TYPE "AlvoAvaliacaoIa" ADD VALUE 'tarefa';
```

Aditiva, como `aguardando` no portão da pesquisa: nenhum `DROP`, nenhuma coluna alterada. A nota é gravada **depois** de `criarTarefaNoFim`, porque `alvo_id` é o id da tarefa. A avaliação acontece antes, em memória.

### 4.5 Online: o que precisa estar no Render

| Variável | Valor | Nota |
|---|---|---|
| `TYPESAFE_API_KEY` | a chave | Só no painel do Render, nunca no repositório. [conferir se o `render.yaml` a declara com `sync: false`] |
| `TYPESAFE_MODELO` | `jev-1.13.0` | T4 |
| `AVALIACAO_MODO_TAREFA` | `sombra` na Fase 1 | T2; o padrão no código é `desligada` |

A chave é **da plataforma**, não da pessoa. Quem usa a plataforma paga pelo saldo de créditos (§5), e nunca precisa de conta na TypeSafe.

### 4.6 Latência

| Caminho | Acréscimo |
|---|---|
| JEV responde | ~0,1–1 s, dentro de uma proposta que já leva alguns segundos |
| JEV cai no timeout | até 4 s, e a tarefa sai sem nota; o Claude avalia depois |
| Claude | 0 s na resposta (segundo plano) |

---

## 5. Custo

Mesmo princípio da Visão: **todo custo é repassado** (`IA-AVAL-017`), pelo caminho `reservar` → `liberar` → `consumir`, com o valor só no Histórico de uso (`DIN-013`).

- **Reserva:** proposta + `tetoAvaliacaoUsdMicros` (JEV + Claude) + busca, na Referência. Sem saldo para o total, `402` antes de qualquer chamada.
- **Consumo:** cada ida ao avaliador é uma linha `avaliacao` em `consumos_ia`, com o `operacao_id` da proposta, igual à Visão.
- **Segundo plano:** a parte do Claude na reserva fica presa até o passo 6 acertar. [conferir: o que acontece com uma reserva cujo processo morreu no meio — se existe expiração, ela cobre isto; se não, é pendência de `reserva.ts`, e não deste plano]
- **JEV sem preço (A4):** teto zero, medido, marcado `precoDesconhecido`, não cobrado. Ordem de grandeza pelo preço público (US$ 0,042 por milhão de tokens de entrada, saída gratuita): ~1.500 tokens por tarefa ≈ US$ 0,00006. **O preço tem de ser conferido na documentação da TypeSafe e cadastrado com data antes de `visivel`.**
- **`ATV-GERAR-016` (T3):** proposta paga e descartada (fora do formato) **passa a ser cobrada** e fica registrada como `descartado`. Só não há débito quando o fornecedor não cobrou (rede, timeout sem resposta, 5xx).

---

## 6. Na tela

### 6.1 Selo no card da tarefa (Fase 3)

O mesmo selo da Visão, depois de extraído (A3): número e rótulo escritos, cor pelos tokens `--bg-success`/`warning`/`danger`, tooltip dizendo quem avaliou e o alerta mais grave. Só em tarefa criada pela IA; some quando a pessoa edita (`IA-AVAL-011`); sem ações próprias (`IA-AVAL-012`).

Enquanto o Claude avalia em segundo plano, o card mostra **"Avaliando…"**, e a nota aparece na próxima leitura da lista. [conferir: se `atividade.html` já recarrega a lista sozinho; se não, a nota aparece ao voltar à página, e isso basta]

### 6.2 T1 — a pesquisa que não começa sozinha (Fase 4)

Com `proximo: 'revisar'`, a tela **não abre o board com `pesquisar=1`**. A tarefa já existe, com o selo em "Revisar", e o toast diz:

> "Tarefa criada. Esta pergunta pode não ter resposta em fontes da web — confira antes de pesquisar."

A pessoa abre a tarefa, edita se quiser, e clica em **Pesquisar**, que já existe. Nada é apagado, nada é editado pelo avaliador, e a busca continua a um clique. O que muda é que o gasto deixa de acontecer por inércia numa pergunta que o roteador provavelmente recusaria.

[conferir: onde `atividade.html` trata `proximo` — provavelmente `js/orquestrador-gateway.js`, que apareceu no `grep` por `ATV-GERAR`]

---

## 7. Regras

### 7.1 Novas

| Regra | Texto |
|---|---|
| IA-AVAL-018 | A tarefa criada por "Gerar com ajuda da IA" é avaliada entre a proposta e a gravação, pelo mesmo orquestrador da Visão do Projeto. |
| IA-AVAL-019 | Na tarefa, só o JEV avalia de forma síncrona. Se ele falhar, a tarefa é criada sem nota e o Claude avalia em segundo plano. |
| IA-AVAL-020 | Critérios com o mesmo significado mantêm o mesmo código em todas as telas. Critério novo ganha código novo. |
| IA-AVAL-021 | Uma pergunta de Pesquisa que não se responde por fonte (t1) limita a nota a "revisar". |
| IA-AVAL-022 | Cada tela tem o seu modo de avaliação (`AVALIACAO_MODO`, `AVALIACAO_MODO_TAREFA`). Uma tela só vai para `visivel` depois da sua própria calibração. |
| IA-AVAL-023 | O modelo do avaliador é fixo por versão. Trocar de versão exige uma nova rodada de calibração (`IA-AVAL-014`). |
| ATV-GERAR-018 | Com a avaliação em `visivel`, uma Pesquisa cujo t1 fique abaixo do limite **é criada, mas não começa sozinha**. A tela explica o motivo, e a busca fica a um clique. |
| ATV-GERAR-019 | A falha do avaliador nunca impede a pesquisa de começar. Sem nota do JEV no momento da resposta, vale `ATV-GERAR-012`. |
| ATV-GERAR-020 | A tarefa gerada mostra o selo da avaliação enquanto o texto for o que a IA gerou. |

### 7.2 Revistas

- **`ATV-GERAR-012`:** "a pesquisa começa sozinha" ganha a exceção de `ATV-GERAR-018`.
- **`ATV-GERAR-016`:** a reserva soma a avaliação; "proposta que não vira tarefa não é cobrada" passa a "todo custo que o provedor cobrou é repassado" (`IA-AVAL-017`).
- **`ATV-GERAR-005`:** passa a ter verificação (t1), além da instrução ao modelo.
- **`ia-avaliacao.md`, frentes:** ganha F6, "Tarefa gerada na atividade".

---

## 8. Fases

| Fase | O quê | Muda para o usuário? | Critério para avançar |
|---|---|---|---|
| **0. Conferência** ✅ | §1 deste plano | — | — |
| **Limpeza** | Apagar o código morto de A8, num commit próprio | Não (ninguém alcançava) | `grep generateTasksModal` vazio |
| **1. Base** | A1 (intérprete como parâmetro), `perguntas-tarefa.ts`, `avaliarTarefa`, trava de t1, migração de A2, reserva ampliada, consumo `avaliacao`, Claude em segundo plano, `desatualizada`/`excluida` nas rotas de tarefa, `AVALIACAO_MODO_TAREFA`, `TYPESAFE_MODELO` fixo; em `sombra`, só grava | Não | Testes da Visão passando **sem alteração**; testes novos cobrindo JEV ok, JEV falha → Claude, os dois falham, chave ausente |
| **2. Calibração** | Gabarito de 20–30 tarefas marcadas à mão, com os scripts que já existem. **Foco em t1:** perguntas boas, perguntas reflexivas ("qual a melhor estratégia…"), perguntas já respondidas pelo validado | Não | t1 com ≥ 90% de acerto no gabarito; limites fixados e registrados |
| **3. Selo** | Extrair o selo da Visão para `css/avaliacao.css` + `js/avaliacao.js` (a Visão passa a usá-lo); selo no card da tarefa; "Avaliando…"; preço do JEV em `precos.ts` | **Sim** | Preço cadastrado; a Visão sem regressão visual |
| **4. T1** | `proximo: 'revisar'`, a tela sem `pesquisar=1`, o toast | **Sim** | Só com a Fase 2 aprovada para t1 |

A ordem Fase 2 → Fase 4 não é negociável: a Fase 4 decide se dinheiro sai ou não com base em t1, e t1 sem calibração é palpite.

---

### 8.1 Fase 1 — o que foi feito e o que falta (30/09/2026)

**Feito e provado** (74/74 testes: os 44 da Visão, com os arquivos de teste **idênticos** aos originais, e 30 novos):

| Arquivo | O quê |
|---|---|
| `avaliacao/avaliar.ts` | A1: `avaliarLoteCom<T>` com intérprete como parâmetro e `apenas: 'jev' \| 'claude'`; `avaliarLote` e `avaliarIdeias` com a assinatura de sempre; `avaliarTarefaGerada`; `tetoAvaliacaoPartes` (a soma dá o teto de antes — há teste) |
| `avaliacao/perguntas-tarefa.ts` | Novo. `montarLoteTarefa`, com c1–c4, c6, c8, c10 e t1–t6 |
| `avaliacao/perguntas.ts` | `limpo` passou a ser exportada. Nenhuma outra mudança |
| `avaliacao/normalizar.ts` | `avaliarTarefa`, `LIMITES_TAREFA`, trava de t1 (`IA-AVAL-021`), alertas `nao_pesquisavel` e `ja_respondida`, `proximoAposGerar` |
| `avaliacao/config.ts`, `env.ts` | `AVALIACAO_MODO_TAREFA` (T2); `TYPESAFE_MODELO` padrão `jev-1.13.0` (T4) |
| `avaliacao/marcar.ts` | Novo. `marcarAvaliacao(alvoTipo, id, estado)`, saído de `rotas/ideias.ts` |
| `rotas/ideias.ts` | Usa `marcar.ts`. Nenhuma outra mudança |
| `rotas/gerar-tarefa.ts` | Reserva separada (proposta + JEV / Claude), JEV na requisição, Claude em segundo plano, nota gravada, T3 no custo, `proximoAposGerar` com `FASE_4_LIGADA = false`. **Checado com tipos só nas linhas novas** (módulos ausentes substituídos por `any`) |
| `prisma/migrations/20260930120000_avaliacao_alvo_tarefa` | `ALTER TYPE ... ADD VALUE 'tarefa'` |
| `testes/avaliacao-tarefa.test.ts` | 30 testes. Contraprova: com a trava de t1 desligada, exatamente o teste de `IA-AVAL-021` falha |
| `atividade.html` | Limpeza de A8 |
| `atividade-lista.md` | 1.14.0: `ATV-GERAR-018` a `020`; `005`, `012` e `016` revistas |

**Falta, no Claude Code** — dependem de arquivos que não vieram no pacote da Fase 0:

1. `schema.prisma`: `tarefa` no enum `AlvoAvaliacaoIa`, e conferir o nome do tipo no Postgres contra a migração que criou `avaliacoes_ia`.
2. `rotas/tarefas.ts`: `marcarAvaliacao('tarefa', id, 'desatualizada')` quando título ou descrição mudarem; `'excluida'` ao excluir (`ATV-GERAR-020`).
3. `tsc` do projeto inteiro e `npm run teste`. **`avaliacao-rede.test.ts` tem de passar sem alteração** — ele não estava no pacote, e é quem prova o caminho de rede da Visão depois de A1.
4. `registrar` aceita `ideiaId` numa linha `tipo: 'avaliacao'`? (`ideias.ts` não manda.)
5. `reserva.ts`: uma reserva cujo processo morreu antes do segundo plano acertar expira? Se não, é pendência de `reserva.ts`.
6. `js/orquestrador-gateway.js`: confirmar que ele clona `#generateWithAIBtn` — a Limpeza removeu o ouvinte antigo contando com isso.
7. `ia/ia-avaliacao.md`: escrever `IA-AVAL-018` a `023` e a frente F6, com o texto de §7.1.
8. Render: `TYPESAFE_API_KEY`, `TYPESAFE_MODELO=jev-1.13.0`, `AVALIACAO_MODO_TAREFA=sombra`.
9. Uma geração de verdade de cada tipo em `sombra`, conferindo a linha `gerar tarefa: avaliação` no log e a nota em `avaliacoes_ia`.

---

## 9. Riscos

| Risco | Contenção |
|---|---|
| t1 errar e segurar uma pesquisa boa | Não apaga nem edita; a busca fica a um clique; só liga depois da calibração |
| t1 errar para o outro lado e deixar passar pergunta reflexiva | Hoje isso já acontece em 100% dos casos; o JEV só pode melhorar esse número |
| A refatoração do orquestrador quebrar a Visão | Testes da Visão sem alteração como critério da Fase 1 |
| Reserva do Claude presa se o processo morrer em segundo plano | [conferir expiração em `reserva.ts`] |
| JEV em acesso antecipado, fornecedor novo | Reserva pelo Claude + "não avaliado" + falha nunca segura a pesquisa |
| `jev-latest` mudar o comportamento sem aviso | Versão fixa (T4, `IA-AVAL-023`) |
| Duas cópias do selo | Extração na Fase 3, antes de usar na atividade |

---

## 10. Decisões

| # | Decisão | Resultado |
|---|---|---|
| T1 | Pesquisa com t1 baixo | **Decidido pelo Ricardo em 30/09/2026:** cria a tarefa, mostra o selo e **não inicia a busca sozinha**. Só depois da calibração de t1 |
| T2 | Modo da avaliação | **Decidido em 30/09/2026:** separado, `AVALIACAO_MODO_TAREFA` |
| T3 | `ATV-GERAR-016` | **Decidido em 30/09/2026:** segue `IA-AVAL-017` — todo custo é repassado |
| T4 | Modelo do JEV | **Decidido em 30/09/2026:** fixo em `jev-1.13.0` |
| T5 | Preço do JEV em `precos.ts` | **Pendente.** Conferir na documentação oficial e cadastrar com data. Bloqueia a Fase 3 — e também o `visivel` da Visão |

---

## 11. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.2.0 | 2026-09-30 | Limpeza feita, com um achado a mais: o falso sucesso estava preso ao botão real, protegido só pelo clone do gateway (A8). Núcleo da Fase 1 construído (§8.1). t3/t4 compostos viraram t3–t6 (`IA-AVAL-006`). T3 aplicada em `atividade-lista.md` 1.14.0. |
| 0.1.0 | 2026-09-30 | Primeira versão, com a Fase 0 concluída. A leitura do código corrigiu o rascunho em quatro pontos (§1.2), achou oito pendências (§1.3) e fixou o ponto de entrada: entre a proposta e a gravação. T1 a T4 decididas. |
