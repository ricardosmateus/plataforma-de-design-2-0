# Orquestrador de Atividades — Guia de Teste

## 🎯 O que foi conectado

Dois gatilhos da Plataforma agora disparam o **Orquestrador de Atividades**:

| Gatilho | Localização | Ação |
|---------|-------------|------|
| **Gerar com ajuda da IA** | Modal "Nova tarefa" em `atividade.html` | Recolhe contexto + solicita ao Orquestrador |
| **Pesquisar** | Botão em `board.html` | Recolhe contexto + solicita ao Orquestrador |

## 📁 Arquivos modificados

```
js/orquestrador-gateway.js        ← NOVO (camada de integração)
atividade.html                     ← adicionado <script src="js/orquestrador-gateway.js">
board.html                         ← adicionado <script src="js/orquestrador-gateway.js">
Skills/orquestrador-atividades.skill  ← criado (documento de regras)
Skills/product-designer.skill      ← criado (primeira especialista)
```

## 🧪 Como testar

### Teste 1: Gatilho "Gerar com ajuda da IA" (atividade.html)

1. Abra uma atividade em `atividade.html`
2. Clique no botão **"+ Nova tarefa"** (ou similar)
3. Descreva o que precisa: ex: *"Analise a experiência atual e proponha uma solução para o fluxo de cadastro"*
4. Clique em **"Gerar com ajuda da IA"**

**Esperado:**
- O modal fecha
- Mensagem "Processando pedido..." aparece
- Após ~500ms, uma modal/card mostra o resultado (simulado, por enquanto)
- Console mostra:
  ```
  📋 Orquestrador acionado {
    gatilho: 'gerar_tarefa',
    empresa: '...',
    ideia: '...',
    atividade: '...',
    solicitacao: '...',
    tarefas_anteriores: 0
  }
  ```

### Teste 2: Gatilho "Pesquisar" (board.html)

1. Abra uma atividade em `board.html`
2. Clique no botão **"Pesquisar"**

**Esperado:**
- Mensagem "Iniciando pesquisa..." aparece
- Após ~500ms, resultado simulado é exibido
- Console mostra:
  ```
  📋 Orquestrador acionado {
    gatilho: 'pesquisar',
    ...
  }
  ```

## 🔄 Fluxo de Funcionamento (Diagrama)

```
┌─ Usuário clica "Gerar com ajuda da IA"
│
├─→ orquestrador-gateway.js recolhe contexto
│   ├─ empresa
│   ├─ ideia
│   ├─ atividade
│   └─ tarefas anteriores (com resultados)
│
├─→ chamarOrquestrador(solicitacao, gatilho)
│   └─ [Atualmente] Retorna resultado simulado
│       [Futuramente] Chamará a API real: /api/orquestrador
│
├─→ Orquestrador processa:
│   ├─ Identifica tipo de necessidade
│   └─ Escolhe especialista (Product Designer, UX Research, Data Analyst, etc.)
│
├─→ Especialista executa:
│   └─ Retorna resultado estruturado (Diagnóstico → Proposta → Sugestões)
│
└─→ exibirResultado(resultado)
    ├─ Mostra em modal/card
    └─ Grava como contexto da atividade
```

## 📊 Estado Atual

### ✅ Pronto

- [x] Skill: Orquestrador de Atividades (documentação completa)
- [x] Skill: Product Designer (primeira especialista, segue contrato do Orquestrador)
- [x] Gateway: camada de integração (recolhe contexto + chama Orquestrador)
- [x] Gatilho 1: "Gerar com ajuda da IA" conectado ao gateway
- [x] Gatilho 2: "Pesquisar" conectado ao gateway
- [x] Logging no console para debug

### ⏳ Próximas Etapas

- [ ] Implementar backend real de Orquestrador (API `/api/orquestrador`)
- [ ] Criar Skills de especialistas adicionais:
  - [ ] UX Research
  - [ ] Data Analyst
  - [ ] UX Writer
- [ ] Conectar resultado à tarefa criada (gravar como resultado da tarefa)
- [ ] UI para exibir resultado (modal ou card dentro de atividade.html)
- [ ] Tratamento completo de erros (mensagens de contexto incompleto, etc.)

## 🐛 Debug

Abra o console do navegador (F12 → Aba "Console") para ver:

1. **Inicialização:**
   ```
   ✅ Orquestrador Gateway inicializado. Gatilhos 1 e 2 conectados.
   ```

2. **Quando um gatilho é acionado:**
   ```
   📋 Orquestrador acionado { gatilho: '...', empresa: '...', ... }
   ```

3. **Resultado recebido:**
   ```
   ✅ Resultado do especialista: { especialista: 'Product Designer', ... }
   ```

## 🔗 Contrato de Especialista

Toda Skill de especialista DEVE declarar (no seu arquivo `.skill`):

1. **Que tipo de necessidade atende**  
   Ex: "diagnóstico de UX + proposta de solução"

2. **O que precisa receber**  
   Mínimo: empresa, ideia, objetivo, problema, hipóteses, atividade, tarefas anteriores, solicitação atual

3. **Formato de resultado que devolve**  
   Estrutura clara, reutilizável como contexto para próxima tarefa

4. **Se pode sugerir novas tarefas**  
   Sim/não, e como devolver sugestões (sempre marcadas como "sugestão", nunca como automático)

Veja `Skills/product-designer.skill` como template.

## 📝 Exemplo: Fluxo de Ponta a Ponta

```
Usuário em atividade.html digita:
  "Analise as descobertas da pesquisa e proponha uma solução."

Gateway recolhe contexto:
  empresa: "Acme Inc."
  ideia: "Fluxo simplificado de cadastro"
  atividade: "Validar novo fluxo"
  tarefas_anteriores: [
    {nome: "Pesquisar comportamento dos usuários", resultado: "usuários abandonam na etapa 3"},
    {nome: "Analisar dados de acesso", resultado: "85% dos acessos saem no passo 2"}
  ]

Orquestrador identifica:
  necessidade = "síntese + proposta de solução"
  especialista = Product Designer

Product Designer trabalha:
  diagnóstico: "O problema é o fluxo longo que confunde usuários..."
  proposta: "Simplificar para 3 passos: dados básicos → email → confirmação"
  sugestões: "Validar com testes A/B antes de implementar"

Resultado volta para a tela:
  [Modal mostra análise + proposta]
  [Resultado gravado como contexto da atividade]
```

---

**Versão:** 1.0 | **Data:** 2026-09-05

