# Regras de Negócio — Movimentação de Idéias entre Colunas

> **Versão:** 1.0.1 · **Status:** Regras definidas; a ponte com `atividade.html` (Acessar / Concluir atividade) está implementada — o resto do movimento dentro do quadro (`visao_do_projeto.html`) segue como antes.
> **Módulo:** Idéias · **Página:** `visao_do_projeto.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ideias-quadro.md`](ideias-quadro.md) — de onde vêm as colunas e o isolamento · [`ideias-criacao.md`](ideias-criacao.md) · [`ideias-exclusao.md`](ideias-exclusao.md)

---

Este é o comportamento que define a tela: a idéia sai de "Minhas idéias", passa por "Em andamento" e chega em "Finalizado". Tudo o mais no quadro existe para servir esse movimento.

---

## 1. Regras

### 1.1 Movimento — `IDEIA-MOV`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MOV-001 | Uma idéia pode ir de **qualquer coluna para qualquer outra**, em qualquer ordem. Não há sequência obrigatória, nem caminho só de ida. | Decisão I5 |
| IDEIA-MOV-002 | Mover uma idéia altera **apenas** o campo `status`. Título, descrição, importância e data de criação não mudam. | Decorre de IDEIA-MOV-001 |
| IDEIA-MOV-003 | Soltar a idéia na coluna onde ela já está não é uma alteração: não chama a API, não emite mensagem e não registra nada. | Interface existente |
| IDEIA-MOV-004 | Quem pode mover é quem pode criar — proprietário, membro e especialista. Ver `ideias-criacao.md` §1. | Decisão I6 |
| IDEIA-MOV-005 | O contador de cada coluna reflete o que está visível nela naquele momento, respeitando a busca ativa. | Interface existente |

**Por que o movimento é livre (IDEIA-MOV-001).** Foi uma decisão consciente entre duas alternativas legítimas. A alternativa era amarrar "Finalizado" à conclusão real da atividade correspondente, o que faria a coluna significar algo verificável — o quadro nunca mentiria. Optamos pelo movimento livre porque este quadro é a ferramenta de organização **do próprio usuário**, não um relatório de progresso para terceiros. Uma idéia pode ser considerada resolvida sem nunca ter virado atividade, e travar isso obrigaria a excluir a idéia como única forma de tirá-la da frente — pior resultado que uma coluna imprecisa.

### 1.2 Três caminhos, uma porta — `IDEIA-MOV-CAMINHOS`

O protótipo oferece três formas de mover um card, e isso deve ser preservado:

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MOV-006 | Arrastar e soltar com o mouse. | Interface existente |
| IDEIA-MOV-007 | Setas esquerda/direita do teclado, com o card em foco. | Interface existente |
| IDEIA-MOV-008 | Um botão no próprio card, que o leva à coluna seguinte. | Interface existente |
| IDEIA-MOV-009 | Os três caminhos passam pela **mesma função** de movimentação. Nenhum deles altera `status` por conta própria. | Interface existente |
| IDEIA-MOV-010 | Toda movimentação é anunciada em região viva (`aria-live`) no formato "*{título}* movida para *{coluna}*". | Interface existente |

**Por que IDEIA-MOV-009 vira regra e não fica só no código.** Três gestos que fazem a mesma coisa são três chances de divergir: alguém corrige a validação no arrastar e esquece do teclado, e a tela passa a permitir pelo teclado o que proíbe pelo mouse. Com uma porta única, a regra de permissão, a chamada à API e o tratamento de erro existem em um lugar só. O protótipo já faz assim — a regra existe para que continue assim.

**Nota de acessibilidade.** Arrastar com mouse é o único dos três caminhos que exclui parte dos usuários. Os outros dois não são enfeite: são o que torna a tela operável por teclado e por leitor de tela. Remover qualquer um deles em nome de simplificação é uma regressão, não uma limpeza.

### 1.3 Persistência e falha — `IDEIA-MOV-API`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MOV-011 | O card se move na tela imediatamente, sem esperar o servidor, e a chamada segue em paralelo. | Decisão I7 |
| IDEIA-MOV-012 | Se a chamada falhar, o card **volta para a coluna de origem** e a tela avisa que não foi possível mover. Nunca fica um estado na tela que não existe no banco. | Decisão I7 |
| IDEIA-MOV-013 | Um `404` numa movimentação significa que a idéia deixou de existir ou de ser acessível (arquivada por outra pessoa, projeto arquivado). A tela recarrega o quadro em vez de insistir. | Decorre de IDEIA-ISO-003 |

**Por que mover primeiro e confirmar depois (IDEIA-MOV-011).** Arrastar é um gesto físico: a mão soltou o card, o olho espera que ele fique onde foi solto. Um card que congela no ar esperando resposta de rede parece travado, e o usuário arrasta de novo. O risco dessa escolha é o card mentir se o servidor recusar — e é exatamente por isso que IDEIA-MOV-012 existe e não é opcional. Otimismo sem reversão vira mentira.

### 1.4 A ponte com a página de atividade — `IDEIA-MOV-PONTE`

Quando o usuário conclui a atividade correspondente a uma idéia em `atividade.html`, a idéia deve chegar em "Finalizado" sozinha.

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MOV-014 | Concluir a atividade de uma idéia move essa idéia para `finalizado` automaticamente. É um atalho, não o único caminho (IDEIA-MOV-001). | Decisão I5 |
| IDEIA-MOV-015 | A idéia afetada é identificada **pelo `id`**, nunca pelo título. | Decidido 24/08/2026 — corrige o protótipo |
| IDEIA-MOV-016 | A mudança é persistida pela API, como qualquer outra movimentação. Não existe estado que viva só no navegador. | Decidido 24/08/2026 — corrige o protótipo |

**O bug que IDEIA-MOV-015 conserta.** Hoje a ponte é feita por `localStorage`: `atividade.html` grava um objeto com o **título** da idéia, e o quadro procura `IDEAS.find(i => i.title === titulo)`. Isso quebra de três maneiras distintas, todas plausíveis:

- **Títulos repetidos.** Duas idéias chamadas "Landing page" e a página move a primeira que encontrar — que pode não ser a certa.
- **Título editado no meio do caminho.** O usuário renomeia a idéia depois de abrir a atividade; na volta nada casa, e o código então **cria um card novo** em "Finalizado", duplicando a idéia em vez de movê-la.
- **Nada persiste.** Como tudo vive em `localStorage` e em memória, recarregar a página desfaz a movimentação silenciosamente.

Casar por id resolve os três de uma vez: o id não se repete, não muda quando o título muda, e é o que a API já usa.

---

## 2. Contrato da API — `PATCH /empresas/:empresaId/projetos/:projetoId/ideias/:id/status`

Requisição autenticada pelo cookie de acesso.

**Corpo:** `{ "status": "ideias" | "andamento" | "finalizado" }`

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ ideia }` | Mantém o card onde foi solto |
| `status` ausente ou fora do enum | `400` com `campo: "status"` | Devolve o card e mostra o erro |
| Sessão inválida | `401` | Renovação silenciosa; só então login |
| Tem vínculo, mas o papel não permite mover | `403` | Devolve o card e explica |
| Qualquer elo da corrente falha (IDEIA-ISO-003) | `404` | Recarrega o quadro (IDEIA-MOV-013) |
| Falha de rede | — | Devolve o card e mostra erro de conexão |

**Por que uma rota só para o status, e não o `PUT` de edição.** Mover é a ação mais frequente da tela e a única que pode disparar dezenas de vezes em um minuto. Uma rota dedicada recebe só o campo que muda, o que torna impossível uma movimentação sobrescrever, por acidente, o título ou a descrição que outra pessoa acabou de editar. É também o que permite dar ao especialista o direito de mover sem lhe dar o direito de reescrever o conteúdo — ver `ideias-criacao.md`.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| I5 | "Finalizado" é livre ou só se conquista concluindo a atividade? | **Livre.** O usuário arrasta para onde quiser; concluir a atividade também move, como atalho. Consequência aceita: a coluna reflete a intenção do usuário, não um fato verificável. | 24/08/2026 |
| I6 | O especialista pode mover cards? | Sim. Mover é organizar, não destruir — e organizar é parte do que se contrata um especialista para fazer. Ver I8 em `ideias-criacao.md`. | 24/08/2026 |
| I7 | Movimento otimista ou espera o servidor? | Otimista, **com reversão obrigatória em caso de falha**. Um card que espera a rede parece travado; um card que mente é pior. As duas metades da decisão são inseparáveis. | 24/08/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Ordem dentro da coluna | Hoje a ordem é dada pela ordenação escolhida na barra (recente/relevância/data), não por posição manual. Arrastar para reordenar **dentro** da mesma coluna não faz nada. Se um dia virar requisito, exige uma coluna de posição no banco — fora do escopo desta versão. |
| Edição simultânea | Duas pessoas movendo a mesma idéia ao mesmo tempo: a última chamada vence, sem aviso. Aceitável no volume atual; revisitar se o uso colaborativo crescer. |
| ~~Contrato da conclusão de atividade~~ | **Resolvido em 28/08/2026** — `atividade.html` agora existe (`atividade-lista.md`). "Acessar" (`ATV-ACESSO-001`) move a idéia para "Em andamento" pela API real; "Concluir atividade" nessa mesma tela move a idéia para "Finalizado" (`IDEIA-MOV-014`), também pela API real, pelo id — nunca por localStorage nem por título (`IDEIA-MOV-015`). |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.1 | 2026-08-28 | Pendência "Contrato da conclusão de atividade" resolvida — `atividade.html` foi implementada (`atividade-lista.md`) e agora chama a API real tanto para `ATV-ACESSO-001` (Acessar → "Em andamento") quanto para `IDEIA-MOV-014` (Concluir atividade → "Finalizado"). Nenhuma regra nova aqui; só o gatilho que faltava passou a existir. |
| 1.0.0 | 2026-08-24 | Documento criado. Regras de movimentação (IDEIA-MOV), os três caminhos equivalentes, persistência otimista com reversão e a correção da ponte com `atividade.html` (id em vez de título). Decisões I5 a I7. |
