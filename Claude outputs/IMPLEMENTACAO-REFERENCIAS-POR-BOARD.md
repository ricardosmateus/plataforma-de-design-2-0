# Implementação — Referências Associadas a Cada Board

## Problema

Quando uma resposta é dividida em múltiplos boards (um por assunto/seção), **todas as referências (fontes) estavam sendo colocadas no primeiro board** em vez de ficarem com a seção a que pertencem.

Exemplo:
```
Resultado da pesquisa
├─ Board 1: "Mudanças de preço"
│  └ Referência V.092225 (fedex.com/br) ← CERTA
│
├─ Board 2: "Novos competidores" 
│  └ (vazio, mesmo tendo sua própria referência)
│
└─ Board 3: "Tabela de preços em vigor"
   └ (vazio, mesmo tendo sua própria referência)

❌ Todas as referências acabavam no Board 1
✅ Agora cada uma fica com sua seção de origem
```

## Solução

Implementar **associação de referências a seções** durante o parsing da resposta.

### Arquitetura

1. **`resposta-para-quadros.js`** (NOVO)
   - Divide resposta por seções (headers, padrões)
   - Extrai referências POR SEÇÃO (não globais)
   - Decide formato (documento vs post-its)
   - Agrupa tudo em um plano de quadros

2. **`board.html`** (MODIFICADO)
   - Inclui `resposta-para-quadros.js` antes do canvas
   - Usa `RespostaParaQuadros.planejarQuadros()` para dividir
   - Cria múltiplos boards (um por seção)
   - Cada board carrega suas próprias referências

3. **`pesquisa.js`** (MODIFICADO)
   - Ao receber resposta, passa para novo fluxo
   - Antes: enviava array de {titulo, descricao}
   - Depois: envia resposta completa + fontes para divisão

---

## Implementação Passo a Passo

### Passo 1: Adicionar `resposta-para-quadros.js` ao Board

```html
<!-- Em board.html, dentro de <head> ou antes de scripts de canvas: -->

<script src="js/resposta-para-quadros.js"></script>
```

**Arquivo:** `/Plataforma de Design 2.0/js/resposta-para-quadros.js`

O arquivo está pronto em `/tmp/.../resposta-para-quadros.js` — copie para o projeto.

### Passo 2: Atualizar `board.html` — Criar novo `criarQuadroResultado`

No final de `board.html`, **SUBSTITUA** a função `window.criarQuadroResultado` por:

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

### Passo 3: Atualizar `pesquisa.js` — Usar novo formato

Na função `pesquisarNoQuadro()` em `pesquisa.js`, **MODIFIQUE** o trecho onde a resposta é convertida em quadro:

**Antes:**
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

**Depois:**
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

### Passo 4: Adicionar CSS para documentos (opcional mas recomendado)

No `css/board.css`, adicione:

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

.ideas-panel--doc .ideas-title::after {
  content: " [documento]";
  font-size: 12px;
  font-weight: normal;
  opacity: 0.6;
}
```

---

## Testes

Depois de implementar, teste com uma resposta que tenha múltiplas seções:

### Exemplo de resposta que funciona agora:

```
## Mudanças de preço

A FedEx aumentou 5% em 2024 nos fretes domésticos.

Fonte: https://fedex.com/br

## Novos competidores

Jund Express entrou no mercado em janeiro de 2024.

Referência: https://jund.com.br

## Tabela de preços em vigor

| Operador | Valor (kg) |
| FedEx    | R$ 2,50    |
| Jund     | R$ 1,80    |

Fonte: Pesquisa em 2024-09-06
```

**Resultado esperado:**
- **Board 1**: "Mudanças de preço" → com referência fedex.com/br
- **Board 2**: "Novos competidores" → com referência jund.com.br  
- **Board 3**: "Tabela de preços em vigor" → com referência genérica

Cada referência fica com sua seção de origem. ✅

---

## Compatibilidade

### Código antigo continua funcionando?

Sim. Se alguém chamar:
```javascript
window.criarQuadroResultado('Título', [{titulo: 'x', descricao: 'y'}])
```

A função detecta o segundo argumento (`itens`) preenchido e usa a versão antiga.

### Qual é a diferença se chegar um `opcoes`?

```javascript
/* Novo modo */
window.criarQuadroResultado('Título', null, {
  resposta: 'texto completo',
  fontes: ['url1', 'url2']
})
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| RespostaParaQuadros não carregou | Verifique se `resposta-para-quadros.js` está no `<head>` ou no início de `board.html` |
| Referências still no primeiro board | Verifique se o padrão de referência `[texto](url)` ou `Fonte: url` existe na resposta |
| Post-its aparecem como documento | Normal — se resposta > 280 chars, vira documento |
| Conteúdo vazio em um board | Pode ser que o parser não tenha encontrado o header — ajuste o padrão em `secoesDaResposta()` |

---

## Próximos passos

1. **Copiar** `resposta-para-quadros.js` para `js/`
2. **Incluir** em `board.html` antes do canvas
3. **Atualizar** `criarQuadroResultado` conforme Passo 2
4. **Modificar** `pesquisa.js` conforme Passo 3
5. **Testar** com resposta multi-seção
6. **Adicionar CSS** para `card-documento` (Passo 4)

---

## Diagrama de fluxo

```
pesquisa.js
  pesquisarNoQuadro()
      ↓
  r.resposta + r.fontes (são passados para novo fluxo)
      ↓
  window.criarQuadroResultado(titulo, null, {resposta, fontes})
      ↓
  RespostaParaQuadros.planejarQuadros(resposta, fontes)
      ↓
  secoesDaResposta() → divide por ## headers
  partirSecao() → separa conteúdo de perguntas
  extrairReferencias() → associa referências à seção
      ↓
  plano = { tipo, quadros[...] }
      ↓
  Para cada quadro:
    - Se tipo === 'documento':  _criarQuadroDocumento()
    - Se tipo === 'postits':    _criarQuadroComPostits()
      ↓
  Cada quadro leva suas próprias referências
```
