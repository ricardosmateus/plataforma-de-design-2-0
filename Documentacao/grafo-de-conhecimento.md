# Grafo de conhecimento — "Sobre a empresa"

O que esta página mostra não é um cadastro à parte: é o que já está
no quadro de idéias, lido de outro ângulo. Nada aqui se preenche à
mão.

---

## A regra que governa tudo

**O dado do mapa é consequência do status, não conteúdo próprio.**

| Movimento no quadro | O que acontece com `assunto` e `tags` |
|---|---|
| Entra em **finalizado** | Classificação dispara (assíncrona) e preenche |
| Sai de **finalizado** | Apagados **na mesma escrita** que muda o status |
| Texto editado em finalizado | Reclassifica |
| Arquivada | Some das consultas (filtro `arquivado_em IS NULL`) |

A assimetria entre as duas primeiras linhas é deliberada:

- **Classificar** é caro, lento e pode falhar. Fica fora do caminho
  da resposta — mover um card não espera a IA nem falha com ela.
- **Limpar** é barato e não pode falhar. Acontece dentro da mesma
  escrita do status. Se fosse assíncrona, existiria uma janela em
  que a página mostraria conhecimento que a pessoa já retirou de lá.

Há uma trava contra corrida: a classificação relê o status no
`WHERE` na hora de gravar. Arrastar o card de volta enquanto o
modelo responde não ressuscita a pasta.

---

## Taxonomia — vocabulário fechado

Cinco domínios, 24 categorias (`src/ia/taxonomia-vocabulario.ts` é a
fonte única; o cliente e a rota de cobertura leem de lá).

| Domínio | Categorias |
|---|---|
| Descoberta | Personas, Concorrentes, Mercado, Benchmark, Pesquisa Qualitativa, Pesquisa Quantitativa |
| Produto | Funcionalidades, MVP, Roadmap, Requisitos, Backlog |
| Experiência | Jornada do Usuário, UX, UI, Design System, Acessibilidade |
| Negócio | Estratégia, KPIs, Posicionamento |
| Tecnologia | APIs, IA, Arquitetura, Integrações |

Categoria fora da lista é **recusada**, não corrigida depois na tela.
Um modelo livre para inventar produz "Concorrentes", "Concorrência" e
"Análise de concorrentes" como três pastas em poucas semanas.

Tolerâncias e resgates, nessa ordem:

1. Caixa e acento não importam (`"jornada do usuario"` → `Jornada do Usuário`).
2. Assunto inválido **com** alguma tag válida: a primeira tag vira a
   pasta. O modelo mostrou que entendeu o vocabulário e errou só em
   qual promover.
3. Nada válido: sem classificação — e a idéia aparece no balde
   "Sem categoria", nunca em silêncio.

A resposta do modelo é pré-preenchida com `{"assunto":"`, então ele
continua dali e não tem por onde escrever prosa ou cerca de código.

---

## Duas leituras do mesmo dado

- `assunto` — **uma** por idéia. É a pasta: hierarquia.
- `tags` — até três. São as arestas: rede.

Por isso são dois endpoints, e não um:

| Rota | Responde | Quem usa |
|---|---|---|
| `GET /empresas/:id/sobre` | quais pastas existem, quantas sem pasta, cobertura por domínio | lista de pastas, anel de contexto |
| `GET /empresas/:id/grafo` | nós e arestas | desenho e painel |
| `POST /empresas/:id/reclassificar` | tenta de novo nas finalizadas sem pasta (lote de 25) | botão do balde |

Servir tudo por uma rota obrigaria a lista de pastas a baixar todas
as idéias da empresa para exibir cinco linhas.

No grafo, **categorias são nós de verdade**, não rótulos: é nelas que
as idéias se agrupam e é por elas que idéias de projetos diferentes
acabam ligadas. Sem esse nó intermediário o grafo vira uma nuvem de
pontos soltos. Teto de 400 nós, com aviso (`truncado`) em vez de
recorte silencioso.

---

## Arquivos

**Servidor**

- `src/ia/taxonomia-vocabulario.ts` — categorias e leitura da resposta. Sem `import`: é lógica pura, testável sem subir nada.
- `src/ia/taxonomia.ts` — chamada ao Haiku (cache `ephemeral` no bloco fixo), gravação, limpeza.
- `src/rotas/ideias.ts` — disparadores nas rotas de status e de edição.
- `src/rotas/empresas.ts` — `/sobre`, `/grafo`, `/reclassificar`.
- `scripts/classificar-pendentes.ts` — backfill; imprime o texto cru do modelo quando falha.

**Página**

- `js/sobre-empresa-semana2.js` — pastas, balde "Sem categoria", anel de contexto.
- `js/grafo.js` — simulação de forças em canvas, sem biblioteca.
- `js/grafo-painel.js` — o painel; é o grafo em HTML navegável.
- `js/tema.js` — o texto de uma categoria, recortado por tema. É a que o Ctrl+F encontra.

**Testes**

- `src/ideias/transicao.ts` — o que cada mudança de coluna significa. Sem `import`, pelo mesmo motivo do vocabulário.
- `testes/taxonomia.test.ts` — 18 casos do vocabulário fechado, sem banco nem rede.
- `testes/transicao.test.ts` — 10 casos, as nove combinações de coluna. É aqui que a regra crítica está protegida.
- `testes/transicao-integracao.test.ts` — a mesma regra, mas escrevendo de verdade num Postgres via `construirApp()` + `app.inject`. Opt-in: pula sozinho sem `DATABASE_URL_TESTE` no `.env`.
- `testes/_precisam_de_banco/` — fora do caminho até existir um banco de teste. O que estava ali escrevia no Neon de produção.

---

## Escopo: a visão é interna

Chegou a existir um plano de sincronizar com o Obsidian. **Foi
descartado.** A leitura do conhecimento acontece dentro da
plataforma — pastas, grafo e painel — e não há exportação nem
integração externa prevista. As menções ao Obsidian que sobrarem em
documentos antigos são registro do desenho anterior, não plano.

O que se herda dele é só a ideia de interação: clicar num nó e
aprofundar sem sair do lugar.

---

## Decisões que não são óbvias

**Canvas, não SVG.** Centenas de nós por quadro; em SVG isso é o
mesmo número de elementos no DOM e o navegador passa mais tempo
reconciliando árvore do que desenhando.

**Sem biblioteca de forças.** A simulação são ~60 linhas. d3-force
somaria uma dependência externa à página — a mesma escolha que
`provedor.ts` faz ao não usar o SDK da Anthropic.

**Posição inicial em espiral áurea, não aleatória.** Duas cargas da
mesma empresa produzem o mesmo desenho. Um grafo que muda de forma a
cada F5 parece quebrado mesmo quando não está.

**Falha da IA não é uma coisa só.** Numa reclassificação, tratar
todas igual produz o pior resultado: o texto mudou e a pasta antiga
fica descrevendo conteúdo que não existe mais — errada e plausível.
Então `falhaDefinitiva()` separa: o modelo respondeu e não soube
enquadrar, apaga (a idéia cai no balde, visível); não houve resposta
(rede, provedor, IA desligada), não mexe — um soluço de conexão não
pode esvaziar as pastas de ninguém. O `switch` é exaustivo de
propósito: motivo novo para a compilação e obriga a decisão.

**A regra crítica é uma função pura.** Ela estava verificável só com
um banco de pé — e regra importante que só o teste de integração
cobre é, na prática, regra sem teste: o de integração é o primeiro a
ser pulado quando o ambiente falha. A rota decide *como* escrever;
`planejarTransicao` decide *o que a transição significa*, e isso são
nove combinações que rodam em milissegundos. A regra também é escrita
como o complemento de "finalizado", não como lista de destinos: uma
coluna nova no quadro já nasce limpando.

**A acessibilidade não está no canvas** — ele é `aria-hidden`. Está
no painel e nas outras projeções, em HTML com foco, teclado e Esc.
As três não são redundância: as pastas resumem (quantas, onde), o
grafo desenha (o que se liga a quê) e a página de tema mostra o
texto (o que foi escrito sobre isto). Só a última é encontrável por
Ctrl+F, e é ela que permite ao canvas ser decorativo sem que nada se
perca.

**A pasta tem endereço** (`?pasta=Personas`). Sem isso, "Acessar
pasta" não sobrevive a um F5 nem se compartilha.

**O anel de contexto mede cobertura real** dos cinco domínios. Era um
`68%` fixo do protótipo — numa tela que mostra dado verdadeiro, um
número inventado ao lado não é enfeite, é desinformação.

---

## O bug que durou uma semana

`GET /sobre` usava `$queryRaw` com o id da empresa interpolado. O
Prisma manda a string como `text`, `empresa_id` é `uuid`, e o
Postgres recusa a comparação — a rota devolvia **500 em toda
chamada** desde que foi escrita. A lista de pastas nunca poderia
aparecer.

Passou despercebido porque o `catch` do cliente caía no estado
vazio: *"Nenhuma atividade finalizada ainda"*. Tranquilizador e
falso — o servidor em chamas e a tela dizendo que faltava a pessoa
trabalhar. O grafo tinha o mesmo defeito, caindo para a ilustração
decorativa.

Duas lições, nessa ordem:

1. **Estado vazio é uma afirmação sobre os dados.** Só cabe quando o
   servidor respondeu. Sem resposta, a tela diz que não conseguiu
   carregar — nunca que não há nada.
2. **SQL cru precisa comprar alguma coisa.** Aquela consulta não
   fazia nada que o `groupBy` tipado não fizesse; era complexidade
   por hábito, e trouxe junto uma classe de erro que a API tipada
   não tem.

---

## Escala (Semana 6)

Dois problemas de tamanho diferente, com duas respostas diferentes:

**A consulta não pode explodir.** `/grafo` tem teto de 400 idéias no
servidor (`TETO` em `src/rotas/empresas.ts`), com `truncado`/`teto`
na resposta. Isto protege o banco e a rede.

**O desenho não pode virar ruído visual.** O plano original já
avisava: *"grafos de força ficam ilegíveis acima de ~150 nós"*. Um
segundo teto, no cliente (`LIMIAR_IDEIAS_ATIVAS = 130` em
`js/grafo.js`), decide quais idéias entram na simulação física e são
desenhadas. As mais recentes ficam ativas — a API já devolve nessa
ordem, então "as primeiras N" já são "as N mais recentes". O
excedente de cada categoria fica **dobrado**: some do canvas, mas
continua existindo para o painel e para a lista de conhecimento (a
categoria ganha um "+K" no rótulo). É o drill-down que o plano
pedia — só que a expansão acontece no painel, que já pagina bem uma
lista longa, em vez de dentro da simulação de física.

As **categorias nunca são dobradas** (no máximo 24): é o esqueleto
da taxonomia, e ele precisa continuar visível mesmo quando nenhuma
idéia individual dessa categoria couber no teto.

**Zoom e pan.** Roda do mouse dá zoom re-ancorado no ponto sob o
cursor (dar zoom não empurra o que se está olhando para fora da
tela); arrastar o fundo faz pan; um botão "Centralizar" aparece só
quando a vista saiu do padrão. A física continua alheia a tudo isso
— os nós guardam coordenadas de mundo, e `vista` é só a lente entre
mundo e tela. Sem gestos de toque: a página já é desktop-only (`body
min-width: 1024px`).

---

## O que ainda não está feito

- **Ainda é polling**, não webhook. Mas agora é proporcional: a aba
  oculta não pergunta nada, o intervalo cresce de 5s para 30s quando
  nada muda, e voltar o foco pergunta na hora. O webhook continua
  sendo o certo; deixou de ser urgente.
- **Escala resolvida no cliente, não no servidor.** O teto de 400
  (`/grafo`) evita a consulta explodir; o teto de 130 idéias ativas
  (`js/grafo.js`) evita o *desenho* explodir — são dois problemas
  diferentes com dois tetos diferentes. Falta medir com uma empresa
  grande de verdade: os números (130, e o zoom mínimo/máximo) foram
  escolhidos por raciocínio, não por perfilamento.
- ~~Teste de integração escrito, falta configurar.~~ **Feito.**
  `transicao-integracao.test.ts` prova a escrita — não só a decisão —
  indo pela rota real (`app.inject`, não Prisma direto). Roda com
  `npm run teste:integracao` contra uma branch de teste isolada no
  Neon (host diferente do banco de produção). `DATABASE_URL_TESTE`
  ausente faz a suíte pular sozinha, com aviso, em vez de falhar para
  quem não configurou. Os 4 casos passam (`# pass 4 / # fail 0`),
  confirmado gravando de verdade: a regra crítica sai de "finalizado"
  → `assunto`/`tags`/`taxonomia_manual` zerados na mesma escrita, o
  campo não é tocado entre `ideias`↔`andamento`, a classificação por
  IA é assíncrona (não trava o PATCH), e mover para a mesma coluna
  não escreve. Achado e corrigido no caminho: a constante que lia
  `DATABASE_URL_TESTE` ficava no topo do arquivo, antes de qualquer
  código carregar o `.env` — a suíte pulava mesmo configurada certo.
  Corrigido carregando o `.env` ali mesmo, antes de ler a variável.
