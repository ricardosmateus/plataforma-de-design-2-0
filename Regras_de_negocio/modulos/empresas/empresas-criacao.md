# Regras de Negócio — Criação de Empresa

> **Versão:** 1.0.0 · **Status:** Regras definidas; implementação em andamento
> **Módulo:** Empresas · **Página:** `empresas.html` (modal "Nova empresa")
> **Gerado sob:** `Skills/regra_de_negocio.skill`
> **Documentos irmãos:** [`empresas-listagem.md`](empresas-listagem.md) — a listagem que este modal alimenta

---

## Identificação

| Campo | Valor |
|---|---|
| Nome | Nova empresa (modal) |
| Módulo | Empresas |
| Endpoint | `POST /empresas` |
| Entidades | `empresas`, `empresa_membros` |
| Componentes | Modal, dropzone de logotipo |

O modal é o mesmo em duas situações — aberto pelo botão do cabeçalho ou pelo botão do estado vazio (EMP-LIST-004 em `empresas-listagem.md`). Este documento cobre o que acontece **dentro** dele: o que é aceito, o que é recusado, e para onde vai o arquivo do logotipo.

---

## 1. Regras

| ID | Regra | Fonte |
|---|---|---|
| EMP-CRIA-001 | Nome é obrigatório, até 120 caracteres. | Já implementado |
| EMP-CRIA-002 | Nome duplicado é bloqueado **por conta** — não globalmente. Comparação ignora maiúscula/minúscula e acento. Empresa arquivada não conta: o nome fica livre para reuso. | Decidido 22/08/2026 |
| EMP-CRIA-003 | Logotipo é opcional. Aceita SVG, PNG ou JPG, até 2MB. Validado no cliente **e** no servidor — o cliente pode ser contornado. | Decidido 22/08/2026 |
| EMP-CRIA-004 | O arquivo do logotipo vive em armazenamento externo (Cloudflare R2, compatível com S3). O banco guarda só a URL. | Decidido 22/08/2026 |
| EMP-CRIA-005 | Sem armazenamento configurado (`S3_DRIVER=none`), criar empresa **sem** logotipo continua funcionando. Anexar um arquivo devolve mensagem clara em vez de erro genérico. | Decidido 22/08/2026 — mesmo padrão do `EMAIL_DRIVER` |

**Por que EMP-CRIA-002 é por conta, não global.** Nome de empresa não é único no mundo real — duas pessoas podem legitimamente ter uma "Nike" cada uma na própria carteira de clientes. Travar globalmente faria a primeira pessoa a cadastrar um nome comum reservá-lo para sempre, para todo mundo.

**Por que ignora acento e maiúscula.** É o que a pessoa que está digitando espera. Sem isso, "Nike" e "NIKE" seriam duas empresas diferentes na mesma lista — confusão sem nenhum ganho.

**Por que a empresa arquivada não conta.** Consistente com a decisão E1 (`empresas-listagem.md` §5): arquivar tira a empresa do caminho de verdade, não é um rótulo. Se o nome continuasse reservado, arquivar não teria resolvido nada para quem quer recomeçar com o mesmo nome.

**Por que EMP-CRIA-005 existe.** O `POST /empresas` não pode ficar bloqueado esperando a conta no Cloudflare R2 ser criada. O mesmo problema já apareceu com e-mail: `EMAIL_DRIVER=console` permitiu testar o cadastro inteiro antes do Resend existir. Aqui, `S3_DRIVER=none` permite testar a criação de empresa (sem logo) antes do R2 existir — e, se alguém tentar anexar um arquivo nesse meio-tempo, a resposta é honesta: "envio de logotipo indisponível no momento", não um 500.

---

## 2. Contrato da API — `POST /empresas`

**Requisição.** `multipart/form-data`, autenticada pelo cookie de acesso.

| Campo | Obrigatório | Regra |
|---|---|---|
| `nome` | Sim | EMP-CRIA-001, EMP-CRIA-002 |
| `descricao` | Não | até 600 caracteres |
| `logotipo` | Não | EMP-CRIA-003 |

| Situação | Resposta |
|---|---|
| Criada | `201` com a empresa, no formato do `GET /empresas` |
| Nome vazio ou longo demais | `400`, `campo: "nome"` |
| Nome duplicado (não arquivada) | `400`, `campo: "nome"`, mensagem "Você já tem uma empresa com esse nome." |
| Arquivo de tipo ou tamanho inválido | `400`, `campo: "logotipo"` |
| Anexou arquivo sem `S3_DRIVER` configurado | `400`, `campo: "logotipo"`, mensagem "Envio de logotipo indisponível no momento." |
| Sessão inválida | `401` |
| Conta suspensa | `403` |

**Ordem de validação:** nome antes do upload. Um nome duplicado não deve gastar uma chamada ao armazenamento — o arquivo só sobe depois que se sabe que a empresa vai existir.

---

## 3. Modelo de dados

Complementa `empresas` (já criada em `empresas-listagem.md` §3):

```
empresas
  ...campos existentes...
  nome_busca   text (not null)   -- nome normalizado: minúsculo, sem acento

  índice único parcial (criado_por, nome_busca) where arquivado_em is null
```

`nome_busca` é gravado pelo servidor a partir de `nome`, nunca recebido do cliente — evita que alguém mande um `nome_busca` que não bate com o `nome` de verdade.

---

## 4. Decisões

| ID | Questão | Decisão | Data |
|---|---|---|---|
| E7 | SVG pode conter script embutido | Aceito sem sanitização por ora. Não bloqueia — relevante se um dia a plataforma exibir logotipos de uma empresa para pessoas de fora dela. | Registrada 22/08/2026, não resolvida |

---

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-08-22 | Documento criado. Regras de nome duplicado e armazenamento de logotipo definidas e autorizadas. |
