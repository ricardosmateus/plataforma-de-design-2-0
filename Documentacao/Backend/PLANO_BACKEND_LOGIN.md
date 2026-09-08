# Plano de backend — Login e Cadastro

> Versão: 2.0 · Atualizado em 22/08/2026 · Escopo: autenticação por e-mail/senha com verificação por código (OTP). Login com Google fica para uma fase futura, por decisão explícita.

---

## 0. Estado atual — 22/08/2026

**A autenticação saiu do papel e está rodando.** Este documento deixou de ser plano nas partes marcadas ✅ abaixo; o que segue como plano está marcado ⏳.

| Peça | Estado |
|---|---|
| API em `api/` — Fastify + TypeScript + Prisma | ✅ construída e rodando |
| Banco PostgreSQL no Neon | ✅ migração aplicada, 5 tabelas |
| Cadastro, login, OTP, sessão, logout | ✅ ponta a ponta |
| Envio real de e-mail | ✅ Resend, com driver de console para desenvolvimento |
| Frontend ligado na API | ✅ sem nenhuma simulação restante |
| Recuperação de senha | ⏳ **bloqueia publicação** — ver D10 em `login.md` |
| Telas de Termos e Política | ⏳ **bloqueia publicação** — o aceite é obrigatório e os links apontam para `#` |
| Empresas, vínculos, créditos | ⏳ fora do escopo desta fase |
| Login com Google | ⏳ Fase 4 do roadmap |

**Onde as regras vivem.** Este documento trata de arquitetura e infraestrutura. As regras de negócio da autenticação — quem entra, quando o código é exigido, o que acontece com conta suspensa — vivem em `Regras_de_negocio/modulos/acesso/login.md` e `cadastro.md`, que são a fonte oficial. Havendo divergência, valem eles.

**Como subir localmente.** Instruções em `api/README.md`. Em resumo: `npm install`, preencher o `.env`, `npm run gerar`, `npm run migrar`, `npm run dev`. Em desenvolvimento a própria API serve o frontend, então o site inteiro fica em `http://localhost:3333`.

---

## 1. Contexto e decisões já tomadas

- ~~Hoje o projeto é 100% estático~~ **Superado em 22/08/2026.** O frontend continua sem build, mas já não é simulado: `login.html` e `cadastro.html` conversam com a API por `fetch`, e a sessão vive em cookie `httpOnly` emitido pelo servidor. A camada de acesso está em `js/api.js`.
- **Modelo de distribuição: 100% online (SaaS hospedado), não instalador local.** A ideia inicial de rodar um app instalado na máquina do usuário foi reavaliada e descartada — o público-alvo (empreendedores de micro/pequena/média empresa, não desenvolvedores) espera abrir um link e usar na hora, sem baixar executável nem lidar com aviso de "app não confiável" do sistema operacional. Isso também é pré-requisito pra duas peças do produto descritas na documentação de negócio: a Comunidade de Especialistas (feature de rede, só faz sentido centralizada) e o modelo de cobrança por uso de IA/comissão (mais simples de medir e faturar quando a plataforma está no meio de cada interação).
- Login com Google: **fora do escopo desta fase**. O botão continua na tela como placeholder visual (já é o comportamento atual do Template no styleguide).
- Stack: recomendação na seção 2, pensando numa ferramenta que "vai escalar futuramente" e num backend clássico de SaaS (frontend hospedado + API + banco, todos na nuvem).

## 2. Arquitetura recomendada

```
┌──────────────────────┐        HTTPS         ┌──────────────────────────────┐
│  Navegador do usuário │ ─────────────────────▶│  Frontend hospedado (CDN)    │
│  login.html/cadastro  │ ◀─────────────────────│  Vercel/Netlify/CF Pages     │
└──────────┬────────────┘                       └──────────────────────────────┘
           │  HTTPS · cookie httpOnly
           ▼
┌──────────────────────────────┐
│  API de autenticação (nuvem) │
│  Node.js + Fastify + Prisma  │
└───────────────┬───────────────┘
                │
                ▼
┌──────────────────────────────┐
│  PostgreSQL gerenciado (Neon) │
└──────────────────────────────┘
                │
                ▼
┌──────────────────────────────┐
│  Provedor de e-mail (OTP)     │
└──────────────────────────────┘
```

**Por que separar frontend, API e banco:**

- O frontend não guarda a lista de usuários nem valida senha sozinho — ele só fala com a API por HTTPS. Isso permite escalar cada camada de forma independente (CDN pro frontend, autoscaling na API) e trocar de provedor de hospedagem sem tocar no resto.
- A API é stateless (autenticação via JWT/cookie, não sessão em memória do servidor) — dá pra rodar várias instâncias atrás de um load balancer sem sessão "grudada" numa máquina específica, o que é a base de qualquer escala horizontal.
- Esse desenho é o mesmo, esteja o produto com 10 ou 100 mil usuários — o que muda com a escala é a camada de borda (CDN/WAF) e o dimensionamento de cada peça, não a arquitetura em si. Detalhes de segurança específicos de operar online estão na seção 6.

## 3. Stack recomendada

| Camada | Recomendação | Por quê |
|---|---|---|
| Linguagem | **TypeScript** em tudo (frontend, API, scripts) | Já usa JS no frontend; TypeScript reduz bug de contrato entre cliente e API à medida que o time cresce. |
| Hospedagem do frontend | **Vercel, Netlify ou Cloudflare Pages** | Deploy direto do repositório, CDN global incluído, certificado HTTPS automático, camada gratuita cobre bem o estágio inicial. Qualquer uma das três serve — decisão em aberto na seção 8. |
| API de autenticação | **Node.js + Fastify** | Mais leve e mais rápido que Express em benchmarks recentes, com validação de schema nativa (bom para dados sensíveis como senha e CPF). Se preferir algo mais conhecido, Express é alternativa válida — a diferença de performance só importa em escala alta. |
| ORM / acesso a dados | **Prisma** | Migrations versionadas, tipagem automática a partir do schema, tranquilo de operar sozinho sem DBA dedicado. |
| Banco de dados | **PostgreSQL gerenciado no Neon** | Serverless de verdade: cobra por uso e "escala a zero" quando não há tráfego — ótimo pro estágio inicial, onde o uso será baixo e irregular. Dá pra trocar de provedor depois sem reescrever nada, porque é Postgres padrão (Supabase, Render, RDS etc. também servem se preferir). Importante: usar o *connection pooler* embutido do Neon desde o início — sem ele, escalar a API pra várias instâncias esgota conexão com o banco rápido. |
| Envio de e-mail (código OTP) | **Resend** ou **SES** (a definir) | Precisa de um provedor transacional — Gmail comum não serve para isso. Fica como decisão em aberto na seção 8. |
| Hash de senha | **Argon2id** | Recomendação atual do OWASP Password Storage Cheat Sheet (à frente de bcrypt) — parâmetros na seção 5. |
| Sessão | **JWT de acesso (curto) + refresh token (longo) em cookie `httpOnly`/`Secure`/`SameSite`** | Num navegador comum, guardar token em `localStorage` expõe a roubo via XSS. Cookie `httpOnly` não é acessível por JavaScript da página, o que fecha essa porta. |
| Camada de borda | **Cloudflare (ou equivalente) na frente da API** | WAF, proteção contra bot/DDoS e um primeiro filtro de rate limit antes mesmo da requisição chegar na API — essencial assim que o cadastro fica público. |

Por que **não** uma BaaS pronta (Supabase Auth, Firebase Auth): a modal de OTP já tem comportamento bem customizado (contagem regressiva, reenvio, bloqueio por tentativas) — implementar isso em cima de uma Auth pronta tende a lutar contra a ferramenta em vez de aproveitá-la, e uma API própria dá controle total sobre esse fluxo. Ainda assim, é uma alternativa legítima pra ganhar velocidade no MVP trocando controle fino por menos código pra manter — vale reconsiderar se o time for pequeno e o prazo apertado.

## 4. Modelo de dados ✅ implementado

> Fonte da verdade: `api/prisma/schema.prisma`. A migração correspondente está em `api/prisma/migrations/`, escrita em SQL à mão e validada contra PostgreSQL 16. **Alterou um, altere o outro.**

```
users                                    -- uma pessoa = uma conta = um e-mail
  id                uuid (pk)
  nome              text
  email             text (unique, lowercase)
  senha_hash        text (argon2id)
  email_verificado  boolean (default false)
  suspenso_em       timestamptz (nullable)
  suspensao_motivo  enum('violacao','inadimplencia') (nullable)
  termos_versao     text (nullable)      -- o QUE foi aceito
  termos_aceitos_em timestamptz (nullable)  -- QUANDO
  criado_em         timestamptz
  atualizado_em     timestamptz
  -- SEM campo de perfil: as capacidades vêm de vínculos (D1)
  -- SEM cpf: sai só no primeiro recebimento do especialista (D5)

sessions                                 -- refresh tokens ativos
  id                uuid (pk)
  user_id           uuid (fk users, cascade)
  refresh_token_hash text (unique)       -- só o hash; dump não dá token utilizável
  lembrar_de_mim    boolean
  expira_em         timestamptz
  criado_em, revogado_em
  ip, user_agent

otp_codes                                -- cobre login e cadastro
  id                uuid (pk)
  user_id           uuid (fk users, cascade)
  proposito         enum('login', 'cadastro')
  codigo_hash       text                 -- HMAC com pimenta, ver §6
  expira_em         timestamptz          -- 10 min
  tentativas        int (default 0)
  usado_em          timestamptz (nullable)
  criado_em         timestamptz

dispositivos_confiaveis                  -- é o que dispensa o código a cada login
  id                uuid (pk)
  user_id           uuid (fk users, cascade)
  token_hash        text (unique)
  apelido           text (nullable)      -- user-agent, para a pessoa reconhecer
  expira_em         timestamptz          -- 90 dias
  ultimo_uso_em, criado_em

login_attempts                           -- alimenta o 429 e o alerta "Muitas tentativas"
  id                uuid (pk)
  user_id           uuid (fk users, SET NULL)   -- nulo em e-mail inexistente
  email_tentado     text
  sucesso           boolean
  ip                text
  criado_em         timestamptz
```

**Duas decisões de integridade que valem o registro.** As sessões e os códigos caem em cascata com a conta, porque não fazem sentido sem ela. Já `login_attempts` usa `SET NULL`: apagar uma conta **não pode** apagar o rastro de auditoria das tentativas de acesso a ela — é justamente esse histórico que mostra se houve ataque antes da exclusão.

**A tabela `password_reset_tokens` saiu do schema por ora.** Ela pertence à recuperação de senha, que continua na Fase 2. Entra junto com os endpoints, não antes.

**Nota LGPD — resolvida.** O CPF **não é mais coletado no cadastro** (decisão D5). Ele passa a ser pedido apenas no primeiro recebimento do especialista, onde tem função fiscal, e vive criptografado na tabela `perfil_especialista`, que nasce com o módulo de empresas. Menos dado sensível guardado é menos risco, e a LGPD favorece a minimização. A máscara e a validação de dígito verificador foram preservadas em `js/cpf.js`, prontas para aquela tela.

## 5. Endpoints da API

Todos sob `POST /api/v1/auth/...` (prefixo versionado desde o início, barato agora e caro de adicionar depois).

| Endpoint | Corresponde a | Retorno |
|---|---|---|
| Endpoint | Estado | Retorno |
|---|---|---|
| `POST /auth/registrar` | ✅ | Cria o usuário (`email_verificado=false`), registra o aceite e dispara o código |
| `POST /auth/login` | ✅ | Valida a credencial e devolve `proximo: "entrar"` (dispositivo conhecido, sessão aberta) ou `proximo: "verificar-codigo"` |
| `POST /auth/otp/verificar` | ✅ | Confere o código, abre a sessão e passa a reconhecer o dispositivo |
| `POST /auth/otp/reenviar` | ✅ | Novo código, respeitando o intervalo de 30 s |
| `POST /auth/logout` | ✅ | Revoga a sessão no servidor, não só no navegador |
| `GET /auth/sessao` | ✅ | Confirma a sessão; renova pelo refresh, com rotação, quando o acesso vence |
| `GET /saude` | ✅ | Verifica processo e banco |
| `POST /auth/esqueci-senha` | ⏳ Fase 2 | Dispara e-mail com link de redefinição |
| `POST /auth/redefinir-senha` | ⏳ Fase 2 | Troca a senha usando o token do e-mail |

**O `challenge_id` virou cookie.** O plano original previa devolver um identificador para o cliente guardar e reenviar. Na implementação isso virou um cookie `httpOnly` de curta duração: aceitar do corpo da requisição um identificador de conta permitiria tentar códigos contra qualquer conta, bastando adivinhar o id. Com o desafio em cookie assinado, o cliente não escolhe contra quem tenta.

**Formato de erro padronizado:** `{ "campo": "email", "mensagem": "Informe um e-mail válido." }`. `campo: null` é erro geral, que a tela mostra como alerta em vez de marcar um campo. Respostas 403 de suspensão trazem também `suspensao`, e 429 traz `segundosRestantes` — é dele que a contagem do bloqueio sai, não de um contador do navegador.

## 6. Segurança

- **Hash de senha:** Argon2id, parâmetros mínimos recomendados pelo OWASP (memória 19 MiB, 2 iterações, paralelismo 1) — ajustar para cima (ex.: 64–128 MiB) se o hardware da API aguentar, é mais seguro contra GPU.
- **Rate limiting em duas camadas:** um filtro grosso na borda (Cloudflare, antes da requisição chegar na API) e um filtro fino por IP + por e-mail dentro da própria API, em `/auth/login` e `/auth/otp/verificar` — é isso que alimenta o cenário "Muitas tentativas" que já existe pronto na tela (`alertBloqueio`), hoje sem lógica real por trás. Só rate limit na API não basta contra um ataque de credential stuffing distribuído; a borda é a primeira linha de defesa.
- **OTP:** 6 dígitos, expira em 10 minutos, uso único, máximo de tentativas antes de invalidar o código (a tela já mostra erro por tentativa errada). Nunca logar o código em texto puro.
- **Sessão:** access token JWT de vida curta (15 min) + refresh token de vida longa em cookie `httpOnly` + `Secure` + `SameSite=Strict`; "Lembrar de mim" controla se o refresh token dura dias ou só a sessão do navegador aberta.
- **Transporte:** HTTPS obrigatório em toda a cadeia (navegador → frontend → API → banco) — sem exceção, mesmo em ambiente de teste.
- **CORS:** allowlist restrita só ao(s) domínio(s) do frontend hospedado — qualquer origem fora dessa lista deve ser rejeitada pela API.
- **Conexão com o banco:** usar o pooler do Neon (ou PgBouncer, se trocar de provedor) assim que a API rodar em mais de uma instância — sem isso, o Postgres recusa conexão sob carga.
- **CPF (LGPD):** resolvido — não é mais coletado no cadastro. Ver nota na seção 4.

### 6.1 Decisões que a implementação acrescentou

Três escolhas que o plano não previa e que valem ficar registradas.

**Senha por comprimento, não por composição.** A política implementada exige mínimo de 8 e confere contra a base de vazamentos do Have I Been Pwned por *k-anonymity* — só os cinco primeiros caracteres do SHA-1 saem da API. **Não** se exige maiúscula, número ou símbolo: o NIST SP 800-63B Rev 4 proíbe exigências de composição, porque elas produzem `Senha1!` e rejeitam frases longas. O piso de 8, e não 15, vale porque há segundo fator. Detalhamento em `cadastro.md` §1.2.

**Código de verificação selado com HMAC e pimenta.** Seis dígitos são um milhão de combinações: um SHA-256 puro cairia em segundos se o banco vazasse, e um argon2 seria caro demais para algo que expira em dez minutos. Com HMAC, o segredo não vive no banco, então o dump sozinho não serve. A comparação é em tempo constante.

**Tokens em cookie `httpOnly`, não no corpo da resposta.** O frontend é HTML estático sem build; se precisasse guardar o token, o único lugar seria `localStorage`, e qualquer XSS levaria a sessão. Em cookie `httpOnly`, o JavaScript da página não alcança o token nem se for comprometido. O CSRF que isso abre fica coberto por `SameSite=Strict`, allowlist de origem no CORS e corpo JSON. **Consequência para o deploy:** frontend e API precisam dividir o domínio registrável (`app.exemplo.com` e `api.exemplo.com`). Domínios distintos, como `vercel.app` e `railway.app`, fazem o navegador descartar o cookie — e o sintoma é login que "não funciona" sem erro visível.

**Enumeração de contas barrada por tempo, não só por mensagem.** O Argon2 roda mesmo quando o e-mail não existe, contra um hash isca, para que o tempo de resposta não entregue a diferença que a mensagem esconde.

## 7. ✅ Frontend ligado — concluído em 22/08/2026

- ~~Ligação real da modal de OTP~~ ✅ `login.html` e `cadastro.html` chamam os endpoints de verdade. Nenhum `setTimeout` de simulação restou.
- ~~Estado "Muitas tentativas"~~ ✅ ligado no 429, com a contagem vinda do servidor.
- **Tela de "Esqueci minha senha"** ⏳ continua faltando — e hoje o link exibe *"Link enviado"* sem enviar nada. Registrado como **D10 em `login.md`, com marcação de bloqueio de publicação.**

Em desenvolvimento a API serve o frontend (`SERVIR_FRONTEND=sim`, padrão fora de produção): um processo, uma porta, sem CORS entre origens. A allowlist de arquivos servidos é por inclusão — `.html` na raiz mais `css/`, `js/` e `img/` —, porque a raiz do site é o repositório inteiro, com o `.env` dentro.

## 8. Decisões em aberto

1. ~~Provedor de e-mail transacional~~ ✅ **Resend**, com driver de console para desenvolvimento. A troca é uma variável de ambiente; nenhuma rota conhece o fornecedor.
2. ~~CPF: criptografar ou hashear?~~ ✅ **Nem um nem outro no cadastro** — o campo saiu de lá (D5).
3. **Onde hospedar o frontend e a API** ⏳ — atenção ao domínio compartilhado, ver §6.1.
4. **Domínio** ⏳ — necessário antes de configurar HTTPS e CORS de verdade.
5. **Região do banco** ⏳ — o projeto no Neon ficou em `us-east-2`. Cada consulta carrega uns 120 ms de ida e volta a partir do Brasil, e um login faz várias. Vale recriar numa região da América do Sul antes de publicar, enquanto ainda não há dado real.

## 9. Roadmap faseado

- ✅ **Fase 1 — MVP de autenticação:** registrar, login, verificação por OTP, sessão com "lembrar de mim". **Concluída em 22/08/2026.** Com um acréscimo que o plano não previa: o código só é exigido em dispositivo novo (decisão D7), porque pedir a cada login impunha abrir o e-mail várias vezes ao dia a um público que a documentação descreve esperando "abrir um link e usar na hora".
- ⏳ **Fase 2 — Recuperação de senha:** telas novas + endpoints. **Bloqueia publicação** enquanto o link exibir sucesso falso.
- ⏳ **Fase 3 — Enrijecimento:** o rate limiting já está nas duas camadas e `login_attempts` já é usada. Falta observabilidade e logs.
- ⏳ **Fase 4 — Login com Google:** OAuth 2.0 real. O botão está desabilitado nas duas telas, como placeholder honesto.
- ⏳ **Fase 5 — Camada de borda:** Cloudflare na frente da API — pré-requisito assim que o cadastro abrir ao público.

## 10. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 2.0 | 2026-08-22 | Fase 1 concluída. Schema atualizado ao que foi implementado: CPF fora de `users`, tabela `dispositivos_confiaveis` acrescentada, campos de aceite e suspensão, `password_reset_tokens` adiada para a Fase 2. Endpoints marcados por estado; `challenge_id` documentado como cookie. Nova §6.1 com as decisões que a implementação acrescentou. Decisões 1 e 2 resolvidas, decisão 5 aberta sobre a região do banco. |
| 1.0 | 2026-08-13 | Documento criado. |

---

Fontes consultadas para as recomendações desta fase (preços, versões e boas práticas mudam com o tempo — revalidar se este documento for reaproveitado muito tempo depois):

- [Neon vs Supabase — comparação de free tier 2026](https://agentdeals.dev/neon-vs-supabase)
- [OWASP Password Storage Cheat Sheet — recomendação Argon2id](https://www.onlinehashcrack.com/guides/password-recovery/bcrypt-vs-argon2-choosing-strong-hashing-today.php)
