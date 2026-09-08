# Planejamento — Grafo de Conhecimento da Empresa (v2 – Agosto 2026)

> Revisão da visão de 05/08/2026 contra o estado atual do backend.
> Data: 29/08/2026

## Mudança de premissa fundamental

**De 05/08:** "Hoje a plataforma é estática, sem backend. O agente de taxonomia = 70–80% do esforço."

**De 29/08:** Backend existe. `api/src/ia/` (875 linhas) já fala com Anthropic, extrai JSON, valida entrada. O agente deixa de ser um subsistema novo e vira mais um consumidor de `provedor.ts`. O custo caiu de "meses" para "semanas".

---

## Visão revisada

`Sobre_a_empresa.html` deixa de ser um protótipo e passa a ser o **cérebro vivo da empresa**.

### Três projeções do mesmo dado

| Projeção | Estrutura | Serve para |
|---|---|---|
| **Pastas** | Hierarquia (1 assunto por ideia) | Organizar / encontrar |
| **Grafo** | Rede (N tags por ideia) | Explorar / descobrir conexões |
| **HTML abaixo** | Lista navegável | Acessibilidade + scroll + CTRL+F |

**Uma única fonte de verdade:** `Ideia.assunto` (categoria principal) + `Ideia.tags` (categorias secundárias), ambas preenchidas quando `status === "finalizado"`.

### Fluxo de entrada

1. Ideia criada → status "ideias" (rascunho)
2. Ideia → status "andamento" (em progresso)
3. Ideia → status "finalizado" (validada) → Claude classifica: assunto + tags → Pasta aparece em "Sobre a Empresa"

### Fluxo de saída (regra crítica)

Ideia em "finalizado" → usuario move para "andamento" OU "ideias" → assunto := null, tags := [] → DESAPARECE de "Sobre a Empresa"

**Por quê?** Conhecimento não validado não influencia decisões. Escala com confiança — ninguém usa um mapa que muda toda hora.

---

## Regras de ouro

### Regra 1: Apenas "finalizado" aparece
Uma ideia em "ideias" ou "andamento" **nunca** tem `assunto` e `tags` preenchidos.

### Regra 2: Transição para fora de "finalizado" limpa
Quando status sai de "finalizado", assunto → null, tags → []

### Regra 3: Só um assunto, múltiplas tags
Assunto = pasta (1), Tags = temas transversais (N)

### Regra 4: Normalização v1→v2
"Interface" (v1) → "UI" (v2) antes de exibir

---

## Caminho incremental (8 semanas)

- **Semana 1:** Migration Prisma + API
- **Semana 2:** Pastas dinâmicas
- **Semana 3:** Skill de taxonomia
- **Semana 4:** Grafo (canvas force-directed)
- **Semana 5:** Painel de contexto
- **Semana 6:** Otimizações de escala
- **Semana 7:** Acessibilidade + Fallback
- **Semana 8:** Validação e docs

---

## Frase-chave

> "Não estamos construindo um Obsidian dentro da plataforma. Estamos tornando o conhecimento validado navegável de três formas — pastas, grafo, HTML — a partir da mesma taxonomia que a IA propõe e o usuário confirma. Escala com confiança: se sair de 'finalizado', sai do mapa."
