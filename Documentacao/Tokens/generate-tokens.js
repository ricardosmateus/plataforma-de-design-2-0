#!/usr/bin/env node

/**
 * Generate CSS, Tailwind, and Sass from design tokens.json
 *
 * Usage:
 *   node generate-tokens.js
 *
 * Gera:
 *   - tokens.css       (CSS custom properties)
 *   - tokens-tailwind.js  (Tailwind config)
 *   - tokens.scss      (Sass variables)
 */

const fs = require('fs');
const path = require('path');

// Carrega tokens.json
const tokensPath = path.join(__dirname, 'tokens.json');
const tokensData = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));

// Resolve token references (e.g., {color.semantic.text.primary})
function resolveTokenValue(value, tokens) {
  if (typeof value !== 'string') return value;

  const refMatch = value.match(/\{([^}]+)\}/g);
  if (!refMatch) return value;

  let resolved = value;
  refMatch.forEach(ref => {
    const path = ref.slice(1, -1).split('.');
    let current = tokens;

    for (const key of path) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        current = undefined;
        break;
      }
    }

    if (current && current.$value) {
      resolved = resolved.replace(ref, current.$value);
    }
  });

  return resolved;
}

// Flatten nested token structure
function flattenTokens(obj, prefix = '', resolved = {}, raw = {}) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;

    const fullKey = prefix ? `${prefix}-${key}` : key;

    if (value && typeof value === 'object' && value.$value) {
      raw[fullKey] = value.$value;
      resolved[fullKey] = resolveTokenValue(value.$value, tokensData.global);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenTokens(value, fullKey, resolved, raw);
    }
  }

  return { resolved, raw };
}

const { resolved: flatTokens, raw: rawTokens } = flattenTokens(tokensData.global);

// ============================================================
// 1. Generate CSS custom properties
// ============================================================
function generateCSS() {
  let css = `/* Auto-generated from tokens.json */
/* DO NOT EDIT MANUALLY — run: node generate-tokens.js */

:root {
`;

  Object.entries(flatTokens).forEach(([key, value]) => {
    const cssVar = `--${key}`;
    css += `  ${cssVar}: ${value};\n`;
  });

  css += `}\n`;

  return css;
}

// ============================================================
// 2. Generate Tailwind config (partial)
// ============================================================
function generateTailwind() {
  const tailwindConfig = {
    colors: {},
    spacing: {},
    borderRadius: {},
    boxShadow: {},
    transitionDuration: {},
    transitionTimingFunction: {}
  };

  // Map colors
  Object.entries(flatTokens).forEach(([key, value]) => {
    if (key.startsWith('color-')) {
      const colorName = key.replace('color-', '').replace(/-/g, '/');
      tailwindConfig.colors[colorName] = value;
    }
  });

  // Map sizing
  Object.entries(flatTokens).forEach(([key, value]) => {
    if (key.startsWith('sizing-radius-')) {
      const name = key.replace('sizing-radius-', '');
      tailwindConfig.borderRadius[name] = value;
    }
    if (key.startsWith('sizing-') && !key.includes('radius')) {
      tailwindConfig.spacing[key.replace('sizing-', '')] = value;
    }
  });

  // Map shadows
  Object.entries(flatTokens).forEach(([key, value]) => {
    if (key.startsWith('shadow-')) {
      tailwindConfig.boxShadow[key.replace('shadow-', '')] = value;
    }
  });

  // Map motion
  Object.entries(flatTokens).forEach(([key, value]) => {
    if (key.startsWith('motion-duration-')) {
      tailwindConfig.transitionDuration[key.replace('motion-duration-', '')] = value;
    }
    if (key.startsWith('motion-easing-')) {
      tailwindConfig.transitionTimingFunction[key.replace('motion-easing-', '')] = value;
    }
  });

  const js = `// Auto-generated from tokens.json
// DO NOT EDIT MANUALLY — run: node generate-tokens.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(tailwindConfig.colors, null, 6)},
      spacing: ${JSON.stringify(tailwindConfig.spacing, null, 6)},
      borderRadius: ${JSON.stringify(tailwindConfig.borderRadius, null, 6)},
      boxShadow: ${JSON.stringify(tailwindConfig.boxShadow, null, 6)},
      transitionDuration: ${JSON.stringify(tailwindConfig.transitionDuration, null, 6)},
      transitionTimingFunction: ${JSON.stringify(tailwindConfig.transitionTimingFunction, null, 6)},
    },
  },
};
`;

  return js;
}

// ============================================================
// 3. Generate Sass variables
// ============================================================
function generateSass() {
  let scss = `// Auto-generated from tokens.json
// DO NOT EDIT MANUALLY — run: node generate-tokens.js

`;

  Object.entries(flatTokens).forEach(([key, value]) => {
    const scssVar = `$${key}`;
    scss += `${scssVar}: ${value};\n`;
  });

  return scss;
}

// ============================================================
// Write files
// ============================================================
const cssContent = generateCSS();
const tailwindContent = generateTailwind();
const scssContent = generateSass();

fs.writeFileSync(path.join(__dirname, 'tokens.css'), cssContent, 'utf8');
fs.writeFileSync(path.join(__dirname, 'tailwind.config.js'), tailwindContent, 'utf8');
fs.writeFileSync(path.join(__dirname, 'tokens.scss'), scssContent, 'utf8');

console.log('✅ Tokens generated successfully:');
console.log('   - tokens.css');
console.log('   - tailwind.config.js');
console.log('   - tokens.scss');
