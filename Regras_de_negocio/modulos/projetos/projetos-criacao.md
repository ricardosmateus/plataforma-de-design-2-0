# Regras de Negócio — Criação de Projeto

> **Versão:** 1.2.0 · **Status:** Implementado · "Editar" fora da interface no lançamento (PROJ-CRIA-009)
> **Conferido em:** 13/09/2026, contra `api/src/rotas/projetos.ts`, `api/src/projetos/catalogo.ts` e `projetos.html`
> **Módulo:** Projetos · **Página:** `projetos.html` (modal "Novo projeto")
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`projetos-listagem.md`](projetos-listagem.md) — a listagem que este modal alimenta, e de onde vem PROJ-ISO

---

## Identificação

| Campo | Valor |
|---|---|
| Nome | Novo projeto (modal) |
| Módulo | Projetos |
| Endpoint | `POST /empresas/:empresaId/projetos` |
| Entidades | `projetos` |
| Componentes | Modal "Novo projeto" (seletor de tipo), mesma modal reaproveitada para "Editar projeto" |

O protótipo já tem a modal desenhada: uma lista de tipos de projeto (rádio), sem campo de nome ou descrição. A decisão **P1** (`projetos-listagem.md` §4) confirma que é assim mesmo — criar um projeto é escolher um tipo, não preencher um formulário.

---

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| PROJ-CRIA-001 | Criar projeto exige escolher um `tipo` da lista fechada — não é texto livre. | Decorre de P1 |
| PROJ-CRIA-002 | `nome` e `descricao` exibidos no card não são digitados: vêm de um catálogo fixo `tipo → {nome, descricao}` mantido no servidor. O cliente nunca envia nem `nome` nem `descricao`. | Decorre de P1 |
| PROJ-CRIA-003 | Não há checagem de duplicidade: a mesma empresa pode ter mais de um projeto do mesmo `tipo`. | Consequência aceita de P1 |
| PROJ-CRIA-004 | Só proprietário e membro da empresa podem criar projeto. Especialista vinculado pode ver, mas o botão "Novo projeto" e a opção "Editar" não aparecem para ele. | Decidido 24/08/2026 (decisão P2 de `projetos-listagem.md`) |
| PROJ-CRIA-005 | "Editar projeto" reaproveita a mesma modal, para trocar o `tipo` de um projeto existente. Não existe edição parcial (só nome, por exemplo) porque não há nome próprio a editar. | Decorre de PROJ-CRIA-002 |

**Por que PROJ-CRIA-003 é uma regra, e não uma omissão.** Em `empresas-criacao.md`, nome duplicado é bloqueado (EMP-CRIA-002) porque o nome ali identifica a empresa para quem lista. Aqui o "nome" do projeto é só o rótulo do tipo escolhido — bloquear duplicidade impediria uma empresa de ter duas "Startup" ao mesmo tempo, o que é uma limitação de produto real (fica registrada em `projetos-listagem.md` §5), mas não um problema de integridade de dado. Por isso não é bloqueado no servidor.

**Por que PROJ-CRIA-004 corta especialista.** Mesma lógica de papéis já usada em `empresas-exclusao.md` EMP-EXCL-002: um especialista contratado atua *dentro* dos projetos que lhe são atribuídos, não decide quais projetos a empresa tem. Diferente de empresa (onde só o proprietário exclui), aqui membro também cria/edita — times costumam ter mais de uma pessoa organizando os próprios projetos internos.

---

## 2. Contrato da API — `POST /empresas/:empresaId/projetos`

Requisição autenticada pelo cookie de acesso. Corpo `application/json`.

| Campo | Obrigatório | Regra |
|---|---|---|
| `tipo` | Sim | Um dos valores do catálogo (§3). Qualquer outro valor é `400`. |

| Situação | Resposta |
|---|---|
| Criado | `201` com o projeto, no formato do `GET /empresas/:empresaId/projetos` |
| `tipo` ausente ou fora do catálogo | `400`, `campo: "tipo"` |
| Sessão inválida | `401` |
| Conta suspensa | `403` |
| Vínculo existe, mas é especialista (PROJ-CRIA-004) | `403`, mensagem "Só proprietário ou membro podem criar projetos." |
| `:empresaId` inexistente, arquivada, ou sem vínculo ativo | `404` — mesma resposta de `empresas-exclusao.md` EMP-EXCL-005, por PROJ-ISO-003 |

`PUT /empresas/:empresaId/projetos/:id` segue o mesmo contrato, trocando `201` por `200` — usado pela mesma modal em modo "Editar" (PROJ-CRIA-005). As mesmas checagens de papel e de vínculo se aplicam.

> **Nota de 13/09/2026.** O `PUT` está implementado e no ar, mas nenhuma tela o chama: a opção "Editar" não existe na interface do lançamento (PROJ-CRIA-009). Isso torna a menção a "Editar" em PROJ-CRIA-004 uma regra sobre o que *voltará* a aparecer, não sobre o que aparece hoje — hoje o menu do card tem só "Excluir", para todos os papéis que operam.

---

## 3. Catálogo de tipos — lançamento só com Startup

| ID | Regra | Fonte |
|---|---|---|
| PROJ-CRIA-006 | No lançamento, o único `tipo` habilitado é `startup`. Os demais (Franquia, Plano de Negócios, e o resto do protótipo) ficam **fora do catálogo** — não é possível criar projeto com eles ainda, mesmo que a modal um dia volte a listá-los visualmente. | Decidido 24/08/2026 com o Ricardo |
| PROJ-CRIA-007 | Novos tipos entram um de cada vez, conforme forem sendo construídos — cada um é um novo valor no enum mais a tela/fluxo que aquele tipo de projeto abre ao ser acessado. Não é uma tarefa de copy isolada: "adicionar o tipo Franquia" só fecha quando o que existe *dentro* de um projeto Franquia também existir. | Decidido 24/08/2026 |
| PROJ-CRIA-008 | Cada `tipo` tem uma **miniatura** própria no card. Ela faz parte do que um tipo novo precisa trazer (junto do valor de enum e da tela interna, PROJ-CRIA-007): sem ela o card cai num recurso genérico e o tipo entra na listagem parecendo defeito. | Registrado 13/09/2026, a partir do código |
| PROJ-CRIA-009 | No lançamento **não existe "Editar projeto" na interface**. Com um único tipo no catálogo (PROJ-CRIA-006), reabrir a modal para escolher Startup de novo não muda nada. O `PUT` continua no ar e com o contrato da §2 — a regra retira a opção da tela, não o endpoint. Quando o segundo tipo entrar, a opção volta sob PROJ-CRIA-005, sem contrato novo. | Decidido durante a implementação; registrado 13/09/2026 |

| `tipo` | Rótulo | Descrição | Status |
|---|---|---|---|
| `startup` | Startup | São empresas jovens e inovadoras que buscam resolver desafios específicos por meio de modelos de negócios que podem crescer rapidamente e se adaptar facilmente... | **Habilitado** |
| `franquia` | Franquia | *(placeholder no protótipo — "Lorem ipsum dollor")* | Fora do catálogo — entra depois |
| `plano_negocios` | Plano de Negócios | *(placeholder no protótipo — "Lorem ipsum dollor")* | Fora do catálogo — entra depois |
| *(5 slots restantes da modal)* | Sem título definido | *(placeholder no protótipo — "Lorem ipsum dollor")* | Fora do catálogo — nem reservados ainda |

Consequência direta para a implementação: o enum `TipoProjeto` nasce com um único valor (`startup`); o `POST`/`PUT` rejeita (`400`) qualquer outro; e a modal "Novo projeto" mostra só a opção Startup, sem a lista de categorias placeholder do protótipo — mostrar opções que não podem ser escolhidas seria confuso, não "preparado para o futuro". Adicionar um `tipo` novo depois é sempre uma migração aditiva (novo valor de enum), nunca uma mudança de contrato.

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| P3 | Quem pode criar/editar projeto? | Proprietário e membro. Especialista só visualiza. | 24/08/2026 |
| P4 | Nome duplicado bloqueia? | Não — não existe nome próprio, só `tipo`, e repetir tipo é permitido (PROJ-CRIA-003). | 24/08/2026 |
| P7 | Lançar com o catálogo completo ou só parte dele? | Só `startup`. Os demais tipos entram depois, um a um, junto com o que cada um abre por dentro. | 24/08/2026 |
| P8 | A miniatura do card vem do catálogo do servidor, como nome e descrição? | **Em aberto.** Hoje não: o mapa `THUMBS` vive no `<script>` de `projetos.html`, e um tipo ausente dele cai em `img/projetos-vazio.svg` — a arte de "nenhum projeto". Nome e descrição vêm do servidor por PROJ-CRIA-002, justamente para o cliente não decidir isso; a imagem escapou dessa regra. Recomendação: mover o nome do arquivo para `CATALOGO_TIPOS`, ao lado de `nome` e `descricao`, e trocar o fallback por um recurso neutro que não se confunda com estado vazio. | Levantado 13/09/2026 |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-24 | Documento criado. Regras de criação por tipo fechado (PROJ-CRIA-001 a 005), contrato de `POST`/`PUT` e catálogo parcial de tipos registrados antes da implementação. |
| 1.1.0 | 2026-08-24 | PROJ-CRIA-006 e 007: lançamento restrito ao tipo `startup`; demais tipos ficam fora do catálogo até serem construídos, um de cada vez. Decisão P7. |
| 1.2.0 | 2026-09-13 | Conferência contra o código implementado. PROJ-CRIA-008 (miniatura por tipo) e PROJ-CRIA-009 ("Editar" fora da interface no lançamento) registradas — a segunda existia só como comentário de código. Decisão P8 aberta sobre a miniatura vir ou não do catálogo do servidor. Nota na §2 esclarecendo que o `PUT` está no ar sem tela que o chame. Cabeçalho atualizado de "implementação não iniciada" para o estado real. |
