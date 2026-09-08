# API de autenticação — Plataforma de Design 2.0

Node + Fastify + Prisma + PostgreSQL, conforme `Documentacao/Backend/PLANO_BACKEND_LOGIN.md` §2 e §3.
Regras implementadas: `Regras_de_negocio/modulos/acesso/login.md` e `cadastro.md`.

**Escopo desta fase:** só autenticação. Empresas, vínculos, perfil de especialista e créditos entram com o módulo de empresas — o que mantém a decisão D2 (créditos por usuário ou por empresa) destravada.

---

## Subir localmente

```bash
cd api
npm install
cp .env.example .env
```

Gere os dois segredos e cole no `.env`:

```bash
node -e "console.log('JWT_SEGREDO=' + crypto.randomBytes(32).toString('base64url'))"
node -e "console.log('OTP_PIMENTA=' + crypto.randomBytes(32).toString('base64url'))"
```

Aponte `DATABASE_URL` para um Postgres (local ou Neon), e então:

```bash
npm run gerar     # gera o client do Prisma
npm run migrar    # aplica a migração
npm run dev       # sobe em http://localhost:3333
```

Com `EMAIL_DRIVER=console`, o código de verificação **aparece no log do terminal** — o fluxo inteiro funciona sem contratar provedor de e-mail.

## Testes

```bash
npm run teste
```

---

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/registrar` | Cria a conta (`email_verificado=false`) e dispara o código |
| POST | `/auth/login` | Valida a credencial; devolve `entrar` ou `verificar-codigo` |
| POST | `/auth/otp/verificar` | Confere o código, abre a sessão e passa a reconhecer o dispositivo |
| POST | `/auth/otp/reenviar` | Novo código, respeitando o intervalo de 30 s |
| GET | `/auth/sessao` | Confirma a sessão; renova pelo refresh quando o acesso vence |
| POST | `/auth/logout` | Revoga a sessão no servidor |
| GET | `/saude` | Verifica processo e banco |

Em desenvolvimento a API também **serve o frontend**: o site inteiro fica em `http://localhost:3333`, num processo só, sem CORS entre origens. A allowlist é por inclusão — `.html` na raiz mais `css/`, `js/` e `img/` — porque a raiz do site é o repositório inteiro, com o `.env` dentro. Em produção fica desligado por padrão, já que o frontend vai para CDN; ligue com `SERVIR_FRONTEND=sim` para publicar tudo junto.

**Formato de erro** (combinado com o frontend, plano §5):

```json
{ "campo": "email", "mensagem": "Informe um e-mail válido." }
```

`campo: null` é erro geral — a tela mostra como alerta em vez de marcar um campo. Respostas 403 de suspensão trazem também `suspensao: "violacao" | "inadimplencia"`; respostas 429 trazem `segundosRestantes`.

**O que `/auth/login` devolve em `proximo`:**

- `entrar` — dispositivo já reconhecido, sessão aberta, segue para a cascata
- `verificar-codigo` — precisa do código; `proposito` diz se é `login` ou `cadastro`

---

## Decisões de segurança

**Senha em Argon2id.** Parâmetros no `.env`, no mínimo do OWASP (19 MiB, 2 iterações). Suba `ARGON_MEMORIA` se o servidor aguentar — é o que mais encarece ataque por GPU.

**Política de senha por comprimento, não composição.** Mínimo de 8, sem exigir maiúscula, número ou símbolo, com conferência contra a base do Have I Been Pwned por *k-anonymity* — só os cinco primeiros caracteres do SHA-1 saem daqui. Segue NIST SP 800-63B Rev 4; o raciocínio completo está em `cadastro.md` §1.2.

**Código de verificação selado com HMAC e pimenta.** Seis dígitos são um milhão de combinações: um SHA-256 puro cairia em segundos se o banco vazasse, e um argon2 seria caro demais para algo que morre em dez minutos. Com HMAC, o segredo não vive no banco, então o dump sozinho não serve. A comparação é em tempo constante.

**Tokens em cookie `httpOnly`, não no corpo da resposta.** O frontend é HTML estático sem build; se precisasse guardar o token, o único lugar seria `localStorage`, e qualquer XSS levaria a sessão. Em cookie `httpOnly` o JavaScript da página não alcança o token nem se for comprometido. O CSRF que isso abre fica coberto por `SameSite=Strict`, allowlist de origem no CORS e corpo JSON.

**Refresh com rotação.** Cada renovação revoga o token usado e emite outro: um token copiado e reapresentado depois já não vale.

**Enumeração de contas barrada no login.** A resposta não distingue "e-mail não existe" de "senha errada" — e o argon2 roda mesmo quando a conta não existe, contra um hash isca, para que o tempo de resposta também não entregue a diferença. No **cadastro** a regra se inverte de propósito (CAD-CONTA-003): lá, omitir isso transformaria a tela num beco sem saída.

**Dois limites de tentativa.** Por IP na borda da API, e por e-mail no banco — só o segundo pega ataque distribuído mirando uma conta específica, que é o caso que interessa.

---

## Antes de publicar

1. `NODE_ENV=production` — é o que liga `Secure` nos cookies.
2. Segredos novos, diferentes dos de desenvolvimento, fora do versionamento.
3. `ORIGENS` com o domínio real do frontend, sem `localhost`.
4. `EMAIL_DRIVER=resend` com a chave e o domínio de envio verificado.
5. `DATABASE_URL` com o *pooler* do Neon — sem ele, escalar para várias instâncias esgota conexão.
6. HTTPS em toda a cadeia; se API e frontend dividirem domínio-pai, defina `COOKIE_DOMINIO`.

---

## Estado da verificação

| Verificado | Como |
|---|---|
| Migração SQL | Aplicada em PostgreSQL 16 real; unicidade de e-mail, chaves estrangeiras, enums, `CASCADE` em sessões e `SET NULL` na auditoria conferidos |
| Primitivas de segurança | 18 testes passando: Argon2id, política de senha, selo do código, tokens de sessão |
| **Rotas de ponta a ponta** | ✅ **22/08/2026** — cadastro, código por e-mail via Resend, login e reconhecimento de dispositivo verificados contra o Neon |
| Frontend ligado | ✅ 23 verificações automatizadas cobrindo 401, 403, 409, 429, 440 e a cascata de roteamento |

A migração foi escrita à mão porque o CDN de binários do Prisma estava bloqueado no ambiente onde a API foi construída. Ela corresponde ao `schema.prisma` — **se alterar um, altere o outro.**

### Quatro defeitos de partida corrigidos em 22/08/2026

Todos da mesma família: coisas que só aparecem quando o processo sobe de verdade, e que não puderam ser exercitadas onde a API foi escrita.

1. `previewFeatures` do Prisma esquecidas no schema, de uma tentativa de contornar o CDN bloqueado — gerariam um client que exige driver adapter.
2. Detecção de "executado direto" comparando caminhos internos: sob `tsx watch` os valores não batiam, e o processo subia **sem escutar em porta nenhuma**, silenciosamente.
3. O `.env` nunca era lido. A CLI do Prisma carrega sozinha, o Node não — por isso `prisma migrate` enxergava `DATABASE_URL` e a aplicação não enxergava nada. Resolvido com `loadEnvFile()`, nativo do Node, sem dependência nova.
4. `RESEND_API_KEY=""` passava pela validação, porque `??` só pega valor ausente, não string vazia. A API subia anunciando `driver: resend` para tomar 401 no primeiro envio.

O quarto virou regra: falhas que dependem da **combinação** entre dois campos de configuração são verificadas explicitamente em `env.ts`, depois do esquema.

### O quinto, achado em 02/09/2026: o teste migrava a PRODUÇÃO

Da mesma família dos quatro acima — invisível até alguém olhar a linha
certa da saída.

`scripts/migrar-teste.ts` trocava `DATABASE_URL` pela de teste antes de
chamar `prisma migrate deploy`. Mas o `schema.prisma` declara
`directUrl = env("DIRECT_URL")`, e **o `prisma migrate` usa a `directUrl`
quando ela existe, ignorando a `url`**. A migração seguia pela
`DIRECT_URL` — que aponta para produção.

Ou seja: `npm run teste` rodava `migrate deploy` no banco de produção, e
o banco de teste nunca recebia migração nenhuma. O sintoma era mudo,
porque produção normalmente já está migrada e o Prisma responde
`No pending migrations to apply`. A única hora em que apareceria seria a
pior possível: uma migração pendente sendo aplicada em produção por
alguém que só queria rodar teste.

Duas correções, e a segunda é a que importa mais:

1. O script passa `DIRECT_URL` junto (`DIRECT_URL_TESTE`, opcional — sem
   ela, migra pela própria URL de teste).
2. **Uma trava:** antes de migrar, compara host e nome do banco de teste
   com os de produção e **aborta** se forem o mesmo. "NUNCA aponte para o
   banco de produção" estava escrito no topo de todo arquivo de
   integração e nada impedia — e os testes de integração APAGAM linhas.

A lição, que vale além deste caso: **quando uma configuração tem dois
canais para o mesmo destino, trocar um só não redireciona nada.**
