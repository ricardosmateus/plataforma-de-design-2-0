> **SUPERSEDIDA — NÃO SEGUIR.**
>
> Este documento descreve outra arquitetura: fala em *Atividade* (o
> modelo aqui é `Ideia`), aponta para `src/lib/actions/obsidian.ts`
> (não existe neste projeto) e prevê sincronização com o Obsidian,
> que foi descartada — a visão do conhecimento é interna à
> plataforma.
>
> O que vale hoje:
> - Especificação: `Skills/categorizacao-taxonomia.skill`
> - Implementação e decisões: `Documentacao/grafo-de-conhecimento.md`
>
> Mantido só como registro do desenho anterior.

---

# Skill — Classificação Automática de Atividades por Taxonomia

## Objetivo

Atuar como um Product Designer Sênior especializado em Discovery, UX Research, Service Design e Gestão de Produtos. Classificar cada atividade finalizada em categorias estratégicas de Product Design, organizando o conhecimento do projeto em uma taxonomia consistente para facilitar pesquisa, filtros e visualização no Obsidian.

---

## Momento de Execução

Executar **exclusivamente** quando uma atividade for alterada para o status `"finalizado"`.

Atividades em andamento, pendentes ou em edição **não devem ser classificadas**.

---

## Fluxo

```
Atividade → status "finalizado"
  → Ler título e descrição
  → Consultar contexto da empresa e do projeto
  → Consultar categorias já existentes no projeto (normalizadas v1→v2)
  → Classificar: categoria principal + categorias secundárias
  → Salvar assunto (principal) e tags (secundárias) na Atividade
  → Sincronizar Obsidian automaticamente (fire-and-forget)
```

---

## Implementação

**Arquivo:** `src/lib/actions/atividade.ts`
**Função:** `classificarTaxonomia(titulo, descricao, projetoId, empresaId)`
**Disparada por:** `atualizarStatusAtividade` ao entrar em `"finalizado"`

### Contexto enviado à IA

| Dado | Fonte |
|------|-------|
| Título da atividade | `Atividade.titulo` |
| Descrição da atividade | `Atividade.descricao` |
| Nome da empresa | `Empresa.nome` |
| Segmento da empresa | `Empresa.segmento` |
| Descrição da empresa | `Empresa.descricao` |
| Tipo do projeto | `Projeto.tipo` |
| Subtipo do projeto | `Projeto.tipoSite` |
| Descrição do projeto | `Projeto.descricao` |
| Categorias já usadas no projeto | `Atividade.assunto` + `Atividade.tags` das atividades finalizadas (normalizadas v1→v2) |

### Saída esperada (JSON)

```json
{ "principal": "Concorrentes", "secundarias": ["Benchmark", "Mercado"] }
```

### Modelo e Arquitetura

- **Modelo:** `claude-haiku-4-5-20251001`
- **max_tokens:** 120 (saída é apenas JSON curto)
- **Arquitetura:** `system` message com a taxonomia completa + `cache_control: { type: "ephemeral" }` para prompt caching; `user` message com o contexto específico da atividade

### Normalização v1 → v2

Antes de incluir categorias existentes no prompt, nomes antigos são mapeados:

| Nome antigo (v1) | Nome atual (v2) |
|------------------|-----------------|
| `Interface` | `UI` |
| `Pesquisa com Usuários` | `Pesquisa Qualitativa` |

Isso garante que atividades classificadas antes da v2 não contaminem o vocabulário de novas classificações.

### Persistência

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `Atividade.assunto` | `String?` | Categoria principal |
| `Atividade.tags` | `String[]` | Categorias secundárias |

Ao sair de `"finalizado"`: `assunto → null`, `tags → []`

---

## Filosofia de Classificação

### Teste da Pasta Única

Antes de definir a Categoria Principal, responder: **"Se esta atividade pudesse existir em apenas uma pasta, em qual pasta um Product Designer experiente esperaria encontrá-la?"**

### Critérios para definir a Categoria Principal

1. **Objetivo da atividade** *(maior peso)*: qual é o verdadeiro objetivo?
2. **Contexto da decisão**: qual decisão de Product Design será apoiada?
3. **Fonte do conhecimento**: a informação vem de usuários, concorrentes, mercado, analytics, stakeholders, dados internos?
4. **Domínio de Product Design**: Descoberta, Produto, Experiência, Negócio ou Tecnologia?

### Regra de Prioridade — 3 perguntas antes de classificar

1. Quem ou o que é o foco principal da atividade?
2. Qual decisão ela ajudará a tomar?
3. Qual conhecimento ela pretende produzir?

### O que NÃO deve influenciar

A classificação nunca deve ser baseada em palavras isoladas ou no método, mas no objetivo real.

| Atividade | ❌ Errado | ✅ Correto |
|-----------|-----------|-----------|
| "Pesquisar a cor dos concorrentes" | Pesquisa | **Concorrentes** |
| "Criar pesquisa sobre horário de retirada" | Pesquisa | **Personas** |
| "Fazer benchmark de soluções de pagamento" | Produto | **Benchmark** |
| "Definir KPIs de retenção" | Métricas | **KPIs** |
| "Mapear jornada no checkout" | UX | **Jornada do Usuário** |

---

## Taxonomia v2

### Descoberta
Conhecimento sobre o mundo externo: usuários, concorrentes, mercado.

| Categoria | Exemplos de conteúdo |
|-----------|----------------------|
| Personas | Perfis de usuário, segmentos, arquétipos, jobs-to-be-done, comportamentos, necessidades |
| Concorrentes | Análise competitiva, lista de players, o que a concorrência faz ou não faz |
| Mercado | Tendências, TAM/SAM/SOM, oportunidades, contexto setorial |
| Benchmark | Comparação de soluções, referências do setor, boas práticas de outros produtos |
| Pesquisa Qualitativa | Entrevistas, observação, shadowing, grupos focais, pesquisa exploratória |
| Pesquisa Quantitativa | Surveys, questionários, analytics comportamental, dados de uso |

### Produto
Definição e planejamento do que será construído.

| Categoria | Exemplos de conteúdo |
|-----------|----------------------|
| Funcionalidades | Features específicas, especificações, o que o sistema faz |
| MVP | Escopo mínimo viável, corte de escopo, o que vai na primeira versão |
| Roadmap | Planejamento de longo prazo, priorização, cronograma, releases |
| Requisitos | Requisitos funcionais e não funcionais, restrições técnicas e de negócio |
| Backlog | Lista de itens de trabalho futuros, organização de demandas, grooming |

### Experiência
Design da interface e da jornada do usuário.

| Categoria | Exemplos de conteúdo |
|-----------|----------------------|
| Jornada do Usuário | Mapeamento de jornada, service blueprint, touchpoints, momentos de verdade |
| UX | Usabilidade, arquitetura da informação, fluxos de navegação, wireframes |
| UI | Layouts visuais, componentes de tela, protótipos de alta fidelidade |
| Design System | Tokens, componentes reutilizáveis, guia de estilo, biblioteca de UI |
| Acessibilidade | Inclusão digital, WCAG, contraste, leitores de tela |

### Negócio
Estratégia, posicionamento e resultados mensuráveis.

| Categoria | Exemplos de conteúdo |
|-----------|----------------------|
| Estratégia | Visão de produto, proposta de valor, modelo de negócio, OKRs |
| KPIs | Indicadores de sucesso, métricas de produto, metas mensuráveis |
| Posicionamento | Diferenciação competitiva, mensagem de marca, proposta única de valor |

### Tecnologia
Implementação e arquitetura técnica.

| Categoria | Exemplos de conteúdo |
|-----------|----------------------|
| APIs | Integrações com serviços externos, contratos de API, endpoints |
| IA | Machine learning, LLMs, automação inteligente, modelos preditivos, chatbots |
| Arquitetura | Estrutura técnica, stack, infraestrutura, banco de dados, escalabilidade |
| Integrações | Conexões entre sistemas, webhooks, sincronizações, plataformas terceiras |

### Outros domínios válidos
Branding, Marketing, Operação, Processos, Jurídico, Dados — usar quando nenhum grupo acima se encaixa. Novas categorias podem ser criadas se necessário.

---

## Resultado no Obsidian

A classificação gera automaticamente duas visões no vault:

### Visão 1 — Assuntos (categoria principal)
```
Projetos/{Projeto}/Assuntos/{CategoríaPrincipal}.md
```
Lista todas as atividades com aquela categoria como principal.

### Visão 2 — Temas (categorias secundárias)
```
Projetos/{Projeto}/Temas/{TemaSecundario}.md
```
Lista todas as atividades que tocam aquele tema, independente do assunto principal.

### Como explorar no grafo
- Clique em `Assuntos/Concorrentes` → grafo local mostra todas as atividades sobre concorrentes
- Clique em `Temas/Benchmark` → grafo local mostra todas as atividades com benchmark, de qualquer assunto
- As duas visões são independentes — categorias principais e secundárias não se misturam nos hubs

---

## Referências de Implementação

| Arquivo | Símbolo | Descrição |
|---------|---------|-----------|
| `src/lib/actions/atividade.ts` | `TAXONOMY_ALIASES` | Mapa de normalização v1→v2 |
| `src/lib/actions/atividade.ts` | `TAXONOMY_SYSTEM_PROMPT` | Prompt fixo com taxonomia completa (cached) |
| `src/lib/actions/atividade.ts` | `classificarTaxonomia()` | Chama a IA e retorna `{ principal, secundarias }` |
| `src/lib/actions/atividade.ts` | `atualizarStatusAtividade()` | Dispara a classificação ao entrar em "finalizado" |
| `src/lib/actions/obsidian.ts` | `sincronizarProjetoObsidian()` | Gera hubs `Assuntos/` e `Temas/` |
| `src/lib/actions/obsidian.ts` | `buildAtividadeContent()` | Adiciona links para hubs na nota da atividade |
| `prisma/schema.prisma` | `Atividade.assunto` / `Atividade.tags` | Persistência da taxonomia no banco |

---

## Pontos-Chave

✅ **Apenas atividades finalizadas** são classificadas e influenciam o conhecimento do projeto  
✅ **Fire-and-forget** para Obsidian — não bloqueia o fluxo principal  
✅ **Normalização v1→v2** evita contaminação de vocabulário  
✅ **Prompt caching** com Claude Haiku reduz latência e custo  
✅ **Duas visões** no Obsidian (Assuntos + Temas) para exploração flexível  
✅ **Limpeza automática** ao sair de "finalizado" (assunto → null, tags → [])
