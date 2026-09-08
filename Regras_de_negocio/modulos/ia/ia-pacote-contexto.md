# Regras de Negócio — Pacote de Contexto para IA Externa

> **Versão:** 2.0.0 · **Status:** Implementado e verificado ao vivo
> **Módulo:** Assistente de IA · **Página:** `Sobre_a_empresa.html` (botão "Gerar prompt")
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ia-assistente-conhecimento.md`](ia-assistente-conhecimento.md) — de onde vem a fronteira validado/hipótese (`IA-CONHEC-002`) · [`ia-assistente-isolamento.md`](ia-assistente-isolamento.md) — o recorte que o pacote precisa respeitar · [`ia-assistente-conversa.md`](ia-assistente-conversa.md)

A plataforma existe para construir contexto. Este é o primeiro lugar em que esse contexto **sai** dela: um arquivo markdown que a pessoa baixa e leva para a IA que quiser.

---

## 1. Regras

### 1.1 O que o pacote é — `PACOTE-CONT`

| ID | Regra | Fonte |
|---|---|---|
| PACOTE-CONT-001 | O pacote é um **markdown baixado**, escopo de **um projeto**: empresa, projeto e as idéias daquele projeto. | Decisão A20-P |
| PACOTE-CONT-002 | O pacote é montado **no servidor**, nunca no navegador. A tela não decide o que entra. | Decisão A21-P |
| PACOTE-CONT-003 | O pacote enxerga **exatamente o mesmo recorte** que a pessoa enxerga: passa pela mesma corrente de isolamento e pela mesma consulta de idéias que o assistente interno usa (`IA-ISO-004`). | Decorre de IA-ISO-004 |
| PACOTE-CONT-004 | O pacote declara **o que não contém** — hoje: tarefas, quadros e conversas. | Decisão A22-P |
| PACOTE-CONT-005 | O download passa pela **renovação silenciosa de sessão**. Token vencido renova e baixa; não devolve erro cru na cara da pessoa. | Decorre de ACS-SESSAO |

**Por que montado no servidor (PACOTE-CONT-002).** Duas razões, e as duas são de segurança. A URL traz os ids, e id em URL é palpite até o servidor conferir — quem decide o que a pessoa pode ler é a corrente de isolamento, no servidor, como em todo o resto do produto. E se o navegador montasse o arquivo, ele conteria só o que aquela tela por acaso tinha carregado: o pacote passaria a depender de por onde a pessoa navegou antes.

**Por que reusar a consulta do assistente (PACOTE-CONT-003).** Uma consulta própria aqui seria o lugar perfeito para um `where` se perder. E o vazamento seria **invisível**: ninguém revisa um arquivo baixado. Por isso a rota chama `abrirContexto()` e `ideiasDoProjeto()` — as mesmas de `ia.ts`.

**Por que declarar o que falta (PACOTE-CONT-004).** Uma IA que não sabe o que não recebeu preenche a lacuna sozinha. Dizer "as tarefas e os quadros não estão aqui" transforma uma ausência silenciosa numa informação útil: ela sabe que pode precisar perguntar.

### 1.2 Só verdade validada sai — `PACOTE-VERD`

| ID | Regra | Fonte |
|---|---|---|
| PACOTE-VERD-001 | O pacote contém **apenas idéias em "Finalizado"**. Idéias em "Minhas idéias" ou "Em andamento" **não são incluídas de forma alguma** — nem marcadas, nem resumidas, nem citadas. | Decisão A24-P |
| PACOTE-VERD-002 | A **descrição da empresa** conta como verdade validada: é a própria conta declarando o que o negócio é. | Decisão A24-P |
| PACOTE-VERD-003 | A fronteira usa a **mesma função** do assistente interno (`ehVerdadeValidada`). Ela existe uma vez no código; se mudar, muda para os dois. | Decorre de IA-CONHEC-002 |
| PACOTE-VERD-004 | Se a empresa **não tem descrição**, o pacote avisa explicitamente para a IA **não deduzir o ramo pelo nome**. | Decorre de IA-VAZIO-007 |
| PACOTE-VERD-005 | Projeto **sem nenhuma idéia validada** ainda gera pacote — a empresa é contexto legítimo —, mas o arquivo **abre dizendo isso**, para a ausência não ser lida como "o projeto tem pouco a dizer". | Decisão A25-P |

**Por que excluir, e não marcar como hipótese.** A v1.0.0 deste documento mandava as hipóteses num bloco separado, rotulado. Estava errado, e o próprio código do assistente já dizia por quê:

> *"Note o que NÃO está aqui: nenhuma promessa de que o modelo vai respeitar isto. As instruções ajudam, mas quem garante é a verificação em `verificacao.ts`, que roda depois e não depende de obediência."* — `contexto.ts`, sobre `IA-GARANT-003`

Dentro da plataforma esse arranjo funciona: o assistente **pode** receber hipóteses marcadas, porque existe uma verificação depois, que não depende de o modelo ter obedecido. Aqui não existe "depois". O arquivo sai da plataforma e nunca mais é visto — nenhuma verificação, nenhuma correção, nenhuma chance de perceber que o rótulo foi ignorado. O rótulo vira um pedido de boa vontade a um modelo que não controlamos.

E o custo do erro é assimétrico. Uma hipótese ainda em teste, lida por uma IA, vira facilmente premissa de trabalho: o que era dúvida acaba **dentro do que se constrói**, sem que ninguém tenha decidido isso. Descobrir depois que o produto foi desenhado em cima de um palpite é caro; não ter mandado o palpite não custa nada — ele continua na plataforma, e vira parte do pacote no dia em que for validado.

**Por que a descrição da empresa entra (PACOTE-VERD-002).** Ela não é palpite sobre o negócio: é a conta dizendo o que o negócio é. Não passa pelas colunas porque não é idéia — é identidade. `IA-VAZIO-007` já a trata como "a única base legítima para sugestões sobre o negócio".

**Por que o aviso sobre o nome (PACOTE-VERD-004).** `IA-VAZIO-007` já registrou o problema: uma loja de bairro pode se chamar "Nike", e o modelo tem conhecimento de mundo farto sobre a Nike de verdade. Sem descrição, o silêncio seria preenchido por suposição — e numa IA de fora, sem as nossas travas, com ainda mais confiança.

---

## 2. Contrato da API

### `GET /empresas/:empresaId/projetos/:projetoId/ia/pacote`

Autenticada pelo cookie de acesso. Sob a corrente **empresa → projeto**, igual às demais rotas de `ia.ts`.

| Situação | Resposta |
|---|---|
| Sucesso | `200`, `Content-Type: text/markdown; charset=utf-8`, `Content-Disposition: attachment; filename="…"` |
| Sessão inválida | `401` — a tela renova em silêncio e tenta de novo (PACOTE-CONT-005) |
| Conta suspensa | `403` com `suspensao` |
| Sem vínculo, projeto de outra empresa, arquivado | `404` com a mesma mensagem de sempre |

É `GET` de propósito: não muda nada no servidor.

**Nome do arquivo:** `contexto-{empresa}-{projeto}-{aaaa-mm-dd}.md`, com acentos e símbolos removidos — barra viraria caminho, não nome.

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| A20-P | O pacote é de empresa ou de projeto? | **De projeto.** As idéias — o conteúdo que importa — vivem no projeto. Um pacote de empresa inteira misturaria projetos que não se falam. | 29/08/2026 |
| A21-P | Montar no servidor ou no navegador? | **Servidor.** A URL é palpite até ser conferida, e um pacote montado no cliente conteria só o que aquela tela carregou. | 29/08/2026 |
| A22-P | O pacote diz o que não contém? | **Sim.** Ausência silenciosa vira invenção do outro lado. | 29/08/2026 |
| A23-P *(revogada por A24-P)* | O arquivo instrui a IA de destino, ou só entrega dados? | **Instrui.** Na v1.0.0 isso servia para separar validado de hipótese. Com a exclusão das hipóteses (A24-P), o cabeçalho continua — mas para dizer que tudo ali é decisão fechada e que lacuna não se preenche. | 29/08/2026 |
| A24-P | Hipóteses vão marcadas ou não vão? | **Não vão.** Marcar depende de o modelo obedecer, e num arquivo que sai da plataforma não há verificação depois (`IA-GARANT-003`). Hipótese lida por IA vira premissa de trabalho, e o palpite entra no que se constrói sem ninguém ter decidido. A descrição da empresa entra, porque é identidade declarada, não palpite. | 29/08/2026 |
| A25-P | Projeto sem nada validado gera pacote? | **Sim, com aviso no topo.** A empresa ainda é contexto legítimo. Mas o arquivo precisa dizer que não há decisão fechada — senão a ausência é lida como "este projeto tem pouco a dizer" em vez de "este projeto ainda não decidiu nada". | 29/08/2026 |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Tarefas e quadros no pacote | Ficaram de fora. São onde a pesquisa acontece (`BOARD-QUADRO`), mas por definição são **material em andamento** — e `PACOTE-VERD-001` diz que material não validado não sai. Para entrarem, seria preciso um conceito de "quadro validado" que hoje não existe. Provavelmente não é a próxima adição, e sim uma pergunta sobre o que valida um resultado de pesquisa. |
| Conversas no pacote | `ia-assistente-conversa.md` §5 já registra "exportar a conversa" como não decidido. Aqui o obstáculo é `IA-CONV-003`: a conversa é privada por pessoa e carrega o raciocínio em construção de quem perguntou. Exportar muda uma garantia já documentada. |
| O resto da `Sobre_a_empresa.html` | Só o "Gerar prompt" fala com a API. O grafo, o "68% estruturado" e as pastas continuam protótipo, e aquela página não tem regra de negócio escrita. O botão "Sugestão de tarefa", ao lado, também não faz nada. |
| `matriz_csd.html` no menu lateral | Aquela tela não lê a URL, então o item "Sobre a empresa" do menu dela não consegue levar o contexto — e agora cai em `empresas.html`. Some quando `matriz_csd.html` for ligada à API. |
| Pacote de várias telas | Hoje só se baixa de `Sobre_a_empresa.html`. Faz sentido oferecer o mesmo download da visão do projeto. Não decidido. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 2.0.0 | 2026-08-29 | **Mudança de regra: hipóteses deixaram de entrar no pacote.** A v1.0.0 as mandava num bloco separado e rotulado; a v2.0.0 não as manda de forma alguma (`PACOTE-VERD-001`, decisão A24-P). O motivo é o próprio `IA-GARANT-003`: rótulo depende de obediência do modelo, e num arquivo que sai da plataforma não existe verificação depois para corrigir. Como o erro é assimétrico — hipótese lida por IA vira premissa e entra no que se constrói —, a única garantia real é não mandar. Acrescentado `PACOTE-VERD-005`: projeto sem nada validado ainda gera pacote, mas o arquivo abre avisando. A seção "o que não contém" passou a **explicar o porquê** da exclusão, para a IA não tratar a ausência como esquecimento. Verificado ao vivo: com duas idéias em "Em andamento", nenhuma aparece no arquivo (nem título nem descrição) e o aviso de topo surge; ao mover uma para "Finalizado", ela passa a constar e a outra continua fora. |
| 1.0.0 | 2026-08-29 | Documento criado e **implementado**. Novo `api/src/ia/pacote.ts` (monta o markdown, reusando `ehVerdadeValidada` de `contexto.ts`) e rota `GET .../ia/pacote` em `ia.ts`, que reaproveita `abrirContexto()` e `ideiasDoProjeto()` — as mesmas do assistente interno, para o pacote não ter um recorte próprio. `js/api.js` ganhou `bruto()`, para respostas que não são JSON. `Sobre_a_empresa.html` foi ligada **só no necessário** (novo `js/sobre-empresa.js`): lê empresa e projeto da URL, põe o nome real no título — estava fixo em "Nike" — e faz o "Gerar prompt" baixar o arquivo; o resto da página segue protótipo. Os links de menu lateral que apontavam para essa página **sem contexto** foram corrigidos em `atividade.html` e `board.html`, via `window.ContextoUrl` publicado por `js/atividade.js` e `js/board.js`. Verificado ao vivo: arquivo gerado com as duas seções separadas, descrição real da empresa, e o aviso de limites no fim. |
