# Análise pré-implementação — `board.html`

> **Módulo:** Atividades (a tela ainda não tem regra oficial — este documento é o levantamento antes dela)
> **Página:** `board.html` (renomeado de `pesquisa.html` em 29/08/2026 — mesmo arquivo, mesmo conteúdo, só o nome mudou)
> **Status:** Levantamento feito e **respondido**. As regras oficiais vivem agora em [`board-lista.md`](board-lista.md) (v1.0.0, implementado): Q1 a Q3, Q6, Q7 e Q9 foram decididas (decisões A24 a A29); Q4, Q5 e Q8 continuam abertas e estão registradas em `board-lista.md` §5. Este documento fica como o registro de por onde se começou.
> **Gerado sob:** `Skills/regra_de_negocio.skill` — fase de análise, antes do planejamento
> **Documentos irmãos:** [`atividade-analise-pre-implementacao.md`](atividade-analise-pre-implementacao.md) — já cita esta página (como `pesquisa.html`) como o destino pretendido de "Acessar tarefa" para tarefas do tipo Pesquisa · [`atividade-lista.md`](atividade-lista.md) — pendência P3 (tipos de tarefa / roteamento do "Acessar tarefa") e P8 (assistente, já resolvida lá para `atividade.html`, mas não para esta tela) · [`ia-assistente-conversa.md`](../ia/ia-assistente-conversa.md) — pendência de créditos (decisão D2), diretamente relevante ao que esta tela finge fazer

Este documento existe para reunir, num só lugar, o que `board.html` faz hoje, comparar com o que os outros módulos já decidiram, e levantar as perguntas que faltam responder antes de escrever as regras `BOARD-xxx` de verdade e planejar a implementação — mesmo papel que `atividade-analise-pre-implementacao.md` cumpriu para `atividade.html` antes de virar `atividade-lista.md`.

---

## 1. Onde a página se encaixa hoje

`board.html` não é uma tela desconectada do resto — ela já é citada, pelo nome antigo (`pesquisa.html`), em dois lugares:

- **`atividade-analise-pre-implementacao.md` §2 e §6 (P3):** registra que "Acessar tarefa" em `atividade.html` levava a `pesquisa.html` para qualquer tarefa, exceto a de título "Matriz CSD" (que ia para `matriz_csd.html`) — e que essa escolha comparava **texto do título**, não um tipo estável, o mesmo defeito que `IDEIA-MOV-015` já teve que corrigir em outro lugar. P3 pergunta explicitamente: os "tipos" de tarefa (Pesquisa/Entregáveis/Dinâmicas, vistos no modal "Nova tarefa" de `atividade.html`) são uma lista fixa, e cada tipo tem página própria?
- **`atividade-lista.md` §5, P3:** essa pergunta segue **aberta** — "ainda não decidido... nem como isso decide para qual página o 'Acessar tarefa' leva (hoje compara o texto do título — bug conhecido, não corrigido por este documento)".

**O que mudou desde aquela análise:** quando `atividade.html` foi reescrita para falar com a API de verdade (`atividade-lista.md` v1.1.0 em diante), a ponte com `pesquisa.html`/`board.html` **não foi refeita** — ela simplesmente não existe mais no código atual. Hoje, `atividade.html` só navega para `matriz_csd.html`, e só quando o título do card é literalmente `"Matriz CSD"` (ver `atividade.html`, comentário: *"A ponte com pesquisa.html continua pendente (P3, atividade-lista.md §5): aquela tela ainda não fala com a API de tarefas."*). Clicar em "Acessar tarefa" em qualquer outro card (por exemplo "Meio de transporte" ou "Pesquisar sobre Tuk Tuk") **não faz nada**.

**Conclusão:** `board.html` continua sendo o módulo que `atividade-analise-pre-implementacao.md` já esperava e citava por nome (como `pesquisa.html`) — só que hoje está **órfã**: nenhuma tela do produto navega até ela. É alcançável apenas digitando a URL diretamente.

---

## 2. Estado atual da interface — o que existe e o que é ilusão

Mesmo diagnóstico que já valeu para `atividade.html` e `visao_do_projeto.html` antes de serem implementadas: a tela está **inteiramente pronta visualmente e inteiramente falsa por baixo**. Nenhum `<script src="js/api.js">`, nenhuma leitura de `?empresa=`/`?projeto=`/`?ideia=` da URL — o arquivo inteiro não tem uma única chamada de rede.

| Aspecto | Situação hoje |
|---|---|
| Autenticação / sessão | **Nenhuma.** Sem `js/api.js`, sem verificação de login, sem redirecionamento sem sessão. |
| Empresa / projeto / idéia / tarefa | **Fixos no HTML.** O painel explicativo mostra sempre "Meio de transporte das encomendas" com uma descrição própria ("Pesquisar todos os meios de transporte...") que **nem bate** com a descrição real dessa mesma tarefa em `atividade.html` ("Verificar qual o melhor meio para transportar as encomendas") — são textos diferentes, confirmando que não vêm da mesma fonte. |
| Título da aba (`<title>`) | Corrigido nesta renomeação: era `"Tarefas · Matriz CSD · Plataforma de Design"` — copiado de `matriz_csd.html` e nunca ajustado (mesmo título das duas páginas era um sinal claro de que uma nasceu duplicando a outra). Agora `"Pesquisa · Plataforma de Design"`. |
| Quadro / canvas infinito | **Funciona de verdade, mas só na tela.** Pan/zoom, criar "Novo quadro" com N colunas e títulos livres, adicionar "registro" (post-it) em uma coluna, arrastar entre colunas, editar e excluir registro — tudo isso mexe no DOM e não persiste em lugar nenhum. Recarregar a página apaga tudo. |
| Botão "Voltar" | Mostra uma animação de "Salvando..." por 1,4s (puramente visual — não grava nada, não é autosave de verdade) e então navega para `atividade.html` **sem `?empresa=`/`?projeto=`/`?ideia=`** — perde o contexto que a própria `atividade.html` exige para não redirecionar para fora (`ATV-ACESSO`). |
| "Pesquisar" (botão principal) | Intenção aparente: uma pesquisa assistida por IA que, ao terminar, geraria automaticamente um quadro "Resultado da Pesquisa" com colunas fixas (função `criarQuadroResultado()`, já escrita e pronta para ser chamada). **Hoje nunca dispara.** O saldo de créditos mostrado é **fixo no HTML** (`class="cr-saldo is-zerado"`, `0 de 100`) — clicar em "Pesquisar" sempre abre o modal "Créditos insuficientes", nunca inicia pesquisa nenhuma. Não existe rota de servidor para isso. |
| "Adicionar crédito" → compra via Pix | Abre um formulário que gera um QR code (`<canvas>`) e um "código copia e cola" **inteiramente local** (nenhuma chamada de rede). Não existe rota de créditos ou pagamento em `api/src/rotas/` (só `auth`, `empresas`, `ia`, `ideias`, `projetos`, `tarefas`) — isto não é um bug desta tela, é a **decisão D2 ainda em aberto** (`ia-assistente-conversa.md` §5: "crédito por usuário ou por empresa... bloqueia a publicação"), repetida aqui como peça visual antes de existir sistema de créditos de verdade em qualquer lugar do produto. |
| "Solicitar ajuda do Designer" | Botão sem nenhum ouvinte de clique — não faz nada. |
| "Editar tarefa" | Abre modal com título/descrição preenchidos, e "Salvar" só reescreve o texto na tela (`explainerTitle`/`.explainer-text`). Não chama API — e hoje **não existe** rota de edição de tarefa no backend (`api/src/rotas/tarefas.ts` tem `GET`/`POST`/`PATCH .../ordem`/`PATCH .../status`/`DELETE`, mas não `PUT`/`PATCH` para título e descrição). |
| "Excluir tarefa" | Confirma, mostra "Tarefa excluída. Redirecionando..." e manda para `atividade.html` (de novo sem os parâmetros da URL) — **sem chamar a API**. Diferente do caso de "Editar", aqui a rota **já existe** (`DELETE .../tarefas/:tarefaId`, `ATV-TAR-EXCLUI`, implementada nesta mesma sessão) — só não está ligada nesta tela. |
| "Finalizar tarefa" | Confirma, marca o selo como "Concluído" na tela, grava duas chaves de `localStorage` (`tarefa-1-status` e `idea-finalizada`, ver §3) e redireciona para `visao_do_projeto.html`. Nenhuma chamada à API de tarefas (`PATCH .../status`, que já existe e já é usada por `atividade.html`). |
| Assistente de IA (painel lateral) | Mesma casca de `visao_do_projeto.html`/`atividade.html` antes de `js/ia.js` ser ligado: **conversa de exemplo fixa** no HTML (o mesmo texto sobre inadimplência e moradores vendendo em e-commerce, que `IA-CONV-006` já mandou tirar de `visao_do_projeto.html` e `atividade.html`, mas que segue aqui). Sem `<script src="js/ia.js">`, sem `iaThread`/`iaEnviar`/`iaAviso` — não há como religar sem antes decidir P8 abaixo (esta tela representa uma idéia/atividade específica, ou o assistente aqui seria o mesmo do projeto?). |
| Painel "abrir/fechar" do assistente | **Já funciona de verdade.** Esta tela recebeu, na mesma leva que `atividade.html`, `matriz_csd.html`, `Sobre_a_empresa.html` e `visao_do_projeto.html`, a persistência de aberto/fechado via `localStorage` (`IA-CONV-PAINEL`, `ia-assistente-conversa.md` v1.3.0) — isso é real e não depende de nada resolvido neste documento. |
| Navegação / menu lateral | A trilha lateral (Início/Empresas/Projetos/Sobre a empresa) navega para fora, mas **nenhum item leva até `board.html`** — mesmo diagnóstico de `atividade.html` antes de existir "Acessar". Hoje só é alcançável digitando a URL. |
| "Ver empty state" | Controle deixado no canto inferior direito, com o próprio comentário do código avisando: *"não faz parte do design"*. É uma ferramenta de pré-visualização para quem construiu a tela, não um recurso do produto — precisa sair antes de qualquer implementação real. |

---

## 3. Um sinal a **não** seguir: `idea-finalizada`, de novo

Igual ao que `atividade-analise-pre-implementacao.md` §3 já registrou sobre este mesmo comportamento (na época descrito a partir de `pesquisa.html`, o nome antigo deste arquivo): ao confirmar "Finalizar tarefa" aqui, o código grava `idea-finalizada` no `localStorage` com título/descrição/importância — como se fosse **criar uma idéia nova** direto na coluna "Finalizado" de `visao_do_projeto.html`.

Duas coisas continuam valendo, sem mudança desde a análise anterior:

1. **Essa chave nunca é lida em `visao_do_projeto.html`** — é código morto, nunca ficou conectada.
2. **Se fosse implementada como está, contradiria `IDEIA-CRIA-003`** ("toda idéia nasce em 'Minhas idéias'... não é possível criar já em outra coluna") e ignoraria o caminho que já foi decidido para este exato cenário: `IDEIA-MOV-014/015/016` (`ideias-movimentacao.md` §1.4) — **mover a idéia existente, pelo `id`**, para "Finalizado", nunca criar uma nova.

Este documento repete o registro porque `board.html` é hoje o único lugar do código onde esse padrão rejeitado ainda está escrito — vale apagar, não reaproveitar, ao construir de verdade.

---

## 4. O que já está decidido e não deveria ser reaberto aqui

- **`IDEIA-MOV-014/015/016`** — concluir a atividade (ou, por extensão, a tarefa que a representa) move a idéia **existente**, pelo `id`, para "Finalizado"; a mudança é persistida pela API. Isso já invalida o par `tarefa-1-status`/`idea-finalizada` como estavam.
- **`IDEIA-CRIA-003`** — nenhuma idéia nasce fora de "Minhas idéias" (ver §3).
- **`ATV-TAR-EXCLUI`** (`atividade-lista.md` §1.5) — excluir tarefa já tem rota real (`DELETE .../tarefas/:tarefaId`), papéis definidos (proprietário/membro/especialista) e é "apaga de verdade", sem arquivamento. O botão "Excluir tarefa" desta tela deveria chamar essa mesma rota, não reinventar.
- **`ATV-TAR-CRIA-004`** — os três papéis que podem escrever numa tarefa (criar/reordenar/concluir/excluir) já estão definidos; qualquer ação de escrita nesta tela (editar, finalizar, excluir) deveria seguir a mesma régua, não uma nova.
- **`IA-CONV-001`/`IA-CONV-PAINEL`** — a conversa do assistente é por (projeto, pessoa), e o painel aberto/fechado já é preferência salva por pessoa, entre telas. Isso já resolve **metade** de P8 abaixo (o "abrir/fechar" já funciona aqui) — falta só religar a conversa em si.
- **Decisão D2 (créditos, em aberto)** — não é deste documento decidir crédito por usuário ou por empresa; é só registrar que o "Pesquisar"/"Adicionar crédito" desta tela é a **segunda** peça de produto (depois do assistente) que depende dessa decisão para deixar de ser encenação.

---

## 5. Perguntas em aberto — precisam de decisão antes do planejamento

| # | Pergunta | Por que importa |
|---|---|---|
| Q1 | `board.html` é a tela de destino de **todo** tipo de tarefa "Pesquisa", ou é mais genérica — um quadro de canvas livre que qualquer tarefa (de qualquer tipo) pode abrir para organizar anotações? O canvas aqui não tem colunas fixas (diferente de `matriz_csd.html`), então parece mais um "quadro em branco" do que uma ferramenta exclusiva de pesquisa. | Decide se o nome/identidade do produto para esta tela é "tela de tarefa tipo Pesquisa" ou "quadro genérico anexado a uma tarefa" — muda o texto da interface e o que P3 (`atividade-lista.md`) precisa decidir junto. |
| Q2 | Como `atividade.html` volta a levar até aqui? Precisa decidir P3 (`atividade-lista.md` §5) primeiro: tarefa ganha um campo `tipo` estável (não mais comparação de título), e esse tipo decide entre `matriz_csd.html`, `board.html`, ou nenhum (tarefa sem tela própria)? | Sem isso, `board.html` continua inalcançável por navegação normal, só por URL direta. |
| Q3 | O quadro (colunas + registros) criado aqui pertence à **tarefa**, ou à **idéia/atividade** inteira? Se pertence à tarefa, o modelo de dados precisa de uma tabela nova (`quadros`/`registros`) ligada a `tarefas.id`; se for por atividade, mais gente pode ver o mesmo quadro ao entrar por tarefas diferentes. | Define o modelo de dados e se dois membros da mesma atividade veem o mesmo quadro ou quadros separados por tarefa. |
| Q4 | "Pesquisar" deveria mesmo ser uma chamada de IA que gera um quadro pronto (como o código sugere, `criarQuadroResultado()`), seguindo o padrão de proposta/confirmação já usado em outros lugares (`IA-ACAO`) — a IA nunca grava sozinha, só propõe — ou é outro fluxo, mais parecido com uma busca? | Muda o contrato de API: uma pergunta ao assistente de projeto (`POST .../ia/perguntas`) é isolada por (projeto, pessoa); gerar um quadro de pesquisa por tarefa seria uma capacidade nova, fora do que `IA-CONV`/`IA-ACAO` cobrem hoje. |
| Q5 | O sistema de créditos (decisão D2, ainda aberta) é o mesmo que vai valer para o assistente de conversa, ou "Pesquisar" tem um custo/medidor próprio, separado? | Muda se esta tela pode esperar a decisão D2 ser tomada em outro lugar, ou se precisa da sua própria decisão de cobrança. |
| Q6 | O assistente desta tela é o mesmo do projeto (reaproveita `IA-CONV-001`, como `atividade.html` já faz — `A17`, `ia-assistente-conversa.md`), ou, por esta tela representar uma tarefa específica, faz sentido ver a conversa filtrada/ligada a essa tarefa? | Se for a mesma conversa do projeto, religar é mecânico (mesmo padrão de `js/ideias.js`/`js/atividade.js`: `window.EmpresaAtual`/`ProjetoAtual` + `IaAssistente.carregar()`). Se precisar de recorte por tarefa, é modelo de dados novo. |
| Q7 | "Editar tarefa" e "Excluir tarefa" aqui devem só chamar as rotas que **já existem** (`DELETE` já existe; edição de título/descrição ainda não existe em lugar nenhum do backend) — ou faz mais sentido que edição/exclusão de tarefa aconteçam **só** em `atividade.html` (que já lista todas as tarefas), e esta tela nem tenha esses botões? | Evita manter duas implementações da mesma ação de escrita em duas telas — o mesmo raciocínio que já vale para "Concluir tarefa" (`atividade.html`) vs. "Concluir atividade" (mesmo texto, ações diferentes, já registrado como defeito no protótipo de `atividade.html`). |
| Q8 | "Solicitar ajuda do Designer" — o que essa ação deveria fazer de verdade? Abrir um canal de contato, criar um pedido/ticket, marcar a tarefa de algum jeito? Hoje é um botão morto. | Sem saber a intenção, não dá para decidir se é uma funcionalidade nova (com modelo de dados própria) ou se sai da tela. |
| Q9 | O quadro (Novo quadro/Novo registro) persiste no servidor, ou fica só na sessão do navegador — mesma pendência já aceita para a ordem das idéias (`ideias-movimentacao.md` §4) e para a ordem das tarefas? | Se não persistir, a tela existe só como rascunho de uma visita — o trabalho de organizar a pesquisa desaparece ao sair. |

---

## 6. Defeitos do protótipo a corrigir ao construir (não são decisões, são bugs)

- "Voltar", "Finalizar tarefa" e "Excluir tarefa" navegam para `atividade.html` **sem** `?empresa=`/`?projeto=`/`?ideia=` — hoje isso faria `atividade.html` (já implementada) redirecionar para fora por falta de contexto (`ATV-ACESSO`).
- Descrição da tarefa mostrada aqui ("Pesquisar todos os meios de transporte...") não bate com a descrição real da mesma tarefa em `atividade.html` ("Verificar qual o melhor meio para transportar as encomendas") — sinal de que nunca vieram da mesma fonte.
- "Finalizar tarefa" grava `idea-finalizada`, um padrão já identificado e rejeitado (§3) — criaria idéia nova em vez de mover a existente.
- Conversa de exemplo fixa do assistente (mesmo texto de `IA-CONV-006`) ainda não removida aqui.
- "Solicitar ajuda do Designer" sem nenhum comportamento.
- "Ver empty state" é controle de pré-visualização de quem construiu a tela, não deveria chegar a produção.
- `<title>` da aba estava copiado de `matriz_csd.html` (já corrigido nesta renomeação).

---

## 7. Classificação (conforme `Skills/regra_de_negocio.skill`)

**Impacto desconhecido / módulo novo.** Não há regra existente sendo contradita pelo que a tela tenta fazer — as regras já escritas em outros módulos (`IDEIA-MOV-014/015/016`, `IDEIA-CRIA-003`, `ATV-TAR-EXCLUI`, `IA-CONV-001`, `IA-CONV-PAINEL`) são compatíveis, só ainda não foram ligadas aqui. Um trecho específico do protótipo (`idea-finalizada`, §3) **contradiz** `IDEIA-CRIA-003` e não deveria ser reaproveitado. O que falta não é resolver conflito — é decidir as perguntas da §5 para poder escrever as regras `BOARD-xxx` de verdade.

---

## 8. Próximo passo sugerido

Responder Q1–Q9 (ou marcar as que preferir decidir só na hora do planejamento) — em especial Q1/Q2, porque sem elas nem o nome definitivo da funcionalidade nem o caminho de navegação até a tela têm resposta. A partir das respostas, o passo seguinte é o planejamento formal (arquivos afetados, contrato de API, modelo de dados definitivo, critérios de aceite) e então a regra oficial `board-lista.md` (ou o nome que fizer sentido depois de Q1), como já aconteceu com `atividade.html` → `atividade-lista.md`.

---

## 9. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-29 | Documento criado. `pesquisa.html` renomeado para `board.html` (mesmo conteúdo — arquivo não tinha nenhuma referência funcional ao próprio nome, e nenhuma outra página linka para ele hoje, então o rename não quebrou nada). `<title>` da aba corrigido (estava copiado de `matriz_csd.html`). Levantamento completo do estado atual (§2), do padrão já rejeitado `idea-finalizada` (§3), do que já está decidido e não deveria ser reaberto (§4), e nove perguntas em aberto (§5, Q1–Q9) — nenhuma regra `BOARD-xxx` foi escrita ainda. |
