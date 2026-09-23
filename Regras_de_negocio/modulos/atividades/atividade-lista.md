# Regras de Negócio — Lista de Tarefas da Atividade

> **Versão:** 1.13.0 · **Status:** Implementado e verificado ao vivo (backend + `atividade.html` + `visao_do_projeto.html`)
> **Conferido em:** 13/09/2026, contra `api/src/rotas/tarefas.ts`, `js/atividade.js` e `js/orquestrador-gateway.js`
> **Módulo:** Atividades · **Página:** `atividade.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ideias-movimentacao.md`](../ideias/ideias-movimentacao.md) — de onde vem `IDEIA-MOV-014/015/016` · [`ideias-criacao.md`](../ideias/ideias-criacao.md) · [`ideias-quadro.md`](../ideias/ideias-quadro.md)
> **Substitui em parte:** [`atividade-analise-pre-implementacao.md`](atividade-analise-pre-implementacao.md) — este documento resolve as perguntas P1 (parcialmente), e define `ATV-ACESSO`, `ATV-TAR-CRIA`, `ATV-TAR-ORDEM` e `ATV-TAR-CONCLUIR`. As perguntas P2–P10 que este documento **não** resolve continuam abertas — ver §5.

---

## 0. O que é uma "atividade"

Não existe uma entidade separada de "atividade" no banco. **A atividade É a idéia** — a página `atividade.html` é a visão de trabalho de uma idéia que está sendo executada, e a lista que ela mostra é a lista de tarefas **daquela idéia**. Não há uma tabela `atividades`: existe `ideias` (já existente) e uma nova `tarefas`, presa direto ao `id` da idéia.

Isso simplifica o modelo pretendido em `atividade-analise-pre-implementacao.md` §4 (que cogitava uma tabela `atividades` intermediária) — ela deixa de ser necessária.

---

## 1. Regras

### 1.1 Entrar na atividade — `ATV-ACESSO`

| ID | Regra | Fonte |
|---|---|---|
| ATV-ACESSO-001 | Clicar em **"Acessar"** no card de uma idéia (em `visao_do_projeto.html`) faz duas coisas juntas: move a idéia para a coluna **"Em andamento"** (se ainda não estiver lá) e abre `atividade.html` para aquela idéia. | Decisão A17 |
| ATV-ACESSO-002 | Na **primeira** vez que uma idéia é acessada, uma tarefa nasce sozinha, copiando o **título** e a **descrição** da idéia — é essa tarefa que aparece como o primeiro card da lista. | Decisão A17 |
| ATV-ACESSO-003 | Da segunda vez em diante, "Acessar" só abre a lista de tarefas que já existe — **não** cria uma segunda tarefa-semente. | Decorre de ATV-ACESSO-002 |
| ATV-ACESSO-004 | A tarefa nascida da idéia (`ATV-ACESSO-002`) é uma tarefa comum depois de criada: pode ser editada, reordenada, concluída ou excluída como qualquer outra. Não fica protegida nem se distingue das demais. | Decisão A17 |
| ATV-ACESSO-005 | Editar o título/descrição da idéia depois de a atividade já existir **não** reescreve a tarefa-semente. A cópia foi feita uma vez, no momento do acesso; dali em diante são registros independentes. | Decorre de ATV-ACESSO-002 — mesmo princípio de `fontes` em `ia_mensagens` (cópia no momento, não sincronização contínua) |

**Por que mover para "Em andamento" faz parte de "Acessar" (`ATV-ACESSO-001`).** Isto substitui o comportamento provisório que existe hoje em `visao_do_projeto.html` (mover para a coluna seguinte, um substituto "honesto" registrado no próprio código). Continua sendo **um atalho**, não uma restrição nova: `IDEIA-MOV-001` (movimento livre) continua valendo — a pessoa pode arrastar a idéia para qualquer coluna a qualquer momento, inclusive para fora de "Em andamento" enquanto a atividade segue existindo.

**Por que a idéia não "vira" a tarefa, ela gera uma cópia (`ATV-ACESSO-002`).** A idéia continua existindo como idéia — ela tem que continuar podendo ser movida, editada e eventualmente chegar em "Finalizado" (`IDEIA-MOV-014`), o que só faz sentido se ela não deixar de existir. "Transformar em tarefa" é a idéia **gerar** o primeiro item de trabalho da sua própria atividade, não se converter nele.

### 1.2 Adicionar tarefa — `ATV-TAR-CRIA`

| ID | Regra | Fonte |
|---|---|---|
| ATV-TAR-CRIA-001 | Toda tarefa nova exige **título** (até 260 caracteres) e **descrição** (até 280 caracteres) — mesmos limites já usados em idéias (`IDEIA-CRIA-001/002`), pelo mesmo motivo: consistência entre módulos. | Decisão A18 |
| ATV-TAR-CRIA-002 | Uma tarefa nova nasce **sempre no fim da lista** — depois da última tarefa já existente, nunca no meio nem no topo. | Pedido do Ricardo, 28/08/2026 |
| ATV-TAR-CRIA-003 | Uma tarefa nova nasce com status **pendente**. Não é possível criar uma tarefa já concluída. | Decorre de `ATV-TAR-CRIA-002` — mesmo raciocínio de `IDEIA-CRIA-003` |
| ATV-TAR-CRIA-004 | Criar uma tarefa é uma ação de quem pode escrever na idéia — os mesmos três papéis já definidos (proprietário, membro, especialista — `IDEIA-CRIA-PAPEL`). | Decorre de `IDEIA-CRIA-PAPEL` |
| ATV-TAR-CRIA-005 | O **tipo** da tarefa (`BOARD-ACESSO-001/002`) é escolhido no **menu lateral** do modal "Nova tarefa", que lista **só os tipos que existem no catálogo**: hoje "Pesquisa" e "Matriz CSD". "Pesquisa" vem marcado por padrão. Na edição, a lateral mostra o tipo da própria tarefa e fica travada (`ATV-TAR-EDIT-004`). | Pedido do Ricardo, 23/09/2026 |
| ATV-TAR-CRIA-006 | O tipo escolhido aparece no formulário como **subtítulo**, com o mesmo nome da lateral, seguido de uma **descrição curta** do que aquele tipo faz. O campo de título sempre leva o nome do tipo: **"Título da pesquisa"**, **"Título da Matriz CSD"** e **"Título das referências visuais"**. Todo tipo novo do catálogo precisa trazer o seu. Os campos não têm texto de exemplo dentro deles. | Pedido do Ricardo, 23/09/2026 |
| ATV-TAR-CRIA-007 | Terceiro tipo no catálogo: **Referências visuais** (`referencias_visuais`). A tarefa junta sites e imagens de referência, e "Acessar tarefa" abre o `board.html` com os quadros "Sites" e "Imagens" (`BOARD-REF`, em [`board-lista.md`](board-lista.md)). | Pedido do Ricardo, 23/09/2026 |
| ATV-TAR-CRIA-008 | Na **criação** de uma tarefa "Referências visuais", o modal **não pede título nem descrição**: a tarefa já se explica pelo tipo. O servidor grava "Referências visuais" e "Reunir sites e imagens que mostram o visual de referência do projeto." O botão "Gerar com ajuda da IA" também some nesse tipo, porque não haveria o que propor. Na **edição**, os campos aparecem, para quem quiser renomear. | Pedido do Ricardo, 23/09/2026 |

**Por que sempre no fim, e não numa posição escolhida (`ATV-TAR-CRIA-002`).** É a lista de reordenação (`ATV-TAR-ORDEM`) que decide onde uma tarefa importa mais — criar já permite escolher uma posição duplicaria essa decisão em dois lugares diferentes. Entrar no fim é previsível: a pessoa sempre sabe onde procurar o que acabou de criar, e decide depois, arrastando, se aquilo é prioridade.

### 1.3 Priorização — `ATV-TAR-ORDEM`

Esta tela existe, em grande parte, para isto: a ordem dos cards **é** a prioridade das tarefas dentro da atividade — não é um detalhe visual.

| ID | Regra | Fonte |
|---|---|---|
| ATV-TAR-ORDEM-001 | A posição de uma tarefa na lista é um dado gravado (`ordem`), não uma decisão de exibição. Duas pessoas olhando a mesma atividade veem a mesma ordem. | Pedido do Ricardo, 28/08/2026 |
| ATV-TAR-ORDEM-002 | A pessoa pode reordenar de **dois jeitos**: arrastar com o mouse (pelo alça já existente no protótipo) ou usar as setas para cima/baixo com o card em foco. | Decisão A19 — mesmo princípio de `IDEIA-MOV-CAMINHOS` |
| ATV-TAR-ORDEM-003 | Os dois caminhos passam pela **mesma** função de reordenação e pela **mesma** chamada à API. Nenhum dos dois special-cases a gravação. | Decorre de `ATV-TAR-ORDEM-002` — mesmo raciocínio de `IDEIA-MOV-009` |
| ATV-TAR-ORDEM-004 | O card se move na tela imediatamente; a chamada ao servidor segue em paralelo. Se falhar, o card **volta** para a posição de onde saiu e a tela avisa. | Decorre de `IDEIA-MOV-011/012` — mesmo padrão, mesma razão |
| ATV-TAR-ORDEM-005 | Soltar a tarefa na mesma posição de onde saiu não é uma alteração: não chama a API, não emite mensagem. | Decorre de `IDEIA-MOV-003` |

**Por que isto muda a decisão de `ideias-movimentacao.md` §4 (não a contradiz).** Lá, a ordem dentro de uma coluna de idéias foi deixada de fora de propósito — o quadro de idéias é sobre round-trip de brainstorm, não sobre fila de execução, e não havia pedido para persistir posição. Aqui é o oposto: o Ricardo pediu explicitamente que esta tela sirva para priorizar. São páginas com propósitos diferentes; a mesma pergunta pode ter respostas diferentes em cada uma sem que isso seja inconsistência.

**Por que arrastar sozinho não basta (`ATV-TAR-ORDEM-002`).** Mesma razão já registrada para idéias: arrastar com mouse é o único caminho que exclui parte das pessoas. As setas não são um extra — são o que torna a priorização possível pelo teclado e por leitor de tela.

### 1.4 Concluir tarefa — `ATV-TAR-CONCLUIR`

| ID | Regra | Fonte |
|---|---|---|
| ATV-TAR-CONCLUIR-001 | Concluir uma tarefa muda **só** o `status` dela, para "concluída". Não move nem apaga nenhuma outra tarefa, não mexe na idéia, não navega para fora da tela. | Corrige o protótipo — ver nota abaixo |
| ATV-TAR-CONCLUIR-002 | Toda tarefa concluída pode ser **reaberta** — volta para "pendente". Não é uma ação de mão única. | Interface já existente (`taskReopenModal`) |
| ATV-TAR-CONCLUIR-003 | Concluir/reabrir passa por confirmação antes de gravar — mesma proteção contra clique acidental que já existe no protótipo para as outras ações destrutivas ou que mudam estado. | Interface já existente |
| ATV-TAR-CONCLUIR-004 | Concluir a **última** tarefa pendente de uma atividade **não** conclui a atividade nem move a idéia sozinha. Quem move a idéia para "Finalizado" continua sendo exclusivamente o botão "Concluir atividade" (`IDEIA-MOV-014`). | Decisão A20 |

**O bug que `ATV-TAR-CONCLUIR-001` conserta.** Hoje, no protótipo, confirmar a conclusão de uma tarefa individual redireciona a pessoa para `visao_do_projeto.html?board=1` — sai da atividade inteira por ter concluído **uma** tarefa dentro dela. Não há pedido nem razão registrada para isso: parece resíduo de teste, não comportamento pretendido. A regra corrige isso: concluir uma tarefa é um evento local à lista, a pessoa continua na atividade e pode seguir trabalhando nas tarefas seguintes.

**Por que `ATV-TAR-CONCLUIR-004` é regra explícita.** Era tentador deixar "todas as tarefas concluídas" disparar sozinho a conclusão da atividade — mas isso tiraria da pessoa a decisão que `IDEIA-MOV-014`/`I5` já protegem: mover para "Finalizado" é sempre um ato explícito. Automatizar aqui reabriria, por um caminho novo, a mesma pergunta que `I5` já respondeu (a coluna reflete a intenção da pessoa, não um fato calculado sozinho).

### 1.5 Excluir tarefa — `ATV-TAR-EXCLUI`

| ID | Regra | Fonte |
|---|---|---|
| ATV-TAR-EXCLUI-001 | Excluir uma tarefa apaga a linha **de verdade** no banco — não é arquivamento como em idéias (`IDEIA-EXCL-001`). Não existe "lixeira" nem forma de recuperar depois. | Pedido do Ricardo, 29/08/2026 |
| ATV-TAR-EXCLUI-002 | Excluir passa por confirmação antes de gravar — mesma proteção contra clique acidental já usada nas demais ações destrutivas desta tela. | Interface já existente (`taskDeleteModal`) |
| ATV-TAR-EXCLUI-003 | O card só some da tela **depois** que a API confirma a exclusão — nunca antes. Se a chamada falhar, o card continua ali e a tela avisa. | Decorre do mesmo raciocínio de `IDEIA-MOV-012`, aplicado a uma ação sem meio-termo |
| ATV-TAR-EXCLUI-004 | Excluir é uma ação de quem pode escrever na idéia — os mesmos três papéis já usados para criar, reordenar e concluir tarefa (`ATV-TAR-CRIA-004`). Resolve a metade "excluir" de P9 (§5); duplicar (P10) continua em aberto. | Decisão A22 |
| ATV-TAR-EXCLUI-005 | Qualquer tarefa pode ser excluída, inclusive a tarefa-semente nascida do "Acessar" (`ATV-ACESSO-002/004`). Se a lista ficar vazia, o próximo acesso à atividade cria uma semente nova a partir da idéia — a atividade nunca fica "quebrada" por falta de tarefas. | Decorre de `ATV-ACESSO-004` |

**Por que apagar de verdade, e não arquivar como idéias (`ATV-TAR-EXCLUI-001`).** Idéias e empresas são coisas que vale a pena poder recuperar — representam decisão e histórico. Uma tarefa dentro de uma atividade é mais parecida com um item de checklist: existe para organizar o trabalho enquanto ele acontece, não para ficar registrada depois. Guardar tarefas excluídas para sempre no banco, sem nenhuma tela que as mostre, seria só peso morto — arquivar sem forma de acessar o arquivo não é arquivar, é enganar.

**Por que otimismo não se aplica aqui (`ATV-TAR-EXCLUI-003`), diferente de mover (`ATV-TAR-ORDEM-004`) ou concluir.** Mover e concluir são reversíveis — dá para arrastar de volta, dá para reabrir. Excluir não tem "desfazer": se o card sumisse da tela antes de a API confirmar e a chamada falhasse, a pessoa veria a lista "errada" (a tarefa some e reaparece sozinha), o que é pior aqui do que numa reordenação, onde reaparecer no lugar de origem é natural. Esperar a confirmação custa um instante de latência; a alternativa custa confiança na tela.

### 1.6 Concluir a atividade — `ATV-CONCLUIR`

O botão "Concluir atividade", no topo da tela, é o atalho que `IDEIA-MOV-014` já previa. Esta seção descreve o botão em si — a confirmação, o que ele grava e o que a pessoa vê depois — não repete a regra de movimentação, que continua vivendo em `ideias-movimentacao.md` §1.4.

| ID | Regra | Fonte |
|---|---|---|
| ATV-CONCLUIR-001 | Clicar em "Concluir atividade" passa por confirmação antes de gravar — mesma proteção contra clique acidental já usada nas demais ações que mudam estado nesta tela. | Interface já existente (`finishModal`) |
| ATV-CONCLUIR-002 | Confirmar move a idéia para "Finalizado" pela API real (`PATCH .../ideias/:id/status`), sempre pelo `id` — nunca por `localStorage` nem por título. | Decorre de `IDEIA-MOV-014/015/016` |
| ATV-CONCLUIR-003 | Depois de confirmar, a pessoa é levada para `visao_do_projeto.html` — não fica numa tela de atividade que acabou de concluir. | Decisão A21 |
| ATV-CONCLUIR-004 | A confirmação é anunciada por um alerta flutuante ("Atividade concluída com sucesso.") — mostrado em `visao_do_projeto.html`, a tela de destino, não em `atividade.html`, de onde a pessoa saiu. | Decisão A21 |

**Por que o aviso aparece no destino, não na origem (`ATV-CONCLUIR-004`).** A confirmação já fecha o modal e dispara a navegação na mesma ação — não sobra tempo de tela para mostrar um alerta em `atividade.html` e a pessoa conseguir lê-lo antes do redirecionamento acontecer. O aviso é dado em `visao_do_projeto.html` porque é ali que a pessoa realmente chega e vê a idéia já na coluna "Finalizado" — o alerta confirma o que os olhos acabaram de ver, em vez de piscar numa tela que já está de saída.

---

### 1.7 Editar tarefa — `ATV-TAR-EDIT`

| ID | Regra | Fonte |
|---|---|---|
| ATV-TAR-EDIT-001 | Editar uma tarefa altera **título e descrição**, e só. `tipo`, `ordem` e `status` têm cada um a sua própria rota — mesmo raciocínio já registrado na §2 para a reordenação: a ação mais frequente não pode arrastar junto, por acidente, o texto que alguém escreveu. | Registrado 13/09/2026, a partir do código |
| ATV-TAR-EDIT-002 | Quem cria, edita: proprietário, membro e especialista, a mesma régua de `ATV-TAR-CRIA-004`. Papel sem permissão recebe `403` "Seu papel não permite editar tarefas." | Registrado 13/09/2026; decorre de ATV-TAR-CRIA-004 |
| ATV-TAR-EDIT-003 | Tarefa inexistente, ou que pertence a outra idéia, devolve `404` — mesma resposta nos dois casos, por `IDEIA-ISO-003/004`. | Registrado 13/09/2026 |
| ATV-TAR-EDIT-004 | O `tipo` é escolhido na criação e **não muda depois**. Trocar o tipo trocaria o espaço de trabalho que a tarefa abre (`BOARD-ACESSO`), deixando um quadro já preenchido apontando para o lugar errado. | Registrado 13/09/2026, a partir do código — confirmar como decisão (§5) |

**Por que esta seção demorou a existir.** A rota `PUT` está no ar, e a §2 já a mencionava de passada ao justificar por que reordenar tem rota própria — mas nunca teve regra. O histórico da v1.1.0, que dizia "editar/duplicar/excluir tarefa não foram implementados", ficou verdadeiro para duplicar, foi corrigido para excluir na v1.3.0, e seguiu valendo por engano para editar até esta conferência.

### 1.8 Sugerir a próxima tarefa — `ATV-GERAR`

| ID | Regra | Fonte |
|---|---|---|
| ATV-GERAR-001 | O botão **"Gerar com ajuda da IA"**, no modal "Nova tarefa", preenche Título, Descrição e Tipo com uma proposta. O modal **continua aberto** e tudo é editável: nada é gravado até o Salvar. É o padrão de proposta/confirmação de `IA-ACAO` — **resolve P4** (§5). | Registrado 13/09/2026, a partir de `js/orquestrador-gateway.js` |
| ATV-GERAR-002 | A proposta é montada **no cliente**, por heurística determinística, em cima do que já está gravado. **Não há chamada a modelo**: não consome crédito (`IA-CUSTO` não se aplica) e não passa pelas garantias de `IA-GARANT`/`IA-CONHEC`, que valem para o que o assistente afirma. | Registrado 13/09/2026 |
| ATV-GERAR-003 | O botão **mantém o nome "Gerar com ajuda da IA"**. Consequência aceita: o rótulo promete mais do que a implementação entrega hoje. Fica registrado para ninguém procurar consumo de crédito que não existe, nem tratar a proposta como saída de modelo. | Decidido 13/09/2026 com o Ricardo |
| ATV-GERAR-004 | A proposta lê **apenas tarefas concluídas** e as entidades já nomeadas no projeto. Tarefa pendente não entra: ela ainda não tem o que ensinar, e ler o quadro dela devolveria as perguntas que ela mesma vai responder — a proposta competiria com trabalho já em curso. | Registrado 13/09/2026, a partir do código |
| ATV-GERAR-005 | Descrição de tarefa do tipo `pesquisa` é escrita **como pergunta**. `board.html` classifica a descrição antes de executar e recusa o nível "conhecimento" — o que se responde por raciocínio em vez de por fonte. Uma descrição reflexiva nasceria impossível de executar, e a pessoa só descobriria ao abrir o quadro. | Registrado 13/09/2026; decorre do roteador de pesquisa |
| ATV-GERAR-006 | Evolução prevista: quando `/orquestrador/proxima-tarefa` existir, a heurística sai do cliente e a rota passa a receber o contexto e devolver `{ titulo, descricao, tipo, porque }`. ATV-GERAR-001 não muda — muda quem monta a proposta, e só então ATV-GERAR-002 deixa de valer. | Registrado 13/09/2026, do ponto de ligação marcado no próprio código |

**Revistas em 23/09/2026.** As regras 001 a 006 acima descrevem a primeira versão do botão e ficam como histórico. A partir de 23/09/2026 valem as de baixo: **ATV-GERAR-001, 002, 003 e 006 estão revogadas** (o botão passou a chamar um modelo, a cobrar e a criar a tarefa); 004 e 005 seguem valendo como orientação ao modelo.

| ID | Regra | Fonte |
|---|---|---|
| ATV-GERAR-010 | O botão **"Gerar com ajuda da IA"** considera o **tipo escolhido na lateral** do modal "Nova tarefa" (Pesquisa, Matriz CSD, Referência) e **cria a tarefa** desse tipo — não preenche mais o formulário para revisão. Aparece nos três tipos, Referência incluída; some só na edição, porque gerar cria uma tarefa nova. | Pedido do Ricardo, 23/09/2026 |
| ATV-GERAR-011 | Quem propõe é o **Senior Product Designer** (`Skills/senior-product-designer.skill`, prompt em `api/src/ia/gerar-tarefa.ts`), que recebe: a ficha da empresa, o que ela já sabe (verdade validada e material de consulta, a mesma régua de `IA-CONHEC`), o projeto, a atividade, as tarefas que já existem, os concorrentes já nomeados em pesquisas da empresa e o tipo. Mesma régua de escrita de quem cria à mão (`ATV-TAR-CRIA`). | Pedido do Ricardo, 23/09/2026 |
| ATV-GERAR-012 | **Pesquisa:** a tarefa é criada com a pergunta da pesquisa e a tela abre o board com `pesquisar=1`; a pesquisa começa sozinha, uma vez só. O clique em "Gerar" é o gesto que autoriza o gasto (mesma leitura de D12 em `planejamento-pesquisa-v2.md`). | Decisão do Ricardo, 23/09/2026 ("tarefa já com conteúdo") |
| ATV-GERAR-013 | O que a pessoa já tinha digitado em título e descrição vai como **orientação** ao modelo: ajusta o foco, não o tipo nem o formato. | Decisão de implementação, 23/09/2026 |
| ATV-GERAR-014 | Enquanto gera, o modal diz **o que a IA está fazendo**, por tipo, sem barra nem percentual; Salvar e a lateral ficam travados e um segundo clique não gera outra tarefa. Erro deixa o modal aberto com a mensagem do servidor. | Decisão de implementação, 23/09/2026 |
| ATV-GERAR-015 | **Matriz CSD:** a tarefa é criada com título e descrição do especialista e a tela abre a matriz com `classificar=1`, que já classifica as tarefas da atividade (`matriz-csd.md`, `MATRIZ-IA-007`). *Revista em 23/09/2026 — antes a matriz não tinha onde guardar conteúdo.* | Decisão do Ricardo, 23/09/2026 |
| ATV-GERAR-016 | **Custo:** o teto é reservado antes de qualquer chamada (a proposta e, na Referência, a busca), e acertado pelo custo real depois (`IA-CUSTO`). Proposta que não vira tarefa não é cobrada. A busca da Referência segue `BOARD-PESQUISA-010`: `falhou` não cobra, `vazio` cobra. O valor aparece só no Histórico de uso (`DIN-013`). | Decorre de `IA-CUSTO` e `DIN-013` |
| ATV-GERAR-017 | **Referência:** ver `board-lista.md`, `BOARD-REF-009` — concorrentes, sites, logotipos e documentos de marca buscados na web e gravados como cards da tarefa, sem revisão prévia. | Pedido do Ricardo, 23/09/2026 |

**Onde esta lógica mora, e por que isso é um problema.** As 722 linhas de `js/orquestrador-gateway.js` são governadas por `Skills/orquestrador-atividades.skill`, não por este documento — foi assim que um botão visível numa tela em produção chegou até aqui sem nenhuma regra. É o segundo caso do mesmo padrão: a taxonomia das idéias veio por `categorizacao-taxonomia.skill` e também nasceu sem ID (ver `../ideias/ideias-taxonomia.md`). Arquivo de Skill descreve **como** fazer; ele não substitui a regra que diz **o que** o produto faz.

**Por que ATV-GERAR-002 precisa estar escrita.** Sem ela, a leitura natural de ATV-GERAR-001 é que existe uma chamada de IA no caminho — e a partir daí alguém procura o custo em `IA-CUSTO`, espera as garantias de `IA-GARANT`, ou investiga por que o crédito não baixou. A regra existe para encurtar essa investigação para zero.

---

## 2. Contrato da API

Todas as rotas abaixo seguem a mesma corrente de isolamento já usada em idéias (`empresa → projeto → idéia`, `IDEIA-ISO-003`), e o mesmo padrão de autenticação por cookie das demais rotas.

### `GET /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas`

Devolve `{ tarefas: [...] }`, em ordem. **Encontra ou cria**: se a idéia ainda não tem nenhuma tarefa, esta chamada cria a tarefa-semente a partir do título/descrição da idéia (`ATV-ACESSO-002`) antes de responder — mesmo padrão já usado em `acharOuCriarConversa` (`ia.ts`), para não precisar de uma rota `POST` separada só para o primeiro acesso.

### `POST /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas`

**Corpo:** `{ "titulo": string, "descricao": string }`. Cria com `status: "pendente"` e `ordem` = maior ordem existente + 1 (`ATV-TAR-CRIA-002`).

### `PATCH /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/ordem`

**Corpo:** `{ "ordem": number }` (ou a posição/vizinho de destino — detalhe de implementação). Rota dedicada, e não o `PUT` de edição — mesmo raciocínio já registrado para `IDEIA-MOV` (§2 de `ideias-movimentacao.md`): reordenar é a ação mais frequente da tela, e uma rota própria evita que uma reordenação sobrescreva, por acidente, título ou descrição.

### `PATCH /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/status`

**Corpo:** `{ "status": "pendente" | "concluida" }`. Só muda esse campo (`ATV-TAR-CONCLUIR-001`).

### `PUT /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId`

**Corpo:** `{ "titulo": string, "descricao": string }`. Grava só esses dois campos (`ATV-TAR-EDIT-001`); `tipo`, `ordem` e `status` ficam como estão. Devolve `{ tarefa }`.

### `DELETE /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId`

Apaga a linha de verdade (`ATV-TAR-EXCLUI-001`) e devolve `{ ok: true }`. Uma segunda chamada sobre a mesma tarefa devolve `404` — já não existe, não é um sucesso silencioso.

| Situação (comum às seis rotas) | Resposta |
|---|---|
| Sessão inválida | `401` |
| Papel não permite | `403` |
| Qualquer elo da corrente falha, ou tarefa não pertence à idéia informada | `404` |

---

## 3. Modelo de dados (rascunho)

```
tarefas
  id            uuid (pk)
  ideia_id      uuid (not null, fk → ideias.id, cascade)
  titulo        text (not null, até 60)
  descricao     text (not null, até 280)
  status        enum ('pendente' | 'concluida')
  ordem         int (not null)
  criado_em     timestamp (default now())
  atualizado_em timestamp
```

Sem tabela `atividades` — ver §0. `ordem` é um inteiro simples, renumerado a cada reordenação; a lista de tarefas de uma idéia é pequena o bastante para isso ser barato (mesmo espírito do resto do projeto: sem indexação fracionária ou biblioteca nova para um problema pequeno).

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| A17 | O que "Acessar" faz numa idéia, e o que nasce na primeira vez? | Move a idéia para "Em andamento" e abre a atividade; na primeira vez, cria uma tarefa a partir do título/descrição da idéia. Não há tabela `atividades` — a atividade é a idéia. | 28/08/2026 |
| A18 | Tarefa nova tem os mesmos limites de campo de uma idéia? | Sim — 60/280 caracteres, mesma régua de `IDEIA-CRIA-001/002`, por consistência entre módulos. | 28/08/2026 |
| A19 | Reordenar tarefas — só arrastar, ou também teclado? | Os dois, pela mesma função — mesmo padrão já decidido para idéias (`IDEIA-MOV-CAMINHOS`), pela mesma razão de acessibilidade. | 28/08/2026 |
| A20 | Concluir todas as tarefas conclui a atividade sozinha? | Não. Só o botão "Concluir atividade" move a idéia para "Finalizado" (`IDEIA-MOV-014`) — concluir tarefas nunca decide isso por conta própria. | 28/08/2026 |
| A21 | Depois de concluir a atividade, para onde a pessoa vai, e onde ela vê a confirmação? | Vai para `visao_do_projeto.html`; o alerta flutuante de confirmação aparece lá, não em `atividade.html`, sinalizado por `?atividade_concluida=1` na URL de redirecionamento e limpo da URL (`history.replaceState`) depois de mostrado, para um recarregamento da página não repetir o aviso. | 29/08/2026 |
| A22 | Excluir tarefa apaga de verdade ou arquiva como idéia? E quem pode excluir? | Apaga de verdade — `Tarefa` não tem `arquivado_em`, de propósito (ver nota em `ATV-TAR-EXCLUI-001`). Quem pode excluir são os mesmos três papéis que já podem criar/reordenar/concluir tarefa (`ATV-TAR-CRIA-004`), por consistência — não haveria razão para restringir só a exclusão. | 29/08/2026 |
| A23 | O painel do assistente nesta tela reaproveita a conversa do projeto ou precisa de uma dimensão nova (P8)? | Reaproveita — `IA-CONV-001` já define a conversa pelo par (projeto, pessoa), não por idéia/atividade. `atividade.html` já vive dentro do contexto de um projeto (`empresa`/`projeto` na URL), então é a mesma conversa que aparece em `visao_do_projeto.html`, não uma nova. | 29/08/2026 |
| A24 a A29 | Decisões do quadro de trabalho da tarefa (`board.html`). | Ver [`board-lista.md`](board-lista.md) §4 — a numeração é contínua com esta tabela porque `board.html` é do mesmo módulo. | 29/08/2026 |

---

## 5. Pendências abertas (herdadas de `atividade-analise-pre-implementacao.md`, ainda sem resposta)

| Item | Situação |
|---|---|
| P2 — Concluir atividade com tarefas pendentes | Ainda não decidido se bloqueia, avisa ou ignora. |
| ~~P3 — Tipos de tarefa~~ | **Resolvido em 29/08/2026** — `BOARD-ACESSO-001/002` ([`board-lista.md`](board-lista.md), decisão A24): a tarefa ganhou o campo `tipo` (`pesquisa` / `matriz_csd` / `sem_tela`, padrão `sem_tela`), escolhido na criação, e o "Acessar tarefa" roteia por ele — não mais comparando o texto do título. O catálogo é **fechado**: um tipo novo entra por migração, não por texto livre. |
| ~~P4 — "Gerar tarefas com IA"~~ | **Resolvido em 13/09/2026** — `ATV-GERAR` (§1.8). Segue sim o padrão de proposta/confirmação: o modal fica aberto, a proposta é editável e nada grava até o Salvar. A decisão já estava tomada em `js/orquestrador-gateway.js` desde 06/09; faltava registrar. Fica aberto, no lugar dela, o **ponto de ligação com o backend** (ATV-GERAR-006): enquanto `/orquestrador/proxima-tarefa` não existir, a proposta é heurística no cliente, sem modelo. |
| P5 — Editar/excluir a atividade (idéia) a partir desta tela | Modais já existem no protótipo, sem gatilho na interface — ainda não decidido se o escopo inclui isso. |
| ~~P8 — Conversa do assistente nesta tela~~ | **Resolvido em 29/08/2026** — Decisão A23: reaproveita a conversa do projeto (`IA-CONV-001`). `js/ia.js` foi religado a esta tela (mesmo módulo de `visao_do_projeto.html`), com o mesmo `window.EmpresaAtual`/`window.ProjetoAtual` resolvidos em `js/atividade.js`. |
| P9 | Confirmado — mesmos três papéis de idéias (`ATV-TAR-CRIA-004`). "Excluir" **resolvido** (`ATV-TAR-EXCLUI-004`, Decisão A22, 29/08/2026) e "editar" **resolvido** (`ATV-TAR-EDIT-002`, 13/09/2026): os dois seguem a mesma régua. Falta só duplicar (P10). |
| P10 — Duplicar tarefa | Ainda não decidido se é um clique só ou passa por revisão antes de gravar. Segue só-na-tela, sem persistência. |
| Imutabilidade do `tipo` (ATV-TAR-EDIT-004) | Foi **lida do código**, não de uma decisão registrada: o `PUT` simplesmente não toca no campo. A regra e o motivo estão escritos; falta confirmar que é intencional e não omissão. Se um dia precisar mudar, exige decidir o que fazer com o quadro já preenchido. Levantada em 13/09/2026. |
| ~~Excluir tarefa~~ | **Resolvido em 29/08/2026** — `ATV-TAR-EXCLUI` (§1.5): apaga a linha de verdade (sem arquivamento), com confirmação prévia e só some da tela depois que a API confirma. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.11.0 | 2026-09-23 | Nova `ATV-TAR-CRIA-008`: "Referências visuais" é criada sem título e descrição no modal; o texto padrão vem do servidor (`TEXTO_PADRAO` em `api/src/rotas/tarefas.ts`). |
| 1.10.0 | 2026-09-23 | Nova `ATV-TAR-CRIA-007`: o tipo **Referências visuais** entra no menu lateral do modal "Nova tarefa", com subtítulo, descrição e "Título das referências visuais". O "Acessar tarefa" dele leva ao `board.html` (`js/atividade.js`). |
| 1.9.0 | 2026-09-23 | Nova `ATV-TAR-CRIA-006`: subtítulo e descrição do tipo escolhido, "Título da pesquisa" no tipo Pesquisa, e os textos de exemplo saíram de dentro dos campos. Tarefa antiga com tipo fora do catálogo (`sem_tela`) abre a edição sem subtítulo, pelo mesmo motivo de não marcar nada na lateral. |
| 1.13.0 | 2026-09-23 | `ATV-GERAR-015` revista: a Matriz CSD gerada abre já classificando. O "Acessar" de tarefa `matriz_csd` passa os quatro ids (`matriz-csd.md`, `MATRIZ-004`). |
| 1.12.0 | 2026-09-23 | §1.8 revista: **ATV-GERAR-010 a 017**. "Gerar com ajuda da IA" deixou de ser heurística no cliente: considera o tipo escolhido no modal, chama o Senior Product Designer no servidor (`POST .../tarefas/gerar`, `api/src/rotas/gerar-tarefa.ts`) e cria a tarefa — Pesquisa já pesquisando, Referência já com os cards, Matriz CSD sem conteúdo (ATV-GERAR-015). ATV-GERAR-001/002/003/006 revogadas. |
| 1.8.0 | 2026-09-23 | Nova `ATV-TAR-CRIA-005`. O select "Que tipo de tarefa é esta" saiu do formulário do modal "Nova tarefa", e o menu lateral passou a ser a escolha do tipo. Antes a lateral tinha quatro categorias que não faziam nada: "Mais utilizados", "Pesquisa", "Entregáveis" e "Dinâmicas". Agora tem só "Pesquisa" e "Matriz CSD", os dois tipos do catálogo. O valor continua em `#taskTipo`, agora um input escondido, então a proposta vinda da URL (`BOARD-PESQUISA-086`) e o "Gerar com ajuda da IA" (`ATV-GERAR`) seguem funcionando sem mudança. Corrige também a edição: o select mostrava "Pesquisa" até numa Matriz CSD; a lateral mostra o tipo real e fica travada. |
| 1.7.0 | 2026-09-13 | Conferência de `atividade.html` contra o código. Duas seções novas: **§1.7 `ATV-TAR-EDIT`** — a rota `PUT` estava no ar desde antes, citada de passada na §2, e nunca teve regra; a linha do histórico da v1.1.0 que a dava por não implementada seguia valendo por engano. E **§1.8 `ATV-GERAR`** — o botão "Gerar com ajuda da IA" é servido por `js/orquestrador-gateway.js` (722 linhas, governadas por `Skills/orquestrador-atividades.skill`) sem nenhuma regra até aqui; fica registrado que a proposta é heurística **no cliente**, sem chamada a modelo, sem consumo de crédito e fora das garantias de `IA-GARANT`. Nome do botão mantido por decisão do Ricardo, com a consequência aceita escrita em ATV-GERAR-003. Contrato do `PUT` acrescentado à §2 e o título dela corrigido — dizia "rascunho, nada implementado ainda" com as seis rotas no ar. P4 resolvida, P9 atualizada, duas pendências novas. |
| 1.6.0 | 2026-08-29 | Acompanha a decisão A31 ([`board-lista.md`](board-lista.md) v1.2.0): **toda tarefa passa a ter um espaço de trabalho**. O tipo `sem_tela` saiu do catálogo — ele era o padrão, e por isso as tarefas criadas antes do campo `tipo` existir ficaram sem o botão "Acessar tarefa" e sem como ganhar um. O padrão virou `pesquisa`, inclusive para a **tarefa-semente** de `ATV-ACESSO-002`, agora explícito em `tarefas.ts` (antes herdava o default do banco). O seletor do modal "Nova tarefa" virou "Que tipo de tarefa é esta", com os dois tipos reais. |
| 1.5.0 | 2026-08-29 | Resolve **P3** (§5) e liga esta tela ao novo `board.html`: a tarefa ganhou o campo `tipo` e o "Acessar tarefa" passou a rotear por ele em `js/atividade.js`, em vez de comparar o texto do título com "Matriz CSD" — o mesmo defeito que `IDEIA-MOV-015` já corrigira em outro lugar. Tarefa `sem_tela` não mostra mais o botão (antes ele aparecia sempre e, fora do caso "Matriz CSD", não fazia nada). O modal "Nova tarefa" ganhou o campo "Onde esta tarefa acontece". As regras do quadro em si estão em [`board-lista.md`](board-lista.md) v1.0.0. |
| 1.4.0 | 2026-08-29 | O painel "Assistente de IA" desta tela, que não funcionava (conversa fixa em HTML, sem `js/ia.js` incluído), agora é o mesmo assistente de `visao_do_projeto.html`: `js/ia.js` passou a ser incluído em `atividade.html`, a marcação do painel (`assistant-thread`, `composer-actions`) ganhou os ids `iaThread`/`iaAviso`/`iaEnviar` que o módulo exige, o CSS de `.ia-*`/`.composer-aviso`/estados `:disabled` (ausente neste arquivo) foi copiado de `visao_do_projeto.html`, e `js/atividade.js` passou a gravar `window.EmpresaAtual`/`window.ProjetoAtual` e chamar `IaAssistente.carregar()` depois de resolver empresa e projeto — mesma sequência de `js/ideias.js`. Resolve P8 (Decisão A23): a conversa é a mesma do projeto (`IA-CONV-001`), não uma dimensão nova por atividade. Verificado ao vivo: painel carrega o convite/histórico existente, uma pergunta feita em `atividade.html` recebe resposta real da API, e ao recarregar a página a mesma conversa aparece — confirmando que é a conversa do projeto, compartilhada com `visao_do_projeto.html`. |
| 1.3.0 | 2026-08-29 | Nova seção `ATV-TAR-EXCLUI` (§1.5), implementando de verdade a exclusão de tarefa: rota `DELETE .../tarefas/:tarefaId` em `api/src/rotas/tarefas.ts` (apaga a linha, sem arquivamento — decisão A22), `AtividadeAcoes.excluir` em `js/atividade.js`, e o handler de `confirmTaskDeleteBtn` em `atividade.html` reescrito para chamar a API real e só remover o card depois da confirmação (antes era só DOM, `task.remove()` sem persistência). Resolve a metade "excluir" de P9 e a pendência "Excluir tarefa" (§5) — duplicar (P10) continua aberto. `ATV-CONCLUIR` renumerada de §1.5 para §1.6 para abrir espaço. Verificado ao vivo: tarefa criada, excluída, e confirmada ausente depois de recarregar a página (exclusão real, não só visual). |
| 1.2.0 | 2026-08-29 | Nova seção `ATV-CONCLUIR` (§1.5), descrevendo o botão "Concluir atividade" em si: confirmação, gravação pela API real (`IDEIA-MOV-014/015/016`), redirecionamento para `visao_do_projeto.html` e o alerta flutuante de confirmação — que agora aparece na tela de destino, não na de origem (`ATV-CONCLUIR-004`, Decisão A21). Implementado em `js/atividade.js` (`concluirAtividade` acrescenta `?atividade_concluida=1` à URL de retorno) e `visao_do_projeto.html` (lê o parâmetro, mostra o alerta e limpa a URL). Verificado ao vivo: idéia movida para "Finalizado", alerta exibido, URL limpa. |
| 1.1.1 | 2026-08-28 | Verificado ao vivo (Acessar, criar, reordenar, concluir/reabrir tarefa, Concluir atividade — todos persistindo de verdade). Corrigido um bug encontrado na verificação: o selo de status (`.task-status`) que os botões "Concluir tarefa"/"Reabrir tarefa" atualizam na hora não estava trocando o rótulo visível ("Tarefa"/"Concluída") nem a classe `task-status--labeled`, então o selo virava um círculo sem texto até a página ser recarregada. |
| 1.1.0 | 2026-08-28 | **Implementado.** Tabela `tarefas` (schema + migração manual `20260828000000_tarefas`), rotas `GET`/`POST`/`PATCH .../ordem`/`PATCH .../status` em `api/src/rotas/tarefas.ts` (registradas em `servidor.ts`), e `atividade.html` reescrita para consumir a API real via `js/atividade.js` (novo arquivo): título dinâmico da idéia, lista de tarefas carregada por "encontra ou cria", criação persistida (corrige o bug do protótipo que não anexava o card criado), arrastar/setas persistindo `ordem` com reversão em falha, concluir/reabrir tarefa persistindo `status` sem navegar para fora da tela (corrige o redirect indevido), e "Concluir atividade" agora move a idéia de verdade (`IDEIA-MOV-014/015`) em vez de só navegar. As duas pontes por `localStorage` (`tarefa-1-status`, `nova-tarefa`) foram removidas. Editar/duplicar/excluir tarefa **não** foram implementados — continuam só-na-tela, sem persistência, porque não fazem parte das regras desta versão (P9/P10/"Excluir tarefa" seguem abertas, §5). O botão "Acessar" em `visao_do_projeto.html` também foi religado: hoje ele move a idéia e abre `atividade.html` quando o card já está em "Em andamento"; o caso "Finalizado" manteve o comportamento anterior (P3 segue aberta). |
| 1.0.0 | 2026-08-28 | Documento criado, a partir de `atividade-analise-pre-implementacao.md`. Define o que é a atividade (§0 — sem tabela própria, é a idéia), como ela nasce (`ATV-ACESSO`), como se adiciona tarefa (`ATV-TAR-CRIA`), como se prioriza por ordem (`ATV-TAR-ORDEM`) e como se conclui uma tarefa (`ATV-TAR-CONCLUIR`). Contrato de API e modelo de dados em rascunho. Decisões A17 a A20. |
