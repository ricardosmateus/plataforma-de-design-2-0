# Plataforma de Design 2.0

> **Este documento mudou de lugar.**

A documentação de contexto da plataforma — visão, problema, missão, objetivos estratégicos, comunidade de especialistas, modelo de negócio e princípios — vive agora em um lugar só:

### → [`Regras_de_negocio/Sobre a Plataforma de Design/O_que_e_q_plataforma_de_design.md`](../Regras_de_negocio/Sobre%20a%20Plataforma%20de%20Design/O_que_e_q_plataforma_de_design.md)

---

## Por que mudou

Até 22/08/2026 o mesmo texto existia aqui **e** lá — byte a byte idêntico, com diferença de um espaço de indentação. Era a mesma doença que a auditoria de agosto corrigiu no CSS, agora na documentação: duas cópias divergem no instante em que alguém edita uma só, e ninguém percebe porque ninguém compara dois arquivos linha a linha.

O agravante é que a `regra_de_negocio.skill` determina que **a documentação prevalece sobre o código** em caso de conflito. Com duas cópias, não existe "a documentação" — existe um empate sem critério de desempate.

`Regras_de_negocio/` ficou como fonte oficial porque é onde a skill manda procurar.

---

## O que continua aqui, em `Documentacao/`

| Pasta | Conteúdo |
|---|---|
| `Backend/` | Plano de arquitetura e infraestrutura da API |
| `Tokens/` | Geração e referência dos tokens de design |

E o que **não** está aqui: as regras de negócio por página, que vivem em `Regras_de_negocio/modulos/`. A de acesso à plataforma está em `modulos/acesso/`, dividida entre `login.md` e `cadastro.md`.

---

*Registrado como decisão D6 em `Regras_de_negocio/modulos/acesso/login.md`.*
