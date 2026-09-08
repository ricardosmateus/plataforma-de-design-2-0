# Regras de Negócio — Listagem de Empresas

> **Versão:** 2.2.0 · **Status:** Tela funcional sobre o layout aprovado · **Falta rodar a migração**
> **Módulo:** Empresas · **Página:** `empresas.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`../acesso/login.md`](../acesso/login.md) — identidade, vínculos e cascata de roteamento

---

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Minhas Empresas |
| Módulo | Empresas |
| Rota | `/empresas.html` |
| Arquivo de interface | `empresas.html` |
| Arquivo de comportamento | `js/empresas.js` (estado) + embutido *(dívida — ver §8)* |
| Arquivo de regras | `Regras_de_negocio/modulos/empresas/empresas-listagem.md` *(este documento)* |
| Entidades | `empresas`, `empresa_membros`, `users`, `perfil_especialista` |
| Componentes | Rail, Cabeçalho de página, Card de empresa, Estado vazio, Modal de criação, Painel de perfil, Toast |
| Páginas relacionadas | `criar-empresa.html`, `projetos.html`, `login.html` |

**É a página principal da plataforma.** Desde a `ACS-LOGIN-017` (22/08/2026), a cascata de roteamento deposita aqui **todo mundo que entra** — com vínculo ou sem nenhum, proprietário ou especialista. Não é mais "a tela de quem já tem empresa": é a porta de entrada do produto, e o estado vazio é a primeira coisa que uma conta nova vê.

---

## 1. Regras

### 1.1 O que a listagem mostra — `EMP-LIST`

| ID | Regra | Fonte |
|---|---|---|
| EMP-LIST-001 | A listagem mostra, na mesma tela, as empresas que a pessoa **possui** e aquelas em que foi **contratada**. | `login.md` §2.1 (D1) e §4 |
| EMP-LIST-002 | Cada card indica o papel da pessoa naquela empresa. | **[PROPOSTA]** — decorre de EMP-LIST-001 |
| EMP-LIST-003 | Sem nenhuma empresa, a tela mostra o estado vazio em vez de uma grade em branco. | Interface existente |
| EMP-LIST-004 | Criar empresa usa **sempre o modal**, tanto no estado vazio quanto na listagem. O botão do estado vazio diz *Nova empresa*. | Layout aprovado |
| EMP-LIST-005 | Quem ativou perfil de designer de apoio e ainda não foi contratado vê uma variante própria do estado vazio. | Decidido 22/08/2026 |
| EMP-LIST-006 | Abrir uma empresa leva aos projetos dela. | Interface existente |
| EMP-LIST-007 | A listagem é o destino de **todo** login bem-sucedido de não-administrador, inclusive de quem não tem vínculo nenhum. Não existe rota alternativa para "conta nova". | `login.md` ACS-LOGIN-017 |

### 1.2 De onde vem a resposta "você não tem empresa" — `EMP-LIST-008` a `EMP-LIST-012`

| ID | Regra | Fonte |
|---|---|---|
| EMP-LIST-008 | **Conta nova nasce sem empresa.** O cadastro não cria empresa alguma — nem implícita, nem "pessoal", nem de exemplo. Toda conta recém-criada tem zero linhas em `empresa_membros` e, portanto, vê o estado vazio no primeiro acesso. | Decidido 22/08/2026 |
| EMP-LIST-009 | A listagem **não tem dados próprios**. Ela pergunta `GET /empresas` e obedece à resposta. Nenhum dado de exemplo permanece no código da página. | Decidido 22/08/2026 |
| EMP-LIST-010 | **Vazio, carregando e erro são três coisas diferentes.** Uma lista vazia só pode ser afirmada depois de uma resposta `200` com zero itens. Falha de rede, `500` ou timeout **nunca** viram estado vazio. | Decidido 22/08/2026 |
| EMP-LIST-011 | Empresa **arquivada não aparece** na listagem e não conta para decidir se a lista está vazia. Se todas as empresas da pessoa estiverem arquivadas, ela vê o estado vazio. | Decisão **E1**, resolvida 22/08/2026 |
| EMP-LIST-012 | A variante de especialista do estado vazio aparece quando `perfil_especialista.status` for **`em_analise`** ou **`aprovado`**. Perfil em `rascunho` ou `recusado` vê a variante de proprietário. | Decisão **E4**, resolvida 22/08/2026 |

**Por que EMP-LIST-010 merece uma regra própria.** É o defeito mais comum de tela de listagem: a página falha em carregar e, como não tem nada para desenhar, cai no estado vazio. A pessoa lê *"você ainda não tem nenhuma empresa"* — uma **afirmação falsa sobre os dados dela**, dita com toda a confiança, no momento em que ela mais precisa de informação correta. Quem tem cinco empresas e vê essa tela conclui que perdeu tudo. A regra existe para que ausência de resposta nunca seja confundida com resposta negativa.

**Por que EMP-LIST-008 é regra e não obviedade.** É a tentação clássica: criar uma "empresa pessoal" automática no cadastro para que a listagem nunca nasça vazia. Isso pareceria acolhedor e violaria o princípio **"Ensinar antes de executar"** — a pessoa ganharia uma empresa sem entender o que uma empresa é aqui dentro, e a tela que deveria ensinar isso (`criar-empresa.html`, EMP-LIST-004) nunca seria vista. O estado vazio não é uma falha a ser evitada; é a primeira aula.

**Por que EMP-LIST-011 sai assim.** Arquivar existe para tirar da frente o que acabou. Se a empresa arquivada continuasse ocupando a listagem, arquivar não resolveria nada — seria só um rótulo. A consequência aceita é que uma pessoa com histórico pode voltar a ver a tela de "primeira empresa"; o texto do estado vazio precisa funcionar para ela também, e por isso não pode dizer *"bem-vindo à plataforma"*.

**Por que EMP-LIST-012 corta em `em_analise`.** Quem apenas abriu o formulário de especialista e desistiu no meio (`rascunho`) não está esperando convite nenhum — dizer "aguarde contratações" seria prometer algo que não vai acontecer, porque o perfil nunca foi enviado. E quem foi recusado precisa saber disso, não ficar aguardando em silêncio. **Fica registrado como pendência**: o `status = recusado` cai hoje na variante de proprietário, que não menciona a recusa. Isso é aceitável enquanto o módulo de designer de apoio não existe, mas é uma dívida de honestidade — está na §7 como **E5**.

### 1.3 Uma forma de criar — `EMP-LIST-004`

O botão do estado vazio e o do cabeçalho abrem o **mesmo modal**, e o texto é *Nova empresa* nos dois. É o que o layout aprovado determina.

**Registro de um erro meu.** A versão 1.0.0 deste documento dizia que criar com zero empresas usaria o fluxo completo (`criar-empresa.html`) e que o botão diria *Criar primeira empresa* — com uma justificativa inteira sobre "ensinar antes de executar". Aquilo não veio do desenho: foi eu propondo e registrando como se fosse decisão tomada, e depois alterando o HTML aprovado para casar com a regra que eu mesmo tinha escrito. A regra agora descreve a tela, que é a ordem correta.

### 1.4 O designer de apoio sem convite — `EMP-LIST-005`

Quem se oferece como designer de apoio e ainda não foi contratado tem **zero vínculos** — então a lista vem vazia e o estado vazio aparece, sem precisar de regra nenhuma a mais. Confirmado com o Ricardo em 22/08/2026: **é o mesmo estado vazio**, não uma variante.

**Registro de outro erro meu.** Eu tinha criado uma segunda seção na tela — *"Nenhum convite por enquanto"*, com botão *Completar meu perfil* — que não existe no layout aprovado. Foi removida. Se um dia essa distinção valer a pena, ela começa no desenho, não aqui.

---

## 2. Contrato da API — `GET /empresas`

Autorizado em 22/08/2026. É o primeiro endpoint do módulo de empresas.

**Requisição.** `GET /empresas`, autenticada pelo cookie de acesso (`credentials: 'include'`, como todo o resto da `js/api.js`). Sem parâmetros.

**Resposta `200`:**

```json
{
  "empresas": [
    {
      "id": "uuid",
      "nome": "Nike",
      "descricao": "…",
      "logotipo_url": "…ou null",
      "papel": "proprietario | membro | especialista",
      "criado_em": "2026-08-22T14:03:11Z"
    }
  ]
}
```

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Tem empresas | `200` com `empresas` preenchido | Grade de cards |
| Não tem nenhuma | `200` com `"empresas": []` | Estado vazio, variante conforme EMP-LIST-012 |
| Sessão inválida ou expirada | `401` | **Primeiro tenta renovar** por `GET /auth/sessao`; só se a renovação também falhar volta ao login com `?motivo=sessao-expirada&destino=empresas.html` |
| Conta suspensa | `403` | Volta ao login com `?motivo=suspenso&tipo=violacao\|inadimplencia` — quem explica é o login (ACS-LOGIN-012) |
| Falha do servidor | `5xx` | Estado de erro com "Tentar de novo". **Nunca** o estado vazio (EMP-LIST-010) |

### `POST /empresas` — criação

Autorizado em 22/08/2026. Corpo `{ nome, descricao }`; responde `201` com a empresa criada, no mesmo formato dos itens do `GET`.

| Situação | Resposta | O que a tela faz |
|---|---|---|
| Criada | `201` com `empresa` | Insere o card na grade e sai do estado vazio |
| Nome vazio ou longo demais | `400` com `campo: "nome"` | Marca o campo e mostra a mensagem |
| Sessão inválida | `401` | Volta ao login |
| Conta suspensa | `403` | Volta ao login |

**A empresa e o vínculo nascem na mesma transação.** Sem isso, uma falha entre os dois `INSERT` deixaria uma empresa sem dono: invisível na listagem de todo mundo, inclusive de quem acabou de criá-la, e impossível de apagar pela interface.

**O botão trava enquanto a API responde**, senão dois cliques criam duas empresas.

**Por que o 401 não expulsa direto.** O token de acesso vive 15 minutos (ACS-SESSAO-001), então `401` é o caso **normal** de quem deixou a aba aberta — não o caso excepcional. Expulsar para o login em todo `401` mandaria a pessoa reautenticar a cada quinze minutos com a sessão ainda válida. Quem sabe girar o refresh é o `/auth/sessao`; a listagem chama, e só desiste se ele também recusar.

**Por que o `/empresas` não renova sozinho.** Seria mais curto, e erraria: na carga da página duas rotas emitiriam cookies novos em paralelo e uma rotação de refresh anularia a outra — derrubando exatamente a sessão que ambas tentavam salvar. A renovação tem um dono só.

**Nota sobre o primeiro deploy.** Enquanto não existir `POST /api/empresas`, este endpoint devolve `[]` para todo mundo — e isso é **verdade**, não simulação: ninguém consegue criar empresa ainda. É a diferença entre esta tela e o login antes da Fase 4. O login *fingia* validar; esta listagem vai *de fato* consultar o banco e relatar o que encontrou. A tela pode ir ao ar sem mentir.

---

## 3. Modelo de dados proposto

Complementa o §2.5 do [`login.md`](../acesso/login.md), que já previa `empresa_membros` mas não definia `empresas`.

```
empresas
  id                uuid (pk)
  nome              text (not null)
  descricao         text (nullable)
  logotipo_url      text (nullable)
  fonte             text (nullable)     -- identidade visual, ver EMP-LIST-004
  cor               text (nullable)
  criado_por        uuid (fk users)
  arquivado_em      timestamptz (nullable)   -- EMP-LIST-011
  criado_em, atualizado_em

empresa_membros                -- vínculo N:N entre users e empresas
  id                uuid (pk)
  empresa_id        uuid (fk empresas)
  user_id           uuid (fk users)
  papel             enum('proprietario','membro','especialista')
  convidado_por     uuid (fk users, nullable)
  expira_em         timestamptz (nullable)   -- contrato com prazo
  criado_em, revogado_em

  unique (empresa_id, user_id) where revogado_em is null
```

**A consulta que decide o estado vazio:**

```sql
select e.*, m.papel
  from empresa_membros m
  join empresas e on e.id = m.empresa_id
 where m.user_id = $1
   and m.revogado_em is null        -- vínculo ativo
   and (m.expira_em is null or m.expira_em > now())   -- contrato vigente
   and e.arquivado_em is null       -- EMP-LIST-011
 order by e.criado_em desc;
```

Zero linhas ⇒ estado vazio. Três filtros, três razões distintas de a empresa não contar: **o vínculo foi revogado**, **o contrato venceu**, **a empresa foi arquivada**. As três levam à mesma tela, e é por isso que a mensagem do estado vazio não pode presumir que a pessoa é novata.

**Fica em aberto:** o índice único parcial acima impede vínculo duplicado ativo, mas permite recontratar depois de revogar. É o comportamento desejado para o especialista que volta a trabalhar com o mesmo cliente.

---

## 4. Estados obrigatórios

| Estado | Situação | Observação |
|---|---|---|
| Primeiro acesso | ✅ **É o estado vazio** | Conta nova cai aqui, sem tela intermediária — EMP-LIST-007, EMP-LIST-008 |
| Vazio | ✅ Duas variantes: proprietário e especialista | EMP-LIST-003, EMP-LIST-005, EMP-LIST-012 |
| Carregando | ✅ Esqueleto de três cards | Ocupa o lugar dos cards, então a página não salta. Nunca vira vazio — EMP-LIST-010 |
| Sucesso | ✅ Toast ao criar e ao editar | — |
| Erro | ✅ `#estadoErro` com "Tentar de novo" | `5xx` e falha de rede. Mensagem distinta para os dois |
| Sem permissão | ✅ `403` → login com `?motivo=suspenso&tipo=` | O login explica motivo e saída |
| Arquivado | ✅ Filtro no servidor | `empresa: { arquivadoEm: null }` na consulta — EMP-LIST-011 |
| Offline | ✅ Tratado como erro de rede | `e.rede` produz mensagem própria sobre conexão |
| Sessão expirada | ✅ Renova antes de desistir | `401` → `/auth/sessao`; falhando, login com `?motivo=sessao-expirada&destino=` |
| Integração indisponível | **Não se aplica** | A listagem não depende de provedor externo. Justificado |

**Nove dos dez resolvidos**, um justificado. Todos verificados em `t-empresas.js` (9 cenários, incluindo o que garante que `500` não vira estado vazio). Antes desta versão eram três resolvidos e **sete sem regra nenhuma** — não porque faltava esforço, mas porque sem contrato de API não havia o que decidir. Definir o contrato na §2 desbloqueou seis estados de uma vez.

---

## 5. Como inspecionar os estados

Os botões flutuantes de debug saíram da tela em 22/08/2026. No lugar entrou parâmetro de URL, o mesmo padrão do `?motivo=` no login:

| URL | Mostra |
|---|---|
| `empresas.html?estado=vazio` | Estado vazio, variante proprietário |
| `empresas.html?estado=especialista` | Estado vazio, variante especialista |
| `empresas.html?estado=lista` | Listagem com dados de exemplo |
| `empresas.html` | **Passa a consultar a API** (EMP-LIST-009) |

Andaime visível na interface acaba indo para produção. Parâmetro de URL some sozinho.

**Muda com a implementação:** hoje `empresas.html` sem parâmetro cai nos dados de exemplo. Depois de EMP-LIST-009, sem parâmetro significa "pergunte à API". O `?estado=lista` continua útil para inspecionar o layout da grade sem depender de dados reais — mas passa a ser explicitamente andaime, e os dados de exemplo saem do fluxo normal da página.

---

## 6. O que mudou nesta etapa

| Antes | Depois | Regra |
|---|---|---|
| A página decidia pelo array `EMPRESAS` no código | Decide pela resposta do `GET /empresas` | EMP-LIST-009 |
| Erro de carregamento cairia no estado vazio | Erro tem tela própria | EMP-LIST-010 |
| E1 em aberto | Arquivada some da lista | EMP-LIST-011 |
| "Ativou perfil de designer de apoio" sem definição | `status ∈ {em_analise, aprovado}` | EMP-LIST-012 |
| `empresas` não existia no modelo de dados | Tabela especificada e autorizada | §3 |

---

## 7. Decisões

### Resolvidas

| ID | Questão | Decisão | Data |
|---|---|---|---|
| E1 | Empresa arquivada some da lista? | Some, e não conta para o estado vazio | 22/08/2026 |
| E3 | Fonte da verdade do "sem empresas" | API real, não o `vinculos` da sessão | 22/08/2026 |
| E4 | Qual status de especialista dispara a variante | `em_analise` ou `aprovado` | 22/08/2026 |

**Sobre E3.** A alternativa era ler o `vinculos` que `/auth/sessao` já devolve — zero backend novo. Recusada porque criaria dois lugares afirmando o mesmo fato: a sessão, capturada no login, e a listagem, viva. Bastaria um convite aceito em outra aba para os dois discordarem, e o sintoma seria a tela dizer "você não tem empresa" com uma empresa no banco. É a mesma doença que a auditoria de agosto tratou no CSS e a D6 tratou na documentação, agora em dados.

O campo `vinculos` da sessão **continua existindo** e continua servindo à `ACS-LOGIN-016` (decidir se um destino pretendido deve ser retomado). São perguntas diferentes: *"vale a pena retomar o destino?"* tolera uma resposta aproximada de um segundo atrás; *"você tem empresas?"* não.

### Em aberto

**E2 — Créditos por empresa** *(herda a D2 de `login.md`)*
A listagem é o lugar natural para mostrar saldo por empresa, se a D2 for resolvida nesse sentido. Enquanto os créditos viverem no perfil do usuário, não há o que mostrar aqui.

**E5 — O designer de apoio recusado não é avisado**
Por EMP-LIST-012, `status = recusado` cai na variante de proprietário, que não menciona a recusa. A pessoa fica sem saber que foi avaliada. Precisa de tratamento quando o módulo de perfil de designer de apoio existir — provavelmente uma terceira variante, ou um aviso fora do estado vazio.

**E6 — Limite de empresas por conta**
Nenhuma regra impede criar cem empresas, e o `POST /empresas` foi ao ar **sem limite**. Se a D2 for resolvida como "créditos por empresa", isso vira vetor de abuso direto: cada empresa nova seria uma cota nova de IA gratuita. Não impede usar hoje; **bloqueia a publicação** se a D2 sair nesse sentido.

---

## 7-A. Lacunas de desenho

Não são dívida técnica: são telas que **não existem no layout aprovado** e que a programação teve que contornar. Contornar não é resolver.

| Estado | Contorno de hoje | O que falta |
|---|---|---|
| Carregando | Grade vazia, em silêncio | Um esqueleto ou indicador desenhado |
| Erro ao carregar | Toast pedindo para recarregar | Uma tela com "Tentar de novo" — o toast não oferece ação |

Ambos eu havia desenhado em 22/08/2026, e **removi** quando ficou claro que o layout aprovado é a fonte da verdade. Entram quando forem desenhados.

**Observação sobre o link "Acessar" do card:** nasce sublinhado, porque esta página não carrega `components.css` nem tem reset de âncora. Está assim no layout aprovado — registro, não corrijo por conta própria.

---

## 8. Dívida técnica

**948 linhas de CSS embutido** — a maior do projeto, acima das 477 que o cadastro tinha. A página não carrega `components.css`, então repete o que já existe no sistema e diverge dele em silêncio.

O sintoma apareceu na hora: os links do estado vazio nasceram **sublinhados**, porque faltava o reset de âncora. É a terceira vez que esse mesmo defeito aparece — antes no `cadastro.html`, e agora aqui. Verificado: **as oito telas do app têm a mesma falta**.

| Tela | Reset de âncora |
|---|---|
| `empresas.html` | ✅ corrigido em 22/08/2026 |
| `criar-empresa.html`, `projetos.html`, `visao_do_projeto.html`, `pesquisa.html`, `matriz_csd.html`, `atividade.html`, `Sobre_a_empresa.html` | ✗ ainda sem |

A correção definitiva não é acrescentar a linha em cada arquivo — é cada tela passar a carregar `components.css`, como `login.html` e `cadastro.html` já fazem. Enquanto isso não acontece, `.empty-alternativa a` reproduz localmente o `.link` do sistema, com comentário registrando que é dívida e não decisão.

**Comportamento embutido no HTML.** A página ainda não tem `js/empresas.js`. A implementação de EMP-LIST-009 é o momento certo de extrair, como foi feito com `js/cadastro.js`: o código que fala com a API não deve nascer dentro de uma tag `<script>` de 2.100 linhas.

---

## 9. Ordem de implementação

Escrita aqui porque a ordem importa: invertida, ela recria o teatro que o login teve.

| # | Passo | Situação |
|---|---|---|
| 1 | Migração: tabelas `empresas` e `empresa_membros` | ✅ escrita — `20260822120000_empresas`. **Falta rodar** `npx prisma migrate deploy` |
| 2 | `GET /empresas` devolvendo a consulta da §3 | ✅ `api/src/rotas/empresas.ts` |
| 3 | Extrair `js/empresas.js` e ligar na API | ✅ o array de exemplo saiu do caminho normal |
| 4 | Estados carregando / erro / offline / 401 / 403 | ✅ nove dos dez estados |
| 5 | Testes de integração | ✅ `t-empresas.js`, 9 cenários |
| 6 | `POST /empresas` — criar de verdade | ✅ grava empresa + vínculo em transação. **Sem limite por conta** — E6 segue aberta |
| 7 | Botões flutuantes de debug fora da tela | ✅ removidos com autorização, 22/08/2026 |

A tela está funcional de ponta a ponta: entra vazia, cria, o card aparece e continua lá depois de recarregar. Falta apenas a migração rodar no banco.

---

## 10. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 2.2.0 | 2026-08-22 | **Alinhamento com o layout aprovado.** EMP-LIST-004 reescrita: o estado vazio abre o **modal**, botão *Nova empresa* — como sempre esteve desenhado. A regra anterior descrevia uma proposta minha, e eu havia alterado o HTML aprovado para casar com ela. EMP-LIST-005 perdeu a variante inventada: designer de apoio sem convite tem zero vínculos e cai no mesmo estado vazio. *Especialista* renomeado para *designer de apoio*. `POST /empresas` implementado, gravando empresa e vínculo em transação. Botões flutuantes de debug removidos, com autorização. Nova §7-A separando lacuna de **desenho** de dívida técnica. |
| 2.1.0 | 2026-08-22 | **Regras implementadas.** Migração `empresas` + `empresa_membros`, endpoint `GET /empresas`, e `js/empresas.js` extraído da página. O array de exemplo com a Nike saiu do caminho normal — era ele que fazia toda conta nova ver uma empresa que não era dela. `vinculos` no `/auth/sessao` deixou de ser `0` cravado. Nove dos dez estados obrigatórios resolvidos. Caminho do endpoint corrigido de `/api/empresas` para `/empresas`, que é a convenção real da API. |
| 2.0.0 | 2026-08-22 | Regras do estado vazio fechadas. Acrescentadas EMP-LIST-008 a 012: conta nova nasce sem empresa, a listagem passa a consultar `GET /empresas` em vez do array de exemplo, vazio deixa de poder ser confundido com erro, empresa arquivada não conta, e a variante de especialista ganha condição precisa. Contrato da API e modelo de dados de `empresas` especificados e autorizados. Seis dos dez estados obrigatórios saíram de "pendente sem regra" para "regra escrita". E1, E3 e E4 resolvidas; E5 e E6 abertas. |
| 1.1.0 | 2026-08-22 | A página virou destino único do login (ACS-LOGIN-017). Acrescentada EMP-LIST-007. Estado "Primeiro acesso" deixou de ser *não se aplica* e passou a ser o próprio estado vazio. |
| 1.0.0 | 2026-08-22 | Documento criado. Estado vazio ganhou variante para especialista sem convite e passou a levar ao fluxo completo de criação. Andaimes de debug substituídos por parâmetro de URL. Reset de âncora corrigido. Abertas as decisões E1 e E2. |
