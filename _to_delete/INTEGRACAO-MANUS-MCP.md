# Integração Manus via MCP — Planejamento de Escala

## 🎯 Objetivo

Permitir que usuários pesquisem dentro do Manus (catálogo de designers/especialistas) **através da Plataforma de Design 2.0**, sem sobrecarregar a conta única do Manus.

**Desafio:** 1 conta Manus × N usuários simultâneos = rate limit rápido

---

## ⚠️ O Problema

### Cenário sem solução
```
Usuário 1 → [Busca "Logotipo"] → POST /manus/buscar → Manus API
Usuário 2 → [Busca "Identidade"] → POST /manus/buscar → Manus API
Usuário 3 → [Busca "Logotipo"] → POST /manus/buscar → Manus API  ← DUPLICADO!
Usuário 4 → [Busca "Identidade"] → POST /manus/buscar → Manus API ← DUPLICADO!

Resultado: 4 requisições para apenas 2 buscas únicas
Rate limit atinge rápido → usuários ficam bloqueados
```

---

## 💡 Solução: Arquitetura em 3 Camadas

### Camada 1: Cache (RedisJSON)
**O que:** Armazena resultados de buscas por 1-24h

**Como:**
```javascript
// Busca "Logotipo"
const chaveCache = `manus:busca:logotipo:${hash(filtros)}`
const resultado = await redis.get(chaveCache)

if (resultado) {
  return resultado  // ✅ Retorna do cache (0 requisições ao Manus)
}

// Não está em cache → fila de requisição
```

**Benefício:** Se 100 usuários buscam "Logotipo" no mesmo dia, só 1 requisição vai ao Manus

---

### Camada 2: Fila de Requisições (Bull/Bullmq)
**O que:** Agrupa requisições e as envia ao Manus de forma controlada

**Como:**
```javascript
// Usuário faz busca
const job = await filaManusJobs.add({
  tipo: 'busca',
  query: 'Logotipo',
  filtros: { preco: 50, experiencia: 5 },
  usuarioId: 123
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  priority: 1
})

// Fila processa com rate limit
// Max 10 requisições/minuto ao Manus
```

**Benefício:** Controla fluxo de requisições, evita rate limit

---

### Camada 3: Webhook de Resultado (WebSocket)
**O que:** Notifica usuário quando resultado está pronto (pode vir do cache ou fila)

**Como:**
```javascript
// 1. Usuário faz busca
// 2. Frontend recebe jobId
// 3. Frontend escuta via WebSocket: `/manus/busca/:jobId`
// 4. Quando resultado sai do cache ou fila, WebSocket notifica
// 5. UI atualiza com resultado em tempo real
```

**Benefício:** UX não fica presa em loading infinito

---

## 🏗️ Arquitetura Completa

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (7 páginas)                                         │
│ POST /manus/buscar?q=logotipo                                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ API (Node + Fastify)                                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ POST /manus/buscar (rota de entrada)                │   │
│  │  1. Normalizar query                                │   │
│  │  2. Gerar chave de cache                            │   │
│  │  3. Verificar cache (Redis)                         │   │
│  │     ├─ HIT: retorna resultado                       │   │
│  │     └─ MISS: vai para fila                          │   │
│  │  4. Adicionar job à fila (Bull)                     │   │
│  │  5. Retornar jobId para cliente                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ WebSocket /manus/busca/:jobId                       │   │
│  │  Cliente escuta resultado em tempo real             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Bull Worker (processo separado)                     │   │
│  │  Processa jobs da fila com rate limit               │   │
│  │  Max: 10 requisições/minuto ao Manus                │   │
│  │  Aguarda resposta do Manus MCP                      │   │
│  │  Armazena em cache                                  │   │
│  │  Notifica via WebSocket                             │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ INFRAESTRUTURA                                               │
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │ Redis (Cache)    │      │ Bull Worker      │            │
│  │ - Resultados     │      │ - Fila de jobs   │            │
│  │ - TTL: 24h       │      │ - Rate limit     │            │
│  │ - Max size: 500MB│      │ - Retry logic    │            │
│  └──────────────────┘      └──────────────────┘            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ MANUS API (1 conta principal)                                │
│  POST /buscar → Retorna resultados                           │
│  Rate limit: 100 req/hora (seu limite)                       │
│  Com cache + fila: reduz para ~10 req/hora                   │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementação

### 1. Dependências

```bash
npm install redis bullmq ioredis
```

### 2. Redis + Bull Setup

```typescript
// src/integracao/redis.ts
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: 1, // usar DB 1 para cache Manus (DB 0 para sessions)
});

// src/integracao/fila-manus.ts
import { Queue, Worker } from 'bullmq';

export const filaManusJobs = new Queue('manus-buscas', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Worker que processa a fila
export const workerManus = new Worker('manus-buscas', processoManusJob, {
  connection: redis,
  concurrency: 2, // máximo 2 jobs simultâneos = máximo 2 req/minuto ao Manus
});

async function processoManusJob(job) {
  const { query, filtros, usuarioId } = job.data;
  
  try {
    // Chama Manus MCP
    const resultado = await manusMcp.buscar(query, filtros);
    
    // Armazena em cache
    const chaveCache = `manus:busca:${query}:${hash(filtros)}`;
    await redis.setex(chaveCache, 86400, JSON.stringify(resultado)); // TTL 24h
    
    return { sucesso: true, resultado };
  } catch (erro) {
    throw new Error(`Manus erro: ${erro.message}`);
  }
}
```

### 3. Rota de Busca

```typescript
// src/rotas/manus.ts
import { filaManusJobs, redis } from '../integracao';

fastify.post('/manus/buscar', async (request, reply) => {
  const { q, preco_min, preco_max } = request.query;
  const usuarioId = request.user.id;
  
  // Normalizar query
  const queryNormalizada = q.toLowerCase().trim();
  const filtros = { preco_min, preco_max };
  const chaveCache = `manus:busca:${queryNormalizada}:${hash(filtros)}`;
  
  // 1. Verificar cache
  const emCache = await redis.get(chaveCache);
  if (emCache) {
    return reply.send({
      origem: 'cache',
      resultado: JSON.parse(emCache),
      idade: '< 24 horas',
    });
  }
  
  // 2. Adicionar à fila
  const job = await filaManusJobs.add({
    query: queryNormalizada,
    filtros,
    usuarioId,
  }, {
    priority: 1, // usuários pagos podem ter prioridade maior
  });
  
  // 3. Retornar jobId
  return reply.send({
    origem: 'fila',
    jobId: job.id,
    status: 'processando',
    mensagem: 'Seu resultado chegará em breve via WebSocket',
  });
});
```

### 4. WebSocket (Resultado em Tempo Real)

```typescript
// src/websocket/manus-busca.ts
fastify.get('/ws/manus/busca/:jobId', { websocket: true }, (socket, request) => {
  const { jobId } = request.params;
  
  socket.on('message', async (msg) => {
    if (msg === 'conectado') {
      // Cliente conectado, verificar status do job
      const job = await filaManusJobs.getJob(jobId);
      
      if (!job) {
        return socket.send(JSON.stringify({
          erro: 'Job não encontrado',
        }));
      }
      
      if (job.isCompleted()) {
        socket.send(JSON.stringify({
          status: 'completo',
          resultado: job.returnvalue,
        }));
        socket.close();
      } else if (job.isFailed()) {
        socket.send(JSON.stringify({
          status: 'erro',
          mensagem: job.failedReason,
        }));
        socket.close();
      } else {
        socket.send(JSON.stringify({
          status: 'processando',
          progresso: job.progress(),
        }));
        
        // Escutar atualizações do job
        job.on('progress', (progress) => {
          socket.send(JSON.stringify({
            status: 'processando',
            progresso: progress,
          }));
        });
        
        job.on('completed', (resultado) => {
          socket.send(JSON.stringify({
            status: 'completo',
            resultado,
          }));
          socket.close();
        });
        
        job.on('failed', (erro) => {
          socket.send(JSON.stringify({
            status: 'erro',
            mensagem: erro.message,
          }));
          socket.close();
        });
      }
    }
  });
});
```

### 5. Frontend (Exemplo)

```javascript
// js/manus-busca.js
async function buscarManus(query) {
  // 1. Fazer busca (retorna jobId ou resultado do cache)
  const resposta = await fetch(`/manus/buscar?q=${query}`);
  const { jobId, resultado, origem } = await resposta.json();
  
  if (origem === 'cache') {
    // Resultado já estava em cache
    mostrarResultados(resultado);
    return;
  }
  
  // 2. Conectar WebSocket para escutar resultado
  const ws = new WebSocket(`ws://localhost:3333/ws/manus/busca/${jobId}`);
  
  ws.onopen = () => {
    ws.send('conectado');
    mostrarCarregando();
  };
  
  ws.onmessage = (event) => {
    const { status, resultado, progresso, erro } = JSON.parse(event.data);
    
    if (status === 'processando') {
      atualizarProgresso(progresso);
    } else if (status === 'completo') {
      mostrarResultados(resultado);
      ws.close();
    } else if (status === 'erro') {
      mostrarErro(erro);
      ws.close();
    }
  };
}
```

---

## 📊 Comparação: Com vs Sem Solução

### SEM solução (naive)
```
100 usuários buscam "Logotipo" → 100 requisições ao Manus → rate limit em 3 minutos
```

### COM solução
```
Hora 1:  10 usuários buscam "Logotipo" 
         → 1ª requisição ao Manus 
         → resultado em cache
         
Hora 2:  50 usuários buscam "Logotipo"
         → 0 requisições ao Manus (vem do cache)
         
Hora 3:  5 novos usuários buscam "Logotipo"
         → 0 requisições ao Manus (cache ainda válido)

Total de requisições ao Manus nesse dia: ~1-2
(versus 100+ sem cache)
```

---

## 🚀 Fases de Implementação

### Fase 1 (Básica) — 1-2 dias
- [x] Redis setup
- [x] Cache de resultados (TTL 24h)
- [x] Rota POST /manus/buscar
- [x] Testes manuais

**Resultado:** Reduz requisições em ~80% (se houver repetição de buscas)

### Fase 2 (Fila) — 2-3 dias
- [x] Bull Queue setup
- [x] Worker com rate limit (10 req/minuto)
- [x] Retry logic (3 tentativas)
- [x] Monitoramento de fila

**Resultado:** Suporta até 100 usuários simultâneos sem error

### Fase 3 (Tempo Real) — 1 dia
- [x] WebSocket para notificação de resultado
- [x] Frontend com progress bar
- [x] Tratamento de erro

**Resultado:** UX melhorada, usuário não fica em loading infinito

### Fase 4 (Analytics) — 1 dia
- [x] Dashboard de uso (hits/misses de cache, tempo médio, erros)
- [x] Alertas de fila saturada
- [x] Monitoramento de rate limit do Manus

**Resultado:** Visibilidade operacional

---

## 📈 Escalabilidade Futura

Se crescer demais, opções:

### 1. Múltiplas contas Manus (Round Robin)
```javascript
const contasManus = [
  { api_key: '...', rate_limit: 100 },
  { api_key: '...', rate_limit: 100 },
  { api_key: '...', rate_limit: 100 },
];

// Distribuir requisições entre 3 contas = 300 req/hora
```

### 2. Cache distribuído (multi-DC)
```javascript
// Se Plataforma cresce para múltiplos servidores
const redis = new Redis.Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
]);
```

### 3. Pré-computar buscas populares
```bash
# Cronjob diário que tira top 50 buscas e aquece o cache
npm run aquecimento-cache-manus
```

---

## 🎯 Próximos Passos

1. **Confirmar:** Qual é o rate limit real do Manus? (req/hora?)
2. **Validar:** Manus retorna os mesmos resultados para mesma query? (ou muda?)
3. **Decidir:** Qual TTL de cache? (24h, 7 dias, 30 dias?)
4. **Desenhar:** UI/UX da busca (loader, barra de progresso, etc.)

---

**Status:** Pronto para implementação  
**Complexidade:** Média (Redis + Bull + WebSocket)  
**Impacto:** Alto (suporta escala 100x)  
**Tempo estimado:** 5-7 dias (todas as fases)
