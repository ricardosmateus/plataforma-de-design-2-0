# Enriquecimento de tema — leitura guiada, gráficos e lacunas

Plano de desenvolvimento. Nada aqui está construído ainda — este
documento existe para travar o desenho ANTES do código, porque as
três capacidades pedidas têm níveis de risco de alucinação bem
diferentes e merecem contratos diferentes.

Decisões já travadas com o usuário (não reabrir sem motivo novo):

| Decisão | Escolha |
|---|---|
| Gatilho | Automático em segundo plano, ao mudar os recortes de um tema |
| Ordem de entrega | Fases incrementais — Leitura → Gráficos → Lacunas |
| Modelo | Escalonado: Haiku na leitura, Sonnet em gráficos e lacunas |
| Ação das lacunas | Só texto na v1, sem botão de criar idéia |

---

## O que já existe, e o que falta

`GET /empresas/:id/temas/:categoria` já resolve a metade difícil: os
recortes chegam corretos, cada um preso ao registro de origem, com
link de volta para o quadro (`board.html`). `tema.html` de hoje só
lista esses recortes, agrupados por tarefa de origem, na ordem em
que as idéias foram finalizadas.

Falta a segunda metade: nada organiza a LEITURA (a ordem é "quando a
idéia foi finalizada", não "o que faz sentido ler primeiro"), nada
identifica dado que mereça virar gráfico, e nada aponta o que a
categoria ainda não cobre.

## O que não muda

- **A leitura crua de hoje continua existindo e continua grátis.**
  Nenhuma das três capacidades substitui `/temas/:categoria` — elas
  se somam a ele. Se o enriquecimento ainda não rodou, ou falhou, a
  página mostra exatamente o que mostra hoje. Ninguém fica sem nada
  por causa de uma feature nova.
- **O modelo rotula, não escreve** — mesmo princípio de
  `recortes.ts`, estendido: nas duas capacidades que EXTRAEM do texto
  (leitura guiada, gráficos), toda saída do modelo aponta para um
  recorte que já existe; nenhuma delas aceita o modelo inventando uma
  frase ou um número que não esteja, literalmente, em algum recorte
  do tema. A terceira (lacunas) é a exceção deliberada — ver abaixo.
- **Todo trecho mantém seu link para o quadro**, mesmo dentro de uma
  leitura reorganizada que mistura recortes de tarefas diferentes.
  Isto muda ONDE o link aparece (por trecho, não só por bloco — ver
  Fase 1) mas não tira o link de lugar nenhum.

## Por que não uma skill por categoria, e por que não n8n

**Não uma skill por categoria.** `Skills/*.skill` neste projeto
documenta um MÓDULO, não uma instância. `taxonomia.ts` e
`recortes.ts` já provam o padrão: um prompt, uma função, chamados com
dados diferentes a cada categoria. Criar uma skill nova a cada
categoria adicionada à `TAXONOMIA` multiplicaria arquivos quase
idênticos sem ganhar nada que a parametrização por `categoria` (e por
`DESCRICOES[categoria]`, já usada na introdução de `tema.html`) não
dê de graça. O correto é: **uma skill, um módulo, parametrizado**.

**Não n8n.** As três capacidades leem do mesmo Postgres, reaproveitam
o sistema de créditos já implementado (`reservar`/`liberar`/
`consumir`, `registrar`) e precisam da mesma garantia de transação
atômica que `recortes.ts` usa hoje (`deleteMany` + `createMany` numa
transação só). Um workflow externo duplicaria tudo isso sem herdar
nenhuma dessas garantias — e somaria mais uma peça (autenticação,
monitoramento, mais um ponto de falha) para orquestrar algo que já
roda dentro do próprio backend. `n8n` compensa quando se está
amarrando várias ferramentas SaaS externas entre si; aqui é tudo
interno, um provedor de IA só, e o padrão já existe.

**O que se constrói, então:** mais um módulo em `api/src/ia/`, no
mesmo desenho de `classificarIdeiaEmSegundoPlano` →
`segmentarIdeiaEmSegundoPlano`, com uma terceira etapa encadeada.

---

## Desenho geral

```
idéia → "finalizado"
   │
   ├─ 1. CLASSIFICAR ────── {assunto, tags}                (já existe)
   │
   ├─ 2. RECORTAR ────────── registros → recortes por tema  (já existe)
   │
   └─ 3. ENRIQUECER ──────── recortes de UM (empresa, categoria)
                              → leitura guiada + gráficos + lacunas
                              (este plano)
```

A etapa 3 não olha para UMA idéia: olha para TODOS os recortes que
aquela empresa já tem naquela categoria, de qualquer idéia — porque
"a leitura de Mercado" é o tema inteiro, não o que uma idéia isolada
disse. Por isso o disparo não é "esta idéia terminou de ser
recortada", é "o conjunto de recortes de (empresa, categoria) mudou".

### Chave de disparo: fingerprint, não flag

Depois que `segmentarIdeiaEmSegundoPlano` grava os recortes de uma
idéia (com sucesso), para cada categoria que essa idéia toca
(`assunto` + `tags`), calcula um fingerprint dos recortes daquela
`(empresa, categoria)`: hash da lista ordenada dos `id`s de recorte
que existem ali agora. Como `recortes.ts` já faz `deleteMany` +
`createMany` completo a cada segmentação, o `id` de cada recorte
troca sempre que o conteúdo de origem muda — então o fingerprint
muda sozinho sempre que há algo novo para reler, mesmo que o TEXTO
final seja idêntico a antes.

Se o fingerprint for igual ao gravado da última síntese, não
reprocessa (idéia reclassificada para a mesma pasta, por exemplo,
não deveria gastar crédito de novo). Se for diferente — ou não
existir síntese ainda — dispara a geração, em segundo plano, sem
travar a resposta que gravou os recortes.

Duas idéias da mesma categoria finalizando quase juntas podem
disparar a etapa 3 duas vezes seguidas para o mesmo `(empresa,
categoria)` — aceitável no volume deste produto (não é um sistema de
alto tráfego), e fica registrado como possível otimização futura
(debounce/fila), não como bloqueio do MVP.

### Modelo de dados

Uma tabela nova, no mesmo espírito de `RecorteTaxonomia`: uma linha
por `(empresa, categoria)`, não por idéia — porque a síntese é do
TEMA, não de uma idéia.

```prisma
model SinteseTema {
  id        String @id @default(uuid()) @db.Uuid
  empresaId String @map("empresa_id") @db.Uuid
  categoria String

  // Fingerprint dos recortes usados na última geração de CADA etapa.
  // Comparado antes de reprocessar — evita gastar crédito reescrevendo
  // a mesma leitura porque uma idéia sem relação nenhuma finalizou.
  fingerprintLeitura  String? @map("fingerprint_leitura")
  fingerprintGraficos String? @map("fingerprint_graficos")
  fingerprintLacunas  String? @map("fingerprint_lacunas")

  // Fase 1
  leitura       Json?    @map("leitura")        // ver contrato abaixo
  statusLeitura String   @default("pendente") @map("status_leitura")
  // "pendente" | "ok" | "falhou"

  // Fase 2 (colunas adicionadas quando a Fase 2 começar a ser construída)
  graficos       Json?  @map("graficos")
  statusGraficos String @default("pendente") @map("status_graficos")

  // Fase 3 (colunas adicionadas quando a Fase 3 começar a ser construída)
  lacunas       Json?  @map("lacunas")
  statusLacunas String @default("pendente") @map("status_lacunas")

  atualizadoEm DateTime @default(now()) @updatedAt @map("atualizado_em")

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  // Uma síntese por tema da empresa — nunca duas linhas concorrentes
  // para "Mercado" da mesma empresa.
  @@unique([empresaId, categoria])
  @@map("sintese_tema")
}
```

Cada fase tem seu próprio `status` e seu próprio `fingerprint`
porque são independentes: gráficos pode estar `pendente` (ainda não
construído, ou nada extraível) enquanto leitura está `ok`. Uma falha
em gráficos nunca esconde uma leitura guiada que já funcionava.

`TipoConsumoIa` (enum já existente em `creditos/registro.ts` e no
schema) ganha um valor novo: `sintese_tema` — para a pergunta "quanto
custou enriquecer os temas" ter resposta separada de "quanto custou
classificar idéias", do mesmo jeito que `classificacao` já é separado
de `assistente`.

### API

Rota nova, não uma extensão de `/temas/:categoria`:

```
GET /empresas/:id/temas/:categoria/sintese
```

Devolve o que já existir (`leitura`, `graficos`, `lacunas`, cada um
com seu `status`), incluindo `pendente`. Separada de propósito: o
contrato de `/temas/:categoria` — instantâneo, sem custo, nunca
espera o modelo — não muda em nada. A síntese é aditiva; se a rota
nova cair, sumir, ou nunca ter rodado para aquele tema, a rota
antiga continua de pé sozinha.

`tema.js` chama as duas em paralelo. A tela desenha o que a rota
antiga sempre desenhou; quando `/sintese` responde com `status: ok`
numa fase, essa parte da tela é substituída ou complementada — nunca
o contrário: o "cru" nunca desaparece por a síntese ter falhado.

---

## Fase 1 — Leitura guiada

**A construir agora**, é a primeira e a única aprovada para começar.

### Contrato (grounding)

Mesmo desenho de `recortes.ts`: os recortes daquele tema entram
NUMERADOS, o modelo devolve só números e agrupamento — nunca texto:

```json
{"secoes":[
  {"titulo":"Tamanho e crescimento do mercado","recortes":[3,1,7]},
  {"titulo":"Concorrência direta","recortes":[2,5]}
]}
```

`titulo` é a ÚNICA coisa nova que o modelo tem permissão de escrever
— um rótulo de seção curto, organizacional, não uma afirmação sobre
o conteúdo. Os `recortes` são só os `id`s (na verdade os números da
numeração enviada) que já existem no banco; o texto de cada um é
montado no servidor a partir de `SinteseTema` → recorte, nunca
copiado da resposta do modelo.

### Leitura pura (`api/src/ia/enriquecimento-leitura.ts`)

Mesmo padrão de `recortes-leitura.ts`: função `interpretar()`, sem
`import`, testável sem rede nem banco.

- número que não existe entre os recortes do tema: descartado, sem
  derrubar a seção inteira;
- número repetido em duas seções: fica na PRIMEIRA (mesma regra de
  `recortes-leitura.ts` para blocos repetidos);
- **recorte que o modelo esqueceu de colocar em alguma seção**: cai
  numa seção final `"Outros trechos"`, gerada pelo servidor, nunca
  pelo modelo. Um recorte nunca pode desaparecer da leitura por o
  modelo ter deixado de citá-lo — a pessoa escreveu aquilo, e a
  leitura guiada não tem autoridade para decidir que não interessa;
- resposta ilegível: `null` (preserva a leitura antiga, se houver —
  mesma distinção null/mapa-vazio de `recortes-leitura.ts` e
  `taxonomia-vocabulario.ts`).

### Onde o link de cada trecho aparece

Hoje um bloco = uma tarefa de origem, e o link "editar no quadro"
fica no fim do bloco. Numa seção que mistura recortes de tarefas
diferentes isso não serve mais — o link precisa ficar por TRECHO, não
por seção. Cada recorte, dentro da leitura guiada, carrega sua
própria referência (estilo nota de rodapé: um ícone ou link curto ao
final do parágrafo, apontando para `board.html` com os IDs daquele
recorte especificamente) — em vez de um link só no fim de um bloco
maior.

A visão atual (agrupada por tarefa, com um link por bloco) não
desaparece: fica disponível como alternância "Ver por atividade de
origem" — útil para quem quer conferir tudo que UMA idéia específica
contribuiu, e é praticamente grátis de manter porque já é o que
`/temas/:categoria` devolve hoje.

### Modelo e custo

Haiku, mesmo `system` em cache `ephemeral`. `max_tokens` proporcional
ao número de recortes do tema (uma seção + rótulo por recorte, no
pior caso). Reserva/liberação/consumo no mesmo padrão de
`taxonomia.ts` e `recortes.ts`, tipo `sintese_tema`.

### Testes

`api/testes/enriquecimento-leitura.test.ts`: JSON válido, seção com
número inexistente, número duplicado entre seções, recorte esquecido
cai em "Outros trechos", resposta ilegível preserva o que já existia.

---

## Fase 2 — Gráficos

**Documentada, não construída.** Começa só depois da Fase 1 validada
em produção.

A maioria dos temas não tem nada extraível em gráfico — um tema
sobre Personas ou UX raramente carrega números comparáveis. Isso é o
resultado NORMAL, não uma falha: `graficos: []` é um estado tão
válido quanto `graficos: [...]`, e a tela não trata ausência de
gráfico como erro nem como vazio (mesma lição já aprendida com "Sem
categoria" — não confundir os três estados).

### Contrato

Mesmos recortes numerados de entrada. Toda saída aponta a origem
literal de cada valor:

```json
{"graficos":[
  {"tipo":"barra","titulo":"Tamanho do mercado por segmento",
   "eixo_x":"Segmento","eixo_y":"R$ milhões",
   "dados":[
     {"rotulo":"B2C","valor":120,"origem":4},
     {"rotulo":"B2B","valor":45,"origem":4}
   ]}
]}
```

`origem` é o número do recorte de onde aquele ponto veio — obrigatório
em CADA ponto, não no gráfico como um todo, porque pontos de um
mesmo gráfico podem vir de recortes diferentes (dois concorrentes
citados em tarefas separadas, por exemplo).

### Leitura pura

- ponto sem `origem` válido (recorte inexistente no tema): descarta
  o PONTO, não o gráfico;
- `valor` que não é número: descarta o ponto;
- gráfico com menos de 2 pontos válidos depois da filtragem: descarta
  o GRÁFICO inteiro (um ponto não é gráfico);
- gráfico sem nenhum ponto válido, ou resposta sem `graficos`:
  `graficos: []`, estado válido, não erro.

### Frontend

Sem biblioteca externa — nenhuma outra tela do produto carrega uma
lib de charts (`grafo.js` é canvas próprio, sem `d3`), e poucos tipos
simples (barra, linha, pizza) a partir de um spec pequeno se
resolvem em SVG gerado no cliente, no mesmo espírito de
"dependência a menos para auditar" já usado em `provedor.ts`. Cada
gráfico mostra, junto, um link "ver o trecho de onde veio este dado"
— mesmo princípio de rastreabilidade que já rege a página inteira.

### Modelo

Sonnet — extrair o número certo do contexto certo ("cresceu 20%" pode
ser do mercado inteiro ou de um concorrente específico citado no
parágrafo ao lado) é uma tarefa que se beneficia de mais raciocínio
do que rotular blocos.

---

## Fase 3 — Lacunas

**Documentada, não construída.** Começa só depois da Fase 2 validada.

### A diferença de contrato

As duas fases anteriores EXTRAEM do texto — toda saída aponta para
algo que já existe. Lacunas é o oposto: aponta AUSÊNCIA. Não há como
citar `origem` para algo que não está escrito, então o contrato de
"prova" que rege as outras duas simplesmente não se aplica aqui.
Isto precisa ficar visível na interface: a lista de lacunas é
rotulada como sugestão da IA, nunca como fato levantado do material.

### Ancoragem ao tema

Entrada: os recortes do tema (o que já se sabe) **mais**
`DESCRICOES[categoria]` — a mesma frase que já escrevemos para a
introdução da página (`js/tema.js`). Isto ancora a sugestão ao
ESCOPO da categoria, que era exatamente o pedido original ("sempre
ligado ao tema selecionado"): o prompt instrui explicitamente a nunca
sugerir algo que pertença a OUTRA categoria da taxonomia — se o
material de "Mercado" sugere que falta pesquisa qualitativa, isso é
lacuna de "Pesquisa Qualitativa", não de "Mercado", e fica de fora.

### Leitura pura

Sem como validar grounding (não há recorte para provar ausência), a
defesa possível é outra: descartar sugestão cujo texto é redundante
com algo que os recortes já cobrem (checagem simples de similaridade
textual) — mitigação, não garantia. Lista curta: 3 a 5 sugestões,
frase única cada.

### Frontend

Painel à parte, "Para aprofundar em {categoria}", texto simples, sem
ação (decisão já travada para a v1 — ver tabela no topo). Um botão
"criar idéia a partir disto" fica como próxima etapa explícita, não
como algo a decidir agora junto com o resto.

### Modelo

Sonnet.

---

## Ordem de entrega (Fase 1)

1. Migration: `SinteseTema`, só as colunas de leitura
   (`fingerprintLeitura`, `leitura`, `statusLeitura`) mais as
   colunas de fingerprint/status das Fases 2 e 3 já criadas vazias
   (evita uma segunda migration de coluna por fase — mais barato
   migrar a tabela uma vez com todas as colunas do que três vezes).
2. `TipoConsumoIa`: adicionar `sintese_tema` ao enum (migration
   junto com a de cima).
3. `api/src/ia/enriquecimento-leitura.ts` — `interpretar()`, puro,
   sem `import`. Testes primeiro.
4. `api/src/ia/enriquecimento.ts` — chamada ao modelo (prompt,
   `system` em cache), cálculo do fingerprint, custo
   (reservar/liberar/consumir), gravação em `SinteseTema` (upsert por
   `(empresaId, categoria)`).
5. Disparo: dentro de `segmentarIdeiaEmSegundoPlano`
   (`api/src/ia/recortes.ts`), depois da transação que grava os
   recortes com sucesso — para cada categoria que a idéia toca,
   chama `enriquecerLeituraEmSegundoPlano(empresaId, categoria)` sem
   `await` (mesmo padrão fire-and-forget já usado para disparar a
   segmentação a partir de `taxonomia.ts`).
6. Rota `GET /empresas/:id/temas/:categoria/sintese`
   (`api/src/rotas/grafo.ts`, ao lado de `/temas/:categoria`).
7. `tema.html` / `js/tema.js`: busca `/sintese` em paralelo com
   `/temas/:categoria`; quando `statusLeitura === "ok"`, troca a
   lista bruta pela leitura guiada (com o link por trecho descrito
   acima) e mantém a alternância "Ver por atividade de origem";
   `pendente`/`falhou` mantém a tela exatamente como é hoje.
8. `Skills/enriquecimento-tema.skill` — escrita ao fechar a fase,
   documentando o que foi de fato construído (mesmo padrão de
   `categorizacao-taxonomia.skill`: escrita depois do código, não
   antes). Referenciar de volta em `categorizacao-taxonomia.skill`,
   na seção "As três projeções", como uma quarta camada sobre a
   mesma base de recortes.

Fases 2 e 3 repetem o mesmo formato de entrega (migration menor,
módulo, disparo, rota já existente ganha o campo, frontend), cada
uma só depois de validar a anterior em uso real.
