# Regras de Negócio — Exclusão de Idéias

> **Versão:** 1.0.1 · **Status:** Implementado · conferência parcial
> **Conferido em:** 13/09/2026, na conferência de `visao_do_projeto.html` contra o código: contrato de `DELETE` e a restrição do especialista conferidos; regras do menu (IDEIA-MENU) ainda não
> **Módulo:** Idéias · **Página:** `visao_do_projeto.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ideias-quadro.md`](ideias-quadro.md) · [`ideias-movimentacao.md`](ideias-movimentacao.md) · [`ideias-criacao.md`](ideias-criacao.md)

---

## 1. Regras

### 1.1 Exclusão — `IDEIA-EXCL`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-EXCL-001 | Excluir uma idéia **arquiva** o registro (`arquivado_em` preenchido). A linha não é apagada do banco. | Decorre de E1 / EMP-EXCL-001 |
| IDEIA-EXCL-002 | Podem excluir: **proprietário** e **membro**. O **especialista não pode**, nem as idéias que ele mesmo criou. | Decisão I8 |
| IDEIA-EXCL-003 | A exclusão passa por confirmação explícita em modal, com o aviso de que a ação não pode ser desfeita. | Interface existente |
| IDEIA-EXCL-004 | Idéia arquivada some do quadro, não conta no contador da coluna e não conta para decidir se o projeto está vazio. | Decorre de IDEIA-QUADRO-004 |
| IDEIA-EXCL-005 | O item **"Duplicar" sai do menu do card**, junto da modal correspondente. | Decisão I12 |
| IDEIA-EXCL-006 | Arquivar um projeto torna as idéias dele inacessíveis, mas **não** marca cada idéia como arquivada individualmente. | Decidido 24/08/2026 |

**Por que arquivar e não apagar (IDEIA-EXCL-001).** Mesma razão de empresas e projetos, e aqui com peso extra: a plataforma existe para acumular o contexto do projeto — é esse o ativo que ela entrega no fim, no pacote para a IA. Uma idéia descartada ainda é informação sobre o caminho percorrido, e apagá-la de verdade destruiria parte desse histórico sem possibilidade de recuperação.

**Por que a confirmação diz "não pode ser desfeita" se na verdade arquiva.** Porque, do ponto de vista do usuário, é verdade: não existe tela para restaurar uma idéia arquivada. O `arquivado_em` é uma proteção de dados, não um recurso oferecido. Prometer reversibilidade que a interface não entrega seria pior que a frase atual. Se um dia existir uma lixeira, esta regra e esse texto mudam juntos.

**Por que IDEIA-EXCL-006 existe.** É a diferença entre "inacessível" e "arquivada". Arquivar um projeto com quarenta idéias não deve escrever quarenta timestamps — isso perderia a informação de quais idéias o usuário havia descartado **antes** de arquivar o projeto. O bloqueio vem da corrente de isolamento (IDEIA-ISO-005), que já basta.

### 1.2 O menu do card — `IDEIA-MENU`

| ID | Regra | Fonte |
|---|---|---|
| IDEIA-MENU-001 | O menu do card tem **dois itens**: "Editar idéia" e "Excluir". | Decisão I12 |
| IDEIA-MENU-002 | Para o especialista, o menu mostra apenas "Editar idéia" — sem separador solto nem item desabilitado. | Decorre de IDEIA-EXCL-002 |
| IDEIA-MENU-003 | Papel nenhum vê um menu vazio: quem não pode editar nem excluir não recebe o botão de menu no card. | Decorre de IDEIA-MENU-002 |

**Por que "Duplicar" sai (IDEIA-EXCL-005).** Foi removido de Empresas e de Projetos pelas mesmas razões, e manter só aqui criaria um menu de card que se comporta diferente em uma tela da plataforma. Havia um argumento real a favor de manter — criar variações de uma idéia para comparar é um uso legítimo de brainstorm —, mas ele perde para a coerência: duplicar uma idéia é o mesmo que criar outra e colar o texto, com um item de menu e uma modal a menos para manter.

**Por que IDEIA-MENU-003 não é detalhe.** Um botão de menu que abre uma caixa vazia é pior que botão nenhum: o usuário clica, não entende, e clica de novo. Como o especialista sempre pode editar, hoje nenhum papel cai nesse caso — a regra existe para o dia em que surgir um papel só de leitura, e é barata de respeitar agora.

---

## 2. Contrato da API — `DELETE /empresas/:empresaId/projetos/:projetoId/ideias/:id`

Requisição autenticada pelo cookie de acesso. Sem corpo.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` | Remove o card do quadro e confirma por toast |
| Sessão inválida | `401` | Renovação silenciosa; só então login |
| Conta suspensa | `403` com `suspensao` | Mostra a mensagem |
| Tem vínculo, mas é especialista | `403` | Explica; a tela não deveria ter oferecido |
| Qualquer elo da corrente falha, ou a idéia já está arquivada | `404` | Recarrega o quadro |
| Falha de rede | — | Mantém o card e mostra erro de conexão |

Excluir uma idéia **já arquivada** devolve `404`, não `200`. Um segundo `DELETE` não é sucesso silencioso: significa que a tela está operando sobre um estado que já não existe, e recarregar é a resposta correta.

---

## 3. Estados obrigatórios

| Estado | Quando | O que a tela mostra |
|---|---|---|
| Confirmando | Modal aberta, nada enviado | Texto do aviso e os dois botões ativos |
| Enviando | Após confirmar | Botão de excluir desabilitado, para não disparar dois `DELETE` |
| Concluído | `200` | Card sai do quadro, toast confirma |
| Recusado | `403` | Modal fecha, mensagem explica que o papel não permite |
| Sumiu | `404` | Modal fecha, quadro recarrega |
| Sem rede | Falha de conexão | Card permanece, mensagem de conexão |

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| I12 | Mantém "Duplicar" no menu do card? | **Remove**, como em Empresas e Projetos. Coerência do menu em toda a plataforma vale mais que o atalho de brainstorm. | 24/08/2026 |
| I13 | Excluir apaga ou arquiva? | Arquiva (`arquivado_em`), mesmo padrão dos outros módulos, com peso extra: o contexto do projeto é o produto final da plataforma. | 24/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| Restaurar idéia arquivada | Não existe tela para isso, e por isso a confirmação diz que a ação não pode ser desfeita (ver §1.1). Se virar requisito, esta regra e o texto da modal mudam juntos. |
| Exclusão em lote | Não há seleção múltipla no quadro. Fora do escopo. |
| Registro de quem excluiu | Não se guarda o autor da exclusão, só o `arquivado_em`. Com especialistas externos escrevendo no quadro, isso provavelmente vira requisito — mesma tabela de auditoria citada em `ideias-criacao.md` §4. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.1 | 2026-09-13 | Sem mudança de regra. Cabeçalho corrigido: dizia "implementação não iniciada" com o `DELETE` no ar. Conferidos o arquivamento e o `podeExcluir` que barra o especialista. |
| 1.0.0 | 2026-08-24 | Documento criado. Regras de exclusão (IDEIA-EXCL) com arquivamento, restrição do especialista, regras do menu do card e remoção do "Duplicar". Decisões I12 e I13. |
