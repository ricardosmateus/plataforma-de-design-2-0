# Regras de Negócio — Acesso à Plataforma

> **Versão:** 1.6.1 · **Status:** Implementado e ligado na API · **Uma pendência bloqueia publicação (D10)**
> **Módulo:** Acesso · **Página:** `login.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill` (Guardião de Regras de Negócio por Página)

---

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Entrar na conta |
| Módulo | Acesso |
| Rota | `/login.html` |
| Arquivo de interface | `login.html` |
| Arquivo de comportamento | `js/login.js` |
| Arquivo de regras | `Regras_de_negocio/modulos/acesso/login.md` *(este documento)* |
| Entidades | `users`, `perfil_especialista`, `empresa_membros`, `administradores`, `sessions`, `otp_codes`, `login_attempts` |
| Componentes | Casca de login, Formulário de login, Modal de verificação, Alerta, Divisor, Botão, Campo |
| Páginas relacionadas | `cadastro.html`, `empresas.html`, `admin.html` *(a criar)* |

---

## 1. Fontes consultadas

| Fonte | O que forneceu |
|---|---|
| `Regras_de_negocio/Sobre a Plataforma de Design/O_que_e_q_plataforma_de_design.md` | Público-alvo, Comunidade de Especialistas, modelo de negócio, princípios |
| `Documentacao/Backend/PLANO_BACKEND_LOGIN.md` | Modelo de dados, endpoints, política de OTP, sessão, rate limiting |
| `Skills/regra_de_negocio.skill` | Formato obrigatório, estados obrigatórios, regra de IDs, proibições |
| `login.html` · `js/login.js` | Comportamento implementado hoje |
| `empresas.html` · `projetos.html` · `visao_do_projeto.html` | Hierarquia de entidades, painel de perfil, créditos |
| `css/tokens.css` | Token `--fill-pro` declarado como "reservado ao plano Pro" |

### Hierarquia de entidades observada nas telas

```
Usuário  →  Empresa ("Minhas Empresas")  →  Projeto  →  Artefatos
                                                        ├── Ideias / Visão do projeto
                                                        ├── Pesquisa
                                                        ├── Matriz CSD
                                                        ├── Sobre a empresa
                                                        └── Atividade
```

O consumo de IA acontece **dentro dos artefatos**, que pertencem a um **projeto**, que pertence a uma **empresa**. Já os créditos aparecem hoje no painel de perfil do **usuário**. Essa assimetria é a origem da Decisão D2 (seção 7).

---

## 2. Identidade e papéis

A documentação principal nomeia dois públicos: **Empreendedor** *(Visão Geral; Objetivos Estratégicos §1)* e **Especialista** *(Comunidade de Especialistas)*.

### 2.1 Princípio: uma pessoa, uma conta

**Empreendedor e Especialista não são atributos da pessoa. São atributos da relação dela com cada empresa.**

Quem cria a empresa "Nike" é Proprietário ali. Quem é contratado pela "Adidas" é Especialista lá. São dois vínculos de *uma* pessoa com *duas* empresas — nunca duas pessoas. Vínculo é linha em tabela, não conta nova.

Disso decorre a regra de identidade da plataforma:

> **Uma pessoa = um e-mail = uma senha = uma conta.** O que ela pode fazer é determinado pelos vínculos que possui, não por um tipo gravado na conta.

**Consequências práticas:**

- Ninguém precisa de segundo e-mail para atuar dos dois lados da plataforma.
- Não existe campo `users.perfil`. Um tipo único na conta é justamente o que forçaria a duplicação.
- Não existe seletor de "visão": o contexto **é** a empresa que a pessoa abriu.
- A **Empresa já é o limite de separação** do produto. Uma camada de "conta" acima dela repetiria a mesma fronteira duas vezes.

### 2.2 As três camadas de identidade

| Camada | Responde | Onde vive | Cardinalidade |
|---|---|---|---|
| **Conta** | Quem é a pessoa | `users` | 1 por pessoa |
| **Perfil de especialista** | Ela se oferece para contratação? | `perfil_especialista` | 0 ou 1 por conta |
| **Vínculo** | O que ela faz *nesta* empresa | `empresa_membros` | N por conta |

O perfil de especialista é uma **extensão opcional** da conta, criada quando a pessoa decide se oferecer para contratação. Guarda o que é dela e não de nenhuma empresa: portfólio, especialidades, avaliações, disponibilidade e — só no momento do primeiro recebimento — dados fiscais e bancários.

### 2.3 Papéis no vínculo

| Papel | Origem | Escopo |
|---|---|---|
| **Proprietário** | Derivado de "Minhas Empresas" | Controle total, inclusive créditos e exclusão da empresa |
| **Membro** | **PROPOSTA** | Edita projetos e artefatos; não mexe em créditos nem em membros |
| **Especialista** | Derivado de "contratações seguras dentro do próprio ecossistema" | Acesso apenas aos projetos em que foi contratado, com prazo definido |

### 2.4 Administrador

Staff interno da plataforma. Não é perfil de conta nem vínculo com empresa: é uma tabela própria, alimentada só por provisionamento interno. Manter separado impede que qualquer caminho de auto-cadastro conceda privilégio administrativo por engano.

### 2.5 Modelo de dados proposto

```
users                          -- uma linha por pessoa
  id                uuid (pk)
  nome              text
  email             text (unique, lowercase)
  senha_hash        text (argon2id)
  email_verificado  boolean (default false)
  suspenso_em       timestamptz (nullable)
  suspensao_motivo  enum('violacao','inadimplencia') (nullable)  -- ACS-LOGIN-012
  criado_em, atualizado_em
  -- NÃO existe campo "perfil": ver §2.1

dispositivos_confiaveis        -- ACS-LOGIN-011, dispensa OTP repetido
  id                uuid (pk)
  user_id           uuid (fk users)
  token_hash        text
  expira_em         timestamptz
  ultimo_uso_em     timestamptz
  criado_em

perfil_especialista            -- extensão 0..1 de users
  user_id           uuid (pk, fk users)
  titulo            text
  bio               text
  especialidades    text[]
  status            enum('rascunho','em_analise','aprovado','recusado')
  cpf               text (criptografado, nullable)   -- só no 1º recebimento
  dados_bancarios   jsonb (criptografado, nullable)  -- só no 1º recebimento
  criado_em, aprovado_em

empresa_membros                -- vínculo N:N entre users e empresas
                               -- a tabela `empresas` está especificada em
                               -- modulos/empresas/empresas-listagem.md §3
  id                uuid (pk)
  empresa_id        uuid (fk empresas)
  user_id           uuid (fk users)
  papel             enum('proprietario','membro','especialista')
  convidado_por     uuid (fk users, nullable)
  expira_em         timestamptz (nullable)   -- contrato com prazo
  criado_em, revogado_em

administradores                -- staff interno, provisionamento manual
  user_id           uuid (pk, fk users)
  criado_em
```

---

## 3. Regras de acesso

Cada regra cita a fonte. Regras marcadas **[PROPOSTA]** não têm respaldo documental e exigem autorização antes de virar código.

### 3.1 Identidade e vínculo — `ACS-CONTA`

| ID | Regra | Fonte |
|---|---|---|
| ACS-CONTA-001 | Uma pessoa possui exatamente uma conta, identificada por um e-mail único. | [PROPOSTA] — §2.1 |
| ACS-CONTA-002 | A conta não carrega tipo. As capacidades vêm dos vínculos e da existência do perfil de especialista. | [PROPOSTA] — §2.1 |
| ACS-CONTA-003 | Criar uma empresa gera automaticamente vínculo de Proprietário para quem criou. | Doc principal, Visão Geral |
| ACS-CONTA-004 | Qualquer conta pode criar empresa e, simultaneamente, ser contratada como Especialista em empresas de terceiros — sem segunda conta. | [PROPOSTA] — §2.1 |
| ACS-CONTA-005 | O perfil de especialista é opcional, criado por ação explícita da pessoa, e só fica visível para contratação após aprovação. | [PROPOSTA] — D4 |
| ACS-CONTA-006 | Privilégio administrativo nunca é concedido por auto-cadastro nem por vínculo com empresa. | [PROPOSTA] — §2.4 |
| ACS-CONTA-007 | O perfil público de especialista nunca revela as empresas das quais a pessoa é Proprietária ou Membro. | [PROPOSTA] — §2.1 |
| ACS-CONTA-008 | CPF e dados bancários só são solicitados no primeiro recebimento, nunca no cadastro. | D5 · LGPD, minimização |
| ACS-CONTA-009 | Excluir a conta não apaga o contexto dos projetos de empresas onde a pessoa era apenas Especialista ou Membro. | Princípio "Preservar todo o contexto do projeto" |

### 3.2 Entrada na plataforma — `ACS-LOGIN`

| ID | Regra | Fonte |
|---|---|---|
| ACS-LOGIN-001 | O acesso exige e-mail verificado. Conta com `email_verificado=false` é redirecionada para a verificação de cadastro. | Plano backend §4, §5 |
| ACS-LOGIN-002 | O código OTP é exigido apenas em **dispositivo ainda não reconhecido**. Em dispositivo conhecido, e-mail e senha bastam. | D7 · decidido 21/08/2026 |
| ACS-LOGIN-003 | A validação de credencial acontece exclusivamente no servidor. O cliente valida apenas formato. | Plano backend §2 |
| ACS-LOGIN-004 | A mensagem de erro de credencial nunca revela se o e-mail existe. | Prática de segurança; já respeitado pela tela |
| ACS-LOGIN-005 | Após 3 tentativas malsucedidas, a conta entra em espera de 30 s, sinalizada pelo alerta "Muitas tentativas". | Plano backend §6 (resposta 429) |
| ACS-LOGIN-006 | O código OTP tem 6 dígitos, expira em 10 minutos e é de uso único. | Plano backend §6 |
| ACS-LOGIN-007 | O reenvio de código respeita intervalo de 30 s. | Plano backend §5 |
| ACS-LOGIN-008 | "Lembrar de mim" controla a vida do refresh token. | Plano backend §6 |
| ACS-LOGIN-009 | Conta suspensa não entra. A suspensão só é revelada **depois** da credencial validada — antes disso confirmaria que o e-mail existe, o que ACS-LOGIN-004 proíbe —, mas **não exige o segundo fator**: mandar a pessoa buscar um código para só então dizer que a conta está suspensa a faria perder tempo à toa. | D8 · decidido 21/08/2026 |
| ACS-LOGIN-010 | O destino após o login é decidido pela cascata da §4. | [PROPOSTA] |
| ACS-LOGIN-011 | O dispositivo é reconhecido por cookie assinado pelo servidor. Com "Lembrar de mim", o reconhecimento dura 90 dias; sem, expira ao fechar o navegador. O valor nunca pode ser forjável pelo cliente. | D7 · decidido 21/08/2026 |
| ACS-LOGIN-012 | A suspensão tem dois motivos, com saídas distintas: **violação dos termos** encaminha ao suporte para contestação; **inadimplência** encaminha à regularização do pagamento. | D8 · decidido 21/08/2026 |
| ACS-LOGIN-013 | A suspensão por inadimplência usa tratamento de aviso, não de erro — é pendência que a própria pessoa resolve, não uma punição. | D8 · decidido 21/08/2026 |
| ACS-LOGIN-014 | O destino retomado após o login aceita apenas caminho relativo interno. URL absoluta é descartada em favor do destino padrão. | Segurança — impede open redirect |
| ACS-LOGIN-015 | A cascata da §4 é avaliada **antes** do segundo fator, porque dois de seus ramos o dispensam. | Decidido 21/08/2026 — ver §4 |
| ACS-LOGIN-016 | O destino retomado (`?destino=`) só é honrado para quem tem ao menos um vínculo. | Decidido 21/08/2026 — ver §4 |
| ACS-LOGIN-017 | A cascata decide **se** a pessoa entra, não **o que** ela vê lá dentro. Distinções internas ao módulo de empresas são resolvidas pela listagem. | Decidido 22/08/2026 — ver §4 |

### 3.3 Sessão — `ACS-SESSAO`

| ID | Regra | Fonte |
|---|---|---|
| ACS-SESSAO-001 | O token de acesso vive 15 minutos; a renovação usa o refresh token em cookie `httpOnly`. | Plano backend §6 |
| ACS-SESSAO-002 | Sessão expirada devolve o usuário ao login com aviso explícito, preservando o destino pretendido. | [PROPOSTA] |
| ACS-SESSAO-003 | Sair da conta revoga a sessão no servidor, não apenas no navegador. | Plano backend §5 |
| ACS-SESSAO-004 | Revogar um vínculo encerra o acesso da pessoa àquela empresa na renovação seguinte, sem derrubar sua sessão nas demais. | [PROPOSTA] |

---

## 4. Roteamento após o login

A regra ACS-LOGIN-010 delega o destino a uma decisão em cascata, implementada em `js/login.js` — **a primeira condição verdadeira decide**:

| # | Condição | Destino | Situação |
|---|---|---|---|
| 1 | `email_verificado = false` | Verificação de cadastro | ✅ Modal, propósito `cadastro` |
| 2 | `suspenso_em` preenchido | Estado de conta suspensa | ✅ Implementado |
| 3 | Consta em `administradores` | `admin.html` | Tela **a criar** |
| 4 | Todos os demais | `empresas.html` | ✅ Tela existe |

**ACS-LOGIN-017 — a cascata decide se você entra, não o que você vê lá dentro.** Até 22/08/2026 ela tinha seis linhas: escolhia entre `criar-empresa.html`, `painel-especialista.html` e a listagem, conforme vínculos e perfil. Eram três rotas para três situações que a **própria listagem já sabe distinguir**, pelas variantes do estado vazio (EMP-LIST-003 e EMP-LIST-005).

Decidir aquilo aqui obrigava o login a conhecer regras do módulo de empresas — e obrigava a manter as duas em acordo para sempre. Agora toda conta que pode entrar entra pela mesma porta, e a listagem resolve o resto.

**O que isso não perde.** O fluxo completo de criação continua sendo o caminho de quem tem zero empresas: o estado vazio leva a `criar-empresa.html` (EMP-LIST-004). Mudou a ordem, não o destino — a pessoa vê a casa antes de mobiliar, e quem desiste no meio sabe para onde voltar.

**ACS-LOGIN-015 — o segundo fator guarda a entrada, não a decisão.** A cascata é avaliada antes do OTP, porque dois ramos o dispensam: a verificação de e-mail (linha 1) já *é* um código, e pedir o de login antes cobraria dois códigos seguidos; e a suspensão (linha 2) encerra o acesso ali. Nas linhas 3 e 4, o OTP roda entre a decisão e a navegação, conforme ACS-LOGIN-002.

**ACS-LOGIN-016 — o destino retomado só vale para quem tem vínculo.** Mandar quem ainda não tem empresa direto a uma tela interna produziria "sem permissão" na própria entrada. Sem vínculo, a linha 4 prevalece sobre o `?destino=`: a pessoa entra pela listagem, e não por uma tela interna a que ainda não tem acesso.

Duas observações:

**A linha 4 não distingue papel.** `empresas.html` passa a listar num só lugar as empresas que a pessoa possui e aquelas onde foi contratada, com um selo indicando o papel em cada uma. É isso que dispensa qualquer seletor de visão: a troca de contexto acontece ao abrir uma empresa ou outra.

---

## 5. Estados obrigatórios da página

A skill exige avaliar dez estados. Situação de `login.html` hoje:

| Estado | Hoje | Ação necessária |
|---|---|---|
| Primeiro acesso | ✅ Cascata linha 4 → `empresas.html`, estado vazio | — |
| Vazio | **Não se aplica** — a tela é um formulário, não uma listagem | Justificado |
| Carregando | ✅ `.is-loading` no botão | — |
| Sucesso | ✅ Cascata da §4 decide o destino | Ligar em dados reais na Fase 4 |
| Erro | ✅ `alertCredencial` + `field-error` | Ligar na resposta da API na Fase 4 |
| Sem permissão | ✅ `alertSemPermissao` — `?motivo=sem-permissao` | — |
| Arquivado | ✅ `alertSuspensaoViolacao` e `alertSuspensaoPagamento` | — |
| Offline | ✅ `alertOffline` — escuta `online`/`offline`, trava o envio | — |
| Sessão expirada | ✅ `alertSessaoExpirada` — `?motivo=sessao-expirada&destino=` | — |
| Integração indisponível | Pendente | Provedor de e-mail fora: o OTP não chega. Depende da Fase 4 |

**Situação em 21/08/2026:** **nove dos dez estados resolvidos**. Resta "Integração indisponível" (provedor de e-mail fora do ar), que só pode ser tratado quando houver provedor — Fase 4.

---

## 6. Planejamento de execução

### Página
`login.html` — Acesso à plataforma.

### Objetivo
Transformar a tela de login, hoje uma simulação sem noção de identidade, no ponto de entrada que reconhece quem é o usuário e o conduz ao lugar certo da plataforma.

### Regras consultadas
`ACS-CONTA-001` a `009`, `ACS-LOGIN-001` a `010`, `ACS-SESSAO-001` a `004`, estados obrigatórios da skill.

### Situação em 21/08/2026, quando este plano foi escrito

> Retrato do ponto de partida. As Fases 2, 3 e 4 já foram entregues desde então — a §5 tem a situação corrente dos estados obrigatórios, e o §9 o histórico.

- A tela está visualmente completa e conforme o design system (auditoria de 21/08/2026).
- Todo o comportamento é simulado com `setTimeout`; não há API.
- Não existe nenhuma noção de identidade: o formulário coleta e-mail e senha, e o destino é fixo.
- Quatro dos dez estados obrigatórios estão implementados.
- Não existia documento de regras para esta página até a versão 1.0.0 deste arquivo.

### Nova solução — fases

| Fase | Entrega | Depende de | Backend? |
|---|---|---|---|
| **0 — Governança** | Decisões D2, D3, D10 resolvidas; este documento aprovado | — | Não |
| **1 — Modelo de identidade** ◐ | `perfil_especialista`, `empresa_membros`, `administradores`; migração | Fase 0 | Sim |
| **2 — Estados faltantes** ✅ | Offline, sessão expirada, conta suspensa (dois motivos), sem permissão | Fase 0 | Não |
| **3 — Roteamento pós-login** ✅ | Cascata da §4 implementada sobre conta simulada | Fases 1, 2 | Só para dados reais |
| **4 — Ligação com a API** ✅ | Troca dos três `setTimeout` por `fetch` real | Fase 3 | Sim |
| **5 — Porta do Especialista** | Ativação do perfil, curadoria e painel | Fase 4 | Sim |

**Situação em 22/08/2026:** Fases 2, 3 e 4 entregues. A Fase 1 está **parcial** (◐): a migração criou `usuarios`, `sessoes`, `codigos_otp`, `dispositivos_confiaveis` e `tentativas_login`, mas `perfil_especialista`, `empresa_membros` e `administradores` ainda não existem — por isso `/auth/sessao` devolve `administrador`, `vinculos` e `perfil_especialista` fixos. A tabela `empresas`, autorizada em 22/08/2026, está especificada em [`../empresas/empresas-listagem.md`](../empresas/empresas-listagem.md) §3.

### Impactos

| Área | Impacto |
|---|---|
| Modelo de dados | Três tabelas novas; `users` **perde** o campo de perfil — **exige autorização** |
| Permissões | Criação do conceito de vínculo por empresa — **exige autorização** |
| `cadastro.html` | **Simplifica**: sai a coleta de CPF e não entra escolha de perfil. Restam nome, e-mail e senha |
| `empresas.html` | Passa a listar empresas próprias e contratadas, com selo de papel |
| Componentes compartilhados | Nenhum. Os estados novos usam `.alert` e variantes já catalogadas |
| Documentação | Este documento passa a ser fonte oficial da página |

### Dependências
1. Aprovação das decisões em aberto D2, D3 e D10 (as demais estão resolvidas — ver §7). **D10 bloqueia a publicação.**
2. Decisões em aberto do plano de backend §8 (provedor de e-mail, hospedagem, domínio).
3. Telas ainda inexistentes: console administrativo (`admin.html`, linha 3 da cascata) e o painel do especialista, que a ACS-LOGIN-017 deixou de exigir para entrar mas o módulo de especialista ainda vai precisar.

### Arquivos afetados

| Arquivo | Natureza |
|---|---|
| `Regras_de_negocio/modulos/acesso/login.md` | Este documento |
| `login.html` | Marcação dos estados novos |
| `js/login.js` | Roteamento e, na Fase 4, chamadas reais |
| `cadastro.html` | Remoção do CPF |
| `empresas.html` | Selo de papel na listagem |
| `Documentacao/Backend/PLANO_BACKEND_LOGIN.md` | Schema da §2.5; CPF sai de `users` |
| `styleguide.html` | Catalogar os estados novos, se surgir variante |

### Critérios de aceite

**Fase 2 — verificáveis sem backend**

- [ ] Sem rede, submeter o formulário mostra aviso de conexão e não dispara requisição.
- [ ] Chegar ao login por expiração exibe aviso de sessão expirada e preserva o destino pretendido.
- [ ] Conta suspensa exibe estado próprio, distinto de credencial inválida.
- [ ] Todos os estados novos usam componentes já catalogados no styleguide.
- [ ] Nenhuma cor, raio, sombra ou duração fora de token.
- [ ] Navegação por teclado alcança todos os estados; foco visível em cada um.

**Fase 3 — roteamento**

- [ ] Conta sem nenhum vínculo cai em `empresas.html`, na variante certa do estado vazio.
- [ ] Conta com vínculo cai em `empresas.html`, vendo próprias e contratadas na mesma lista.
- [ ] Conta não verificada cai na verificação, nunca no app.
- [ ] Conta suspensa não entra, mesmo com credencial e OTP corretos.
- [ ] A cascata da §4 é avaliada na ordem, e a primeira condição verdadeira decide.

**Fase 4 — API**

- [ ] Nenhum `setTimeout` de simulação permanece em `js/login.js`.
- [ ] Erro da API no formato `{campo, mensagem}` aparece no `field-error` correspondente.
- [ ] Resposta 429 aciona `alertBloqueio` com a contagem vinda do servidor.
- [ ] O código OTP nunca aparece em log do navegador.

**Fase 5 — especialista**

- [ ] A mesma conta consegue possuir uma empresa e ser contratada em outra, sem segundo e-mail.
- [ ] O perfil público não expõe as empresas das quais a pessoa é Proprietária (ACS-CONTA-007).
- [ ] CPF só é pedido no primeiro recebimento (ACS-CONTA-008).

### Necessita autorização?

**Sim.** O plano altera modelo de dados, cria o conceito de permissões e muda o fluxo principal de entrada — três gatilhos que a skill classifica como autorização obrigatória.

---

## 7. Decisões

### Em aberto

### D2 — Créditos pertencem ao usuário ou à empresa?

**Regra atual:** A tela mostra créditos no painel de perfil do usuário.
**Impacto:** Faturamento, e é a base do modelo de negócio.
**Consequências:** Se um usuário tem três empresas, créditos por usuário significam que o consumo de uma esgota o saldo das outras — e um Especialista contratado gastaria o crédito de quem o contratou sem limite visível.
**Recomendação:** Créditos por **empresa**, com o Proprietário responsável pela recarga. Alinha com "Taxa de intermediação sobre o consumo" e torna o gasto atribuível a quem o gerou. A decisão D1 reforça isso: agora que uma conta pode atuar em várias empresas com papéis distintos, saldo por pessoa fica ambíguo.

### D3 — O plano Pro existe?

**Regra atual:** `css/tokens.css` declara `--fill-pro` como "reservado ao plano Pro", mas nenhuma tela usa o token como plano, e a documentação de negócio descreve apenas créditos e comissão.
**Consequências:** Token órfão no design system sugere um conceito de produto que não existe, e alguém vai construir em cima dele.
**Recomendação:** Confirmar que o modelo é só créditos e **remover** a família `--*-pro` dos tokens, ou documentar o plano Pro na documentação de negócio.

### ⚠ D10 — "Esqueci minha senha" exibe sucesso falso — **BLOQUEIA PUBLICAÇÃO**

**Situação atual:** o link não tem endpoint nem tela. Ao ser clicado, exibe o alerta verde *"Link enviado — Enviamos as instruções de recuperação para o seu e-mail"*. **Nada é enviado.**
**Por que é pior que um link morto:** um link inerte a pessoa percebe e procura outro caminho. Uma confirmação falsa faz esperar um e-mail que não vem, tentar de novo achando que errou, e concluir que a plataforma está quebrada — sem nunca recuperar a conta.
**Decisão de 22/08/2026:** manter como está **durante o desenvolvimento**.
**Condição:** esta mensagem não pode ir ao ar. Antes de publicar, é obrigatório construir a recuperação (Fase 2 do roadmap do plano de backend) ou trocar o texto por um aviso honesto de indisponibilidade com canal de contato.
**Também pendente na mesma família:** os links de Termos de uso e Política de privacidade em `cadastro.html` apontam para `#`, e o aceite deles é obrigatório. A API já grava `termos_versao` e `termos_aceitos_em`, então o registro existe — falta o documento que está sendo aceito.

---

### Resolvidas

### ✅ D1 — Como uma pessoa atua dos dois lados da plataforma — **RESOLVIDA em 21/08/2026**

**Decisão:** Uma pessoa, uma conta, um e-mail. Sem campo de perfil na conta; as capacidades vêm dos vínculos. Perfil de especialista é extensão opcional. Sem seletor de visão — o contexto é a empresa aberta.
**Alternativas descartadas:** contas múltiplas sob o mesmo e-mail (a Empresa já é o limite de separação, uma camada de conta acima dela seria redundante) e CPF como chave de identidade (ver D5).
**Formalizada em:** §2.1, §2.2, §2.5, ACS-CONTA-001 a 004.

### ✅ D4 — Especialista entra por auto-cadastro ou curadoria? — **RESOLVIDA em 21/08/2026**

**Decisão:** Ativação livre do perfil, visibilidade sob aprovação. A pessoa cria o perfil e monta o portfólio quando quiser; ele só aparece para contratação após revisão (`status = aprovado`).
**Formalizada em:** ACS-CONTA-005, `perfil_especialista.status`.

### ✅ D5 — CPF é obrigatório para quem? — **RESOLVIDA em 21/08/2026**

**Decisão:** CPF sai do cadastro. É solicitado apenas no primeiro recebimento, junto dos dados bancários, e guardado criptografado em `perfil_especialista`.
**Razão:** CPF não serve como chave de identidade — espalharia dado sensível por todo índice e log, excluiria especialista estrangeiro e exigiria documento antes da pessoa conhecer o produto. Sua função legítima é fiscal: habilitar recebimento e emissão de nota.
**Efeito colateral positivo:** `cadastro.html` fica mais curto — nome, e-mail e senha.
**Formalizada em:** ACS-CONTA-008, §2.5.

### ✅ D6 — Fonte oficial da documentação principal — **RESOLVIDA em 22/08/2026**

**Era:** `Documentacao/Plataforma_de_Design_2.0.md` e `Regras_de_negocio/Sobre a Plataforma de Design/O_que_e_q_plataforma_de_design.md` eram o **mesmo documento**, byte a byte, com diferença de um espaço de indentação.
**Decisão:** `Regras_de_negocio/` é a fonte oficial, porque é onde a skill manda procurar. A cópia em `Documentacao/` foi substituída por um redirecionamento que explica a mudança.
**Por que importava:** a skill determina que a documentação prevalece sobre o código em conflito. Com duas cópias, não havia "a documentação" — havia um empate sem critério de desempate.

---

### ✅ D7 — Quando o OTP é exigido? — **RESOLVIDA em 21/08/2026**

**Decisão:** Só em dispositivo ainda não reconhecido. Depois da primeira verificação naquele navegador, e-mail e senha bastam.
**Razão:** A leitura literal do plano de backend (código a cada login) impunha abrir o e-mail toda vez. Para um público que a documentação descreve esperando "abrir um link e usar na hora", isso é atrito que custa adoção sem ganho proporcional de segurança — o segundo fator continua protegendo exatamente o caso que importa, o acesso a partir de uma máquina desconhecida.
**Formalizada em:** ACS-LOGIN-002, ACS-LOGIN-011, tabela `dispositivos_confiaveis`.

### ✅ D8 — Contas podem ser suspensas? — **RESOLVIDA em 21/08/2026**

**Decisão:** Sim, por dois motivos com saídas distintas — violação dos termos (contato com o suporte) e inadimplência (regularização do pagamento).
**Nuance de tratamento:** inadimplência recebe tratamento de aviso, não de erro. É pendência que a pessoa resolve sozinha; pintá-la de vermelho como uma violação seria punir quem só está atrasado.
**Formalizada em:** ACS-LOGIN-009, ACS-LOGIN-012, ACS-LOGIN-013, `users.suspensao_motivo`.

### ✅ D9 — `--text-warning` reprovava em contraste — **RESOLVIDA em 22/08/2026**

**Decisão:** `--text-warning` passou a apontar para um `--amber-700` (`#B45309`) novo na camada base.
**Resultado medido:** de **3,07:1** para **4,84:1** sobre `--bg-warning`, acima do mínimo AA de 4,5:1. Verificado em todos os alertas da tela: os quatro que reprovavam agora passam, e os que já passavam não regrediram.
**Alcance:** afeta o styleguide e qualquer página com alerta de aviso. O âmbar ficou um degrau mais escuro, diferença quase imperceptível a olho e decisiva na medição.
**Nota:** `--amber-600` continua na paleta para preenchimento e ícone, onde a regra de contraste é outra. O 700 existe para texto.

## 8. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.6.1 | 2026-08-22 | §6 rotulado como retrato datado de 21/08/2026 — era lido como "situação atual" e afirmava quatro estados implementados quando a §5 já registrava nove, além de listar a tela de conta suspensa como inexistente e a D6 como pendente. ACS-LOGIN-015, 016 e 017 promovidas de prosa para a tabela de regras — existiam só como comentário e nenhuma podia ser citada como fonte. Corrigidas as referências às linhas 5 e 6 da cascata antiga, que a 1.6.0 havia deixado apontando para linhas inexistentes. Referências residuais a `criar-empresa.html` corrigidas (estado "Primeiro acesso", checklist da Fase 3 e páginas relacionadas). §2.5 passou a apontar onde a tabela `empresas` está especificada. |
| 1.6.0 | 2026-08-22 | **Cascata simplificada de seis linhas para quatro** (nova ACS-LOGIN-017). As rotas para `criar-empresa.html` e `painel-especialista.html` saíram: a listagem de empresas já distingue essas situações pelas variantes do estado vazio, e decidi-las no login obrigava o acesso a conhecer regras do módulo de empresas. Toda conta que pode entrar entra por `empresas.html`. O cadastro passa a levar para lá também. |
| 1.5.0 | 2026-08-22 | Dívida técnica do `cadastro.html` paga, com efeito colateral sobre esta tela: o sprite de ícones que vivia inline no `login.html` saiu para `img/icones.svg`, junto com os outros dois que existiam no styleguide e no cadastro. Eram **três fontes** para os mesmos ícones, e o olho, o envelope e o X já tinham traçados divergentes entre elas. Componentes de senha e aceite promovidos a `components.css` e catalogados no styleguide. |
| 1.4.0 | 2026-08-22 | **Frontend ligado na API.** Nenhuma simulação resta em login e cadastro: credencial, suspensão, reconhecimento de dispositivo e contagem de bloqueio passaram a ser decididos pelo servidor, com a sessão em cookie `httpOnly` que a página não alcança. D9 resolvida — `--text-warning` corrigido para `--amber-700`, e todos os alertas passam em AA. Aberta a D10, que **bloqueia publicação**: o "Esqueci minha senha" exibe sucesso falso. A API passou a poder servir o frontend (`SERVIR_FRONTEND`), com allowlist que impede o `.env` e o código-fonte de vazarem por HTTP. |
| 1.3.0 | 2026-08-21 | **Fase 3 concluída** no frontend: a cascata de roteamento da §4 está implementada sobre uma conta simulada, com os seis ramos verificados em teste. Nove dos dez estados obrigatórios resolvidos. Novas regras ACS-LOGIN-015 (a cascata é avaliada antes do segundo fator, porque dois ramos o dispensam) e ACS-LOGIN-016 (destino retomado só vale para quem tem vínculo). ACS-LOGIN-009 refinada: a suspensão é revelada após a credencial validada, sem exigir o segundo fator. Restam construir as telas de console administrativo e painel do especialista, hoje sinalizadas por andaime temporário. |
| 1.2.0 | 2026-08-21 | Decisões D7 (OTP só em dispositivo novo) e D8 (suspensão por violação ou inadimplência) resolvidas e implementadas. **Fase 2 concluída**: os quatro estados faltantes que não dependiam de backend estão na tela, elevando de quatro para oito os dez estados obrigatórios resolvidos. Novas regras ACS-LOGIN-011 a 014. Tabela `dispositivos_confiaveis` e campo `users.suspensao_motivo` acrescentados ao modelo. Botão do Google devolvido à condição de placeholder, conforme decisão do plano de backend §1. Aberta a D9, defeito de contraste pré-existente em `--text-warning`. |
| 1.1.0 | 2026-08-21 | Decisões D1, D4 e D5 resolvidas. Removido o conceito de perfil único na conta: identidade passa a ser uma pessoa / uma conta, com capacidades derivadas de vínculos (`empresa_membros`) e de extensão opcional (`perfil_especialista`). CPF sai do cadastro para o primeiro recebimento. Administrador vira tabela própria. Novas regras ACS-CONTA-007 (privacidade do perfil público) e ACS-SESSAO-004 (revogação de vínculo). Cascata de roteamento reescrita sobre vínculo em vez de tipo de conta. |
| 1.0.0 | 2026-08-21 | Documento criado. Perfis derivados da documentação principal, regras de acesso com IDs, roteamento pós-login, avaliação dos dez estados obrigatórios e seis decisões em aberto. |
