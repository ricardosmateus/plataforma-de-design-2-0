# Regras de Negócio — Assistente de IA: o que ele sabe e o que pode afirmar

> **Versão:** 1.3.0 · **Status:** Regras definidas; implementado (provedor pendente)
> **Módulo:** Assistente de IA · **Página:** `visao_do_projeto.html` (painel lateral)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ia-assistente-isolamento.md`](ia-assistente-isolamento.md) · [`ia-assistente-conversa.md`](ia-assistente-conversa.md) · [`../ideias/ideias-quadro.md`](../ideias/ideias-quadro.md) — de onde vem o conhecimento · [`../ideias/ideias-criacao.md`](../ideias/ideias-criacao.md) e [`../ideias/ideias-movimentacao.md`](../ideias/ideias-movimentacao.md) — a validação que `IA-ACAO` reproduz na confirmação

---

## Origem destas regras

Instrução do Ricardo, 25/08/2026:

> "o assistente deve apenas consultar informações internas da empresa selecionada, ele deve ter a limitação de trazer informações que não foram validadas dentro do projeto, ou seja, o assistente tem que levar como verdade apenas as idéias que estiverem na coluna 'Finalizado' e o restante das idéias devem servir para consulta, mas ele não pode considerar uma verdade para o projeto."

O documento traduz isso em mecanismo. A parte difícil não é enunciar a regra — é fazer com que ela **não dependa da boa vontade do modelo**.

---

## 1. Regras

### 1.1 Os dois estados do conhecimento — `IA-CONHEC`

| ID | Regra | Fonte |
|---|---|---|
| IA-CONHEC-001 | O conhecimento do assistente tem **exatamente duas categorias**: *verdade validada* e *material de consulta*. Não existe terceira, nem zona cinzenta. | Instrução do Ricardo, 25/08/2026 |
| IA-CONHEC-002 | **Verdade validada** é toda idéia ativa em `Finalizado`. Só ela pode ser afirmada como fato do projeto. | Instrução do Ricardo, 25/08/2026 |
| IA-CONHEC-003 | **Material de consulta** são as idéias ativas em `Minhas idéias` e `Em andamento`. O assistente pode lê-las, citá-las e raciocinar sobre elas, mas **nunca** apresentá-las como fato estabelecido. | Instrução do Ricardo, 25/08/2026 |
| IA-CONHEC-004 | Idéia arquivada **não entra no contexto** em categoria nenhuma. Foi descartada; ressuscitá-la no raciocínio da IA desfaria a decisão de quem a arquivou. | Decorre de IDEIA-EXCL-001 |
| IA-CONHEC-005 | Toda afirmação apoiada em material de consulta é apresentada **marcada como não validada**, na própria resposta — não em nota de rodapé, nem só no tom. | Decisão A1 |
| IA-CONHEC-007 | **Finalizar uma atividade valida tudo que ela produziu.** Quando a idéia vai para `Finalizado`, as tarefas, os quadros e os post-its dentro dela passam a ser **verdade validada** junto com ela — não só o título e a descrição. | Instrução do Ricardo, 06/09/2026 |
| IA-CONHEC-008 | Tarefa concluída dentro de atividade **ainda não finalizada** é **material de consulta** (IA-CONHEC-003). A tarefa acabou; a atividade não — e é finalizar a atividade que declara o conteúdo validado. | Decorre de IA-CONHEC-007 |
| IA-CONHEC-006 | O assistente **só lê por conta própria**. Ele não cria, edita, move ou arquiva idéia sem que a pessoa tenha pedido *e* confirmado — ver `IA-ACAO` (§1.5). Alterar o quadro sem os dois continua sendo ato exclusivamente humano. | Instrução do Ricardo ("apenas consultar"), 25/08/2026 · revisto pela decisão A18 |

**Por que IA-CONHEC-007 não move a fronteira.** A leitura apressada é que isto abre uma exceção em IA-CONHEC-002. Não abre: o corte continua sendo a idéia em `Finalizado`, movida por uma pessoa. O que mudou foi a **extensão** do que aquele ato alcança. Antes, finalizar validava dois campos de texto — título e descrição — e deixava de fora todo o trabalho feito para chegar até eles. Isso nunca fez sentido: ninguém finaliza uma atividade achando que só o resumo dela vale.

Nas palavras do Ricardo (06/09/2026): *"quando o usuário finalizar uma atividade, isso já é um validador por parte do usuário — tudo que está dentro da atividade finalizada deve ser considerado verdade, inclusive os post-its."*

**Por que IA-CONHEC-008 existe.** Sem ela, "tarefa concluída" viraria um segundo caminho para verdade, paralelo ao de `Finalizado` — e aí sim IA-CONHEC-002 teria uma exceção. Concluir uma tarefa diz "este trabalho acabou"; finalizar a atividade diz "o que saiu daqui vale". São afirmações diferentes, feitas em momentos diferentes, e só a segunda é uma validação.

**Onde a garantia mora.** Não na instrução ao modelo. `verificacao.ts` recebe, para cada tarefa que foi ao contexto, o `validada` calculado pela **mesma** `ehVerdadeValidada` que decide a categoria de uma idéia. Uma tarefa de atividade aberta citada como "validada" é rebaixada e marcada, exatamente como uma hipótese seria (IA-GARANT-003). O modelo não tem como promover nada por conta própria.

**Por que a distinção precisa ser binária (IA-CONHEC-001).** A tentação é criar graus — "quase validada", "em discussão avançada". Qualquer escala intermediária transfere para o modelo a decisão de onde fica o corte, e é exatamente essa decisão que o Ricardo tomou ao definir a coluna `Finalizado` como fronteira. Duas categorias são verificáveis por código; um espectro não é.

### 1.2 As três camadas de garantia — `IA-GARANT`

Pedir ao modelo "não trate hipótese como verdade" é a implementação mais frágil possível: funciona quase sempre, e falha justamente quando o texto da idéia é convincente. As regras abaixo existem para que a garantia não dependa disso.

| ID | Regra | Fonte |
|---|---|---|
| IA-GARANT-001 | **Separação na origem.** O contexto enviado ao modelo traz dois blocos distintos e rotulados — verdades validadas e hipóteses não validadas. As duas categorias **nunca** chegam misturadas numa lista só com um campo `status` no meio. | Decisão A2 |
| IA-GARANT-002 | **Resposta com procedência.** Além do texto, o assistente devolve os **ids das idéias que usou** e em que categoria as usou. | Decisão A2 |
| IA-GARANT-003 | **Verificação no servidor.** Antes de a resposta chegar à tela, o servidor confere o status real de cada idéia citada. Uma idéia citada como validada que não esteja em `Finalizado` é rebaixada e marcada. | Decisão A2 |
| IA-GARANT-004 | Idéia citada cujo id **não pertence ao projeto** invalida a resposta inteira — ela não é exibida. É sinal de vazamento ou de invenção, e nenhum dos dois pode chegar ao usuário. | Decorre de IA-ISO-004 |
| IA-GARANT-005 | O servidor nunca "conserta" o texto da resposta reescrevendo-o. Ele marca, rebaixa ou recusa — mas não edita o que o modelo disse. | Decisão A3 |

**Por que a camada 3 é a que realmente vale.** É o mesmo princípio que já governa todas as rotas da plataforma: *a tela decide o que mostrar, o servidor decide o que vale*. Sem IA-GARANT-003, a regra do Ricardo seria uma instrução dentro do prompt — ou seja, uma sugestão. Com ela, vira uma checagem determinística sobre dado que o servidor já tem em mãos. IA-GARANT-002 não é enfeite: é o que torna a camada 3 possível.

**Por que o servidor não reescreve (IA-GARANT-005).** Um servidor que corrige a resposta do modelo passa a ser autor dela, e ninguém consegue mais auditar o que veio de onde. Marcar preserva a distinção entre o que a IA disse e o que o sistema verificou.

### 1.3 Quando não há verdade nenhuma — `IA-VAZIO`

| ID | Regra | Fonte |
|---|---|---|
| IA-VAZIO-001 | Projeto sem nenhuma idéia em `Finalizado` **não tem verdade validada**. O assistente diz isso com todas as letras quando perguntado sobre fatos do projeto. | Decisão A4 |
| IA-VAZIO-002 | Nesse caso ele **pode** usar o material de consulta, sempre marcado — o que não pode é preencher o silêncio com plausibilidade. | Decorre de IA-CONHEC-003 |
| IA-VAZIO-003 | Projeto sem idéia alguma: o assistente informa que o quadro está vazio — e, em vez de parar aí, **assume a iniciativa** (IA-VAZIO-005). | Decisão A16 |
| IA-VAZIO-004 | "Não sei" e "isto ainda não foi validado" continuam sendo **respostas aceitáveis** quando a pergunta é sobre um fato do projeto que não existe. Não são falhas do produto. | Decisão A4 |

### 1.3.1 Projeto em branco: o assistente guia — `IA-VAZIO` (cont.)

| ID | Regra | Fonte |
|---|---|---|
| IA-VAZIO-005 | Sem nada em `Finalizado`, o assistente **toma a iniciativa**: oferece próximos passos concretos para quem está começando — pesquisar concorrentes, mapear o público, formular as primeiras hipóteses — em vez de apenas declarar ausência. | Instrução do Ricardo, 25/08/2026 |
| IA-VAZIO-006 | **Sugerir um caminho não é afirmar um fato.** "Vale começar mapeando seus concorrentes" é orientação e sempre pode. "Seus concorrentes são X e Y" é afirmação sobre o negócio e continua proibida sem estar em `Finalizado`. | Decisão A16 |
| IA-VAZIO-007 | As sugestões se apoiam **só no que a plataforma sabe de verdade**: nome da empresa, descrição que a própria conta escreveu, e tipo do projeto. O assistente não deduz o ramo, o porte, o mercado ou os concorrentes a partir do nome. | Decisão A17 |
| IA-VAZIO-008 | Exemplos ilustrativos são permitidos, desde que apresentados como **ponto de partida a validar**, nunca como conhecimento sobre aquela empresa. | Decorre de IA-VAZIO-006 |
| IA-VAZIO-009 | Nada do que o assistente sugerir vira verdade do projeto por ter sido sugerido, nem por o usuário gostar. Só vira ao ser registrado como idéia e movido para `Finalizado`, por uma pessoa. | Decorre de IA-GERAL-003 |

**Por que a primeira versão desta regra estava errada.** Ela tratava o projeto vazio apenas como **ausência**, e mandava o assistente dizer que não sabia. Só que esse é justamente o momento em que a pessoa mais precisa de ajuda — ela abriu um projeto em branco porque não sabe por onde começar. Um assistente que responde "não há nada validado" e para por aí é tecnicamente honesto e praticamente inútil, e contraria a missão da plataforma, que é **guiar** durante o planejamento (`O_que_e_q_plataforma_de_design.md`: "faz perguntas, sugere metodologias, identifica informações ausentes").

**O que a correção NÃO afrouxa.** A fronteira continua exatamente onde estava. O que mudou é o reconhecimento de que ela separa *afirmação* de *sugestão* — e não *falar* de *calar*. O assistente ganhou permissão para propor caminhos; não ganhou permissão nenhuma para inventar fatos.

**Por que IA-VAZIO-007 é a regra mais importante deste bloco.** É onde o ajuste desandaria. Uma empresa cadastrada como "Nike" pode ser uma loja de bairro que escolheu esse nome — e o modelo tem conhecimento de mundo farto sobre a Nike de verdade. Deduzir mercado, porte ou concorrentes a partir do nome produziria afirmações confiantes sobre um negócio que o assistente não conhece, com aparência de informação interna. A base das sugestões é o que a conta escreveu, não o que o nome sugere.

**Por que isto merece regras próprias.** É o estado mais comum no começo da vida de um projeto — e é onde a pressão para inventar é maior. A honestidade de *carregando / vazio / erro* (EMP-LIST-010) continua valendo sobre conhecimento: **falta de informação nunca vira informação plausível**. O que estas regras acrescentam é que falta de informação também não precisa virar silêncio.

### 1.4 Conhecimento geral — `IA-GERAL`

| ID | Regra | Fonte |
|---|---|---|
| IA-GERAL-001 | O assistente **pode** explicar conceitos, metodologias e práticas de mercado que não vêm do quadro — ensinar faz parte da missão da plataforma. | Decisão A5 |
| IA-GERAL-002 | Conhecimento geral **nunca** é apresentado no mesmo tom que informação do projeto. A resposta deixa claro o que veio do quadro e o que é conhecimento externo. | Decisão A5 |
| IA-GERAL-003 | Conhecimento geral **não vira verdade do projeto** por ser útil, nem por o usuário concordar com ele. Só entra como verdade se virar idéia e for para `Finalizado` — pela mão de uma pessoa. | Decorre de IA-CONHEC-002 |
| IA-GERAL-004 | O assistente não busca informação externa em tempo real (web, bases de terceiros) nesta versão. | Decisão A5 |

**Por que IA-GERAL-003 existe.** É o caminho pelo qual a regra do Ricardo vazaria sem ninguém perceber: o assistente sugere uma prática de mercado, a conversa segue, e três mensagens depois ele se refere àquilo como se fosse decisão do projeto. A fronteira precisa valer **dentro da mesma conversa**, não só na primeira resposta.

### 1.5 Ações no quadro — `IA-ACAO`

Origem: pedido do Ricardo, 26/08/2026, ao corrigir o comportamento de IA-CONHEC-006 — o assistente estava recusando (com erro de formato, não com resposta clara) qualquer pedido para criar uma idéia. A resposta não é "deixar a IA criar sozinha": é dar à pessoa um jeito explícito de autorizar a ação, sem tirar dela a decisão.

| ID | Regra | Fonte |
|---|---|---|
| IA-ACAO-001 | O assistente **nunca decide, por conta própria**, criar, editar ou mover uma idéia. Arquivar e excluir continuam totalmente fora do alcance dele, propostos ou não. | Decisão A18 |
| IA-ACAO-002 | Se a pessoa pedir, **nesta mensagem**, para criar, editar ou mover uma idéia, o assistente pode **propor** a ação — nunca afirmar que já fez, porque ele não fez. A proposta viaja junto da resposta, estruturada, e o servidor confere antes de deixá-la visível como algo que se pode confirmar. | Decisão A18 |
| IA-ACAO-003 | Sem pedido explícito na mensagem atual, o assistente não propõe ação nenhuma — mesmo que a conversa venha discutindo o assunto há várias trocas. Sugerir conteúdo em texto livre ("você podia ter uma idéia sobre X") continua sempre permitido; propor a ação estruturada, não. | Decisão A18 |
| IA-ACAO-004 | A ação só vira escrita real no quadro depois de um **clique explícito de confirmação** da pessoa, numa tela que mostra o que vai ser criado/editado/movido antes do clique. Não existe caminho em que responder "sim" em texto livre no chat execute a ação — só o controle dedicado conta. | Decisão A18 |
| IA-ACAO-005 | A confirmação **não confia** no que foi verificado no momento em que a proposta chegou. Ela roda a mesma validação de conteúdo da criação/edição manual de idéias (IDEIA-CRIA-001/002) de novo, e confere de novo se a idéia referenciada ainda existe e pertence ao projeto — tempo pode ter passado entre a proposta e o clique. | Decorre de IA-GARANT-003 |
| IA-ACAO-006 | Uma proposta só pode ser respondida **uma vez** — confirmada ou descartada. Depois disso ela é estado passado, não uma decisão em aberto; um segundo clique não repete nem desfaz nada. | Decisão A18 |
| IA-ACAO-007 | Confirmar uma ação exige o **mesmo papel** que criar/editar/mover uma idéia manualmente (IDEIA-CRIA-001, IDEIA-MOV-004) — um especialista, por exemplo, pode confirmar; quem só lê, não. Descartar não escreve nada no quadro, então qualquer pessoa que enxerga a conversa pode descartar a própria proposta. | Decorre de IDEIA-CRIA/MOV |
| IA-ACAO-008 | Idéia criada a partir de uma proposta confirmada nasce em `Minhas idéias`, nunca direto em `Finalizado` — mesma regra de IDEIA-CRIA-003. Se o assistente pudesse fazer nascer uma idéia já validada, a fronteira de IA-CONHEC-002 seria contornada pela porta dos fundos. | Decorre de IDEIA-CRIA-003 |
| IA-ACAO-009 | O assistente **nunca afirma, em texto**, que já criou, editou ou moveu uma idéia — nenhuma variação de "já fiz isso" — a menos que a própria resposta traga `acao_proposta` preenchido. Vale mesmo quando a pessoa só confirma em texto livre ("ok", "sim", "pode") depois de uma sugestão: a resposta deve propor a mesma ação de novo, para que um controle de confirmação apareça, e nunca alegar que a ação já aconteceu. O servidor varre o texto por esse padrão de alegação falsa e, quando encontra uma sem proposta real por trás, marca a resposta para a tela avisar — sem reescrever o texto do modelo (IA-GARANT-005). | Decisão A19 |

**Por que a confirmação vive numa rota própria, e não num "sim" no chat (IA-ACAO-004).** Interpretar linguagem natural como autorização para escrever é abrir uma classe de erro inteira: "sim, mas não isso", um "sim" respondendo outra pergunta da conversa, uma ambiguidade que o modelo resolve errado. Um botão que mostra exatamente o que vai acontecer, e só existe enquanto a proposta for a mais recente coisa pendente, não tem essa ambiguidade — a pessoa vê o que vai confirmar antes de confirmar.

**Por que a confirmação revalida tudo (IA-ACAO-005).** É o mesmo raciocínio de IA-GARANT-003 aplicado à escrita em vez de à leitura: a proposta que chegou na resposta é o que o MODELO disse que queria fazer, não uma garantia de que ainda é seguro fazer. A idéia referenciada pode ter sido arquivada por outra pessoa nesse meio-tempo; o título pode ter deixado de caber no limite se algo mudou. O servidor não herda confiança da resposta anterior — confere de novo, na hora de escrever de verdade.

**O que isto NÃO é.** Não é a IA ganhando autonomia sobre o quadro. As três camadas de IA-GARANT continuam valendo integralmente para o texto da resposta; o que existe agora é um QUARTO mecanismo, específico para ação, que soma confirmação humana explícita a tudo o que já existia. A pessoa continua sendo a única autora de qualquer mudança real no quadro — o assistente só prepara a proposta que ela decide aceitar ou não.

**Por que IA-ACAO-009 precisou existir.** IA-ACAO-002/004 já deixavam claro, no texto das instruções, que o assistente não deve afirmar que agiu sem ter agido. Isso funcionou na maioria das trocas — e falhou exatamente no caso mais comum: a pessoa responde "ok" depois de uma sugestão, sem repetir o pedido, e o modelo tratou isso como se fosse a confirmação de verdade, respondendo "Card criado!" com `acao_proposta` nula. Nada foi escrito no quadro, mas a pessoa leu que sim — o mesmo risco que IA-GARANT-003 existe para fechar do lado da leitura, agora do lado da escrita. Reforçar a instrução ajuda, mas pedir não é garantir; por isso o servidor também varre o texto da resposta atrás desse padrão específico de alegação, e marca — nunca reescreve — quando encontra uma sem proposta real por trás. É a mesma dupla camada de sempre: instrução no prompt, verificação determinística no servidor.

---

## 2. O que vai para o modelo

Estrutura do contexto, em ordem:

1. **Instruções do sistema** — as regras acima, incluindo o que fazer quando não há verdade validada.
2. **Bloco A — Verdades validadas do projeto.** Idéias ativas em `Finalizado`, com id, título, descrição e importância.
3. **Bloco B — Hipóteses ainda não validadas.** Idéias ativas nas outras duas colunas, mesmos campos, sob rótulo que diz explicitamente que não são fato.
4. **Identificação do projeto e da empresa** — nome da empresa, a **descrição que a própria conta escreveu** sobre ela, e o tipo do projeto. A descrição entra porque é dado interno de verdade (IA-VAZIO-007), e é o que separa uma sugestão genérica de uma que fala daquele negócio.
5. **Histórico da conversa** — ver `ia-assistente-conversa.md`.
6. **A pergunta.**

Blocos A e B são seções separadas e rotuladas. Se o bloco A estiver vazio, ele aparece **assim mesmo**, dizendo que está vazio — omitir a seção deixaria o modelo sem saber a diferença entre "não há verdade validada" e "esqueceram de mandar".

---

## 3. Contrato da resposta

O modelo devolve estrutura, não só prosa:

| Campo | Conteúdo |
|---|---|
| `resposta` | O texto para o usuário |
| `fontes` | Lista de `{ ideia_id, categoria }`, onde categoria é `validada` ou `hipotese` |
| `sem_verdade_validada` | `true` quando a resposta foi dada sem nenhuma idéia de `Finalizado` |
| `acao_proposta` | `null` na grande maioria das respostas. Quando a pessoa pediu para criar/editar/mover uma idéia nesta mensagem: `{ tipo, ...campos }` — ver IA-ACAO-002 |
| `alerta_acao_sem_proposta` | Calculado pelo servidor, não pelo modelo: `true` quando o texto da resposta alega ter criado/editado/movido algo (IA-ACAO-009) mas esta resposta não trouxe `acao_proposta` válida. A tela mostra um aviso ao lado do texto, sem alterá-lo. |

O servidor então aplica IA-GARANT-003/004 sobre `fontes`, IA-ACAO-002/005 sobre `acao_proposta`, e IA-ACAO-009 sobre o próprio texto de `resposta`, antes de entregar à tela. Uma proposta que não fechar (id fora do projeto, campo fora do limite) vira `null` silenciosamente — ao contrário de uma fonte inválida, ela **não derruba a resposta inteira**: a ação é um extra sobre o texto, não a base dele.

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| A1 | A marcação de "não validado" é visual ou só textual? | **Visual e explícita** na resposta. Distinção que existe só no tom da frase se perde na leitura rápida — que é como se lê um chat. | 25/08/2026 |
| A2 | Como garantir a separação verdade/consulta? | **Três camadas**: separação na origem, procedência na resposta, verificação no servidor. Nenhuma sozinha basta; a terceira é a que não depende do modelo. | 25/08/2026 |
| A3 | O servidor corrige a resposta do modelo? | **Não.** Marca, rebaixa ou recusa — nunca reescreve. Servidor que reescreve vira coautor e destrói a auditoria. | 25/08/2026 |
| A4 | O assistente pode dizer "não sei"? | **Sim, e deve.** É resposta esperada em projeto novo, não falha. | 25/08/2026 |
| A16 | Projeto sem nada validado: o assistente cala ou guia? | **Guia.** Toma a iniciativa e oferece próximos passos concretos. A fronteira preservada não é falar/calar, é **sugerir/afirmar**: propor caminho sempre pode; afirmar fato sobre o negócio, não. Corrige a v1.0.0, que tratava o vazio só como ausência. | 25/08/2026 |
| A17 | As sugestões podem partir do nome da empresa? | **Não.** Só do que a conta escreveu — nome, descrição, tipo do projeto. Deduzir ramo ou concorrentes a partir do nome produziria afirmação confiante sobre um negócio desconhecido, com cara de informação interna. | 25/08/2026 |
| A5 | Conhecimento geral é permitido? | **Sim, separado e nunca como fato do projeto.** Ensinar é a missão da plataforma. Sem busca externa em tempo real nesta versão. *(Assumido a partir de "apenas consultar informações internas" — se você quiser o corte rígido, é uma linha de mudança.)* | 25/08/2026 |
| A18 | O assistente pode criar/editar/mover idéia quando a pessoa pede? | **Só com confirmação explícita, num controle dedicado — nunca por conta própria.** IA-CONHEC-006 ("só lê") virava um erro de formato sempre que alguém pedia para criar um card, em vez de uma recusa clara. A correção não é deixar a IA decidir: é dar à pessoa um "sim, pode" que ela aciona de propósito, com a mesma validação de servidor que já existe para a criação manual. | 26/08/2026 |
| A19 | O modelo às vezes disse "Card criado!" sem ter proposto a ação de verdade — como reagir? | **Duas camadas, não uma.** A instrução no prompt foi reforçada para proibir explicitamente o verbo no passado e orientar a repropor a mesma ação quando a pessoa só confirma em texto ("ok"). Mas como reforçar a instrução não garante 100% de obediência do modelo (mesmo raciocínio de IA-GARANT-003), o servidor também varre o texto da resposta atrás desse padrão e marca `alerta_acao_sem_proposta` quando encontra a alegação sem proposta real por trás — a tela avisa, o texto do modelo não é reescrito (IA-GARANT-005). | 26/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| Significado da coluna `Finalizado` | A decisão I5 (`ideias-movimentacao.md`) definiu movimento livre, registrando que a coluna reflete **intenção**, não fato verificável. A partir daqui ela vira a fonte de verdade da IA, e arrastar um card passa a ter consequência real. **Mantido livre, sem confirmação**, para não acrescentar atrito a uma tela aprovada sem pedido explícito. Se um dia isso gerar validação acidental, as opções são: confirmação ao mover, ou um selo de "validada" separado da coluna. |
| Nenhuma verdade é revalidada com o tempo | Uma idéia finalizada há um ano continua valendo como verdade. Não há expiração nem revisão periódica. Aceitável agora; vira problema quando um projeto acumular histórico longo. |
| Contradição entre verdades | Duas idéias em `Finalizado` podem se contradizer, e nada detecta isso. O assistente hoje trataria as duas como fato. Fora do escopo desta versão. |
| Custo por resposta | Depende da decisão **D2** (créditos por usuário ou por empresa), aberta desde o módulo de empresas. Ver `ia-assistente-conversa.md` §4. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.3.0 | 2026-08-26 | Corrige o modelo alegando ter criado/movido/editado uma idéia quando, na prática, respondia a uma confirmação curta ("ok") sem repetir a proposta estruturada — nada era escrito, mas a pessoa lia que sim. Instruções reforçadas para proibir explicitamente o verbo no passado e orientar a repropor a mesma ação (IA-ACAO-009). Novo campo `alerta_acao_sem_proposta`, calculado no servidor por varredura de texto, e novo aviso na tela quando a alegação aparece sem proposta real por trás. Decisão A19. |
| 1.2.0 | 2026-08-26 | O assistente passa a poder PROPOR criar, editar ou mover uma idéia quando a pessoa pede — nunca decidir sozinho (IA-ACAO-001 a 008, decisão A18). IA-CONHEC-006 revisto para refletir a distinção entre "ler por conta própria" e "agir com confirmação humana". Novo campo `acao_proposta` no contrato de resposta (§3). Corrige o erro em que pedir a criação de um card quebrava com "formato inesperado" em vez de receber uma resposta clara. |
| 1.1.0 | 2026-08-25 | Projeto em branco deixa de ser tratado só como ausência: o assistente passa a guiar quem está começando (IA-VAZIO-005 a 009). A fronteira foi reafirmada como *sugerir vs. afirmar*, não *falar vs. calar*. Descrição da empresa entra no contexto. Decisões A16 e A17. |
| 1.0.0 | 2026-08-25 | Documento criado. Categorias de conhecimento (IA-CONHEC), as três camadas de garantia (IA-GARANT), o caso sem verdade validada (IA-VAZIO) e o limite do conhecimento geral (IA-GERAL). Decisões A1 a A5. |
