# Regras de Negócio — Quadro de Idéias

> **Versão:** 1.0.1 · **Status:** Implementado · conferência parcial
> **Conferido em:** 13/09/2026, na conferência de `visao_do_projeto.html` contra o código: IDEIA-ISO, IDEIA-QUADRO e IDEIA-VAZIO conferidas; IDEIA-BUSCA ainda não
> **Módulo:** Idéias · **Página:** `visao_do_projeto.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`../projetos/projetos-listagem.md`](../projetos/projetos-listagem.md) — de onde vem o projeto que contém tudo aqui · [`ideias-movimentacao.md`](ideias-movimentacao.md) · [`ideias-criacao.md`](ideias-criacao.md) · [`ideias-exclusao.md`](ideias-exclusao.md)

---

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Quadro de idéias (de um projeto) |
| Módulo | Idéias |
| Rota | `/visao_do_projeto.html?empresa=:empresaId&projeto=:projetoId` |
| Arquivo de interface | `visao_do_projeto.html` |
| Entidades | `ideias`, `projetos`, `empresas`, `empresa_membros` |
| Componentes | Rail, cabeçalho, breadcrumb, barra de busca/ordenação, quadro de 3 colunas, card de idéia, estado vazio, modal de idéia, toast |
| Páginas relacionadas | `projetos.html` (origem — botão "Acessar" do card de projeto), `atividade.html` e `matriz_csd.html` (destino — botão "Acessar" do card de idéia) |

Hoje a página é um protótipo estático. O `<h1>` está fixo em "Nike / Startup" com o logotipo da Nike escrito no HTML, o breadcrumb é literal, a URL não carrega nenhum identificador, a lista (`IDEAS`) nasce vazia e só vive na memória do navegador, e a data exibida em todo card é a string `"10/02/2027"`. Este documento assume a reescrita necessária para a página parar de mentir sobre qual projeto está mostrando — o mesmo tratamento que `projetos.html` recebeu.

---

## 1. Regras

### 1.1 Isolamento — `IDEIA-ISO`

O módulo de Projetos estabeleceu que projeto pertence a empresa (PROJ-ISO). Idéias acrescentam **um elo** a essa corrente, e é justamente o elo a mais que cria o risco novo.

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-ISO-001 | **Toda idéia pertence a exatamente um projeto**, que por sua vez pertence a exatamente uma empresa. `projeto_id` é obrigatório e imutável — não existe idéia solta, nem idéia que muda de projeto. | Decorre de PROJ-ISO-001 |
| IDEIA-ISO-002 | A página só existe no contexto de um projeto: a URL carrega `?empresa=:empresaId&projeto=:projetoId`, e toda chamada informa os dois. | Decorre de PROJ-ISO-002 |
| IDEIA-ISO-003 | Antes de tocar em qualquer idéia, o servidor confirma **a corrente inteira**: (a) quem pede tem vínculo ativo com `:empresaId`; (b) o projeto `:projetoId` existe, não está arquivado e pertence a `:empresaId`; (c) a idéia, quando informada, pertence a `:projetoId`. Qualquer elo que falhe devolve **404**. | Decidido 24/08/2026 |
| IDEIA-ISO-004 | Os três elos são verificados **na mesma requisição**, sempre, inclusive em rotas que já recebem o id da idéia. Não existe rota de idéia que aceite só o id da idéia. | Decidido 24/08/2026 |
| IDEIA-ISO-005 | Projeto arquivado ou empresa arquivada tornam as idéias inacessíveis, mesmo para quem mantém vínculo ativo registrado. | Decorre de PROJ-ISO-005 |

**Por que 404 em todos os casos, e não 403.** Mesmo raciocínio já registrado em `empresas-exclusao.md` e reafirmado em PROJ-ISO-003: um 403 ("existe, mas não é seu") confirmaria que aquele id corresponde a algo real. Com 404 uniforme, quem tenta adivinhar ids alheios não aprende nada — nem sobre empresas, nem sobre projetos, nem sobre idéias.

**Por que IDEIA-ISO-004 merece regra própria.** Com dois níveis de aninhamento, aparece uma tentação nova que não existia em Projetos: buscar a idéia pelo id, olhar o `projeto_id` dela e parar por aí — afinal "o projeto confere". Só que isso valida o elo do meio sem nunca perguntar se **quem está pedindo** tem relação com a empresa dona daquele projeto. A corrente precisa ser percorrida inteira, do pedinte até a idéia, ou ela não prova nada.

**Consequência prática.** As rotas vivem em `/empresas/:empresaId/projetos/:projetoId/ideias...`, e a checagem da corrente é a primeira coisa que qualquer uma delas faz.

### 1.2 O que o quadro mostra — `IDEIA-QUADRO`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-QUADRO-001 | O quadro tem **três colunas fixas**: `ideias` ("Minhas idéias"), `andamento` ("Em andamento") e `finalizado` ("Finalizado"). O usuário não cria, renomeia nem remove colunas. | Interface existente |
| IDEIA-QUADRO-002 | Cada idéia aparece em exatamente uma coluna, determinada pelo seu campo `status`. | Decorre de 001 |
| IDEIA-QUADRO-003 | Toda pessoa com vínculo ativo na empresa vê todas as idéias do projeto — proprietário, membro e especialista. Quem pode **alterar** é mais restrito (ver `ideias-criacao.md` e `ideias-exclusao.md`). | Decisão I2 |
| IDEIA-QUADRO-004 | Idéia arquivada não aparece em coluna nenhuma e não conta para o contador da coluna nem para decidir se o quadro está vazio. | Decorre de EMP-LIST-011 |
| IDEIA-QUADRO-005 | O cabeçalho (`<h1>`) mostra `{nome da empresa} / {nome do tipo do projeto}` de verdade — hoje fixo em "Nike / Startup". O logotipo da Nike escrito no HTML sai. | Decidido 24/08/2026 — corrige o protótipo |
| IDEIA-QUADRO-006 | A data exibida no card é a data real de criação da idéia, não a string fixa `"10/02/2027"` do protótipo. | Decidido 24/08/2026 — corrige o protótipo |
| IDEIA-QUADRO-007 | Sem `?empresa=` ou sem `?projeto=` na URL, com id inválido, ou sem acesso a eles, a página redireciona para `projetos.html` (ou `empresas.html`, se nem a empresa resolver) em vez de mostrar tela quebrada. | Decorre de PROJ-LIST-006 |
| IDEIA-QUADRO-008 | Carregando, vazio e erro são três estados distintos. Uma falha de rede nunca vira "nenhuma idéia ainda". | Decorre de EMP-LIST-010 |

### 1.3 Busca e ordenação — `IDEIA-BUSCA`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-BUSCA-001 | A busca filtra por texto em título e descrição, e é aplicada **dentro de cada coluna** — o quadro nunca perde colunas por causa de um filtro. | Interface existente |
| IDEIA-BUSCA-002 | Coluna sem resultado **por causa da busca** mostra "Nenhuma idéia corresponde à busca."; coluna genuinamente sem idéias mostra "Nenhuma idéia por aqui ainda.". São mensagens diferentes porque são situações diferentes. | Interface existente |
| IDEIA-BUSCA-003 | A ordenação tem três modos: mais recente (padrão), maior relevância (importância decrescente) e por data (mais antiga primeiro). | Interface existente |
| IDEIA-BUSCA-004 | Criar ou editar uma idéia limpa a busca e devolve a ordenação ao padrão, para que a idéia recém-salva não nasça escondida por um filtro ativo. | Interface existente |
| IDEIA-BUSCA-005 | Busca e ordenação acontecem **no cliente**, sobre a lista já carregada. Não há paginação nesta versão. | Decisão I4 |

**Por que IDEIA-BUSCA-002 não é firula.** É a mesma honestidade de EMP-LIST-010 aplicada ao nível da coluna: "não achei nada com esse texto" e "aqui não tem nada" levam o usuário a ações opostas — limpar a busca, ou criar a primeira idéia. Uma mensagem só para os dois casos empurra metade dos usuários para o caminho errado.

### 1.4 Estado vazio — `IDEIA-VAZIO`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-VAZIO-001 | O estado vazio substitui o quadro inteiro quando o projeto não tem **nenhuma** idéia — não quando uma coluna está vazia. Coluna vazia tem o vazio próprio dela (IDEIA-BUSCA-002). | Interface existente |
| IDEIA-VAZIO-002 | O estado vazio traz o botão "Nova idéia" para quem pode criar. Quem só visualiza vê a ilustração e o texto, sem botão. | Decorre de IDEIA-CRIA-004 |
| IDEIA-VAZIO-003 | O botão "Gerar com ajuda da IA" **sai** do estado vazio nesta versão — a IA foi adiada (decisão I3). Ele volta junto com a funcionalidade de verdade. | Decisão I3 |

**Atenção de implementação — armadilha já vivida.** Em `projetos.html`, a linha que revelava o botão "Novo projeto" morava dentro da função que desenha a lista, e por isso só rodava quando já existia pelo menos um item. Resultado: o estado vazio aparecia sem botão nenhum, e não havia caminho para criar o primeiro projeto. A permissão precisa ser aplicada **nos dois caminhos** — lista e vazio. Ver `projetos-listagem.md`, mesma nota.

---

## 2. Contrato da API — `GET /empresas/:empresaId/projetos/:projetoId/ideias`

Requisição autenticada pelo cookie de acesso. Sem corpo.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ ideias: [...], papel }` | Desenha o quadro; lista vazia → estado vazio (IDEIA-VAZIO-001) |
| Sessão inválida | `401` | Renovação silenciosa via `/auth/sessao`; só então login |
| Conta suspensa | `403` com `suspensao` | Mostra a mensagem |
| Qualquer elo da corrente falha (IDEIA-ISO-003) | `404` | Redireciona para `projetos.html` |
| Falha de rede | — | Toast de erro de conexão |

Cada item traz `id`, `titulo`, `descricao`, `importancia`, `status`, `criado_em` e `atualizado_em`. O `papel` de quem pediu vem **uma vez, na raiz da resposta** — não repetido em cada idéia, já que é o mesmo para todas.

---

## 3. Modelo de dados

```
ideias
  id            uuid (pk)
  projeto_id    uuid (not null, fk → projetos.id, cascade)
  titulo        varchar(60)  (not null)
  descricao     varchar(280) (not null)
  importancia   smallint (not null, default 0, check 0..5)
  status        enum StatusIdeia (not null, default 'ideias')
  criado_por    uuid (not null, fk → users.id)
  arquivado_em  timestamp (null)
  criado_em     timestamp (not null, default now())
  atualizado_em timestamp (not null)

  índice (projeto_id, arquivado_em)   -- toda listagem filtra por isso
```

```
enum StatusIdeia = 'ideias' | 'andamento' | 'finalizado'
```

Os limites de 60 e 280 vêm do `maxlength` que o protótipo já usa nos campos — ver `ideias-criacao.md` §1. `importancia` aceita 0 porque as estrelas começam apagadas e o protótipo não as torna obrigatórias; 0 significa "sem prioridade definida".

`status` é enum e não texto livre pelo mesmo motivo que `TipoProjeto` é: as três colunas são fixas (IDEIA-QUADRO-001), então o banco deve recusar um quarto valor em vez de aceitá-lo silenciosamente e quebrar a tela.

`onDelete: Cascade` em `projeto_id` existe como rede de segurança do banco. Na prática nada é apagado de verdade — arquivar é o caminho normal (E1).

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| I1 | As colunas são fixas ou o usuário cria as dele? | Fixas — três, definidas pelo produto. Quadro configurável é outro produto, e não é o que a tela desenha. | 24/08/2026 |
| I2 | Quem enxerga as idéias de um projeto? | Todo mundo com vínculo ativo na empresa, sem granularidade por projeto — mesma régua de PROJ-LIST. | 24/08/2026 |
| I3 | "Gerar com ajuda da IA" e o assistente lateral entram no lançamento? | **Não.** Ambos ficam para um bloco próprio, depois do quadro funcionando de verdade. Mesma estratégia do catálogo de tipos de projeto (P7): lançar estreito e crescer. | 24/08/2026 |
| I4 | Busca/ordenação no cliente ou no servidor? | No cliente. Um projeto tem dezenas de idéias, não milhares; paginar agora seria complexidade sem problema correspondente. Revisitar se surgir volume. | 24/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| IA (gerar idéias + assistente) | **Adiada por decisão I3.** Quando entrar, exige decidir: custo por token, consumo de créditos da conta, e que contexto do projeto a IA recebe. |
| Card ilustrado (`illustration`) | O protótipo tem uma variante de card cujo corpo é uma imagem, usada pela "Matriz CSD", e que navega para `matriz_csd.html`. Não está no modelo de dados acima porque pertence ao módulo de atividades, ainda não especificado. |
| Destino do botão "Acessar" | Hoje leva a `atividade.html` ou `matriz_csd.html`, ambas fora deste módulo. O contrato dessa navegação entra junto do módulo de atividades. |
| Volume e paginação | Ver decisão I4 — revisitar se um projeto real passar de algumas centenas de idéias. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.1 | 2026-09-13 | Sem mudança de regra. Cabeçalho corrigido: dizia "implementação não iniciada" com o quadro no ar desde então. Conferidas IDEIA-ISO-002/003/004, IDEIA-QUADRO-005/007/008 e IDEIA-VAZIO-002/003 — todas cumpridas. IDEIA-BUSCA fica para uma próxima conferência. |
| 1.0.0 | 2026-08-24 | Documento criado. Regras de isolamento (IDEIA-ISO), quadro (IDEIA-QUADRO), busca (IDEIA-BUSCA) e estado vazio (IDEIA-VAZIO) definidas, junto das decisões I1 a I4. |
