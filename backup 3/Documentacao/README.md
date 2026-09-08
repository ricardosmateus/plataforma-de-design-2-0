# 📚 Documentação — Plataforma de Design 2.0

Bem-vindo à documentação da Plataforma de Design 2.0. Aqui você encontra guias, referências e recursos para desenvolvimento.

## 📁 Estrutura de Documentação

```
Documentacao/
├── README.md                    ← Você está aqui
├── Tokens/                      ← Design Tokens (core)
│   ├── README.md               ← Quick start de tokens
│   ├── TOKENS.md               ← Documentação técnica completa
│   ├── tokens.json             ← Fonte de verdade (DTCG)
│   ├── tokens.yaml             ← Alternativa legível
│   ├── tokens.css              ← CSS variables (auto-gerado)
│   ├── tokens.scss             ← Sass (auto-gerado)
│   ├── tailwind.config.js      ← Tailwind (auto-gerado)
│   └── generate-tokens.js      ← Script de regeneração
│
└── [Futuro: Componentes, Guias, etc]
```

## 🎯 Por Onde Começar?

### Desenvolvimento de Página/Componente?
1. Leia `Tokens/README.md` (quick start)
2. Use `/design-tokens-usage` skill durante dev
3. Consulte `Tokens/TOKENS.md` para referência completa

### Editando Tokens?
1. Edite `Tokens/tokens.json`
2. Rode `node Tokens/generate-tokens.js`
3. Verifique se `tokens.css`, `tokens.scss`, `tailwind.config.js` foram atualizados
4. Sincronize com Figma Tokens plugin

### Primeiro Contato com Design System?
1. Vá para `Tokens/README.md` — overview rápido
2. Veja os exemplos em `Tokens/TOKENS.md`
3. Abra `minhas-empresas.html` no navegador — veja tokens em ação
4. Clique no botão "Design tokens" para ver showcase interativo

## 🎨 Tokens de Design

Local: `Tokens/`

70+ tokens semânticos organizados em 3 camadas CDS:
- Base Palette (cores literais)
- Theme Ramps (escalas neutras)
- Purpose/Semantic (o que você usa)

6 roles semânticas: primary, accent, success, warning, danger, pro

**Ler mais:** `Tokens/README.md` ou `Tokens/TOKENS.md`

## 🛠️ Ferramentas & Skills

### Design Tokens Usage Skill
Local: `../Skills/design-tokens-usage.skill`

Acionada com: `/design-tokens-usage`

Checklist, exemplos, erros comuns, auditoria de conformidade.

### UI Design Guidelines Skill
Local: `../Skills/ui-design-guidelines.skill`

Acionada com: `/ui-design-guidelines`

Revisa arquivos de UI conforme as **Web Interface Guidelines** (fetch das regras mais recentes em tempo de execução). Use quando precisar revisar interface, auditar design/UX ou checar acessibilidade.

- Origem: https://github.com/vercel-labs/agent-skills
- Instalação: `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`
- No projeto: `Skills/ui-design-guidelines.skill`

### Token Generator
Local: `Tokens/generate-tokens.js`

Regenera CSS, SCSS, Tailwind após editar tokens.json:
```bash
cd Tokens/
node generate-tokens.js
```

## 📄 Páginas/Componentes Exemplo

- **`minhas-empresas.html`** — Exemplo completo com sidebar, cards, hover, menu, empty state
  - Usa todos os tokens
  - WCAG AA compliant
  - Focus rings implementados
  - Showcase de tokens (botão "Design tokens")

## 🔗 Estrutura Geral do Projeto

```
Plataforma de Design 2.0/
├── Documentacao/          ← Você está aqui
│   ├── README.md
│   └── Tokens/
│
├── Skills/               ← Skills de Design e UI (formato .skill)
│   ├── design-tokens-usage.skill
│   ├── ui-design-guidelines.skill
│   └── Regra_de_negocio.skill
│
└── minhas-empresas.html  ← Exemplo de implementação
```

## 📖 Próximas Pastas (Planejadas)

- `Componentes/` — Biblioteca de componentes reutilizáveis
- `Guias/` — Guias de desenvolvimento (acessibilidade, dark mode, etc)
- `Regras_de_negocio/` — Especificações e regras de design
- `Exemplos/` — Casos de uso e padrões

## 🚀 Fluxo de Desenvolvimento

```
1. Novo projeto?
   └─ Leia Tokens/README.md

2. Desenvolvendo página/componente?
   └─ Use /design-tokens-usage skill
   └─ Revise com /ui-design-guidelines skill
   └─ Consulte /Regra_de_negocio para regras de negócio

3. Editando tokens?
   └─ Edite Tokens/tokens.json
   └─ Rode generate-tokens.js
   └─ Sincronize com Figma

4. Precisa de referência?
   └─ Consulte Tokens/TOKENS.md
```

## ✅ Checklist de Conformidade

Antes de fazer commit:

- [ ] Sem cores hardcoded (`#xxx`)
- [ ] Sem border-radius sem token
- [ ] Sem shadow sem token
- [ ] Sem duration sem token
- [ ] Todos os textos sobre fundo colorido usam `--text-on-{role}`
- [ ] Focus rings visíveis (Tab)
- [ ] Contraste WCAG AA validado
- [ ] Pronto para dark mode

Use a skill `/design-tokens-usage` para garantir.

## 🎯 Referência Rápida de Tokens

### Cores (Roles)
- `primary` (amarelo) — identidade
- `accent` (azul) — ações
- `success` (verde), `warning` (amber), `danger` (vermelho), `pro` (roxo)

### Texto
- `--text-primary` — principal
- `--text-secondary` — suportador
- `--text-muted` — placeholder
- `--text-on-{role}` — sobre fundo colorido

### Superfícies
- `--surface-0` — canvas/página
- `--surface-1` — card
- `--surface-2` — panel

### Outros
- `--radius` (8px), `--radius-lg` (12px)
- `--shadow-xs`, `--shadow-lg`, `--shadow-menu`
- `--dur-fast` (150ms), `--dur-base` (300ms), `--dur-slow` (500ms)
- `--border`, `--border-strong`

**Leia `Tokens/TOKENS.md` para lista completa.**

## 📞 Dúvidas?

1. Verifique `Tokens/README.md` ou `Tokens/TOKENS.md`
2. Invoque `/design-tokens-usage` skill
3. Veja exemplo em `minhas-empresas.html`

---

**Última atualização:** 2026-08-04  
**Mantido por:** Design System Team  
**Localização de Tokens:** `Documentacao/Tokens/`  
**Skills de Design:** `Skills/design-tokens-usage.skill`, `Skills/ui-design-guidelines.skill`, `Skills/Regra_de_negocio.skill`
