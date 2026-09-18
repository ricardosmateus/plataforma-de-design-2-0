# Regras de Negócio — Exclusão de Projeto

> **Versão:** 1.0.1 · **Status:** Implementado · sem divergências
> **Conferido em:** 13/09/2026, contra `api/src/rotas/projetos.ts` e `projetos.html`
> **Módulo:** Projetos · **Página:** `projetos.html` (menu do card → Excluir)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`projetos-listagem.md`](projetos-listagem.md) · [`projetos-criacao.md`](projetos-criacao.md) · [`../empresas/empresas-exclusao.md`](../empresas/empresas-exclusao.md) — mesmo mecanismo de arquivamento, reaproveitado aqui

---

## Identificação

| Campo | Valor |
|---|---|
| Nome | Excluir projeto (modal de confirmação) |
| Módulo | Projetos |
| Endpoint | `DELETE /empresas/:empresaId/projetos/:id` |
| Entidades | `projetos` |
| Componentes | Menu do card (kebab), modal "Excluir projeto" (já desenhada no protótipo) |

---

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| PROJ-EXCL-001 | Excluir **arquiva** o projeto (`arquivado_em = now()`), não apaga a linha — mesmo mecanismo de `empresas-exclusao.md` EMP-EXCL-001. | Decidido 24/08/2026 |
| PROJ-EXCL-002 | Proprietário e membro podem excluir. Especialista não. Mesma régua de quem pode criar (`projetos-criacao.md` PROJ-CRIA-004) — quem organiza os projetos da empresa é quem decide encerrar um. | Decidido 24/08/2026 |
| PROJ-EXCL-003 | Projeto arquivado some da listagem de todo mundo com vínculo na empresa (efeito de PROJ-LIST-004 — nenhuma mudança na consulta é necessária além do que já está em `projetos-listagem.md`). | Decorre de PROJ-LIST-004 |
| PROJ-EXCL-004 | Pedir exclusão de projeto inexistente, já arquivado, ou que pertence a outra empresa devolve **404** — mesma resposta nos três casos. | Decorre de PROJ-ISO-004 |
| PROJ-EXCL-005 | A opção **"Duplicar projeto"**, presente no protótipo, é removida. Mesma decisão já tomada para empresas (`retirar o botão duplicar empresa`, 22/08/2026). | Decidido 24/08/2026 com o Ricardo |

**Por que proprietário e membro, e não só proprietário (diferente de empresa).** Excluir *empresa* é uma decisão que afeta o negócio inteiro — só o dono deveria poder. Excluir *projeto* é operação do dia a dia de quem organiza o trabalho ali dentro; travar em "só proprietário" obrigaria o dono a ser chamado toda vez que um projeto interno for encerrado. A régua de PROJ-CRIA-004 (quem cria, edita) se estende para quem exclui, por consistência.

**Por que remover Duplicar.** Mesmo raciocínio já registrado para empresas: sem um `nome` próprio por projeto (decisão P1), "duplicar" duplicaria só o `tipo` — criaria um segundo projeto idêntico e indistinguível do original, sem nenhum ganho sobre simplesmente clicar em "Novo projeto" de novo. A opção fica sem função clara até o dia em que projetos tiverem conteúdo interno que valha a pena copiar.

---

## 2. Contrato da API — `DELETE /empresas/:empresaId/projetos/:id`

**Requisição.** `DELETE /empresas/:empresaId/projetos/:id`, autenticada pelo cookie de acesso. Sem corpo.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Excluído | `200` com `{ ok: true }` | Remove o card da grade; se era o último, volta ao estado vazio |
| Sessão inválida | `401` | Toast, sem tentar renovar sozinho — diferente da listagem, que renova (`projetos-listagem.md` PROJ-LIST-008) |
| Conta suspensa | `403` com `suspensao` | Toast |
| Vínculo existe, mas é especialista | `403` | "Só proprietário ou membro podem excluir projetos." |
| `:empresaId` sem vínculo ativo, arquivada, ou inexistente | `404` | "Empresa não encontrada." |
| `:id` do projeto inexistente, já arquivado, ou de outra empresa | `404` | "Projeto não encontrado." |

O botão de confirmação trava enquanto a API responde — mesmo padrão do "Salvar" e do "Excluir" de empresa.

---

## 3. Estados obrigatórios

| Estado | Situação | Observação |
|---|---|---|
| Sucesso | ✅ Card sai da grade, toast confirma | Se era o último, volta ao estado vazio |
| Sem permissão (especialista) | ✅ Toast explica o motivo | PROJ-EXCL-002 |
| Não encontrado (projeto ou empresa) | ✅ Toast genérico, sem revelar existência | PROJ-EXCL-004 |
| Sessão expirada | ✅ Toast, sem redirecionar sozinho | — |
| Conta suspensa | ✅ Toast com o motivo | — |
| Falha de rede | ✅ Toast de erro de conexão | — |

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| P5 | Excluir apaga a linha ou arquiva? | Arquiva — reaproveita o mecanismo de E1/EMP-EXCL-001 | 24/08/2026 |
| P6 | Mantém "Duplicar projeto"? | Removido — mesma decisão de empresas, sem função clara sem nome próprio | 24/08/2026 |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-24 | Documento criado. Regras PROJ-EXCL-001 a 005, contrato de `DELETE` e decisões P5/P6 registradas antes da implementação. |
| 1.0.1 | 2026-09-13 | Conferência contra o código: as cinco regras e o contrato do `DELETE` conferem, nenhuma mudança de regra. Linha do `401` na §2 ganhou a referência cruzada para PROJ-LIST-008, que registra a assimetria deliberada com a listagem. Cabeçalho atualizado de "implementação não iniciada" para o estado real. |
