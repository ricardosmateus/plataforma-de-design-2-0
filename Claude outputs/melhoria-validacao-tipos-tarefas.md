# Melhoria — Validação de Tipos de Tarefas em Board.html

**Status:** Proposta de melhoria  
**Origem:** Erro relatado pelo usuário ao tentar criar tarefa "Criar um slogan para a marca ihouseLog"  
**Data:** 2026-09-07  

---

## O Problema

Quando um usuário cria uma tarefa, a descrição é **classificada internamente** em dois níveis de tipo:
- **Verificável** (com número, data, nome, fonte)
- **Conhecimento** (requer raciocínio, criatividade)

Conforme documentado em `Skills/orquestrador-atividades.skill` (linhas 191-202):

> Uma descrição reflexiva salva como tarefa de `pesquisa` — "levantar informação sobre a suposição mais crítica" — é lida como `conhecimento` e recusada.

**Situação atual:**
- ❌ Erro é mostrado DEPOIS que o usuário digita tudo
- ❌ Mensagem é técnica: "Esta descrição pede raciocínio, não um fato para verificar"
- ❌ Nenhuma orientação sobre qual tipo usar
- ❌ Nenhum exemplo de descrição válida

**Impacto:**
- Usuário gasta tempo criando uma tarefa inválida
- Frustração com mensagem incompreensível
- Sem contexto para corrigir

---

## Solução Proposta

### 1. Validação Pro-ativa (com Sugestão)

**Quando:** Conforme o usuário digita a descrição  
**O que fazer:** Analisar em tempo real e mostrar:

```
✅ Campo "Descrição"
   └─ Você digitou: "Criar um slogan..."
      
   ⚠️ Tipo detectado: Criativo/Reflexivo
   💡 Isso combina melhor com: "Entregável" ou "Dinâmica"
   
   Se for pesquisa, tente: "Qual é o público-alvo da ihouseLog? 
                            Pesquisar 5 slogans similares e analisar estrutura"
```

### 2. Exemplos Claros no Modal

No modal "Nova tarefa", junto de cada tipo:

```markdown
**Pesquisa** (perguntas verificáveis)
├─ ✅ "Quantas pessoas em SP usam gestão de casas?"
├─ ✅ "Quais competidores cobram por esse serviço?"
└─ ❌ "Como melhorar a experiência do usuário?"

**Entregável** (trabalhos criativos)
├─ ✅ "Criar wireframe do fluxo de login"
├─ ✅ "Escrever 3 slogans alternativos"
└─ ❌ "Pesquisar dados de mercado"

**Matriz CSD** (estruturar conhecimento)
├─ ✅ "Organizar o que sabemos vs. supomos sobre o público"
└─ ❌ "Fazer pesquisa de campo"

**Dinâmica** (atividades do grupo)
├─ ✅ "Workshop de brainstorm com equipe"
├─ ✅ "Sesão de prototipagem rápida"
└─ ❌ "Gerar um documento sozinho"
```

### 3. Erro com Correção (Não Apenas Rejeição)

Se a descrição for incompatível, em vez de:
```
❌ Esta descrição pede raciocínio, não um fato para verificar 
   em fonte externa — e responder de memória, sem fonte, é 
   justamente o que não fazemos. Reescreva a tarefa como uma 
   pergunta verificável (com número, data, nome ou fonte) e a 
   busca executa.
```

Mostrar:
```
⚠️ Tipo de tarefa incompatível

Você selecionou: Pesquisa
Descrição detectada como: Criatividade / Raciocínio

Opções:
① Mudar tipo para "Entregável" (recomendado para tarefas criativas)
② Reformular a descrição como pergunta com fonte:
   "Pesquisar slogans bem-sucedidos em empresas similares 
    e analisar o que têm em comum"
③ Manter do jeito que está (em risco de rejeição depois)
```

---

## Implementação

### Frontend (board.html / js/board.js)

**Novo módulo: `js/validador-tarefas.js`**

```javascript
/**
 * Classifica e valida descrição de tarefa
 * Retorna: { tipo, recomendacoes, compativel }
 */
function analisarDescricao(descricao, tipoSelecionado) {
  const indicadores = {
    verificavel: [
      /quantos?\b/i,      // Quantos/Quanto
      /qual\w*s?\b/i,     // Qual/Quais (concreto)
      /onde?\b/i,         // Onde
      /quando?\b/i,       // Quando
      /porcent/i,         // Percentual
      /prec/i,            // Preço
      /R\$\b/,            // Valor
      /\d+/,              // Números
    ],
    criativo: [
      /criar\b/i,         // Criar
      /design\b/i,        // Design
      /escrever\b/i,      // Escrever
      /propor\b/i,        // Propor
      /slogan\b/i,        // Slogan
      /roteiro\b/i,       // Roteiro
    ],
  };
  
  let scoreVerificavel = 0;
  let scoreCriativo = 0;
  
  for (const padrao of indicadores.verificavel) {
    if (padrao.test(descricao)) scoreVerificavel++;
  }
  
  for (const padrao of indicadores.criativo) {
    if (padrao.test(descricao)) scoreCriativo++;
  }
  
  const tipo = scoreCriativo > scoreVerificavel ? 'criativo' : 'verificavel';
  
  return {
    tipo,
    scoreVerificavel,
    scoreCriativo,
    compativel: compatibilidadeComTipo(tipo, tipoSelecionado),
    recomendacoes: gerarRecomendacoes(tipo, tipoSelecionado),
  };
}

/**
 * Matriz de compatibilidade tipo_descrição × tipo_tarefa
 */
function compatibilidadeComTipo(tipoDesc, tipoTarefa) {
  const matriz = {
    verificavel: ['pesquisa'],
    criativo: ['entregavel', 'dinamica'],
  };
  return matriz[tipoDesc]?.includes(tipoTarefa) ?? false;
}
```

### Backend (Validação Forte)

**Em `api/src/rotas/atividades.ts` ou rota que criar tarefas:**

```typescript
async function criarTarefa(req: FastifyRequest, res: FastifyResponse) {
  const corpo = validarCorpoTarefa(req.body);
  
  if (!corpo.success) {
    return res.code(400).send({
      ok: false,
      erros: corpo.erros,  // Validação de format
      dica: "Use tipos conforme seus exemplos em criar_tarefa"
    });
  }
  
  const { titulo, descricao, tipo } = corpo.data;
  
  // Nova validação: descrição × tipo
  const analise = analisarDescricao(descricao, tipo);
  if (!analise.compativel) {
    return res.code(422).send({
      ok: false,
      codigo: 'tipo_incompativel',
      mensagem: `Descrição detectada como ${analise.tipoDesc}, ` +
                `mas tipo selecionado foi "${tipo}"`,
      recomendacoes: analise.recomendacoes,
      permitir_mesmo_assim: true,  // Checkbox no frontend
    });
  }
  
  // Resto da lógica de criação...
}
```

### Rules de Negócio (Documentação)

**Atualizar `Regras_de_negocio/modulos/atividades/atividade-lista.md`:**

```markdown
## ATV-TAR-TIPO-001

Cada tipo de tarefa tem requisitos mínimos na descrição:

| Tipo       | Descrição esperada              | Exemplos válidos |
|------------|--------------------------------|------------------|
| Pesquisa   | Pergunta verificável com fonte | "Quantas...?" |
| Entregável | Trabalho criativo concreto     | "Criar...", "Escrever..." |
| CSD        | Instrução estruturada          | "Organizar em..." |
| Dinâmica   | Atividade grupal               | "Workshop...", "Sessão..." |

Incompatibilidades tipo/descrição são alertadas no servidor, 
mas permitem override manual (usuário escolhe "salvar mesmo assim").
```

---

## Benefícios

| Antes | Depois |
|-------|--------|
| Rejeição críptica após digitação completa | Sugestão em tempo real enquanto digita |
| Sem exemplos de formato correto | Exemplos claros em 4 categorias |
| Mensagem técnica | Linguagem natural + orientação prática |
| Sem volta: precisa reescrever tudo | 1 clique para mudar o tipo sugerido |

---

## Priorização

**Curto prazo (MVP):**
- [ ] Mostrar exemplos no modal de criação de tarefa
- [ ] Mensagem de erro com recomendação (tipo sugerido)
- [ ] Override manual (usuário pode ignorar aviso)

**Médio prazo:**
- [ ] Validação em tempo real conforme digita
- [ ] Sugestão automática de tipo baseado em descrição
- [ ] Documentação de regras em `atividade-lista.md`

**Longo prazo:**
- [ ] IA aprende com erros passados
- [ ] Categorização de tarefas por histórico do projeto
- [ ] Integração com o orquestrador para rotear ao especialista certo

---

## Referências

- `Skills/orquestrador-atividades.skill` — linhas 191-202
- `Regras_de_negocio/modulos/atividades/atividade-lista.md` (a implementar)
- Padrão de validação já usado em `ideias.ts` (min/max length)

