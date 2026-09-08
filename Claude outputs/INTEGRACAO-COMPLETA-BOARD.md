# Integração Completa — Três Funcionalidades de Quadros

Este documento consolida as três features desenvolvidas para melhorar o board da Plataforma de Design 2.0:

1. ✅ **Referências distribuídas por board** (em vez de todas no primeiro)
2. ✅ **Gap removal** (quadros deslizam quando um é deletado)
3. ✅ **Drag and drop** (reordenar quadros arrastando)

---

## 🎯 Resumo de Integração

### Arquivos a Adicionar

```
js/
├── resposta-para-quadros.js    ← Novo
├── reorganizar-quadros.js      ← Novo
└── drag-drop-quadros.js        ← Novo
```

### Modificações em board.html

1. **3 `<script>` tags** (ordem importa!)
2. **1 função substituída** (`criarQuadroResultado`)
3. **1 local modificado** (delete handler para chamar `reorganizarQuadros`)

### Modificações em pesquisa.js

1. **1 chamada modificada** (passar resposta completa em vez de array pré-formatado)

---

## 📋 Passo a Passo

### ✅ Passo 1: Copiar os 3 arquivos .js para js/

```bash
# Copie estes arquivos para a pasta js/ do seu projeto:
js/resposta-para-quadros.js
js/reorganizar-quadros.js
js/drag-drop-quadros.js
```

**⚠️ Importante:** Mantenha os nomes exatos.

---

### ✅ Passo 2: Adicionar scripts ao board.html

**Em `board.html`**, localize a seção de scripts (perto do final, antes de `</body>` ou onde outros scripts estão).

Adicione **nesta ordem exata** (a ordem importa porque cada um depende do anterior):

```html
<!-- NOVO — Distribuição de referências por board -->
<script src="js/resposta-para-quadros.js"></script>

<!-- NOVO — Remove gaps após deletar quadro -->
<script src="js/reorganizar-quadros.js"></script>

<!-- NOVO — Drag and drop para reordenar quadros -->
<script src="js/drag-drop-quadros.js"></script>
```

**Localização recomendada:**
- Se existir `<script src="js/..."></script>` já em board.html, adicione logo após os scripts existentes
- Se não existir, adicione antes de `</body>` ou após qualquer outro script

---

### ✅ Passo 3: Substituir função criarQuadroResultado em board.html

**Localize** a função `window.criarQuadroResultado` em board.html (busque por `criarQuadroResultado` no arquivo).

**SUBSTITUA** a função inteira por:

```javascript
/**
 * Versão melhorada que cria múltiplos quadros com referências associadas.
 * Compatível com versão antiga (se só passar itens, usa modo antigo).
 */
window.criarQuadroResultado = function(titulo, itens, opcoes) {
  if (modoLeitura) return null;

  /* Modo compatível: usar o antigo se itens for passado sem opcoes */
  if (itens && itens.length && !opcoes) {
    return window._criarQuadroResultadoAntigo(titulo, itens);
  }

  opcoes = opcoes || {};
  var resposta = opcoes.resposta;
  var fontes = opcoes.fontes;

  if (!resposta || typeof resposta !== 'string') {
    return window._criarQuadroResultadoAntigo(titulo, itens || []);
  }

  /* Usar RespostaParaQuadros para dividir e agrupar */
  if (!window.RespostaParaQuadros) {
    console.error('[Board] RespostaParaQuadros não está carregado.');
    return window._criarQuadroResultadoAntigo(titulo, itens || []);
  }

  var plano = window.RespostaParaQuadros.planejarQuadros(resposta, fontes);
  var primeiroQuadro = null;

  plano.quadros.forEach(function (secao, indice) {
    var tituloSecao = indice === 0 ? titulo : titulo + ' — ' + secao.titulo;
    var quadro = null;

    if (plano.tipo === 'documento') {
      quadro = _criarQuadroDocumento(tituloSecao, secao);
    } else {
      quadro = _criarQuadroComPostits(tituloSecao, secao);
    }

    if (quadro && indice === 0) {
      primeiroQuadro = quadro;
    }
  });

  atualizarColunas();
  dispararAutosave();
  return primeiroQuadro;
};

/**
 * Cria quadro do tipo "documento" (conteúdo fluente, não post-its).
 * Usado quando resposta é longa ou tem múltiplas seções.
 */
function _criarQuadroDocumento(titulo, secao) {
  if (modoLeitura) return null;

  var quadro = criarQuadro(titulo, 1, ['']);
  if (!quadro) return null;

  var lista = quadro.querySelector('.card-list');
  if (!lista) return null;

  /* Card documento com contenteditable */
  var cardDoc = document.createElement('div');
  cardDoc.className = 'idea card-documento';
  cardDoc.setAttribute('contenteditable', 'true');

  /* Cabeçalho */
  var cabeca = document.createElement('div');
  cabeca.className = 'documento-cabeca';
  cabeca.textContent = secao.titulo;
  cardDoc.appendChild(cabeca);

  /* Corpo */
  var corpo = document.createElement('div');
  corpo.className = 'documento-corpo';
  corpo.textContent = secao.conteudo;
  cardDoc.appendChild(corpo);

  /* Perguntas em aberto */
  if (secao.perguntas && secao.perguntas.length) {
    var perguntasEl = document.createElement('div');
    perguntasEl.className = 'documento-perguntas';
    var titulo = document.createElement('h4');
    titulo.textContent = 'Perguntas em aberto';
    perguntasEl.appendChild(titulo);

    secao.perguntas.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'pergunta-item';
      item.textContent = p;
      perguntasEl.appendChild(item);
    });

    cardDoc.appendChild(perguntasEl);
  }

  /* Referências */
  if (secao.referencias && secao.referencias.length) {
    var refEl = document.createElement('div');
    refEl.className = 'documento-referencias';
    var refTitulo = document.createElement('h4');
    refTitulo.textContent = 'Referências';
    refEl.appendChild(refTitulo);

    secao.referencias.forEach(function (ref) {
      var refItem = document.createElement('div');
      refItem.className = 'referencia-item';
      if (ref.url) {
        var link = document.createElement('a');
        link.href = ref.url;
        link.target = '_blank';
        link.textContent = ref.titulo || ref.url;
        refItem.appendChild(link);
      } else {
        refItem.textContent = ref.titulo;
      }
      refEl.appendChild(refItem);
    });

    cardDoc.appendChild(refEl);
  }

  lista.appendChild(cardDoc);
  return quadro;
}

/**
 * Cria quadro com post-its para respostas curtas.
 */
function _criarQuadroComPostits(titulo, secao) {
  if (modoLeitura) return null;

  var quadro = criarQuadro(titulo, 1, ['']);
  if (!quadro) return null;

  var lista = quadro.querySelector('.card-list');
  if (!lista) return null;

  var paragrafos = secao.conteudo
    .split('\n\n')
    .map(function (p) { return p.trim(); })
    .filter(Boolean);

  var desc = paragrafos.length > 0 ? paragrafos[0] : ('Resposta: ' + secao.titulo);
  if (desc.length > 280) desc = desc.substring(0, 277) + '…';

  var card = criarCard(secao.titulo || 'Resultado', desc);
  lista.appendChild(card);

  /* Post-it de referências */
  if (secao.referencias && secao.referencias.length) {
    var refDesc = 'Fontes:\n' + secao.referencias
      .map(function (r) { return '• ' + (r.titulo || r.url); })
      .join('\n');
    var refCard = criarCard('Referências', refDesc);
    lista.appendChild(refCard);
  }

  return quadro;
}

/**
 * Função original, renomeada para não ser sobrescrita.
 * Mantida para compatibilidade com código que a chama direto.
 */
window._criarQuadroResultadoAntigo = function(titulo, itens) {
  if (modoLeitura) return null;
  var lista = itens || [];
  if (!lista.length) return null;
  var COLUNAS = [''];
  var quadro = criarQuadro(titulo || 'Resultado da pesquisa', COLUNAS.length, COLUNAS);
  var listas = quadro.querySelectorAll('.card-list');
  lista.forEach(function (item) {
    listas[0].appendChild(criarCard(item.titulo || 'Sem título', item.descricao || ''));
  });
  atualizarColunas();
  dispararAutosave();
  return quadro;
};
```

---

### ✅ Passo 4: Adicionar reorganizarQuadros ao delete handler

**Localize** em board.html (busque por `confirmQuadroDeleteBtn`):

```javascript
document.getElementById('confirmQuadroDeleteBtn').addEventListener('click', function(){
  fecharQuadroDelete();
  if(quadroExcluindo){
    quadroExcluindo.remove();
    quadroExcluindo = null;
  }
  atualizarColunas();
  dispararAutosave();
  mostrarMensagem('Quadro excluído com sucesso.');
});
```

**MODIFIQUE** para:

```javascript
document.getElementById('confirmQuadroDeleteBtn').addEventListener('click', function(){
  fecharQuadroDelete();
  if(quadroExcluindo){
    quadroExcluindo.remove();
    quadroExcluindo = null;
    
    /* 👇 ADICIONE ESTAS LINHAS 👇 */
    if(window.reorganizarQuadros) {
      window.reorganizarQuadros();
    }
    /* 👆 FIM DA ADIÇÃO 👆 */
  }
  atualizarColunas();
  dispararAutosave();
  mostrarMensagem('Quadro excluído com sucesso.');
});
```

---

### ✅ Passo 5: Modificar pesquisa.js

**Localize** em pesquisa.js a função `pesquisarNoQuadro()` (procure por `window.criarQuadroResultado`).

**ENCONTRE** este código:

```javascript
var itens = [];
if (r.resposta) {
  var fontes = (r.fontes || [])
    .map(function (f) { return f.titulo || f.url; })
    .join(' · ');
  itens.push({
    titulo: 'Resposta',
    descricao: r.resposta + (fontes ? '\n\nFontes: ' + fontes : ''),
  });
}
// ... mais código ...
var quadro = window.criarQuadroResultado('Resultado da pesquisa', itens);
```

**SUBSTITUA** por:

```javascript
/* Novo: passar resposta completa + fontes para divisão */
if (r.resposta) {
  var fontes = (r.fontes || [])
    .map(function (f) { return f.titulo || f.url; });
  
  var quadro = window.criarQuadroResultado('Resultado da pesquisa', null, {
    resposta: r.resposta,
    fontes: fontes
  });
  
  if (!quadro) {
    avisarNaTela('A busca voltou sem nada que desse um card.');
    return false;
  }
} else {
  avisarNaTela('A busca voltou sem nada que desse um card.');
  return false;
}

avisarNaTela('Pesquisa concluída — resultado no quadro.');
return true;
```

---

### ✅ Passo 6: Adicionar CSS (opcional mas recomendado)

Em `css/board.css`, adicione ao final:

```css
/* Documento — card com conteúdo fluente */
.idea.card-documento {
  padding: 16px;
  background: var(--surface-1, #fafafa);
  border-radius: var(--radius-lg, 12px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: var(--text-primary, #111);
}

.documento-cabeca {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border, #ddd);
}

.documento-corpo {
  margin-bottom: 16px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.documento-perguntas,
.documento-referencias {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #ddd);
}

.documento-perguntas h4,
.documento-referencias h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-secondary, #666);
}

.pergunta-item,
.referencia-item {
  margin-bottom: 6px;
  padding-left: 16px;
  font-size: 13px;
  color: var(--text-primary, #111);
}

.pergunta-item::before {
  content: "• ";
  margin-left: -12px;
  color: var(--text-secondary, #666);
}

.referencia-item a {
  color: var(--fill-accent, #0ba5ec);
  text-decoration: none;
  font-size: 13px;
}

.referencia-item a:hover {
  text-decoration: underline;
}
```

---

## ✅ Checklist Final

Antes de testar, verifique:

- [ ] Os 3 arquivos .js estão em `js/`
- [ ] Scripts adicionados a board.html **nesta ordem**:
  1. resposta-para-quadros.js
  2. reorganizar-quadros.js
  3. drag-drop-quadros.js
- [ ] `criarQuadroResultado` foi substituída (compatibilidade mantida)
- [ ] `window.reorganizarQuadros()` foi adicionada ao delete handler
- [ ] `pesquisa.js` foi modificada para passar `{resposta, fontes}`
- [ ] CSS adicionado (opcional mas recomendado)

---

## 🧪 Testes

### Teste 1: Referências Distribuídas
1. Execute uma pesquisa que retorne resposta com múltiplas seções (com ##)
2. Cada seção deve virar um board separado
3. **Cada board deve exibir APENAS suas referências**, não todas concentradas no primeiro

### Teste 2: Gap Removal
1. Crie 3 quadros
2. Delete o quadro do meio
3. Os quadros 1 e 3 devem estar **juntos sem buraco**
4. Distância entre eles deve ser 32px

### Teste 3: Drag and Drop
1. Crie 3 quadros
2. Passe mouse sobre cabeçalho → cursor muda para "grab"
3. Clique e segure
4. Arraste para nova posição
5. Solte → quadros se reorganizam
6. **Recarregue página** → ordem foi mantida ✅

---

## 🚀 Pronto!

Depois de completar todos os passos acima, as três funcionalidades estarão ativas:

✅ Referências associadas corretamente a cada board  
✅ Sem buracos ao deletar quadros  
✅ Drag and drop para reordenar  

---

## 📞 Troubleshooting

| Problema | Solução |
|----------|---------|
| Scripts não carregam | Verifique se os caminhos em `<script src="...">` estão corretos e apontam para `js/` |
| RespostaParaQuadros é undefined | Verifique se `resposta-para-quadros.js` está carregado **primeiro** |
| Quadros não reorganizam após deletar | Verifique se `window.reorganizarQuadros()` foi adicionada ao delete handler |
| Não consegue arrastar | Verifique se clicou no **cabeçalho** (`.ideas-head`) e não no corpo do quadro |
| Ordem de drag não é salva | Verifique se `dispararAutosave()` existe e está sendo chamado |

---

**Versão:** 1.0 Consolidada  
**Data:** 2026-09-06
