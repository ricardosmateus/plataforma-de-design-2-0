# Semana 2 — Pastas Dinâmicas

## 📋 O que mudou

A página `Sobre_a_empresa.html` deixa de usar **dados hardcoded** e passa a consumir a **API em tempo real**.

### Antes (Semana 1 — Protótipo)
```html
<li class="task" data-id="branding">
  <span class="task-name">Branding</span>
  <a class="btn btn--secondary" href="...">Acessar pasta</a>
</li>
<!-- Hardcoded: Branding, Concorrentes, Lorem ipsum... -->
```

### Depois (Semana 2 — Dinâmico)
```javascript
// Chama API
GET /empresas/:id/sobre
// Recebe: { assuntos: [{ categoria: "Branding", quantidade: 5 }, ...] }
// Renderiza HTML dinamicamente
```

---

## 🎯 Arquivos Criados

| Arquivo | Função |
|---------|--------|
| `Sobre_a_empresa_Semana2.html` | Versão dinâmica (use como `Sobre_a_empresa.html`) |
| `js/sobre-empresa-semana2.js` | Carrega API + renderiza pastas |

---

## 🚀 Como usar

### 1. Copie para a pasta raiz (substitui a versão antiga)
```bash
cp Sobre_a_empresa_Semana2.html Sobre_a_empresa.html
```

### 2. Abra a página com query param
```
http://localhost:8000/Sobre_a_empresa.html?empresa=UUID_DA_EMPRESA
```

Ou adicione o `data-empresa-id` no `<html>`:
```html
<html lang="pt-BR" data-empresa-id="uuid-da-empresa">
```

### 3. Verifique que a API está rodando
```bash
cd api
npm run dev
# Deve responder em: GET /empresas/:id/sobre
```

---

## 🎨 Comportamentos

### Empty State
Quando nenhuma ideia foi finalizada:
- ✓ Ícone representativo
- ✓ Mensagem clara: "Nenhuma atividade finalizada"
- ✓ 4-step guide: Criar → Andamento → Finalizar → Aparece
- ✓ Botão "Ir para Projetos"

### Pastas Carregadas
Quando há ideias finalizadas:
- ✓ Lista de categorias dinâmica
- ✓ Contagem de ideias por categoria
- ✓ Drag-and-drop para reordenar (mantém original)
- ✓ Botão "Acessar pasta"

---

## 🔄 Polling vs Webhooks

**Semana 2 (Atual):** Polling a cada 5 segundos
```javascript
setInterval(carregarPastas, 5000);  // a cada 5s
```

**Produção:** Use webhooks
```javascript
// Remover polling
// Escutar eventos via WebSocket ou Server-Sent Events
// Atualizar apenas quando ideia entra/sai de "finalizado"
```

---

## 🧪 Testando

### Teste 1: Empty State
1. Abra a página com empresa sem ideias finalizadas
2. Veja o empty state com 4-step guide
3. Verifique link "Ir para Projetos" funciona

### Teste 2: Pastas Dinâmicas
1. Finalize uma ideia na sua empresa (mude para "finalizado")
2. Volte para Sobre_a_empresa.html
3. Aguarde ~5 segundos (polling)
4. Veja a pasta aparecer com contagem correta

### Teste 3: Reordenação (Drag-and-drop)
1. Reordene as pastas com arraste
2. Recarregue a página
3. Verifique se a ordem foi salva (no localStorage)

---

## 🔍 Debug

Abra o console e execute:
```javascript
// Ver empresaId detectado
debugSemana2.getEmpresaId()

// Carregar pastas manualmente
debugSemana2.carregarPastas()

// Forçar empty state
debugSemana2.mostrarEmptyState()
```

---

## 📝 Próximos Passos (Semana 3+)

- **Semana 3:** Integrar Skill de taxonomia (IA classifica ao finalizar)
- **Semana 4:** Renderizar grafo interativo
- **Semana 5:** Painel lateral com lista de ideias por pasta
- **Semana 6:** Otimizações de escala (150+ nós)
- **Semana 7:** Acessibilidade + HTML fallback
- **Semana 8:** Testes end-to-end + documentação

---

## ✅ Checklist: Semana 2 Completa

- ✅ Arquivo `Sobre_a_empresa_Semana2.html` criado
- ✅ Script `sobre-empresa-semana2.js` implementado
- ✅ Empty state UI pronto
- ✅ Consumindo API GET /empresas/:id/sobre
- ✅ Renderização dinâmica de pastas
- ✅ Drag-and-drop mantido (compatível)
- ✅ Polling cada 5 segundos
- ✅ Contagem de ideias por categoria

