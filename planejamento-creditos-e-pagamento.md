# Planejamento — Créditos, pagamento e comissão

> Documento de planejamento. O módulo ainda **não foi desenvolvido**.
> Escrito em 31/08/2026, depois de ler o que já existe: o modal de
> créditos em `empresas.html`, as regras `IA-CUSTO-001..004`
> (`ia-assistente-conversa.md`), a decisão **D2** (`login.md` §7) e o
> provedor de IA (`api/src/ia/provedor.ts`).

---

## 1. As três coisas que precisam ser ditas antes do plano

### 1.1 O Nubank não pode ser o emissor da cobrança

O Nubank **não oferece API pública de Pix cobrança**. Não é uma
questão de plano pago ou de conta PJ: não existe endpoint oficial para
criar um QR code dinâmico nem para receber o aviso de que ele foi
pago. É pedido recorrente na comunidade do próprio banco, e as
bibliotecas que circulam são engenharia reversa não oficial — o tipo
de coisa que quebra sem aviso e que não se coloca no caminho do
dinheiro de ninguém.

Sem o aviso automático de pagamento (o *webhook*), **não há como
creditar saldo sozinho**. Alguém teria que conferir extrato e liberar
na mão, o que não é um produto.

O que isso **não** significa: que o dinheiro não possa terminar no
Nubank. Significa que quem *emite* a cobrança precisa ser uma
instituição com API — e de lá você transfere para onde quiser.

**Sobre "API grátis":** o ambiente de **testes (sandbox) é gratuito em
todos os provedores**, e é nele que este plano inteiro roda até a Fase
4. Em produção, receber Pix por API sempre tem custo — a tarifa varia
por provedor e muda com o tempo, então ela precisa ser conferida na
página de tarifas do provedor **no dia da decisão**, não aqui. O que
importa saber agora está em §1.3: a tarifa de recarga morde a margem
mais do que parece.

### 1.2 Hoje o sistema não mede o que gasta

`api/src/ia/provedor.ts` chama a API da Anthropic e lê apenas o texto
da resposta. O campo `usage` — que traz quantos tokens entraram e
saíram, que é *a* informação de custo — é **descartado**.

Isso é o pré-requisito de tudo: **não se cobra o que não se mede**.
É também a correção mais barata do plano inteiro, e por isso vira a
Fase 0.

Na mesma linha, o que a tela mostra hoje é encenação — e a própria
documentação do projeto já registra isso (`board-analise-pre-implementacao.md`):

| Onde | O que é hoje |
|---|---|
| "500 créditos disponíveis / 200 usados de 500" | Número **fixo no HTML** |
| QR Code Pix | Desenho pseudoaleatório num `<canvas>`; o comentário no código diz literalmente "QR code fake" |
| "Código copia e cola" | Texto inventado no navegador, nenhuma chamada de rede |
| "Histórico de uso" | Vazio, sem origem de dados |

### 1.3 A margem de 5% é mais apertada do que parece

Isto não é objeção ao plano — é o número que precisa ser conferido com
um contador antes de a régua ser fixada, porque o desenvolvimento
inteiro se apoia nele.

Sobre cada R$ 1,00 de custo real do Claude, você cobra R$ 1,05. Desses
5 centavos saem, antes de virar lucro:

| Custo | Incide sobre | Observação |
|---|---|---|
| **IOF** na compra internacional | O R$ 1,00 inteiro, não sobre os 5 centavos | Se a Anthropic for paga com cartão. É o item mais pesado — confirmar a alíquota vigente com o contador. |
| **Variação do dólar** | O R$ 1,00 inteiro | Entre a hora que você cobrou o usuário e a hora que a fatura fecha. Um passeio de 5% no câmbio zera a margem sozinho. |
| **Imposto sobre faturamento** | A receita | Depende do regime (Simples, anexo, etc.). |
| **Tarifa do Pix** na recarga | Cada recarga | Ver o exemplo abaixo. |

**O exemplo que dói:** o mínimo de recarga na tela hoje é **R$ 10,00**.
Se a tarifa de recebimento for da ordem de R$ 1,00 por transação, ela
sozinha come **10% da recarga** — e seriam necessários R$ 20,00 de
consumo, a 5%, só para reembolsar aquela única tarifa. Recargas
pequenas dão prejuízo.

**Três saídas, todas decisão de negócio (não minha):** subir o mínimo
de recarga; aplicar um *spread* na cotação do dólar além dos 5%; ou
subir a margem. O plano funciona com qualquer uma — mas **§8 registra
isso como pendência que precisa de resposta antes da Fase 4**.

---

## 2. Decisões tomadas nesta conversa

| ID | Questão | Decisão | Data |
|---|---|---|---|
| **C1** | **D2** — créditos são do usuário ou da empresa? | **Do usuário.** Fecha uma decisão que estava aberta desde o módulo de empresas e marcada como bloqueante em `login.md` §7. Coerente com a tela atual, que já mostra créditos no painel de perfil. | 31/08/2026 |
| **C2** | O que consome crédito? | **Tudo que gerar custo real** — a pergunta ao assistente, a classificação automática de idéias e, no futuro, tarefas longas e autônomas. Isso obriga o desenho de *reservar antes, acertar depois* (§5). | 31/08/2026 |
| **C3** | Quem emite a cobrança Pix? | **Mercado Pago.** Tem API própria para Pix (cobrança dinâmica + webhook). Entra atrás da interface `Psp` (`src/pagamentos/psp.ts`) já pronta — uma classe nova (`PspMercadoPago`), escolhida em `pspAtual()` por configuração, sem tocar em rota nem em `psp-sandbox.ts`. Implementação na Fase 4, quando a conta estiver criada. | 31/08/2026 |

### O que C1 traz junto (e precisa de trava)

A recomendação escrita em `login.md` §7 era o contrário — créditos por
**empresa**. A decisão foi por usuário, o que é legítimo e mais
simples; registro aqui as consequências que ela cria, porque elas não
somem por não terem sido escolhidas:

1. **Consumo de uma empresa esgota o saldo das outras.** Quem tem três
   empresas vê o saldo cair sem saber qual delas gastou. **Mitigação:**
   toda linha de consumo grava `empresa_id` e `projeto_id` mesmo com o
   saldo sendo do usuário. O saldo é um só; o *extrato* é atribuível.
   Isso é barato agora e caro depois.
2. **O profissional contratado (Fase 6) gastaria crédito de quem o
   contratou, sem teto visível.** **Mitigação obrigatória antes da Fase
   6:** teto de gasto por tarefa, combinado no momento da contratação.

---

## 3. As cinco regras do dinheiro

Código que mexe com dinheiro erra diferente de código que mexe com
texto: o erro não aparece na tela, aparece no extrato, semanas depois.
Estas cinco regras valem para todo o módulo e nenhuma é negociável.

| ID | Regra | Por quê |
|---|---|---|
| **DIN-001** | **Tudo em MICRO DE REAL, número inteiro.** Nenhum `float`, nenhum decimal, em lugar nenhum. O centavo aparece só na tela e no Pix. | `0.1 + 0.2` não dá `0.3` em ponto flutuante. E o centavo é grosso demais: ver a correção logo abaixo. |
| **DIN-002** | **A razão é a verdade; o saldo é cópia.** Todo movimento é uma linha nova, nunca uma edição. O `saldo` na tabela de usuários é cache, gravado na **mesma transação** do lançamento. | Saldo sem histórico é um número sem defesa. Quando o usuário reclamar, o extrato precisa existir. Uma rotina de conferência compara a soma dos lançamentos com o saldo e grita se divergirem. |
| **DIN-003** | **O valor a creditar vem do nosso registro, nunca do navegador nem do corpo do webhook.** O navegador diz "quero R$ 50"; o servidor cria a cobrança com R$ 50 e guarda. O webhook depois só diz *qual* cobrança foi paga — o valor a creditar é lido da nossa tabela. | É o buraco clássico: aceitar o valor de quem manda a requisição é deixar o cliente escolher quanto ganha. |
| **DIN-004** | **Todo crédito é idempotente.** `txid` com restrição de unicidade, e o lançamento de recarga é único por cobrança. Webhook repetido não credita duas vezes. | Provedores de pagamento **reenviam** o aviso quando não recebem confirmação. Isso é normal e esperado. Sem trava, cada reenvio é dinheiro dado de graça. |
| **DIN-005** | **O custo e a comissão são duas colunas, nunca uma.** Guardar só o total impede responder "quanto eu paguei à Anthropic esse mês?" e "quanto eu lucrei?" — e impede auditar se os 5% foram aplicados certo. | Um número que já veio somado não se desmonta depois. |

E uma sexta, que vem da lição já registrada em
`Documentacao/grafo-de-conhecimento.md` ("o bug que durou uma semana"):

| ID | Regra | Por quê |
|---|---|---|
| **DIN-006** | **"Falha ao carregar o saldo" nunca pode parecer "saldo zero".** São telas diferentes, com textos diferentes. | Foi exatamente esse disfarce que escondeu o bug do `/sobre` por dias. Num saldo, ele faz o usuário achar que o dinheiro sumiu. |

---

## 4. Modelo de dados

Quatro tabelas novas. Nomes em português, seguindo o resto do schema.

### 4.1 `creditos_lancamentos` — a razão

Append-only. Nunca sofre `UPDATE`, nunca sofre `DELETE`.

```
id                  uuid (pk)
usuario_id          uuid (fk → users.id)
tipo                enum: recarga | reserva | liberacao | consumo | estorno | ajuste
valor_centavos      int      -- com sinal: + entra, - sai
saldo_depois        int      -- fotografia do saldo após este lançamento
origem_tipo         enum: cobranca_pix | uso_ia | contratacao | manual
origem_id           uuid?    -- aponta para a cobrança / o consumo
descricao           text     -- o que o usuário lê no extrato
criado_em           timestamp

índice (usuario_id, criado_em desc)
único  (tipo, origem_id) quando tipo = 'recarga'   -- trava do DIN-004
```

`saldo_depois` é redundante de propósito: é o que permite auditar a
sequência sem recalcular a soma inteira, e é o que denuncia uma
gravação fora de transação.

E em `users`, uma coluna só: `saldo_centavos int not null default 0`.

### 4.2 `cobrancas_pix` — o que foi pedido ao banco

```
id                uuid (pk)
usuario_id        uuid (fk → users.id)
txid              text UNIQUE          -- identificador Pix; nossa chave de idempotência
valor_centavos    int
status            enum: aguardando | pago | expirado | cancelado
psp               text                 -- 'sandbox' | 'efi' | 'inter' | ...
brcode            text                 -- o "copia e cola" (payload EMV)
expira_em         timestamp
pago_em           timestamp?
e2e_id            text? UNIQUE         -- id que o Banco Central dá ao Pix pago
retorno_bruto     jsonb?               -- o webhook como chegou, para auditoria
criado_em / atualizado_em
```

Guardar `retorno_bruto` é o que salva numa disputa: seis meses depois,
"o que exatamente o banco nos mandou?" precisa ter resposta.

### 4.3 `consumos_ia` — o histórico que o usuário pediu

É esta tabela que alimenta a tela "Histórico de uso", hoje vazia.

```
id                  uuid (pk)
usuario_id          uuid (fk → users.id)
empresa_id          uuid?    -- atribuição, mesmo com saldo por usuário (§2)
projeto_id          uuid?
tarefa_id           uuid?
tipo                enum: assistente | classificacao | tarefa_autonoma
modelo              text     -- qual modelo, exatamente; o preço muda por modelo
tokens_entrada      int
tokens_saida        int
tokens_cache_leitura   int
tokens_cache_escrita   int
custo_usd_micros    bigint   -- custo de origem, em milionésimos de dólar
cotacao_brl         decimal(12,6)  -- a cotação usada NESTE lançamento
custo_centavos      int      -- o que custou a nós, em centavos de real
comissao_centavos   int      -- os 5%              ← DIN-005
total_centavos      int      -- custo + comissão = o que o usuário paga
status              enum: reservado | liquidado | estornado
requisicao_id       text?    -- o request-id da Anthropic, para conciliar
criado_em / liquidado_em

índice (usuario_id, criado_em desc)
```

**Por que `cotacao_brl` em toda linha.** Sem ela, o passado fica
inauditável: daqui a três meses não há como saber se um consumo foi
caro porque gastou muito ou porque o dólar estava alto. E é o dado que
mostra se os 5% estão de fato cobrindo o câmbio (§1.3).

### 4.4 `precos_modelo` — a tabela de preços

Preço por milhão de tokens, por modelo, com vigência (`valido_de`,
`valido_ate`). **Não pode ser constante no código:** quando a Anthropic
mudar o preço, os consumos antigos têm que continuar sendo lidos pelo
preço da época. Reescrever o preço do passado reescreveria o extrato.

---

## 5. Como o consumo funciona: reservar, chamar, acertar

Vem da decisão **C2**. O problema: as regras já escritas exigem checar
saldo **antes** de chamar (`IA-CUSTO-002`), mas o custo real só se
conhece **depois** que a resposta volta. Se só conferíssemos antes,
alguém com R$ 0,05 de saldo dispararia uma tarefa de R$ 5,00.

```
1. Estimar o teto da chamada  (tokens de entrada já são conhecidos;
                               a saída se limita por max_tokens)
2. Saldo < teto?  →  402 e para aqui. Nenhuma chamada é feita.
                     (IA-CUSTO-002, já escrita)
3. Lançar RESERVA de valor = teto. O saldo cai agora.
4. Chamar o provedor.
5a. Deu certo  →  ler `usage` real → custo + 5% → LIBERAÇÃO da reserva
                  e CONSUMO do valor verdadeiro. Sobra volta ao saldo.
5b. Deu errado →  LIBERAÇÃO da reserva inteira. Não consome nada.
                  (IA-CUSTO-003, já escrita)
```

O plano **não contraria nenhuma regra já escrita** — ele é o que faz
`IA-CUSTO-001` a `IA-CUSTO-004` deixarem de ser texto.

**O caso feio, que precisa estar previsto:** a chamada à Anthropic dá
certo e a gravação no banco falha. Pagamos e não cobramos. Por isso o
`requisicao_id` fica gravado antes, e uma rotina de conciliação
compara o que a Anthropic diz ter cobrado com o que registramos.
Perder centavos é aceitável; perder centavos **sem saber** não é.

**Para tarefas longas e autônomas** (a segunda parte de C2): reserva
única no início não serve, porque o custo cresce durante a execução. O
desenho é **teto por tarefa**, declarado antes de começar: a tarefa
anuncia seu orçamento, reserva esse valor, e é **interrompida** ao
atingi-lo — em vez de descobrir o estouro na fatura.

---

## 6. Segurança — o que não pode falhar

| ID | Regra |
|---|---|
| **SEG-PAG-001** | O endpoint de webhook **valida a autenticidade** de quem chamou (mTLS, no padrão Pix do Banco Central, ou assinatura HMAC, conforme o provedor). Um webhook sem autenticação que credita saldo é uma máquina de imprimir dinheiro aberta na internet. |
| **SEG-PAG-002** | O webhook é **campainha, não entrega**: ele avisa "a cobrança X mudou"; o servidor então **consulta a API do provedor** para saber o que de fato aconteceu. Nunca credita com base apenas no corpo recebido. |
| **SEG-PAG-003** | O webhook precisa de **URL pública com HTTPS válido**. Hoje o projeto roda em `localhost` — em desenvolvimento isso se resolve com um túnel (ngrok e similares); em produção exige domínio e certificado. |
| **SEG-PAG-004** | Certificados e chaves do provedor **nunca entram no repositório**. Vão para variáveis de ambiente, como `IA_API_KEY` já faz. |
| **SEG-PAG-005** | O webhook responde `200` rápido e processa em seguida. Demorar faz o provedor reenviar — e a idempotência (DIN-004) é o que impede o reenvio de virar crédito duplo. |
| **SEG-PAG-006** | Rota de ajuste manual de saldo é **restrita e sempre registrada** (quem fez, quando, por quê). É a porta dos fundos do sistema; ela existe, e por isso precisa ser vigiada. |

---

## 7. As fases

Ordenadas por dependência real, não por vontade. Cada uma entrega algo
verificável sozinho.

### Fase 0 — Medir, sem cobrar nada ✅ FEITA (31/08/2026)

*A menor e a mais importante.*

- [x] Ler `usage` da resposta da Anthropic em `provedor.ts` (era jogado fora)
- [x] O mesmo em `taxonomia.ts`, que também chama o modelo
- [x] Tabela de preços por modelo, casando por prefixo de família (§4.4)
- [x] Gravar em `consumos_ia`, com custo calculado — e **cobrar zero**
- [x] Relatório: `npm run relatorio:consumo`
- [x] 28 testes puros de dinheiro e preço, passando

**Por que primeiro:** ao final de uma semana rodando, você sabe quanto
custa **de verdade** uma pergunta e uma classificação. Todo o resto —
mínimo de recarga, se 5% dá conta, quanto crédito oferecer — passa a
ser decidido com número, não com chute. Torna o §1.3 aritmética em vez
de preocupação.

**Duas decisões tomadas ao escrever o código:**

1. **Modelo fora da tabela de preços grava os tokens e deixa o custo
   nulo, com a marca `preco_desconhecido`** — nunca um palpite. Custo
   estimado errado é pior que custo nenhum: entra na razão com cara de
   fato e ninguém revisa. Com os tokens guardados, recalcular depois é
   uma consulta.
2. **Resposta descartada pela verificação também é registrada**, como
   `descartado` / `cobravel: false`. Não se cobra do usuário por uma
   resposta que o próprio servidor recusou (`IA-CUSTO-003`) — mas o
   dinheiro saiu, e é essa linha que torna o desperdício visível. Sem
   ela, uma verificação falhando muito seria um vazamento invisível.

**Entrega:** nenhuma mudança visível ao usuário. Um relatório para você.

### Fase 1 — A razão e o saldo ✅ ESCRITA (31/08/2026)

- [x] Tabela `creditos_lancamentos` (append-only) e `users.saldo_micros`
- [x] `src/creditos/razao.ts` — a **única porta** que mexe em saldo
- [x] Rotas de leitura `GET /creditos/saldo` e `GET /creditos/extrato`
- [x] `npm run creditar` — entrada de saldo antes de existir Pix
- [x] Saldo **real** na tela, substituindo o "500 créditos" fixo, com
      a distinção entre falha e zero (DIN-006)
- [x] `npm run teste:razao` — 7 casos contra banco de verdade

**Três decisões tomadas ao escrever:**

1. **Uma única porta para mexer em saldo** (`lancar()`). Nenhuma rota,
   nenhum script escreve em `saldoMicros` direto. É essa restrição que
   torna a regra verificável: se o saldo divergir da soma dos
   lançamentos, o bug está em um arquivo só.
2. **Ajuste manual é script de terminal, não rota de administrador.**
   Uma rota exigiria criar agora o conceito de "administrador da
   plataforma", que não existe neste projeto — os papéis de hoje são
   todos por empresa (`PapelMembro`), não globais. Inventar um papel
   global às pressas, na porta que mexe em dinheiro, é a pior ordem
   possível. O script já é a restrição mais forte disponível: exige
   acesso à máquina e ao `.env` (SEG-PAG-006).
3. **Transação `Serializable`.** Duas requisições simultâneas do mesmo
   usuário poderiam ler o mesmo saldo, cada uma subtrair e as duas
   gravarem — gastando duas vezes o mesmo dinheiro. É o erro clássico
   de saldo, e só aparece sob concorrência. Tem teste próprio.

**Entrega:** o saldo na tela é verdade. Ainda não dá para recarregar
sozinho — isso é a Fase 3/4.

### Fase 2 — Consumo de verdade ✅ ESCRITA (31/08/2026)

- [x] `src/creditos/reserva.ts` — reservar / liberar / consumir por cima de `razao.lancar()`
- [x] Teto de custo ANTES de chamar (`tetoUsdMicros`, `precos.ts`): tokens de entrada
      estimados por caractere + `max_tokens` de saída, superestimado de propósito
- [x] Reservar / chamar / acertar (§5) ligado ao assistente (`rotas/ia.ts`) e à
      classificação (`ia/taxonomia.ts`)
- [x] `402` com explicação quando não há saldo, ANTES de chamar o provedor (`IA-CUSTO-002`)
- [x] Falha do provedor devolve a reserva inteira (`IA-CUSTO-003`) — e resposta
      descartada pela verificação também: reserva volta, nada é consumido
- [x] A tela "Histórico de uso" (extrato de `empresas.html` / `js/creditos.js`)
      já rotulava reserva/liberação/consumo desde a Fase 1 — passa a mostrar
      linhas de verdade sem precisar mudar
- [x] Interruptor `CREDITOS_COBRAR` (`.env`): desliga só a cobrança, sem desligar
      a IA — para testar o assistente sem recarregar saldo de teste toda hora.
      **"sim" sempre em produção.**
- [x] Testes puros de `tokensEstimados`/`tetoUsdMicros` em `testes/precos.test.ts`

**Duas decisões tomadas ao escrever:**

1. **Modelo sem preço na tabela recusa a chamada, não estima um teto chutado.**
   Mesma regra de `precos.ts` desde a Fase 0 — nunca um palpite na razão. No
   assistente vira `503`; na classificação, a idéia fica sem pasta (mesmo
   caminho de "não dá para classificar agora" que rede fora já usa).
2. **O caso raro em que o custo real, depois de liberada a reserva, é maior do
   que o saldo cobre** (a estimativa por caractere errou para menos): `consumir()`
   cobra o que houver disponível e registra que não cobrou por inteiro, em vez de
   lançar erro — a chamada já aconteceu e já foi paga ao provedor; recusar o
   débito a essa altura não devolve dinheiro nenhum, só esconderia o prejuízo.

**Verificado em 31/08/2026:** `npm run teste` — 137 testes, 137 passando, 0
falha, 0 cancelado — banco de teste incluído (a razão escrevendo de verdade e
o `PATCH .../status` gravando taxonomia de verdade). A corrida entre os dois
`before()` de integração disputando o mesmo banco em paralelo (que derrubava a
migração com "P3009 — migração falhou" sem nada estar quebrado) foi corrigida
com `--test-concurrency=1` no script `teste`.

**Atualização (mesmo dia):** depois de aplicar a migração da Fase 3 em
produção, os mesmos 4 testes de `transicao-integracao.test.ts` voltaram a
cancelar — desta vez com `P1002 — Timed out trying to acquire a postgres
advisory lock`. Causa diferente do P3009: mesmo em série, cada arquivo de
integração rodava `prisma migrate deploy` no próprio `before()`, e o lock
consultivo do Postgres não convive bem com a conexão em **pool** do Neon
(`DATABASE_URL_TESTE` usa host `-pooler`). Corrigido centralizando a migração
num script único (`scripts/migrar-teste.ts`), rodado uma vez só via hook
`preteste` do npm, antes da suíte inteira — sem migração repetida, não sobra
lock para disputar. Reverificado: `npm run teste` — 151 testes, 151
passando, 0 falha, 0 cancelado. (Os `prisma:error` que aparecem no meio da
saída, em "a mesma origem não credita duas vezes" e "dois débitos
simultâneos", são esperados — são exatamente os testes provando que a trava
de unicidade e o retry de conflito de escrita funcionam.)

**Atualização (31/08/2026):** escrito `testes/reserva-integracao.test.ts` —
prova o trio inteiro (reservar → liberar → consumir) escrevendo de verdade no
banco de teste: o saldo cai no reservar, volta no liberar, cai de novo (pelo
custo VERDADEIRO, não o teto) no consumir; reservar sem saldo recusa sem
mexer em nada; liberar e consumir repetidos (mesmo origemId) são
reentrantes — não duplicam efeito; e o caso feio do custo real vindo maior
que o saldo depois de liberada a reserva (cobra o que houver, nunca mais,
nunca fica negativo). Rodar com `npm run teste:reserva` (isolado) ou dentro
de `npm run teste` (já incluso no glob `testes/*.test.ts`). **Verificado em
31/08/2026:** `npm run teste` — 161 testes, 161 passando, 0 falha, 0
cancelado, banco de teste incluído. (Dois blocos `prisma:error` aparecem no
meio da saída, dentro da própria suíte de `reserva-integracao.test.ts` — são
esperados: são exatamente os testes de reentrância de `liberar()` e
`consumir()` provocando de propósito a trava de unicidade `(tipo,
origem_id)` para provar que a segunda chamada não duplica o efeito.)

**Único item restante antes de considerar a Fase 2 inteiramente fechada:**
ligar `CREDITOS_COBRAR=sim` pelo menos uma vez para ver o `402` e o débito
real acontecerem de verdade, não só nos testes.

**Entrega:** a plataforma cobra. Recarga ainda é manual, por você.

### Fase 3 — Pix, em sandbox 🚧 EM ANDAMENTO (31/08/2026)

- [x] Modelo `CobrancaPix` (`status_cobranca_pix`, migração
      `20260831160000_cobrancas_pix`) — "o que foi pedido ao PSP",
      separado de `creditos_lancamentos` ("o que entrou de verdade")
- [x] `src/pagamentos/brcode.ts` — **puro.** Payload EMV/BR Code +
      CRC16, testado contra o vetor de referência publicado do
      catálogo de CRCs (CRC-16/CCITT-FALSE, não um número inventado
      para o próprio arquivo bater consigo mesmo)
- [x] Interface `Psp` (`src/pagamentos/psp.ts`) — mesma forma do
      `Provedor` de IA
- [x] `src/pagamentos/psp-sandbox.ts` — cria cobrança sem tocar rede;
      consulta lê `cobrancas_pix` (é a nossa própria tabela fazendo
      o papel de "fonte externa de verdade" em sandbox)
- [x] `src/rotas/webhooks.ts` — `POST /webhooks/pix`, com assinatura
      HMAC (SEG-PAG-001) e reconsulta ao PSP antes de creditar
      (SEG-PAG-002: nunca confia no corpo do aviso sozinho)
- [x] `POST /creditos/recarga` e `GET /creditos/recarga/:txid`
      (`src/rotas/creditos.ts`) — cria a cobrança e permite à tela
      consultar o status
- [x] `scripts/simular-pagamento.ts` — o papel do "banco": marca a
      cobrança como paga e chama o webhook de verdade, assinado, por
      HTTP — o mesmo caminho que um PSP real usaria, não um atalho
      direto para `lancar()`
- [x] Testes puros de `brcode.ts` em `testes/brcode.test.ts`
- [x] Frontend ligado ao backend real (31/08/2026): `empresas.html`
      não desenha mais QR falso nem gera código Pix fake. O botão
      "Gerar QR Code Pix" chama `POST /creditos/recarga` de verdade;
      a tela consulta `GET /creditos/recarga/:txid` a cada 4s até o
      status virar `pago` (ou `expirado`/`cancelado`, com teto duro
      de 20 min de polling) e só então chama `Creditos.recarregar()`
      e `Creditos.extrato()` — a tela nunca decide "pagou" sozinha,
      só reflete o que a rota devolve (SEG-PAG-002 vale também na
      ponta do navegador: o crédito de verdade só acontece via
      webhook, no servidor).

**Terceira decisão, tomada ao ligar o frontend:**

3. **O QR nasce no servidor, não no navegador.** Adicionado o pacote
   `qrcode` (npm) a `api/package.json`; `POST /creditos/recarga` agora
   devolve `qr_data_url` (PNG em base64) gerado a partir do MESMO
   `brcode` que já ia no "copia e cola". Cogitei desenhar o QR no
   cliente (como o protótipo fake fazia, só que com codificação de
   verdade), mas um QR Code tem regras de correção de erro e
   posicionamento de módulos nada triviais — implementar isso à mão
   é risco real de gerar um código que "parece" QR mas não escaneia,
   e aqui o preço de um bug assim é literal: alguém não conseguindo
   pagar. Gerar os dois (QR e copia-e-cola) a partir do mesmo texto,
   no mesmo lugar, no servidor, também garante que nunca divirjam.

**Duas decisões tomadas ao escrever o backend:**

1. **`valorMicros`, não `valor_centavos`** em `cobrancas_pix`, apesar
   do §4.2 original dizer centavos — esse texto é de antes da correção
   de unidade da Fase 0 (ver `dinheiro.ts`). DIN-001 não abre exceção:
   toda coluna de dinheiro deste módulo é micro de real, sem exceção.
2. **A assinatura do webhook é sobre o `txid`, não sobre o corpo bruto
   da requisição.** Capturar o corpo cru do Fastify (que por padrão já
   parseou o JSON antes do handler rodar) só para um payload de um
   campo é complexidade sem ganho de segurança aqui — o `txid` já é o
   único dado que o corpo carrega de fato.

**Entrega:** o fluxo inteiro funciona ponta a ponta, com dinheiro
falso (sandbox) — do clique em "Gerar QR Code Pix" até o saldo mudar
na tela. **Ainda não testado ao vivo** (só compilado/verificado por
partes) — falta rodar `npm run dev` e ir até o fim: gerar o QR na
tela, confirmar com `npm run simular-pagamento -- <txid>` e ver o
saldo mudar sozinho, sem recarregar a página.

### Fase 4 — Pix de verdade ✅ CONCLUÍDA (01/09/2026)

*Depende de uma coisa que não é código:* a resposta sobre a margem
(§1.3).

**Testado com dinheiro real, na conta oficial (01/09/2026).** A conta
de testes do Mercado Pago foi abandonada no meio do caminho: toda
tentativa de criar cobrança com credencial de teste era recusada com
`401 "Unauthorized use of live credentials"`, mesmo com uma "Conta de
teste" tipo Vendedor dedicada e com o Access Token tirado da aba
"Credenciais de teste" (o prefixo `TEST-` não existe mais — todos os
tokens saem como `APP_USR-`, o que torna impossível distinguir teste de
produção pelo valor). A causa nunca foi confirmada. Decisão do usuário:
testar direto na conta oficial, com Pix de verdade e valor baixo — o
que funcionou de primeira, sem nenhum ajuste no código.

- [x] `src/pagamentos/psp-mercado-pago.ts` — `PspMercadoPago implements
      Psp`. `criarCobranca()` via `POST /v1/payments` (Pix) da API
      clássica do Mercado Pago (não a Orders API mais nova — ver o
      cabeçalho do arquivo para o porquê); `consultarCobranca()` via
      `GET /v1/payments/:id`. O `txid` deste Psp passou a ser o
      próprio id do pagamento no Mercado Pago, não mais um gerado por
      nós — dispensa tabela de correspondência.
- [x] `src/pagamentos/assinatura-mercado-pago.ts` — valida o header
      `x-signature` deles (HMAC-SHA256 sobre um "manifest" fixo:
      `id:...;request-id:...;ts:...;`), formato diferente da
      assinatura do sandbox.
- [x] `POST /webhooks/pix/mercado-pago` (`rotas/webhooks.ts`) — rota
      nova, separada da do sandbox (formato de notificação diferente:
      `data.id` em vez de `txid` no corpo). A lógica de crédito em si
      foi extraída para `confirmarPagamento()`, compartilhada pelas
      duas rotas — SEG-PAG-002 (reconsultar o PSP, nunca confiar no
      corpo) mora só ali, uma vez, não em cada rota.
- [x] `PSP_DRIVER` no `.env` (`sandbox` | `mercado_pago`) — troca de
      provedor por configuração, sem tocar em rota nenhuma
      (`pspAtual()`). `MERCADO_PAGO_ACCESS_TOKEN` e
      `MERCADO_PAGO_WEBHOOK_SECRET` ficam obrigatórios só quando
      `PSP_DRIVER=mercado_pago` (mesmo padrão de `S3_DRIVER`).
- [x] `npx tsc --noEmit` limpo com tudo isso.
- [x] **`approved → 'pago'` confirmado ao vivo** (01/09/2026): dois Pix
      reais de R$ 10,00 pagos e creditados. Continuam SEM teste real
      (detalhados no cabeçalho de `psp-mercado-pago.ts`): o mapeamento
      exato de `status_detail` para "expirado" (precisa de um Pix
      vencido de verdade) e o nome do campo do id ponta-a-ponta (e2e).
      Nenhum dos dois afeta se o dinheiro entra — só a auditoria.
- [x] **Regra de negócio nova: o crédito é LÍQUIDO, não bruto**
      (01/09/2026). O Mercado Pago retém uma taxa sobre o Pix recebido
      (no teste: R$ 0,10 sobre R$ 10,00 — 1%). Creditar o valor cheio
      daria ao usuário crédito que a plataforma não recebeu. Agora
      `confirmarPagamento()` desconta a taxa antes de lançar:
      `valorMicros - taxaMicros`.
      **A taxa nunca é um percentual fixo no código** — vem do campo
      `fee_details` da resposta do próprio Mercado Pago, transação por
      transação (se eles mudarem a tabela, o desconto acompanha
      sozinho). Guardada em `cobrancas_pix.taxa_micros` (migração
      `20260901004000_taxa_pix`) para auditoria: dá para responder
      depois "por que este crédito foi menor que o pagamento?".
      Sandbox devolve `taxaMicros: null` (não existe taxa fictícia) —
      comportamento dele não muda.
- [x] **`npm run reconciliar`** (`scripts/reconciliar-mercado-pago.ts`)
      — resgata cobrança paga que ficou presa em "aguardando" porque o
      webhook não chegou (túnel caído, por exemplo). Não inventa
      crédito: chama a MESMA `confirmarPagamento()`, que reconsulta o
      PSP antes de decidir (SEG-PAG-002). Idempotente — rodar duas
      vezes não credita duas vezes (DIN-004).
- [x] **Bug corrigido:** `POST /creditos/recarga` gravava
      `psp: 'sandbox'` fixo em `cobrancas_pix`, mesmo com
      `PSP_DRIVER=mercado_pago`. Agora grava `env.PSP_DRIVER`.
- [ ] **Pendente — não é código, é configuração no painel do Mercado
      Pago:** cadastrar a URL do webhook (`/webhooks/pix/mercado-pago`)
      em "Webhooks → Configurar notificações", copiar a chave secreta
      gerada de lá para `MERCADO_PAGO_WEBHOOK_SECRET`, e copiar o
      Access Token de teste para `MERCADO_PAGO_ACCESS_TOKEN`. Em
      `npm run dev` local, o Mercado Pago não alcança `localhost` —
      precisa de uma URL pública apontando para a máquina de teste
      (ex.: `ngrok`) só durante esse teste.
- [x] **Teste com dinheiro real, conferindo o extrato** (01/09/2026):
      dois Pix de R$ 10,00. Entraram R$ 9,90 + R$ 9,90 = R$ 19,80 na
      conta do Mercado Pago; o saldo na plataforma fechou em R$ 19,90
      (o primeiro foi creditado cheio, antes da regra de taxa existir)
      e volta a bater exatamente com o ajuste manual de R$ 0,10.
- [x] **Webhook chegando e respondendo 200** (01/09/2026), confirmado
      pelo simulador do painel do Mercado Pago. Passou pela validação
      de assinatura (`x-signature`) — se tivesse falhado seria 401 —,
      então `assinatura-mercado-pago.ts` e a chave secreta estão
      corretos. **Nenhum problema era de código.** Duas causas de
      infraestrutura, ambas do ambiente local, ambas encontradas:
      1. O túnel do ngrok caía junto com a janela do terminal, sem
         aviso nenhum (`ERR_NGROK_3200`). Resolvido subindo em segundo
         plano: `nohup ngrok http 127.0.0.1:3333 &`.
      2. `ngrok http 3333` resolvia `localhost` para **IPv6**
         (`[::1]:3333`) e batia em "connection refused"
         (`ERR_NGROK_8012`), porque a API sobe em `host: '0.0.0.0'`,
         que é **só IPv4** (`servidor.ts`). Resolvido apontando o
         túnel explicitamente para IPv4: `ngrok http 127.0.0.1:3333`.
      Diagnóstico que destravou tudo: `console.log` explícitos na rota,
      independentes do `logger` do Fastify — que fica DESLIGADO fora de
      produção (`logger: producao` em `servidor.ts`), razão pela qual
      as primeiras investigações não viam absolutamente nada no
      terminal, nem sucesso nem erro.
- [x] **Pix real creditando sozinho — ciclo completo** (01/09/2026).
      Pagamento → notificação do Mercado Pago → assinatura validada →
      reconsulta ao PSP (SEG-PAG-002) → crédito líquido → tela
      atualizando pelo polling, sem F5 e sem `npm run reconciliar`.
      Resolve também a dúvida que estava registrada aqui: os Pix
      criados pela API clássica (`/v1/payments`) chegam como
      `type: "payment"`, **não** como `order` — se chegassem como
      `order`, a rota responderia 200 sem creditar. O log
      `[webhook mercado-pago] ignorado — evento não é de pagamento`
      fica de guarda para o caso de o Mercado Pago migrar isso.
- [x] **Os `console.log` da rota do Mercado Pago FICAM** (decisão de
      01/09/2026, revendo a intenção original de removê-los). O modo
      de falha desta rota é sempre o mesmo — ela não faz nada e
      ninguém fica sabendo. Passamos por três variantes disso e em
      nenhuma o terminal mostrava coisa alguma, nem sucesso nem erro,
      porque o `logger` do Fastify fica desligado fora de produção
      (`logger: producao`). Um webhook de pagamento silencioso é
      indistinguível de um que funciona, até alguém conferir o saldo.
- [x] **A tela passou a mostrar a taxa** (01/09/2026). `GET
      /creditos/extrato` devolve `valor_pago_formatado` e
      `taxa_formatada` nas linhas de recarga que tiveram taxa (uma
      consulta só para a página inteira, não uma por linha), e o
      extrato mostra "Pago R$ 10,00 · taxa da transação R$ 0,10" sob
      a linha do crédito. Sem isso, "paguei R$ 10,00 e entraram
      R$ 9,90" se lê como a plataforma ficando com a diferença.
- [x] **Encenação removida de 8 páginas** (01/09/2026). O "Histórico
      de uso" renderizava uma lista fixa de sete tarefas inventadas
      (`historicoData`), escrita por cima do extrato real: em
      `empresas.html` eram dois scripts disputando o mesmo
      `#timelineContainer`, e o falso ganhava por rodar depois. Nas
      outras SETE páginas (`Sobre_a_empresa`, `Sobre_a_empresa_Semana2`,
      `atividade`, `board`, `matriz_csd`, `projetos`,
      `visao_do_projeto`) era pior: nunca tinham carregado
      `js/creditos.js`, então mostravam histórico inventado E saldo
      fixo de "500 créditos disponíveis" com barra de progresso em
      40% — três números que não vinham de lugar nenhum, numa tela
      sobre dinheiro. Todas passaram a usar saldo e extrato reais.

### Fase 5 — O que dá errado

A fase que costuma ser cortada e que é a que evita prejuízo.

- Conciliação: nosso registro × extrato do provedor, diariamente
- Conciliação: nosso registro × faturamento da Anthropic
- Cobranças expiradas, pagamento a menor, pagamento duplicado, estorno
- Alerta quando saldo e razão divergirem (DIN-002)
- Tela administrativa: quem gastou o quê, quanto entrou, quanto é lucro

### Fase 6 — Profissionais (o marketplace)

Só depois das anteriores, e **depende de resposta jurídica/contábil**
(§8). O que já dá para desenhar:

- `catalogo_servicos` — "Criar logotipo", R$ 50,00, preço fixo
- `contratacoes` — a tarefa, o cliente, o profissional, o preço fixo,
  o consumo de IA do profissional, a comissão sobre esse consumo
- **Teto de gasto por tarefa** — a mitigação obrigatória da decisão C1

---

## 8. Pendências abertas

| Item | Situação |
|---|---|
| **A margem de 5% cobre os custos?** | §1.3 lista o que sai dela: IOF, câmbio, imposto, tarifa de Pix. **Precisa da resposta de um contador antes da Fase 4.** A Fase 0 dá os números reais para essa conta. |
| **Qual provedor de Pix** (C3) | ~~Decidir até a Fase 4.~~ ~~Decidido: Mercado Pago (31/08/2026).~~ ~~`PspMercadoPago` implementado (31/08/2026).~~ **RESOLVIDO (01/09/2026): funcionando com dinheiro real, ciclo completo e automático** — cobrança, pagamento, webhook e crédito líquido (taxa da transação descontada). Ver Fase 4. |
| **Valor mínimo de recarga** | R$ 10,00 hoje na tela. Se a tarifa de recebimento for ~R$ 1,00, são 10% da recarga (§1.3). Revisar com os números da Fase 0. |
| **Quem fica com os R$ 50,00 do serviço?** | O enunciado diz "ganhamos R$ 50 + 5% do consumo". Se a plataforma fica com os R$ 50 inteiros, o profissional trabalha de graça — então provavelmente esse valor se divide. **Precisa ser definido antes da Fase 6.** |
| **Intermediar pagamento a terceiros é regulado** | Receber do cliente e repassar ao profissional (Fase 6) coloca a plataforma como intermediária. Isso tem implicações fiscais (nota fiscal sobre o total ou só sobre a comissão?) e possivelmente regulatórias. Um provedor com *split* nativo resolve a parte operacional. **Não é decisão de engenharia — é conversa com contador e advogado.** |
| **Crédito é moeda ou unidade própria?** | A tela diz "1 crédito = R$ 1,00". **Recomendação:** guardar tudo em centavos de real e tratar "crédito" como rótulo de tela. Duas unidades de conta significam uma conversão a mais para errar. |
| **`--fill-pro` nos tokens (decisão D3)** | O design system reserva uma família de cor "plano Pro", mas o modelo de negócio é só créditos. Ou o plano Pro existe e precisa ser documentado, ou os tokens saem. Este módulo é a hora de resolver. |
| **Recuperação de senha (D10)** | Não é deste módulo, mas **bloqueia publicação** — e dinheiro em conta torna conta sequestrada um problema muito maior. Registrado aqui como dependência de segurança. |

---

## 9. Arquivos previstos

Seguindo os padrões que já existem no projeto: função pura separada do
que toca banco e rede, para poder ser testada sem nenhum dos dois —
o mesmo desenho de `src/ideias/transicao.ts` e `src/ia/taxonomia-vocabulario.ts`.

| Arquivo | O que é |
|---|---|
| `api/src/creditos/dinheiro.ts` | **Puro.** Centavos, arredondamento, comissão, câmbio |
| `api/src/creditos/precos.ts` | **Puro.** `usage` + modelo + cotação → custo |
| `api/src/creditos/razao.ts` | Lançamentos e saldo, sempre em transação |
| `api/src/creditos/reserva.ts` | Reservar / liberar / liquidar (§5) |
| `api/src/pagamentos/brcode.ts` | **Puro.** Payload EMV do Pix + CRC16 |
| `api/src/pagamentos/psp.ts` | A interface trocável |
| `api/src/pagamentos/psp-sandbox.ts` | Implementação de teste |
| `api/src/rotas/creditos.ts` | Saldo, extrato, criar cobrança |
| `api/src/rotas/webhooks.ts` | Recebimento do aviso de pagamento |
| `js/creditos.js` | Saldo, QR real, extrato — substitui o que hoje é fixo no HTML |

### Testes

O teste de integração contra banco de verdade — construído e validado
em 31/08/2026 no módulo do grafo — **é pré-requisito deste módulo, não
um extra**. Código de dinheiro sem prova de escrita real é imprudente.

| Teste | Tipo |
|---|---|
| `testes/dinheiro.test.ts` | Puro — arredondamento, comissão, valores negativos, zero |
| `testes/precos.test.ts` | Puro — `usage` conhecido → custo esperado |
| `testes/brcode.test.ts` | Puro — CRC16 contra vetores conhecidos |
| `testes/creditos-integracao.test.ts` | **Banco real** — saldo nunca fica negativo; webhook repetido credita **uma** vez; falha do provedor devolve a reserva; razão e saldo batem |

---

## 10. O que fazer a seguir

**Fase 0**, que é pequena e não muda nada para o usuário: ler o `usage`
que hoje é descartado e começar a registrar custo. Em uma semana de
uso normal, os números de §1.3 deixam de ser hipótese — e aí a decisão
sobre margem, mínimo de recarga e provedor se toma com dados.
