# Regras de Negócio — Créditos e Pagamentos

> **Status:** Fase 4 concluída (01/09/2026) · pesquisa medida em 13/09/2026, com uma unidade ainda sem preço  
> **Última atualização:** 17/09/2026 — o Histórico de uso passou a mostrar consumo medido e não cobrado (DIN-014); valor em reais aparece num lugar só (DIN-013); a chave de cobrança vale para todo consumo (DIN-010 a 012)  
> **Escopo:** Recarga via Pix real, desconto de taxa, portabilidade para todas as páginas

---

## Sumário das Regras

### DIN — Regras de Dinheiro (Integridade)

| ID | Regra | Aplicação |
|---|---|---|
| **DIN-001** | Tudo em **micros de real** (número inteiro). Zero decimais em lugar nenhum. | Todas as colunas de dinheiro (`valor_micros`, `taxa_micros`, `saldo_micros`). Centavo aparece só na tela e no Pix. |
| **DIN-002** | A **razão é a verdade**; o saldo é cache. Todo movimento é uma linha nova, nunca edição. | Tabela `creditos_lancamentos` é append-only. Saldo em `users.saldo_micros` é recalculado por transação, após cada lançamento. |
| **DIN-003** | O valor a creditar vem **do nosso registro**, nunca do navegador ou webhook. | Navegador diz "quero R$ 50"; servidor cria cobrança com R$ 50 e guarda. Webhook só diz qual cobrança foi paga — credita-se do valor guardado. |
| **DIN-004** | Todo crédito é **idempotente**. | `txid` com restrição de unicidade. Webhook repetido não credita duas vezes. `npm run reconciliar` é seguro rodar múltiplas vezes. |
| **DIN-005** | Custo e comissão são **duas colunas**, nunca uma. | Auditoria: "quanto paguei ao provedor?" e "quanto lucrei?" — e se a **alíquota vigente na data do lançamento** (DIN-008) foi aplicada certo. Cada consumidor tem origem própria em `creditos_lancamentos` (`uso_ia`, `pesquisa`, …), senão "quanto gastei com pesquisa?" deixa de ter resposta. |
| **DIN-007** | O usuário vê **o valor total**, uma linha só. A separação entre custo do provedor e comissão é **interna** — não vai para tela, resposta de API, extrato nem exportação. | O que sai do saldo é `totalMicros` (custo + a comissão vigente, DIN-008). `creditos_lancamentos.valor_micros` já guarda o total; `custo_micros`/`comissao_micros` ficam em `consumos_ia`/`consumos_pesquisa`, que **nenhuma rota devolve ao cliente**. Verificado em 13/09/2026. |
| **DIN-013** | Valor em reais aparece **num lugar só**: Configurações → Créditos de uso → Histórico de uso. Nenhuma outra jornada exibe preço, estimativa, teto ou custo — nem antes, nem durante, nem depois. | Instrução do Ricardo, 15/09/2026. Saíram: o teto em cima do botão de buscar (`BOARD-PESQUISA-030`), o custo colado na resposta do caderno (`051`) e o custo no rodapé do relatório (`057`). O saldo continua onde sempre esteve — saldo não é preço de uma ação. |
| **DIN-014** | O Histórico de uso é a verdade do **consumo**, não só da razão: consumo **medido e não lançado** aparece lá, marcado como "medido, não cobrado". Nunca se lança na razão para preencher a tela. | `consumos_ia`/`consumos_pesquisa` ganharam `operacao_id`, a mesma chave que a razão usa em `origemId`; o extrato faz a junção e mostra o que não tem lançamento. Só `total_micros` sai daqui (`DIN-007` intacto). Linha com `operacao_id` nulo (anterior a 17/09/2026) fica de fora — sem a chave não há como saber se foi cobrada. |
| **DIN-008** | A alíquota da comissão **tem vigência**. Lançamento passado fica na alíquota da época — nunca é recalculado. | `COMISSAO_PONTOS_BASE` é a alíquota **de hoje**, não a de sempre. A razão é append-only (`DIN-002`) e cada linha guarda o que foi cobrado; conferir uma linha antiga contra a alíquota atual dá diferença **legítima**, não erro. Tabela de vigência abaixo. |
| **DIN-009** | **Toda unidade que o provedor cobra entra na razão** — não só tokens. Unidade contada e não precificada é prejuízo silencioso. | A busca encadeada custa US$ 0,01 por unidade além dos tokens, e ficou **contada e não cobrada** desde que a pesquisa existe. Preço de tabela em `precos.ts`; entra em `custoDe` junto dos tokens. |
| **DIN-006** | "Falha ao carregar saldo" **nunca parece "saldo zero"**. | Duas telas diferentes, com textos diferentes. Um número que já veio errado é pior do que nenhum número. |

### SEG-PAG — Regras de Segurança (Pagamento)

| ID | Regra | Aplicação |
|---|---|---|
| **SEG-PAG-001** | Webhook valida autenticidade de quem chamou. | Assinatura HMAC-SHA256 do Mercado Pago sobre manifest: `id:...;request-id:...;ts:...;`. Sandbox usa assinatura diferente. |
| **SEG-PAG-002** | Webhook é **campainha, não entrega**. Nunca credita com base só no corpo recebido. | Servidor reconsulta `GET /v1/payments/:id` ao Mercado Pago ANTES de creditar. Navegador também: polling a cada 4s até confirmação. |
| **SEG-PAG-003** | Webhook precisa de **URL pública com HTTPS válido**. | Desenvolvimento: ngrok ou túnel similar. Produção: domínio + certificado. |
| **SEG-PAG-004** | Certificados e chaves **nunca entram no repositório**. | `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` no `.env`. |
| **SEG-PAG-005** | Webhook responde `200` rápido e processa em seguida. | Demora faz provedor reenviar. Idempotência (DIN-004) impede duplicação. |
| **SEG-PAG-006** | Rota de ajuste manual é **restrita e sempre registrada**. | Script `npm run creditar`, não rota HTTP. Acesso: máquina + `.env`. |

---

## Fluxo de Recarga via Pix (Fase 4 — Completo)

1. **Usuário clica "Gerar QR Code Pix"** e entra o valor
2. **Frontend chama** `POST /creditos/recarga` com o valor
3. **Backend cria cobrança** via Mercado Pago (`POST /v1/payments`)
4. **Grava em `cobrancas_pix`** com status='aguardando'
5. **Devolve QR real** (PNG/base64) + código "copia e cola"
6. **Usuário paga** via Pix
7. **Mercado Pago notifica** via webhook
8. **Validação:** assinatura HMAC (SEG-PAG-001) + reconsulta API (SEG-PAG-002)
9. **Desconto de taxa:** `credito = valor - taxa` (vem de `fee_details`)
10. **Crédito lançado** em `creditos_lancamentos` tipo='recarga'
11. **Frontend vê** novo status via polling → mostra confirmação

Se webhook não chegar:
```bash
npm run reconciliar
```

---

## Desconto de Taxa (Crédito Líquido)

- **Nunca é % fixo.** Taxa vem de `fee_details` da API (transação por transação).
- **Guardada:** coluna `cobrancas_pix.taxa_micros` (auditoria).
- **Exibida:** extrato mostra "Pago R$ 10,00 · taxa R$ 0,10".
- **Fórmula:** `credito_micros = valor_micros - taxa_micros`.

Exemplo: R$ 10,00 (1M micros) - R$ 0,10 taxa (10k micros) = R$ 9,90 creditado (990k micros).

---

## Portabilidade para 7 Páginas (01/09/2026)

**Antes:** 7 páginas tinham botão "Comprar" que gerava Pix **fake** com `gerarCodigoPixFake()`.

**Agora:** Todas têm fluxo **real**.

- ✅ Script real (chama `/creditos/recarga`, polling até pago)
- ✅ Todos os IDs HTML necessários presentes
- ✅ `js/creditos.js` carregado
- ✅ Sem encenação: 0 instâncias de `gerarCodigoPixFake()`
- ✅ Saldo e extrato reais

**Páginas:** Sobre_a_empresa, Sobre_a_empresa_Semana2, atividade, board, matriz_csd, projetos, visao_do_projeto.

---

## A chave de cobrança que só metade do código conhecia (DIN-010)

**Achado em 15/09/2026, lendo o próprio código à procura do que ia morder.** `CREDITOS_COBRAR="nao"` promete, no `.env.example`, que *"a IA responde normalmente mas nada sai do saldo de ninguém"*. A promessa era cumprida por cada rota **lembrar de perguntar**: `rotas/ia.ts`, recortes, taxonomia e os dois enriquecimentos perguntavam. As rotas de pesquisa, que nasceram depois, não perguntavam — e são as mais caras da casa. Investigar em desenvolvimento debitava saldo de verdade, ~R$ 0,69 por vez, e não havia como testar o fluxo sem recarregar saldo de teste.

**DIN-010 — a chave mora no vocabulário da razão, não nas rotas.** `reservar`, `liberar` e `consumir` são o único caminho de consumo até `lancar()`. A chave é consultada dentro dos três, antes de qualquer lançamento, e por isso vale para todo chamador — os que existem e os que vierem. Quatro rotas × três verbos seria pedir a doze lugares que se comportem; uma função é garantir que não haja como não se comportar. É o mesmo princípio de `BOARD-PESQUISA-047` e `061`: **pedir é instrução; cortar é garantia.**

**Os três saem juntos ou nenhum sai.** Se `liberar` respeitasse a chave e `reservar` não — ou o contrário —, o saldo andaria sozinho numa direção: uma reserva eterna, ou uma devolução sem reserva. É por isso que a saída antecipada está nos três, e que há teste cobrando os três.

**DIN-011 — desligar a cobrança não desliga a medição.** `registrarPesquisa` e `registrar` gravam tokens, buscas e custo em dólar por um caminho que não passa por `reserva.ts`, e devem continuar assim. `PES-003` — *"o custo vem do provedor, transação a transação"* — vale igual com a cobrança desligada: o que para é o débito, não a conta. Se a medição dependesse da chave, desenvolvimento deixaria de produzir exatamente o dado que achou `DIN-009`, a reserva que não reservava e a tarefa investigada duas vezes.

**DIN-012 — crédito que entra nunca depende da chave.** `rotas/webhooks.ts` é o único outro lugar que chama `lancar()` direto, e de sentido contrário: ele credita um Pix confirmado. A chave desliga o débito, não o dinheiro que a pessoa pôs. O teste guarda as duas metades disso: que ninguém mais lança na razão por fora de `reserva.ts`, e que `webhooks.ts` nunca lança valor negativo.

**Não foi provado por chamada, e o motivo importa.** A afirmação aqui é estrutural — *não existe outro caminho até a razão* —, e isso não se observa chamando as três funções: chamá-las prova que aquelas três estão certas, e nada sobre a quarta que alguém escrever amanhã. Era essa a forma do defeito. `api/testes/cobranca-desligada.test.ts` lê o código: a chave antes do lançamento nos três verbos, a porta única, a medição livre. O efeito no saldo de um Postgres de verdade é de `reserva-integracao.test.ts`, que é onde ele pode ser visto.

---

## A busca que era contada e não era cobrada (DIN-009)

**Achado em 14/09/2026, olhando a razão de uma investigação real.** A Anthropic cobra por **busca encadeada** — US$ 10 por mil, US$ 0,01 cada — além dos tokens. A coluna `consumos_pesquisa.buscas` guardava a contagem desde o começo, e a contagem **nunca virava dinheiro**. Estava registrado como pendência ("Consumidores não medidos"), com a justificativa de que estimar seria pôr número inventado na razão.

A justificativa estava errada quanto ao tipo do número. US$ 10/1000 é **preço de tabela publicado**, exatamente como os preços por token que `TABELA` já guarda. Não havia nada a estimar.

**E não era desprezível — era a maior parte.** Na investigação sobre a Loggi (14/09/2026):

| | USD |
|---|---|
| Tokens (31.196 entrada + 982 saída, Haiku) | 0,036 |
| 4 buscas × US$ 0,01 | **0,040** |
| **Custo real** | **0,076** |
| O que foi cobrado | 0,036 |

A plataforma cobrou **menos da metade do que pagou**, e os 30% de comissão incidiam sobre essa metade. Quanto mais a investigação buscava, maior o prejuízo por investigação — o oposto do que se quer de um produto que vende profundidade.

---

## A reserva que não reservava (14/09/2026)

Mesmo dia, mesmo lugar, defeito irmão. O teto reservado antes da chamada vinha de `tetoUsdMicros`, que estima a entrada **pelo texto do prompt**. Isso vale para uma chamada simples. Numa chamada com ferramenta, não: o resultado da web volta para o contexto, e o contexto inteiro é reenviado a cada rodada — a entrada cresce com o quadrado do número de buscas.

Medido: **31.196 tokens de entrada** contra uma estimativa de ~400. Quase **80 vezes**. Consequências:

- a reserva travava uma fração do que ia ser gasto, então duas investigações simultâneas de quem tem saldo para uma passavam as duas;
- o teto de R$ 3 por investigação (D2) não segurava nada;
- e — o pior — era esse número que aparecia para a pessoa como **"custo estimado da busca"**, quando `PES-007` existe justamente para esse número ser verdade.

`tetoBuscaUsdMicros` modela as rodadas: `(k+1)·prompt + 2.500·k·(k+1)/2`, mais o preço das buscas. Com prompt de mil tokens e cinco buscas, o teto sai ~R$ 0,69 em vez de ~R$ 0,04. O `2.500` é o único número calibrado a partir de **uma** observação; se a conta divergir do que a razão registrar, é ele que se ajusta primeiro, e está dito assim no código.

---

## O teto por investigação, revogado (22/09/2026)

O teto de **R$ 3 por investigação** (D2, 14/09/2026) e o teto opcional
por sessão (`pesquisa_sessoes.teto_micros`) deixaram de existir.
Decisão do Ricardo, motivada pelo que a regra fazia na prática:
"Esta investigação atingiu o teto de gasto" aparecia **no meio de uma
pesquisa, com saldo de sobra na conta**. Quem está investigando e
esbarra num limite volta depois com menos contexto, ou não volta — e
pesquisar é o gesto que a plataforma existe para provocar.

**O que NUNCA foi este teto: a proteção contra gasto descontrolado.**
Quem segura o dinheiro é o saldo de créditos, em `creditos/reserva.ts`,
a cada uma das três chamadas de IA da pesquisa (planejar, buscar,
aprofundar): reserva pelo pior caso **antes** de chamar, devolve o que
sobra, e recusa com `SaldoInsuficiente` quem não tem cobertura. Essa
trava continua inteira. O teto por investigação era uma segunda cerca
por dentro dela, mais apertada — e, desde a correção de
`tetoBuscaUsdMicros`, redundante com uma reserva que passou a estimar
certo.

`teto_micros` era nulo em toda sessão que não pedisse limite próprio, e
**nenhuma tela chegou a oferecer esse pedido**: a coluna nunca recebeu
valor em produção. A migração que a derruba não perde dado.

**Ressalva descoberta em 22/09/2026, e ela importa.** O parágrafo acima
diz que a trava do saldo "continua inteira". Isso é verdade no código, e
condicional na configuração: `reservar()` começa com
`if (!cobrancaLigada()) return`, e produção roda hoje com
`CREDITOS_COBRAR=nao` (`render.yaml`). Com a chave desligada não há
reserva, não há `SaldoInsuficiente` e, sem o teto por investigação, a
pesquisa **não tem limite nenhum** — o gasto real segue acontecendo na
conta do provedor de IA.

Isso não reabre a decisão de remover o teto: ele barrava com saldo de
sobra, e barrar no meio de uma investigação continua sendo o erro maior.
O que muda é a urgência de ligar a cobrança — ela deixou de ser só sobre
a tela do Histórico de uso e passou a ser o que rearma a única proteção
que sobrou. Os passos e a ordem estão em `HOSPEDAGEM.md` §7; a ordem não
é detalhe, porque nenhuma conta tem saldo inicial.

**`PES-007` continua valendo, e não é isto.** Ela pede que o custo
estimado apareça **antes** de gastar — transparência, não bloqueio. O
que saiu foi a cerca; mostrar o número antes segue sendo a regra.

Commit `18d58cb`. Fica em aberto o que a nota de 14/09 já dizia: a
estimativa de `PES-007` é o número que a pessoa lê, e ela precisa
continuar verdadeira — agora sem um teto por baixo para mascarar
subestimativa.

---

## A alíquota da comissão e sua vigência (DIN-008)

| Vigência | Alíquota | Pontos-base | Decisão |
|---|---|---|---|
| 25/08/2026 → 13/09/2026 | **5 %** | 500 | Valor inicial, escolhido antes de haver consumo medido |
| **14/09/2026 → hoje** | **30 %** | **3000** | Instrução do Ricardo, 14/09/2026 |

**Por que subiu.** Nas palavras do Ricardo (14/09/2026): *"a plataforma de design vai ter gastos com servidores e isso tem que ser cobrado do usuário, então estou aumentando a porcentagem de ganho percentual."*

Os 5% foram fixados em `planejamento-creditos-e-pagamento.md` §1.3, que já os classificava como *"mais apertados do que parecem"* e listava o que sai deles antes de virar lucro: **IOF** na compra internacional, **variação do dólar** entre a cobrança e o fechamento da fatura, **imposto sobre faturamento** e **tarifa de Pix** por recarga. O mesmo §1.3 listava três saídas — subir o mínimo de recarga, aplicar *spread* na cotação, ou subir a margem — e §8 registrava a pergunta em aberto: *"a margem de 5% cobre os custos?"*. A decisão de 14/09 responde pela terceira saída.

**O que a lista de §1.3 não tinha.** Todos os quatro itens dela são custos **por transação**: incidem quando alguém consome. Infraestrutura não é assim — servidor, banco e tráfego são custo **por tempo**, e existem mesmo no mês em que ninguém chama o provedor. Uma alíquota sobre consumo cobre custo fixo só na média, e só enquanto houver consumo: a conta fecha para quem usa a plataforma, e não fecha para a conta aberta que fica parada. Isso não invalida a decisão — é o desenho de receita que o produto tem hoje —, mas é a razão pela qual esta alíquota não é uma resposta definitiva ao custo de infraestrutura, e sim a resposta disponível.

**O que a mudança NÃO faz.** Não toca em lançamento nenhum já gravado. A razão é append-only (`DIN-002`), cada linha de `consumos_ia`/`consumos_pesquisa` guarda o `comissao_micros` que foi cobrado naquele dia, e o saldo de quem já recarregou continua valendo o que vale. O que muda é o preço do **próximo** consumo.

**Onde a alíquota mora.** Num lugar só: `COMISSAO_PONTOS_BASE` em `api/src/creditos/dinheiro.ts`, em pontos-base inteiros (30% = 3000), porque escrever `0.30` reintroduziria ponto flutuante justamente na conta que gera a receita. Nenhuma rota, tela ou documento repete o número como literal — `dinheiro.test.ts` trava o valor com um teste, para mexer nele ser sempre uma decisão consciente e nunca um descuido.

**Efeito prático, para dimensionar.** Cem classificações de idéia que custavam R$ 0,9485 ao provedor saíam por R$ 1,00 e passam a sair por R$ 1,23. Uma investigação da Fase 1 do plano de pesquisa, estimada em ~US$ 0,18, sai de ~R$ 1,00 para ~R$ 1,25.

---

## A comissão, e por que ela não aparece (DIN-007)

**Conferido em 13/09/2026, a pedido do Ricardo.** A pergunta era se a estimativa de custo que o plano de pesquisa promete mostrar antes de gastar (`PES-007`) inclui a nossa margem. A resposta tem duas partes.

**O que já está certo.** Em todo lugar onde a plataforma mostra dinheiro consumido, ela já mostra o **total com comissão**, e o desmembramento não sai daqui:

| Camada | O que guarda | O que entrega ao cliente |
|---|---|---|
| `comissaoSobre()` (`dinheiro.ts`) | `custoMicros`, `comissaoMicros`, `totalMicros` | — |
| `reservar` / `consumir` (`reserva.ts`) | movimenta `totalMicros` | — |
| `creditos_lancamentos` | `valor_micros` = **o total** | `valor_micros`, `valor_formatado` |
| `consumos_ia` / `consumos_pesquisa` | custo e comissão em colunas separadas | **nada** — nenhuma rota lê essas colunas para o cliente |
| `GET /creditos/extrato` | — | total, saldo depois, e a descrição "Uso da plataforma — *operação*" |

A única soma de `consumos_pesquisa` que existe numa rota é `gastoDaSessao()`, e ela soma `totalMicros` para checar o teto — não devolve o detalhe.

**O que ainda não existe.** A estimativa de `PES-007` **não está construída**: `planejar` devolve hoje `custo_estimado_micros: null`, de propósito, com a justificativa no próprio código de que devolver número inventado seria pior que devolver nulo. Então a pergunta "a estimativa considera a comissão?" ainda não tem implementação para responder — ela é uma decisão a tomar **agora**, antes de construir, e a resposta é `DIN-007`: um número só, o total.

**Por que isto precisou virar regra, se o comportamento já estava certo.** Porque estava certo **por acaso**, sustentado por nenhuma rota ter tido motivo para ler aquelas colunas ainda. O modelo de dados convida ao contrário: `consumos_pesquisa` tem `custo_micros` e `comissao_micros` lado a lado, e qualquer tela futura de "detalhe do consumo", qualquer exportação de extrato em CSV, qualquer painel de custo por projeto nasce a um `select` de distância de expor a margem. `DIN-005` manda separar as colunas e explica o porquê — **auditoria** —, mas nunca disse que a separação é só nossa. Era a metade que faltava.

**O precedente perigoso está na mesma tela.** O extrato **mostra** de propósito o desmembramento de uma recarga por Pix: *"Pago R$ 10,00 · taxa R$ 0,10 · creditado R$ 9,90"*. Está certo — sem isso a pessoa vê R$ 9,90 entrando de um pagamento de R$ 10,00 e conclui que a plataforma ficou com a diferença; a taxa é de terceiro e mostrá-la nos defende. Mas as duas coisas são visualmente irmãs e moram no mesmo componente, e a diferença entre elas não é óbvia para quem for mexer ali daqui a seis meses: **taxa de PSP é dinheiro que não é nosso e se explica; comissão é o preço do serviço e não se desmembra.** `DIN-007` existe para essa distinção não depender de alguém lembrar.

**O que DIN-007 não proíbe.** Não proíbe dizer que a plataforma tem margem — isso é modelo de negócio, e está descrito em `O_que_e_q_plataforma_de_design.md`. O que ela proíbe é apresentar **um consumo específico** decomposto em "provedor X + plataforma Y", que é o formato que convida a pessoa a comparar o nosso preço com a tabela do fornecedor a cada uso.

---

## O gasto medido que ninguém via (DIN-014)

Achado pelo Ricardo em 17/09/2026, com uma pesquisa real ("Amazon Logistch"): a busca correu, entregou, e **nada apareceu** no Histórico de uso.

**A causa imediata** era `CREDITOS_COBRAR=nao` no `.env`. `consumir()` sai na primeira linha quando a chave está desligada, antes de chamar `lancar()` — nenhuma linha entra em `creditos_lancamentos`, e o Histórico lê exatamente essa tabela. A tela não estava errada: ela estava dizendo a verdade sobre a razão.

**A causa de fundo é outra, e é nossa.** Isso sempre foi assim, e sempre foi inofensivo, porque o custo também aparecia no relatório e na resposta do caderno. `DIN-013` tirou esses dois e fez do Histórico o único lugar onde valor aparece. As duas decisões juntas produziram o que nenhuma delas pretendia: um gasto **medido, gravado e invisível em todo o produto**. Nem `DIN-011` nem `DIN-013` erraram sozinhas — o defeito nasceu do encontro delas, e por isso não estava escrito em lugar nenhum.

**O que NÃO foi feito.** A correção óbvia seria lançar na razão mesmo com a cobrança desligada, ou lançar um valor zero com uma marca. As duas mentem: a primeira sobre o saldo, a segunda sobre o custo. `DIN-002` diz que a razão é a verdade do saldo, e uma linha inventada para preencher uma tela é exatamente o tipo de escrita que a conferência de `DIN-002` existe para pegar.

**O que foi feito.** A tela passou a responder pelo **consumo**, que é o que ela promete, em vez de só pela razão. Para isso faltava uma chave: `consumir()` já gerava um `operacaoId` e o gravava na razão como `origemId`, mas as tabelas de medição nunca o guardavam — então uma linha medida não sabia dizer se tinha sido cobrada. A coluna `operacao_id` entrou nas duas tabelas (aditiva, anulável, indexada), o `operacaoId` passou a ser gravado em toda medição, e o extrato junta as duas listas: o que tem lançamento aparece como sempre, o que não tem aparece marcado.

**Por que a linha antiga fica de fora.** Consumo anterior a 17/09/2026 não tem a chave, então não há como saber se foi cobrado. Mostrá-lo como "não cobrado" arriscaria exibir **duas vezes** o mesmo gasto que já está lá como lançamento. Entre não mostrar um gasto antigo e contá-lo duas vezes, não mostrar é o erro mais barato — e é o único que não corrompe a leitura de quem audita.

**O que a marca diz, e como.** Sem sinal e em cor de apoio: a linha não mexeu no saldo, e um "− R$ 0,43" igual aos outros mandaria a pessoa procurar no saldo uma diferença que não existe. `saldo_depois` vem nulo pelo mesmo motivo — repetir o saldo atual daria a impressão de que a linha passou por ele.

---

## Um lugar só para o valor (DIN-013)

Instrução do Ricardo, 15/09/2026: *"o usuário, a partir do momento em que clica em pesquisar, só vai saber o valor após o término da pesquisa, e essa informação deve aparecer apenas na modal Configurações / Créditos de uso / Histórico de uso; o restante podemos tirar — não devemos exibir valores dentro de outras jornadas."*

**O que saiu, e de onde.** Três lugares mostravam o mesmo dinheiro em três momentos diferentes da mesma jornada: o teto *"Buscar custa até R$ X"* em cima do botão de buscar, o custo colado no fim de cada resposta do caderno, e o custo no rodapé do relatório baixado. Nenhum dos três foi substituído por outro número — todos foram retirados.

**Por que isto não briga com DIN-007.** DIN-007 responde *como* o valor é mostrado quando é mostrado: um total, uma linha, sem desmembrar custo e comissão. DIN-013 responde *onde*. As duas juntas dizem: um número, num lugar. Nada em DIN-007 exigia que o número aparecesse em toda tela que gasta.

**Por que o preço antes de gastar não estava ajudando.** Ele nasceu como proteção — ninguém deve gastar sem saber quanto. Mas o teto aparecia depois de a pessoa já ter clicado em "Pesquisar", ou seja, **depois da decisão**: era um número que não mudava nada, custava atenção, e ainda gerava a expectativa errada, porque o teto quase nunca é o que sai do saldo. O mesmo vale para o custo colado na resposta do caderno: a pergunta já tinha sido feita e paga.

**O que continua protegendo o gasto.** O **teto por investigação** (R$ 3) continua no servidor, e é ele que impede uma conversa longa de virar gasto sem ninguém notar — não o texto na tela. A medição continua igual (`DIN-011`): tudo que é consumido é gravado, e é isso que alimenta o Histórico de uso. Tirar o número da tela não tirou nada da razão.

**O que NÃO é preço, e por isso ficou.** O **saldo** continua visível onde sempre esteve: saldo é quanto a pessoa tem, não quanto uma ação custa. E o relatório continua dizendo o **tamanho** do que foi apurado — quantas fontes lidas, quantas afirmações, quantas não ficaram —, que é o que se audita ali dentro.

---

## Checklist de Integridade

- [x] **DIN-001** — Tudo em micros (sem float)
- [x] **DIN-002** — Razão append-only, saldo é cache
- [x] **DIN-003** — Valor vem do registro, não do webhook
- [x] **DIN-004** — Idempotência (txid único)
- [x] **DIN-005** — Custo e comissão separados · pesquisa entrou em 13/09/2026 com origem própria; busca encadeada precificada em 14/09/2026 (DIN-009)
- [x] **DIN-006** — Falha ≠ saldo zero
- [x] **DIN-008** — Alíquota com vigência; lançamento passado não é recalculado · 30% desde 14/09/2026
- [x] **DIN-009** — Busca encadeada precificada · 14/09/2026; fecha "Consumidores não medidos"
- [x] **DIN-007** — Usuário vê o total; custo e comissão não saem em rota nenhuma · conferido em 13/09/2026 (extrato, reserva, consumo e sessão de pesquisa)
- [x] **DIN-010** — `CREDITOS_COBRAR` vale para TODO consumo, porque mora dentro de `reservar`/`liberar`/`consumir` · 15/09/2026
- [x] **DIN-011** — Desligar a cobrança não desliga a medição (PES-003 continua valendo) · 15/09/2026
- [x] **DIN-012** — Crédito que entra nunca depende da chave; só `webhooks.ts` lança por fora, e só positivo · 15/09/2026
- [x] **DIN-013** — Valor em reais aparece só em Configurações → Créditos de uso → Histórico de uso · 15/09/2026
- [ ] **DIN-014** — Consumo medido e não lançado aparece no Histórico, marcado · 17/09/2026 · **falta rodar `npm run gerar` e `npm run migrar:dev`**
- [x] **SEG-PAG-001** — Assinatura validada
- [x] **SEG-PAG-002** — Reconsulta ao PSP
- [x] **SEG-PAG-003** — URL pública + HTTPS (ngrok em dev)
- [x] **SEG-PAG-004** — Chaves no `.env`
- [x] **SEG-PAG-005** — Webhook responde 200 rápido
- [x] **SEG-PAG-006** — Ajuste manual = script terminal

---

## Consumidores não medidos

DIN-005 exige que cada consumidor tenha origem própria em `creditos_lancamentos`, "senão *quanto gastei com pesquisa?* deixa de ter resposta". O enum `OrigemLancamento` tem o valor `pesquisa` reservado desde a Fase 4. Ele **nunca foi usado**.

| Consumidor | Mede? | Situação |
|---|---|---|
| Assistente de IA | Sim | `TipoConsumoIa.assistente` |
| Classificação de idéia | Sim | `TipoConsumoIa.classificacao` |
| Síntese de tema | Sim | `TipoConsumoIa.sintese_tema` (`TEMA-SINTESE-008`) |
| **Pesquisa externa** | Sim, em parte | Tokens medidos e debitados desde 13/09/2026; busca encadeada gravada como unidade, **sem preço** |

### ~~A pesquisa externa não é medida nem debitada~~ — resolvido em 13/09/2026

> **Corrigido no mesmo dia.** `rotas/pesquisa.ts` agora reserva pelo pior caso antes da chamada, libera o teto e consome o custo real depois, e grava a linha em `consumos_pesquisa` pelo novo `creditos/registro-pesquisa.ts`. Os lançamentos entram com origem `pesquisa` e descrição "Uso da plataforma — pesquisa de concorrentes", que é o que aparece em Configurações › Créditos de uso.
>
> **O que ainda não entra na conta:** a Anthropic cobra por busca encadeada (`web_search_requests`, até cinco por pergunta) e esse preço não está registrado em lugar nenhum deste repositório. As buscas ficam gravadas como unidade em `consumos_pesquisa.buscas`, sem virar dinheiro — então **o total cobrado é menor que o custo real**. Quando o preço existir, recalcular o passado é uma consulta, porque a unidade está guardada. Inventar um número agora o poria na razão com cara de fato.
>
> O diagnóstico original fica abaixo, como registro do que o defeito era.

#### O defeito, como estava

Aberto em 13/09/2026, a partir de uma observação do Ricardo: o histórico em Configurações › Créditos de uso não mostrava nenhuma pesquisa. Ele está certo — não há o que mostrar.

`api/src/rotas/pesquisa.ts` chama o provedor externo e grava consulta, fontes e entidades numa transação, mas **nunca** chama `reservar`, `consumir` nem `razao.lancar()`. As únicas menções a crédito nesse arquivo são comentários.

A tabela `ConsumoPesquisa` existe no schema — `usuario_id`, `sessao_id`, `consulta_id`, `nivel`, `provedor`, `resultado`, `total_micros` e contadores de token — e **nada escreve nela**. A partir daí, em cadeia:

1. `gastoDaSessao()` soma exatamente essa tabela, então devolve **sempre zero**;
2. `estimativaMicros = 0` está fixo no código, com o comentário de que é "deliberado e temporário" enquanto a tabela de preço por nível não existir;
3. logo `cabeNoTeto(0, 0, teto)` é sempre verdadeiro e **o `402` nunca dispara**;
4. nenhum lançamento com origem `pesquisa` é criado, e o extrato não tem o que listar.

**O que isso significa hoje:** a pesquisa é gratuita e ilimitada para quem a usa, o custo do provedor não aparece em lugar nenhum da plataforma, e o teto por sessão — que a interface mostra e o usuário pode ajustar — não tem efeito nenhum.

**Por que isto não é só um item de backlog.** DIN-002 diz que a razão é a verdade. Um consumidor que gasta dinheiro real e não passa pela razão não torna a razão incompleta: torna-a **errada**, porque ela afirma, pela própria estrutura, ser o registro de tudo. E o defeito é do tipo que não aparece sozinho — nada quebra, nenhum erro é registrado, e a única forma de descobrir foi alguém abrir o histórico procurando uma pesquisa que tinha feito.

Ver `Regras_de_negocio/modulos/atividades/board-lista.md` — `BOARD-PESQUISA-009` e a pendência crítica da §5.

**Decisão relacionada, ainda sem resposta.** A **D2** (crédito por usuário ou por empresa) estava registrada como bloqueadora de publicação. A pesquisa entrou no ar em 06/09 sem esperá-la (decisão A34 em `board-lista.md`). A pergunta continua aberta, e agora sem nada travando enquanto isso.

---

## Próximas Fases

**Fase 5:** Reconciliação automática + dashboard  
**Fase 6:** Marketplace (depende de decisão jurídica)
