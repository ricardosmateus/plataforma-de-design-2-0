# Regras de Negócio — Criação e Edição de Idéias

> **Versão:** 1.4.0 · **Status:** Implementado · conferência parcial
> **Conferido em:** 16/09/2026, na investigação de por que o alerta de duplicidade não disparava: `duplicidade.ts`, as rotas de `ideias.ts` e a rota `/confirmar` de `ia.ts` conferidas contra o código e contra as 152 idéias reais do projeto Startup/iHouseLog; regras da modal (IDEIA-MODAL) ainda não
> **Módulo:** Idéias · **Página:** `visao_do_projeto.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ideias-quadro.md`](ideias-quadro.md) · [`ideias-movimentacao.md`](ideias-movimentacao.md) · [`ideias-exclusao.md`](ideias-exclusao.md)

---

## 1. Regras

### 1.1 Campos e limites — `IDEIA-CRIA`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-CRIA-001 | Uma idéia tem **título** (obrigatório, até 260 caracteres) e **descrição** (obrigatória, até 280). Os dois são texto livre digitado pelo usuário. | Interface existente |
| IDEIA-CRIA-002 | A **importância** vai de 0 a 5 estrelas e é **opcional**. Zero significa "sem prioridade definida", não "prioridade mínima". | Decisão I9 |
| IDEIA-CRIA-003 | Toda idéia nasce na coluna "Minhas idéias" (`status = 'ideias'`). Não é possível criar já em outra coluna. | Interface existente |
| IDEIA-CRIA-004 | Podem criar e editar: **proprietário**, **membro** e **especialista**. | Decisão I8 |
| IDEIA-CRIA-005 | Os limites de 60 e 280 são validados **no servidor**, não só pelo `maxlength` do campo. | Decorre de EMP-CRIA-002 |
| IDEIA-CRIA-006 | Título e descrição vazios, ou compostos só de espaços, são recusados. | Interface existente |
| IDEIA-CRIA-007 | Duas idéias do mesmo projeto **podem** ter o mesmo título. Não há unicidade. | Decisão I10 |

**Por que a importância é opcional (IDEIA-CRIA-002).** O protótipo abre a modal com as cinco estrelas apagadas e não impede salvar assim — e isso está certo. No momento em que a idéia surge, o usuário frequentemente ainda não sabe o peso dela; obrigar uma nota nesse instante produz números inventados, que depois poluem a ordenação por relevância. Zero é um estado honesto: "ainda não pensei nisso".

**Por que títulos repetidos são permitidos (IDEIA-CRIA-007).** É deliberado, e tem consequência. Empresa tem nome único (EMP-CRIA-004) porque nome de empresa é identidade. Idéia não é: "Melhorar o checkout" pode legitimamente aparecer duas vezes com descrições diferentes, e brainstorm sem atrito é o ponto da tela. A consequência é que **nada no sistema pode identificar uma idéia por título** — ver IDEIA-MOV-015, que é exatamente o bug que essa permissão cria quando alguém esquece dela.

**Esta regra continua valendo depois do §1.4 (IDEIA-DUPL).** O alerta de duplicidade não é unicidade pela porta dos fundos: ele avisa quando título e descrição se parecem muito com uma idéia já existente, mas nunca impede o salvamento. A pessoa decide — repetir continua sendo uma escolha legítima, só que agora uma escolha informada.

### 1.2 Papéis — `IDEIA-CRIA-PAPEL`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-CRIA-008 | O **especialista** pode criar, editar e mover idéias, mas **não pode excluir** nenhuma — nem as que ele mesmo criou. Ver `ideias-exclusao.md`. | Decisão I8 |
| IDEIA-CRIA-009 | Proprietário e membro podem criar, editar, mover e excluir. | Decisão I8 |
| IDEIA-CRIA-010 | A tela esconde o que o papel não permite, e o servidor **recusa de novo** com `403`. A tela decide o que mostrar; o servidor decide o que vale. | Decorre de PROJ-CRIA-004 |

**Por que o especialista escreve aqui, mas só olha em Projetos.** As duas telas têm naturezas diferentes. Criar um projeto é um ato estrutural — define o que a empresa vai tocar, e cabe a quem é da empresa. O quadro de idéias é a mesa de trabalho: é literalmente onde um especialista de UX ou produto entrega o que foi contratado para entregar. Deixá-lo apenas assistir seria contratar um profissional e pedir que não escreva nada.

**Por que ele não exclui, nem o que criou (IDEIA-CRIA-008).** A regra fica mais simples de entender e de auditar sendo absoluta: exclusão pertence à empresa. Um especialista é alguém de fora, muitas vezes temporário, e uma idéia que ele criou já passou a fazer parte do contexto do projeto — que é o ativo que a plataforma existe para preservar. Se uma idéia dele precisa sair, quem é da empresa remove.

### 1.3 A modal — `IDEIA-MODAL`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MODAL-001 | A **mesma modal** serve para criar e editar. O que muda é o título ("Nova idéia" / "Editar idéia") e os campos virem preenchidos. | Interface existente |
| IDEIA-MODAL-002 | Ao abrir para criar, os campos vêm limpos e a importância volta a zero — nunca herda o que sobrou da abertura anterior. | Interface existente |
| IDEIA-MODAL-003 | O foco vai para o campo de título assim que a modal abre. | Interface existente |
| IDEIA-MODAL-004 | Salvar com sucesso fecha a modal, mostra a idéia no quadro já com o estado novo, e confirma por toast. | Interface existente |
| IDEIA-MODAL-005 | Salvar limpa a busca e devolve a ordenação ao padrão, para que a idéia salva não nasça escondida por um filtro. | Decorre de IDEIA-BUSCA-004 |
| IDEIA-MODAL-006 | Enquanto a chamada está em andamento, o botão de salvar fica desabilitado, para não criar a mesma idéia duas vezes com clique duplo. | Decidido 24/08/2026 |

**Armadilha registrada no protótipo.** O código de hoje lê os campos por `getElementById`, e não por `form.title` — com um comentário explicando o porquê. Não é preciosismo: `form.title` colide com a propriedade nativa `HTMLElement.title` e devolve string vazia, silenciosamente. Vale manter o comentário na reescrita; é o tipo de detalhe que alguém "simplifica" e volta como bug de campo vazio.

### 1.4 Alerta de duplicidade — `IDEIA-DUPL`

Origem: pedido do Ricardo, 26/08/2026 — evitar que o quadro infle com idéias repetidas nascidas de brainstorms diferentes que ninguém percebeu que já tinham sido escritas antes.

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-DUPL-001 | Ao **criar ou editar** uma idéia, o servidor compara título e descrição, juntos, com toda idéia **ativa** do projeto — as três colunas, nunca uma arquivada. Vale para **toda porta** que cria ou edita idéia, não só a tela do quadro: a confirmação de uma ação proposta pelo assistente passa pela mesma checagem (IDEIA-DUPL-009). | Decisão I12; porta da IA em 16/09/2026 |
| IDEIA-DUPL-002 | A comparação usa um limiar de semelhança, não igualdade exata: variação de acento, caixa e ordem das palavras não escondem uma duplicata, mas conteúdo só parcialmente parecido não dispara o aviso à toa. | Decisão I12 |
| IDEIA-DUPL-003 | Encontrada uma parecida e a pessoa ainda não confirmou que quer mesmo assim, o servidor **não grava nada** — devolve qual idéia é a parecida, numa resposta de sucesso (não é erro: é uma decisão pendente, mesmo desenho de `acao_proposta` no assistente de IA). | Decisão I12 |
| IDEIA-DUPL-004 | A tela mostra um **alerta flutuante**, não uma modal bloqueante: a pessoa continua vendo o quadro atrás dele enquanto decide. | Decisão I12 |
| IDEIA-DUPL-005 | O alerta já chega **filtrando o quadro** para a idéia parecida — a pessoa não precisa clicar em nada para achá-la, ela aparece isolada atrás do alerta. Um link "Ver idéia parecida" abre a leitura completa. | Decisão I12 (ajustada 26/08/2026) |
| IDEIA-DUPL-006 | O alerta oferece exatamente duas ações: **"Criar"/"Salvar"** (confirma e grava mesmo assim, rotulado conforme é criação ou edição) e **"Cancelar"** (descarta a tentativa nova; a idéia existente não é tocada). Não há uma terceira opção que mescle as duas. | Decisão I12 (ajustada 26/08/2026) |
| IDEIA-DUPL-007 | Nunca bloqueia o salvamento de forma definitiva — é aviso, não trava. IDEIA-CRIA-007 (títulos repetidos são permitidos) continua valendo integralmente. | Decorre de IDEIA-CRIA-007 |
| IDEIA-DUPL-008 | Vale tanto para **criar** quanto para **editar**. Ao editar, a própria idéia sendo editada nunca é comparada consigo mesma. | Decisão I12 |
| IDEIA-DUPL-009 | Confirmar uma ação `criar_ideia`/`editar_ideia` proposta pelo assistente passa pela mesma checagem. Achando uma parecida, **não grava nada** e a sugestão continua `pendente` — o aviso aparece dentro do próprio cartão da sugestão e o "Confirmar" vira "Criar mesmo assim"/"Salvar mesmo assim". | Corrigido 16/09/2026 |

**Por que isto não é unicidade (IDEIA-DUPL-007).** A tentação óbvia seria recusar o salvamento quando algo parecido já existe — mas a decisão I10 já estabeleceu, de propósito, que títulos repetidos são legítimos em brainstorm. Bloquear reintroduziria pela porta dos fundos exatamente o que I10 rejeitou. O que existe aqui é avisar cedo o bastante para a pessoa decidir com informação — nunca decidir por ela.

**Por que a resposta é de sucesso, não um erro (IDEIA-DUPL-003).** Um `409`/`400` sinalizaria que algo deu errado, mas nada deu errado — é uma pausa legítima para uma escolha, igual à proposta de ação do assistente de IA (`ia-assistente-conhecimento.md` §1.5): o servidor devolve o que encontrou, e quem decide o próximo passo é sempre a pessoa, nunca o sistema sozinho.

**Por que o alerta não é a modal de excluir.** A modal de exclusão é destrutiva e irreversível — faz sentido exigir foco total antes de confirmar. Aqui não: a pessoa pode querer reler a idéia existente, comparar, mudar de ideia sobre o texto novo. Uma modal bloqueante atrapalharia exatamente esse ir-e-vir; um alerta flutuante deixa o quadro visível e a decisão acontece no próprio ritmo de quem está brainstormando.

**Por que a checagem vale também na porta da IA (IDEIA-DUPL-009).** A regra sempre disse "ao criar ou editar uma idéia", e a rota de confirmação do assistente gravava direto, sem passar por ela. Não é um furo qualquer: é justamente a IA que propõe criar idéias a partir de uma conversa longa, onde a chance de propor algo que já está no quadro é **maior**, não menor. O aviso fica dentro do cartão da sugestão, e não num alerta flutuante como na tela do quadro, porque a decisão é sobre *aquela* sugestão — tirar o aviso de perto dela obrigaria a pessoa a lembrar a qual das mensagens ele se referia.

**Sobre os pesos e o limiar (IDEIA-DUPL-002) — recalibrado em 16/09/2026.** A calibração original (peso 0.5 no título, 0.5 na descrição, limiar 0.6) tinha um defeito aritmético, não de gosto: com peso 0.5, **um título idêntico chegava no máximo a 0.5** e por construção nunca alcançava sozinho o limiar. O alerta passava a exigir semelhança de descrição ≥ 0.2 em todo caso, e o índice de Jaccard pune reescrita com força — descrever a mesma idéia com outras palavras derruba o índice para perto de zero.

Medido contra as 152 idéias reais do projeto Startup/iHouseLog, nos 11.476 pares possíveis: **zero alertas**, inclusive nos dois pares com título 60–67% igual. Na prática só a cópia literal disparava — que é exatamente o caso que ninguém comete sem perceber. O caso real de duplicidade é reescrever, sem lembrar, uma idéia que já está lá.

Calibração nova: **0.7 no título, 0.3 na descrição, limiar 0.6 sem mudança**. Título idêntico passa a valer 0.7 e dispara sozinho — o comportamento que a regra sempre descreveu. Os mesmos 11.476 pares reais continuam com **zero falsos alertas**, então o peso maior no título não trocou silêncio por ruído. O que continua fora do alcance é sinônimo ("Locker" x "Armário inteligente"): sobreposição de palavras não enxerga isso, e resolver exigiria embeddings — ver pendência em §4.

**Bug corrigido em 26/08/2026 — o alerta escondido bloqueava o clique em "Nova idéia".** `.dup-alerta{display:flex}` tem a mesma especificidade CSS do `[hidden]{display:none}` do navegador, e regra de autor sempre vence empate contra regra do user-agent — então o elemento nunca ficava de fato `display:none`, mesmo com o atributo `hidden` presente: continuava ocupando layout e, principalmente, continuava recebendo eventos de clique por cima do cabeçalho, mesmo invisível (`opacity:0` não desliga hit-testing). Resultado: com o alerta oculto, clicar em "Nova idéia" não fazia nada. O mesmo defeito, com a mesma causa, já existia em `.toast` — corrigido junto, mesma correção. Ajuste: `pointer-events:none` no estado padrão, `.dup-alerta[hidden]{display:none}` (mais específico, garante o repouso) e `pointer-events:auto` só em `.dup-alerta.is-visible`. Este é o mesmo padrão já usado em `.btn[hidden]`, na mesma página, por um incidente real anterior em `projetos.html`.

### 1.5 Gerar com ajuda da IA — `IDEIA-GERAR`

Para quem abre um projeto e não sabe por onde começar. Um clique e o quadro ganha as etapas do trabalho daquele tipo de projeto, uma idéia por etapa, em ordem de execução. Quem gera é a Skill `Skills/senior-product-designer.skill`; o que ela promete e o que o servidor garante estão aqui.

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-GERAR-001 | O botão **"Gerar com ajuda da IA"** (variante `ghost` do styleguide) aparece em dois lugares de `visao_do_projeto.html`: no cabeçalho, à esquerda de "Nova idéia", e no estado vazio, à direita de "Nova idéia". No estado vazio o par do cabeçalho sai inteiro, para nenhuma ação aparecer duas vezes. | Pedido do Ricardo, 23/09/2026 |
| IDEIA-GERAR-002 | Gerar é criar idéias: aparece e é aceito só para quem pode criar (IDEIA-CRIA-004). O servidor recusa de novo com `403` (IDEIA-CRIA-010). | Decorre de IDEIA-CRIA-004 |
| IDEIA-GERAR-003 | O **nome do projeto** escolhido na modal "Novo projeto" ("Identidade Visual", "Landing Page", "MVP"…) define o trabalho; sem nome escolhido, vale o rótulo do tipo. A ficha da empresa (nome e descrição) especifica cada etapa. Projetos de tipos diferentes recebem listas diferentes. Pedido ao modelo: **4 a 7 etapas**; aceitas até 8. | Decisão I14 |
| IDEIA-GERAR-004 | Cada etapa vira uma idéia com título e descrição dentro dos limites de IDEIA-CRIA-001, **conferidos no servidor** — o que passa do limite é encurtado em fronteira de frase ou de palavra, nunca no meio da palavra. Item sem título ou sem descrição, e título repetido na mesma resposta, são descartados. | Decorre de IDEIA-CRIA-001/005 |
| IDEIA-GERAR-005 | Toda etapa passa pela checagem de duplicidade (IDEIA-DUPL-001) contra **todas** as idéias ativas do projeto e contra as etapas já aceitas na mesma resposta. Parecida **não é gravada**, e a resposta diz quantas ficaram de fora — a tela conta isso à pessoa, nunca some com elas em silêncio. | Decorre de IDEIA-DUPL-001 |
| IDEIA-GERAR-006 | As idéias **caem direto em "Minhas idéias"** (IDEIA-CRIA-003), sem tela de aprovação: quem não quer uma etapa a exclui ou edita no próprio quadro. A primeira etapa fica no topo da ordenação padrão ("Mais recente") — a ordem de execução é a ordem do quadro, sem número colado no título. | Decisão I14 |
| IDEIA-GERAR-007 | As idéias geradas nascem **sem importância** (zero). A nota é da pessoa (IDEIA-CRIA-002); a IA inventaria números com convicção. | Decorre de IDEIA-CRIA-002 |
| IDEIA-GERAR-008 | Custo: reserva antes de chamar, `402` sem saldo, e cobrança só do que foi **entregue** — resposta que não vira nenhuma idéia gravada é registrada como `descartado` e não é cobrada (IA-CUSTO-002/003). Consumo registrado como `assistente`. O valor aparece só no Histórico de uso (DIN-013). | Decorre de IA-CUSTO / DIN-013 |
| IDEIA-GERAR-009 | Enquanto gera, **os dois botões** ficam em carregando ("Gerando idéias...") e desabilitados — um segundo clique não dispara uma segunda geração paga. Sem barra de progresso: não se sabe quanto falta. A busca e a ordenação são limpas antes (IDEIA-BUSCA-004). | Decorre de IA-CONV-NARRA |
| IDEIA-GERAR-010 | Três desfechos, três mensagens: criou (quantas, na ordem de execução, e quantas ficaram de fora por semelhança); não criou nada porque todas eram parecidas (aviso, não erro); falhou (toast de erro com o motivo do servidor, nada gravado, nada cobrado). | Decorre de IA-ACAO-009 |
| IDEIA-GERAR-011 | **Os dois botões "Gerar com ajuda da IA" (cabeçalho e estado vazio) abrem uma modal antes de gerar.** Ela diz o que vai acontecer ("A IA vai sugerir as etapas do projeto **Logotipo** e colocá-las em **Minhas idéias**, na ordem de execução") e traz um campo **opcional** "Orientação para a IA", até **1.000 caracteres**, com contador — sem texto de ajuda abaixo e sem exemplo dentro do campo (revisto 23/09/2026: o exemplo era lido como sugestão a seguir, e confundia). **"Gerar idéias"** fecha a modal e inicia a geração (IDEIA-GERAR-009 continua valendo: os dois botões ficam em carregando); **"Cancelar"**, "Fechar", Esc e clique fora não geram nada e não custam nada. Campo vazio = a geração roda exatamente como antes da modal: o texto não vai no pedido. Com texto, ele vai ao modelo como **contexto** da Skill, num bloco delimitado depois dos dados do projeto: ajusta foco, prioridade e o que já está resolvido, mas não troca a lógica da Skill (o nome do projeto continua definindo o trabalho, IDEIA-GERAR-003) nem o formato; o que pedir fora do projeto é ignorado. Se a geração **falhar**, o texto fica guardado e reaparece ao reabrir a modal; se der certo, a próxima abre em branco. Ctrl/Cmd+Enter gera. O servidor recusa orientação acima do limite com `400` (`campo: "orientacao"`) **antes** de reservar crédito. | Decidido 23/09/2026 com o Ricardo |

**Por que direto no quadro, e não uma lista para aprovar (IDEIA-GERAR-006).** O botão existe para quem não sabe por onde começar — pedir a essa pessoa que julgue sete etapas antes de ver qualquer uma no quadro é devolver a ela a decisão que ela veio pedir. É a mesma leitura de D1 e D12 em `planejamento-pesquisa-v2.md`: *ele já clicou, e já sabemos que ele quer*. Apagar continua onde a pessoa já sabe mexer, card a card. O custo assumido: o **especialista** não exclui (IDEIA-CRIA-008), então uma etapa que ele não queira fica até alguém da empresa removê-la.

**Por que o nome, e não o `tipo` (IDEIA-GERAR-003).** Todo projeto hoje tem `tipo = startup` (PROJ-CRIA-006); o que diferencia "Identidade Visual" de "Landing Page" é o `nome` escolhido na modal. Gerar pelo `tipo` daria a mesma lista para todos.

**Por que a duplicidade não pergunta, aqui (IDEIA-GERAR-005).** Na criação à mão, a parecida vira alerta porque a pessoa escreveu aquilo e pode querer mesmo assim (I12). Aqui ninguém escreveu: a IA propôs algo que o quadro já tem. Perguntar "criar mesmo assim?" sobre um texto que a pessoa nem leu seria decisão sem informação. A etapa sai, e a contagem é dita.

---

## 2. Contrato da API

### `POST /empresas/:empresaId/projetos/:projetoId/ideias`

**Corpo:** `{ "titulo": string, "descricao": string, "importancia": 0..5, "ignorar_duplicata"?: boolean }`

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `201` com `{ ideia }` | Acrescenta o card em "Minhas idéias" e confirma |
| Idéia ativa parecida encontrada, e `ignorar_duplicata` não veio `true` (IDEIA-DUPL-001/003) | `200` com `{ possivel_duplicata: ideia }` | **Não grava nada.** Mostra o alerta flutuante com a idéia parecida |
| Título/descrição vazios ou fora do limite | `400` com `campo` | Marca o campo e mostra a mensagem |
| `importancia` fora de 0..5 | `400` com `campo: "importancia"` | Marca o grupo de estrelas |
| Sessão inválida | `401` | Renovação silenciosa; só então login |
| Tem vínculo, papel não permite | `403` | Explica; a tela não deveria ter oferecido |
| Qualquer elo da corrente falha | `404` | Redireciona para `projetos.html` |

`ignorar_duplicata: true` é o que o botão "Criar"/"Salvar" do alerta envia no reenvio, depois que a pessoa já viu o alerta e decidiu que quer mesmo assim (IDEIA-DUPL-006) — só então a checagem é pulada e a idéia é gravada de verdade.

### `POST /empresas/:empresaId/projetos/:projetoId/ideias/gerar`

**Corpo:** vazio.

| Situação | Resposta | Efeito na tela |
|---|---|---|
| Etapas geradas e ao menos uma gravada | `201` com `{ ideias: [...], parecidas: n }` — `ideias` na ordem de execução | Recarrega o quadro; toast com quantas foram criadas e quantas ficaram de fora |
| Todas as etapas eram parecidas com idéias existentes | `200` com `{ ideias: [], parecidas: n }` | Toast de aviso: nenhuma idéia nova. Nada gravado, nada cobrado |
| Papel sem permissão de criar | `403` | — (o botão nem aparece) |
| Saldo insuficiente | `402` | Toast de erro |
| IA não configurada, modelo sem preço, provedor fora ou resposta sem nenhuma etapa válida | `503` | Toast de erro. Nada gravado, nada cobrado |
| Qualquer elo da corrente falha (IDEIA-ISO-003) | `404` | — |

### `PUT /empresas/:empresaId/projetos/:projetoId/ideias/:id`

Mesmo corpo e mesmas respostas do `POST` — incluindo a checagem de duplicidade, agora excluindo a própria idéia sendo editada da comparação (IDEIA-DUPL-008) —, mais:

| Situação | Resposta | O que a tela faz |
|---|---|---|
| A idéia não existe, está arquivada, ou não é deste projeto | `404` | Recarrega o quadro |

O `PUT` **não** altera `status` — mover tem rota própria (`ideias-movimentacao.md` §2). Uma edição nunca move um card, e uma movimentação nunca reescreve texto.

### `POST /empresas/:empresaId/projetos/:projetoId/ia/mensagens/:mensagemId/confirmar`

A rota é do assistente (`ia-assistente-conhecimento.md` §1.5), e aparece aqui por causa de IDEIA-DUPL-009: quando a ação confirmada é `criar_ideia` ou `editar_ideia`, ela cria/edita idéia e por isso passa pela mesma checagem das rotas acima.

**Corpo:** vazio, ou `{ "ignorar_duplicata": true }` no reenvio.

| Situação | Resposta | O que a conversa faz |
|---|---|---|
| Sucesso | `200` com `{ ideia, mensagem }` | Atualiza o quadro e marca a sugestão como confirmada |
| Idéia ativa parecida encontrada, e `ignorar_duplicata` não veio `true` | `200` com `{ possivel_duplicata: ideia }` | **Não grava nada.** A sugestão continua `pendente`; o cartão mostra o aviso e o "Confirmar" vira "Criar mesmo assim" |
| A sugestão já foi respondida | `409` | Recarrega a conversa |
| A sugestão não vale mais (idéia sumiu, dados inválidos) | `422` | Recarrega a conversa |

Repare na diferença com o `POST /ideias`: lá a resposta com `possivel_duplicata` encerra a tentativa e a pessoa recomeça pelo alerta; aqui a **sugestão sobrevive** — ela continua pendente, e o mesmo par de links decide. Se fosse descartada ao avisar, o aviso custaria a sugestão, e a pessoa pagaria por ter sido avisada.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| I8 | O que o especialista pode fazer com idéias? | **Cria, edita e move; não exclui** — nem as próprias. Idéias são a mesa de trabalho dele; exclusão pertence a quem é da empresa. | 24/08/2026 |
| I9 | A importância é obrigatória? | Não. Zero é um valor válido e significa "sem prioridade definida". Obrigar uma nota no instante da criação produz números inventados. | 24/08/2026 |
| I10 | Título de idéia é único no projeto? | Não. Repetição é legítima em brainstorm. Consequência assumida: nenhuma parte do sistema pode identificar idéia por título (ver IDEIA-MOV-015). | 24/08/2026 |
| I11 | A IA gera idéias nesta versão? | ~~**Não** — adiada com o restante da IA (decisão I3, `ideias-quadro.md`).~~ **Revista por I14 em 23/09/2026.** | 24/08/2026 |
| I13 | Como calibrar o alerta de duplicidade, e ele vale na porta da IA? | **Peso 0.7 no título / 0.3 na descrição, limiar 0.6; e sim, vale em toda porta.** A calibração 0.5/0.5 impedia o título de disparar sozinho e deixava o alerta mudo (zero disparos em 11.476 pares reais). A porta da IA gravava sem checar — corrigida. | 16/09/2026 |
| I14 | Como a IA gera idéias? | **Pelo botão "Gerar com ajuda da IA", com a Skill `senior-product-designer`:** 4 a 7 etapas do trabalho, a partir do nome do projeto e da ficha da empresa, gravadas direto em "Minhas idéias" na ordem de execução, sem importância, com as parecidas descartadas e contadas. Ver §1.5. | 23/09/2026 |
| I12 | Deve haver checagem de duplicidade ao salvar uma idéia? | **Sim, como aviso — nunca como bloqueio.** Compara título e descrição, juntos, com toda idéia ativa do projeto; encontrando uma parecida, mostra um alerta flutuante — já filtrando o quadro para ela — com duas ações ("Criar"/"Salvar" ou "Cancelar") e não grava nada até a pessoa decidir. Preserva I10 integralmente: não é unicidade, é uma decisão informada. | 26/08/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Geração por IA — o que ficou de fora da primeira versão | Resolvida por I14 (§1.5). Ficou de fora: o conhecimento validado de "Sobre a empresa" (`recortes_taxonomia`) ainda **não** entra no pedido — só a ficha. E o consumo é registrado como `assistente` porque `TipoConsumoIa` não tem um valor próprio; separar no Histórico de uso exige migração (`ALTER TYPE ... ADD VALUE`). |
| Anexos na idéia | O compositor do assistente tem um botão de anexo. Não há regra de anexo em idéia, e o campo não existe no modelo. Fora do escopo desta versão. |
| Histórico de edição | Não se registra quem editou o quê. Se virar requisito (provável, com especialistas externos escrevendo), exige tabela de auditoria própria. |
| Limiar de semelhança do IDEIA-DUPL | **Recalibrado em 16/09/2026** (decisão I13) contra as 152 idéias reais do projeto Startup/iHouseLog: 0.7/0.3, limiar 0.6, zero falsos alertas em 11.476 pares. Continua sendo o primeiro número a mexer se o uso real mostrar avisos demais ou de menos (`PESO_TITULO`/`LIMIAR_DUPLICATA` em `api/src/ideias/duplicidade.ts`), agora com uma base de comparação de verdade. |
| Duplicidade por sinônimo | Fora do alcance da técnica atual. "Seguro encomendas" x "Seguro para encomendas" é pego; "Locker" x "Armário inteligente" não, porque sobreposição de palavras não enxerga sinônimo. Resolver exige comparação semântica (embeddings), com custo e latência em toda gravação de idéia — decisão ainda não tomada. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.4.0 | 2026-09-23 | **IDEIA-GERAR-011:** os botões "Gerar com ajuda da IA" passam a abrir uma modal com o campo opcional "Orientação para a IA" (até 1.000 caracteres). O texto vai à Skill como contexto delimitado; vazio, o pedido sai idêntico ao anterior. `POST .../ideias/gerar` aceita `{ orientacao? }`. Skill `senior-product-designer` ganha a regra 7 ("a orientação ajusta, não substitui"). 5 testes novos em `api/testes/gerar-ideias.test.ts`. |
| 1.3.0 | 2026-09-23 | **Nova §1.5 `IDEIA-GERAR-001` a `010`** e decisão I14: o botão "Gerar com ajuda da IA" volta à tela, agora com a funcionalidade — no cabeçalho e no estado vazio, variante `ghost`. Skill nova `Skills/senior-product-designer.skill`; código em `api/src/ia/gerar-ideias.ts` e na rota `POST .../ideias/gerar`. I11 revista. 18 testes puros em `api/testes/gerar-ideias.test.ts`. |
| 1.2.0 | 2026-09-16 | Alerta de duplicidade recalibrado e estendido (decisão I13). **Pesos** passam de 0.5/0.5 para 0.7/0.3 entre título e descrição, limiar inalterado: com 0.5 o título não alcançava o limiar sozinho e o alerta disparava zero vezes nos 11.476 pares das 152 idéias reais. **Nova IDEIA-DUPL-009**: confirmar uma ação `criar_ideia`/`editar_ideia` do assistente passa pela mesma checagem — essa porta gravava direto, sem checar. Contrato do `/confirmar` documentado em §2. Cinco testes novos em `api/testes/ideias-duplicidade.test.ts`, três deles travando a regressão dos pesos e dois guardando contra falso alerta, tirados de pares reais. |
| 1.1.3 | 2026-09-13 | Sem mudança de regra. Cabeçalho corrigido: dizia "implementação não iniciada" com `POST`/`PUT` no ar e o alerta de duplicidade funcionando em `js/ideias.js`. |
| 1.1.2 | 2026-08-26 | Correção de bug: `.dup-alerta` (e, junto, `.toast`, mesmo defeito) ficava clicável e interceptando cliques mesmo escondido (`hidden`), por causa de um empate de especificidade CSS entre `[hidden]` e `display:flex` — bloqueava o clique em "Nova idéia". Corrigido com `pointer-events:none`/`[hidden]{display:none}`/`pointer-events:auto` só em `.is-visible`, mesmo padrão já usado em `.btn[hidden]`. |
| 1.1.1 | 2026-08-26 | Ajustes de acabamento no alerta de duplicidade (IDEIA-DUPL-005/006): o quadro já vem filtrado para a idéia parecida assim que o alerta aparece, sem precisar clicar em "Ver idéia parecida"; botões renomeados de "Manter a criação/edição" / "Manter apenas o card atual" para "Criar"/"Salvar" e "Cancelar"; alerta mais largo. |
| 1.1.0 | 2026-08-26 | Novo alerta de duplicidade ao criar ou editar uma idéia (IDEIA-DUPL-001 a 008, decisão I12): compara título e descrição com as idéias ativas do projeto e, encontrando uma parecida, avisa por um alerta flutuante em vez de gravar — a pessoa decide manter a nova tentativa ou o card existente. Não é unicidade: I10 continua valendo. Contrato da API (§2) ganha `ignorar_duplicata` e a resposta `possivel_duplicata`. |
| 1.0.0 | 2026-08-24 | Documento criado. Regras de criação e edição (IDEIA-CRIA), papéis com a permissão de escrita do especialista, e regras da modal. Decisões I8 a I11. |
