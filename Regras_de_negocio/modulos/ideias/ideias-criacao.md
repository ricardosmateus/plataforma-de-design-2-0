# Regras de Negócio — Criação e Edição de Idéias

> **Versão:** 1.1.2 · **Status:** Regras definidas; implementação não iniciada
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
| IDEIA-DUPL-001 | Ao **criar ou editar** uma idéia, o servidor compara título e descrição, juntos, com toda idéia **ativa** do projeto — as três colunas, nunca uma arquivada. | Decisão I12 |
| IDEIA-DUPL-002 | A comparação usa um limiar de semelhança, não igualdade exata: variação de acento, caixa e ordem das palavras não escondem uma duplicata, mas conteúdo só parcialmente parecido não dispara o aviso à toa. | Decisão I12 |
| IDEIA-DUPL-003 | Encontrada uma parecida e a pessoa ainda não confirmou que quer mesmo assim, o servidor **não grava nada** — devolve qual idéia é a parecida, numa resposta de sucesso (não é erro: é uma decisão pendente, mesmo desenho de `acao_proposta` no assistente de IA). | Decisão I12 |
| IDEIA-DUPL-004 | A tela mostra um **alerta flutuante**, não uma modal bloqueante: a pessoa continua vendo o quadro atrás dele enquanto decide. | Decisão I12 |
| IDEIA-DUPL-005 | O alerta já chega **filtrando o quadro** para a idéia parecida — a pessoa não precisa clicar em nada para achá-la, ela aparece isolada atrás do alerta. Um link "Ver idéia parecida" abre a leitura completa. | Decisão I12 (ajustada 26/08/2026) |
| IDEIA-DUPL-006 | O alerta oferece exatamente duas ações: **"Criar"/"Salvar"** (confirma e grava mesmo assim, rotulado conforme é criação ou edição) e **"Cancelar"** (descarta a tentativa nova; a idéia existente não é tocada). Não há uma terceira opção que mescle as duas. | Decisão I12 (ajustada 26/08/2026) |
| IDEIA-DUPL-007 | Nunca bloqueia o salvamento de forma definitiva — é aviso, não trava. IDEIA-CRIA-007 (títulos repetidos são permitidos) continua valendo integralmente. | Decorre de IDEIA-CRIA-007 |
| IDEIA-DUPL-008 | Vale tanto para **criar** quanto para **editar**. Ao editar, a própria idéia sendo editada nunca é comparada consigo mesma. | Decisão I12 |

**Por que isto não é unicidade (IDEIA-DUPL-007).** A tentação óbvia seria recusar o salvamento quando algo parecido já existe — mas a decisão I10 já estabeleceu, de propósito, que títulos repetidos são legítimos em brainstorm. Bloquear reintroduziria pela porta dos fundos exatamente o que I10 rejeitou. O que existe aqui é avisar cedo o bastante para a pessoa decidir com informação — nunca decidir por ela.

**Por que a resposta é de sucesso, não um erro (IDEIA-DUPL-003).** Um `409`/`400` sinalizaria que algo deu errado, mas nada deu errado — é uma pausa legítima para uma escolha, igual à proposta de ação do assistente de IA (`ia-assistente-conhecimento.md` §1.5): o servidor devolve o que encontrou, e quem decide o próximo passo é sempre a pessoa, nunca o sistema sozinho.

**Por que o alerta não é a modal de excluir.** A modal de exclusão é destrutiva e irreversível — faz sentido exigir foco total antes de confirmar. Aqui não: a pessoa pode querer reler a idéia existente, comparar, mudar de ideia sobre o texto novo. Uma modal bloqueante atrapalharia exatamente esse ir-e-vir; um alerta flutuante deixa o quadro visível e a decisão acontece no próprio ritmo de quem está brainstormando.

**Sobre o limiar de semelhança (IDEIA-DUPL-002).** É um número calibrado às pressas, sem uso real para validar contra — fica documentado no código (`api/src/ideias/duplicidade.ts`) como a primeira coisa a ajustar se o alerta disparar demais (viraria ruído que a pessoa aprende a ignorar) ou de menos (deixaria de cumprir o propósito). Ver pendência correspondente em §4.

**Bug corrigido em 26/08/2026 — o alerta escondido bloqueava o clique em "Nova idéia".** `.dup-alerta{display:flex}` tem a mesma especificidade CSS do `[hidden]{display:none}` do navegador, e regra de autor sempre vence empate contra regra do user-agent — então o elemento nunca ficava de fato `display:none`, mesmo com o atributo `hidden` presente: continuava ocupando layout e, principalmente, continuava recebendo eventos de clique por cima do cabeçalho, mesmo invisível (`opacity:0` não desliga hit-testing). Resultado: com o alerta oculto, clicar em "Nova idéia" não fazia nada. O mesmo defeito, com a mesma causa, já existia em `.toast` — corrigido junto, mesma correção. Ajuste: `pointer-events:none` no estado padrão, `.dup-alerta[hidden]{display:none}` (mais específico, garante o repouso) e `pointer-events:auto` só em `.dup-alerta.is-visible`. Este é o mesmo padrão já usado em `.btn[hidden]`, na mesma página, por um incidente real anterior em `projetos.html`.

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

### `PUT /empresas/:empresaId/projetos/:projetoId/ideias/:id`

Mesmo corpo e mesmas respostas do `POST` — incluindo a checagem de duplicidade, agora excluindo a própria idéia sendo editada da comparação (IDEIA-DUPL-008) —, mais:

| Situação | Resposta | O que a tela faz |
|---|---|---|
| A idéia não existe, está arquivada, ou não é deste projeto | `404` | Recarrega o quadro |

O `PUT` **não** altera `status` — mover tem rota própria (`ideias-movimentacao.md` §2). Uma edição nunca move um card, e uma movimentação nunca reescreve texto.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| I8 | O que o especialista pode fazer com idéias? | **Cria, edita e move; não exclui** — nem as próprias. Idéias são a mesa de trabalho dele; exclusão pertence a quem é da empresa. | 24/08/2026 |
| I9 | A importância é obrigatória? | Não. Zero é um valor válido e significa "sem prioridade definida". Obrigar uma nota no instante da criação produz números inventados. | 24/08/2026 |
| I10 | Título de idéia é único no projeto? | Não. Repetição é legítima em brainstorm. Consequência assumida: nenhuma parte do sistema pode identificar idéia por título (ver IDEIA-MOV-015). | 24/08/2026 |
| I11 | A IA gera idéias nesta versão? | **Não** — adiada com o restante da IA (decisão I3, `ideias-quadro.md`). A modal "Gerar com ajuda da IA" e seu botão saem da tela até a funcionalidade existir. | 24/08/2026 |
| I12 | Deve haver checagem de duplicidade ao salvar uma idéia? | **Sim, como aviso — nunca como bloqueio.** Compara título e descrição, juntos, com toda idéia ativa do projeto; encontrando uma parecida, mostra um alerta flutuante — já filtrando o quadro para ela — com duas ações ("Criar"/"Salvar" ou "Cancelar") e não grava nada até a pessoa decidir. Preserva I10 integralmente: não é unicidade, é uma decisão informada. | 26/08/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Geração por IA | **Adiada (I3/I11).** Quando entrar, define-se: quantas idéias por vez, se caem direto no quadro ou passam por aprovação, custo em créditos, e que contexto do projeto alimenta o modelo. |
| Anexos na idéia | O compositor do assistente tem um botão de anexo. Não há regra de anexo em idéia, e o campo não existe no modelo. Fora do escopo desta versão. |
| Histórico de edição | Não se registra quem editou o quê. Se virar requisito (provável, com especialistas externos escrevendo), exige tabela de auditoria própria. |
| Limiar de semelhança do IDEIA-DUPL | Calibrado sem uso real para validar contra (`LIMIAR_DUPLICATA` em `api/src/ideias/duplicidade.ts`). Se o alerta disparar demais (vira ruído que a pessoa aprende a ignorar) ou de menos (deixa de cumprir o propósito), este número — e os pesos entre título e descrição — são o primeiro ajuste a fazer, de preferência com casos reais do quadro em mãos. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.1.2 | 2026-08-26 | Correção de bug: `.dup-alerta` (e, junto, `.toast`, mesmo defeito) ficava clicável e interceptando cliques mesmo escondido (`hidden`), por causa de um empate de especificidade CSS entre `[hidden]` e `display:flex` — bloqueava o clique em "Nova idéia". Corrigido com `pointer-events:none`/`[hidden]{display:none}`/`pointer-events:auto` só em `.is-visible`, mesmo padrão já usado em `.btn[hidden]`. |
| 1.1.1 | 2026-08-26 | Ajustes de acabamento no alerta de duplicidade (IDEIA-DUPL-005/006): o quadro já vem filtrado para a idéia parecida assim que o alerta aparece, sem precisar clicar em "Ver idéia parecida"; botões renomeados de "Manter a criação/edição" / "Manter apenas o card atual" para "Criar"/"Salvar" e "Cancelar"; alerta mais largo. |
| 1.1.0 | 2026-08-26 | Novo alerta de duplicidade ao criar ou editar uma idéia (IDEIA-DUPL-001 a 008, decisão I12): compara título e descrição com as idéias ativas do projeto e, encontrando uma parecida, avisa por um alerta flutuante em vez de gravar — a pessoa decide manter a nova tentativa ou o card existente. Não é unicidade: I10 continua valendo. Contrato da API (§2) ganha `ignorar_duplicata` e a resposta `possivel_duplicata`. |
| 1.0.0 | 2026-08-24 | Documento criado. Regras de criação e edição (IDEIA-CRIA), papéis com a permissão de escrita do especialista, e regras da modal. Decisões I8 a I11. |
