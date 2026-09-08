# Planejamento — Grafo de Conhecimento da Empresa

> **Escopo decidido:** a visão é interna à plataforma. A integração
> com o Obsidian foi descartada; as menções abaixo são registro do
> desenho inicial. O que se herda dele é a interação — clicar num nó
> e aprofundar sem sair do lugar.

> Rascunho de visão e estratégia. **Já implementado** — o estado real
> está em `Documentacao/grafo-de-conhecimento.md`.
> Data: 05/08/2026

## Visão

Uma nova página por empresa (ex.: `/mapa.html`) que funciona como a "visão viva" da empresa:

- Um **grafo interativo estilo Obsidian** no topo, mostrando as conexões entre atividades e tarefas executadas pelo usuário.
- Um **agente especialista de taxonomia** classifica essas atividades e tarefas automaticamente.
- Abaixo do grafo, **todas as informações da empresa** em HTML navegável.
- Ao **clicar em um nó**, abre um resumo com os dados correspondentes.

Diferente do kanban (operacional), essa página é **exploratória**.

## Arquitetura em três camadas

### 1. Agente de taxonomia
- Roda em background sobre atividades e tarefas concluídas.
- Classifica por tema, área e tipo de entrega.
- Gera um JSON que é o contrato entre as camadas — o grafo só consome, nunca calcula taxonomia:

```json
{
  "nodes": [{ "id": "", "tipo": "", "titulo": "", "resumo": "" }],
  "edges": [{ "de": "", "para": "", "relacao": "" }]
}
```

### 2. Grafo estilo Obsidian
- Canvas puro, sem biblioteca externa, dentro do padrão da plataforma.
- Simulação de força (repulsão entre nós + molas nas arestas).
- Zoom/pan, arrastar nós, hover esmaecendo não-vizinhos, busca que realça nós.
- Cores por tipo de nó usando os tokens do design system
  (`--fill-primary` idéias, `--fill-accent` tarefas, `--fill-success` finalizadas…),
  o que gera a legenda de graça.

### 3. Painel de resumo (clique no nó)
- Painel lateral direito reaproveitando o padrão visual do assistente de IA.
- Mantém o grafo visível enquanto o usuário lê.

## Cuidados antecipados

- **Escala**: grafos de força ficam ilegíveis acima de ~150 nós.
  Solução: o agente agrupa tarefas sob a atividade-mãe e expande só ao clicar
  (drill-down, como o filtro de profundidade do Obsidian).
- **Acessibilidade**: canvas é invisível para teclado e leitor de tela.
  Solução: a página abaixo do grafo apresenta a mesma informação em HTML navegável —
  o grafo é camada de exploração opcional, não a única porta de entrada.

## Grau de complexidade

| Peça | Complexidade | Estimativa |
|---|---|---|
| Grafo visual (física, zoom, hover, clique) | Baixa–média | 1–2 semanas; protótipo estático em algumas sessões |
| Painel de resumo + página da empresa | Baixa | Reaproveita padrões existentes |
| Agente de taxonomia | **Alta** | 70–80% do esforço total do projeto |

O agente não é uma feature, é um **subsistema**: exige backend com dados reais,
pipeline de classificação (LLM ou regras), revisão humana dos erros e evolução
da taxonomia no tempo. Hoje a plataforma é estática, sem backend.

## Por que não usar o Obsidian

- Ferramenta **pessoal** de notas locais: não é embutível num produto web,
  não é multiusuário, e o usuário da plataforma nunca teria acesso.
- Só faria sentido para uso **interno** do time (mapear conhecimento manualmente).
- O que existe pronto no mercado é o grafo em si (D3, Cytoscape.js, force-graph) —
  o que não existe pronto é a taxonomia automática do domínio da plataforma.

## Recomendação — duas apostas separadas

1. **Aposta barata (agora)**: prototipar o grafo aqui na plataforma com dados
   fictícios e validar se os usuários acham a visualização útil.
2. **Aposta cara (depois)**: só iniciar o agente de taxonomia quando o protótipo
   provar que as pessoas realmente exploram a empresa desse jeito.
   Se ninguém usar o grafo com dados de mentira, economizou-se meses.

**Alternativa intermediária**: taxonomia **manual** primeiro — o usuário etiqueta
as atividades ao criá-las. Elimina o agente do escopo inicial e o grafo já
funciona com dados reais. O agente entra depois, automatizando o que o usuário
já fazia.

## Caminho incremental

1. Grafo com dados fictícios (validar visual e interações).
2. Painel de resumo ao clicar no nó.
3. Página da empresa com a informação em HTML navegável.
4. Taxonomia manual (etiquetas na criação da atividade).
5. Agente de taxonomia automatizando a classificação.
