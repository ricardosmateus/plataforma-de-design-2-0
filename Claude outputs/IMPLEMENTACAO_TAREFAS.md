# Implementação: API de Tarefas + Validação Inteligente

**Status:** ✅ Concluído — Pronto para testar

**Data:** 2026-09-07  
**Arquivos alterados:** 4 (schema.prisma, atividades.ts, servidor.ts, atividade.js)

---

## ✅ O Que Foi Implementado

### 1. **Modelo de Dados — Tarefa**

**Arquivo:** `api/prisma/schema.prisma`

```prisma
enum StatusTarefa {
  pendente
  concluida
}

model Tarefa {
  id            uuid pk
  ideiaId       uuid fk (ideias.id, cascade)
  titulo        string (max 60)
  descricao     string (max 280)
  status        StatusTarefa (default: pendente)
  ordem         int (default: 0)
  criadoEm      timestamp (default: now())
  atualizadoEm  timestamp (auto-updated)
}
```

**Migração:** `api/prisma/migrations/20260907000000_tarefas/migration.sql`
- Criada enum `StatusTarefa`
- Tabela `tarefas` com index em (ideia_id, ordem)

### 2. **4 Rotas API — Contrato Definido**

**Arquivo:** `api/src/rotas/atividades.ts`

#### GET `/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas`
- **Regra:** ATV-ACESSO-002 — Encontra ou cria tarefa-semente
- Se ideia ainda não tem tarefas, cria uma copiando título/descrição da ideia
- Retorna: `{ tarefas: [...] }`

#### POST `/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas`
- **Regra:** ATV-TAR-CRIA-001 a 004
- **Corpo:** `{ titulo, descricao, tipo?, ignorar_incompatibilidade? }`
- Cria tarefa no **fim** da lista, com `status: "pendente"`
- **Retorno 201:** `{ tarefa: {...} }`
- **Retorno 202:** Se descrição parece criativa mas `ignorar_incompatibilidade` é false:
  ```json
  {
    "ok": false,
    "aviso": "Descrição detectada como criativa/reflexiva",
    "tipo_detectado": "criativo",
    "mensagem": "A descrição parece pedir criatividade...\n\n① Manter...\n② Reformular...\n③ Criar como entregável...",
    "recomendacoes": [...]
  }
  ```

#### PATCH `/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/ordem`
- **Regra:** ATV-TAR-ORDEM-001 a 005
- **Corpo:** `{ ordem: number }`
- Reordena tarefas (renumeração automática do meio para evitar gaps)
- Se ordem não mudou, retorna sem fazer nada
- Retorna: `{ tarefas: [...] }` (lista completa reordenada)

#### PATCH `/empresas/:empresaId/projetos/:projetoId/ideias/:ideiaId/tarefas/:tarefaId/status`
- **Regra:** ATV-TAR-CONCLUIR-001 a 004
- **Corpo:** `{ status: "pendente" | "concluida" }`
- Muda **só** o status; não mexe em nada mais (ATV-TAR-CONCLUIR-001)
- Permite reabrir (ATV-TAR-CONCLUIR-002)
- Retorna: `{ tarefa: {...} }`

**Autenticação:** Cookie de sessão  
**Isolamento:** Empresa → Projeto → Idéia → Tarefa (4 elos validados)

### 3. **Validação Inteligente de Descrição — Opção 2**

**Arquivo:** `api/src/rotas/atividades.ts` — função `analisarDescricao()`

Padrões detectados:

**Verificável** (pesquisa-friendly):
- Quantos, Qual, Onde, Quando
- Percentual, Preço, R$, Números
- Pesquisar, Buscar, Dados, Fonte

**Criativo** (entregável-friendly):
- Criar, Design, Escrever, Propor
- Slogan, Roteiro, Wireframe, Prototipo
- Mockup, Brainstorm

**Comportamento:**
1. Se descrição é criativa E `ignorar_incompatibilidade` é false:
   - Retorna HTTP **202** (Accepted but needs confirmation)
   - Com mensagem explicativa e 3 opções
2. Se `ignorar_incompatibilidade` é true:
   - Ignora o aviso e cria normalmente

**Exemplo:**
- Usuário tenta criar: "Criar um slogan para a marca ihouseLog"
- Sistema detecta: criativo
- Sistema retorna 202 com aviso
- Usuário pode:
  - ① Clicar "Confirmar de qualquer forma" → reenviar com `ignorar_incompatibilidade: true`
  - ② Editar descrição: "Pesquisar 5 slogans similares e analisar estrutura"
  - ③ Mudar para outro tipo de tarefa

### 4. **Frontend Atualizado**

**Arquivo:** `js/atividade.js`

Método `window.AtividadeAcoes.criar()` agora:
- Aceita parâmetro `ignorarIncompatibilidade` (4º parâmetro)
- Passa `ignorar_incompatibilidade` no corpo da requisição
- Trata HTTP 202 chamando `window.mostrarAvisoIncompatibilidade()` (callback)
- Permite retry com flag de override

### 5. **Rotas Registradas no Servidor**

**Arquivo:** `api/src/servidor.ts`

```typescript
import { rotasAtividades } from './rotas/atividades.js';
// ... depois em construirApp():
await app.register(rotasAtividades);
```

---

## 🔧 Próximos Passos para Usar

### 1. **Aplicar Migração do Banco**

```bash
cd api
npm run migrar:dev
```

Isto vai:
- Criar enum `StatusTarefa` no PostgreSQL
- Criar tabela `tarefas` com estrutura completa
- Criar índice em (ideia_id, ordem)

### 2. **Iniciar o Servidor**

```bash
npm run dev
```

### 3. **Atualizar atividade.html**

Onde existe o formulário de criar tarefa, ajuste:

**Antes:**
```javascript
// Algum código que chamava:
// AtividadeAcoes.criar(titulo, descricao);
```

**Depois:**
```javascript
function confirmarCriacao(titulo, descricao) {
  AtividadeAcoes.criar(titulo, descricao, 'pesquisa', false)
    .catch(function(e) {
      if (e.status === 202) {
        // Já tratado no atividade.js, que vai chamar:
        // window.mostrarAvisoIncompatibilidade(msg, funcaoDeConfirmacao)
      }
    });
}

// Definir callback para avisos:
window.mostrarAvisoIncompatibilidade = function(mensagem, confirmar) {
  // Mostrar modal com:
  // - mensagem (texto explicativo)
  // - Botão "Confirmar de qualquer forma" → confirmar()
  // - Botão "Reformular" → fechar modal, deixar campo ativo
  // - Botão "Cancelar"
};
```

### 4. **Testar Fluxo**

1. Abrir atividade.html com uma idéia
2. Clicar "Criar tarefa"
3. Preencher: "Criar um slogan para a marca"
4. Clicar "Salvar" ou "Adicionar"
   - Sistema retorna 202 com aviso
   - Modal aparece com as 3 opções
5. Clicar "Confirmar de qualquer forma"
   - Sistema cria com `ignorar_incompatibilidade: true`
   - Tarefa aparece na lista

---

## 📋 Checklist de Implementação

- [x] Schema Tarefa adicionado a schema.prisma
- [x] StatusTarefa enum criado
- [x] Migração SQL criada
- [x] 4 rotas implementadas em atividades.ts
- [x] Validação de descrição implementada (analisarDescricao)
- [x] HTTP 202 com aviso quando incompatível
- [x] Override com `ignorar_incompatibilidade: true`
- [x] Rotas registradas em servidor.ts
- [x] Frontend atividade.js atualizado para chamar API
- [x] Tratamento de 202 no frontend
- [ ] atividade.html atualizado com modal de aviso ← **Falta fazer**

---

## 📍 Detalhes Técnicos

### Isolamento (Segurança)

Todas as rotas validam a corrente completa:

```
1. Sessão viva? → 401
2. Usuário não suspenso? → 403
3. Parâmetros bem-formados? → 404
4. Vínculo com empresa ativo? → 404
5. Projeto pertence à empresa? → 404
6. Idéia pertence ao projeto? → 404
7. Tarefa (se houver) pertence à idéia? → 404
```

Sem nenhuma dessas validações passando, todo erro é 404 com mensagem genérica — impossível diferenciar "não existe" de "não é seu".

### Permissões

Criar/reordenar/mudar status exigem `podeEscrever()`:
- proprietario ✅
- membro ✅
- especialista ✅

Excluir tarefa (futuro):
- proprietario ✅
- membro ✅
- especialista ❌

### Reordenação

Quando uma tarefa muda de posição:

```
Antes: [0, 1, 2, 3, 4]
Mover tarefa[3] para posição 1:
Depois: [0, 3, 1, 2, 4]  ← ordem renumerada, sem gaps
```

A renumeração é automática e contínua.

### HTTP 202 — "Accepted but needs confirmation"

Padrão RFC 7231. Significa:
- Requisição **foi aceita** e é válida
- Mas há um **aviso** que a pessoa precisa confirmar
- Retry com `ignorar_incompatibilidade: true` pula o aviso

---

## 🎯 Resultado Final

Quando pronto:

1. **Tarefas persistem** no banco (resolvido: "quando navego e volto, não salvava")
2. **Validação inteligente** guia o usuário a descrições adequadas
3. **3 opções de resposta:** confirmar, reformular, ou descartar
4. **Sem bloqueio** — usuário pode ignorar o aviso se quiser

---

## 📞 Dúvidas Frequentes

**P: E se o usuário quiser editar/duplicar/excluir tarefa?**  
R: Ainda não está implementado (pendências P9/P10 em atividade-lista.md §5). Você define as regras e implementamos as rotas.

**P: Posso remover a validação?**  
R: Sim, no POST remova o bloco `if (!dados.data.ignorar_incompatibilidade && analise.tipo === 'criativo')`.

**P: A análise está muito sensível?**  
R: Ajuste os `indicadores*` em `analisarDescricao()`. Adicione/remova padrões conforme o uso.

**P: Funciona offline?**  
R: Não, é uma API. Sem conexão com o servidor, nada salva. (Por design — tudo fica no banco.)

