# Regras de Negócio — Criação de Conta

> **Versão:** 1.3.1 · **Status:** Implementado e ligado na API
> **Módulo:** Acesso · **Página:** `cadastro.html`
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documento irmão:** [`login.md`](login.md) — identidade, perfis e roteamento

---

## Identificação da página

| Campo | Valor |
|---|---|
| Nome | Criar sua conta |
| Módulo | Acesso |
| Rota | `/cadastro.html` |
| Arquivo de interface | `cadastro.html` |
| Arquivo de comportamento | `js/cadastro.js` |
| Arquivo de regras | `Regras_de_negocio/modulos/acesso/cadastro.md` *(este documento)* |
| Entidades | `users`, `otp_codes` |
| Componentes | Casca de login, Campo, Botão, Alerta, Modal de verificação, Medidor de força, Requisitos, Aceite |
| Páginas relacionadas | `login.html`, `empresas.html` |

---

## 1. Regras

### 1.1 Conta — `CAD-CONTA`

| ID | Regra | Fonte |
|---|---|---|
| CAD-CONTA-001 | O cadastro coleta **nome, e-mail e senha**. Nada além disso. | D1 · D5 · `login.md` §2 |
| CAD-CONTA-002 | Não há escolha de perfil no cadastro. As capacidades vêm dos vínculos. | D1 · `login.md` §2.1 |
| CAD-CONTA-003 | E-mail já cadastrado **é revelado**, com caminho para o login. | Decidido 21/08/2026 — ver nota abaixo |
| CAD-CONTA-004 | O nome exige ao menos duas palavras. | Interface existente |
| CAD-CONTA-005 | A conta nasce com `email_verificado = false` e só é utilizável após a confirmação por código. | Plano backend §5 |
| CAD-CONTA-006 | CPF **não** é coletado aqui. | D5 · `login.md` §7 |

**Nota sobre CAD-CONTA-003 — divergência deliberada com o login.** `ACS-LOGIN-004` proíbe revelar se um e-mail existe, para barrar enumeração de contas. No cadastro a regra se inverte: omitir isso transforma a tela num beco sem saída, a pessoa não entende por que falhou e tenta de novo com os mesmos dados. A informação, aliás, já é obtível por qualquer fluxo de recuperação de senha. Trocamos um vazamento que o atacante consegue de outro jeito por uma tela que funciona — e oferecemos o caminho útil, que é entrar.

### 1.2 Senha — `CAD-SENHA`

| ID | Regra | Fonte |
|---|---|---|
| CAD-SENHA-001 | Mínimo de **8 caracteres**. | NIST SP 800-63B Rev 4 |
| CAD-SENHA-002 | A senha é conferida contra lista de senhas comuns e vazadas. | NIST SP 800-63B Rev 4 |
| CAD-SENHA-003 | **Não** se exige maiúscula, número nem símbolo. | NIST SP 800-63B Rev 4 |
| CAD-SENHA-004 | O medidor de força mede **comprimento**, não variedade de caracteres. Senha na blocklist nunca passa do nível mais baixo, por mais longa que seja. | Decorrência de 001–003 |
| CAD-SENHA-005 | Não há campo de confirmação de senha; o botão de revelar cumpre esse papel. | Decidido 21/08/2026 |
| CAD-SENHA-006 | A conferência que vale é no servidor. O cliente valida formato e dá resposta imediata. | Plano backend §2 |

**Por que oito e não quinze.** A Rev 4 exige mínimo de 15 quando a senha é o **único** autenticador. Aqui não é: `ACS-LOGIN-002` acrescenta código por e-mail em dispositivo novo. Com segundo fator, o piso de 8 é o aplicável.

**Por que largar as regras de composição.** O texto da norma é que sistemas "shall not impose arbitrary composition requirements beyond the basic length and blocklist checks". Exigir maiúscula, número e símbolo produz `Senha1!` — que satisfaz as quatro regras e é péssima — e rejeita `cavalo bateria grampo correto`, que é ordens de grandeza mais forte. A norma trocou composição por comprimento e blocklist porque as regras antigas pioravam o resultado que diziam proteger.

### 1.3 Aceite — `CAD-ACEITE`

| ID | Regra | Fonte |
|---|---|---|
| CAD-ACEITE-001 | O aceite dos Termos de uso e da Política de privacidade é obrigatório e explícito — caixa desmarcada por padrão. | Interface existente · LGPD |
| CAD-ACEITE-002 | A data e a versão dos documentos aceitos são registradas na conta. | ✅ `users.termos_versao` e `termos_aceitos_em` |

### 1.4 Destino — `CAD-DESTINO`

| ID | Regra | Fonte |
|---|---|---|
| CAD-DESTINO-001 | Confirmado o código, a conta segue pela cascata de `login.md` §4 — que leva a `empresas.html`, onde o estado vazio convida a criar a primeira. | ACS-LOGIN-010 · ACS-LOGIN-017 |
| CAD-DESTINO-002 | O cadastro **não cria empresa alguma** — nem implícita, nem "pessoal", nem de exemplo. A conta nasce com zero vínculos, e é por isso que o estado vazio da listagem é a primeira tela real de toda conta nova. | EMP-LIST-008 |

A tentação em CAD-DESTINO-002 é criar uma empresa automática para que a listagem nunca nasça vazia. Seria acolhedor e violaria "Ensinar antes de executar": a pessoa ganharia uma empresa sem entender o que uma empresa é aqui dentro, e a tela que ensina isso nunca seria vista.

Uma conta recém-criada nunca tem vínculo, e mesmo assim entra pela listagem. Ela aprende primeiro **onde fica a casa**, e o estado vazio a convida a mobiliar — daí para o fluxo completo de criação. Cair direto no formulário sem nunca ter visto a tela principal deixa quem desiste no meio sem saber para onde voltar.

---

## 2. Estados obrigatórios

| Estado | Situação | Observação |
|---|---|---|
| Primeiro acesso | **Não se aplica** | A página inteira *é* o primeiro acesso |
| Vazio | **Não se aplica** | Formulário, não listagem |
| Carregando | ✅ `.is-loading` no botão | — |
| Sucesso | ✅ Modal de verificação → cascata | — |
| Erro | ✅ `field-error` por campo | — |
| Sem permissão | **Não se aplica** | Cadastro é público por definição |
| Arquivado | ✅ `alertDuplicado` — e-mail já cadastrado | A conta existente pode estar suspensa; o login trata |
| Offline | ✅ `alertOffline` — trava o envio | — |
| Sessão expirada | **Não se aplica** | Não há sessão antes do cadastro |
| Integração indisponível | ✅ Provedor fora do ar → a modal avisa em vez de deixar esperando | — |

**Os dez avaliados**, sendo quatro justificados como não aplicáveis, conforme a skill permite. Nenhum pendente.

---

## 3. Gatilhos de demonstração

> **Não há mais gatilhos de demonstração.** Desde 22/08/2026 a tela conversa com a API de verdade: quem decide é o servidor. O que segue é como exercitar cada caminho de verdade.

| Para ver | Faça |
|---|---|
| E-mail já cadastrado | Cadastre o mesmo e-mail duas vezes |
| Reprovação por comprimento | Senha com menos de 8 caracteres |
| Reprovação pela blocklist | `password1` (barrado no cliente) ou qualquer senha vazada conhecida (barrada no servidor, via Have I Been Pwned) |
| Frase longa aceita | `cavalo bateria grampo correto` — sem maiúscula, número ou símbolo |
| Código inválido | Digite um código diferente do que chegou |
| Fluxo completo | O código sai no e-mail; com `EMAIL_DRIVER=console`, no log da API |

---

## 4. O que mudou nesta etapa

| Antes | Depois | Regra |
|---|---|---|
| Nome, CPF, e-mail, senha, confirmar senha | Nome, e-mail, senha | CAD-CONTA-001 |
| CPF obrigatório com validação de dígito | Removido; código preservado em `js/cpf.js` | CAD-CONTA-006 |
| 4 requisitos de composição | 2 requisitos: comprimento e blocklist | CAD-SENHA-001 a 003 |
| Medidor conta classes de caracteres | Medidor mede comprimento | CAD-SENHA-004 |
| Confirmar senha | Removido | CAD-SENHA-005 |
| Sem estado offline | `alertOffline` | Estados obrigatórios |
| Alerta de duplicado nunca acionado | Acionado, com link para o login | CAD-CONTA-003 |
| Destino: `empresas.html` | Destino: `empresas.html`, agora por decisão e não por acaso | CAD-DESTINO-001 |
| Botão do Google ativo | Placeholder desabilitado | Plano backend §1 |

O CPF **não foi apagado**. A máscara e a validação de dígito verificador foram para `js/cpf.js`, prontas para a tela onde o especialista informa dados fiscais no primeiro recebimento.

---

## 5. Pendências

### ⚠ P2 — Termos e Política apontam para `#` — **BLOQUEIA PUBLICAÇÃO**

Os dois links do aceite não levam a lugar nenhum, e o aceite é obrigatório. A conta já registra *quando* e *qual versão* foi aceita — mas não existe documento na versão registrada. Pedir aceite de documento inexistente não se sustenta juridicamente, e é o tipo de pendência que só aparece quando já é tarde.

Registrada em conjunto com a **D10** de `login.md`, que trata da mesma família: promessas que a tela faz e o produto não cumpre.

### ✅ P1 e P3 — resolvidas em 22/08/2026

**Registro do aceite:** a API grava `termos_versao` e `termos_aceitos_em` ao criar a conta. O registro existe — falta o documento que está sendo aceito (P2).

**Blocklist real:** o servidor confere contra a base do Have I Been Pwned por *k-anonymity* — só os cinco primeiros caracteres do SHA-1 saem da API, então a senha nunca trafega. A lista local de quinze senhas continua, agora só para dar resposta imediata enquanto a pessoa digita e poupar uma ida à rede no caso óbvio.

### ✅ P4 — Dívida técnica da tela — **PAGA em 22/08/2026**

| | Antes | Depois |
|---|---|---|
| `cadastro.html` | 1216 linhas | **284** |
| CSS embutido | 477 linhas, 49 seletores duplicados | 16 linhas, só o que diverge |
| JavaScript embutido | 468 linhas | 0 — extraído para `js/cadastro.js` |
| SVG inline | 11 | 1 (o logotipo do Google, ver abaixo) |
| Componentes fora do styleguide | 10 | 0 |

**Os ícones eram o problema maior, e não eram dois — eram três.** Havia sprite inline no `login.html`, outro no `styleguide.html`, e SVG solto no cadastro. Pior: o mesmo ícone já tinha divergido — o olho, o envelope e o X do cadastro tinham traçados diferentes dos do login. Ninguém notaria, porque ninguém abre dois arquivos lado a lado para comparar geometria. Agora existe `img/icones.svg`, com 16 símbolos, referenciado pelas três páginas.

**O logotipo do Google continua inline, por limite técnico real:** variável CSS não atravessa para dentro de um SVG externo, e ele usa as cores de marca em `var()`.

**Componentes promovidos ao sistema**, em `components.css` e catalogados no styleguide: medidor de força (`.strength*`), requisitos (`.requisito*`), aceite de termos (`.form-aceite`, `.checkbox--aceite`) e o modificador `.form--signup`.

`.senha-dica` virou **`.campo-dica`** na promoção: orientação abaixo de um campo não é exclusiva de senha. Pequeno, mas é a diferença entre componente de sistema e remendo de página.

*(`.field-grid` e `.input--numeric` foram removidos: existiam só para o par Nome + CPF.)*

**Duas armadilhas encontradas no caminho, registradas para quem editar os ícones.** Comentário em arquivo SVG não pode conter dois hifens seguidos — é XML estrito, e um `--` derruba o arquivo inteiro com sintoma silencioso: todos os ícones somem de uma vez, sem erro no console. E símbolo com `viewBox` deslocado, consumido por um `<svg>` que declara o mesmo `viewBox`, aplica a transformação duas vezes e recorta o desenho; por isso todo traçado no sprite começa na origem.

---

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.3.1 | 2026-08-22 | Acrescentada CAD-DESTINO-002: o cadastro não cria empresa alguma. Páginas relacionadas corrigidas. |
| 1.3.0 | 2026-08-22 | Destino após o cadastro passa a ser `empresas.html`, acompanhando a simplificação da cascata (ACS-LOGIN-017). |
| 1.2.0 | 2026-08-22 | **Dívida técnica paga (P4).** `cadastro.html` caiu de 1216 para 284 linhas: CSS duplicado removido em favor de `components.css`, JavaScript extraído para `js/cadastro.js`, e os ícones unificados em `img/icones.svg` — que substituiu três sprites concorrentes cujos traçados já haviam divergido. Os componentes exclusivos viraram componentes de sistema e estão catalogados no styleguide. `.senha-dica` renomeada para `.campo-dica`. |
| 1.1.0 | 2026-08-22 | Tela ligada na API: `POST /auth/registrar` e `/auth/otp/verificar` no lugar das simulações. O 409 passa a acionar o alerta de e-mail duplicado, e erros `{campo, mensagem}` marcam o campo correspondente. |
| 1.0.0 | 2026-08-21 | Documento criado. CPF removido do cadastro (D5), com máscara e validação preservadas em `js/cpf.js`. Política de senha migrada de quatro regras de composição para comprimento mais blocklist, conforme NIST SP 800-63B Rev 4. Campo de confirmação removido. Estado offline acrescentado. Alerta de e-mail duplicado ligado, com caminho para o login. Destino pós-cadastro corrigido para `criar-empresa.html`. Botão do Google alinhado ao placeholder do login. |

---

**Fontes externas consultadas**

- [NIST SP 800-63B Rev 4 — o que mudou em senhas (Enzoic)](https://www.enzoic.com/blog/nist-sp-800-63b-rev4/)
- [NIST password guidelines: SP 800-63B explained (Netwrix)](https://netwrix.com/en/resources/blog/nist-password-guidelines/)
