# Plano de backend — Login e Cadastro

> Versão: 1.0 · Escopo: autenticação por e-mail/senha com verificação por código (OTP). Login com Google fica para uma fase futura, por decisão explícita.

## 1. Contexto e decisões já tomadas

- Hoje o projeto é 100% estático (HTML/CSS/JS, sem build, sem backend). `login.html` e `cadastro.html` já têm a interface completa — inclusive a modal de verificação por código de 6 dígitos — mas todo o comportamento é simulado no navegador (`setTimeout`, sem chamada de rede real).
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

## 4. Modelo de dados (schema inicial)

```
users
  id                uuid (pk)
  nome              text
  email             text (unique, lowercase)
  cpf               text (unique, criptografado ou com hash — LGPD)
  senha_hash        text (argon2id)
  email_verificado  boolean (default false)
  criado_em         timestamptz
  atualizado_em     timestamptz

login_attempts                          -- suporte ao "Muitas tentativas" que já existe na tela
  id                uuid (pk)
  user_id           uuid (fk users, nullable — tentativa com e-mail que não existe)
  email_tentado     text
  sucesso           boolean
  ip                text
  criado_em         timestamptz

otp_codes                               -- cobre login e cadastro (os dois usam a mesma modal)
  id                uuid (pk)
  user_id           uuid (fk users)
  proposito         enum('login', 'cadastro', 'recuperacao_senha')
  codigo_hash       text (nunca guardar o código em texto puro)
  expira_em         timestamptz          -- sugestão: 10 min
  tentativas        int (default 0)      -- limita tentativas de adivinhar o código
  usado_em          timestamptz (nullable)
  criado_em         timestamptz

sessions                                 -- refresh tokens ativos
  id                uuid (pk)
  user_id           uuid (fk users)
  refresh_token_hash text
  lembrar_de_mim    boolean              -- controla o tempo de vida do token
  expira_em         timestamptz
  criado_em         timestamptz
  revogado_em       timestamptz (nullable)

password_reset_tokens
  id                uuid (pk)
  user_id           uuid (fk users)
  token_hash        text
  expira_em         timestamptz          -- sugestão: 30 min
  usado_em          timestamptz (nullable)
  criado_em         timestamptz
```

**Nota LGPD:** `cadastro.html` coleta CPF. Como é dado sensível, o campo não deve ficar em texto puro no banco — ou é criptografado com chave gerenciada separadamente, ou (se o CPF só serve para exibir/validar formato e nunca é usado como chave de busca) fica só o hash. Essa decisão de design entra na seção 8.

## 5. Endpoints da API

Todos sob `POST /api/v1/auth/...` (prefixo versionado desde o início, barato agora e caro de adicionar depois).

| Endpoint | Corresponde a | Retorno |
|---|---|---|
| `POST /auth/registrar` | Formulário de `cadastro.html` | Cria o usuário (`email_verificado=false`) e dispara OTP de cadastro |
| `POST /auth/login` | Formulário de `login.html` | Valida e-mail/senha; **não** abre sessão ainda — dispara OTP de login e devolve um `challenge_id` temporário |
| `POST /auth/otp/verificar` | Modal de verificação (Confirmar) | Confere o código contra `challenge_id`; se ok, cria a `session` (JWT + refresh token) |
| `POST /auth/otp/reenviar` | Modal de verificação (Reenviar código) | Gera novo código, reinicia o cooldown de 30s que a tela já implementa |
| `POST /auth/esqueci-senha` | Link "Esqueci minha senha" (ainda sem tela — ver seção 7) | Dispara e-mail com link de redefinição |
| `POST /auth/redefinir-senha` | Tela de redefinição (a criar) | Troca a senha usando o token do e-mail |
| `POST /auth/logout` | — | Revoga a sessão atual |
| `GET /auth/sessao` | Chamado pelo frontend ao carregar a página | Confirma se o cookie de sessão ainda é válido, sem precisar logar de novo |

Formato de erro padronizado (pra bater com os `field-error`/`alert` que a tela já tem prontos): `{ "campo": "email", "mensagem": "Informe um e-mail válido." }` — o frontend já sabe exibir isso, é só a API devolver nesse formato.

## 6. Segurança

- **Hash de senha:** Argon2id, parâmetros mínimos recomendados pelo OWASP (memória 19 MiB, 2 iterações, paralelismo 1) — ajustar para cima (ex.: 64–128 MiB) se o hardware da API aguentar, é mais seguro contra GPU.
- **Rate limiting em duas camadas:** um filtro grosso na borda (Cloudflare, antes da requisição chegar na API) e um filtro fino por IP + por e-mail dentro da própria API, em `/auth/login` e `/auth/otp/verificar` — é isso que alimenta o cenário "Muitas tentativas" que já existe pronto na tela (`alertBloqueio`), hoje sem lógica real por trás. Só rate limit na API não basta contra um ataque de credential stuffing distribuído; a borda é a primeira linha de defesa.
- **OTP:** 6 dígitos, expira em 10 minutos, uso único, máximo de tentativas antes de invalidar o código (a tela já mostra erro por tentativa errada). Nunca logar o código em texto puro.
- **Sessão:** access token JWT de vida curta (15 min) + refresh token de vida longa em cookie `httpOnly` + `Secure` + `SameSite=Strict`; "Lembrar de mim" controla se o refresh token dura dias ou só a sessão do navegador aberta.
- **Transporte:** HTTPS obrigatório em toda a cadeia (navegador → frontend → API → banco) — sem exceção, mesmo em ambiente de teste.
- **CORS:** allowlist restrita só ao(s) domínio(s) do frontend hospedado — qualquer origem fora dessa lista deve ser rejeitada pela API.
- **Conexão com o banco:** usar o pooler do Neon (ou PgBouncer, se trocar de provedor) assim que a API rodar em mais de uma instância — sem isso, o Postgres recusa conexão sob carga.
- **CPF (LGPD):** ver nota na seção 4 — decisão de criptografar ou hashear ainda em aberto. Com cadastro público, isso deixa de ser boa prática e vira obrigação formal (política de privacidade, plano de resposta a incidente).

## 7. O que falta no frontend antes do backend fazer sentido

- **Tela de "Esqueci minha senha":** hoje o link em `login.html` aponta pra `#`. Falta uma tela pra pedir o e-mail e outra pra definir a senha nova — sem isso, o endpoint `/auth/esqueci-senha` não tem pra onde apontar.
- **Ligação real da modal de OTP:** tanto em `login.html` quanto em `cadastro.html` a modal hoje só "confirma" com `setTimeout`. Precisa trocar por chamada real aos endpoints de `/auth/otp/*`.
- **Estado "Muitas tentativas":** o alerta já existe na tela mas nunca é acionado — precisa ligar na resposta 429 da API.

## 8. Decisões em aberto

1. **Provedor de e-mail transacional** para o OTP (Resend, SES, Postmark) — impacta custo e complexidade de configuração de domínio.
2. **CPF:** criptografar (recuperável) ou só hashear (não recuperável, só serve pra checar duplicidade)?
3. **Onde hospedar o frontend** (Vercel, Netlify ou Cloudflare Pages) **e a API** (Railway, Render, Fly.io — qualquer um roda Node + Postgres externo sem problema).
4. **Domínio** (ex.: `app.plataformadedesign.com` pro frontend, `api.plataformadedesign.com` pra API) — necessário antes de configurar HTTPS/CORS de verdade.

## 9. Roadmap faseado

- **Fase 1 — MVP de autenticação:** registrar, login, verificação por OTP, sessão com "lembrar de mim" via cookie. Sem recuperação de senha ainda.
- **Fase 2 — Recuperação de senha:** telas novas no frontend + endpoints `/auth/esqueci-senha` e `/auth/redefinir-senha`.
- **Fase 3 — Enrijecimento:** rate limiting real ligado ao `alertBloqueio`, auditoria de login (`login_attempts` já desenhada na Fase 1, passa a ser usada), logs/observabilidade.
- **Fase 4 — Login com Google:** OAuth 2.0 real, hoje fora de escopo por decisão do time.
- **Fase 5 — Camada de borda:** Cloudflare (ou equivalente) na frente da API para WAF, proteção contra bot/DDoS e cache do frontend — vira pré-requisito assim que o cadastro estiver aberto ao público.

---

Fontes consultadas para as recomendações desta fase (preços, versões e boas práticas mudam com o tempo — revalidar se este documento for reaproveitado muito tempo depois):

- [Neon vs Supabase — comparação de free tier 2026](https://agentdeals.dev/neon-vs-supabase)
- [OWASP Password Storage Cheat Sheet — recomendação Argon2id](https://www.onlinehashcrack.com/guides/password-recovery/bcrypt-vs-argon2-choosing-strong-hashing-today.php)
