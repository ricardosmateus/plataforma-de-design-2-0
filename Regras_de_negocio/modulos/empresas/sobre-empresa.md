# Regras de Negócio — Sobre a Empresa

> **Versão:** 1.2.0 · **Status:** Implementado · `SOBRE-ORIGEM` **planejada, não construída** (`planejamento-pesquisa-v2.md`)
> **Conferido em:** 13/09/2026, contra `Sobre_a_empresa.html`, `js/sobre-empresa.js`, `js/sobre-empresa-semana2.js`, `js/grafo.js`, `js/grafo-painel.js` e `api/src/rotas/grafo.ts`
> **Módulo:** Empresas · **Página:** `Sobre_a_empresa.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`../temas/temas-pagina.md`](../temas/temas-pagina.md) — a página de um tema, para onde cada pasta leva · [`../ideias/ideias-taxonomia.md`](../ideias/ideias-taxonomia.md) — de onde vêm pastas e recortes · [`../ia/ia-pacote-contexto.md`](../ia/ia-pacote-contexto.md) — o botão "Gerar prompt", a única parte desta tela que já tinha regra · [`../atividades/board-lista.md`](../atividades/board-lista.md) — a investigação do board, que passa a ler este conhecimento antes de ir à web · [`../ia/ia-assistente-conhecimento.md`](../ia/ia-assistente-conhecimento.md) — a régua de `IA-CONHEC`, que vale também aqui

---

A página estava no ar sem documento próprio. `ia-pacote-contexto.md` cobria um botão; o resto — as pastas, o grafo, a atualização em ciclo e a operação de reparo — não tinha regra nenhuma. O cabeçalho de `js/sobre-empresa.js` dizia isso em voz alta: *"Não é a implementação do módulo 'Sobre a empresa', que ainda não tem regra de negócio escrita."*

Ficou no módulo **Empresas** porque a tela é sobre **uma empresa** e se chega a ela por `empresas.html`. Se um dia as três páginas de conhecimento (esta, `tema.html` e o que vier do grafo) crescerem, um módulo `conhecimento/` próprio faz mais sentido — é mudança de pasta, não de regra.

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Sobre a empresa |
| Módulo | Empresas |
| Rota | `/Sobre_a_empresa.html?empresa=:id&projeto=:id` |
| Endpoints | `GET /empresas/:id/sobre` · `GET /empresas/:id/grafo` · `POST /empresas/:id/reclassificar` |
| Entidades | `recortes_taxonomia`, `ideias`, `projetos` |
| Componentes | Faixa do grafo (canvas), painel do grafo, lista de pastas, bloco de incompletas, botão "Gerar prompt" |
| Páginas relacionadas | `empresas.html` (origem), `tema.html` (destino de cada pasta), `board.html` (destino pelo painel) |

**O que a página responde.** *De que* a empresa fala. `tema.html` responde *o que ela diz* sobre um assunto. As duas metades juntas são o conhecimento validado da empresa — e "validado" aqui quer dizer uma coisa precisa: idéia em `finalizado`.

---

## 1. Regras

### 1.1 As pastas — `SOBRE-PASTAS`

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-PASTAS-001 | A lista mostra as categorias da taxonomia que têm **pelo menos uma idéia**, com a contagem de cada uma. Categoria vazia não vira pasta. | Registrado 13/09/2026, a partir do código |
| SOBRE-PASTAS-002 | A ordem é: **quantidade**, desempatada por em quantas idéias aquela é a pasta **principal**, desempatada por ordem alfabética. Os dois desempates existem para a lista não remontar diferente a cada carga — ordem instável numa tela que se atualiza sozinha se lê como conteúdo mudando. | Registrado 13/09/2026 |
| SOBRE-PASTAS-003 | A **cobertura** por domínio conta só idéias **finalizadas**. Um domínio cheio de hipóteses continua descoberto, e é essa a informação útil: ela mostra onde falta conhecimento firme, não onde falta atividade. | Registrado 13/09/2026 |
| SOBRE-PASTAS-004 | Cada pasta leva a `tema.html` com `?empresa=` e `?categoria=`, levando junto o `?projeto=` quando ele existe na URL — sair daqui não pode perder o contexto. | Decorre de TEMA-NAV-001 |

### 1.2 Idéia finalizada e incompleta — `SOBRE-FALTA`

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-FALTA-001 | Há **duas formas** de uma idéia finalizada estar incompleta, e elas têm causas diferentes: **sem pasta** (a classificação não rodou ou falhou) e **sem trechos** (tem as tags, mas a página do tema abre vazia). | Registrado 13/09/2026 |
| SOBRE-FALTA-002 | As duas aparecem no **mesmo bloco**, com textos diferentes. Duas caixas lado a lado dizendo "falta algo" se leem como um problema maior do que é; um texto só para as duas não explicaria uma página de tema vazia para quem está vendo as tags na tela. | Registrado 13/09/2026 |
| SOBRE-FALTA-003 | O botão **diz o que vai fazer**: "Tentar classificar" quando há idéia sem pasta, "Gerar os trechos" quando só faltam recortes. E o rótulo em curso segue o mesmo critério ("Classificando…" / "Gerando…"). Prometer reclassificar a quem já tem pasta faria a pessoa temer perder a classificação que já está certa. | Registrado 13/09/2026 |
| SOBRE-FALTA-005 | O número do bloco conta **só idéias finalizadas**, porque é isso que o texto afirma ("estão finalizadas, mas ainda não têm pasta") e é isso que o botão consegue consertar — `/reclassificar` só olha finalizadas. Aviso cujo número e cujo remédio discordam é pior que aviso nenhum: ele acusa um problema que não existe e oferece uma ação que não age. | Faltava na contagem; corrigido 17/09/2026 |
| SOBRE-FALTA-004 | Sem nenhuma das duas faltas, o bloco **não aparece**. Ele é um aviso, não um painel permanente. | Registrado 13/09/2026 |

### 1.3 O grafo — `SOBRE-GRAFO`

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-GRAFO-001 | O grafo desenha **dados reais** ou não desenha nada. Carregando, vazio e falha ocupam o mesmo lugar dele, com textos próprios, e **nenhum dos três pode parecer um grafo cheio**. | Decidido 13/09/2026 com o Ricardo |
| SOBRE-GRAFO-002 | Teto do **servidor**: 400 idéias por empresa, com `truncado` e `teto` na resposta. Existe para a consulta não explodir. Quando ele corta, a tela avisa e aponta o caminho para o resto (abrir a pasta por tema). | Registrado 13/09/2026 |
| SOBRE-GRAFO-003 | Teto do **cliente**: acima do limite de nós ativos, as idéias mais antigas de cada categoria ficam **dobradas** — existem para o painel e para a lista, mas saem da física e do desenho, e a categoria ganha um "+K". Existe para o desenho continuar legível. São tetos diferentes, com motivos diferentes. | Registrado 13/09/2026 |
| SOBRE-GRAFO-004 | As **categorias nunca são escondidas**, em teto nenhum: elas são o esqueleto da taxonomia, e um mapa sem o esqueleto deixa de ser um mapa. | Registrado 13/09/2026 |
| SOBRE-GRAFO-005 | A distribuição inicial dos nós é **determinística** (espiral pelo ângulo áureo), não aleatória: duas cargas da mesma empresa produzem o mesmo desenho. Um grafo que muda de forma a cada F5 parece quebrado mesmo quando não está. | Registrado 13/09/2026 |
| SOBRE-GRAFO-007 | O grafo desenha **só idéias finalizadas** — o mapa é o conhecimento da empresa, e conhecimento é o que foi finalizado (mesma fronteira de `IA-CONHEC-002`, mesmo filtro que `/temas` sempre teve). Idéia de brainstorm não é nó. Finalizada **sem** categoria continua entrando: é conhecimento, só não classificado, e é o que `SOBRE-FALTA` existe para dizer. | Faltava no `/grafo`; corrigido 17/09/2026 |
| SOBRE-GRAFO-006 | A faixa **não muda de altura** entre os estados: a caixa de carregando, a de vazio, a de falha e o canvas ocupam a mesma proporção. Uma lista de pastas que pula na tela quando o grafo chega é pior do que o grafo demorar. | Registrado 13/09/2026 |

**O defeito que só aparece com volume (SOBRE-GRAFO-007, SOBRE-FALTA-005).** Achado pelo Ricardo em 17/09/2026: o grafo mudou de cara sem ninguém ter mexido nele, e o bloco de incompletas anunciou "155 idéias sem pasta". Nada no código do grafo havia mudado — o **dado** mudou. Cento e cinquenta e duas idéias foram importadas de uma vez para "Minhas idéias", todas sem `assunto` e sem `tags`.

Faltavam dois filtros de `status`, e cada um produziu um sintoma:

- **No `/grafo`**: sem o filtro, toda idéia entrava como nó. As importadas eram as mais novas, o servidor ordena por `criadoEm desc`, e o teto de nós ativos do cliente (`SOBRE-GRAFO-003`) é preenchido na ordem em que os nós chegam. Elas consumiram o teto inteiro, e as idéias que **tinham** categoria foram todas dobradas para fora da tela. O grafo virou uma nuvem de pontos sem aresta nenhuma — exatamente o que `SOBRE-GRAFO-001` existe para impedir, mas por dentro: dado real, desenho que não diz nada.
- **Na contagem do balde**: sem o filtro, o número somou as 152 às 3 finalizadas sem pasta. A tela afirmou que 155 idéias "estão finalizadas" — falso para 152 delas — e ofereceu um botão que não tinha o que fazer com nenhuma.

A lição é sobre onde o filtro mora. `/temas` sempre filtrou por `finalizado`, e o comentário lá o chama de cinto de segurança. `/grafo` carregava o `status` de cada nó no payload e **nunca o usava** — sinal de que o filtro era intenção de alguém em algum momento, e de que ficou pelo caminho nos dois lados. Enquanto o volume era pequeno, o erro era só um desenho um pouco mais sujo; com 152 linhas de uma vez, virou outra tela.

**Por que SOBRE-GRAFO-001 precisou virar regra.** Até 13/09/2026 havia no lugar do grafo uma ilustração desenhada à mão, herdada do protótipo: 348 linhas de nós e arestas inventados. Ela era escondida quando os dados reais chegavam — mas ficava na tela nos outros dois caminhos, que são justamente os que importam. Empresa **sem nenhuma idéia classificada** via um grafo cheio, sem aviso nenhum; **falha de carga** via o mesmo grafo cheio, com um aviso de erro por cima.

Nos dois casos, a página que fala do conhecimento real da empresa mostrava conhecimento que não existe. É `EMP-LIST-010` e `IDEIA-QUADRO-008` de novo, num lugar onde o custo é maior: ali a confusão é entre "vazio" e "falhou"; aqui era entre "não sei nada disso" e "sei tudo isso".

A ilustração e o CSS dela foram removidos. O `js/grafo.js` chegou a registrar metade do problema num comentário — *"Cair para a ilustração e não dizer nada foi um erro meu de projeto"* — e corrigiu só o caminho do erro, deixando o do vazio com o comentário `// sem dados: fica a ilustração`.

### 1.4 O painel — `SOBRE-PAINEL`

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-PAINEL-001 | O canvas é `aria-hidden` e não recebe foco. **Quem torna o grafo navegável é o painel**, que é HTML de verdade: foco, teclado, leitor de tela. Acessibilidade aqui não é uma propriedade do desenho — é uma segunda superfície. | Registrado 13/09/2026 |
| SOBRE-PAINEL-002 | O painel **não depende do canvas para existir**: ele recebe os nós quando o grafo carrega, mas abre também pelos botões de categoria da lista de pastas. Grafo que não carregou não pode levar a navegação junto. | Registrado 13/09/2026 |
| SOBRE-PAINEL-003 | É pelo painel que a pasta de uma idéia é corrigida à mão (`IDEIA-TAX-006`), e é dali que se chega ao quadro de origem. | Decorre de IDEIA-TAX |
| SOBRE-PAINEL-004 | O painel **sobrepõe** a faixa do grafo em vez de empurrar o conteúdo: abrir e fechar não pode fazer a lista de pastas pular na tela. | Registrado 13/09/2026 |

### 1.5 A atualização em ciclo — `SOBRE-CICLO`

A tela se atualiza sozinha porque o conteúdo dela chega **em segundo plano**: classificação e recortes rodam depois que alguém finaliza uma idéia em outra página.

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-CICLO-001 | **Aba oculta não pergunta nada.** Ninguém está lendo. | Registrado 13/09/2026 |
| SOBRE-CICLO-002 | Sem novidade, o intervalo **cresce** — de 5s até 30s. Uma tela que está mudando continua respondendo rápido; uma parada há vinte minutos não merece o mesmo esforço. | Registrado 13/09/2026 |
| SOBRE-CICLO-003 | Voltar o foco à aba **pergunta na hora** e reinicia o ritmo, que é exatamente quando a pessoa quer ver o que mudou. | Registrado 13/09/2026 |
| SOBRE-CICLO-004 | O ciclo é **encadeado**, nunca `setInterval`: uma resposta lenta não pode empilhar chamadas. | Registrado 13/09/2026 |
| SOBRE-CICLO-005 | O indicador de carga aparece **só na primeira** vez. Nas atualizações seguintes a lista não é limpa — senão a tela pisca a cada ciclo e parece recarregar sozinha. | Registrado 13/09/2026 |
| SOBRE-CICLO-006 | Só re-renderiza quando os dados **mudaram de verdade**. | Registrado 13/09/2026 |
| SOBRE-CICLO-007 | Erro **depois** de uma carga boa não apaga o que já está na tela. O que estava certo continua certo; o que falhou foi a próxima pergunta. | Registrado 13/09/2026; decorre de EMP-LIST-010 |
| SOBRE-CICLO-008 | Um `401` renova em silêncio por `GET /auth/sessao` antes de desistir, como nas outras telas. | Decorre de PROJ-LIST-008 |

**Por que o ritmo virou regra.** A versão anterior era um `setInterval` de 5s, fixo. Cada aba aberta batia na API doze vezes por minuto para sempre — inclusive minimizada, inclusive esquecida aberta no fim de semana. Com muitas empresas, é carga constante para não mostrar nada de novo. As três correções estão em ordem de importância, e a primeira sozinha resolve a maior parte.

### 1.6 Reparo — `SOBRE-REPARO`

O botão do bloco de incompletas (`SOBRE-FALTA-003`) dispara `POST /empresas/:id/reclassificar`.

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-REPARO-001 | O reparo trabalha em **lote de 20** por chamada e devolve quantas ficaram (`restantes`). Uma empresa com trezentas pendências não vira uma chamada de dez minutos. | Registrado 13/09/2026 |
| SOBRE-REPARO-002 | Há **duas filas com remédios diferentes**: idéia **sem pasta** vai para a classificação (que chama o recorte no fim); idéia **com pasta e sem recorte** vai só para o recorte. Reclassificar a segunda seria pagar de novo por uma resposta que já se tem. | Registrado 13/09/2026 |
| SOBRE-REPARO-003 | Idéia com `taxonomia_manual` **fica fora da fila de classificação** — pasta decidida por uma pessoa não se reabre para a IA (`IDEIA-TAX-006`). Mas entra na fila de recorte: ela merece trechos como qualquer outra. | Decorre de IDEIA-TAX-006 |
| SOBRE-REPARO-004 | Quem pode reparar são os mesmos três papéis que escrevem (proprietário, membro, especialista). **Quem só observa não dispara gasto de crédito** — mesmo critério de mover um card e de corrigir a pasta. | Decorre de IDEIA-MOV-004 |
| SOBRE-REPARO-005 | O reparo **custa crédito**, porque classificar e recortar chamam o modelo. É a única ação desta página que gasta. | Decorre de IA-CUSTO |
| SOBRE-REPARO-006 | Roda em **segundo plano**: a resposta volta com as contagens do que foi enfileirado, não com o resultado. Quem pediu está com um botão em "Classificando…", não esperando um relatório. | Registrado 13/09/2026 |

### 1.7 A página como origem — `SOBRE-ORIGEM`

Até aqui esta página foi descrita como **destino**: o lugar onde o conhecimento validado da empresa aparece depois que alguém finaliza uma idéia. A partir do plano `planejamento-pesquisa-v2.md`, ela também é **origem** — o mesmo conhecimento passa a alimentar a investigação do board antes de ela ir à web.

| ID | Regra | Fonte |
|---|---|---|
| SOBRE-ORIGEM-001 | O conhecimento desta página é a **primeira fonte da investigação do board**, consultada antes da web (`BOARD-PESQUISA-013`). Hoje a investigação recebe só nome e descrição da empresa e começa do zero toda vez. **Planejada, não construída.** | Decidido 13/09/2026 com o Ricardo |
| SOBRE-ORIGEM-002 | O que sai daqui é **verdade validada**: os `recortes_taxonomia` das idéias em `finalizado` — exatamente o recorte que as pastas já mostram (`SOBRE-PASTAS-003`), no alcance da **empresa inteira** (`TEMA-ISO-001`). Material de consulta **não passa por esta página**: vem do quadro do projeto da tarefa (`BOARD-PESQUISA-015`). | Decorre de SOBRE-PASTAS-003 e BOARD-PESQUISA-015 |
| SOBRE-ORIGEM-003 | A régua é a de `IA-CONHEC`, **não uma nova**: o que esta página entrega é verdade validada porque `IA-CONHEC-002/007` define assim, e idéia arquivada continua fora (`IA-CONHEC-004`). Esta página não decide o que é verdade — ela mostra o resultado de uma decisão que já foi tomada em outro lugar, por uma pessoa. | Decorre de IA-CONHEC-009 |
| SOBRE-ORIGEM-004 | Por consequência, **idéia incompleta deixa de ser só um buraco visual**. Idéia finalizada sem pasta ou sem trechos (`SOBRE-FALTA-001`) é conhecimento que a investigação **não vai encontrar** — e a pesquisa sai pior sem ninguém perceber por quê. O bloco de incompletas e o reparo (`SOBRE-REPARO`) passam a ter efeito sobre a qualidade da pesquisa, não só sobre a aparência da tela. | Decidido 13/09/2026 com o Ricardo |

**Por que isto é regra desta página, e não só do board.** A regra da investigação (`BOARD-PESQUISA-013`) diz de onde ela lê. Esta diz o que esta página se comprometeu a entregar — e são coisas diferentes na hora de mexer no código. Mudar o critério de `cobertura` (`SOBRE-PASTAS-003`), ou o que entra num recorte, deixou de ser uma alteração local de apresentação: muda o que a pesquisa enxerga. Sem `SOBRE-ORIGEM`, quem for mexer aqui um dia não tem como saber disso.

**O efeito colateral bom.** As pendências abertas desta página — reparo sem retorno, `restantes > 0` sem "continuar" — eram irritações toleráveis enquanto o custo de uma pasta faltando era uma lista mais curta. Com `SOBRE-ORIGEM-004`, elas passam a ter preço em qualidade de pesquisa. Não mudam de prioridade por decisão; mudam porque o que elas custam mudou.


---

---

## 2. Contrato da API

### `GET /empresas/:empresaId/sobre`

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Sucesso | `200` com `{ assuntos, sem_categoria, sem_recortes, cobertura }` | Desenha as pastas e, se houver falta, o bloco de incompletas |
| Sessão inválida | `401` | Renova por `/auth/sessao`; só então login (SOBRE-CICLO-008) |
| Conta suspensa | `403` com `suspensao` | Volta ao login |
| Sem vínculo com a empresa | `404` | Sai da página |

`cobertura` traz `total`, `cobertos` e a lista de domínios com a contagem de finalizadas em cada um (SOBRE-PASTAS-003). Cada item de `assuntos` traz `categoria` **e** `assunto` com o mesmo valor — duplicação deliberada, para não quebrar versões da tela que leem um ou outro.

### `GET /empresas/:empresaId/grafo`

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Com dados | `200` com `{ nos, arestas, truncado, teto }` | Desenha o canvas e esconde a caixa de estado |
| Sem nenhuma idéia classificada | `200` com `nos` vazio | Caixa de estado, texto de vazio, **sem grafo** (SOBRE-GRAFO-001) |
| Qualquer falha | `4xx`/`5xx`/rede | Caixa de estado, texto de falha, **sem grafo** |

### `POST /empresas/:empresaId/reclassificar`

Sem corpo. Devolve `{ enfileiradas, classificando, recortando, restantes }`.

| Situação | Resposta |
|---|---|
| Enfileirado | `200` com as contagens |
| Sessão inválida | `401` |
| Conta suspensa | `403` com `suspensao` |
| Papel sem permissão | `403` "Seu papel não permite reclassificar idéias." |
| Sem vínculo com a empresa | `404` |

---

## 3. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| SE1 | O que fica no lugar do grafo enquanto ele não chega, ou quando não vem? | Uma caixa de estado com texto próprio para carregando, vazio e falha. A ilustração do protótipo foi **removida** — ela mostrava conhecimento inventado nos dois casos em que a verdade era "não há". | 13/09/2026, com o Ricardo |
| SE2 | Cobertura conta idéia de qualquer status? | Só **finalizada**. "Validado" é o que a página promete. | Registrado 13/09/2026, do código |
| SE3 | Reclassificar reabre pasta corrigida à mão? | **Não** para a pasta; **sim** para o recorte. | Registrado 13/09/2026, do código |
| SE4 | O ciclo de atualização tem ritmo fixo? | Não: aba oculta não pergunta, sem novidade o intervalo cresce, e o foco reinicia. | Registrado 13/09/2026, do código |
| SE5 | O conhecimento desta página alimenta a investigação do board? | **Sim, e é a primeira fonte dela** — antes da web. Sai daqui só verdade validada, no alcance da empresa inteira; material de consulta vem do quadro do projeto, não daqui. A régua é `IA-CONHEC`, a mesma do assistente. | 13/09/2026, com o Ricardo |

---

## 4. Pendências abertas

| Item | Situação |
|---|---|
| Origem das decisões SE2 a SE4 | **Lidas do código**, não de decisão registrada em conversa. Descrevem o que o sistema faz; falta confirmar que é o que se quer. |
| O que o reparo custa, e quem vê | `SOBRE-REPARO-005` diz que gasta crédito, mas a tela não estima nem mostra quanto antes de disparar — a pessoa clica sem saber o preço. Com lote de 20, não é desprezível. |
| Reparo sem retorno | A resposta diz quantas foram enfileiradas, e o resultado aparece no ciclo seguinte (`SOBRE-CICLO`). Não há aviso de "terminou", nem de "falhou para K delas". Uma classificação que falha em silêncio reaparece como a mesma pendência, sem explicar por quê. |
| `restantes > 0` | A tela não oferece "continuar": quem tem trezentas pendências precisa clicar quinze vezes, sem saber disso. |
| Grafo em telas pequenas | A página é desktop-only por decisão anterior (`min-width: 1024px`), então o grafo não tem comportamento de toque. Herdado, não decidido aqui. |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.2.0 | 2026-09-17 | **Dois filtros de `status` que faltavam, achados em uso.** O grafo mudou de cara sozinho e o bloco de incompletas anunciou "155 idéias sem pasta" depois de 152 idéias serem importadas para "Minhas idéias". Nova `SOBRE-GRAFO-007`: o grafo desenha só finalizadas — sem o filtro, as importadas (as mais novas, e sem aresta nenhuma) consumiam o teto de nós ativos e dobravam para fora da tela todas as idéias que tinham categoria. Nova `SOBRE-FALTA-005`: o número do bloco conta só finalizadas, porque é o que o texto afirma e o que `/reclassificar` consegue consertar. |
| 1.1.0 | 2026-09-13 | A página deixa de ser só destino do conhecimento e passa a ser também **origem**: registrada `SOBRE-ORIGEM` (4 regras), que liga o conhecimento validado desta tela à investigação do board (`BOARD-PESQUISA-013/015`, plano `planejamento-pesquisa-v2.md` §3.3). Sai daqui verdade validada no alcance da empresa inteira; material de consulta vem do quadro do projeto, não desta página. Decisão SE5. Regras **planejadas, não construídas** — o cabeçalho diz isso. Consequência registrada em `SOBRE-ORIGEM-004`: idéia finalizada incompleta (`SOBRE-FALTA`) passa a custar qualidade de pesquisa, não só aparência de tela. |
| 1.0.0 | 2026-09-13 | Documento criado na conferência de `Sobre_a_empresa.html`, que estava no ar sem regra própria — `ia-pacote-contexto.md` cobria só o botão "Gerar prompt", e o cabeçalho de `js/sobre-empresa.js` registrava a ausência. Registradas `SOBRE-PASTAS` (4), `SOBRE-FALTA` (4), `SOBRE-GRAFO` (6), `SOBRE-PAINEL` (4), `SOBRE-CICLO` (8) e `SOBRE-REPARO` (6), os contratos das três rotas, decisões SE1 a SE4 e cinco pendências. `POST /reclassificar` não tinha menção em nenhum documento de regra. Junto, `SOBRE-GRAFO-001` foi implementada: a ilustração de grafo do protótipo (348 linhas de SVG mais 53 de CSS) saiu de `Sobre_a_empresa.html`, e carregando, vazio e falha passaram a ter caixa própria. Verificado com DOM real nos cinco caminhos — carregando, vazio, `500`, rede caída e sucesso. |
