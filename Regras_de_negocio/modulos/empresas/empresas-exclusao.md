# Regras de Negócio — Exclusão de Empresa

> **Versão:** 1.0.0 · **Status:** Regras definidas; implementação em andamento
> **Módulo:** Empresas · **Página:** `empresas.html` (menu do card → Excluir)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`empresas-listagem.md`](empresas-listagem.md) — de onde vem a decisão E1, reaproveitada aqui · [`empresas-criacao.md`](empresas-criacao.md) — o modal que cria o que esta tela apaga

---

## Identificação

| Campo | Valor |
|---|---|
| Nome | Excluir empresa (modal de confirmação) |
| Módulo | Empresas |
| Endpoint | `DELETE /empresas/:id` |
| Entidades | `empresas`, `empresa_membros` |
| Componentes | Menu do card (kebab), Modal "Excluir empresa" |

O menu de três pontos de cada card tem a opção **Excluir**, que abre um modal de confirmação já desenhado e aprovado. Este documento cobre o que acontece quando a pessoa confirma.

---

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| EMP-EXCL-001 | Excluir **arquiva** a empresa (`arquivado_em = now()`), não apaga a linha do banco. Mesmo mecanismo da decisão **E1** (`empresas-listagem.md` EMP-LIST-011). | Decidido 22/08/2026 com o Ricardo |
| EMP-EXCL-002 | Só quem tem papel **proprietário** naquela empresa pode excluí-la. Membro ou designer de apoio vinculado não pode. | Decidido 22/08/2026 com o Ricardo |
| EMP-EXCL-003 | Empresa arquivada some da listagem de todo mundo que tinha vínculo com ela (efeito já implementado por EMP-LIST-011 — nenhuma mudança na consulta do `GET /empresas` foi necessária). | Decorre de EMP-LIST-011 |
| EMP-EXCL-004 | O nome da empresa excluída fica livre para reuso na mesma conta (já implementado por EMP-CRIA-002 — nenhuma mudança foi necessária). | Decorre de EMP-CRIA-002 |
| EMP-EXCL-005 | Pedir exclusão de empresa inexistente, já arquivada, ou onde a pessoa não tem vínculo ativo devolve **404** — a mesma resposta nos três casos, para não revelar a quem não tem acesso se a empresa existe. | Decidido 22/08/2026 |

**Por que arquivar, e não `DELETE` de verdade.** O texto do modal aprovado diz "esta ação não pode ser desfeita" — o que descreve a experiência da pessoa (o card some, sem opção de desfazer na interface), não precisa descrever o que acontece no banco. Arquivar já é o mecanismo que este projeto usa para "isso acabou" (E1): reaproveitá-lo evita dois caminhos fazendo a mesma coisa de formas diferentes, e mantém a porta aberta para o dia em que a empresa tiver projetos e outros dados vinculados — apagar de verdade nesse momento exigiria decidir o que fazer com eles, decisão que não precisa ser tomada agora.

**Por que só o proprietário.** Um designer de apoio contratado por uma empresa não deveria conseguir apagar a empresa do cliente. É a mesma lógica de papéis que já existe em `empresa_membros.papel` — esta é a primeira regra que efetivamente lê esse campo para decidir permissão, não só para exibir.

**Por que 404 e não 403 para quem não tem vínculo nenhum.** Devolver 403 ("proibido") para uma pessoa sem vínculo revelaria que o `id` corresponde a uma empresa real. 404 é a mesma resposta de "não existe" — quem não tem vínculo não aprende nada sobre o que existe no banco. Só quem **tem** vínculo mas não é proprietário recebe 403, porque nesse caso a existência já era conhecida por essa pessoa (ela vê o card na própria listagem).

---

## 2. Contrato da API — `DELETE /empresas/:id`

Autorizado em 22/08/2026.

**Requisição.** `DELETE /empresas/:id`, autenticada pelo cookie de acesso. Sem corpo.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Excluída | `200` com `{ ok: true }` | Remove o card da grade; se era o último, volta ao estado vazio |
| Sessão inválida | `401` | Mostra a mensagem no toast — mesmo padrão do `POST /empresas`, sem tentar renovar sozinho (`empresas-listagem.md` §2) |
| Conta suspensa | `403` com `suspensao` | Mostra a mensagem no toast |
| Vínculo existe, mas não é proprietário | `403` | Mostra "Só o proprietário pode excluir a empresa." no toast |
| Não existe, já arquivada, ou sem vínculo | `404` | Mostra "Empresa não encontrada." no toast |

O botão de confirmação trava enquanto a API responde, mesmo padrão do botão "Salvar" do modal de criação.

---

## 3. Estados obrigatórios

| Estado | Situação | Observação |
|---|---|---|
| Sucesso | ✅ Card sai da grade, toast confirma | Se era o último card, a tela volta ao estado vazio (EMP-LIST-003) |
| Sem permissão (não é dono) | ✅ Toast explica o motivo | EMP-EXCL-002 |
| Não encontrada / sem vínculo | ✅ Toast genérico, sem revelar existência | EMP-EXCL-005 |
| Sessão expirada | ✅ Toast, sem redirecionar sozinho | Mesmo padrão da criação |
| Conta suspensa | ✅ Toast com o motivo | — |
| Falha de rede | ✅ Toast de erro de conexão | `e.rede`, mesmo padrão das outras chamadas de `js/api.js` |

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| X1 | Excluir apaga a linha ou arquiva? | Arquiva — reaproveita E1 | 22/08/2026 |
| X2 | Quem pode excluir? | Só o papel proprietário | 22/08/2026 |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-22 | Documento criado. Regras EMP-EXCL-001 a 005, contrato de `DELETE /empresas/:id` e decisões X1/X2 registradas antes da implementação. |
