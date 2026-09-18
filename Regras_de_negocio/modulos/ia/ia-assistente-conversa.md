# Regras de Negócio — Assistente de IA: a conversa

> **Versão:** 1.8.0 · **Status:** Implementado e verificado ao vivo · `IA-CONV-NARRA` **construída em 14/09/2026** · `IA-CONV-CADERNO` **construída em 14/09/2026**
> **Módulo:** Assistente de IA · **Página:** `visao_do_projeto.html`, `atividade.html` e `board.html` (painel lateral, mesma conversa por projeto — `IA-CONV-001`)
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`ia-assistente-conhecimento.md`](ia-assistente-conhecimento.md) · [`ia-assistente-isolamento.md`](ia-assistente-isolamento.md)

---

## Estado atual da interface

O painel está implementado nas duas páginas (`js/ia.js`): cabeçalho, thread de mensagens persistida, compositor com envio real, estado "pensando", procedência das respostas, e o gatilho que recolhe o painel de 320px para 80px (§1.5). A conversa de exemplo fixa no HTML — que falava de inadimplência e moradores vendendo em e-commerce, assunto de outro projeto — saiu (IA-CONV-006).

---

## 1. Regras

### 1.1 A conversa — `IA-CONV`

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-001 | A conversa pertence ao **par (projeto, pessoa)**. Cada pessoa tem a sua, dentro de cada projeto. | Decisão A10 |
| IA-CONV-002 | A conversa é **persistida**. Recarregar a página, trocar de máquina ou voltar dias depois recupera o histórico. | Decisão A11 |
| IA-CONV-003 | Ninguém vê a conversa de outra pessoa — nem o proprietário da empresa. | Decisão A10 |
| IA-CONV-004 | O histórico da conversa entra no contexto das perguntas seguintes, **limitado às últimas trocas** (ver A12). | Decisão A12 |
| IA-CONV-005 | A conversa **não é fonte de verdade**. Nada dito nela vira fato do projeto — só idéia em `Finalizado` vira. | Decorre de IA-GERAL-003 |
| IA-CONV-006 | A conversa começa **vazia**, com um convite curto. O texto de exemplo que está hoje no HTML sai. | Decidido 25/08/2026 — corrige o protótipo |
| IA-CONV-007 | Anexos não existem nesta versão. O botão de anexo sai do compositor até haver funcionalidade. | Decisão A13 |

**Por que a conversa é privada por pessoa (IA-CONV-001/003).** Duas razões. A conversa carrega o raciocínio em construção de quem pergunta — inclusive dúvidas que a pessoa não formularia em público, e é justamente isso que faz o assistente útil para quem está aprendendo. E o especialista é alguém de fora: uma conversa compartilhada exporia o que o empreendedor pergunta e o que ele ainda não sabe, para um prestador contratado. Se um dia fizer sentido ter conversa de equipe, ela nasce como recurso próprio, com consentimento — não por herança silenciosa.

**Por que IA-CONV-005 é regra explícita.** O assistente afirma algo, a pessoa concorda, a conversa segue. Sem esta regra, aquilo passa a funcionar como acordo do projeto sem nunca ter virado idéia nem passado por `Finalizado` — e a regra do Ricardo teria sido contornada por conversa, não por código.

**Por que o texto de exemplo precisa sair (IA-CONV-006).** Ele não é neutro: fala de assunto de outro projeto. Qualquer pessoa que abra a página vê uma conversa que não aconteceu, sobre um negócio que não é o dela. Enquanto era protótipo, era cenário; com a página em uso real, vira informação falsa na tela.

### 1.2 Estados obrigatórios — `IA-CONV-EST`

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-008 | **Pensando** é um estado visível. Uma resposta de IA leva segundos, e silêncio sem sinal é indistinguível de travamento. | Decisão A14 |
| IA-CONV-009 | Enquanto uma pergunta está em andamento, o envio fica bloqueado. Não há duas perguntas simultâneas na mesma conversa. | Decisão A14 |
| IA-CONV-010 | Falha de rede ou provedor indisponível **preserva a pergunta digitada** e oferece tentar de novo. Nunca apaga o que a pessoa escreveu. | Decorre de EMP-LIST-010 |
| IA-CONV-011 | Erro é erro, e não vira resposta. O assistente jamais responde algo genérico para disfarçar uma falha técnica. | Decorre de IA-VAZIO-004 |

Estados, em ordem:

| Estado | Quando | O que a tela mostra |
|---|---|---|
| Vazia | Conversa nova | Convite curto, compositor ativo |
| Carregando histórico | Abrindo a página | Indicação de carga, compositor bloqueado |
| Pronta | Histórico carregado | Mensagens e compositor ativo |
| Pensando | Pergunta enviada | Sinal de atividade, envio bloqueado |
| Respondida | `200` | Resposta com as marcações de procedência |
| Sem crédito | `402` | Explica e aponta o caminho de recarga |
| Indisponível | `503` | Falha do provedor; pergunta preservada, botão de tentar de novo |
| Erro | Rede ou outro | Mesma coisa: pergunta preservada |

**Por que "pensando" merece regra (IA-CONV-008).** É a diferença mais visível entre esta funcionalidade e todas as outras da plataforma. Salvar uma idéia leva milissegundos; responder leva segundos. O padrão de feedback que serve para o resto da plataforma não serve aqui.

### 1.3 Fim da conversa — `IA-CONV-FIM`

Origem: pedido do Ricardo, 27/08/2026 — a conversa não deve viver mais do que a sessão da pessoa, para não acumular histórico de quem não está mais usando a ferramenta.

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-012 | A conversa é apagada quando a **sessão termina**: no logout explícito (botão "Sair da conta") ou quando o servidor detecta, na próxima tentativa de uso, que a sessão **expirou por tempo ou inatividade** — token de refresh vencido, revogado ou inexistente. | Decisão A16 |
| IA-CONV-013 | A apagada é **por pessoa, em todos os projetos** dela — logout é evento de conta, não de projeto (mesmo raciocínio de IA-CONV-001). Só as tabelas da conversa (`ia_conversas`/`ia_mensagens`) são tocadas; nenhum outro dado da pessoa, empresa ou projeto é afetado. | Decisão A16 |

**Isto não contradiz IA-CONV-002/A11 — só delimita até quando.** A conversa continua sobrevivendo a recarregar a página, trocar de máquina ou voltar depois — desde que seja **dentro da mesma sessão**. O que muda é que a sessão deixou de ser considerada "para sempre": ela dura o que a sessão de acesso já durava antes disso (sem "lembrar de mim": até 12h de inatividade, ou até o navegador fechar, se o cookie de refresh não sobreviver a isso; com "lembrar de mim": até 30 dias). "Construir contexto" (razão de A11) continua valendo enquanto a pessoa está ativa — só não vale mais depois que ela foi embora de verdade.

**Por que "inatividade" não ganhou um relógio próprio.** A primeira ideia foi um temporizador só para isto, independente da sessão. Não faz sentido: a sessão já tem sua própria régua de tempo (o token de refresh), e destruir a conversa antes da sessão acabar seria apagar algo que a pessoa ainda pode estar usando, só porque ficou uma tela parada por alguns minutos lendo ou pensando. "Inatividade", aqui, é o próprio motivo pelo qual a sessão expira sozinha — não uma segunda régua.

**Por que "fechar o navegador" ficou de fora, por enquanto.** Foi cogitado detectar o fechamento da aba (`pagehide`) e apagar ali. Esbarra numa limitação real do navegador: não existe como distinguir "fechei a aba" de "apertei F5" nesse evento — as duas coisas disparam o mesmo sinal. Implementar isso apagaria a conversa toda vez que a pessoa recarregasse a página no meio de uma pergunta, o que é pior que o problema que a regra tenta resolver. Sem "lembrar de mim" marcado, fechar o navegador de qualquer forma já esvazia o cookie de sessão sozinho — a conversa só continua guardada até a sessão expirar por tempo (IA-CONV-012), não indefinidamente.

**Por que o logout precisou de um ajuste separado.** O botão "Sair da conta" (em `empresas.html`, `projetos.html` e `visao_do_projeto.html`) só trocava de página — nunca chamava `POST /auth/logout`, então a sessão nunca era revogada no servidor. Sem esse ajuste, IA-CONV-012 nunca disparava pelo caminho do logout explícito, só pelo de expiração. Corrigido junto: o botão agora chama o logout de verdade antes de sair da página.

### 1.4 Custo — `IA-CUSTO`

| ID | Regra | Fonte |
|---|---|---|
| IA-CUSTO-001 | Toda pergunta consome crédito. Não há uso gratuito ilimitado. | Modelo de negócio da plataforma |
| IA-CUSTO-002 | Sem saldo, a pergunta é recusada **antes** de chamar o provedor — com `402` e explicação. Nunca se gasta chamada que não será cobrável. | Decisão A15 |
| IA-CUSTO-003 | Falha do provedor (`503`) **não consome crédito**. Cobrar por resposta que não veio é cobrar por nada. | Decisão A15 |
| IA-CUSTO-004 | O limite de tamanho da pergunta e do contexto é do servidor, não da tela. Uma pergunta enorme é recusada com `400`, não enviada e cobrada. | Decisão A12 |

### 1.5 Abrir/fechar o painel — `IA-CONV-PAINEL`

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-PAINEL-001 | O painel pode ser recolhido (320px → 80px) por um gatilho no canto superior. Recolher não fecha a conversa nem perde o que foi digitado. | Interface existente |
| IA-CONV-PAINEL-002 | Aberto ou recolhido é **preferência da pessoa, não da tela**. Navegar de uma página com o painel para outra que também tem painel preserva o estado — se estava aberto, chega aberto; se estava recolhido, chega recolhido. | Decisão A18 |
| IA-CONV-PAINEL-003 | Sem preferência salva (primeira visita), cada tela usa o padrão do Figma para aquela tela — hoje `visao_do_projeto.html`, `matriz_csd.html` e `pesquisa.html` abrem com o painel aberto; `atividade.html` e `Sobre_a_empresa.html` abrem recolhidas. | Interface existente |
| IA-CONV-PAINEL-004 | A preferência é salva no navegador (`localStorage`), não no servidor. Trocar de máquina ou de navegador volta ao padrão de cada tela (IA-CONV-PAINEL-003) — diferente da conversa em si (IA-CONV-002), que é do servidor. | Decisão A18 |

**Por que a preferência é da pessoa, não da tela (IA-CONV-PAINEL-002).** Antes, cada página decidia sozinha se abria com o painel aberto ou recolhido, e cada navegação reiniciava essa decisão — quem fechava o assistente numa tela via ele reabrir na próxima, mesmo sem ter pedido. Isso lê como o painel ignorando a pessoa. Guardar a preferência (aberto/fechado) e aplicá-la em qualquer tela que tenha o painel resolve isso sem exigir uma tela de configuração.

**Por que fica no navegador e não no servidor (IA-CONV-PAINEL-004).** É preferência de interface, não dado do projeto — não precisa seguir a pessoa entre máquinas, e gravá-la no servidor custaria uma rota só para isto. Simetricamente ao inverso: por não ser dado do projeto, não teria por que reaproveitar a persistência da conversa (IA-CONV-002/003).

### 1.6 A narração da investigação — `IA-CONV-NARRA`

Pedido do Ricardo, 13/09/2026: o feedback da pesquisa deve aparecer **como texto dentro do assistente**, contando a etapa que está sendo realizada — como faz o Manus. Hoje ele vive em `#iaAviso`, uma linha no rodapé do compositor: "Pesquisando… 8s" e nada mais, por ~10 s (`planejamento-pesquisa-v2.md` L7).

O painel já está na página certa: `board.html` carrega o **mesmo `js/ia.js`** e a **mesma conversa do projeto** (`BOARD-IA-002`). O que estas regras definem é com que direito a investigação escreve nela — e, principalmente, o que ela **não** vira ao escrever.

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-NARRA-001 | A investigação do board **narra dentro da thread do assistente** (`#iaThread`), não no rodapé do compositor. Cada etapa concluída acrescenta uma linha à entrada da investigação em curso. | Instrução do Ricardo, 13/09/2026 |
| IA-CONV-NARRA-002 | A narração é uma **entrada de tipo próprio**, não uma mensagem da conversa: lista separada na memória, persistência própria (`004`), fora do contexto do modelo (`003`). ~~Ela ocupa o mesmo lugar visual, e é a única coisa que compartilha com as mensagens.~~ **Revista em 16/09/2026:** ela compartilha mais do que o lugar — veste a **formatação comum da conversa** e entra na **sequência cronológica** (`009`). O que continua separado é o que importa: de onde ela vem, onde ela é gravada e para onde ela não vai. | Decidido 13/09/2026 com o Ricardo · revista 16/09/2026 |
| IA-CONV-NARRA-009 | **A narração entra na sequência da conversa, pela hora em que aconteceu.** Um contador único carimba cada item — mensagem ou narração — quando ele entra na tela, e o desenho é uma fila só, ordenada por ele. As duas listas continuam separadas: o que se junta é o desenho. Sem isto, todas as mensagens eram desenhadas e depois todas as narrações, e **uma investigação de ontem aparecia depois de uma pergunta feita agora** — a pessoa mandava uma mensagem e a narração pulava para baixo dela. Contador, e não data: a mensagem otimista ainda não tem data, e a narração marca o tempo em outro relógio; a única pergunta que importa aqui é o que veio antes do quê. | Achado em uso pelo Ricardo · corrigido 16/09/2026 |
| IA-CONV-NARRA-010 | **Dentro da conversa, escolha é link sublinhado — nunca botão sólido.** Vale para as saídas da narração e para confirmar/descartar uma ação proposta. Um botão sólido no meio do texto é um objeto atravessado na leitura; a conversa é texto, e a ação nasce dele. As classes vêm do sistema de design (`.link`, `.link--sublinhado`, e `.link--apoio` na opção de recusa), documentadas em `styleguide.html`. O elemento continua sendo `<button>`: o clique acontece ali, e um `<a>` sem `href` não é link para leitor de tela nenhum. | Decisão do Ricardo, 16/09/2026 |
| IA-CONV-NARRA-003 | **Narração nunca entra no contexto** enviado ao modelo. `IA-CONV-004` manda o histórico das últimas trocas; passo de investigação fica fora dele, sempre. Sem esta regra, toda pergunta seguinte pagaria tokens para carregar "buscando 2 de 4" e o modelo teria que adivinhar quem disse aquilo. | Decorre de IA-CONV-004 |
| IA-CONV-NARRA-004 | A narração tem **persistência própria** — `passos[]` da investigação (`planejamento-pesquisa-v2.md` §3.1), não `ia_mensagens`. Recarregar a página no meio remonta a narração do banco e reconecta ao que está correndo, em vez de perder uma investigação já paga. | Decorre de IA-CONV-NARRA-002 |
| IA-CONV-NARRA-005 | Cada passo é emitido **depois de acontecer**, e o texto dele vem do **servidor**, de um vocabulário fechado — nunca do modelo. Narração é relato do que o sistema fez; deixá-la ser escrita por quem está sendo observado é abrir a porta para a investigação contar uma história melhor do que a que aconteceu. | Decorre de IA-ACAO-009 |
| IA-CONV-NARRA-006 | **Não existe barra de progresso nem percentual.** Etapa concluída é verdade; "68%" seria invenção, porque não se sabe quanto falta. Tempo correndo pode, porque é fato. | Decidido 13/09/2026; já era o critério de `js/pesquisa.js` |
| IA-CONV-NARRA-007 | Falha de etapa **é narrada como falha**, na mesma entrada, e a investigação não fica em silêncio nem finge ter terminado. `IA-CONV-011` vale aqui inteira: erro é erro, e não vira resultado. | Decorre de IA-CONV-011 |
| IA-CONV-NARRA-008 | A narração é **privada de quem pediu**, como a conversa (`IA-CONV-003`). Outra pessoa com o mesmo board aberto vê o **quadro** que a investigação gerou — ele é da tarefa — e não vê a narração. | Decorre de IA-CONV-003 |

**O que "tipo próprio" nunca quis dizer (IA-CONV-NARRA-002, revista).** A regra nasceu para proteger três coisas: a narração vem do servidor e não do modelo (`005`), é gravada em `passos[]` e não em `ia_mensagens` (`004`), e nunca volta ao modelo como contexto (`003`). Nada disso é aparência. Mas a frase "é a única coisa que compartilha com as mensagens" foi lida como licença para a narração **parecer** outra coisa — um cartão branco com sombra, dentro de uma thread que não tem cartões —, e o resultado era uma caixa flutuando no meio de uma conversa. Hoje ela veste a formatação comum. A separação que a regra existe para garantir é de **procedência e destino**, não de estilo.

**O bug de ordenação, que só aparece com conversa de verdade (IA-CONV-NARRA-009).** Duas listas, um `innerHTML`: desenhar a primeira inteira e depois a segunda funciona perfeitamente enquanto só existe uma delas. Com as duas, a narração fica **sempre grudada no fim** — a pessoa faz uma pergunta, a resposta chega, e a investigação de ontem reaparece embaixo de tudo, como se tivesse acabado de acontecer. O conserto não foi juntar as listas (isso violaria `002`): foi carimbar a ordem de entrada e ordenar só no desenho.

**Por que link e não botão (IA-CONV-NARRA-010).** O padrão do produto é botão sólido para ação — e é o certo em painel, modal e formulário, onde a ação é o assunto da tela. Na conversa, não: o assunto é o texto, e cada botão sólido no meio dele é um objeto que interrompe a leitura para anunciar-se. Link sublinhado carrega a mesma ação com o peso visual de uma palavra. O componente foi acrescentado ao sistema de design em vez de resolvido localmente, porque a conversa não é a única superfície onde isso vai aparecer.

### 1.x O painel com dois interlocutores — `IA-CONV-CADERNO`

| ID | Regra | Fonte |
|---|---|---|
| IA-CONV-CADERNO-001 | O compositor do assistente pode falar com **duas coisas diferentes**: o assistente do projeto, que lê o conhecimento interno da empresa, e o **caderno** de uma investigação, que só lê as fontes daquela busca. Qual dos dois recebe a pergunta é decidido por **gesto da pessoa**, nunca por adivinhação sobre o texto digitado. | Fase 3a, 14/09/2026 |
| IA-CONV-CADERNO-002 | O modo caderno é **visível enquanto durar** e sai com um clique. Um modo que muda o destino da pergunta e não aparece na tela é o tipo de coisa que só se descobre por uma resposta estranha. | Decorre de 001 |
| IA-CONV-CADERNO-003 | A conversa do caderno **não entra no contexto** enviado ao modelo nas perguntas ao assistente, e vice-versa. Persistência própria, mesma construção de `IA-CONV-NARRA-003`. Sem isto, um achado da web volta depois como coisa que a empresa sabe (`IA-GERAL-005`). | Decorre de IA-GERAL-005 |
| IA-CONV-CADERNO-004 | A resposta do caderno **se identifica** na tela como vinda das fontes de uma investigação. Quem rolar a conversa depois precisa saber que aquela frase não veio do conhecimento validado da empresa. | Decorre de 003 |

**Como ficou, na prática (14/09/2026).** A narração é uma lista `narracoes` em `js/ia.js`, separada de `mensagens`. Só `mensagens` é persistida e relida pelo servidor para montar o contexto; `narracoes` não é enviada a lugar nenhum e morre com a aba. `IA-CONV-NARRA-003` deixou de depender de alguém lembrar dela: para violá-la seria preciso mover a narração para dentro de `mensagens`, que é uma mudança visível em revisão — e não um esquecimento. `ferramentas/provar-fase0.mjs` confere isso com DOM real: roda uma investigação, faz uma pergunta ao assistente em seguida, e verifica que nenhuma linha da narração foi no corpo do `POST`.

Ela vive numa lista e não em DOM anexado por fora porque `desenhar()` reescreve o `innerHTML` inteiro da thread a cada mudança — narração pendurada por fora sumiria na primeira resposta do assistente. O que se paga por isso é um redesenho a cada passo; o que se ganha é a impossibilidade estrutural do vazamento.

**O que ficou de fora da Fase 0.** Os passos internos da busca. A rota de hoje é uma chamada só: não há etapa concluída para relatar enquanto ela corre, e inventar "buscando 2 de 4" seria exatamente a promessa que `IA-CONV-NARRA-005` proíbe. O que a narração conta hoje são fatos: como a tarefa foi lida, quantas fontes voltaram, quantos quadros entraram no board — e o tempo correndo no meio, que é a única coisa verdadeira a mostrar durante a espera.

**O painel atende a dois interlocutores, e diz qual dos dois está falando (`IA-CONV-CADERNO`).** Desde 14/09/2026 o mesmo compositor pode perguntar ao assistente do projeto **ou** às fontes de uma investigação. São coisas opostas: o assistente lê o conhecimento interno da empresa; o caderno tem um material fechado e não pode sair dele. A pergunta digitada é indistinguível — *"e quantas lojas eles têm?"* serve às duas —, então quem escolhe é a pessoa, por gesto, e o modo fica **visível** enquanto durar. Um roteador que adivinhasse erraria em silêncio, e ninguém teria como saber qual dos dois respondeu.

A separação de contexto é a mesma de `IA-CONV-NARRA-003`, pelo mesmo motivo estrutural: a conversa do caderno tem persistência própria (`pesquisa_perguntas`) e não entra no histórico que vai ao modelo nas perguntas ao assistente. Se entrasse, um achado da web — que só vale com a fonte colada — voltaria depois como coisa que a empresa sabe, contra `IA-GERAL-005`. E a resposta do caderno se identifica na tela, para quem rolar a conversa amanhã saber que aquela frase não veio do conhecimento da empresa. As regras deste caderno vivem em `board-lista.md` (`BOARD-PESQUISA-047` a `052`), porque é da investigação que elas tratam; aqui fica o que muda no **painel**.

**Por que IA-CONV-NARRA-003 é a regra que sustenta as outras.** É tentador implementar a narração como mensagens: a thread já sabe desenhar mensagem, já rola sozinha, já persiste. Custaria pouco e quebraria três regras de uma vez — `IA-CONV-004` (o histórico iria ao modelo cheio de ruído de máquina), `IA-CONV-005` (a conversa não é fonte de verdade, e um passo de investigação parece muito com um fato) e `IA-CUSTO` (tokens pagos por linha que ninguém queria no contexto). Separar o tipo é mais trabalho uma vez; misturar é um vazamento que aparece meses depois, como resposta estranha do assistente que ninguém consegue explicar.

**Por que o texto do passo não vem do modelo (IA-CONV-NARRA-005).** O mesmo raciocínio de `IA-GARANT-003`: o que é determinístico não se pede a um modelo. O servidor sabe quantas buscas saíram e quantas páginas foram lidas — é contagem, não redação. Deixar o modelo narrar acrescentaria custo, latência e a chance de a narração divergir do que a razão vai cobrar.

**O que isto não é.** Não é um segundo assistente, nem uma segunda conversa. É a investigação ganhando voz no painel que já existe — e é por isso que a pergunta de acompanhamento (o "perguntar ao caderno" da Fase 3 do plano) não vai precisar de superfície nova: ela é uma mensagem normal, logo abaixo da narração que a motivou.


---

---

## 2. Contrato da API

### `GET /empresas/:empresaId/projetos/:projetoId/ia/conversa`

Devolve `{ mensagens: [...] }` — o histórico de quem pediu, naquele projeto. Lista vazia é resposta válida e significa conversa nova.

### `POST /empresas/:empresaId/projetos/:projetoId/ia/perguntas`

Contrato completo em [`ia-assistente-isolamento.md`](ia-assistente-isolamento.md) §2.

Cada mensagem traz `id`, `autor` (`pessoa` ou `assistente`), `texto`, `criado_em` e, nas do assistente, `fontes` e `sem_verdade_validada`.

---

## 3. Modelo de dados

```
ia_conversas
  id            uuid (pk)
  projeto_id    uuid (not null, fk → projetos.id, cascade)
  usuario_id    uuid (not null, fk → users.id)
  criado_em     timestamp (not null, default now())
  atualizado_em timestamp (not null)

  único (projeto_id, usuario_id)   -- uma conversa por pessoa por projeto

ia_mensagens
  id            uuid (pk)
  conversa_id   uuid (not null, fk → ia_conversas.id, cascade)
  autor         enum AutorMensagem  ('pessoa' | 'assistente')
  texto         text (not null)
  fontes        jsonb (null)        -- [{ideia_id, categoria}], só do assistente
  criado_em     timestamp (not null, default now())

  índice (conversa_id, criado_em)
```

`fontes` guarda a procedência **como foi verificada** no momento da resposta (IA-GARANT-003). Se a idéia sair de `Finalizado` depois, a mensagem antiga continua registrando o que valia quando foi dita — reescrever o passado apagaria a única evidência de que a regra foi aplicada.

Sem coluna de custo por mensagem: o consumo pertence ao módulo de créditos, ainda não modelado (decisão D2).

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| A10 | A conversa é por pessoa ou compartilhada? | **Por pessoa, dentro de cada projeto.** Ela expõe o que alguém ainda não sabe, e o especialista é de fora. Conversa de equipe, se um dia existir, nasce como recurso próprio. | 25/08/2026 |
| A11 | A conversa persiste? | **Sim.** Um assistente que esquece tudo a cada recarga não constrói contexto — e construir contexto é a missão da plataforma. | 25/08/2026 |
| A12 | Quanto histórico entra no contexto? | **As últimas trocas**, com teto no servidor. Mandar tudo cresce custo sem limite e empurra o contexto do quadro para fora da janela. Número exato é ajuste de implementação. | 25/08/2026 |
| A13 | Anexos no compositor? | **Não nesta versão.** O botão sai. Botão que não faz nada é pior que ausência de botão. | 25/08/2026 |
| A14 | Como sinalizar o tempo de resposta? | **Estado "pensando" visível** e envio bloqueado durante a espera. Segundos de silêncio se leem como travamento. | 25/08/2026 |
| A15 | Quando cobrar? | **Verifica saldo antes de chamar o provedor**; falha do provedor não consome. Cobrar por resposta que não veio é cobrar por nada. | 25/08/2026 |
| A16 | A conversa apagada dura para sempre (A11) ou só enquanto a sessão dura? | **Só enquanto a sessão dura.** Apaga no logout explícito e na expiração/inatividade detectada da sessão (IA-CONV-012/013), em todos os projetos da pessoa. Não muda A11 dentro da sessão — muda o que acontece quando ela termina. "Fechar o navegador" como gatilho próprio ficou de fora: não há como o navegador distinguir isso de um F5 no meio da conversa. | 27/08/2026 |
| A17 | `atividade.html` ganha uma conversa própria por idéia/atividade, ou reaproveita a do projeto? | **Reaproveita a do projeto.** `IA-CONV-001` já define a conversa pelo par (projeto, pessoa) — `atividade.html` sempre vive dentro de um projeto (`empresa`/`projeto` na URL), então é a mesma conversa de `visao_do_projeto.html`, sem estado novo nem rota nova. | 29/08/2026 |
| A18 | O painel aberto/recolhido é por tela ou por pessoa? | **Por pessoa.** O estado viaja com quem navega, salvo no navegador (`localStorage`, não no servidor — é preferência de interface, não dado do projeto). Sem preferência salva, cada tela cai no seu próprio padrão de Figma. | 29/08/2026 |
| A19 | `board.html` (quadro de uma tarefa) ganha conversa própria por tarefa? | **Não** — mesma resposta e mesmo motivo de A17: `IA-CONV-001` define a conversa pelo par (projeto, pessoa), e abrir o quadro de uma tarefa não muda de projeto. | 29/08/2026 |

---

## 5. Pendências abertas

| Item | Situação |
|---|---|
| **Créditos — decisão D2** | Aberta desde o módulo de empresas: crédito por usuário ou por empresa. O assistente é a **primeira funcionalidade que gasta dinheiro de verdade**, então ela deixa de ser teórica. E ativa o risco já registrado em `empresas-listagem.md` §5: criar empresa é ilimitado hoje, então "crédito por empresa" transformaria cada empresa nova em cota nova de IA grátis. **Bloqueia a publicação**, não o desenvolvimento. |
| Preço por pergunta | Quanto uma pergunta custa ao Ricardo e quanto é repassado. Depende do provedor escolhido (`ia-assistente-isolamento.md` §4). |
| Apagar a conversa manualmente | IA-CONV-012 apaga sozinha quando a sessão termina, mas não há um botão para a própria pessoa limpar o histórico durante uma sessão ativa. Provável requisito, principalmente por privacidade. Fora do escopo desta versão. |
| Testes automatizados de IA-CONV-012/013 | A apagada mexe direto no banco (`POST /auth/logout`, `GET /auth/sessao`) — este projeto não tem hoje um jeito de testar rota contra banco de verdade (os testes existentes são todos de função pura, sem `db`). Verificado manualmente; fica pendente automatizar quando existir esse tipo de teste no projeto. |
| Exportar a conversa | O pacote final para a IA (missão da plataforma) poderia incluir as conversas. Não decidido. |
| Streaming da resposta | Resposta chega inteira, de uma vez. Streaming melhora a percepção de velocidade, mas complica a verificação de procedência — que só pode rodar sobre a resposta completa. Revisitar depois. |

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.8.0 | 2026-09-16 | **A narração passou a ser lida como parte da conversa.** `IA-CONV-NARRA-002` revista: ela continua sendo entrada de tipo próprio no que importa — procedência, persistência e ausência do contexto do modelo —, mas veste a formatação comum da conversa; o cartão branco com sombra numa thread sem cartões era uma caixa flutuando no meio do texto. Nova `009`: a narração entra na **sequência cronológica**, por um contador único carimbado na entrada e ordenado só no desenho (as duas listas continuam separadas). Corrige, achado em uso, a narração de ontem reaparecendo embaixo de uma pergunta feita agora. Nova `010`: dentro da conversa, escolha é **link sublinhado**, nunca botão sólido — vale para as saídas da narração e para confirmar/descartar ação proposta; componente acrescentado ao sistema de design (`.link`, `.link--sublinhado`, `.link--apoio`) e documentado em `styleguide.html`. |
| 1.7.0 | 2026-09-14 | **O painel passou a atender dois interlocutores** (`IA-CONV-CADERNO`, Fase 3a). O mesmo compositor pergunta ao assistente do projeto ou às fontes de uma investigação; o modo é ligado por gesto, fica visível enquanto durar e sai com um clique. A conversa do caderno **não entra** no contexto do assistente — persistência própria, mesma lógica de `IA-CONV-NARRA-003` — e a resposta se identifica na tela como vinda das fontes. Regras da investigação em `board-lista.md` `BOARD-PESQUISA-047` a `052`; prova em `ferramentas/provar-fase3a.mjs`, que confere o **corpo** da requisição ao assistente depois de uma conversa com o caderno. |
| 1.6.0 | 2026-09-14 | `IA-CONV-NARRA` **construída** na Fase 0, menos as etapas internas da busca. `js/ia.js` ganhou uma lista `narracoes` separada de `mensagens` e a porta `window.IaNarracao` (`abrir`/`passo`/`fechar`/`retomar`/`remover`), usada por `js/pesquisa.js`. A separação faz `IA-CONV-NARRA-003` valer por construção: para a narração chegar ao modelo seria preciso movê-la para `mensagens`, mudança visível em revisão. É também onde vivem os botões de `BOARD-PESQUISA-012` — um toast não segura botão. Verificado com DOM real (`ferramentas/provar-fase0.mjs`), incluindo a prova de que uma pergunta feita logo depois de uma investigação não leva nada da narração no corpo. |
| 1.5.0 | 2026-09-13 | Registrada `IA-CONV-NARRA` (8 regras): a investigação do board passa a narrar **dentro da thread do assistente**, a pedido do Ricardo, no lugar da linha morta de `#iaAviso` (limite L7 do `planejamento-pesquisa-v2.md`). A decisão que carrega o resto é `IA-CONV-NARRA-003` — narração **não é mensagem** e **nunca entra no contexto** de `IA-CONV-004`; tem persistência própria (`passos[]`), texto vindo do servidor e não do modelo, e sobrevive a um F5. Regras **planejadas, não construídas**. |
| 1.4.0 | 2026-08-29 | `board.html` (nova tela — ver [`board-lista.md`](../atividades/board-lista.md)) entra como terceira página com o painel: `js/ia.js` incluído, ids `iaThread`/`iaAviso`/`iaEnviar` na marcação, CSS `.ia-*` copiado, e `js/board.js` define `window.EmpresaAtual`/`ProjetoAtual` antes de chamar `IaAssistente.carregar()`. A conversa de exemplo falsa que ainda existia ali (a mesma de `IA-CONV-006`) foi removida. Decisão A19: nenhuma dimensão nova de conversa por tarefa. `IA-CONV-PAINEL-003` passa a valer também para esta tela, que já vinha com a persistência de aberto/fechado desde a v1.3.0. |
| 1.3.0 | 2026-08-29 | Nova seção `IA-CONV-PAINEL` (§1.5), decisão A18: o estado aberto/recolhido do painel passou a ser salvo em `localStorage` (chave `pd:assistente:aberto`) e aplicado em toda tela que tem o painel — `visao_do_projeto.html`, `atividade.html`, `matriz_csd.html`, `pesquisa.html` e `Sobre_a_empresa.html` — em vez de cada navegação reiniciar para o padrão daquela tela. Sem preferência salva, o padrão de cada tela continua o do Figma (IA-CONV-PAINEL-003). "Estado atual da interface" corrigido: descrevia o painel como não funcional, desatualizado desde a v1.1.0/`atividade-lista.md` v1.4.0. Verificado ao vivo: fechar o painel em `visao_do_projeto.html` e navegar para `matriz_csd.html` (que abre aberto por padrão) chega recolhido; abrir em `matriz_csd.html` e navegar para `atividade.html` (que abre recolhido por padrão) chega aberto. |
| 1.2.0 | 2026-08-29 | `atividade.html` religada ao mesmo assistente de `visao_do_projeto.html` (Decisão A17): script `js/ia.js` incluído nessa página, ids `iaThread`/`iaAviso`/`iaEnviar` adicionados à marcação do painel (que tinha conversa fixa de exemplo, removida por IA-CONV-006), CSS `.ia-*` copiado, e `js/atividade.js` passou a definir `window.EmpresaAtual`/`window.ProjetoAtual` e chamar `IaAssistente.carregar()` — mesma sequência de `js/ideias.js`. Verificado ao vivo em ambas as páginas: mesma conversa, recarregar preserva o histórico. Ver `Regras_de_negocio/modulos/atividades/atividade-lista.md` v1.4.0. |
| 1.1.0 | 2026-08-27 | Nova §1.3 "Fim da conversa" (IA-CONV-012/013, decisão A16): a conversa é apagada — em todos os projetos da pessoa — no logout explícito ou quando a sessão expira por tempo/inatividade, detectado no próximo acesso. Não contradiz A11: a persistência continua valendo dentro da sessão. "Fechar o navegador" como gatilho próprio ficou de fora (não dá para distinguir de um F5). Corrigido junto: o botão "Sair da conta" agora chama `POST /auth/logout` de verdade (antes só trocava de página, sem revogar a sessão no servidor). §1.4 "Custo" renumerada de §1.3. |
| 1.0.0 | 2026-08-25 | Documento criado. Conversa por pessoa e persistida (IA-CONV), estados obrigatórios incluindo "pensando", e regras de custo (IA-CUSTO). Modelo de dados de `ia_conversas` e `ia_mensagens`. Decisões A10 a A15. |
