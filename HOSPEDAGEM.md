# Hospedagem — Render

> **Endereço:** `https://www.plataformadedesign.com` · **Ambiente:** demonstração · **Banco:** Neon (`us-east-2` / Ohio) · **Escrito em** 17/09/2026

Um serviço só, API e site na mesma origem. A configuração está em
[`render.yaml`](render.yaml), que tem o porquê de cada escolha.

---

## 1. O que eu mudei para isto ser possível

Três coisas estavam no caminho. Nenhuma aparecia em desenvolvimento.

**`npm start` nunca funcionou.** O `tsconfig.json` inclui `src`, `testes`,
`corpus` e os scripts da raiz com `rootDir: "."`, então o `tsc` preservava a
hierarquia e o servidor saía em `dist/src/servidor.js` — enquanto o `start`
aponta para `dist/servidor.js`. Ninguém tinha notado porque o desenvolvimento
roda `tsx watch src/servidor.ts`, que não usa o `dist`. Novo
`api/tsconfig.build.json` com `rootDir: "src"`, e o `build` passou a usá-lo. De
quebra, o que vai ao ar não leva mais testes nem corpus.

**A porta.** Render (e Fly, e Railway) injeta a porta em `PORT` e sonda ela. O
`env.ts` lia só `PORTA` e subia em 3333 — o deploy falharia com a API dizendo
no log que estava de pé. Agora `PORTA` tem `PORT` como alternativa, com
`PORTA` ganhando quando os dois existem.

**Três páginas internas ficariam públicas.** Arquivo estático não passa pela
sessão, e a allowlist serve qualquer `/<nome>.html` da raiz. A grave é
`mapa-regras-negocio.html`: ela embute os 26 documentos de regra inteiros,
incluindo a lógica de preço e a discussão da alíquota de comissão — e
`DIN-007` diz que essa separação é interna e não sai em tela, API, extrato nem
exportação. Uma URL pública é a exportação mais completa que existe. Bloqueadas
**só em produção** (`NODE_ENV=production`): em desenvolvimento continuam sendo
ferramenta de trabalho. São elas, em `api/src/servidor.ts`:

- `mapa-regras-negocio.html`
- `styleguide.html`
- `sobre-empresa-empty-state.html`

**Os endereços perderam o `.html`.** Você pediu `/login`, e é o que a
plataforma passou a ter — sem editar nenhuma das 630 referências a `.html`
espalhadas pelas páginas, pelo js e pelos comentários. O que faz isso é um par
de regras no servidor:

| Pedido | Resposta |
|---|---|
| `/login` | serve `login.html` |
| `/login.html` | **301** para `/login` |
| `/` | 302 para `/login` |

Com o 301 no lugar, todo link interno que ainda diz `.html` continua
funcionando **e deixa a pessoa num endereço limpo**. A barra de endereço da
plataforma inteira ficou sem `.html` sem que uma página precisasse ser tocada;
trocar os links depois é otimização (economiza um salto), não pré-requisito.

Uma exceção, e ela tem motivo: **`empresas.html` atende em `/minhas-empresas`**.
`GET /empresas` já é a rota da API que lista as empresas em JSON, e registrar a
página no mesmo endereço derruba o servidor na partida com
`FST_ERR_DUPLICATED_ROUTE` — foi assim que isto apareceu, provando o servidor
com `NODE_ENV=production` antes de subir. `minhas-empresas` não é nome
inventado: é como a própria plataforma chama a página (`js/login.js`). A
correção de verdade é a API morar sob `/api/...`, e está na lista de pendências
(§7) — mexe em toda chamada do frontend, então não entrou junto com a
hospedagem.

---

## 2. Antes de subir — decida o banco

O `DATABASE_URL` do `render.yaml` vem em branco de propósito. **Não aponte o
deploy para o mesmo banco que você usa na sua máquina**, mesmo sendo um
ambiente de demonstração: o `buildCommand` roda `prisma migrate deploy` em cada
deploy, e qualquer coisa que você ou eu fizermos ali passa a mexer no mesmo
dado que você usa para trabalhar.

O Neon tem *branch* de banco, que resolve isso em dois minutos e sem custo:
no painel do Neon, crie um branch a partir de `main` (ele copia o estado
atual), e use a connection string dele. O deploy fica com uma cópia real dos
seus dados e você continua livre para quebrar o seu.

---

## 3. Criar o serviço

1. ~~**Empurre o repositório.**~~ **Feito em 17/09/2026** — commit `7fe242a`,
   126 arquivos. Ver §5 se precisar repetir o preparo.
2. ~~Confira o branch.~~ **Resolvido mudando de repositório** — ver §5.1. O
   código da 2.0 vive em `ricardosmateus/plataforma-de-design-2-0`, no branch
   `main`, sozinho.

3. No Render: **New → Blueprint**, aponte para
   `ricardosmateus/plataforma-de-design-2-0`. Ele lê o `render.yaml` e já vem
   com o serviço montado.
4. O Render vai pedir os valores marcados como `sync: false`:

   | Variável | O que pôr |
   |---|---|
   | `DATABASE_URL` | A connection string do branch do Neon (§2) |
   | `ORIGENS` | `https://SEU-DOMINIO` — a URL final, com `https://`, sem barra no fim |
   | `IA_API_KEY` | Sua chave da Anthropic |

   `JWT_SEGREDO` e `OTP_PIMENTA` o Render gera sozinho e eu nunca vejo. **Não
   reaproveite os do seu `.env`**: segredo de desenvolvimento circula em
   máquina, backup e histórico de terminal.

5. O primeiro deploy demora alguns minutos (instala, gera o client, migra,
   compila). Se ele falhar, o log diz em qual dos quatro passos.

Ordem importa: o `ORIGENS` precisa da URL final, e a URL final só existe
depois do domínio. Se quiser subir antes de configurar o DNS, ponha o
`onrender.com` no `ORIGENS` agora e troque depois — é uma variável, não um
deploy novo.

---

## 4. O domínio — `www.plataformadedesign.com`

No Render, **Settings → Custom Domains**, adicione **os dois**:

1. `www.plataformadedesign.com` — o endereço de verdade.
2. `plataformadedesign.com` — o domínio raiz, que o Render redireciona para o
   `www` sozinho. Sem ele, quem digitar o endereço sem `www` vê um erro de
   certificado, que assusta mais do que uma página que não carrega.

O Render mostra o valor exato a criar; o formato é este, e quem hospeda o seu
DNS é quem recebe:

| Nome | Tipo | Valor |
|---|---|---|
| `www` | `CNAME` | o host que o Render mostrar (algo como `plataforma-de-design.onrender.com`) |
| `@` (a raiz) | `A` ou `ALIAS`/`ANAME` | o que o Render mostrar para a raiz |

Se o seu provedor de DNS aceitar `ALIAS`/`ANAME` na raiz, prefira a ele em vez
do `A`: endereço de IP de plataforma muda, nome não.

O certificado HTTPS é emitido sozinho alguns minutos depois de o DNS propagar.
Até lá o endereço responde com erro de certificado — é esperado, não é falha
de configuração.

**`ORIGENS` já está preenchido** no `render.yaml` com
`https://www.plataformadedesign.com`. Se você mudar de ideia sobre o `www`,
é essa linha que muda.

**`COOKIE_DOMINIO` continua vazio, de propósito.** Vazio quer dizer cookie
*host-only*: vale só para `www.plataformadedesign.com` e para mais nada. É o
mais restrito, e é o certo enquanto a plataforma vive num endereço só.
Preenchê-lo com `.plataformadedesign.com` estenderia a sessão a **todos** os
subdomínios, presentes e futuros — decisão de segurança, não de configuração,
e só necessária no dia em que dois subdomínios precisarem compartilhar login.

---

## 5. O Git — os comandos são seus

**Por que eu não rodo:** o agente não tem permissão de apagar arquivos nesta
pasta, e o git cria um `.git/index.lock` a cada operação e o remove no fim. Sem
poder remover, cada `add` deixa um lock preso e o comando seguinte falha com
*"Another git process seems to be running"*. Rodando como você, isso não
acontece.

**Antes de qualquer coisa: o repositório está travado desde 8 de setembro.**
Existe um `.git/HEAD.lock` de zero byte daquele dia, sem processo nenhum por
trás — resto de uma operação que morreu no meio. É quase certamente por isso
que o repositório tem um commit só e 112 alterações pendentes: o git vinha
recusando escrever e o aviso passou batido. Há também 533 objetos temporários
órfãos em `.git/objects`, da mesma causa e das minhas tentativas.

**Os blocos abaixo não têm comentário nenhum, de propósito.** No zsh
interativo do macOS o `#` não abre comentário: uma linha comentada é executada,
e um parêntese dentro dela derruba o bloco inteiro com `parse error near ')'` —
sem que nada chegue a rodar. Aconteceu aqui em 17/09/2026.

**Passo 1 — limpar e preparar.** Solta os locks travados, recolhe os objetos
órfãos (mexe só no que está inalcançável) e refaz o preparo com o `.gitignore`
novo, que exclui `_to_delete/`:

```
cd "/Users/RicardoMateus/projetos/Plataforma de Design 2.0"
rm -f .git/HEAD.lock .git/index.lock .git/index.lock.morto-08-09 .git/index.lock.morto-2
git gc --prune=now
git reset
git add -A
```

**Passo 2 — conferir antes de gravar.** A primeira linha deve imprimir
`ok: nenhum descarte nem .env`; a segunda, `123`:

```
git diff --cached --name-only | grep -E "^_to_delete/|\.env$" || echo "ok: nenhum descarte nem .env"
git diff --cached --name-only | wc -l
```

**Passo 3 — gravar e publicar.** Só depois que o passo 2 estiver limpo:

```
git commit -F - <<'MSG'
Prepara a hospedagem no Render e fecha a dívida de documentação

Hospedagem
- render.yaml: um serviço, API e site na mesma origem, região Ohio
- api/tsconfig.build.json: o build sai em dist/servidor.js, que é onde
  o npm start sempre esperou por ele. Antes saía em dist/src/ e o
  start nunca tinha funcionado
- PORT passa a valer como alternativa a PORTA, que é como as
  hospedagens injetam a porta
- Endereços sem .html, com 301 canonizando os antigos
- Páginas internas bloqueadas quando NODE_ENV=production

Regras de negócio
- DIN-013: valor em reais aparece num lugar só
- DIN-014: consumo medido e não lançado aparece no Histórico, marcado
- IDEIA-DUPL recalibrado para 0.7/0.3: a calibração antiga nunca
  disparava. A confirmação de ação da IA passa a checar duplicidade
- SOBRE-GRAFO-007 e SOBRE-FALTA-005: grafo e balde sem pasta filtram
  por finalizado
- BOARD-SALVA-007 e BOARD-LEITURA-007: montar não é gravar, e a trava
  de leitura mora em cada porta que cria conteúdo
- Dívida das decisões D1 e D11 a D14 fechada em quatro etapas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YUfAZgshmAb6LGjD1iuM7F
MSG
```

```
git push -u origin main
```

O `-u origin main` vale a partir de 18/09/2026, quando o branch local passou a
se chamar `main` e o remoto mudou para o repositório próprio da aplicação —
ver §5.1.

Se o passo 4 achar alguma coisa, **pare** e me diga o que apareceu.

Duas sobras inofensivas na sua máquina, ambas ignoradas pelo Git: `api/dist`
com o build antigo na hierarquia errada, e `_to_delete/prova-deploy-17-09/`
com o pacote que usei para provar o servidor antes de subir.

---

### 5.1 Por que a aplicação mudou de repositório (duas vezes)

Descoberto em 18/09/2026, logo depois do primeiro `push`: o repositório
`plataforma-de-design-workspace` já tinha um branch `main` com **outro
projeto** — `banco_de_dados`, `docs`, `pesquisas`, `regras_de_negocio`,
`sobre_a_empresa`. Dois commits, e `git merge-base` não acha ancestral comum
com o nosso: são histórias independentes que dividiam um endereço.

Isso quebraria o deploy de um jeito difícil de diagnosticar. O Render lê o
`render.yaml` do **branch padrão**, e o padrão era `main` — ele procuraria no
projeto errado e diria que não achou `render.yaml`, o que soa como arquivo
faltando, não como branch trocado.

Dava para contornar apontando o Render para `master`. Não foi o caminho
escolhido: o contorno some do lugar onde se pensa nele, e o próximo deploy
(ou a próxima pessoa) tropeça de novo. A aplicação ganhou repositório próprio,
`ricardosmateus/plataforma-de-design`, com `main` sendo o código e nada mais.
O workspace continua onde sempre esteve, intacto.

**E na segunda tentativa, outra surpresa.** O nome óbvio para o repositório
novo — `plataforma-de-design` — **já existia**, e não estava vazio: Next.js,
Prisma, Storybook, pnpm workspace, 6 commits entre 29/06 e 27/07/2026, com
canvas, kanban, integração Obsidian e assistente de IA. Um deles se chama
"plataforma de design — estado atual do MVP".

É a **geração anterior do mesmo produto**. Sem ancestral comum com a nossa,
parada há sete semanas, enquanto a 2.0 (HTML/JS puro + Fastify) começou em
setembro — o que o próprio nome da pasta local já dizia.

O `push` foi recusado, e foi sorte: um `--force` ali teria apagado junho e
julho. A 2.0 foi para `plataforma-de-design-2-0`, e a 1.0 ficou intocada.

**Três remotos, e é de propósito:**

```
git remote -v
```

| Nome | Aponta para | O que é |
|---|---|---|
| `origin` | `plataforma-de-design-2-0` | a aplicação de hoje, e o que o Render publica |
| `v1` | `plataforma-de-design` | a geração Next.js, jun–jul/2026 |
| `workspace` | `plataforma-de-design-workspace` | documentação, pesquisas e planilhas |

`origin` deixou de apontar para a 1.0 **de propósito**: um `push --force`
distraído com aquele endereço no lugar do `origin` custaria sete semanas de
trabalho. O branch `master` empurrado em 17/09 continua no `workspace`, como
cópia; apagá-lo é opcional e é decisão sua.

---

## 6. Depois que subir — confira nesta ordem

1. `https://www.plataformadedesign.com/saude` → `{"ok":true}`. Se isto falha,
   é banco, não aplicação: o `/saude` faz `SELECT 1`.
2. `https://www.plataformadedesign.com` (a raiz) → deve levar a `/login`, com
   estilo. Sem estilo significa `SERVIR_FRONTEND` desligado ou a allowlist
   recusando o `css/`.
3. `https://plataformadedesign.com` (sem `www`) → deve chegar ao mesmo lugar.
4. Cadastro e login funcionando — é o caminho que exercita cookie `secure`,
   que só liga em produção e portanto nunca rodou na sua máquina.
5. `/mapa-regras-negocio` e `/mapa-regras-negocio.html` → os dois devem dar
   **404**. Se algum abrir, `NODE_ENV` não está como `production`.
6. Uma pesquisa de ponta a ponta. É o teste mais caro e o mais importante: ela
   exercita o SSE atrás do proxy do Render, que é exatamente o que nenhum
   ambiente anterior testou.

---

## 7. O que fica pendente

- **Pix real — passo 1, preparado em 22/09/2026.** `render.yaml` já está com
  `PSP_DRIVER=mercado_pago` e as duas credenciais como `sync: false`. Falta,
  no painel: preencher `MERCADO_PAGO_ACCESS_TOKEN` e
  `MERCADO_PAGO_WEBHOOK_SECRET` no Render, e cadastrar o webhook no Mercado
  Pago apontando para
  `https://app.plataformadedesign.com/webhooks/pix/mercado-pago`
  (`SEG-PAG-003` exige HTTPS público válido — o que este deploy tem).
  **Cuidado:** `env.ts` faz `process.exit(1)` se o driver for `mercado_pago`
  e alguma credencial estiver vazia. Subir sem preencher tira a API do ar,
  não degrada. Confirme com um Pix de valor baixo antes do passo 2 — foi
  assim que a Fase 4 foi validada em 01/09/2026.
- **Cobrança — passo 2, ainda não dado.** `CREDITOS_COBRAR=nao`. Enquanto
  estiver assim, o consumo é medido e aparece no Histórico de uso marcado
  como "medido, não cobrado" (`DIN-011`/`DIN-014`) — esse rótulo é o
  comportamento esperado, não defeito.

  **Não vire esta chave antes do passo 1 estar confirmado.** Não existe saldo
  inicial nem crédito de boas-vindas no produto: toda conta começa em zero.
  Ligar a cobrança sem compra funcionando bloqueia assistente, pesquisa,
  classificação e recortes para todo mundo na primeira chamada, sem caminho
  para destravar. Antes de virar, credite as contas ativas com
  `npm run creditar -- email@dominio.com 50 "motivo"` (`SEG-PAG-006`).

  E vale saber o que a chave desligada custa hoje: com ela em `nao`,
  `reservar()` volta na primeira linha — nada é debitado, não existe
  `SaldoInsuficiente` e, desde que o teto por investigação saiu (`18d58cb`),
  a pesquisa não tem limite algum. O gasto real segue acontecendo na conta do
  provedor de IA. O passo 2 é o que rearma essa proteção.
- **Plano do Render.** `starter` não dorme. Se trocar para o gratuito, o
  serviço hiberna depois de 15 minutos de inatividade: a primeira visita
  espera o processo subir, e a confirmação de um pagamento chega atrasada.
- **Logotipos.** `S3_DRIVER` não está configurado; upload de logotipo de
  empresa não vai funcionar até apontar um bucket.
- **A API sob `/api/...`.** Hoje página e dado dividem a raiz, e já se
  encontraram uma vez (`/empresas`). Enquanto for um caso, a exceção em
  `api/src/servidor.ts` resolve; no segundo, a resposta é prefixar a API. É a
  única dívida que este deploy criou de propósito.
- **Os links internos.** Continuam dizendo `.html` e chegam ao endereço limpo
  por um 301. Funciona e é correto; trocá-los economiza um salto por navegação.
