# Fase 6 — Marketplace (Planejamento)

## 📋 Escopo Mínimo

### O que é
Uma plataforma que conecta **empresas (clientes)** com **profissionais (contratados)** para executar tarefas de design usando IA.

### Entidades principais
- **`catalogo_servicos`** — "Criar logotipo", "Redesenhar site", etc. Preço fixo em R$.
- **`contratacoes`** — Relaciona: cliente, profissional, serviço, preço acordado, consumo de IA da tarefa, comissão sobre esse consumo.
- **Teto de gasto** — Cliente e profissional combinam um limite máximo de gasto com IA (mitigação de risco).

### Fluxo típico
1. Empresa navega catálogo de serviços
2. Empresa clica "Solicitar: Criar logotipo (R$ 50,00)"
3. Plataforma mostra lista de profissionais disponíveis (algo como Uber)
4. Empresa escolhe um profissional e confirma
5. Contratação é criada (`status='aberta'`)
6. Profissional recebe notificação
7. Profissional aceita e começa a trabalhar
8. Profissional consome IA (consumo é medido e adicionado à contratação)
9. Quando saldo de gasto chega perto do teto, sistema alerta
10. Profissional entrega trabalho → Empresa aprova ou pede revisão
11. Aprovado → Pagamento processado (cliente paga, profissional recebe, plataforma fica com comissão)

---

## ⚠️ Decisões Jurídicas/Contábeis Bloqueando (Pendente)

| Decisão | Impacto | Status |
|---------|--------|--------|
| **Qual é a estrutura legal?** | Determina se há intermediação, registro em órgãos, obrigações de compliance | ❌ **Aguardando resposta do advogado** |
| **Quem fica com os R$ 50?** | Se profissional leva R$ 50 inteiro e plataforma só ganha comissão da IA, modelo é viável? Ou divide-se? | ❌ **Pendente definição negócio** |
| **Repasse a terceiros é regulado?** | Receber do cliente e repassar ao profissional = intermediação. Implicações fiscais (nota fiscal, imposto?) | ❌ **Requer consulta a contador** |
| **CPF/CNPJ do profissional** | Precisa validar e registrar dados do profissional para emitir recibo/NF | ❌ **Modelo de dados não especificado** |

---

## 🎯 Plano de Ação (Não bloqueado)

### Fase 6.1 — Análise & Design (2-3 dias)
**Objetivo:** Desenhar a arquitetura sem depender de decisões jurídicas

#### 1.1 Documentação de decisões necessárias
- [ ] Criar matriz de cenários: "Se lucro é 100% comissão da IA" vs "Se lucro é split do R$ 50"
- [ ] Calcular viabilidade financeira de cada cenário (usando dados reais de Fase 0)
- [ ] Listar implicações de cada modelo (fiscais, operacionais, de compliance)

#### 1.2 Modelo de dados (versão 1)
- [ ] Tabelas: `catalogo_servicos`, `profissionais`, `contratacoes`, `contratacao_consumos_ia`
- [ ] Schema Prisma para Fase 6 (sem dados sensíveis ainda — CPF/CNPJ como string)
- [ ] Relações: profissional ↔ contratação ↔ cliente ↔ serviço

#### 1.3 UI Wireframes (5 telas mínimas)
- [ ] Catálogo de serviços (list view → card view)
- [ ] Detalhe do serviço + seleção de profissional (tipo Uber)
- [ ] Dashboard do profissional (minhas tarefas, consumo de IA, ganhos)
- [ ] Dashboard do cliente (minhas contratações, aprovações)
- [ ] Painel administrativo (KPIs: total recebido, total pago, comissão, profissionais ativos)

---

### Fase 6.2 — Backend (Sem pagamento a terceiros)
**Objetivo:** Toda a lógica de negócio pronta, faltando apenas o repasse de dinheiro

- [ ] `POST /catalogo/servicos` — criar serviço com preço fixo
- [ ] `GET /catalogo/servicos` — listar com filtros
- [ ] `POST /contratacoes` — cliente contrata um profissional
- [ ] `PATCH /contratacoes/:id` — profissional aceita/rejeita/entrega
- [ ] `POST /contratacoes/:id/consumos` — registrar consumo de IA da tarefa
- [ ] `GET /contratacoes/:id` — detalhe com histórico de consumos e saldo restante
- [ ] `POST /contratacoes/:id/aprovar` — cliente aprova entrega

**Nota:** Pagamento a terceiros (repasse ao profissional) fica como `// TODO: resolver decisão jurídica` — backend pronto, lógica comentada.

---

### Fase 6.3 — Frontend
- [ ] Catálogo interativo (busca, filtro por preço)
- [ ] Abrir contratação (flow tipo Uber: listar profissionais → escolher → confirmar)
- [ ] Dashboard cliente (suas tarefas, aprovação, histórico)
- [ ] Dashboard profissional (tarefas disponíveis, aceitas, em progresso, entregues)

---

### Fase 6.4 — Integração de Pagamento a Terceiros
**Bloqueado por:** Decisão jurídica sobre estrutura legal

Quando liberado, serão necessários:
- Esquema de split de pagamento (Mercado Pago tem isso nativo)
- Validação de CPF/CNPJ do profissional
- Emissão de recibo/nota fiscal automática
- Conciliação com Fisco

---

## 💰 Decisões Financeiras (Proposta)

Baseado em números reais de Fase 0, sugerir modelo:

**Cenário A: Plataforma fica com tudo de IA**
- Cliente paga R$ 50,00 pelo serviço
- Profissional recebe R$ 50,00 (fixo, sem comissão)
- Plataforma lucra 100% com consumo de IA dentro do teto combinado
- Exemplo: IA custa R$ 8,00 → lucro = R$ 8,00

**Cenário B: Comissão % sobre o serviço**
- Cliente paga R$ 50,00
- Profissional recebe R$ 40,00 (20% para plataforma)
- Plataforma ainda ganha com consumo de IA acima
- Exemplo: R$ 50 serviço (profissional leva R$ 40) + R$ 8 IA = lucro plataforma = R$ 18

**Cenário C: Comissão % sobre IA apenas**
- Cliente paga R$ 50,00 (vai 100% pro profissional)
- IA custa R$ 8,00 (plataforma fica com 30% = R$ 2,40)
- Risco: profissional trabalha de graça se não consumir IA

---

## 📊 Roadmap (Dependências)

```
Fase 5 (Reconciliação)
    ↓
[Aguardando Jurídica/Contábil] ←→ Fase 6.1 (Análise & Design) [PARALELO]
    ↓
Fase 6.2 (Backend sem pagamento a terceiros)
    ↓
Fase 6.3 (Frontend)
    ↓
[Jurídica liberada?] → Fase 6.4 (Integração de pagamento a terceiros)
    ↓
Fase 6 COMPLETA
```

---

## 🚀 Próximo Passo

**Recomendação:** Começar com **Fase 6.1** (Análise & Design) em paralelo com o processo jurídico.

Isso permite:
1. Desenhar a melhor experiência de usuário
2. Calcular cenários financeiros com precisão
3. Ter a estrutura de dados pronta quando jurídica der resposta
4. Ganhar velocidade na implementação backend (Fase 6.2)

**Quanto tempo:** 
- Fase 6.1 = 2-3 dias (design + análise financeira)
- Fase 6.2 = 1 semana (backend completo)
- Fase 6.3 = 3-4 dias (frontend)
- Fase 6.4 = 2-3 dias (integração de pagamento)

**Total (sem bloqueios):** ~3 semanas

---

**Status:** Pronto para começar Fase 6.1  
**Bloqueadores conhecidos:** Jurídica/Contábil (paralelo, não bloqueia design)  
**Próxima ação:** Confirmar disponibilidade para análise de cenários financeiros
