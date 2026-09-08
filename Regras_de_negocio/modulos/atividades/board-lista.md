# Regras de Negócio — Quadro de Trabalho de uma Tarefa

> **Versão:** 1.4.0 · **Status:** Implementado e verificado ao vivo (backend + `board.html` + `atividade.html`)
> **Módulo:** Atividades · **Página:** `board.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`atividade-lista.md`](atividade-lista.md) — de onde vem a tarefa e quem pode mexer nela · [`board-analise-pre-implementacao.md`](board-analise-pre-implementacao.md) — o levantamento que precedeu estas regras · [`ideias-movimentacao.md`](../ideias/ideias-movimentacao.md) · [`ia-assistente-conversa.md`](../ia/ia-assistente-conversa.md)

Uma tarefa da atividade pode ter um espaço de trabalho próprio: um canvas onde a pessoa monta quadros de colunas e enche de registros. É isso que `board.html` é. Ela não substitui a lista de tarefas — ela é o *dentro* de uma tarefa.

---

## 1. Regras

### 1.1 Como se chega aqui — `BOARD-ACESSO`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-ACESSO-001 | O campo **`tipo`** da tarefa decide **o que acontece** quando ela é acessada. Hoje os dois tipos abrem uma tela local (`pesquisa` → `board.html`, `matriz_csd` → `matriz_csd.html`); amanhã um tipo pode disparar uma ferramenta externa que traz o conteúdo pronto. Nunca se decide pelo texto do título. | Decisão A24, ampliada por A31 |
| BOARD-ACESSO-002 | **Toda tarefa tem um espaço de trabalho.** `tipo` é escolhido na criação e o padrão é **`pesquisa`** — inclusive para a tarefa-semente (`ATV-ACESSO-002`). Não existe tarefa sem destino. | Decisão A31 |
| BOARD-ACESSO-007 | O catálogo de tipos é **fechado no banco** e cresce por migração — nunca por texto livre. Um tipo cujo destino ainda não foi construído não mostra o botão "Acessar tarefa" (rede de segurança de A13), mas isso é estado de obra, não um tipo válido em produção. | Decisão A31 |
| BOARD-ACESSO-003 | `board.html` só abre com os **quatro ids** na URL (`empresa`, `projeto`, `ideia`, `tarefa`). Faltando qualquer um, é navegação inválida: volta para o lugar mais próximo que ainda faz sentido, não mostra estado vazio. | Decorre de IDEIA-ISO-002 |
| BOARD-ACESSO-004 | O painel da esquerda mostra o título, a descrição e o status **da tarefa de verdade**, lidos da API. | Decorre de ATV-ACESSO-005 |
| BOARD-ACESSO-005 | Tarefa concluída abre em **somente leitura** — sem criar, editar, mover ou excluir. O modo vem do `status` da tarefa, nunca de um parâmetro na URL. | Decisão A27 |
| BOARD-ACESSO-006 | São **dois caminhos** até a tela — o botão "Acessar tarefa" do card e o item "Acessar" do menu de três pontinhos — e os dois usam o **mesmo destino**, calculado uma vez por card. Nenhum dos dois decide para onde ir por conta própria. | Decorre de IDEIA-MOV-009 |

**Por que o `tipo` e não o título (BOARD-ACESSO-001).** O protótipo decidia o destino comparando o texto do título com `"Matriz CSD"`. É exatamente o defeito que `IDEIA-MOV-015` já teve que corrigir na ponte entre o quadro de idéias e a atividade, e quebra das mesmas três maneiras: dois títulos iguais, título editado depois, e nenhuma forma de uma tarefa nova declarar que tela ela quer. Um campo fechado no banco resolve os três.

**Por que `sem_tela` deixou de existir (BOARD-ACESSO-002).** A v1.0.0 tinha um terceiro tipo, `sem_tela`, para a tarefa que era só um item de lista — e ele era o padrão. Isso quebrou em uso real: toda tarefa criada antes da migração herdou `sem_tela`, ficou sem o botão "Acessar tarefa", e — como não existe rota para editar o tipo de uma tarefa — ficou **permanentemente sem como abrir**. Duas tarefas órfãs na mesma atividade.

A correção não foi mostrar o botão mesmo assim: foi remover o conceito. Toda tarefa tem onde trabalhar, e o tipo diz **que trabalho é**, não **se existe trabalho**. O padrão passou a ser `pesquisa` porque descobrir é o primeiro movimento de qualquer atividade — é o que a tarefa-semente faz por definição, copiando título e descrição da idéia.

**Por que o campo se chama `tipo` e não `tela` (BOARD-ACESSO-001).** Porque a tela é consequência, não a coisa. Hoje escolher "Pesquisa" abre um quadro em branco para a pessoa preencher; a intenção é que passe a disparar uma busca externa que devolve o quadro **já preenchido** com o que ela procurava. O nome do campo precisa sobreviver a essa mudança — e sobrevive, porque o que a pessoa escolhe é o tipo de trabalho, não o destino do clique.

**Por que os dois caminhos leem o mesmo valor (BOARD-ACESSO-006).** É `IDEIA-MOV-009` outra vez ("três gestos, uma porta"): dois caminhos para a mesma ação são duas chances de divergirem — alguém corrige o roteamento do botão e esquece do menu, e a tela passa a levar a lugares diferentes dependendo de onde se clicou. Era exatamente o estado anterior: o botão do card já roteava pelo `tipo`, enquanto o menu ainda comparava o título com "Matriz CSD" e, em qualquer outra tarefa, fechava sem fazer nada. O destino agora é calculado uma vez, gravado no card como `data-destino`, e lido pelos dois.

**Por que o modo leitura vem do status (BOARD-ACESSO-005).** Antes vinha de `?modo=leitura` na URL — quer dizer, de qualquer coisa que a pessoa digitasse na barra de endereço. Uma tarefa concluída abria editável se o parâmetro sumisse, e uma pendente abria travada se alguém colasse o link errado. O status está no banco; a query string é palpite.

### 1.2 O quadro — `BOARD-QUADRO`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-QUADRO-001 | O quadro pertence à **tarefa**, não à atividade. Cada tarefa tem o seu; abrir outra tarefa mostra outro quadro. | Decisão A25 |
| BOARD-QUADRO-002 | A estrutura é **quadro > coluna > registro**. Um quadro tem N colunas; cada coluna tem N registros. | Interface existente |
| BOARD-QUADRO-003 | Título de **quadro** e de **coluna** podem ser vazios — é escolha de layout, e a interface já oferece "deixe em branco para uma coluna sem título". O título do **registro** não pode: um card sem texto é um card que ninguém sabe ler. | Interface existente |
| BOARD-QUADRO-004 | **A tela é sempre o canvas.** Não existe estado vazio de tela cheia: tarefa sem quadro mostra a mesma superfície de trabalho, com "Novo quadro" no rodapé. | Decisão A33 |
| BOARD-QUADRO-005 | Excluir a tarefa apaga o quadro dela junto. | Decorre de ATV-TAR-EXCLUI-001 |

**Por que o quadro é da tarefa (BOARD-QUADRO-001).** A alternativa — um quadro por atividade, compartilhado por todas as tarefas dela — era defensável: daria um espaço comum onde o trabalho de várias tarefas se encontra. Perdemos isso de propósito. A tela abre no contexto de **uma** tarefa e mostra o título dela no painel da esquerda; um quadro compartilhado faria duas tarefas diferentes mostrarem o mesmo conteúdo sob dois títulos diferentes, e ninguém saberia a qual das duas um registro pertence.

**Por que três tabelas e não um `Json` (BOARD-QUADRO-002).** Guardar o quadro inteiro como um documento seria menos código hoje. O registro, porém, é a unidade que a pessoa move, edita e um dia vai querer procurar entre tarefas — e nada disso se consulta dentro de um blob. O custo de normalizar agora é uma migração; o de desnormalizar depois é uma migração **mais** todo o código que aprendeu a ler o blob.

**Por que não existe tela de estado vazio (BOARD-QUADRO-004).** Havia uma: ilustração, título e um botão "Novo quadro", ocupando a tela inteira no lugar do canvas. Ela saiu por duas razões.

A primeira é que ela estava condenada. A direção do produto é que a tarefa **chegue com conteúdo** — criado por quem abriu, ou trazido por uma ferramenta externa a partir do `tipo` (§5). Uma tela cujo propósito é dizer "ainda não há nada aqui" desaparece junto com o problema que ela descreve; construir em cima dela é construir sobre algo que se sabe temporário.

A segunda é que ela atrapalhava agora. Para aparecer, escondia o canvas **e o painel do assistente** — exatamente no momento em que o assistente é mais útil, porque a pessoa ainda não sabe por onde começar. O convite custava o recurso que atenderia o convite.

O canvas vazio não é um erro a ser explicado: é uma mesa limpa, com as ferramentas à mão no rodapé.

### 1.3 Gravar — `BOARD-SALVA`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-SALVA-001 | Cada gesto no canvas (criar quadro, criar/editar/excluir registro, arrastar entre colunas) **grava o quadro inteiro**. Não há botão "salvar". | Decisão A26 |
| BOARD-SALVA-002 | A fonte da verdade na hora de gravar é o **que está na tela**. Não existe um modelo paralelo em memória para sair de sincronia com o DOM. | Decisão A26 |
| BOARD-SALVA-003 | A resposta da gravação é o quadro **relido do banco**, e a tela redesenha a partir dela. Ids de registro não sobrevivem entre uma gravação e a seguinte — a tela nunca depende deles. | Decisão A26 |
| BOARD-SALVA-004 | Quem pode gravar no quadro são os mesmos três papéis que podem mexer nas tarefas (`ATV-TAR-CRIA-004`). | Decorre de ATV-TAR-CRIA-004 |
| BOARD-SALVA-005 | Um `404` ao gravar significa que a tarefa deixou de existir enquanto a pessoa trabalhava. A tela volta para a atividade em vez de insistir. | Decorre de IDEIA-MOV-013 |
| BOARD-SALVA-006 | **Nada é gravado antes de o quadro ter sido carregado com sucesso.** Enquanto a carga não termina — ou se ela falha —, a tela vazia significa "ainda não chegou", não "quadro vazio". | Decisão A30 |

**Por que um PUT do quadro inteiro (BOARD-SALVA-001).** A alternativa seria uma rota por gesto: criar coluna, renomear quadro, mover registro, excluir card. Duas coisas empurraram para o outro lado. A tela já salvava sozinha a cada gesto — o "Salvando..." do botão Voltar existia desde o protótipo, só que sem gravar nada —, então seriam doze rotas servindo a um único autosave. E arrastar um registro entre colunas muda **duas** colunas ao mesmo tempo: com estado inteiro isso é o caso comum, com rota por gesto é o caso especial que sempre esquece de ser tratado.

**Por que a trava de BOARD-SALVA-006 existe.** É o outro lado de `BOARD-SALVA-002`: se o que manda é o que está na tela, então uma tela que ainda não recebeu os dados manda uma lista vazia — e o PUT, que substitui tudo, apaga o quadro da pessoa. Não é hipótese: aconteceu em teste. A pessoa abriu a tela, a carga não tinha terminado, um autosave disparou e o quadro sumiu do banco. Por isso a regra não é "avisar" nem "tentar de novo": é **não gravar**, porque uma gravação errada aqui é destrutiva e silenciosa.

A trava não impede esvaziar um quadro de propósito — depois da carga, apagar o último card e gravar vazio é uma gravação legítima. Ela só separa "vazio porque a pessoa esvaziou" de "vazio porque nada chegou".

**O preço, declarado.** Duas pessoas no mesmo quadro ao mesmo tempo: a última gravação vence, sem aviso, e o trabalho da outra some. É a mesma troca que `ideias-movimentacao.md` §4 já aceitou para movimentação de idéias, pelo mesmo motivo (o volume de uso atual), e está registrada em §5 como pendência — não como detalhe resolvido.

### 1.4 A tarefa, vista daqui — `BOARD-TAREFA`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-TAREFA-001 | Finalizar e reabrir a tarefa usam a **mesma rota** de `ATV-TAR-CONCLUIR`. Só mudam `status`. | Decorre de ATV-TAR-CONCLUIR-001 |
| BOARD-TAREFA-002 | Excluir a tarefa usa a **mesma rota** de `ATV-TAR-EXCLUI`, e leva de volta para a atividade. | Decorre de ATV-TAR-EXCLUI-001 |
| BOARD-TAREFA-003 | **Editar** título e descrição da tarefa **não acontece aqui** — acontece em `atividade.html`. | Decisão A28 |
| BOARD-TAREFA-004 | Concluir uma tarefa **não move a idéia** para "Finalizado" e **não tira a pessoa da tela**. Quem move a idéia é concluir a atividade inteira. | Decorre de IDEIA-MOV-014 |
| BOARD-TAREFA-005 | Voltar leva à **mesma atividade**, com empresa, projeto e idéia na URL. | Decorre de ATV-ACESSO-001 |

**Por que editar não acontece aqui (BOARD-TAREFA-003).** Duas telas gravando o mesmo campo é a receita de divergirem — é o mesmo raciocínio de `IDEIA-MOV-009` ("três gestos, uma porta"), aplicado a telas em vez de gestos. `atividade.html` já lista todas as tarefas e é o lugar natural para renomear uma. O botão que existia aqui, aliás, nunca gravou nada: reescrevia o texto na tela e pronto — e o backend não tem, até hoje, rota de edição de tarefa.

**O que BOARD-TAREFA-004 conserta.** O protótipo, ao concluir uma tarefa, gravava duas chaves de `localStorage`: `tarefa-1-status` (que só funcionava para uma tarefa fixa) e `idea-finalizada`, que criaria uma idéia **nova** direto na coluna "Finalizado" — contradizendo `IDEIA-CRIA-003` ("toda idéia nasce em Minhas idéias"). E redirecionava para fora. Concluir uma tarefa é um evento pequeno: não move idéia, não cria idéia, e não interrompe quem está trabalhando.

### 1.5 Registro vira tarefa — `BOARD-REGISTRO`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-REGISTRO-001 | Um registro do quadro pode virar uma **tarefa da atividade**, pela mesma rota de `ATV-TAR-CRIA`: nasce no fim da lista, pendente e `pesquisa`. | Interface existente |

**Por que existia e não funcionava.** O menu do card já oferecia "Nova tarefa" desde o protótipo — gravava o registro em `localStorage` e navegava para a atividade. Quando `atividade.html` passou a usar a API, parou de ler essa chave, e o botão virou uma navegação que não criava nada. A ponte foi refeita pela rota real.

### 1.6 O assistente — `BOARD-IA`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-IA-001 | A pesquisa por IA e a compra de créditos **não existem nesta versão**. O botão "Pesquisar" fica visível e desativado, com explicação — não abre cobrança nem finge saldo. | Decisão A29 |
| BOARD-IA-002 | O painel do assistente é a **mesma conversa do projeto** (`IA-CONV-001`), como em `visao_do_projeto.html` e `atividade.html`. Abrir um quadro não cria dimensão nova de conversa. | Decorre de IA-CONV-001 |

**Por que desativado e não removido (BOARD-IA-001).** O que a tela fazia era encenação: o saldo "0 de 100" estava escrito no HTML, e clicar em "Pesquisar" sempre abria "Créditos insuficientes" — um modal sobre um sistema de créditos que não existe em lugar nenhum do produto. Isso depende da **decisão D2** (crédito por usuário ou por empresa), aberta desde o módulo de empresas e que bloqueia a publicação. Um botão desativado com explicação é honesto sobre o que ainda não existe; um botão que finge cobrar, não. Remover também seria defensável — ficou visível porque a pesquisa é o motivo pelo qual esta tela vai existir, e escondê-la faria a intenção do produto sumir do lugar onde ela deve estar.

### 1.7 Tarefa concluída não se mexe — `BOARD-LEITURA`

| ID | Regra | Fonte |
|---|---|---|
| BOARD-LEITURA-001 | Tarefa com status **concluída** abre em somente leitura. O quadro fica visível e legível; nada nele pode ser criado, movido, editado ou excluído. | Decisão A32 |
| BOARD-LEITURA-002 | Em somente leitura ficam indisponíveis: **arrastar registros**, editar título e descrição de registro, **"Novo registro"**, **"Novo quadro"**, os menus de card e de quadro (incluindo excluir) e a edição do título do quadro. | Decisão A32 |
| BOARD-LEITURA-003 | **"Pesquisar" fica desativado** numa tarefa concluída — pesquisar reescreveria o resultado que a conclusão congelou. Isso vale **independentemente** de `BOARD-IA-001`: se um dia a pesquisa for liberada, a tarefa concluída continua sem ela. | Decisão A32 |
| BOARD-LEITURA-004 | Em somente leitura **nada é gravado**: o autosave não dispara, nem para um gesto que tenha escapado de alguma trava. | Decisão A32 |
| BOARD-LEITURA-005 | O único caminho para voltar a editar é **reabrir a tarefa** (`BOARD-TAREFA-001`). Reabrir devolve a tela ao estado editável na hora, sem recarregar. | Decisão A32 |
| BOARD-LEITURA-006 | O modo vem do **`status` da tarefa**, não de um parâmetro na URL. Ver `BOARD-ACESSO-005`. | Decisão A27 |

**Por que congelar, e não apenas avisar.** Concluir uma tarefa é a afirmação de que aquele trabalho chegou a um resultado. Se o quadro continuasse editável, "concluída" viraria só um rótulo — o resultado poderia mudar depois de dado como pronto, e ninguém saberia se o que está na tela é o que foi concluído ou o que alguém mexeu depois. Travar a edição faz o status significar algo verificável.

**Por que reabrir é a única saída (BOARD-LEITURA-005).** A alternativa seria deixar editar e mudar o status sozinho, ou pedir confirmação a cada gesto. As duas transformam uma decisão — "isto não está mais pronto" — em efeito colateral de um clique. Reabrir é explícito, é uma linha só de esforço, e deixa o estado da tarefa sempre igual ao que a pessoa declarou.

**Por que BOARD-LEITURA-003 não depende de BOARD-IA-001.** Hoje "Pesquisar" está desativado para todo mundo, aguardando a decisão D2 dos créditos — então a regra parece redundante. Ela existe para o dia em que D2 sair: quem for reativar o botão mexe em `BOARD-IA-001`, e sem esta regra separada a liberação vazaria para as tarefas concluídas sem ninguém notar. A trava está no código como uma desativação que **só desativa, nunca ativa**, exatamente para sobreviver a essa mudança.

---

## 2. Contrato da API

Todas autenticadas pelo cookie de acesso, e todas sob a corrente completa: **empresa → projeto → idéia → tarefa**. Qualquer elo que falhe devolve `404` com a mesma mensagem, pelo mesmo motivo de `IDEIA-ISO-004`: não contar a quem está adivinhando ids se a coisa não existe ou só não é dele.

### `GET /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/quadros`

Devolve `{ quadros: [...] }`, cada quadro com suas colunas e cada coluna com seus registros, em ordem. **Lista vazia é resposta válida** e significa "tarefa sem quadro ainda".

Diferente de `GET .../tarefas`, aqui **não** existe "encontra ou cria": um quadro-semente seria conteúdo que ninguém pediu.

### `PUT /empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/quadros`

**Corpo:** `{ quadros: [ { titulo, colunas: [ { titulo, registros: [ { titulo, descricao } ] } ] } ] }`

Substitui o quadro inteiro da tarefa, numa transação. Devolve o quadro relido do banco.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ quadros }` | Redesenha a partir da resposta |
| Registro sem título, ou campo acima do limite | `400` com `campo` | Mostra o erro; o canvas continua como está |
| Sessão inválida | `401` | Renovação silenciosa; só então login |
| Papel não permite escrever | `403` | Mostra o erro |
| Qualquer elo da corrente falha | `404` | Volta para a atividade (BOARD-SALVA-005) |

Tetos: 40 quadros por tarefa, 12 colunas por quadro, 200 registros por coluna. Existem para recusar um payload absurdo antes de virar transação — não porque alguém vá esbarrar neles.

### Rotas reaproveitadas

Nenhuma rota nova para o ciclo de vida da tarefa. `board.html` chama exatamente as mesmas de `atividade.html`:

- `PATCH .../tarefas/:tarefaId/status` — finalizar e reabrir (`ATV-TAR-CONCLUIR`)
- `DELETE .../tarefas/:tarefaId` — excluir (`ATV-TAR-EXCLUI`)
- `POST .../tarefas` — registro vira tarefa (`ATV-TAR-CRIA`)

---

## 3. Modelo de dados

```
tarefas
  ...                                             -- já existia
  tipo   TipoTarefa NOT NULL DEFAULT 'pesquisa'   -- BOARD-ACESSO-001/002
         -- enum: 'pesquisa' | 'matriz_csd'  (A31 retirou 'sem_tela')

quadros
  id            uuid (pk)
  tarefa_id     uuid (fk -> tarefas.id, CASCADE)
  titulo        varchar(60) NOT NULL DEFAULT ''   -- vazio é válido
  ordem         integer
  criado_em     timestamp
  atualizado_em timestamp

quadro_colunas
  id        uuid (pk)
  quadro_id uuid (fk -> quadros.id, CASCADE)
  titulo    varchar(60) NOT NULL DEFAULT ''       -- vazio é válido
  ordem     integer

registros
  id            uuid (pk)
  coluna_id     uuid (fk -> quadro_colunas.id, CASCADE)
  titulo        varchar(60) NOT NULL              -- CHECK: não vazio
  descricao     varchar(280) NOT NULL DEFAULT ''
  ordem         integer
  criado_em     timestamp
  atualizado_em timestamp
```

**Sobre o `CASCADE`.** Em `tarefas` o cascade é rede de segurança — na prática idéias são arquivadas, não apagadas. Aqui ele é **real**: `ATV-TAR-EXCLUI-001` apaga a linha da tarefa de verdade, e o quadro dela precisa ir junto. Um quadro órfão não teria como ser alcançado nem apagado por ninguém depois.

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| A24 *(o padrão `sem_tela` foi revogado por A31)* | Como o "Acessar tarefa" decide a tela de destino (P3)? | Por um campo **`tipo`** na tarefa (`pesquisa`/`matriz_csd`/`sem_tela`), escolhido na criação, com padrão `sem_tela`. Nunca pelo texto do título — mesmo defeito que `IDEIA-MOV-015` corrigiu. | 29/08/2026 |
| A25 | O quadro pertence à tarefa ou à atividade? | **À tarefa.** A tela abre no contexto de uma tarefa e mostra o título dela; um quadro compartilhado faria duas tarefas mostrarem o mesmo conteúdo sob títulos diferentes. | 29/08/2026 |
| A26 | Uma rota por gesto, ou grava o quadro inteiro? | **Inteiro, num PUT.** A tela já salvava a cada gesto, e arrastar entre colunas muda duas colunas de uma vez. Preço aceito e declarado: edição simultânea, a última vence (§5). | 29/08/2026 |
| A27 | O modo somente leitura vem de onde? | **Do `status` da tarefa**, não de `?modo=leitura`. A query string é palpite de quem digitou a URL; o status está no banco. | 29/08/2026 |
| A28 | Editar tarefa acontece nesta tela? | **Não.** Só em `atividade.html`, que já lista todas as tarefas. Duas telas gravando o mesmo campo divergem — e o backend nem tem rota de edição de tarefa. | 29/08/2026 |
| A29 | O que fazer com "Pesquisar" e a compra de créditos, que dependem de D2? | **Desativar com explicação, não remover.** O saldo era fixo no HTML e o clique só abria "Créditos insuficientes" — encenação. Fica visível porque é o motivo de a tela existir, mas não finge cobrar. | 29/08/2026 |
| A30 | O autosave pode gravar antes de o quadro ter carregado? | **Não.** A tela é a fonte do que se grava (`BOARD-SALVA-002`), e uma tela que ainda não carregou não representa nada — gravar ali apaga o quadro do banco. Só grava depois que o servidor respondeu e a tela foi desenhada. | 29/08/2026 |
| A31 | Existe tarefa que é só um item da lista, sem espaço de trabalho? | **Não.** `sem_tela` foi retirado do catálogo: ele era o padrão, e por isso toda tarefa anterior à migração ficou sem botão "Acessar tarefa" e sem como ganhar um — defeito observado em uso. O padrão passou a ser `pesquisa`, e o `tipo` diz que **tipo de trabalho** a tarefa é, não se existe trabalho. | 29/08/2026 |
| A32 | Tarefa concluída pode ter o quadro editado? | **Não.** O resultado fica congelado: nada de arrastar, editar, criar, excluir ou pesquisar, e o autosave não dispara. Quem quiser mudar **reabre a tarefa** — decisão explícita, não efeito colateral de um clique. Sem isso, "concluída" seria só um rótulo. | 29/08/2026 |
| A33 | Manter a tela de estado vazio? | **Não.** Ela some junto com o problema que descreve: a direção é a tarefa chegar com conteúdo, criado ou trazido por ferramenta externa. E enquanto existia, escondia o canvas **e o assistente** — o convite custava o recurso que atenderia o convite. Tarefa sem quadro mostra o canvas com "Novo quadro" no rodapé. | 29/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| **Créditos — decisão D2** | Bloqueia `BOARD-IA-001`. Aberta desde o módulo de empresas: crédito por usuário ou por empresa. Enquanto não for decidida, "Pesquisar" segue desativado. |
| Pesquisa por IA (Q4 da análise) | Não decidido se segue o padrão de proposta/confirmação do `IA-ACAO` (a IA propõe, a pessoa confirma) ou é outro fluxo. A função que monta o quadro de resultado (`criarQuadroResultado`) ficou no código, sem gatilho, esperando essa decisão. |
| **Ferramentas externas por tipo** | A direção acordada em 29/08/2026: o `tipo` deve poder disparar uma **chamada externa** que traz o conteúdo pronto, em vez de abrir um quadro em branco. O caso concreto é `pesquisa` integrar uma ferramenta de busca na internet (Manus) e devolver o quadro já preenchido com o que a pessoa procurava. **Não construído** — decidido explicitamente adiar. Quando entrar, `BOARD-ACESSO-001` já cobre a regra; falta o contrato da chamada, o custo (ver D2) e o que acontece quando a ferramenta falha ou demora. |
| Tipos novos no catálogo | Hoje são dois (`pesquisa`, `matriz_csd`). Citados como prováveis: jornada de usuário, entregáveis, dinâmicas. Cada um exige decidir o que acontece ao acessar — tela local ou ferramenta externa — e entra por migração (`BOARD-ACESSO-007`). |
| Edição simultânea | Duas pessoas no mesmo quadro: a última gravação vence, sem aviso (`BOARD-SALVA-001`). Mesma pendência já aceita em `ideias-movimentacao.md` §4. Revisitar se o uso colaborativo crescer. |
| "Solicitar ajuda do Designer" | O botão saiu por não ter comportamento nenhum. O que essa ação deveria fazer — abrir contato, criar um pedido, marcar a tarefa — segue sem definição (Q8 da análise). |
| Mudar o `tipo` de uma tarefa depois de criada | Hoje o tipo é escolhido na criação e não muda. Não decidido se deve ser editável, e o que acontece com o quadro de uma tarefa que deixa de ser `pesquisa`. |
| Excluir uma tarefa **concluída** | `BOARD-LEITURA` congela o conteúdo do quadro, mas "Excluir tarefa" continua disponível numa tarefa concluída — apagar a tarefa inteira não é "editar o resultado", é outra intenção, e `atividade.html` também permite. Não decidido se deveria exigir reabrir antes. |
| `matriz_csd.html` | Continua sem falar com a API — o `tipo` já roteia para ela, mas aquela tela tem a mesma dívida que esta tinha. Pendência própria dela. |
| Cor do card | O canvas guarda a cor escolhida em `data-cor`, mas ela **não é gravada**: `registros` não tem coluna de cor. Recarregar devolve todos ao amarelo padrão. Fora do escopo desta versão. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.4.0 | 2026-08-29 | **Removida a tela de estado vazio** (decisão A33). `BOARD-QUADRO-004` deixou de ser "a tela convida a criar o primeiro quadro" e passou a ser "a tela é sempre o canvas". Saíram de `board.html`: a `<section class="empty">`, o CSS `.empty`/`body.is-empty` (que escondia o `#canvasViewport` **e o `.assistant`**), o botão `btnNovoQuadroVazio` com seu handler, e as três chamadas residuais a `classList.remove('is-empty')` — inclusive as duas no fluxo de pesquisa dormente. `BoardView.quadros()` não alterna mais classe nenhuma. A ilustração `img/pesquisa-vazio.svg` deixou de ser referenciada (o arquivo ficou). Motivo registrado em §1.2: a tela descrevia um estado que a evolução do produto elimina, e enquanto existia escondia o assistente justamente quando ele seria mais útil. **Verificado ao vivo** numa tarefa recém-criada, sem quadro nenhum: o canvas aparece com o painel da tarefa, o rodapé com "Novo registro"/"Novo quadro" e — o ponto — o assistente visível. "Novo quadro" pelo rodapé abre o modal normalmente. |
| 1.3.0 | 2026-08-29 | Nova seção **`BOARD-LEITURA`** (§1.7, decisão A32): tarefa concluída tem o quadro congelado. A maior parte já valia por `BOARD-ACESSO-005` (arrastar, editar inline, criar registro, criar quadro, excluir e o autosave já eram barrados por `modoLeitura`); a auditoria para escrever a regra encontrou duas frestas, agora fechadas: **"Novo quadro" continuava visível** em modo leitura (o clique não fazia nada — botão morto, contra A13) e o cursor de texto sobre título/descrição **prometia uma edição que já era recusada**. Acrescentado `BOARD-LEITURA-003`: "Pesquisar" passa a ser desativado **pelo status**, não só pela pendência de créditos — a trava só desativa e nunca ativa, para que a futura liberação de `BOARD-IA-001` (decisão D2) não vaze para tarefas concluídas. Nova pendência sobre excluir tarefa concluída. **Verificado ao vivo** numa tarefa concluída: arrastar recusado (card não se moveu na tela nem no banco), clique no título não abre edição, nenhum menu de card ou quadro visível, "Novo registro"/"Novo quadro" ausentes, "Pesquisar" desativado. Reabrir devolveu tudo na hora — e "Pesquisar" **continuou** desativado, confirmando que a trava do status e a de `BOARD-IA-001` são independentes. |
| 1.2.0 | 2026-08-29 | **`sem_tela` retirado do catálogo** (decisão A31), corrigindo um defeito observado em uso: as duas tarefas criadas antes da migração do `tipo` herdaram `sem_tela`, ficaram sem o botão "Acessar tarefa" e, sem rota para editar o tipo, sem nenhuma forma de ganhar um. O padrão passou a ser `pesquisa` — inclusive para a tarefa-semente de `ATV-ACESSO-002`, agora explícito em `tarefas.ts`. Migração `20260829120000_tarefa_sempre_com_quadro`: converte as linhas `sem_tela` em `pesquisa`, troca o default da coluna e recria o enum sem o valor (PostgreSQL não remove valor de enum no lugar). O seletor do modal "Nova tarefa" virou "Que tipo de tarefa é esta" com os dois tipos reais. `BOARD-ACESSO-001` foi ampliada: o `tipo` decide **o que acontece** ao acessar, não só que página abre — abrindo espaço para o tipo disparar uma ferramenta externa (Manus para `pesquisa`), registrado em §5 como direção acordada e **deliberadamente não construída** nesta versão. Nova `BOARD-ACESSO-007` sobre o catálogo fechado. |
| 1.1.0 | 2026-08-29 | **Corrigida uma perda de dados** e o painel do assistente. (1) `BOARD-SALVA-006` / decisão A30: o autosave gravava o que estava na tela mesmo antes de a carga terminar — com zero painéis na tela, o PUT (que substitui tudo) apagava o quadro do banco. Foi observado ao vivo: um quadro com colunas e card sumiu sozinho depois de um clique em "Voltar". Agora `js/board.js` só grava depois que o GET respondeu e a tela foi desenhada (`carregado`), e a tela nem anuncia "Salvando..." antes disso (`BoardAcoes.pronto()`). (2) O painel do assistente aparecia com o texto cortado na lateral: `board.html` tinha um comentário CSS corrompido no topo (`==================/* ... */1);`) que fazia o navegador descartar o reset `box-sizing:border-box` da página inteira — o mesmo defeito já corrigido em `atividade.html`. Sem border-box, `.assistant-inner` ficava 384px dentro de um painel de 320px com `overflow:hidden`. Verificado ao vivo: quadro preservado ao forçar um autosave durante a carga, gravação normal funcionando, e o assistente respondendo com o texto inteiro dentro do painel. **Varredura:** o mesmo comentário corrompido foi encontrado e corrigido em mais três páginas — `matriz_csd.html` (painel explicativo cortando texto em cima e embaixo), `Sobre_a_empresa.html` ("Sugestão de tarefa" cortado na borda direita) e `criar-empresa.html` (modal estourando a viewport). Nenhuma regra mudou: é o mesmo defeito de CSS, e as três foram conferidas visualmente antes e depois. Não resta nenhuma ocorrência no projeto. |
| 1.0.1 | 2026-08-29 | `BOARD-ACESSO-006`: o item "Acessar" do menu de três pontinhos passou a abrir `board.html` também. Na v1.0.0 só o botão "Acessar tarefa" do card tinha sido religado ao `tipo`; o menu continuava com o código do protótipo, que comparava o título com "Matriz CSD" e, em qualquer outra tarefa, fechava sem navegar. Os dois caminhos agora leem o mesmo `data-destino`, calculado uma vez por card em `js/atividade.js`, e o item some do menu quando a tarefa é `sem_tela` (regra de CSS, mesmo critério do botão). Junto: `.btn:disabled` ganhou estado visual — "Pesquisar" estava desativado de verdade mas com aparência de ativo. **Verificado ao vivo**: tarefa `pesquisa` criada pelo modal, aberta pelos três pontinhos, quadro de três colunas e um registro criados, página recarregada com tudo no lugar, "Voltar" preservando o contexto, e o menu de uma tarefa `sem_tela` sem o item "Acessar". |
| 1.0.0 | 2026-08-29 | Documento criado, a partir de [`board-analise-pre-implementacao.md`](board-analise-pre-implementacao.md). **Implementado.** Campo `tarefas.tipo` (enum `TipoTarefa`) e tabelas `quadros`/`quadro_colunas`/`registros` (migração manual `20260829000000_board_quadros`); rotas `GET`/`PUT .../tarefas/:tarefaId/quadros` em `api/src/rotas/board.ts`, registradas em `servidor.ts`; `board.html` religada à API por `js/board.js` (novo). Resolve a pendência **P3** de `atividade-lista.md`: o "Acessar tarefa" passou a rotear pelo `tipo` em vez de comparar o texto do título. Removido da tela: as três pontes por `localStorage` (`tarefa-1-status`, `nova-tarefa`, `idea-finalizada` — a última contradizia `IDEIA-CRIA-003`), a conversa de exemplo falsa do assistente (`IA-CONV-006`), o controle "Ver empty state" (ferramenta de pré-visualização), o botão "Solicitar ajuda do Designer" (sem comportamento) e o "Editar tarefa" com seu modal órfão (decisão A28). O assistente foi religado a `js/ia.js`, mesma conversa do projeto. "Pesquisar" e a compra de créditos ficaram desativados aguardando D2 (decisão A29). Decisões A24 a A29. |
