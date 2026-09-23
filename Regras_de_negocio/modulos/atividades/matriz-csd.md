# Regras de Negócio — Matriz CSD de uma Tarefa

> **Versão:** 1.0.0 · **Status:** Implementado (não verificado ao vivo com IA)
> **Conferido em:** 23/09/2026, contra `matriz_csd.html`, `js/matriz.js`, `api/src/ia/classificar-matriz.ts` e `api/src/rotas/gerar-tarefa.ts`
> **Módulo:** Atividades · **Página:** `matriz_csd.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`atividade-lista.md`](atividade-lista.md) (`ATV-GERAR`) · [`board-lista.md`](board-lista.md) (`BOARD-SALVA`, `BOARD-LEITURA`)

Até 23/09/2026 `matriz_csd.html` era protótipo: nada era lido nem gravado, o "Salvando..." era um relógio de 1,4 s e o "Voltar" levava a uma atividade sem ids. Esta versão liga a tela à tarefa de verdade.

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| MATRIZ-001 | A tarefa `matriz_csd` abre com **um quadro só: a matriz**, com as colunas **Certeza**, **Suposição** e **Dúvidas**. O painel "Meus registros" saiu. | Pedido do Ricardo, 23/09/2026 |
| MATRIZ-002 | **Todo card mora numa coluna.** "Novo registro" pergunta em qual coluna ele entra (padrão: Dúvidas). Arrastar move entre colunas; soltar fora delas devolve o card ao lugar de origem — não existe mais card solto no canvas, porque não haveria onde gravá-lo. | Decorre de MATRIZ-001 |
| MATRIZ-003 | A matriz é gravada pelo **mesmo PUT de quadros do board** (`BOARD-SALVA-001`), como um quadro `postits` de três colunas — sem tabela nova. Título e descrição seguem os limites do post-it (260 e 280). Coluna com título que não é C, S nem D é lida como Dúvidas. O "Salvando..." do botão Voltar acompanha a gravação real, e o Voltar espera a gravação em curso antes de sair. | Decisão de implementação, 23/09/2026 |
| MATRIZ-004 | O link "Acessar tarefa" da atividade passa os **quatro ids** (empresa, projeto, idéia, tarefa). Sem eles, a página fica só leitura e diz para abrir pela lista de tarefas, em vez de fingir que grava. | Decisão de implementação, 23/09/2026 |
| MATRIZ-005 | **Modo leitura vem do status da tarefa** (concluída), não mais de `?modo=leitura`. Concluída: sem novo registro, sem arrastar, sem editar e sem IA — e o PUT do servidor recusa por conta própria (`BOARD-LEITURA`). | Mesmo raciocínio de `BOARD-LEITURA` |
| MATRIZ-006 | **Reabrir tarefa** grava o status (rota de `ATV-TAR-CONCLUIR`); a edição só é liberada depois que o servidor confirma. | Decisão de implementação, 23/09/2026 |

## 2. "Gerar classificação com IA" — `MATRIZ-IA`

| ID | Regra | Fonte |
|---|---|---|
| MATRIZ-IA-001 | O que se classifica é **o trabalho da atividade** a que a matriz pertence: **cada outra tarefa da atividade vira um card**, na coluna em que o assunto dela está hoje. Numa atividade "Logotipo", "Pesquisar os logotipos dos concorrentes", "Buscar o manual de marca dos concorrentes" e "Validar com os nossos usuários" são os cards. | Pedido do Ricardo, 23/09/2026 |
| MATRIZ-IA-002 | Quem classifica é o **Senior Product Designer** (`Skills/senior-product-designer.skill`, prompt `SISTEMA_MATRIZ` em `api/src/ia/classificar-matriz.ts`), com: a ficha da empresa e o que ela já sabe (régua de `IA-CONHEC` — material de consulta sustenta suposição, não certeza), o projeto, a atividade, as tarefas (título, descrição, tipo, status) e o que já está na matriz. Pode acrescentar **até 3 cards extras** com o que falta à atividade e nenhuma tarefa cobre. | Pedido do Ricardo, 23/09/2026 |
| MATRIZ-IA-003 | **Garantia de código:** toda tarefa da atividade aparece. A que o modelo esquecer entra pelo status — concluída em Certeza, aberta em Dúvidas — com a descrição dizendo que a coluna é provisória. Sem nenhuma resposta útil do modelo, **nada** é devolvido nem cobrado: completar só pelo status seria uma classificação que a IA não fez, com o nome dela. | Decisão de implementação, 23/09/2026 |
| MATRIZ-IA-004 | A rota **não grava**: devolve os cards com a coluna, e a tela os acrescenta e salva pelo PUT de MATRIZ-003 — um dono só para o conteúdo. O que já está na matriz (mesmo título) não entra de novo; clicar outra vez não duplica. | Decisão de implementação, 23/09/2026 |
| MATRIZ-IA-005 | Manual e IA convivem: a pessoa pode montar a matriz à mão, usar a IA, ou as duas coisas; o que a IA põe é editável e pode ser arrastado para outra coluna como qualquer card. | Pedido do Ricardo, 23/09/2026 |
| MATRIZ-IA-006 | **Custo:** teto reservado antes, acertado pelo real depois (`IA-CUSTO`); valor só no Histórico de uso (`DIN-013`). Tarefa concluída ou de outro tipo: `409`, antes de qualquer chamada. | Decorre de `IA-CUSTO` e `DIN-013` |
| MATRIZ-IA-007 | Tarefa de Matriz CSD criada pelo "Gerar com ajuda da IA" (`ATV-GERAR-015`) abre a matriz com `classificar=1` e já classifica, uma vez só. | Decisão do Ricardo, 23/09/2026 ("tarefa já com conteúdo") |

## 3. Contrato da API

- `GET/PUT .../tarefas/:tarefaId/quadros` — os mesmos do board (`board-lista.md` §2).
- `POST .../ideias/:ideiaId/tarefas/:tarefaId/matriz/classificar` → `200 { cards: [{ titulo, descricao, coluna: "certeza"|"suposicao"|"duvida", extra }], colunas }`. `402` sem saldo, `409` concluída ou não-matriz, `503` sem IA ou sem resposta útil.

## 4. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 1.0.0 | 2026-09-23 | Primeira versão: matriz com persistência, sem "Meus registros", e classificação com IA pelas tarefas da atividade. |
