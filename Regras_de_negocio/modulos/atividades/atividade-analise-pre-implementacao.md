# Análise pré-implementação — `atividade.html`

> **Módulo:** Atividades (novo — ainda não existe no backend)
> **Página:** `atividade.html`
> **Status:** Levantamento feito. **Parcialmente substituído** por [`atividade-lista.md`](atividade-lista.md) (v1.1.0, implementado) — Acessar, adicionar tarefa, priorizar por ordem e concluir tarefa já têm regra oficial e código. §4 (modelo de dados com tabela `atividades` própria) **não** foi o modelo adotado — `atividade-lista.md` §0 decidiu não ter tabela separada. As perguntas P2–P5, P8–P10 e "Excluir tarefa" abaixo continuam sem resposta.
> **Gerado sob:** `Skills/regra_de_negocio.skill` — fase de análise, antes do planejamento
> **Documentos irmãos (já existentes, e que já preveem este módulo):** [`ideias-movimentacao.md`](../ideias/ideias-movimentacao.md) §1.4 e §4 · [`ideias-quadro.md`](../ideias/ideias-quadro.md) §5 · [`ideias-criacao.md`](../ideias/ideias-criacao.md)

Este documento **não é** a fonte oficial de regras do módulo — ele existe para reunir, num só lugar, tudo que hoje descreve o comportamento pretendido de `atividade.html`, comparar com o que já foi decidido em outros módulos, e levantar as perguntas que faltam responder antes de planejar a implementação. Depois que essas perguntas tiverem resposta, o conteúdo aprovado vira o `atividade-lista.md` de verdade, com regras `ATV-xxx` e versionamento próprio — como já existe para `empresas`, `projetos`, `ideias` e `ia`.

---

## 1. Onde a página se encaixa hoje

`atividade.html` **não é uma página nova conceitualmente** — o encaixe dela já está registrado em dois documentos que a citam como dependência:

- `ideias-movimentacao.md` §1.4 (`IDEIA-MOV-PONTE`): já decide que **concluir a atividade de uma idéia move essa idéia para "Finalizado" automaticamente** (`IDEIA-MOV-014`), que a idéia afetada precisa ser identificada **pelo `id`, nunca pelo título** (`IDEIA-MOV-015` — corrige um bug específico do protótipo atual, descrito abaixo), e que essa mudança **precisa ser persistida pela API como qualquer outra movimentação** (`IDEIA-MOV-016`). A pendência aberta nesse mesmo documento diz literalmente: *"o gatilho exato entra junto do módulo de atividades"* — é isso que este documento começa a especificar.
- `ideias-quadro.md` §5 (tabela de pendências): registra que o botão **"Acessar" do card de idéia** leva hoje a `atividade.html` ou a `matriz_csd.html`, e que o contrato dessa navegação "entra junto do módulo de atividades".
- Em `visao_do_projeto.html`, o próprio código do botão "Acessar" documenta a lacuna: hoje, na ausência do módulo, o botão apenas move a idéia para a coluna seguinte — um substituto **honesto**, não a navegação real (comentário no código: *"o destino do 'Acessar' pertence ao módulo de atividades, que ainda não existe"*).

**Conclusão:** este não é um pedido de página nova solta — é o módulo que dois outros documentos já esperam e citam por nome. Isso significa que parte das regras **já está decidida** e não deveria ser revisitada aqui, só implementada (ver §5).

---

## 2. Estado atual da interface — o que existe e o que é ilusão

Igual ao que valeu para `visao_do_projeto.html` antes do assistente ser implementado: a tela está **inteiramente pronta visualmente e inteiramente falsa por baixo**. Nenhuma chamada à API, nenhum `js/api.js` carregado, nenhum dado vindo de lugar nenhum — tudo é HTML fixo e `localStorage`.

| Aspecto | Situação hoje |
|---|---|
| Autenticação / sessão | **Nenhuma.** A página não importa `js/api.js`, não verifica login, não redireciona sem sessão. Qualquer um que abra o arquivo vê a tela. |
| Empresa / projeto / idéia | **Fixos no HTML.** O título mostra sempre "Nike / site"; não há leitura de `?empresa=` / `?projeto=` na URL, nem de qual idéia esta atividade pertence. |
| Lista de tarefas | 6 `<li>` fixas no HTML, a maioria com `hidden` (reveladas de uma vez só pelo botão "Gerar tarefas com IA" — que não gera nada, só tira o `hidden`). |
| Criar tarefa | O formulário mostra "Tarefa adicionada com sucesso" **mas nunca insere o card na lista** — só o caminho de edição (`tarefaEditando` preenchido) atualiza o DOM. Bug do protótipo, não decisão. |
| Editar / duplicar / excluir tarefa | Mexem só no DOM local (clona nó, edita texto, remove nó). Nada persiste; recarregar a página desfaz tudo. |
| Finalizar / reabrir tarefa | Troca a cor/ícone do selo de status. **Finalizar uma tarefa individual redireciona imediatamente para `visao_do_projeto.html?board=1`** — o que parece efeito colateral de teste, não comportamento pretendido (ver pergunta P6). |
| "Acessar tarefa" | O link vai para `pesquisa.html` em todos os cards, **exceto** o card cujo título é literalmente o texto `"Matriz CSD"`, que vai para `matriz_csd.html`. A escolha de destino é feita **comparando o texto do título**, não um tipo/id da tarefa — a mesma classe de bug que `IDEIA-MOV-015` já teve que corrigir em outro lugar. |
| Editar / excluir a atividade em si | Os modais existem no HTML e o JavaScript que os abre também — mas **o botão/menu que deveria abri-los não existe na página**. É código morto hoje: não há como um usuário chegar a esses dois modais pela interface. |
| "Concluir atividade" (botão do cabeçalho) | Abre confirmação e, ao confirmar, **só navega** para `visao_do_projeto.html?board=1`. Não move nenhuma idéia (não poderia — não há id de idéia em lugar nenhum da página). |
| Reordenar tarefas | Arrastar (mouse) e setas (teclado) funcionam **só no DOM**, mesma mecânica de `IDEIA-MOV-006/007` do quadro de idéias. Não persiste — mesmo caso já registrado como pendência aceitável em `ideias-movimentacao.md` §4 ("ordem dentro da coluna"). |
| Assistente de IA (painel lateral) | Existe visualmente, mas está **totalmente desconectado**: sem `js/ia.js`, sem `js/api.js`, e com a **mesma conversa de exemplo falsa** (texto sobre inadimplência e moradores vendendo em e-commerce) que `visao_do_projeto.html` tinha antes de `IA-CONV` ser implementado. O mesmo bug, na mesma frase, ainda não corrigido aqui. |
| Navegação / menu lateral | A página **não aparece em nenhum menu** — nenhuma outra tela linka para `atividade.html` diretamente; hoje só seria alcançável por um "Acessar" que, como visto acima, nem leva até ela de verdade. |
| Ponte com `pesquisa.html` | Via `localStorage`, com duas chaves: `tarefa-1-status` (marca **uma única tarefa fixa**, "tarefa-1", como concluída — não generaliza para outras tarefas) e `nova-tarefa` (um objeto de tarefa criado em `pesquisa.html` e inserido aqui uma única vez ao carregar). Nenhuma das duas passa pelo servidor. |
| Ponte com `matriz_csd.html` | Só a navegação por link (`Acessar` → `matriz_csd.html`, ou `matriz_csd.html?modo=leitura` se a tarefa já estiver concluída). Nenhum dado troca de mão. |

---

## 3. Um sinal a **não** seguir: `idea-finalizada` em `pesquisa.html`

Ao concluir uma tarefa em `pesquisa.html`, o código grava (além de `tarefa-1-status`) uma segunda chave, `idea-finalizada`, com título/descrição/importância — aparentemente para nascer um card **novo**, direto na coluna "Finalizado" de `visao_do_projeto.html`.

Duas coisas importantes:

1. **Essa chave nunca é lida em `visao_do_projeto.html`** — é código morto, nunca ficou conectada. Não é um comportamento ativo hoje.
2. **Se fosse implementada como está**, contradiria uma regra já decidida: `IDEIA-CRIA-003` — *"Toda idéia nasce na coluna 'Minhas idéias' ... Não é possível criar já em outra coluna."* Criar uma idéia nova direto em "Finalizado" ao concluir uma tarefa de pesquisa reabriria exatamente essa porta.

Registro aqui só para deixar claro: ao construir o módulo de verdade, o caminho correto é o que `IDEIA-MOV-014` já decidiu — **mover a idéia existente** (pelo `id`) para "Finalizado" quando a atividade é concluída — nunca criar uma idéia nova nesse momento.

---

## 4. Modelo sugerido (rascunho, não decidido)

Só para dar forma à conversa — nenhum campo aqui está fechado:

```
atividades
  id            uuid (pk)
  ideia_id      uuid (fk → ideias.id, único? — ver P1)
  criado_em     timestamp
  concluida_em  timestamp (null enquanto aberta)

tarefas
  id            uuid (pk)
  atividade_id  uuid (fk → atividades.id, cascade)
  tipo          enum (pesquisa | entregavel | dinamica | ...)  -- ver P3
  titulo        text
  descricao     text
  status        enum (pendente | concluida)
  ordem         ? -- ver P7
  criado_em     timestamp
```

`tipo` é o que decidiria para qual página o "Acessar tarefa" navega (`pesquisa.html`, `matriz_csd.html`, ou outras que ainda não existem) — em vez de comparar o texto do título, como o protótipo faz hoje.

---

## 5. O que já está decidido e não deveria ser reaberto aqui

- **`IDEIA-MOV-014`** — concluir a atividade move a idéia para "Finalizado" automaticamente; é um atalho, o movimento livre (`I5`) continua valendo.
- **`IDEIA-MOV-015`** — a idéia afetada é identificada pelo `id`, nunca por título/texto. Isso também deveria valer para "Acessar tarefa" escolher a página de destino (hoje compara o título "Matriz CSD" — mesmo defeito, mesma correção).
- **`IDEIA-MOV-016`** — a mudança é persistida pela API; nada vive só no navegador (isso invalida o padrão `localStorage` usado hoje entre `atividade.html` e `pesquisa.html`).
- **`IDEIA-CRIA-003`** — nenhuma idéia nasce fora de "Minhas idéias" (ver §3 acima).
- **`IA-CONV-001`** — a conversa do assistente é por pessoa, **dentro de cada projeto** — não há hoje o conceito de conversa por atividade. Ver `P8`.

---

## 6. Perguntas em aberto — precisam de decisão antes do planejamento

| # | Pergunta | Por que importa |
|---|---|---|
| P1 | Uma idéia tem **no máximo uma** atividade, ou pode ter várias ao longo do tempo? A atividade nasce automaticamente no primeiro "Acessar", ou por uma ação explícita? | Define o modelo de dados (`ideia_id` único ou não) e o que "Acessar" faz na primeira vez. |
| P2 | Ao concluir a atividade (`IDEIA-MOV-014`), o que acontece se ainda houver tarefas pendentes? Bloqueia, avisa e deixa seguir, ou é ignorado silenciosamente? | Hoje o botão "Concluir atividade" não olha para o estado das tarefas. |
| P3 | Os "tipos" de tarefa (Mais utilizados / Pesquisa / Entregáveis / Dinâmicas, vistos no modal "Nova tarefa") são uma lista fixa e pequena, ou precisa ser extensível? Cada tipo tem uma página própria (como `pesquisa.html` e `matriz_csd.html` hoje), e o que acontece com um tipo que ainda não tem página? | Decide o enum de `tipo` e como o roteamento de "Acessar tarefa" funciona sem comparar texto. |
| P4 | "Gerar tarefas com IA" segue o mesmo padrão de proposta/confirmação do assistente (`IA-ACAO` — a IA nunca grava sozinha, só propõe) ou é outro fluxo? | Hoje é só um botão que revela cards já escritos à mão — nada é gerado de verdade. |
| P5 | O menu "editar atividade" / "excluir atividade" (modais já existem, sem gatilho na tela) — continua fazendo parte do escopo, ou foi abandonado de propósito? Se existir, excluir a atividade também exclui a idéia, ou só desfaz a atividade e a idéia volta a existir sem ela? | Hoje é código morto: precisa decisão para saber se implementa o gatilho ou remove o resto. |
| P6 | Finalizar **uma tarefa** individual, no protótipo, redireciona para `visao_do_projeto.html?board=1` — parece efeito colateral de teste. O comportamento pretendido é permanecer na atividade depois de finalizar uma tarefa? | Sair da tela ao concluir uma única tarefa (não a atividade inteira) parece um bug de navegação, não uma decisão. |
| P7 | Reordenar tarefas arrastando: persiste (exige campo de posição, como `ideias-movimentacao.md` §4 já registrou como pendência em aberto para idéias) ou fica só na sessão, igual está hoje? | Mesma pendência já aceita para idéias — vale decidir se este módulo segue o mesmo padrão. |
| P8 | A conversa do assistente nesta tela é **a mesma** conversa do projeto (`IA-CONV-001`, que hoje é por pessoa+projeto), reaproveitada aqui, ou o módulo de atividades precisa de uma dimensão nova (por pessoa+atividade)? | Muda o modelo de dados de `ia_conversas` se for uma dimensão nova; se for a mesma, só precisa carregar o painel como já existe em `visao_do_projeto.html`. |
| P9 | Quem pode ver/mexer numa atividade — os mesmos três papéis de idéias (proprietário, membro, especialista — `IDEIA-CRIA-PAPEL`), ou alguma regra adicional (por exemplo, só quem "acessou" primeiro)? | Define a régua de permissão da rota, mesmo raciocínio já usado em `ideias.ts` e `ia.ts`. |
| P10 | Duplicar uma tarefa — hoje é só um clone no DOM. No real, duplicar deveria criar a tarefa nova imediatamente no servidor (com um novo id), ou abrir pré-preenchido no modal de criação para revisão antes de salvar? | Muda se "Duplicar" é uma ação de um clique ou passa por confirmação de conteúdo. |

---

## 7. Defeitos do protótipo a corrigir ao construir (não são decisões, são bugs)

- Criar tarefa nova não insere o card — só mostra a mensagem de sucesso.
- O rótulo "Concluir atividade" é usado tanto no botão do cabeçalho (finaliza a atividade inteira) quanto no menu de cada tarefa (que na verdade finaliza só aquela tarefa) — mesmo texto, ações diferentes.
- "Acessar tarefa" decide o destino comparando o texto do título ("Matriz CSD") em vez de um tipo/id estável.
- Ponte com `pesquisa.html` via `localStorage` com chave fixa `tarefa-1-status`, que só funciona para uma tarefa específica, não generaliza.
- Conversa do assistente com o mesmo texto de exemplo falso já corrigido em `visao_do_projeto.html` (`IA-CONV-006`) — aqui ainda não.
- Nenhum estado de carregando / vazio / erro / sem permissão / offline — a tela sempre mostra os mesmos dados fixos.

---

## 8. Classificação (conforme `Skills/regra_de_negocio.skill`)

**Impacto desconhecido / módulo novo.** Não há regra existente sendo contradita (as poucas regras já escritas em outros módulos — `IDEIA-MOV-014/015/016`, `IDEIA-CRIA-003` — são compatíveis com o que a tela tenta fazer, só ainda não foram implementadas do lado de `atividade.html`). O que falta não é resolver conflito, é **decidir as perguntas da §6** para poder escrever as regras `ATV-xxx` de verdade e então planejar a implementação.

---

## 9. Próximo passo sugerido

Responder as perguntas P1–P10 (ou marcar as que preferir decidir só na hora do planejamento). A partir das respostas, o passo seguinte é o planejamento formal (arquivos afetados, contrato de API, modelo de dados definitivo, critérios de aceite) — ainda não incluído aqui, como pedido.
