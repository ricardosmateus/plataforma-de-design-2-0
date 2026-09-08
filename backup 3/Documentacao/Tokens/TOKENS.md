# Design Tokens — Plataforma de Design 2.0

Sistema de tokens de design seguindo a hierarquia CDS (Camada 1: Base → Camada 2: Theme → Camada 3: Purpose/Semantic).

**Localização:** `Documentacao/Tokens/` (todos os arquivos de tokens e geração)

## 📁 Arquivos

- **`tokens.json`** — Fonte de verdade (DTCG format). Sincronizável com Figma Tokens plugin.
- **`tokens.yaml`** — Alternativa YAML (mais legível).
- **`tokens.css`** — CSS custom properties (auto-gerado).
- **`tokens.scss`** — Sass variables (auto-gerado).
- **`tailwind.config.js`** — Tailwind configuration (auto-gerado).
- **`generate-tokens.js`** — Script de geração.
- **`TOKENS.md`** — Este arquivo (documentação).

## 🎨 Estrutura

### Camada 1: Base Palette
Cores literais, semelhantes à realidade.

```json
{
  "color": {
    "base": {
      "palette": {
        "gray": { "0": "#fff", "50": "#faf", ... }
        "yellow": { "300": "#fac515" }
        "blue": { "500": "#0ba5ec" }
        // ...
      }
    }
  }
}
```

### Camada 2: Theme Ramps
Escalas neutras, prontas para dark mode flip.

```json
{
  "color": {
    "theme": {
      "neutral": {
        "0": { "$value": "{color.base.palette.gray.0}" }
        "900": { "$value": "{color.base.palette.gray.900}" }
      }
    }
  }
}
```

### Camada 3: Purpose/Semantic
Semântica desacoplada de cores literais — o que componentes consomem.

```json
{
  "color": {
    "semantic": {
      "text": {
        "primary": { "$value": "{color.theme.neutral.900}" },
        "secondary": { "$value": "{color.theme.neutral.600}" }
      },
      "primary": {
        "fill": { "$value": "{color.base.palette.yellow.300}" },
        "text-on": { "$value": "{color.theme.neutral.900}" }
      },
      "accent": {
        "fill": { "$value": "{color.base.palette.blue.500}" },
        "text-on": { "$value": "{color.theme.neutral.0}" }
      },
      "success": { ... },
      "warning": { ... },
      "danger": { ... },
      "pro": { ... }
    }
  }
}
```

## 🚀 Como Usar

### 1. CSS (já integrado em `minhas-empresas.html`)

```html
<button style="background: var(--fill-accent); color: var(--text-on-accent)">
  Ação
</button>
```

### 2. Tailwind

```bash
# Ir para pasta de tokens
cd Documentacao/Tokens/

# Gerar config (se necessário)
node generate-tokens.js

# Importar em tailwind.config.js
const config = require('./tailwind.config.js');
```

```jsx
<button className="bg-fill-accent text-text-on-accent">Ação</button>
```

### 3. Sass

```scss
@import 'tokens.scss';

.button {
  background: $fill-accent;
  color: $text-on-accent;
}
```

### 4. JavaScript (design tokens runtime)

```js
const tokens = require('./tokens.json');
const primaryFill = tokens.global.color.semantic.primary.fill.$value; // "#fac515"
```

## 🔄 Sincronizar com Figma

1. Instale o **[Figma Tokens](https://www.figma.com/community/plugin/843461159747178978)** plugin
2. Vá para **Tokens > Import**
3. Cole o conteúdo de `tokens.json`
4. As cores e estilos são sincronizados com o Figma automaticamente

## 🔧 Gerar Novamente

Após editar `tokens.json` ou `tokens.yaml`:

```bash
cd Documentacao/Tokens/
node generate-tokens.js
```

Regenera:
- `tokens.css`
- `tokens.scss`
- `tailwind.config.js`

## 📖 Skill de Design Tokens

Localização: `Skills/design-tokens-usage.skill`

Acionada automaticamente ao desenvolver/editar páginas ou invocada com:
```
/design-tokens-usage
```

Fornece checklist completo, referência rápida de tokens, exemplos de uso, erros comuns e auditoria de conformidade.

## 📚 Roles Semânticas

Cada role segue o padrão:

```
--fill-{role}         # Cor sólida (buttons)
--fill-{role}-hover   # Hover state
--bg-{role}           # Fundo suave (badges)
--text-{role}         # Texto colorido
--text-on-{role}      # Texto sobre fundo colorido
```

**Roles disponíveis:**
- `primary` (amarelo) — identidade visual
- `accent` (azul) — ações secundárias
- `success` (verde) — confirmações
- `warning` (amber) — alertas
- `danger` (vermelho) — destrutivo
- `pro` (roxo) — premium

## ✅ Contraste WCAG

Todos os tokens passam em WCAG AA (contrast ratio ≥ 4.5:1 para texto sobre background).

## 🌙 Dark Mode

Dark mode pode ser adicionado com overrides:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: var(--neutral-0);
    --surface-1: var(--neutral-900);
    /* ... */
  }
}
```

## 📚 Arquivos de Referência

Todos os arquivos estão organizados em:

```
Plataforma de Design 2.0/
├── Documentacao/
│   └── Tokens/              ← Você está aqui
│       ├── tokens.json      ← Fonte de verdade
│       ├── tokens.yaml      ← Alternativa legível
│       ├── tokens.css       ← CSS variables (auto-gerado)
│       ├── tokens.scss      ← Sass (auto-gerado)
│       ├── tailwind.config.js ← Tailwind (auto-gerado)
│       ├── generate-tokens.js ← Script de regeneração
│       └── TOKENS.md        ← Este arquivo
│
├── Skills/
│   └── design-tokens-usage.skill ← Skill de desenvolvimento
│
└── minhas-empresas.html     ← Exemplo de implementação

```

## 📖 Referências Externas

- [Design Tokens Community Group](https://designtokens.org/)
- [Figma Tokens Plugin](https://tokens.studio/)
- [CDS Documentation](https://github.com/anthropics/design-system)

---

**Última atualização:** auto-gerado pelo `generate-tokens.js`
**Localização dos tokens:** `Documentacao/Tokens/`
**Localização da skill:** `Skills/design-tokens-usage.skill`
