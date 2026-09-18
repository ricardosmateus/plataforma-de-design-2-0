# Regras de Negócio — Página de um Tema

> **Versão:** 1.0.0 · **Status:** Implementado
> **Conferido em:** 13/09/2026, contra `tema.html`, `js/tema.js`, `js/graficos.js`, `api/src/rotas/grafo.ts` e `api/src/ia/enriquecimento*.ts`
> **Módulo:** Temas · **Página:** `tema.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`../ideias/ideias-taxonomia.md`](../ideias/ideias-taxonomia.md) — de onde vêm as categorias e os recortes · [`../ideias/ideias-movimentacao.md`](../ideias/ideias-movimentacao.md) — IDEIA-MOV-017, que faz conteúdo sair daqui · [`../atividades/board-lista.md`](../atividades/board-lista.md) — `board.html`, o destino de todo link desta página

---

`tema.html` estava no ar sem documento de regra, o que a seção *Fonte oficial* de `Skills/regra_de_negocio.skill` não permite. O comportamento era governado por `Skills/categorizacao-taxonomia.skill` e `Skills/enriquecimento-tema.skill`, com o plano em `Documentacao/enriquecimento-tema.md` — nenhum deles versionado como regra nem citável por ID. Este documento foi escrito em 13/09/2026 a partir do código, promovendo a regra o que já estava decidido e implementado.

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Página de um tema |
| Módulo | Temas |
| Rota | `/tema.html?empresa=:id&categoria=:nome` (`&projeto=:id` opcional, só para a navegação) |
| Endpoints | `GET /empresas/:empresaId/temas/:categoria` · `GET /empresas/:empresaId/temas/:categoria/sintese` |
| Entidades | `recortes_taxonomia`, `sinteses_tema`, `ideias`, `tarefas` |
| Vocabulário | `api/src/ia/taxonomia-vocabulario.ts` — cinco domínios, 24 categorias |
| Páginas relacionadas | `Sobre_a_empresa.html` (origem e volta), `board.html` (destino de todo link) |

**O que a página responde.** "Sobre a empresa" responde *de que* a empresa fala — Mercado, Estratégia, Concorrentes. Esta responde *o que ela diz* sobre um deles. É a metade da pergunta que faltava.

---

## 1. Regras

### 1.1 O que a página mostra — `TEMA-LEITURA`

| ID | Regra | Fonte |
|---|---|---|
| TEMA-LEITURA-001 | A página mostra os **recortes** de uma categoria, agrupados por tarefa de origem. Cada bloco é uma tarefa, nunca uma fusão de várias — porque cada bloco termina num link para **um** quadro, e fundir dois mandaria a pessoa ao lugar errado na metade das vezes. | Registrado 13/09/2026, a partir do código |
| TEMA-LEITURA-002 | O texto exibido é o registro do quadro, **letra por letra**. A página não reescreve, não resume e não corrige — é isso que faz "editar no quadro" encontrar o que a pessoa acabou de ler. | Registrado 13/09/2026 |
| TEMA-LEITURA-003 | A página **não pensa**: a segmentação já aconteceu, uma vez, quando a idéia foi finalizada (`IDEIA-TAX-005`). Abrir um tema é leitura pura — instantâneo e **sem custo de crédito**. | Registrado 13/09/2026 |
| TEMA-LEITURA-004 | Os blocos vêm **mais recente primeiro**, com título da idéia e depois da tarefa como desempate. O desempate não é detalhe: sem ele a página remontaria em ordem diferente a cada carga. | Registrado 13/09/2026, a partir do código |
| TEMA-LEITURA-005 | Só entra recorte de idéia **em `finalizado`**, não arquivada, de projeto não arquivado, da empresa da URL. O filtro é redundante por decisão: `IDEIA-MOV-017` já apaga os recortes ao sair de `finalizado`, e este `where` é o cinto de segurança caso algum escape. | Decorre de IDEIA-TAX-001 |
| TEMA-LEITURA-006 | Todo texto é escrito na tela por `textContent`, nunca por `innerHTML`. O conteúdo vem de registros que pessoas digitaram em quadros: montar isto por `innerHTML` executaria, na página de conhecimento da empresa, o que alguém escreveu num post-it. | Registrado 13/09/2026 |

### 1.2 Um tema cruza projetos — `TEMA-ISO`

| ID | Regra | Fonte |
|---|---|---|
| TEMA-ISO-001 | O escopo da página é a **empresa**, não o projeto. "Concorrentes" reúne o que foi descoberto em **todos** os projetos da empresa — é essa reunião que dá sentido à página. | Registrado 13/09/2026 |
| TEMA-ISO-002 | O `?projeto=` da URL é **só contexto de navegação** (para onde o rail e o "voltar" apontam). Ele não filtra o conteúdo e não pode ser usado para montar link de origem. | Registrado 13/09/2026, a partir do código |
| TEMA-ISO-003 | O link de cada trecho usa o **projeto da idéia**, lido da resposta — nunca o projeto da URL. Mandar todos para o projeto da barra de endereço levaria ao quadro errado, ou a um redirecionamento de volta, que é como o defeito apareceria primeiro. | Registrado 13/09/2026 |
| TEMA-ISO-004 | Antes de qualquer leitura, o servidor confirma **vínculo ativo** com a empresa da URL. Sem vínculo, `404` — nunca o conteúdo de outra empresa, e nunca um `403` que confirmaria que aquele id existe. | Decorre de PROJ-ISO-003 |
| TEMA-ISO-005 | A categoria da URL é comparada com o **vocabulário fechado**. Nome fora dele devolve `404` "Esse tema não existe na taxonomia" — sem isso, qualquer nome inventado teria uma pasta fantasma com endereço próprio e conteúdo sempre vazio. | Decorre de IDEIA-TAX-003 |

**Por que TEMA-ISO-003 merece regra própria.** É o mesmo erro que `IDEIA-MOV-015` já corrigiu em outro lugar: usar o identificador que está à mão em vez do que descreve o registro. Aqui ele é especialmente fácil de cometer, porque o `?projeto=` está na URL e "funciona" em todos os testes feitos dentro de um projeto só. Ele quebra exatamente quando a página cumpre o propósito dela — reunir trechos de projetos diferentes.

### 1.3 Navegação e estados — `TEMA-NAV`

| ID | Regra | Fonte |
|---|---|---|
| TEMA-NAV-001 | Sem `?empresa=` a página volta para `empresas.html`; sem `?categoria=` volta para `Sobre_a_empresa.html`. Não é estado vazio — é navegação inválida, e cada caso volta ao lugar mais próximo que ainda faz sentido. | Decorre de IDEIA-QUADRO-007 |
| TEMA-NAV-002 | `404` do servidor — empresa sem vínculo **ou** tema fora da taxonomia — leva para `Sobre_a_empresa.html`, que é a página que sabe quais temas existem. As duas causas levam ao mesmo lugar de propósito. | Decorre de TEMA-ISO-004/005 |
| TEMA-NAV-003 | Carregando, vazio e erro são três estados distintos. Um tema vazio por falha de rede, desenhado como tema vazio de verdade, faria alguém concluir que a empresa não sabe nada sobre concorrentes. | Decorre de IDEIA-QUADRO-008 |
| TEMA-NAV-004 | O estado de erro traz "Tentar de novo", e cada tentativa é uma **carga do zero** — a leitura guiada da tentativa anterior é descartada antes, para não ficar acesa por cima de um tema que a carga atual ainda não confirmou que tem conteúdo. | Registrado 13/09/2026, a partir do código |
| TEMA-NAV-005 | Cada categoria tem uma **frase de introdução** explicando o que ela promete conter. "Mercado" e "Benchmark" têm leitura ambígua fora deste vocabulário: sem a frase, quem chega pelo grafo ou por uma tag lê os trechos sem saber o que a pasta significa. Categoria sem entrada não quebra a página — a introdução fica oculta —, mas é esquecimento, não omissão proposital. | `Skills/categorizacao-taxonomia.skill`; registrado 13/09/2026 |
| TEMA-NAV-006 | A categoria chega pela URL e é reconhecida **sem acento e sem diferença de caixa**, tanto no servidor quanto na introdução. Um link antigo ou digitado à mão não pode deixar a página muda por causa de um acento. | Registrado 13/09/2026 |

### 1.4 Leitura guiada e gráficos — `TEMA-SINTESE`

Camada **aditiva** por cima de §1.1. Origem: `Skills/enriquecimento-tema.skill` e `Documentacao/enriquecimento-tema.md`.

| ID | Regra | Fonte |
|---|---|---|
| TEMA-SINTESE-001 | A leitura crua de §1.1 **continua existindo e continua grátis**, sempre. Se o enriquecimento nunca rodou, falhou, ou não tem saldo, a tela mostra o que sempre mostrou. Nada nesta seção pode bloquear ou atrasar a rota de leitura. | `enriquecimento-tema.skill`, "O que não muda, nunca" |
| TEMA-SINTESE-002 | **O modelo rotula, não escreve.** Ele devolve título de seção, título de gráfico e rótulo de ponto, mais números que apontam para recortes existentes. O texto de cada trecho é montado no servidor a partir do banco, a cada requisição, **nunca copiado da resposta do modelo**. | `enriquecimento-tema.skill` |
| TEMA-SINTESE-003 | **Nenhum recorte some.** Recorte que o modelo esqueceu cai numa seção final "Outros trechos", gerada pelo servidor e não pelo modelo — se fosse um título que o modelo tem liberdade de propor, a garantia de que nada some ficaria refém da educação da resposta. | `enriquecimento-tema.skill` |
| TEMA-SINTESE-004 | Quando a leitura guiada existe, ela **substitui** a lista por atividade de origem; as duas nunca aparecem juntas e não há botão para trocar. Escolher a vista era uma pergunta que só se responde depois de ler as duas — e ler as duas é ler o mesmo conteúdo duas vezes, que é o que a leitura guiada existe para evitar. | Registrado 13/09/2026 |
| TEMA-SINTESE-005 | Leitura guiada e gráficos têm **status e fingerprint próprios**. Um tema pode ter gráfico sem ter leitura guiada, e o contrário. | `enriquecimento-tema.skill` |
| TEMA-SINTESE-006 | O reprocessamento é decidido por **fingerprint, não por flag**: o `sha256` dos ids dos recortes do tema. Os recortes são recriados por inteiro a cada segmentação, então o conjunto muda sempre que há algo novo para reler, e não muda quando uma idéia sem relação nenhuma é finalizada. Igual ao gravado, não reprocessa. | `enriquecimento-tema.skill` |
| TEMA-SINTESE-007 | O disparo acontece **depois** da transação que grava os recortes, sem `await`, por `(empresa, categoria)` — não por idéia. "A leitura de Mercado" é o tema inteiro, não o que uma idéia isolada disse. | `enriquecimento-tema.skill` |
| TEMA-SINTESE-008 | Custo entra como tipo próprio `sintese_tema`, separado de `classificacao` e `assistente`, para "quanto custou enriquecer os temas" ter resposta própria. Saldo insuficiente **não é erro**: o tema não é enriquecido e a leitura crua continua de pé (TEMA-SINTESE-001). | `enriquecimento-tema.skill`; decorre de IA-CUSTO |
| TEMA-SINTESE-009 | Resposta ilegível do modelo preserva a leitura anterior (`null`), e **não** a substitui por vazio. Lista vazia e `null` decidem coisas opostas. | `enriquecimento-tema.skill` |

### 1.5 Rastreabilidade — `TEMA-ORIGEM`

| ID | Regra | Fonte |
|---|---|---|
| TEMA-ORIGEM-001 | Todo trecho exibido leva de volta ao quadro de origem. É a razão de a página existir: conhecimento que não se pode conferir na fonte vira boato com layout bonito. | Registrado 13/09/2026 |
| TEMA-ORIGEM-002 | O link carrega os **quatro** ids que `board.html` exige (`BOARD-ACESSO-003`): empresa, projeto, idéia e tarefa. Faltando qualquer um, o link não é desenhado — melhor nenhum link do que um que volta. | Decorre de BOARD-ACESSO-003 |
| TEMA-ORIGEM-003 | Na leitura guiada o link é **por trecho**, não por bloco: uma seção pode misturar recortes de tarefas diferentes, e um link no fim do bloco apontaria para uma só. | `Documentacao/enriquecimento-tema.md` |
| TEMA-ORIGEM-004 | Cada gráfico traz a lista das origens dos seus dados **como links de verdade**, abaixo dele. Clicar na barra é o atalho; o link é a porta — e é o único caminho até a origem que funciona sem mouse. | `enriquecimento-tema.skill`, "Rastreabilidade e acessibilidade" |
| TEMA-ORIGEM-005 | Um recorte citado por dois pontos do mesmo gráfico aparece **uma vez só** na lista de origens. A pessoa quer chegar ao trecho, não contar quantas vezes ele foi usado. | Registrado 13/09/2026 |
| TEMA-ORIGEM-006 | O rótulo do link de origem é o **nome da tarefa**, não "ver origem": numa lista de três, três links iguais não dizem qual é qual. | Registrado 13/09/2026 |
| TEMA-ORIGEM-007 | Trecho órfão — cujo recorte já não tem tarefa viva — não vira link nem parágrafo em branco, e seção que ficou sem nenhum trecho válido não vira card vazio. | Registrado 13/09/2026 |

---

## 2. Contrato da API

### `GET /empresas/:empresaId/temas/:categoria`

Leitura pura. Não chama o modelo, não custa crédito (TEMA-LEITURA-003).

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ categoria, dominio, total_trechos, blocos }` | Desenha os blocos; `blocos` vazio → estado vazio |
| Sessão inválida | `401` | Volta ao login com `?motivo=sessao-expirada&destino=` |
| Conta suspensa | `403` com `suspensao` | Volta ao login com `?motivo=suspenso` |
| Sem vínculo com a empresa, ou `:empresaId` inválido | `404` "Empresa não encontrada." | Vai para `Sobre_a_empresa.html` |
| Categoria fora do vocabulário | `404` "Esse tema não existe na taxonomia." | Vai para `Sobre_a_empresa.html` |
| Falha de rede ou `5xx` | — | Estado de erro com "Tentar de novo" (TEMA-NAV-003/004) |

`categoria` volta com a **grafia canônica** do vocabulário, não como veio na URL (TEMA-NAV-006). Cada bloco traz `ideia_id`, `ideia_titulo`, `projeto_id`, `projeto_nome`, `tarefa_id`, `tarefa_titulo` e `trechos[]`. `projeto_nome` sai do catálogo de tipos (`PROJ-CRIA-002`), a mesma fonte que monta o card em `projetos.html` — se divergissem, o mesmo projeto teria dois nomes em duas telas.

### `GET /empresas/:empresaId/temas/:categoria/sintese`

Aditiva. Falha aqui **nunca** afeta a rota acima (TEMA-SINTESE-001).

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Enriquecida | `200` com `status_leitura`/`status_graficos` `"ok"`, `secoes`, `recortes`, `graficos` | Desenha a leitura guiada e/ou os gráficos |
| Ainda não rodou, ou falhou | `200` com status `"pendente"` | Nada — a leitura crua já está na tela |
| Qualquer erro | — | Silencioso: a tela não avisa e não muda de estado |

As duas chamadas partem **em paralelo** na carga da página. A síntese nunca atrasa a leitura.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| TM1 | A página filtra pelo projeto da URL? | Não. O escopo é a empresa (TEMA-ISO-001); o `?projeto=` é só navegação. | Registrado 13/09/2026, a partir do código |
| TM2 | Leitura guiada e lista crua convivem, com um seletor? | Não. Quando a guiada existe, ela é a vista (TEMA-SINTESE-004). | Registrado 13/09/2026 |
| TM3 | O enriquecimento é por idéia ou por tema? | Por `(empresa, categoria)`. O tema inteiro, não o que uma idéia disse. | Registrado 13/09/2026 |
| TM4 | Reprocessar por flag ou por conteúdo? | Por fingerprint do conjunto de recortes (TEMA-SINTESE-006). | Registrado 13/09/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Origem das decisões TM1 a TM4 | Foram **lidas do código**, não de decisão registrada em conversa. Descrevem corretamente o que o sistema faz; falta confirmar que é o que se quer que ele faça. |
| Fase 3 — Lacunas | Planejada em `Documentacao/enriquecimento-tema.md` §"Fase 3" e **não construída**: não há arquivo, prompt nem coluna em uso. Quando entrar, vira `TEMA-SINTESE` novo aqui, não só no plano. |
| Categoria sem frase de introdução | TEMA-NAV-005 diz que toda categoria precisa de entrada em `DESCRICOES`, mas nada verifica. A lista vive em `js/tema.js` e o vocabulário em `taxonomia-vocabulario.ts`: as duas podem divergir em silêncio, e o sintoma é uma página muda, não um erro. |
| Papéis | Nenhuma regra distingue papéis nesta página — quem tem vínculo ativo lê tudo. Está coerente com `IDEIA-QUADRO-003`, mas nunca foi decidido explicitamente para temas. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-09-13 | Documento criado. `tema.html` estava no ar sem documento de regra — a única página nessa situação, junto de um rascunho na raiz. O comportamento era governado por `categorizacao-taxonomia.skill` e `enriquecimento-tema.skill`, com o plano em `Documentacao/enriquecimento-tema.md`, nenhum deles citável por ID. Registradas `TEMA-LEITURA` (6), `TEMA-ISO` (5), `TEMA-NAV` (6), `TEMA-SINTESE` (9) e `TEMA-ORIGEM` (7), os contratos das duas rotas, decisões TM1 a TM4 e quatro pendências. |
