# Regras de Negócio — Assistente de IA: a conversa

> **Versão:** 1.4.0 · **Status:** Implementado e verificado ao vivo
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
| 1.4.0 | 2026-08-29 | `board.html` (nova tela — ver [`board-lista.md`](../atividades/board-lista.md)) entra como terceira página com o painel: `js/ia.js` incluído, ids `iaThread`/`iaAviso`/`iaEnviar` na marcação, CSS `.ia-*` copiado, e `js/board.js` define `window.EmpresaAtual`/`ProjetoAtual` antes de chamar `IaAssistente.carregar()`. A conversa de exemplo falsa que ainda existia ali (a mesma de `IA-CONV-006`) foi removida. Decisão A19: nenhuma dimensão nova de conversa por tarefa. `IA-CONV-PAINEL-003` passa a valer também para esta tela, que já vinha com a persistência de aberto/fechado desde a v1.3.0. |
| 1.3.0 | 2026-08-29 | Nova seção `IA-CONV-PAINEL` (§1.5), decisão A18: o estado aberto/recolhido do painel passou a ser salvo em `localStorage` (chave `pd:assistente:aberto`) e aplicado em toda tela que tem o painel — `visao_do_projeto.html`, `atividade.html`, `matriz_csd.html`, `pesquisa.html` e `Sobre_a_empresa.html` — em vez de cada navegação reiniciar para o padrão daquela tela. Sem preferência salva, o padrão de cada tela continua o do Figma (IA-CONV-PAINEL-003). "Estado atual da interface" corrigido: descrevia o painel como não funcional, desatualizado desde a v1.1.0/`atividade-lista.md` v1.4.0. Verificado ao vivo: fechar o painel em `visao_do_projeto.html` e navegar para `matriz_csd.html` (que abre aberto por padrão) chega recolhido; abrir em `matriz_csd.html` e navegar para `atividade.html` (que abre recolhido por padrão) chega aberto.
| 1.2.0 | 2026-08-29 | `atividade.html` religada ao mesmo assistente de `visao_do_projeto.html` (Decisão A17): script `js/ia.js` incluído nessa página, ids `iaThread`/`iaAviso`/`iaEnviar` adicionados à marcação do painel (que tinha conversa fixa de exemplo, removida por IA-CONV-006), CSS `.ia-*` copiado, e `js/atividade.js` passou a definir `window.EmpresaAtual`/`window.ProjetoAtual` e chamar `IaAssistente.carregar()` — mesma sequência de `js/ideias.js`. Verificado ao vivo em ambas as páginas: mesma conversa, recarregar preserva o histórico. Ver `Regras_de_negocio/modulos/atividades/atividade-lista.md` v1.4.0.
| 1.1.0 | 2026-08-27 | Nova §1.3 "Fim da conversa" (IA-CONV-012/013, decisão A16): a conversa é apagada — em todos os projetos da pessoa — no logout explícito ou quando a sessão expira por tempo/inatividade, detectado no próximo acesso. Não contradiz A11: a persistência continua valendo dentro da sessão. "Fechar o navegador" como gatilho próprio ficou de fora (não dá para distinguir de um F5). Corrigido junto: o botão "Sair da conta" agora chama `POST /auth/logout` de verdade (antes só trocava de página, sem revogar a sessão no servidor). §1.4 "Custo" renumerada de §1.3. |
| 1.0.0 | 2026-08-25 | Documento criado. Conversa por pessoa e persistida (IA-CONV), estados obrigatórios incluindo "pensando", e regras de custo (IA-CUSTO). Modelo de dados de `ia_conversas` e `ia_mensagens`. Decisões A10 a A15. |
