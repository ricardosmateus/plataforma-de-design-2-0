# Planejamento — Módulo de Pesquisa (concorrentes)

> **Status:** Fase 1 construída e testada — falta escolher o provedor de busca
> **Criado:** 01/09/2026 · **Atualizado:** 02/09/2026
> **Substitui:** `INTEGRACAO-MANUS-MCP.md`, cujo plano partia de premissa errada
> (ver §2)

---

## 1. O que o usuário faz

O fluxo real, nas palavras dele, é um **aprofundamento progressivo**:

1. "Quem são meus concorrentes?"
2. "Quero saber mais sobre o **concorrente 01** — quantas unidades tem no
   Brasil, em que região?"
3. "Busque no Google Maps quantas unidades do **concorrente 02** tem aqui
   no meu bairro."
4. "Entre no LinkedIn dele." / "Entre no Instagram." / "Acesse o site X e
   veja qual é a principal reclamação que ele recebe."

Duas propriedades desse fluxo mandam na arquitetura inteira:

**A pergunta seguinte depende da anterior.** "Concorrente 01" só significa
alguma coisa porque uma resposta anterior produziu uma lista. Não é uma
sequência de consultas independentes — é uma investigação com estado
acumulado.

**Cada degrau custa uma ordem de grandeza a mais.** A primeira pergunta é
uma fração de centavo. A última é dólares. Tratar as duas pelo mesmo
caminho é caro no melhor caso e inviável no pior.

---

## 2. A premissa errada que este documento corrige

O plano anterior (`INTEGRACAO-MANUS-MCP.md`) assumia que o problema era
**escala de requisição**: uma conta do Manus atendendo muitos usuários,
resolvido com cache, fila e WebSocket.

Três erros, em camadas:

**O cache não serviria.** Cache por consulta só funciona quando a mesma
entrada devolve a mesma saída reaproveitável. Pesquisa de concorrente é
única por usuário — a taxa de acerto seria perto de zero.

**O gargalo não era requisição, era dinheiro.** O Manus cobra créditos por
tarefa, proporcionais à complexidade. Com uma conta principal, cada
pesquisa de cada usuário gasta o saldo da plataforma. Fila não cria
capacidade; ela só organiza a ordem em que o dinheiro acaba.

**E o Manus é a categoria errada de ferramenta.** É um produto para
usuário final: cobra por conta, autentica pessoas, e o recurso de
colaboração exige que cada colaborador tenha conta própria, processa
prompts simultâneos em sequência, e expõe a tarefa inteira a todos os
participantes — inviável entre clientes concorrentes.

A correção não é trocar de agente. É perceber que **a maior parte do que o
usuário pede não é trabalho de agente**.

---

## 3. Os quatro níveis

| Nível | Exemplo do usuário | O que resolve | Ordem de custo |
|---|---|---|---|
| **1 — Conhecimento** | "Quem são meus concorrentes?" | `src/ia/provedor.ts`, que já existe | fração de centavo |
| **2 — Busca com fontes** | "Quantas unidades no Brasil? Qual região?" | API de busca com citação | ~1–2 centavos de dólar |
| **3 — Dado estruturado** | "Quantas unidades no meu bairro" | **Google Places API** (Nearby Search) | ~3 centavos de dólar |
| **4 — Navegação dirigida** | "Entre no LinkedIn dele" | agente de navegação | dólares + risco de termos de uso |

### Por que o nível 3 não é agente

"Quantas unidades do concorrente tem no meu bairro" é exatamente a
**Nearby Search**: coordenada, raio e nome entram; lista estruturada com
endereços e avaliações sai. Contagem por região é campo de retorno, não
interpretação de texto.

Mandar um agente navegar o Google Maps para isso responderia em minutos em
vez de milissegundos, custaria de dez a cinquenta vezes mais, devolveria
texto para reinterpretar em vez de registro, quebraria a cada mudança de
layout — e contraria os termos do Google, que oferece a API justamente
para esse uso ser legítimo.

Preço na faixa de uso desta plataforma: **US$ 32 por 1.000 chamadas**, com
**US$ 200 de crédito mensal gratuito** — cerca de 6.250 buscas por mês sem
custo. O MVP inteiro cabe no gratuito.

### Por que o nível 4 fica fora da v1

LinkedIn e Instagram **proíbem acesso automatizado** nos termos de uso, e
o LinkedIn tem histórico de bloquear e litigar. Construir funcionalidade
paga em cima disso significa: pode parar de funcionar sem aviso, pode
render bloqueio de IP, pode virar exposição jurídica.

Não é risco técnico que se resolve com retry — é decisão de negócio, e
precisa ser tomada de propósito, não por inércia de implementação.

Para a v1, o nível 2 já cobre boa parte: página pública de empresa no
LinkedIn, perfil do Instagram e reclamações em sites do tipo Reclame Aqui
são indexados por buscadores. Menos profundidade, risco zero.

---

## 4. As regras da pesquisa

Mesmo formato de `DIN-*` e `SEG-PAG-*`: identificador estável, para poder
ser citada em código e em revisão.

| ID | Regra | Por quê |
|---|---|---|
| **PES-001** | O roteador classifica a pergunta num **catálogo fechado de níveis**, e todo o resto do código olha o nível — nunca o texto da pergunta. | É a mesma correção que `TipoTarefa` já registra no schema: rotear por texto solto é o defeito que `IDEIA-MOV-015` teve que consertar em outro lugar do produto. |
| **PES-002** | Dado estruturado vem de **API estruturada**. Localização, unidades e endereços saem da Places API, nunca de agente navegando o Maps. | Mais barato, mais rápido, mais confiável e dentro dos termos. Um agente aqui é engenharia cara para piorar o resultado. |
| **PES-003** | O custo **vem da resposta do provedor**, transação por transação. Sem preço conhecido: unidades gravadas, custo nulo. | É a lição de `fee_details` do Mercado Pago (Fase 4) e a regra que `ConsumoIa` já aplica: *"um palpite entraria na razão com cara de fato"*. |
| **PES-004** | A sessão guarda as **entidades descobertas** e de quem se está tratando. "Concorrente 01" **e "ele"** resolvem contra o registro, nunca contra o texto da resposta anterior. | Sem isso, o aprofundamento não existe — e reinterpretar texto anterior a cada pergunta erra em silêncio. O pronome entrou na regra em 02/09 (ver §12.1). |
| **PES-005** | Nenhuma fonte é acessada **contra os termos de uso dela**. | Funcionalidade que depende de raspagem proibida não é funcionalidade: é dívida com data de vencimento desconhecida. |
| **PES-006** | Toda afirmação carrega **fonte**. Sem fonte, não sai. | Pesquisa de concorrente sem procedência é chute com aparência de fato — e o usuário vai tomar decisão comercial em cima. |
| **PES-007** | Consulta cara mostra o **custo estimado antes** de disparar. | É o teto de gasto da Fase 6 aplicado aqui. Cem vezes de diferença entre níveis exige que o usuário saiba onde está pisando. |
| **PES-008** | **"Nada encontrado" e "a busca falhou" são telas diferentes**, com textos diferentes. | DIN-006, literalmente. Num saldo, o disfarce faz o dinheiro parecer sumido; numa pesquisa, faz o concorrente parecer inexistente. |
| **PES-009** | Cada provedor fica **atrás de uma interface**, escolhido por `.env`. | Mesmo desenho de `pagamentos/psp.ts` e `ia/provedor.ts`: *"a única peça que muda quando o provedor mudar"*. Nenhum provedor está decidido ainda (§8). |

---

## 5. Modelo de dados

### 5.1 A sessão e o que ela acumula

```
PesquisaSessao      — a linha de investigação
  usuarioId, empresaId, projetoId?, tarefaId?
  titulo             — "Concorrentes — rede de cafeterias"
  criadoEm, encerradoEm?

PesquisaConsulta    — cada pergunta feita
  sessaoId
  nivel              — enum fechado (PES-001)
  pergunta           — o texto do usuário, guardado como veio
  provedor           — qual driver atendeu
  resultado          — entregue | vazio | falhou   (PES-008)
  consumoId?         — aponta para o consumo que custou

PesquisaEntidade    — o que a investigação descobriu
  sessaoId
  tipo               — empresa | unidade | perfil | fonte
  nome, apelido      — "concorrente 01" mora aqui (PES-004)
  dados              — JSON: o que cada tipo carrega
  descobertaEm       — qual consulta trouxe

PesquisaFonte       — procedência (PES-006)
  consultaId
  url, titulo, trechoCitado
```

`PesquisaEntidade.apelido` é o que faz "concorrente 01" funcionar: o
roteador resolve a referência contra esta tabela antes de montar a
consulta seguinte.

### 5.2 O consumo

`ConsumoIa` já tem a forma certa para o dinheiro — `custoUsdMicros`,
`cotacaoMilesimos`, e custo/comissão/total separados por DIN-005. E já
resolve câmbio, que os dois provedores novos exigem por cobrarem em dólar.

O que não encaixa: `tokensEntrada`/`tokensSaida` são obrigatórios, e a
Places API não cobra por token — cobra por chamada.

**Decisão proposta:** tabela irmã `ConsumoPesquisa`, com as mesmas colunas
de dinheiro e colunas de unidade próprias (`chamadas`, `buscas`, tokens
quando houver). Mantém `ConsumoIa` intocado — que é caminho de dinheiro
funcionando, e mexer nele para acomodar um caso novo é risco sem retorno.

A alternativa — generalizar `ConsumoIa` com um campo `unidades` em JSON —
fica registrada para quando aparecer um terceiro consumidor. Com dois, o
custo da abstração não se paga.

Os lançamentos continuam em `creditos_lancamentos`, com a trava de
idempotência que já existe (`@@unique([tipo, origemId])`, DIN-004).
`OrigemLancamento` ganha `pesquisa`.

### 5.3 Onde isso aparece no produto

`TipoTarefa.pesquisa` já existe no schema, e o comentário dele antecipa
exatamente este módulo:

> *"um tipo pode, no futuro, disparar uma ferramenta externa que traz o
> conteúdo pronto em vez de abrir um quadro em branco"*

Uma tarefa do tipo `pesquisa` passa a abrir uma sessão de pesquisa em vez
de um quadro vazio. Não é tela nova — é a tela que já estava prevista.

---

## 6. O roteador

É o coração do módulo, e é ele o produto — não o provedor de busca.

```
pergunta do usuário
    ↓
resolve referências contra PesquisaEntidade      (PES-004)
    ↓  "concorrente 01" → "Cafeteria X Ltda"
classifica em nível 1..4                          (PES-001)
    ↓
nível 1 → src/ia/provedor.ts          (já existe)
nível 2 → provedor de busca            (a decidir, §8)
nível 3 → Places API
nível 4 → recusa educada na v1         (PES-005)
    ↓
grava consulta, fontes e entidades novas
    ↓
liquida o consumo com o custo real     (PES-003)
```

**O roteador em si custa.** Classificar com uma chamada de modelo a cada
pergunta adiciona custo e latência a *todas* elas, inclusive as baratas.
Duas saídas, e a escolha fica em aberto (§8): heurística barata primeiro,
com modelo só no caso ambíguo; ou classificação junto da própria resposta
do nível 1, aproveitando a chamada que já ia acontecer.

---

## 7. Encaixe nos créditos

Nada de novo — os trilhos existem desde a Fase 2:

```
usuário faz a pergunta
  → estima o custo do nível
  → PES-007: se for caro, mostra e pede confirmação
  → reservar()      (creditos/reserva.ts)
  → chama o provedor
  → lê o custo real da resposta          (PES-003)
  → consumir()      — custo e comissão separados (DIN-005)
  → falhou? liberar() e diz o que houve  (PES-008)
```

`OperacaoConsumo` em `reserva.ts` é uma união fechada
(`'assistente' | 'classificacao'`) e ganha `'pesquisa'`. `TipoConsumoIa`
idem.

Isso resolve de uma vez o problema que o plano anterior tentava resolver
com fila: **a demanda passa a ser financiada por quem a gera**. Ninguém
dispara cem pesquisas caras quando cada uma sai do próprio saldo — e a
capacidade escala com a chave de API, não com uma conta compartilhada.

---

## 8. Pendências abertas

| Item | Situação |
|---|---|
| **Qual provedor de busca** (nível 2) | Perplexity Sonar é o candidato — API de verdade, cobrança por requisição, custo real no campo `usage` da resposta, que é o que PES-003 exige. **Não decidido:** testar com as perguntas reais do §1 antes de fechar. Mesma disciplina do C3 (escolha do PSP). |
| **Custo do roteador** | Classificar cada pergunta com uma chamada de modelo encarece até a pergunta barata. Decidir entre heurística-primeiro e classificação embutida na resposta do nível 1. |
| **Preço em créditos por nível** | Precisa da conta com câmbio e comissão. `dinheiro.ts` já faz câmbio; falta a tabela de preço por nível. Sem ela, ou a pergunta rasa fica cara demais ou a profunda sai subsidiada. |
| **Nível 4 — LinkedIn, Instagram e sites específicos** | **Decisão de negócio, não de engenharia.** Envolve termos de uso de terceiros e apetite a risco. A recomendação técnica é ficar fora da v1 e reabrir com dados de uso real sobre quanto disso as pessoas de fato pedem. |
| **Teto por sessão** | Uma investigação profunda pode encadear dezenas de consultas. Falta definir teto padrão e o que acontece ao atingi-lo — travar, avisar, ou pedir confirmação. |
| **Retenção do resultado** | Quanto tempo a sessão e as fontes ficam guardadas? Fonte citada hoje pode sair do ar amanhã; guardar o trecho citado (não só a URL) é o que mantém a resposta auditável. |
| **Places API — chave e cota** | Chave própria, com alerta antes de estourar os US$ 200 gratuitos. `SEG-PAG-004` vale aqui igual: chave no `.env`, nunca no repositório. |

---

## 9. Arquivos previstos

Mesmo padrão do resto do projeto: função pura separada do que toca banco e
rede, para poder ser testada sem nenhum dos dois.

| Arquivo | O que é |
|---|---|
| `api/src/pesquisa/roteador.ts` | **Puro.** Pergunta + entidades conhecidas → nível e consulta montada |
| `api/src/pesquisa/provedor.ts` | A interface trocável (PES-009) |
| `api/src/pesquisa/provedor-sonar.ts` | Nível 2 — busca com fontes |
| `api/src/pesquisa/provedor-lugares.ts` | Nível 3 — Places API |
| `api/src/pesquisa/sessao.ts` | Sessão, consultas e fontes; sempre em transação |
| `api/src/pesquisa/entidades.ts` | Descoberta e resolução de apelido (PES-004) |
| `api/src/rotas/pesquisa.ts` | Abrir sessão, perguntar, listar |
| `js/pesquisa.js` | A tela da sessão, o custo antes de disparar, as fontes |

### Testes

| Teste | Tipo |
|---|---|
| `testes/roteador.test.ts` | Puro — cada exemplo do §1 cai no nível certo; referência resolve; ambíguo não vira nível caro por acidente |
| `testes/pesquisa-integracao.test.ts` | **Banco real** — reserva liberada quando o provedor falha; consulta repetida não cobra duas vezes; entidade descoberta fica disponível para a pergunta seguinte |

---

## 9.1 O que existe hoje (02/09/2026)

| Arquivo | Situação |
|---|---|
| `api/src/pesquisa/roteador.ts` | ✅ puro — 20 testes |
| `api/src/pesquisa/entidades.ts` | ✅ puro — 14 testes |
| `api/src/pesquisa/sessao.ts` | ✅ puro — 18 testes |
| `api/src/pesquisa/provedor.ts` | ✅ contrato + driver `none` |
| `api/src/rotas/pesquisa.ts` | ✅ 5 rotas — 11 testes de integração |
| `prisma` — 5 modelos, 3 enums, migração | ✅ aplicada em produção e teste |
| `board.html` — aba e painel | ✅ |
| `js/pesquisa.js` | ✅ |
| Provedor de busca de verdade | ❌ **decisão pendente (§8)** |

O que NÃO existe, e é o que falta para o módulo servir: qualquer
provedor. Tudo responde `none` — que recusa com o motivo na tela em vez
de fingir.

**O que já funciona sem provedor:** a rota `planejar` roteia a pergunta,
resolve "concorrente 01" e "ele", e devolve o nível — sem gastar nada.
É a camada inteira de decisão, demonstrável hoje.

---

## 10. Fases

**Fase 1 — Níveis 1 e 2, com sessão**
Roteador, sessão com estado, provedor de busca, créditos ligados. Já
responde às perguntas 1 e 2 do §1, que são a maioria do uso.

**Fase 2 — Nível 3**
Places API. Responde "quantas unidades no meu bairro" com dado
estruturado. Cabe no crédito gratuito do Google.

**Fase 3 — A investigação como entregável**
Relatório da sessão, exportação, sugestão de próximo aprofundamento. É o
que transforma consultas soltas em produto.

**Fase 4 — Condicional: nível 4**
Só depois de decisão explícita sobre termos de uso (§8) e com evidência de
demanda real.

---

## 11. O que fazer a seguir

1. **Testar o provedor de busca com as perguntas reais do §1** antes de
   escolher — é barato e evita fechar contrato com quem responde mal a
   este caso de uso. É o único bloqueador do módulo hoje.
2. **Decidir o desenho do roteador** (heurística ou classificação
   embutida), porque ele define o custo-piso de toda pergunta. A
   heurística atual marca `decidido: false` quando não sabe, então a
   decisão pode ser adiada sem risco — só não indefinidamente.
3. **Fechar o preço por nível**, com câmbio e comissão.
4. **Resolver a tensão do nível `conhecimento`** (§12.3).

Nada disso depende do nível 4, e nenhum é bloqueado por decisão jurídica.

---

## 12. Registro de construção (02/09/2026)

### 12.1 O pronome — PES-004 quase nasceu incompleta

O roteador resolvia "concorrente 01" e nada mais. Um teste escrito a
partir das falas reais do §1 mostrou o buraco: quatro das perguntas do
usuário usam **pronome** — "quantas unidades **ele** tem", "entre no
linkedin **dele**" — e repetir o apelido é a exceção, não a regra.

Sem resolver isso, a consulta chegaria ao provedor como *"quantas
unidades ele tem no Brasil"*, sem antecedente. O modo de falha não é
quebrar: é **voltar uma resposta convincente sobre outra empresa**.

Um teste que só checasse o nível teria passado — "quantas" já
classificava como busca. O nível estava certo e a consulta estava
quebrada.

A correção trouxe o conceito de **foco** (`PesquisaSessao.focoId`): o
pronome resolve contra quem está em pauta, não contra a lista de
conhecidos. Com três concorrentes, "ele" não é dedutível de quem existe,
só de quem estava sendo tratado. Sem foco, o pronome vira referência
não resolvida — que é uma pergunta a fazer, não um chute.

### 12.2 Onde a pesquisa aparece — e onde ela não pode aparecer

A tela é o `board.html`, e ele tem uma regra que decidiu o desenho:
`lerDaTela()` serializa `#canvasStage` e o PUT **grava o que está na
tela** (BOARD-SALVA-002). Resultado de pesquisa chega assíncrono.

Desenhar resultado dentro do canvas juntaria dois problemas: um autosave
no meio da chegada gravaria estado pela metade — a forma exata do bug que
BOARD-SALVA-006 existe para conter, e que já apagou um quadro em teste —
e o quadro viraria um **segundo dono** de dados que `pesquisa_entidades`
já guarda.

Então a pesquisa vive num **painel**, aba ao lado do assistente, fora do
`#canvasStage`. A ponte é um gesto: "Virar card" chama
`window.BoardCanvas.adicionarCard`, que passa pelo mesmo caminho do modal
de novo registro. A pesquisa é **fonte**; o quadro é **superfície de
trabalho**; copiar de uma para a outra é decisão humana, nunca sincronia.

### 12.3 Tensão em aberto: PES-006 × nível `conhecimento`

PES-006 diz que toda afirmação carrega fonte. O nível `conhecimento`
responde da memória do modelo — uma afirmação **sem fonte** sobre a qual
o usuário vai tomar decisão comercial.

Hoje o nível está marcado como não executável, e isso é registro honesto
do problema, não omissão. Duas saídas, e é decisão de produto:

- o nível é exceção explícita à regra, e a tela rotula "sem fonte"; ou
- ele deixa de existir, e "quem são meus concorrentes" vira busca.

### 12.4 BOARD-IA-001 resolvida

O botão "Pesquisar" da tarefa estava desativado desde que a decisão D2
dos créditos estava aberta. D2 saiu com a Fase 4 — saldo, extrato e
recarga por Pix são reais.

Atrás do botão havia encenação: uma pesquisa **simulada**
(`DURACAO_SIMULADA = 6000`, seis segundos de animação e nenhum
resultado) e um portão de crédito **falso** (`creditos = 0` fixo no
JavaScript, com um "adicionar créditos" que fazia `creditos = 100`).

O botão foi religado na pesquisa de verdade e a encenação saiu — 320
linhas entre JavaScript, dois modais e CSS órfão. Mesma limpeza da Fase
4, pelo mesmo motivo. BOARD-LEITURA-003 continua valendo por cima:
tarefa concluída não pesquisa.

### 12.5 `ConsumoPesquisa` é tabela irmã de `consumos_ia`, não a mesma

As colunas de dinheiro são idênticas porque DIN-005 exige a mesma forma.
A **unidade** cobrada é que muda: busca cobra por token e requisição,
Places cobra por chamada, e `consumos_ia` tem tokens obrigatórios.

Alterar `consumos_ia` para acomodar o segundo caso seria mexer em caminho
de dinheiro que funciona. Se aparecer um terceiro consumidor, aí vale
generalizar as duas numa só.

---

**Registro:** este documento nasceu de uma revisão em que a premissa
original (uma conta de agente servindo muitos usuários) foi derrubada em
três etapas: o cache não se aplicava a saída única, o gargalo era custo e
não requisição, e a ferramenta era da categoria errada. O plano antigo
está em `_to_delete/`.
