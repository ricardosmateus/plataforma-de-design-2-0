# Regras de Negócio — Edição de Empresa

> **Versão:** 1.0.0 · **Status:** Regras definidas; implementação em andamento
> **Módulo:** Empresas · **Página:** `empresas.html` (menu do card → Editar empresa)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`empresas-criacao.md`](empresas-criacao.md) — o modal que esta tela reaproveita, mesmos campos e mesma validação · [`empresas-exclusao.md`](empresas-exclusao.md) — de onde vem a régua de "só o proprietário" e o padrão de 404 antes de 403

---

## Identificação

| Campo | Valor |
|---|---|
| Nome | Editar empresa (modal, mesmo desenho de "Nova empresa") |
| Módulo | Empresas |
| Endpoint | `PUT /empresas/:id` |
| Entidades | `empresas` |
| Componentes | Menu do card (kebab) → "Editar empresa", modal "Nova empresa" reaproveitada com título trocado |

O menu de três pontos de cada card tem a opção **Editar empresa**, que abre o mesmo modal usado para criar — só que com nome, descrição e logotipo já preenchidos com o que está gravado, e o título trocado para "Editar empresa". Antes desta versão, o botão abria o modal vazio e o "Salvar" só fechava a modal com um aviso de sucesso falso — nada era lido nem gravado. Este documento cobre o que passa a acontecer de verdade.

---

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| EMP-EDIT-001 | Nome é obrigatório, até 120 caracteres — mesma regra de EMP-CRIA-001. | Decorre de EMP-CRIA-001 |
| EMP-EDIT-002 | Nome duplicado é bloqueado **por conta**, ignorando maiúscula/acento — mesma regra de EMP-CRIA-002. Como é a própria linha sendo atualizada, ela nunca colide consigo mesma: só barra se OUTRA empresa ativa da mesma conta já tiver esse nome. | Decorre de EMP-CRIA-002 |
| EMP-EDIT-003 | Descrição é opcional, até 600 caracteres — mesma regra de EMP-CRIA-003 (numeração da criação; aqui é sobre descrição, não logotipo). | Decorre de EMP-CRIA-003 |
| EMP-EDIT-004 | Logotipo tem três estados possíveis no envio: **substituir** (veio um arquivo novo, mesma validação de formato/tamanho da criação), **remover** (campo `remover_logotipo=true`, sem arquivo) ou **manter** (nem um nem outro — o que já estava gravado continua). | Decidido 03/09/2026 |
| EMP-EDIT-005 | Só quem tem papel **proprietário** naquela empresa pode editá-la. Membro ou designer de apoio vinculado não pode — mesma régua de EMP-EXCL-002. | Decidido 03/09/2026, por analogia a EMP-EXCL-002 |
| EMP-EDIT-006 | Pedir edição de empresa inexistente, já arquivada, ou onde a pessoa não tem vínculo ativo devolve **404** — mesmo padrão de EMP-EXCL-005, para não revelar a quem não tem acesso se a empresa existe. | Decorre de EMP-EXCL-005 |
| EMP-EDIT-007 | Vínculo existe, mas o papel não é proprietário: **403** com mensagem explicando o motivo. | Decorre de EMP-EXCL-002 |

**Por que a validação de nome/descrição é idêntica à criação.** Não haveria razão de produto para uma empresa aceitar na criação um nome que ela recusa na edição, ou vice-versa — a mesma entidade, os mesmos campos, a mesma régua.

**Por que só o proprietário edita (EMP-EDIT-005).** Nome, descrição e logotipo são a identidade da empresa para todo mundo que tem vínculo com ela — não uma preferência pessoal de quem está vendo a tela. Um designer de apoio contratado por um cliente não deveria conseguir renomear a empresa do cliente ou trocar o logotipo dela. É a mesma leitura de `empresa_membros.papel` que EMP-EXCL-002 já faz para excluir; aqui ela se estende a editar.

**Por que o logotipo precisa de um sinal explícito de remoção (EMP-EDIT-004).** Sem o campo `remover_logotipo`, o servidor não teria como distinguir "a pessoa não mexeu no logotipo" de "a pessoa quer tirar o logotipo que já existia" — os dois enviam a requisição sem nenhum arquivo. Um checkbox mudo faria uma dessas duas intenções virar a outra por acidente.

**Por que o arquivo antigo não é apagado do armazenamento ao substituir.** A criação (EMP-CRIA-004) já nomeia cada logotipo com um UUID novo — nunca reescreve um nome existente — então não há "versão anterior no mesmo lugar" para limpar. Editar segue a mesma escolha: o arquivo antigo fica órfão no S3/R2, e limpeza de arquivos órfãos é uma rotina separada (fora do escopo desta regra), não algo que o caminho de escrita precisa fazer de forma síncrona.

---

## 2. Contrato da API — `PUT /empresas/:id`

Autorizado em 03/09/2026.

**Requisição.** `multipart/form-data`, autenticada pelo cookie de acesso — mesmo formato de `POST /empresas`.

| Campo | Obrigatório | Regra |
|---|---|---|
| `nome` | Sim | EMP-EDIT-001, EMP-EDIT-002 |
| `descricao` | Não | até 600 caracteres |
| `logotipo` | Não | arquivo novo — substitui o atual (EMP-EDIT-004) |
| `remover_logotipo` | Não | `"true"` remove o logotipo atual sem substituir (EMP-EDIT-004); ignorado se `logotipo` também veio |

| Situação | Resposta |
|---|---|
| Editada | `200` com a empresa, no formato do `GET /empresas` |
| Nome vazio ou longo demais | `400`, `campo: "nome"` |
| Nome duplicado (outra empresa ativa da mesma conta) | `400`, `campo: "nome"`, mensagem "Você já tem uma empresa com esse nome." |
| Arquivo de tipo ou tamanho inválido | `400`, `campo: "logotipo"` |
| Anexou arquivo sem `S3_DRIVER` configurado | `400`, `campo: "logotipo"` |
| Sessão inválida | `401` |
| Conta suspensa | `403` com `suspensao` |
| Vínculo existe, mas não é proprietário | `403` |
| Não existe, já arquivada, ou sem vínculo | `404` |

**Ordem de validação:** vínculo e papel antes de ler o corpo da requisição — a mesma lógica de EMP-EXCL-005/002 aplicada aqui: quem não tem acesso não deveria nem fazer o servidor processar um upload de arquivo. Depois, nome antes do logotipo, mesmo motivo de EMP-CRIA-005 — um nome inválido não deve gastar uma chamada ao armazenamento.

---

## 3. Estados obrigatórios

| Estado | Situação | Observação |
|---|---|---|
| Sucesso | ✅ Card é atualizado na grade (nome, descrição, logotipo), toast confirma | Sem redesenhar a grade inteira — mesmo cuidado de `acrescentarEmpresa` em não perder menus abertos/foco de outros cards |
| Nome inválido ou duplicado | ✅ Campo marcado, toast explica | Mesmo padrão da criação |
| Logotipo recusado | ✅ Erro no upload, toast explica | Mesmo padrão da criação |
| Sem permissão (não é dono) | ✅ Toast explica o motivo | EMP-EDIT-005 |
| Não encontrada / sem vínculo | ✅ Toast genérico, sem revelar existência | EMP-EDIT-006 |
| Sessão expirada | ✅ Toast, sem redirecionar sozinho | Mesmo padrão da criação/exclusão |
| Conta suspensa | ✅ Toast com o motivo | — |
| Falha de rede | ✅ Toast de erro de conexão | `e.rede`, mesmo padrão das outras chamadas de `js/api.js` |

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| Y1 | Quem pode editar? | Só o papel proprietário — mesma régua de X2 (empresas-exclusao.md) | 03/09/2026 |
| Y2 | Como o cliente sinaliza "tirar o logotipo" sem enviar um novo? | Campo explícito `remover_logotipo=true` no multipart, em vez de inferir pela ausência de arquivo | 03/09/2026 |
| Y3 | O arquivo antigo é apagado do armazenamento ao trocar o logotipo? | Não — mesma escolha de não limpar da criação (nomes são UUID, nunca reescritos) | 03/09/2026 |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-09-03 | Documento criado. Regras EMP-EDIT-001 a 007, contrato de `PUT /empresas/:id` e decisões Y1-Y3 registradas junto da implementação — o botão "Editar empresa" já existia na interface (desenhado, sem função real por trás) antes deste documento. |
