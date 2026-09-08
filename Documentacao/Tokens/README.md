# 🎨 Design Tokens — Documentação e Referência

Bem-vindo à documentação de tokens de design da **Plataforma de Design 2.0**.

## 🗂️ O Que Há Aqui

Este diretório contém toda a configuração e documentação dos tokens de design utilizados na plataforma.

### Arquivos Principais

| Arquivo | Descrição | Uso |
|---------|-----------|-----|
| **`tokens.json`** | Fonte de verdade (DTCG format) | Figma Tokens plugin, sincronização bidirecional |
| **`tokens.yaml`** | Alternativa legível | Edição manual, referência |
| **`tokens.css`** | CSS variables (auto-gerado) | Importar em arquivos HTML/CSS |
| **`tokens.scss`** | Sass variables (auto-gerado) | Importar em projetos Sass/SCSS |
| **`tailwind.config.js`** | Tailwind config (auto-gerado) | Usar com Tailwind CSS |
| **`generate-tokens.js`** | Script de geração | Regenerar após editar tokens.json |
| **`TOKENS.md`** | Documentação completa | Referência de uso, exemplos, guia |

## 🚀 Quick Start

### 1. Ver Tokens Disponíveis
Abra `TOKENS.md` — tem lista completa de todos os 70+ tokens.

### 2. Usar em HTML/CSS
```html
<button style="background: var(--fill-accent); color: var(--text-on-accent);">
  Ação
</button>
```

### 3. Usar em Tailwind
```jsx
<button className="bg-fill-accent text-text-on-accent">Ação</button>
```

### 4. Usar em Sass
```scss
@import 'tokens.scss';

.button {
  background: $fill-accent;
  color: $text-on-accent;
}
```

### 5. Sincronizar com Figma
1. Instale [Figma Tokens plugin](https://www.figma.com/community/plugin/843461159747178978)
2. Vá para Tokens → Import
3. Cole conteúdo de `tokens.json`

## 🔄 Workflow de Desenvolvimento

```
1. Edite tokens.json
   ↓
2. Rode: node generate-tokens.js
   ↓
3. tokens.css, tokens.scss, tailwind.config.js são atualizados
   ↓
4. Figma Tokens plugin sincroniza automaticamente
   ↓
5. Você usa tokens em seu código
```

## 📊 Estrutura de Tokens

### Hierarquia CDS (3 camadas)

**Camada 1: Base Palette**
- Cores literais (`--gray-0`, `--yellow-300`, `--blue-500`, etc)
- Não altere sem bom motivo

**Camada 2: Theme Ramps**
- Escalas neutras (`--neutral-0` a `--neutral-900`)
- Preparadas para dark mode flip

**Camada 3: Purpose/Semantic**
- Tokens semânticos (`--fill-accent`, `--text-primary`, `--surface-1`, etc)
- O que você realmente usa no código

### 6 Roles Semânticas

| Role | Cor | Uso |
|------|-----|-----|
| **primary** | Amarelo | Identidade visual, sidebar |
| **accent** | Azul | Ações, botões secundários |
| **success** | Verde | Confirmações, status positivo |
| **warning** | Amber | Alertas, atenção |
| **danger** | Vermelho | Destrutivo, delete, erro |
| **pro** | Roxo | Premium, features exclusivas |

Cada role tem: `--fill-{role}`, `--fill-{role}-hover`, `--bg-{role}`, `--text-{role}`, `--text-on-{role}`

## 🎯 Regras de Uso

✅ **Faça:**
- Use `var(--fill-accent)` em vez de `#0ba5ec`
- Use `var(--text-on-{role})` para texto sobre fundo colorido
- Use `var(--radius-lg)` em vez de `border-radius: 12px`
- Use `var(--dur-base)` em vez de `transition: 300ms`

❌ **Não faça:**
- Hardcode cores (`#0ba5ec`, `rgb(11, 165, 236)`)
- Hardcode border-radius (`12px`, `8px`)
- Hardcode shadows ou durations
- Misture tokens com valores literais

## 🎨 Exemplo Completo

```html
<!-- HTML -->
<div style="
  background: var(--fill-primary);
  padding: 24px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
">
  <h2 style="color: var(--text-primary);">Título</h2>
  <p style="color: var(--text-secondary);">Descrição</p>
  <button style="
    background: var(--fill-accent);
    color: var(--text-on-accent);
    border-radius: var(--radius);
    transition: background var(--dur-base) var(--ease-out);
  ">
    Ação
  </button>
</div>
```

## 🛠️ Ferramentas

### Skill de Desenvolvimento
Localização: `Skills/design-tokens-usage.skill`

Acionada com: `/design-tokens-usage`

Fornece checklist, exemplos, erros comuns e auditoria.

### Script de Geração
```bash
node generate-tokens.js
```

Regenera todos os arquivos auto-gerados após editar tokens.

## ♿ Acessibilidade

- ✅ Todos os tokens passam em **WCAG AA** (contraste ≥ 4.5:1)
- ✅ Focus rings visíveis (2px, azul)
- ✅ Preparados para dark mode

## 🌙 Dark Mode (Futuro)

Quando dark mode for implementado:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: var(--neutral-0);    /* #181d27 → #fff */
    --surface-1: var(--neutral-900);    /* #fff → #1a1a1a */
    /* ... etc */
  }
}
```

**Nenhuma mudança no HTML/CSS** — apenas tokens mudam.

## 📚 Saiba Mais

- Leia `TOKENS.md` para referência completa
- Use `/design-tokens-usage` skill durante desenvolvimento
- Consulte `tokens.json` para estrutura técnica
- Sincronize com Figma Tokens plugin

## 🔗 Recursos Externos

- [Design Tokens Community Group](https://designtokens.org/)
- [Figma Tokens Plugin](https://tokens.studio/)
- [CDS Documentation](https://github.com/anthropics/design-system)

---

**Versão:** 1.0  
**Última atualização:** 2026-08-04  
**Mantido por:** Design System Team  
**Localização:** `Documentacao/Tokens/`
