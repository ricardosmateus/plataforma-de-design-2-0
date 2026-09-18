# Planejamento — Pesquisa v2: a investigação como coração do produto

> **Data:** 13/09/2026 · **Página:** `board.html` · **Status:** plano, aguardando decisão das fases
> **Substitui em parte:** `planejamento-pesquisa-concorrentes.md` (02/09) — mantém as regras PES-001 a 009 e as decisões de §2 e §3; muda o que acontece depois que a pergunta é aceita.
> **Regras afetadas:** `board-lista.md` §1.8 `BOARD-PESQUISA`, `creditos-pagamentos-regras.md`

---

## 0. O que este plano responde

O pedido, nas palavras de quem pediu: pesquisa **moderna, rápida, barata para o usuário, que traga informação valiosa, com a fonte de onde saiu, com a opção de apagar o que não se quer salvar** — e que **não devolva "reescreva a pergunta"** para uma tarefa que já está clara. Referências: como o Manus vai à internet, lê sites e entrega uma análise estruturada; como o NotebookLM prende cada afirmação numa fonte.

A resposta curta: **o produto já tem quase todas as peças, e usa cada uma pela metade.** Tem roteador, mas ele recusa em vez de perguntar. Tem busca com citação, mas faz um turno só. Tem fontes, mas presas à seção e não à afirmação. Tem quadro, mas o resultado cai nele sem passar por quem vai usá-lo. O plano é ligar as peças na ordem certa — e não trocar de ferramenta.

---

## 1. Como funciona hoje, de ponta a ponta

Conferido em 13/09/2026 contra `board.html`, `js/pesquisa.js`, `js/resposta-para-quadros.js`, `api/src/pesquisa/*` e `api/src/rotas/pesquisa.ts`.

```
clique em "Pesquisar" (descrição da tarefa)
  │
  ├─ 1. garantirSessao()             cria/acha a investigação da tarefa
  ├─ 2. POST /planejar               roteador por regex — grátis
  │       ├─ referência sem dono ──► recusa ("escreva o nome da empresa")
  │       ├─ nível ambíguo ────────► recusa ("deixe a tarefa mais direta")
  │       └─ nível `conhecimento` ─► recusa ("reescreva como pergunta verificável")  ◄── o erro do Ricardo
  ├─ 3. POST /consultar              UMA chamada ao modelo com web_search
  │       · máx. 5 buscas, 1.024 tokens de saída, um turno
  │       · ~9,6 s de latência média (comparação de 02/09)
  │       · devolve texto + fontes (url, título, trecho de até 150 caracteres)
  ├─ 4. planejarQuadros()            divide o texto por títulos → quadros
  │       · fontes anexadas por SEÇÃO, não por afirmação
  │       · formato (documento / post-its) decidido no cliente
  └─ 5. quadros entram no canvas e o PUT grava o quadro inteiro
```

### 1.1 Onde ele limita

| # | Limite | Evidência | Efeito para quem usa |
|---|---|---|---|
| L1 | **O portão recusa tarefa legítima.** `SUJEITO_EXTERNO` é lista fechada de substantivos genéricos; nome próprio não passa. | Corpus de 28 frases: 4 recusas indevidas (`api/testes/corpus-roteador.ts`) | "Pesquisar outras logitechs" → "reescreva a tarefa" |
| L2 | **`conhecimento` é beco sem saída.** O nível existe, não executa, e a tela não oferece alternativa. | `motivoNaoExecutavel()` em `js/pesquisa.js` | Tarefa clara, botão morto |
| L3 | **O 409 de confirmação não tem interface.** O servidor aceita `nivelConfirmado` para forçar o nível; o cliente nunca envia. | `corpoPergunta` em `rotas/pesquisa.ts`; zero ocorrências no JS | O mecanismo de "perguntar em vez de recusar" existe e está desligado |
| L4 | **Um turno só.** Uma chamada, cinco buscas, 1.024 tokens. Não lê a página inteira, não cruza fontes, não volta para checar. | `provedor-claude-busca.ts` linhas 135–138 | Resposta rasa; o "Manus" que se quer não cabe num turno |
| L5 | **Fonte por seção, não por afirmação.** O provedor devolve `cited_text` e a posição de cada citação (`inicios`); a tela usa só a lista de fontes do bloco. | `resposta-para-quadros.js` | Não dá para saber de onde saiu *esta* frase |
| L6 | **Sem curadoria.** O resultado vira quadro direto. Apagar é por card/quadro, depois de gravado, e o `documento` é um bloco só. | `pesquisarNoQuadro` → `BoardCanvas.adicionarCard` | O usuário limpa o quadro em vez de escolher o que entra |
| L7 | **Sem progresso.** "Pesquisando…" por ~10 s, sem dizer o que está acontecendo. | `trabalhando(true, 'Pesquisando...')` | Parece travado; o custo de espera é invisível |
| L8 | **Custo só medido desde hoje**, e a busca encadeada ainda sem preço na razão. | `creditos-pagamentos-regras.md`, "Consumidores não medidos" | Não dá para prometer "barato" sem medir |

### 1.2 O que está certo e fica

Do plano de 02/09, cinco decisões continuam corretas e este plano as preserva:

- **PES-002** — dado estruturado vem de API estruturada (Places para "no meu bairro"), nunca de agente navegando mapa.
- **PES-005** — nada contra termos de uso. LinkedIn e Instagram seguem fora (nível 4 condicional).
- **PES-006** — toda afirmação carrega fonte. Este plano a leva até o fim: fonte **por afirmação**.
- **PES-003** — custo vem do provedor, transação a transação. Já ligado à razão em 13/09.
- **Não usar o Manus como serviço** (§2 do plano anterior): cobra por conta, expõe a tarefa a todos os participantes, é produto de usuário final. O que se quer do Manus é o **comportamento**, não a assinatura.

---

## 2. As referências, lidas com cuidado

### 2.1 Manus — o que copiar e o que não

O Manus transforma o pedido num **plano de etapas visível**, executa com sub-agentes (um navegador que renderiza páginas, um de código, um de arquivos) e entrega **relatório mais o replay dos passos**. Cobra por crédito proporcional ao número de passos — sem preço fixo por tarefa — e o próprio material de referência avisa que **tarefas longas são onde ele mais deriva**.

| Copiar | Não copiar |
|---|---|
| Plano visível antes de gastar | Navegador visual para tudo — caro, lento, e é o que esbarra em termos de uso |
| Execução em etapas, com progresso | Créditos por passo sem teto — é a deriva que o próprio Manus reconhece |
| Relatório final estruturado + fontes | Tarefa de horas; aqui a unidade é minutos |
| Replay: o usuário vê o que foi feito | Sub-agentes genéricos; aqui os tipos de pesquisa são poucos e conhecidos |

### 2.2 NotebookLM — o que copiar

O NotebookLM prende **cada afirmação a uma passagem exata** da fonte, com citação inline; **se a resposta não está nas fontes, diz que não está** em vez de inventar; e desde 2025 tem **"Discover sources"**, que busca fontes na web para o caderno em vez de responder direto.

O que isso ensina para o board: a **fonte é um objeto de primeira classe**, não um rodapé. A investigação acumula fontes; a resposta é montada *a partir* delas; apagar uma fonte tira o chão das afirmações que dependiam dela — e a tela mostra isso.

### 2.3 O que a ferramenta que já se usa passou a oferecer

O provedor atual é a Messages API da Anthropic. Ela hoje tem os dois blocos que faltam, e nenhum exige trocar de fornecedor:

| Ferramenta | O que faz | Custo | O que resolve aqui |
|---|---|---|---|
| `web_search` | Busca com citações **sempre ligadas**: url, título e `cited_text` de até 150 caracteres. Campos de citação **não contam tokens**. `allowed_domains`/`blocked_domains`. Versões recentes filtram resultados antes de entrar no contexto. | **US$ 10 por 1.000 buscas** (US$ 0,01 cada) + tokens | O que já se usa, agora com preço conhecido para a razão (L8) |
| `web_fetch` | Lê a **página inteira** (ou PDF) de uma URL que apareceu numa busca anterior. `max_content_tokens` para cortar. Citações opcionais. Não renderiza JavaScript. | **Sem custo adicional** — só os tokens do conteúdo (~2.500 por página de 10 kB) | "Ir ao site e ler" — o que o Manus faz com navegador, a centavos, sem quebrar termos (só lê o que o buscador já indexa) |

Isto é o que torna o plano barato: **a leitura profunda custa tokens, não buscas.** Cinco buscas mais oito páginas lidas é uma investigação de verdade por menos de um real.

---

## 3. Arquitetura-alvo

Uma **investigação** deixa de ser uma chamada e vira um **processo em etapas, com orçamento, visível e curável**:

```
tarefa (texto livre)
  │
  ▼
[1] PLANEJAR ──────── modelo barato lê a tarefa e escreve 3–6 perguntas verificáveis
  │                   · substitui o portão por regex (L1, L2): quem interpreta é o modelo
  │                   · mostra o plano e o custo estimado ANTES de gastar (PES-007)
  │                     — o TOTAL que sai do saldo, comissão dentro, sem desmembrar (DIN-007)
  │                   · reserva o teto na razão (mesmo mecanismo de hoje)
  ▼
[2] BUSCAR ────────── web_search por pergunta, em paralelo
  │                   · citações vêm de graça; domínios BR priorizados quando fizer sentido
  ▼
[3] LER ───────────── web_fetch das 2–3 melhores páginas por pergunta
  │                   · só URLs que a busca devolveu (regra da ferramenta e regra de segurança)
  │                   · `max_content_tokens` por página; teto total por investigação
  ▼
[4] SINTETIZAR ────── modelo principal escreve a análise como JSON estruturado
  │                   · secoes[] → afirmacoes[] → cada uma com fonte_id + trecho citado
  │                   · afirmação sem fonte é marcada `sem_fonte`, nunca escondida (PES-006)
  │                   · "não encontrei" é resposta válida (PES-008)
  ▼
[5] RASCUNHO ──────── painel de curadoria, ANTES de gravar
  │                   · apagar afirmação, seção ou fonte; ver o trecho de origem
  │                   · `sem_fonte` desligadas por padrão
  ▼
[6] SALVAR ────────── vira quadros (documento e/ou post-its) com link por afirmação
                      · o que foi apagado no rascunho não entra; a procedência fica na sessão
```

Cada etapa emite progresso (SSE) para a tela: *"planejando… 4 perguntas · buscando 2/4 · lendo 3 páginas · escrevendo"*. É o "plano visível" do Manus, sem o custo do Manus.

### 3.1 Contrato do resultado (o que muda no dado)

```
Investigacao
  plano[]          pergunta, motivo               (visível, editável antes de executar)
  fontes[]         id, tipo (validada|consulta|web), url ou origem (empresa/projeto/idéia/tarefa),
                   titulo, trecho, acessado_em, dominio
  secoes[]         titulo, afirmacoes[]
    afirmacao      texto, fonte_ids[], trecho_citado, confianca, removida_pelo_usuario
  custo            buscas, paginas, tokens, total_micros   (PES-003, para a razão)
  passos[]         etapa, inicio, fim, resultado            (o replay)
```

`fontes[]` guarda o **trecho**, não só a URL — resolve a pendência "retenção do resultado" do plano anterior: página que sai do ar amanhã continua auditável.

### 3.2 O roteador, reposicionado

O roteador por regex **não some**: ele passa a fazer só o que faz bem — separar `lugares` (Places API) e `navegacao` (recusa por termos de uso) — e **deixa de ser portão para o resto**. Tudo que não é lugar nem navegação vai para o planejador, que lê a tarefa como um humano leria.

O nível `conhecimento` deixa de existir como recusa. Resolve a tensão registrada em §12.3 do plano anterior pela segunda saída que ele mesmo listou: *"ele deixa de existir, e 'quem são meus concorrentes' vira busca."*

### 3.3 O que a empresa já sabe é a primeira fonte

Hoje a busca recebe da empresa **só nome e descrição** (`contextoDaSessao` em `rotas/pesquisa.ts`). Nada do que está em "Sobre a empresa" chega à pesquisa: nem as pastas, nem os recortes das idéias finalizadas, nem as entidades que investigações anteriores já nomearam. A pesquisa de hoje começa do zero toda vez — e por isso pode contradizer o que a própria empresa já validou, ou gastar buscando o que ela já sabe.

A correção é tratar o conhecimento interno como **a primeira fonte da investigação**, no mesmo sentido do NotebookLM: antes de ir à web, o planejador lê o caderno da empresa.

**O que entra, e como:**

| Fonte interna | De onde | Para quê |
|---|---|---|
| Ficha da empresa | `empresas.nome`, `descricao` | Já entra hoje; continua no `system` |
| **Verdade validada** | `recortes_taxonomia` das idéias em `finalizado` da **empresa inteira** (o que `Sobre_a_empresa.html` mostra) | O planejador não repete o que já está validado; a síntese cita como fato do projeto |
| **Material de consulta** | Idéias ativas em `Minhas idéias` e `Em andamento` **do projeto da tarefa** — título, descrição e, quando houver, o quadro | A investigação enxerga a hipótese que ela existe para confirmar ou derrubar; sempre marcada como não validada |
| **Entidades conhecidas** | `pesquisa_entidades` de todas as investigações da empresa (hoje só da sessão) | "Concorrente 01" e os nomes já descobertos entram no vocabulário da tarefa nova |
| Taxonomia da tarefa | `assunto`/`tags` da idéia de origem | Escolhe **quais** recortes são relevantes, sem despejar a base inteira |

**A régua é a do assistente, não uma nova.** `IA-CONHEC-001` a `008` já dividem o conhecimento da empresa em duas categorias e só duas: **verdade validada** (idéia ativa em `Finalizado`, e desde `IA-CONHEC-007` tudo que está dentro dela — tarefas, quadros, post-its) e **material de consulta** (idéias em `Minhas idéias` e `Em andamento`, mais tarefa concluída em atividade ainda aberta, `IA-CONHEC-008`). Idéia arquivada não entra em categoria nenhuma (`IA-CONHEC-004`), e toda afirmação apoiada em material de consulta sai **marcada como não validada na própria resposta** (`IA-CONHEC-005`).

A investigação segue a mesma régua. Se seguisse só o validado, ela seria **mais restrita que o assistente** — e cega para a própria hipótese que motivou a tarefa: "Pesquisar outras logitechs" vive numa idéia em `Em andamento`, não em `Finalizado`.

**Os dois recortes são diferentes, de propósito.** Verdade validada vem da **empresa inteira**, porque é o que `Sobre_a_empresa.html` já é (`TEMA-ISO-001`): conhecimento da empresa, não de um projeto. Material de consulta vem **só do projeto da tarefa** — hipótese de outro projeto seria ruído, e espalharia o não-validado entre projetos que a pessoa mantém separados.

**Seleciona, não despeja.** Uma empresa pode ter até 400 idéias finalizadas no grafo. Mandar tudo custaria dezenas de milhares de tokens por investigação e afogaria a pergunta. A seleção é por **categoria** (as pastas da idéia de origem e as vizinhas no mesmo domínio da taxonomia) com teto de tokens — ~3 k por investigação, na ordem de um centavo de dólar.

**Interno e externo ficam distinguíveis.** No resultado (§3.1), `fontes[]` ganha `tipo: 'interna' | 'web'`. Fonte interna aponta para o quadro de origem (`board.html`, os quatro ids — o mesmo link de `tema.html`), não para uma URL. A síntese pode então dizer três coisas que hoje não consegue:

- *"A empresa já sabe X"* — com link para a idéia de onde veio;
- *"Encontrado na web: Y"* — com a URL e o trecho;
- *"Atenção: a web diz Z, mas a idéia W registra o contrário"* — a contradição é achado, não ruído;
- *"A web confirma (ou derruba) a suposição S, que está em andamento"* — que é a lógica de certezas, suposições e dúvidas que a matriz CSD do produto já usa, agora com fonte externa de um lado.

É isso que "coerência" quer dizer na prática: a pesquisa nova **conversa com o que já foi validado**, em vez de ignorá-lo.

**A fronteira de segurança continua.** O contexto interno vai no `system`, onde já vai a ficha da empresa; o conteúdo lido da web vai como resultado de ferramenta. Os dois nunca se misturam no mesmo bloco — é o que impede uma página maliciosa de "ler" o conhecimento da empresa (risco de exfiltração, §6).

---

### 3.4 O feedback mora no assistente, não no botão

Pedido do Ricardo, 13/09/2026: *"o Manus tem feedback na IA em forma de texto e vai incluindo informações sobre a pesquisa, a etapa que está sendo realizada; gostaria de ter o mesmo tipo de feedback na plataforma de design, onde as informações vão aparecendo em forma de texto dentro do nosso assistente de IA."*

É a saída para o **L7** — e a escolha do lugar não é cosmética. Hoje o progresso vive em `#iaAviso`, uma linha de `role="status"` no rodapé do compositor, ao lado do botão "Enviar". É onde cabe "Pesquisando… 8s" e mais nada: uma linha, sem histórico, apagada no fim. Narrar seis etapas ali seria empurrar seis frases por um vão de uma frase.

O lugar certo já está na tela. **`board.html` já tem o painel do assistente**, é o **mesmo módulo** (`js/ia.js`) e a **mesma conversa do projeto** (`BOARD-IA-002`, `IA-CONV-001`) — e `#iaThread` já é `aria-live="polite"`. O que falta não é painel: é a investigação ter direito de escrever nele.

```
tarefa (texto livre)                      #iaThread  (o que a pessoa lê)
  │                                       ┌──────────────────────────────────┐
  ▼                                       │ 🔎 Investigando                  │
[1] PLANEJAR ──── passo emitido ─────────▶│   "outras logitechs no Brasil"   │
  │                                       │   Li o que a empresa já sabe:    │
  │                                       │   3 pastas, 7 trechos validados  │
  ▼                                       │   4 perguntas · ~R$ 0,90         │
[2] BUSCAR ────── passo emitido ─────────▶│   Buscando 2 de 4…               │
  ▼                                       │   Lendo 3 páginas                │
[3] LER ───────── passo emitido ─────────▶│   Escrevendo a análise           │
  ▼                                       │ ✅ 11 afirmações · 8 fontes      │
[4] SINTETIZAR ── passo emitido ─────────▶│   [Ver o rascunho]               │
                                          └──────────────────────────────────┘
```

**A narração não é mensagem da conversa.** Esta é a decisão que carrega o resto. O histórico do assistente vai para o modelo nas perguntas seguintes (`IA-CONV-004`), é persistido (`IA-CONV-002`) e apagado no logout (`IA-CONV-012`). Se "buscando 2 de 4…" virasse mensagem, toda pergunta seguinte carregaria o ruído de todas as investigações anteriores — pagando tokens por isso e confundindo o modelo sobre quem disse o quê. A narração é uma **entrada de tipo próprio** na mesma thread: aparece junto das mensagens, ocupa o mesmo lugar visual, e **não entra no contexto** de pergunta nenhuma.

**Cada passo é fato consumado, nunca promessa.** O servidor emite o passo **depois** que ele terminou. "Buscando 2 de 4" é contagem do que já saiu; "encontrei 12 concorrentes" antes da síntese seria `IA-ACAO-009` do lado da leitura — alegar resultado que ainda não existe. E vale aqui o acerto que `js/pesquisa.js` já tinha registrado em comentário: **nada de barra de progresso**. Não sabemos quanto falta; uma barra que enche sozinha seria invenção. Etapas concluídas são verdade; percentual não.

**A narração sobrevive ao F5.** O `passos[]` de §3.1 já guarda etapa, início, fim e resultado. Recarregar no meio de uma investigação — hoje, perda da consulta já paga — passa a remontar a narração do banco e reconectar. A conversa persiste por `IA-CONV-002`; a narração persiste por `passos[]`, que é dela.

**Quem vê.** A conversa é privada por pessoa (`IA-CONV-003`), então a narração é privada também: quem abriu o board ao lado vê o **resultado** (o quadro é da tarefa, compartilhado) e não vê a narração (é de quem pediu). Isso é coerente, não um efeito colateral — narração é o relato de um gasto que saiu do saldo de alguém.

**O que isto abre de graça.** Com a investigação escrevendo na thread, "perguntar ao caderno" (Fase 3) deixa de precisar de superfície nova: a pergunta de acompanhamento é uma mensagem normal, logo abaixo da narração que a motivou, no painel que já está aberto.

---

## 4. As fases

Cada fase entrega algo usável sozinha. A ordem é por **valor para quem usa ÷ risco**.

### Fase 0 — Parar de recusar *(1–2 dias)* — ✅ **CONSTRUÍDA em 14/09/2026**

O que hoje mais dói, com o menor código.

> **Entregue.** `api/src/pesquisa/saidas.ts` (texto e opções num lugar só) · `planejar` devolve `impedimento` e `saidas` · `409`/`501`/`503` mandam as mesmas saídas · `js/pesquisa.js` envia `nivelConfirmado` pela primeira vez · `js/ia.js` ganhou `window.IaNarracao` · `testes/roteador.test.ts` (14/18, os 4 quebrados travados) e `testes/saidas.test.ts` · verificação com DOM real em `ferramentas/provar-fase0.mjs` (20 conferências). Regras: `BOARD-PESQUISA-012`, `016`, `017` e `IA-CONV-NARRA`.

- Botão **"Buscar assim mesmo"** quando o roteador disser `conhecimento`: reenvia com `nivelConfirmado: 'busca'`. O servidor já aceita.
- Interface para o **409** de nível ambíguo: mostra as opções e o custo de cada uma, a pessoa escolhe.
- **Texto** das recusas deixa de pedir reescrita e passa a oferecer caminho.
- Corpus do roteador entra no `npm run teste`.
- **A investigação passa a aparecer no assistente** (§3.4), ainda sem etapas: uma entrada abre no `#iaThread` com a tarefa e o tempo correndo, e fecha com o resultado ou com a falha. Sem servidor novo — é o encanamento da narração (tipo de entrada, fora do contexto, persistência) posto no lugar barato, para a Fase 1 só precisar preenchê-lo.

**Entrega:** nenhuma tarefa clara fica sem botão, e a espera para de ser uma linha morta no rodapé. **Regra nova:** `BOARD-PESQUISA-012` — *nenhum nível é beco sem saída para uma tarefa que a pessoa já criou.*

**O que a construção ensinou.** Três coisas que o plano não previa:

1. **O mecanismo já existia inteiro.** `nivelConfirmado` era aceito desde 02/09; o cliente nunca o enviou e nunca chegou ao `409`, porque parava em `planejar`. O trabalho real não foi ligar o botão — foi decidir **o que oferecer**, e garantir que nenhuma opção oferecida leve a outra recusa. É o que `testes/saidas.test.ts` prova.
2. **O texto tinha duas cópias.** As recusas eram redigidas no servidor (`501`/`503`) e no cliente (`motivoNaoExecutavel()`), já divergindo; qual delas a pessoa lia dependia do caminho. Unificar no servidor não estava na lista da Fase 0 e virou pré-requisito dela.
3. **A narração tinha que vir junto.** O plano tratava o botão e a narração como itens separados. Não são: o caminho vivo é o botão "Pesquisar" do card da tarefa, cujo único retorno era um toast — e toast não segura botão. A entrada no assistente é onde as saídas cabem, então `IA-CONV-NARRA` deixou de ser um extra da Fase 0 e passou a ser o que a sustenta.

### Fase 1 — Investigação em etapas *(1–2 semanas)*

> **Partida em 1a e 1b** por decisão do Ricardo, 14/09/2026.
> **1a ✅ CONSTRUÍDA em 14/09/2026** — planejador, contexto interno, SSE, plano e estimativa visíveis, medição em duas etapas.
> **1b ✅ CONSTRUÍDA em 14/09/2026** — persistência da investigação · preço da busca encadeada e reserva realista (`DIN-009`) · `web_fetch` por página · fonte por afirmação.
>
> **A Fase 1 está completa.** A fonte por afirmação saiu **sem** a terceira chamada de modelo que este plano previa: as citações do provedor já vêm presas ao bloco que sustentam, e bastou parar de descartar essa estrutura. Economia de ~R$ 0,36 por investigação, e mais confiável — uma re-atribuição por leitura seria palpite sobre a primeira.

O núcleo do plano. Nova rota `POST /pesquisa/sessoes/:id/investigar` com streaming.

- **Planejar:** modelo barato (Haiku) lê a **ficha da empresa, a verdade validada, o material de consulta do projeto e as entidades já conhecidas** (§3.3) e transforma a tarefa em 3–6 perguntas verificáveis — sem repetir o que a empresa já validou, e usando as hipóteses em andamento para saber o que vale confirmar. Mostra o plano e a estimativa — **o valor total que sai do saldo**, com a comissão dentro e sem desmembrar (`DIN-007`, `BOARD-PESQUISA-018`) — e reserva o teto.
- **Buscar e ler:** `web_search` por pergunta (paralelo), `web_fetch` das melhores páginas, teto de páginas e de tokens por investigação.
- **Sintetizar:** modelo principal produz o JSON de §3.1, com fonte por afirmação a partir do `cited_text` — e com as fontes **internas** citadas como tal, apontando para o quadro de origem. Fonte de material de consulta sai marcada como não validada (`IA-CONHEC-005`), nunca como fato. Contradição entre web e conhecimento interno, e confirmação de hipótese em andamento, viram seções próprias.
- **Narrar** por SSE **dentro do assistente** (§3.4): cada etapa concluída vira uma linha na entrada que a Fase 0 criou — o que a empresa já sabia, quantas perguntas, quantas buscas saíram, quantas páginas foram lidas, e o que a síntese produziu. Passo emitido depois de acontecer, nunca antes; sem barra de progresso. Reconecta e remonta do `passos[]` depois de um F5.
- **Medição** completa na razão, incluindo o preço da busca encadeada (US$ 0,01) que hoje fica gravado sem virar dinheiro.

**Entrega:** o "Pesquisar" devolve uma análise de várias fontes, com trecho por afirmação, em ~30–60 s, por ~R$ 1,25. **Regras novas:** fonte por afirmação; plano e custo visíveis antes; teto por investigação com o que acontece ao atingi-lo (pendência antiga, resolvida).

### Fase 2 — Curadoria antes de salvar *(1 semana)* — ✅ **COMPLETA em 14/09/2026**

> ✅ **parte 1 — o rascunho:** nada vira quadro sozinho, cada afirmação ao lado da fonte e do trecho, sem-fonte desligada, descartar preserva o histórico.
> ✅ **parte 2 — o portão do gasto:** o stream de `investigar` termina no plano e a busca é uma segunda chamada, que só sai com um clique. `BOARD-PESQUISA-018` deixou de ser parcial. Regras `037` a `041`; prova em `ferramentas/provar-fase2b.mjs` (26 conferências).
> ✅ **parte 3 — o rascunho gravado:** o contrato de §3.1 guardado inteiro, com `removida_pelo_usuario`. A decisão de quem leu sobrevive a fechar a aba, e o resultado recuperado nasce igual ao ao vivo — com as fontes no quadro certo. Regras `042` a `046`; prova em `ferramentas/provar-fase2c.mjs` (29 conferências).

O que o pedido chama de "opção de deletar o conteúdo que não quer salvar".

- Painel **"Rascunho da pesquisa"** no lugar de gravar direto: seções e afirmações com o trecho de origem à vista.
- Apagar afirmação, seção ou fonte. Apagar uma fonte marca as afirmações que só ela sustentava.
- Afirmações `sem_fonte` chegam desligadas; ligar é decisão explícita.
- **Salvar** gera os quadros com link por afirmação; o descartado fica na sessão como procedência, não no quadro.

**Entrega:** quem usa escolhe o que entra no quadro; o quadro nasce limpo. **Regra nova:** *o resultado só vira quadro por decisão explícita da pessoa.*

### Fase 3 — O caderno da investigação *(2 semanas)* — ✅ **COMPLETA em 14/09/2026**

> ✅ **3a — perguntar ao caderno:** a investigação deixou de ser um resultado que se lê uma vez. Depois de entregue ela oferece "Perguntar sobre estas fontes", e a pergunta é respondida **só com o que aquela busca coletou** — sem busca nova, sem `tools` na chamada. Regras `BOARD-PESQUISA-047` a `052` e `IA-CONV-CADERNO`; prova em `ferramentas/provar-fase3a.mjs` (25 conferências).
> ✅ **3b — o caderno visível:** "Ver as fontes" mostra cada fonte com o trecho e as afirmações que dependem dela — inclusive as que a pessoa tirou do quadro, riscadas, porque são elas que explicam por que aquela página foi paga. **Sem rota nova:** a tela se monta com o que o cliente já recebe. Só leitura, de propósito. Regras `BOARD-PESQUISA-053` a `056`; prova em `ferramentas/provar-fase3b.mjs` (23 conferências).
> ✅ **3c, parte 1 — o relatório:** Markdown com a investigação inteira, incluindo **o que não foi mantido** e o **custo**. Montado no clique, no navegador, sem rota nova. Regras `BOARD-PESQUISA-057` a `060`; prova em `ferramentas/provar-fase3c.mjs` (24 conferências).
> ✅ **3c, parte 2 — as lacunas:** a investigação diz o que **não** respondeu, nomeando as partes sem afirmação com fonte, na narração e no relatório. Derivada, sem chamada de modelo. Regras `BOARD-PESQUISA-063` a `066`; prova em `ferramentas/provar-lacunas.mjs` (16 conferências).
> ✅ **o ciclo de volta — CONFERIDO, já funcionava.** `blocosDaIdeia` lê todo quadro de toda tarefa da idéia, inclusive os que a investigação criou; finalizar dispara `segmentarIdeiaEmSegundoPlano` (`IDEIA-MOV-018`); os `recortes_taxonomia` são exatamente o que o contexto interno lê como verdade validada na investigação seguinte. Nada a construir — e conferir evitou construir por cima de um caminho pronto.
> ⬜ **criar tarefa a partir de uma lacuna**, ligando com `ATV-GERAR`: hoje a lacuna é dita, não vira tarefa. É trabalho no módulo de atividades, não neste.
>
> **Decidido pelo Ricardo em 14/09/2026:** o recorte da pergunta é **só esta investigação** (não as outras buscas da tarefa, não o conhecimento interno); e ela **não passa pelo portão** — custo dito depois, com o teto de R$ 3 valendo por cima.

O que o NotebookLM faz de melhor, aplicado à sessão que já existe.

- ~~**Fontes como objetos** da investigação~~ ✅ **feito em 14/09/2026 (3b)**, para as fontes da web. As **internas** ficam para quando a investigação passar a citá-las como fonte — hoje o conhecimento interno entra no contexto do planejador, não na lista de fontes do resultado.
- **Sobre a empresa alimenta a investigação, e a investigação alimenta Sobre a empresa:** o que for salvo no quadro e depois finalizado entra nas pastas pelo caminho que já existe (`IDEIA-MOV-018`), fechando o ciclo.
- ~~**Perguntar ao caderno, na mesma thread**~~ ✅ **feito em 14/09/2026.** E a previsão do plano se confirmou: a narração já ter posto a investigação dentro do assistente fez a pergunta de acompanhamento não precisar de superfície nova. O que o plano **não** previa: que o compositor passaria a ter dois destinos, e que isso exigiria um modo visível em vez de um roteador — as duas perguntas são indistinguíveis pelo texto.
- ~~**Relatório** exportável da investigação~~ ✅ **feito em 14/09/2026.** E o plano tinha razão: "agora com material para preencher" era exatamente o ponto — as perguntas, os achados com fonte, o que foi descartado e o custo só existem como dado depois das Fases 1 e 2.
- 🔶 **Próximo passo sugerido** a partir das lacunas — as lacunas **existem** desde 14/09/2026 e são ditas; o que falta é virarem tarefa pelo orquestrador (`ATV-GERAR`). Elas saem de contagem sobre a estrutura, não de heurística nem de modelo.

**Entrega:** a investigação vira um lugar para voltar, não um resultado que se lê uma vez.

### Fase 4 — Qualidade e custo *(contínua)* — 🔶 **a régua construída em 14/09/2026**

> ✅ **a avaliação por corpus** — feita PRIMEIRO, de propósito: todos os outros itens desta fase são apostas sobre qualidade, e sem régua "melhorou?" é opinião de quem mexeu. `api/corpus/planejador.ts` (casos + régua pura), `testes/corpus-planejador.test.ts` (que mede a régua) e `npm run avaliar-planejador` (chamadas reais). Sem modelo juiz. Regras `BOARD-PESQUISA-067` a `069`.
>
> **Como usar:** rode antes de mexer, guarde o número, mexa, rode de novo. Se o número não melhorou, a mudança não melhorou — por melhor que o raciocínio pareça.
>
> **Primeira rodada real, 15/09/2026 — 5 de 5, R$ 0,07.** `loggi-fidelidade` passar é a primeira evidência de que o conserto do planejador de 14/09 segura contra o modelo de verdade, e não só contra plano fabricado. **E a rodada achou um defeito que ela mesma não estava olhando:** um plano com duas perguntas para a mesma coisa passou em todos os critérios. Ver `BOARD-PESQUISA-070`/`071`.

- **Domínios:** listas por tipo de pergunta (fontes BR para mercado local; bloqueio de conteúdo gerado por IA e agregadores de baixa qualidade).
- 🔶 **Filtragem** de resultados antes do contexto: ✅ **preparada em 15/09/2026**, ⬜ **não ligada**. A documentação confirmou três coisas que o plano supunha sem saber: a filtragem existe de `web_search_20260209` em diante, **não cobra** pela execução de código que a realiza, e **preserva as citações** (`url`, título e `cited_text`), então a fonte por afirmação sobrevive. Com isso o item virou outro: garantir que ligar não quebre nada. Ligar é `PESQUISA_BUSCA_VERSAO=web_search_20260209`. Regras `BOARD-PESQUISA-075`/`076`.
- **Cache de página lida** dentro da sessão: a mesma URL não é buscada duas vezes na mesma investigação.
- 🔶 **Modelos por etapa:** ✅ **separados em 15/09/2026** (`IA_MODELO_BUSCA`), ⬜ **a troca ainda não foi feita**. E a descoberta que motivou: os dois liam a mesma variável, então a síntese rodava em **Haiku** — o contrário do que esta linha sempre disse. É por isso que o custo real (~R$ 0,69) era metade da estimativa de §5 (~R$ 1,25): aquela tabela foi calculada com Sonnet sintetizando. Trocar é `IA_MODELO_BUSCA=claude-sonnet-4-5-...` e quase dobra a investigação. Regras `BOARD-PESQUISA-072` a `074`.
- ~~**Avaliação por corpus** de qualidade~~ ✅ **feita em 14/09/2026**, e antes dos outros itens. Uma correção ao que este plano dizia: a rubrica **não** julga a resposta por modelo. Mede o **planejador**, por contagem e comparação de texto, e imprime o que exige julgamento humano. Julgar resposta com modelo juiz fica para quando houver motivo — e uma régua para o juiz.
- ✅ **Tarefa já investigada não gasta de novo em silêncio** *(construído em 15/09/2026, fora do plano)*. Não estava nesta lista: veio do dado real, onde a mesma tarefa aparece investigada **duas vezes** na mesma sessão, R$ 0,67. A rota recusa antes de abrir o fluxo, com duas saídas e o preço de cada uma — ver o que existe é de graça, refazer é explícito. É a economia mais barata da Fase 4: não custou qualidade nenhuma. Regras `BOARD-PESQUISA-077` a `079`; prova em `ferramentas/provar-ja-investigada.mjs` (17 conferências).
- **Places API** para o nível `lugares` (Fase 2 do plano anterior, inalterada).

### Fase 5 — Condicional: profundidade com risco *(só com decisão explícita)*

- **Navegação dirigida** via MCP de browser para sites cujos termos permitem — nunca LinkedIn/Instagram sem decisão de negócio registrada (PES-005 continua).
- **Conectores MCP** do próprio usuário (planilhas, CRM, documentos) como fontes do caderno.
- **Skills por tipo de pesquisa** (concorrentes, mercado, personas, benchmark): cada uma com plano-modelo, domínios e rubrica próprios — e, por `regra_de_negocio.skill` "Skill não é regra", cada uma com a regra correspondente.

---

## 5. Custo, por investigação (ordem de grandeza)

Estimativa para a Fase 1, com os preços de tabela de 13/09/2026 e câmbio de 5,40. **É estimativa para dimensionar, não preço**: o número real vem da razão (PES-003).

| Etapa | Consumo | USD |
|---|---|---|
| Contexto interno (ficha + recortes selecionados) | ~3 k tokens de entrada | ~0,01 |
| Planejar (Haiku) | ~1,5 k tokens | ~0,002 |
| 5 buscas | 5 × US$ 0,01 | 0,05 |
| Ler 8 páginas (Sonnet, ~2,5 k tokens cada) | ~20 k tokens de entrada | ~0,06 |

> **Correção de 14/09/2026, medida.** Esta tabela supõe acúmulo **linear** de entrada. Não é: numa chamada com ferramenta o contexto inteiro é reenviado a cada rodada, então a entrada cresce com o **quadrado** do número de usos. Medido numa investigação real: 4 buscas, **31.196** tokens de entrada — contra os ~10 k que a conta linear previa. O modelo de reserva em `precos.ts` usa a conta quadrática; esta tabela fica como está, com o aviso, porque ela é o raciocínio que dimensionou o plano.
| Sintetizar (Sonnet) | ~6 k entrada + 3 k saída | ~0,06 |
| **Total** | | **~0,18 → ~R$ 1,25 com câmbio e comissão de 30 %** |

Hoje uma consulta custa ~US$ 0,05 e devolve um parágrafo. A investigação custa três a quatro vezes mais e devolve uma análise de várias fontes com trecho por afirmação — e o custo aparece **antes**, para quem decide.

**A tabela acima é conta interna, não tela.** Ela existe para dimensionar: as linhas por etapa, o USD e a separação entre custo e comissão são nossos. O que a pessoa vê antes de disparar é **um número** — o total já com a comissão dentro, na moeda dela. Isto foi conferido em 13/09/2026 e virou regra: `DIN-007` em `creditos-pagamentos-regras.md`, mais `BOARD-PESQUISA-018`. Vale registrar que o comportamento **já estava certo** em todo o consumo existente (o extrato mostra `creditos_lancamentos.valor_micros`, que é o total; as colunas `custo_micros`/`comissao_micros` de `consumos_*` não saem em rota nenhuma) — o que faltava era a regra, porque o modelo de dados convida ao contrário e a primeira tela de "detalhe do consumo" exporia a margem sem ninguém decidir isso.

O teto padrão por investigação é decisão de produto (§7). Sugestão: R$ 3, com aviso ao atingir e "continuar" explícito.

---

## 6. Riscos e como cada um é contido

| Risco | Contenção |
|---|---|
| **Deriva** — a investigação encadeia buscas sem fim (a lição do Manus) | Teto de buscas, páginas e tokens **por investigação**, reservado antes; o planejador fixa as perguntas antes de qualquer gasto |
| **Exfiltração** — `web_fetch` lê conteúdo não confiável junto com contexto sensível, e agora esse contexto inclui o conhecimento interno da empresa (§3.3) | Só URLs vindas da busca; contexto interno vai no `system`, conteúdo lido vai como resultado de ferramenta — nunca no mesmo bloco; listas de domínio; `max_uses` |
| **Base interna grande** afoga a pergunta ou custa caro | Seleção por categoria da taxonomia com teto de ~3 k tokens; nunca a base inteira |
| **Sites com JavaScript** — `web_fetch` não renderiza | O `cited_text` da busca ainda vale; página ilegível é marcada, não inventada |
| **Alucinação de fonte** — afirmação apontando para trecho que não a sustenta | Síntese só pode citar `fonte_id` da lista; validação server-side de que o trecho existe na fonte; `sem_fonte` visível |
| **Custo escapar da razão** (o defeito de 13/09) | Toda etapa passa por `reservar`/`consumir`; teste de integração cobre "nada foi cobrado sem chamada" |
| **Narração virar contexto** — as linhas de progresso entrarem no histórico que vai ao modelo (`IA-CONV-004`), pagando tokens e confundindo quem disse o quê | Entrada de tipo próprio na thread, fora da conversa por construção (§3.4); teste que envia uma pergunta depois de uma investigação e confere que nenhum passo foi ao contexto |
| **Narração prometer o que não aconteceu** — "encontrei 12 concorrentes" enquanto ainda busca | Passo emitido só depois de concluído; sem percentual nem barra; o vocabulário da narração é fechado e vem do servidor, não do modelo |
| **Regressão de roteamento** | Corpus no CI; qualquer mudança na heurística é medida antes de subir |

---

## 7. Decisões que são do Ricardo

| # | Decisão | Opções | Sugestão |
|---|---|---|---|
| D1 | O rascunho (Fase 2) é obrigatório ou opcional? | Sempre passa pelo rascunho / botão "salvar direto" / não existe | **Não existe — revisto pelo Ricardo em 15/09/2026.** Foi "obrigatório" de 14/09 até 15/09. A pesquisa termina e os quadros já nascem no board; nenhuma modal pergunta o que levar. **O que o rascunho garantia, e onde isso foi parar:** apagar continua no próprio board, card a card, onde a pessoa já sabe mexer; a procedência de tudo que foi lido e pago continua em "Ver as fontes" e no relatório, que nunca dependeram dele. **O que mudou de verdade:** afirmação sem fonte chegava DESLIGADA (`BOARD-PESQUISA-035`) e agora entra no quadro marcada como sem fonte — quem tira é a pessoa, depois, e não mais o padrão. `agruparEmSecoes` e `remontar` ficaram no código: uma investigação curada enquanto o rascunho existiu tem `removida_pelo_usuario` gravado, e reabri-la precisa honrar aquela decisão. **Reescrito em 16/09/2026** (`board-lista.md` 1.34.0): `033` revogada com `033a` no lugar, `034` sem efeito, `035` revertida com `035a` (sem decisão gravada, tudo fica), `045` revogada; `043` e `044` viraram "lidas, nunca escritas"; `046` e `049` conferidas e mantidas |
| D2 | Teto padrão por investigação | R$ 2 / R$ 3 / R$ 5 | **R$ 3 — decidido pelo Ricardo em 14/09/2026.** Implementado como `TETO_INVESTIGACAO_MICROS`; o teto da sessão, quando menor, continua valendo por cima |
| D3 | Modelo de síntese | Haiku (hoje, medido) / Sonnet | **Ainda aberta, e a premissa estava errada.** A tabela dizia "Sonnet 4.5 (hoje)"; em 15/09/2026, lendo o `.env`, a síntese estava em **Haiku**. A escolha virou uma linha (`IA_MODELO_BUSCA`), com o padrão igual ao de hoje. Custo medido da troca: ~R$ 0,69 → ~R$ 1,33 por investigação. Medir antes: uma investigação real em cada modelo, sobre a mesma tarefa |
| D4 | Provedor de busca | Anthropic `web_search` / Exa | Anthropic — citações e `web_fetch` integrados; Exa fica como segundo provedor atrás de PES-009 |
| D5 | `conhecimento` como nível | Some / vira "sem fonte" rotulado | **Some.** Toda resposta com fonte |
| D6 | Nome do botão | "Pesquisar" / "Investigar" | **"Pesquisar" — revisto pelo Ricardo em 15/09/2026 e trocado de volta em `board.html`** (rótulo e estado em curso, "Pesquisando..."). A troca de 14/09 para "Investigar" descrevia o mecanismo, não o que a pessoa quer fazer; e o resto deste plano nunca deixou de chamar o botão de "Pesquisar". **Em aberto:** o vocabulário do servidor ("já foi investigada", "Investigar de novo") e os nomes de dado (`pesquisa_investigacoes`) continuam em "investigar" |
| D7 | Quanto do conhecimento interno entra por investigação | Só a categoria da idéia / categoria + vizinhas do domínio / tudo | **Categoria + vizinhas do domínio, teto de 3 mil tokens — decidido em 14/09/2026.** "Concorrentes" puxa também Mercado, Benchmark e Personas. O material de consulta **não disputa** esse teto: deixá-lo cair primeiro tornaria a investigação cega para a hipótese que a motivou |
| D9 | A narração some quando a investigação acaba, ou fica na thread? | Some (só o resultado fica) / fica como entrada permanente com link para o rascunho | **Fica.** É o registro de um gasto e a procedência do quadro que nasceu dali; sumir deixaria a pessoa sem como saber o que aquela investigação custou e leu |
| D10 | A narração pode ser desligada? | Sempre narra / preferência por pessoa | **Sempre narra** na Fase 1. Preferência só se alguém reclamar — botão de desligar feedback é solução para um problema que ainda não existe |
| D8 | A investigação lê material de consulta (não finalizado)? | Só validado / validado + consulta do projeto | **Validado + consulta do projeto** — mesma régua de `IA-CONHEC`; confirmado pelo Ricardo em 13/09 |
| D11 | Onde o valor da investigação aparece | Antes de gastar (portão) + na resposta + no relatório / num lugar só | **Num lugar só — decidido pelo Ricardo em 15/09/2026.** Valor aparece apenas em Configurações → Créditos de uso → Histórico de uso, depois que a busca termina. Saíram: o preço do portão ("Buscar custa até R$ X. O que não for gasto volta para o saldo."), ao vivo e na recuperação; o custo narrado nas respostas do assistente e do caderno (`.msg-custo`); e a linha "Custo desta investigação" do relatório. **O portão FICA** — continua perguntando "Posso buscar?" sobre o plano, e nenhum dinheiro sai sem um gesto (`BOARD-PESQUISA-037`). A reserva no servidor não mudou: o teto continua reservado e a sobra continua voltando. **Reescrito em 16/09/2026.** Regra de dinheiro nova `DIN-013` em `creditos-pagamentos-regras.md` (valor num lugar só) e, em `board-lista.md` 1.35.0: `018` revista (estimativa continua calculada, virou reserva no servidor) com `018a` apontando para `DIN-013`, `051` e `057` sem o custo, `030` já revogada com o portão. Nota: D11 dizia "o portão FICA", e D12 o tirou no mesmo dia |
| D12 | O portão do gasto, depois que o preço saiu | Fica sem o preço / sai — "Pesquisar" busca direto | **Sai — decidido pelo Ricardo em 15/09/2026**, no mesmo dia em que D11 tirou o preço dali. *"Ele já clicou, e já sabemos que ele quer pesquisar."* Sem o número, o portão pedia uma segunda confirmação para o mesmo gesto e não carregava informação nenhuma. **O gesto que autoriza o gasto passou a ser o clique em "Pesquisar".** Saíram os botões "Buscar agora" e "Agora não". **Mudança só no cliente:** o servidor continua gravando `aguardando` e `/buscar` continua sendo uma segunda chamada, então `BOARD-PESQUISA-038`, `040` e `041` seguem valendo. Sobrou uma espera com **um** botão ("Continuar a pesquisa"), em dois casos onde não houve clique hoje: a aba morreu entre planejar e buscar, e o saldo faltou na confirmação (`041`). O cliente só segue sozinho no stream que **planeja** — se `/buscar` pedir espera de novo (`039`, preço que subiu), ele para e mostra o botão, porque um laço aqui seria dinheiro saindo em rodadas. **Reescrito em 16/09/2026** (`board-lista.md` 1.33.0): `037` revista com `037a` no lugar (o portão continua no servidor, e por isso `038`, `040` e `041` continuam inteiras), `039` revista pela metade, `030` revogada, novas `086` (só quem planeja confirma sozinho) e `087` (espera sem clique de hoje não busca sozinha) |
| D13 | Onde mora o relatório da investigação | Saída da narração, no assistente / botão no painel da tarefa | **No painel da tarefa — decidido pelo Ricardo em 16/09/2026.** Virou "Download", com a variante `btn--ghost` do sistema de design, logo acima de "Excluir tarefa". A narração é um relato do que aconteceu, e rola; uma ação que a pessoa refaz dias depois não podia morar num histórico que ela precisa procurar. O painel não rola. **Nasce `hidden`** e aparece quando existe investigação entregue na tarefa — inclusive ao recarregar a página, sem esperar por "Trazer o resultado", porque a investigação já foi paga e o relatório dela já existe. Investigação inteiramente descartada não conta: o arquivo sairia sem achados. `js/pesquisa.js` publica `PesquisaPainel.baixarRelatorio()`/`temRelatorio()` e o evento `pesquisa:relatorio`; `board.html` desenha. **Reescrito em 16/09/2026** (`board-lista.md` 1.36.0): nova `057a` — "Download" mora no painel da tarefa, `ghost`, acima de "Excluir tarefa" |
| D14 | Abrir a tarefa remonta a investigação anterior no assistente? | Sempre (Fase 1b) / nunca / só quando ela ficou pelo caminho | **Só quando ficou pelo caminho — decidido pelo Ricardo em 16/09/2026.** A entrada "Investigação anterior", com os passos e "Trazer o resultado para o quadro", fazia sentido quando o resultado só virava quadro por um gesto: ela era a ponte. Com o rascunho fora (D1), a pesquisa já grava os quadros no board — então abrir a tarefa passou a mostrar um resumo do que já estava na tela, com um botão que só duplicaria. **Continua aparecendo** para `correndo` (busca que o servidor terminou enquanto a aba estava fechada — o defeito que a Fase 1b existe para consertar) e `aguardando` (busca paga parada antes da web). **E continua a pedido:** "Ver a resposta que já existe" (`BOARD-PESQUISA-077`) remonta tudo, agora por `PesquisaPainel.verInvestigacaoAnterior()`. O relatório é publicado na carga de qualquer jeito, então o botão "Download" do painel não depende disto. **Em aberto:** "Ver as fontes" e "Perguntar sobre estas fontes" só existem depois de `entregarResultado`, então ao reabrir a tarefa elas não têm porta própria — merecem o mesmo tratamento que o Download recebeu em D13 |

---

## 7.9 A dívida de documentação das decisões D1 e D11 a D14 — fechada em 16/09/2026

As seis decisões tomadas ao vivo entre 15 e 16/09/2026 contradiziam cerca de vinte regras já escritas. A dívida foi paga em quatro etapas, uma por assunto, e o critério em todas foi o mesmo: **regra que descrevia a pergunta que saiu é revogada; regra que descrevia a garantia por baixo dela fica, e ganha uma linha dizendo em voz alta por que ficou.** Foi essa distinção que evitou o erro mais provável — apagar `BOARD-PESQUISA-038`, `040` e `041` junto com o portão, quando nenhuma delas falava do portão: elas falam do que o servidor faz com a espera que continua gravando.

| Etapa | Assunto | Onde | Resultado |
|---|---|---|---|
| 2a | O portão do gasto (D12) | `board-lista.md` 1.33.0 | `037` revista, `037a` nova, `030` revogada, `039` revista pela metade, `086` e `087` novas, decisão A35 |
| 2b | A curadoria obrigatória (D1) | `board-lista.md` 1.34.0 | `033` revogada, `033a` nova, `034` sem efeito, `035` revertida, `035a` nova, `045` revogada, `043`/`044` "lidas, nunca escritas", decisão A36 |
| 2c | Onde o valor aparece (D11) | `DIN-013` nova + `board-lista.md` 1.35.0 | `018` revista, `018a` nova, `051` e `057` sem custo, decisão A37 |
| 2d | Gravação, narração e o Download (D13, D14) | `board-lista.md` 1.36.0 + `ia-assistente-conversa.md` 1.8.0 | `BOARD-SALVA-007`, `BOARD-LEITURA-007`, `024a`, `057a`, `IA-CONV-NARRA-002` revista, `009` e `010` novas, decisão A38 |

Fora da lista original, mas do mesmo lote: `ideias-criacao.md` 1.2.0 e `ia-assistente-conhecimento.md` 1.5.0, pela duplicidade de idéias — o alerta estava calibrado de forma a nunca disparar (zero alertas em 11.476 pares reais) e a porta da IA gravava sem checar.

**Continua em aberto, e não foi tocado aqui:** "Ver as fontes" e "Perguntar sobre estas fontes" só existem depois de `entregarResultado`, então ao reabrir a tarefa não têm porta própria — merecem o mesmo tratamento que o Download recebeu em D13.

---

## 8. O que muda na documentação

- `board-lista.md` §1.8: `BOARD-PESQUISA-012` (sem beco sem saída) na Fase 0; regras de plano visível, fonte por afirmação, curadoria e teto nas Fases 1–2.
- `creditos-pagamentos-regras.md`: preço da busca encadeada entra na tabela; "Consumidores não medidos" fecha. ~~E a visibilidade da comissão~~ **feito (13/09)**: `DIN-007` — usuário vê o total, a separação custo/comissão é interna, com a conferência das cinco camadas registrada.
- `planejamento-pesquisa-concorrentes.md`: §12.3 resolvida (D5); §8 "retenção" e "teto por sessão" resolvidas na Fase 1.
- ~~`empresas/sobre-empresa.md`~~ **feito (1.1.0, 13/09)**: `SOBRE-ORIGEM-001` a `004` — a página deixa de ser só destino do conhecimento e vira também origem da investigação. Inclui a consequência que faltava: idéia finalizada incompleta (`SOBRE-FALTA`) passa a custar qualidade de pesquisa, não só aparência de tela.
- ~~`ia/ia-assistente-conhecimento.md`~~ **feito (1.4.0, 13/09)**: `IA-CONHEC-009` — a régua vale para toda leitura de conhecimento interno por IA, não só para o painel; `IA-CONHEC-010` — o alcance é da superfície, a régua não. `IA-GERAL-004` ganhou escopo explícito e `IA-GERAL-005` registra que a investigação vai à web por desenho, com fonte e sem igualar web a verdade validada.
- ~~`atividades/board-lista.md` §1.8~~ **feito (1.7.0, 13/09)**: `BOARD-PESQUISA-013` a `015` — contexto interno, as duas categorias e os dois recortes.
- `ia/ia-assistente-conversa.md`: `IA-CONV-NARRA` — a narração como entrada de tipo próprio na thread, fora do contexto do modelo, com persistência própria (§3.4).
- `atividades/board-lista.md` §1.8: `BOARD-PESQUISA-016/017` — o feedback da investigação mora no assistente, e cada passo é fato consumado.
- Skill nova por tipo de pesquisa (Fase 5) só entra com regra correspondente.

---

## 8.3 O que a Fase 3 ensinou (3a e 3b)
1. **"Instrução não é garantia" apareceu pela terceira vez.** O plano descrevia o caderno como "responder só com as fontes já coletadas" — comportamento a pedir ao modelo. Pedir é frágil: um modelo que decidisse buscar transformaria uma pergunta de centavos numa busca cara, por fora do portão. A chamada é feita **sem `tools`**: não há como buscar. Antes disso o mesmo padrão já tinha aparecido no piso de perguntas do planejador e na pergunta da tarefa injetada pelo servidor.

2. **Duas perguntas idênticas no texto, com respostas de naturezas opostas.** *"E quantas lojas eles têm?"* serve tanto ao assistente do projeto quanto ao caderno. A tentação era rotear pelo conteúdo; o resultado seria um erro silencioso, com a pessoa sem saber qual dos dois respondeu. O modo visível custa mais tela e é a única forma honesta.

3. **A curadoria mudou o que o caderno pode ler, e isso não estava no plano.** Depois da Fase 2, devolver a resposta original ao modelo contrabandearia de volta exatamente o que a pessoa tinha apagado. As fontes ficam (documento lido e pago); o texto é o que sobreviveu. Uma fase mexeu no contrato da seguinte — vale conferir isso sempre que uma fase nova lê algo que uma anterior passou a editar.

---


4. **A tela mais útil da fase não precisou de servidor.** "Ver as fontes" responde *"de onde saiu isso?"* montando-se com `fontes` e `afirmacoes`, que o cliente já recebe — ao vivo e na recuperação. O reflexo era criar um endpoint; ele seria uma segunda maneira de perguntar a mesma coisa, e duas maneiras divergem no primeiro ajuste. Vale procurar isso antes de escrever rota: **o dado já está aí?**

5. **O plano previa apagar fonte na tela de fontes, e estava errado.** A curadoria já tem um dono (o rascunho, no momento em que o quadro nasce). Um segundo lugar para desfazê-la criaria dois donos da mesma decisão — e deixaria órfãs afirmações já no quadro, que aquela tela não tem como consertar. Item de plano que vira dois donos de um fato é item para recortar, não para construir.
## 8.6 O que a Fase 4 ensinou até agora

1. **Ler o `.env` valeu mais do que uma semana de raciocínio sobre custo.** O plano dizia, em duas seções, que a síntese rodava em Sonnet. Rodava em Haiku, e por isso a conta real era metade da estimativa. Nenhuma leitura do código de custo teria mostrado isso — a informação estava na configuração, não na lógica. **Antes de otimizar, leia o que está configurado.**

2. **A escolha que custa dinheiro do usuário não é do código.** Dava para trocar para Sonnet e defender com bons argumentos. Em vez disso, o código passou a permitir a troca com o padrão de hoje. Quem paga decide; o trabalho do código é tornar a decisão barata e reversível.

3. **Toda variável nova de configuração é uma porta.** `IA_MODELO_BUSCA` abriu duas: em branco virando modelo vazio, e modelo fora da tabela virando busca de graça. A segunda já existia — a variável nova só a tornou fácil de alcançar. Vale perguntar, a cada opção nova: *o que acontece se alguém errar a digitação disto?*

4. **O dado real encontrou um defeito que nenhuma fase tinha previsto.** Lendo a investigação gravada apareceu a MESMA tarefa investigada duas vezes na mesma sessão — R$ 0,67 — sem que nada no caminho perguntasse se já havia resposta. A recuperação ao abrir a página mostrava a anterior, mas quem clica no botão não passa por ela, e o botão é o caminho vivo. Nenhuma régua, nenhum teste e nenhum plano acharia isso: só olhar o que de fato aconteceu. `BOARD-PESQUISA-077` a `079`.

5. **A primeira investigação real achou, em um clique, o que 237 conferências em jsdom não podiam achar.** O navegador recusou a chamada por CORS: as rotas de stream usam `hijack()`, que tira o Fastify do caminho e leva o `@fastify/cors` junto. Nenhum stub de `fetch` tem política de mesma origem — então **nenhuma prova em jsdom podia falhar por isso, nunca**. Não é que as provas estivessem fracas; é que a classe do defeito estava fora do alcance delas por construção. `BOARD-PESQUISA-080` a `082`. A conta do dia: quatro defeitos achados pelo dado real, zero previstos por raciocínio.

6. **Fixture inventada é fixture limpa.** Os blocos que eu escrevia nas provas eram frases inteiras, bem pontuadas, com título no lugar certo. O provedor de verdade devolve blocos que começam em `.` e que engolem a seção seguinte, porque um bloco sem citação é *o resto entre duas citações* e não uma unidade de sentido. Nenhuma prova podia falhar num formato que ela mesma produzia. Os testes novos usam o texto real da investigação de 15/09 — e é assim que os próximos devem nascer. `BOARD-PESQUISA-083` a `085`.

7. **Uma decisão silenciosa é pior que uma decisão errada.** A seção *"O que faltou"* foi descartada porque veio grudada num fragmento que ninguém queria manter. A pessoa não escolheu perder o parágrafo mais valioso da resposta; ela escolheu descartar meia frase, e o produto interpretou como as duas coisas. Sempre que uma decisão de uma pessoa recai sobre mais de uma coisa, vale perguntar se ela sabe o que está decidindo.

---

## 8.5 O que a primeira rodada da régua ensinou

1. **O que a régua não olha não existe.** Cinco de cinco passaram com uma duplicata visível na tela — duas perguntas para a mesma coisa, uma busca paga a mais. Uma régua dá a falsa sensação de cobertura justamente nos critérios que ela não tem; o antídoto é **ler a saída**, não só o placar. O runner imprime os planos por isso, e é por isso que ele termina dizendo o que não mede.

2. **Uma garantia pode criar o defeito que ela não previu.** `comPerguntaDaTarefa` existe para corrigir deriva. Numa tarefa composta com metade já validada, o modelo **acertou** — perguntou só o que faltava — e a garantia reinjetou a tarefa inteira por cima. Toda garantia que INSERE algo precisa perguntar se o que ela insere já está lá, e a resposta a essa pergunta é mais sutil do que "é a mesma string".

3. **Comparação assimétrica engana em uma das direções.** `ehAMesmaPergunta(a, b)` divide pelas palavras de `a`. Chamá-la com o texto longo na frente quase nunca bate. Onde uma função assimétrica é usada como se fosse simétrica, o defeito aparece só metade das vezes — e some quando se procura.

4. **Diagnóstico que existe no dado e não aparece na ferramenta custa caro.** O `porque` de cada pergunta já dizia quem a escreveu; o runner não imprimia. Descobrir isso exigiu calcular à mão o que a ferramenta podia ter mostrado.

---

## 8.4 O que a Fase 3c ensinou

1. **Conferir antes de construir pagou na primeira tentativa.** O "ciclo de volta" estava no plano como item a fazer. Ele já funcionava inteiro — `blocosDaIdeia` + `IDEIA-MOV-018` + `recortes_taxonomia`. Construí-lo teria criado um segundo caminho para o mesmo fato. A regra que fica: **item de plano que diz "ligar A em B" merece uma leitura do código antes de uma linha de código.**

2. **A terceira posição perdida do mesmo dia.** `BOARD-PESQUISA-031` (fontes empilhadas no primeiro quadro), `remontar` (fontes escorregando depois de apagar uma afirmação) e agora o `inicio` que não viajava na lista do rascunho. As três têm a mesma forma: **um dado derivado do texto original sendo lido contra um texto diferente**, e as três erram em silêncio, com números plausíveis. Vale procurar essa forma em qualquer lugar onde uma lista sobrevive a uma transformação do texto.

3. **A primeira redação das lacunas resumia os dois motivos numa contagem no fim** — e quando as lacunas eram todas do mesmo tipo, o motivo sumia. O motivo foi para cada linha. "Sem fonte" e "sem nada" pedem ações diferentes de quem lê; uma contagem que os junta economiza uma linha e apaga a diferença.

---

## 8.2 O que a Fase 2 ensinou

1. **Adiar persistência de formato que ainda vai mudar é economia real — desde que o adiamento esteja escrito e tenha prazo.** De manhã, `BOARD-PESQUISA-032` registrou a decisão de **não** gravar as afirmações ainda, porque o contrato de §3.1 tinha um campo (`removida_pelo_usuario`) que só a Fase 2 definiria. À tarde, com a forma do rascunho provada em uso, o contrato foi guardado inteiro numa migração só. O que tornou isso economia e não procrastinação foi o prazo escrito: *"quando a Fase 2 desenhar o rascunho"*.

2. **O portão e o rascunho perguntam coisas diferentes, e foi tentador confundi-los.** O rascunho já era uma decisão explícita da pessoa; tratá-lo como o portão do gasto teria sido barato e teria parecido suficiente. Mas no rascunho o dinheiro **já saiu** — decidir ali é escolher o que fazer com o que se pagou, não se paga. Duas perguntas, duas portas: *"posso gastar?"* antes, *"o que fica?"* depois.

3. **Um portão preso à conexão não é um portão.** A primeira forma óbvia era segurar o stream aberto esperando o clique. SSE é de mão única, então a confirmação teria de chegar por outro caminho de qualquer jeito — e enquanto isso um proxy, um laptop que dorme ou um restart do servidor mataria um planejamento **já pago**. Gravar o estado `aguardando` custou uma migração e comprou uma coisa que a conexão não dava: a confirmação sobrevive a fechar a aba.

4. **Onde o número fica na tela muda o que ele é.** O preço saía como mais um passo da narração, no meio da lista do que o assistente estava fazendo — e ali ele era informação, mesmo quando virou portão. Colado no botão, com peso de texto, virou decisão. A mesma lógica desfez o empate visual entre "Buscar agora" e "Agora não": duas ações com o mesmo peso deixam a escolha sem recomendação, e a recomendação é que ninguém gaste por inércia.

5. **O índice de array não sobrevive a ser gravado.** Ao vivo, `fonteIds: [0, 1]` funciona porque as duas pontas leem o mesmo objeto. Gravado, é referência que não referencia nada — e o erro seria silencioso, no lugar exato onde o produto não pode errar em silêncio: a procedência. Virou chave estrangeira; a API continua devolvendo índice, calculado contra a lista que ela mesma entrega.

6. **"Instrução não é garantia" apareceu pela QUARTA vez, e desta vez custou dinheiro de verdade.** A regra 5 do prompt do planejador já dizia que a ficha da empresa nunca substitui a tarefa. Ela vale quando existe uma tarefa para não ser substituída — com o campo em branco, o modelo preencheu o vazio com o contexto e cobrou por isso. O padrão agora tem forma: **sempre que uma regra do prompt depender de o texto de entrada existir e fazer sentido, ela precisa de uma guarda de código antes da chamada.**

7. **O relatório precisou de uma palavra mais precisa, não de mais código.** A seção do que saiu ia se chamar "Descartado por quem leu" — e estava errada: afirmação sem fonte chega **desligada**, ninguém a tirou. Num documento feito para auditar, atribuir à pessoa um ato que ela não praticou é pior do que impreciso. Virou "Apareceu e não foi mantido". Foi o teste que pegou: ele contou duas onde eu esperava uma.

8. **Prova velha que ainda passa esconde caminho morto.** `provar-fase0.mjs` continuava verde simulando a rota de dois passos que a Fase 1a aposentou — provava um caminho que o produto não percorre mais. Só apareceu quando o portão mexeu no stream. Lição: quando uma fase troca o caminho, as provas das fases anteriores precisam ser reapontadas para o caminho novo, e não só mantidas verdes.

---

## 8.1 O que a Fase 1a ensinou

Três coisas que o plano não previa, registradas para a 1b não repetir:

1. **O contexto interno não pode ser uma fila só.** A primeira versão fazia verdade validada e material de consulta disputarem os mesmos 3 mil tokens. Numa empresa com muito conhecimento finalizado, a hipótese em andamento — que é a pergunta que a investigação existe para responder — seria a primeira a cair. Agora o material de consulta entra fora do teto, e tem teste para isso.

2. **Texto de produto em dois lugares é dívida garantida.** As recusas eram redigidas no servidor e no cliente, e já divergiam. Isso apareceu de novo na 1a: o cliente tinha um texto próprio para o `402` que engolia o do servidor — e agora que a investigação gasta em duas etapas, saber se faltou crédito para *planejar* ou para *buscar* muda o que a pessoa faz a seguir. Regra que vale para a 1b: quem redige é o servidor.

3. **Ler SSE tem um erro clássico e ele não aparece em teste ingênuo.** Um `read()` não respeita fronteira de quadro: um evento chega partido em dois pedaços, dois eventos chegam no mesmo. Tratar cada pedaço como um evento funciona na máquina do desenvolvedor e quebra com rede lenta. `provar-fase1a.mjs` corta o stream no meio de um `data:` de propósito.

---

## 9. Por onde começar

~~**Fase 0 esta semana.**~~ ✅ **Feita em 14/09/2026.** Era pequena, tirou o bloqueio que motivou o pedido, e não dependeu de nenhuma decisão de §7 — como previsto.

~~**Fase 1 logo depois**, começando pelo planejador~~ — ✅ **feito em 14/09/2026 (Fase 1a)**. O planejador substituiu o portão, o contexto interno entrou, e a narração ganhou etapas reais.

**Fase 1b, item 1 ✅ feito em 14/09/2026** — e ele era maior do que o plano dizia. Estava escrito como "persistir `passos[]` para a narração sobreviver ao F5", conforto. O que a leitura do código da 1a mostrou é que **o servidor não para quando a aba fecha**: a busca completa, o crédito é consumido, a consulta é gravada — e o quadro, que nasce no navegador, nunca acontece. Fechar a aba no meio custava uma busca e não entregava nada. E o texto da resposta **nem estava guardado**: `pesquisa_consultas` tinha tudo menos a prosa que se pagou para obter.

Entrou: tabela `pesquisa_investigacoes`, coluna `pesquisa_consultas.resposta`, rota `GET .../investigacao`, recuperação ao abrir a página, e o resultado voltando por **gesto explícito** (`BOARD-PESQUISA-024`) em vez de virar quadro sozinho — recriar duplicaria o board de quem já tinha visto.

~~**A seguir:** `web_fetch`, síntese com fonte por afirmação, preço da busca encadeada.~~ ✅ **Tudo feito em 14/09/2026.**

~~**A seguir, Fase 2 — curadoria antes de salvar.**~~ ✅ **Feita em 14/09/2026, em duas partes.** O rascunho (parte 1) e o portão do gasto (parte 2). D1 decidida: rascunho obrigatório por enquanto.

~~**Falta da Fase 2:** persistir o rascunho.~~ ✅ **Feito em 14/09/2026.** Ficou por último de propósito, e a espera se pagou: uma migração em vez de duas (`BOARD-PESQUISA-032` → `042`).

~~**A seguir: Fase 3 — o caderno da investigação.**~~ 🔶 **3a feita em 14/09/2026**; o recorte foi decidido (só esta investigação) e o custo também (sem portão).

**A primeira volta de verdade já pagou (14/09/2026), e nem chegou a testar o que eu queria testar.** O raio-x mostrou uma investigação **anterior** ao portão (sem `pergunta_busca` nem `estimativa_micros` gravados) — ou seja, o servidor da API ainda rodava o código antigo. Mesmo assim ela achou o defeito mais caro até agora: uma tarefa cuja descrição era `"Responda aqui..."` — o convite que o próprio produto escreve nos post-its — virou **duas** investigações pagas, R$ 0,67, com o planejador inventando cinco perguntas a partir da ficha da empresa. Consertado por `tarefaSemConteudo` (`BOARD-PESQUISA-061`/`062`), guarda pura e testada antes de qualquer reserva. **A volta de verdade continua pendente**, agora com o servidor reiniciado.

**A volta de verdade aconteceu em 15/09/2026 — e pagou no primeiro clique.** Desde a investigação da Loggi tinham entrado o portão, a busca como segunda rota, as afirmações gravadas, a curadoria, o caderno, a tela de fontes, o relatório e as lacunas: tudo provado em jsdom, **nada** tendo tocado um navegador. A primeira chamada de verdade parou no CORS — as rotas de stream usam `hijack()`, que tira o Fastify do caminho e leva o `@fastify/cors` junto (`BOARD-PESQUISA-080` a `082`). Era um defeito **fora do alcance** das 237 conferências por construção, não por descuido delas: stub de `fetch` não tem política de mesma origem. Duas pendências tiveram de cair antes para a volta ser possível: a chave de cobrança que a pesquisa ignorava (`DIN-010`, senão investigar em dev debitaria saldo real) e o `preteste`, que derrubava a suíte inteira por causa do banco de teste.

**Duas pendências fechadas em 15/09/2026, e as duas atrapalhavam justamente a volta de verdade.** (1) `CREDITOS_COBRAR="nao"` não era respeitado pelas rotas de pesquisa: investigar em desenvolvimento debitava ~R$ 0,69 de saldo real, porque a chave dependia de cada rota lembrar de perguntar e as de pesquisa nasceram depois. Ela passou a morar dentro de `reservar`/`liberar`/`consumir`, que são o único caminho até a razão — `DIN-010` a `012`. A medição continua ligada: o que para é o débito, não a conta. (2) `npm run teste` morria no `preteste`, que tentava migrar o banco de teste e saía com 1 — apagando ~380 provas que não dependem de banco nenhum. O `pre` do comando geral ganhou `--opcional`; o de `teste:integracao` continua parando tudo, de propósito.

**Depois:** transformar uma lacuna em tarefa nova, pelo orquestrador (`ATV-GERAR`) — trabalho no módulo de atividades.

**As duas alavancas de custo estão preparadas e desligadas (15/09/2026).** `IA_MODELO_BUSCA` (modelo da síntese) e `PESQUISA_BUSCA_VERSAO` (filtragem dinâmica) mudam, cada uma, a maior parte do custo da investigação — e as duas mudam comportamento de um jeito que só uma investigação real mostra. O padrão das duas é o de sempre; ligar é uma linha; e a ordem certa é ligar **uma de cada vez**, com uma investigação de verdade entre elas.

**Na Fase 4, com a régua de pé, a ordem natural é:** medir onde o planejador está hoje (`npm run avaliar-planejador`), e só então mexer — `D3` (modelo por etapa), domínios, filtragem de resultado, teto de buscas. O número medido antes é o que separa melhora de palpite.

**Um dado da medição real que já aponta o alvo:** na investigação de 14/09, `planejar` gastou 724 tokens de entrada e a busca gastou **38.662**. Trocar o modelo do planejador mexeria em ~2% do custo; o que pesa é a entrada da busca, que cresce com o **quadrado** do número de buscas. Qualquer economia séria está em `MAX_BUSCAS` ou em filtrar o que entra no contexto — e nenhuma das duas se decide sem a régua, porque as duas trocam custo por qualidade.

**D3** (modelo de síntese) segue em aberto e só trava a Fase 4.

**Migração do portão aplicada** em 14/09/2026 (`20260914132503_portao_confirmacao`): `ALTER TYPE ... ADD VALUE 'aguardando'` e duas colunas anuláveis. Nenhum `DROP`, nenhuma coluna existente alterada. O cast único e datado voltou a `investigacao.ts` enquanto ela não rodava e saiu depois — **duas vezes no mesmo dia, pagas nas duas**, que é a prova de que o padrão é dívida curta e não hábito.

**Migração aplicada** em 14/09/2026 (`20260914035727_investigacao_persistida`): `CREATE TYPE` do enum, `ADD COLUMN resposta` anulável, `CREATE TABLE` com dois índices e uma chave estrangeira em cascata. Nenhum `DROP`, nenhuma coluna existente alterada. Os três casts temporários saíram e o projeto compila contra os tipos reais.

**O padrão fica registrado para a próxima tabela.** Código novo que depende de uma migração ainda não rodada trava o projeto inteiro — e aí ninguém consegue nem revisar o resto. A saída foi um cast **único, nomeado e datado** por fronteira, com os pontos de chamada ainda tipados contra uma interface escrita à mão. Isso é dívida que se paga em uma linha; um `any` espalhado por três arquivos é dívida que apodrece.

Nada da Fase 1 em diante depende do nível 4, e nenhuma fase depende de trocar de fornecedor.
