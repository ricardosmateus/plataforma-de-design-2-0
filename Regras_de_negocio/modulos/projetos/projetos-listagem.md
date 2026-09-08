# Regras de Negócio — Listagem de Projetos

> **Versão:** 1.0.0 · **Status:** Regras definidas; implementação não iniciada
> **Módulo:** Projetos · **Página:** `projetos.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`../empresas/empresas-listagem.md`](../empresas/empresas-listagem.md) — de onde vem o vínculo que autoriza tudo aqui · [`projetos-criacao.md`](projetos-criacao.md) · [`projetos-exclusao.md`](projetos-exclusao.md)

---

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Projetos (de uma empresa) |
| Módulo | Projetos |
| Rota | `/projetos.html?empresa=:id` |
| Arquivo de interface | `projetos.html` |
| Entidades | `projetos`, `empresas`, `empresa_membros` |
| Componentes | Rail, cabeçalho com nome/logo da empresa, breadcrumb, card de projeto, estado vazio, modal "Novo projeto", toast |
| Páginas relacionadas | `empresas.html` (origem — botão "Acessar" do card), `visao_do_projeto.html` (destino — botão "Acessar" do card de projeto) |

Hoje `projetos.html` é um protótipo estático: dado de exemplo fixo no JS (`EMPRESAS`, com um único projeto "Nome do projeto"), cabeçalho com o nome "Nike" fixo no HTML, e o link "Acessar" de cada card da empresa em `empresas.html` aponta para `projetos.html` **sem nenhum identificador da empresa**. Este documento assume a reescrita necessária para a página parar de mentir sobre qual empresa está mostrando.

---

## 1. Regras

### 1.1 Isolamento entre empresas — `PROJ-ISO`

Esta é a regra que motivou o documento.

| ID | Regra | Fonte |
|---|---|---|
| PROJ-ISO-001 | **Todo projeto pertence a exatamente uma empresa.** `empresa_id` é obrigatório e imutável — não existe projeto "solto", nem projeto que muda de empresa. | Pedido do Ricardo, 24/08/2026 |
| PROJ-ISO-002 | A página `projetos.html` só existe no contexto de uma empresa: a URL carrega `?empresa=:id`, e toda chamada à API para listar, criar, editar ou excluir projeto informa esse `:id`. | Decorre de PROJ-ISO-001 |
| PROJ-ISO-003 | Antes de tocar em qualquer projeto, o servidor confirma que quem fez a chamada tem **vínculo ativo** com a empresa do `:id` — o mesmo vínculo que já autoriza ver a empresa em `GET /empresas` (`empresas-listagem.md` EMP-LIST-009). Sem vínculo ativo, a resposta é **404**, nunca a lista de projetos de outra empresa. | Decidido 24/08/2026, mesmo padrão de `empresas-exclusao.md` EMP-EXCL-005 |
| PROJ-ISO-004 | Um projeto só é retornado se o seu `empresa_id` bater com o `:id` da URL. Pedir um projeto pelo id direto (edição, exclusão) e ele pertencer a outra empresa devolve **404 "Projeto não encontrado"** — a mesma resposta de "esse id não existe". | Decidido 24/08/2026 |
| PROJ-ISO-005 | Empresa arquivada (`arquivado_em` preenchido) não tem seus projetos acessíveis por ninguém, mesmo por quem ainda tem vínculo ativo registrado. | Decorre de EMP-LIST-011 |

**Por que 404 e não 403 em PROJ-ISO-003.** Mesmo raciocínio já registrado em `empresas-exclusao.md`: devolver 403 ("existe, mas você não pode") para uma empresa que a pessoa não tem vínculo nenhum revelaria que aquele `id` corresponde a uma empresa real. 404 não distingue "não existe" de "existe, mas não é seu" — quem tenta adivinhar ids de empresas alheias não aprende nada.

**Por que PROJ-ISO-004 é uma regra própria, e não só "faz join e pronto".** É o erro mais fácil de cometer numa API aninhada: implementar `GET /projetos/:id` sem checar `empresa_id`, confiando que o `:empresa` da URL "já garante" o filtro. Ele só garante se o código explicitamente comparar os dois — a regra existe para que essa comparação nunca seja opcional ou esquecida numa rota nova (edição, por exemplo).

**Consequência prática para a implementação.** As rotas de projeto vivem aninhadas em `/empresas/:empresaId/projetos...`, e **toda** rota — sem exceção, inclusive as que recebem `:id` do projeto — repete a checagem de vínculo do `:empresaId` antes de tocar no banco. Não existe rota de projeto que aceite só o id do projeto sem também confirmar a empresa.

### 1.2 O que a listagem mostra — `PROJ-LIST`

| ID | Regra | Fonte |
|---|---|---|
| PROJ-LIST-001 | A listagem mostra os projetos ativos (não arquivados) da empresa do `:empresa` da URL, para quem tem vínculo ativo com ela. | Decorre de PROJ-ISO |
| PROJ-LIST-002 | Sem nenhum projeto, a tela mostra o estado vazio já desenhado, com o convite para criar o primeiro. | Interface existente |
| PROJ-LIST-003 | Vazio, carregando e erro são três coisas diferentes — mesma regra de `empresas-listagem.md` EMP-LIST-010. Uma falha de rede ou um erro do servidor nunca vira "nenhum projeto ainda". | Decorre de EMP-LIST-010 |
| PROJ-LIST-004 | Projeto arquivado não aparece na listagem e não conta para decidir se ela está vazia — mesmo mecanismo de EMP-LIST-011. | Decorre de EMP-LIST-011 |
| PROJ-LIST-005 | O cabeçalho da página mostra o nome de verdade da empresa (hoje fixo em "Nike" no HTML) e o breadcrumb mostra `Empresas > {nome da empresa} > Projetos`. | Decidido 24/08/2026 — corrige o protótipo |
| PROJ-LIST-006 | Se `?empresa=` estiver ausente, for um id inválido, ou a pessoa não tiver vínculo ativo com ele, a página redireciona para `empresas.html` em vez de mostrar uma tela quebrada ou vazia. | Decidido 24/08/2026 |

**Por que PROJ-LIST-006 existe.** Hoje não existe verificação nenhuma: a página abre do mesmo jeito sem `?empresa=` na URL, porque nada nela depende disso ainda. No momento em que passar a depender, uma URL adulterada ou um link antigo sem o parâmetro não pode virar tela em branco silenciosa — o mesmo princípio de honestidade de EMP-LIST-010 aplicado à navegação, não só aos dados.

---

## 2. Contrato da API — `GET /empresas/:empresaId/projetos`

Requisição autenticada pelo cookie de acesso. Sem corpo.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ projetos: [...] }` | Desenha os cards; lista vazia → estado vazio (PROJ-LIST-002) |
| Sessão inválida | `401` | Mesmo padrão de `empresas-listagem.md` §2 — não redireciona sozinho |
| Conta suspensa | `403` com `suspensao` | Mostra a mensagem |
| Sem vínculo ativo com `:empresaId`, empresa arquivada, ou `:empresaId` não existe | `404` | Redireciona para `empresas.html` (PROJ-LIST-006) |
| Falha de rede | — | Toast de erro de conexão, mesmo padrão das outras chamadas |

Cada item de `projetos` traz `id`, `tipo`, `nome` e `descricao` já resolvidos a partir do catálogo de tipos (ver `projetos-criacao.md` §3), `papel` (o papel de quem pediu, para a tela decidir se mostra "Editar"/"Excluir" no menu — `PROJ-CRIA-004`), e `criado_em`.

---

## 3. Modelo de dados

Nova tabela, complementando `empresas` e `empresa_membros` (já existentes):

```
projetos
  id            uuid (pk)
  empresa_id    uuid (not null, fk → empresas.id, cascade)
  tipo          enum TipoProjeto (not null)
  criado_por    uuid (not null, fk → users.id)
  arquivado_em  timestamp (null)
  criado_em     timestamp (not null, default now())
  atualizado_em timestamp (not null)

  índice (empresa_id, arquivado_em)  -- toda listagem filtra por isso
```

Sem `nome` nem `descricao` próprios — decorre da decisão P1 (§4): o rótulo e a descrição exibidos vêm do catálogo de `tipo`, não de texto digitado por quem cria. Ver a consequência disso em `projetos-criacao.md` §1.

`onDelete: Cascade` em `empresa_id`: existe só como rede de segurança do banco. Na prática nenhuma linha de `empresas` é apagada de verdade (E1) — arquivar é o caminho normal —, então essa cascata nunca deveria disparar em uso normal.

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| P1 | Projeto tem nome livre digitado, ou só o tipo escolhido? | Só o tipo — nome/descrição exibidos vêm do catálogo do tipo, não são campos próprios do projeto. Consequência aceita: dois projetos do mesmo tipo na mesma empresa ficam com o mesmo rótulo na tela. | 24/08/2026 |
| P2 | Quem pode ver os projetos de uma empresa? | Todo mundo com vínculo ativo na empresa (proprietário, membro, especialista) — mesma régua de visibilidade de `empresas-listagem.md`. Quem pode **criar/editar/excluir** é mais restrito — ver `projetos-criacao.md` e `projetos-exclusao.md`. | 24/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| Catálogo de tipos de projeto | **Resolvido para o lançamento** (decisão P7, `projetos-criacao.md` §3): só `startup` fica habilitado. Franquia, Plano de Negócios e o restante do protótipo entram depois, um tipo de cada vez, junto com a tela que cada um abre por dentro. |
| Especialista e projetos específicos | Hoje o vínculo com uma empresa é único por conta (`empresa_membros`, sem granularidade por projeto). Se no futuro um especialista precisar ver só **alguns** projetos de uma empresa (não todos), isso exige uma tabela nova de atribuição — fora do escopo deste documento. Por ora, especialista vê todos os projetos da empresa em que tem vínculo, como qualquer outro papel. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-24 | Documento criado. Regras de isolamento entre empresas (PROJ-ISO) e de listagem (PROJ-LIST) definidas e autorizadas, junto das decisões P1 e P2. |
