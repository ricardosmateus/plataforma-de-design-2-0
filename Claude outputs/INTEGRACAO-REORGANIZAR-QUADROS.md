# Integração — Reorganizar Quadros Após Exclusão

## Problema

Quando você deleta um quadro no board, fica um buraco vazio no meio da tela. Os quadros restantes não "deslizam" para preencher esse espaço.

**Antes (com buraco):**
```
[Quadro 1] [Quadro 2] ░░░░░░░░░░ [Quadro 3]
                      ↑ buraco onde Quadro 2 estava
```

**Depois (reorganizado):**
```
[Quadro 1] [Quadro 3]
           ↑ deslizou para a esquerda, sem buraco
```

## Solução

Adicionar uma função `reorganizarQuadros()` que recalcula a posição `left` de todos os painéis, fazendo-os ocupar espaço contínuo.

## Implementação

### Passo 1: Adicionar script ao board.html

Adicione **logo antes de `</body>`** ou onde os outros scripts estão:

```html
<script src="js/reorganizar-quadros.js"></script>
```

Ou copie o conteúdo de `reorganizar-quadros.js` direto no `<script>` final de board.html.

### Passo 2: Chamar função após deletar quadro

**Localize** esta seção em `board.html` (por volta da linha 3662):

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

**Modifique para:**

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

## Resultado

Agora quando você deleta um quadro:

1. ✅ O quadro desaparece
2. ✅ Os quadros seguintes **deslizam para a esquerda automaticamente**
3. ✅ **Nenhum buraco** fica na tela
4. ✅ O espaçamento (32px entre quadros) é mantido

## Como funciona internamente

```javascript
// Cada painel é posicionado assim:
// Quadro 1: left = 456px (fixo)
// Quadro 2: left = 456 + largura1 + 32 = posição sequencial
// Quadro 3: left = (posição quadro 2) + largura2 + 32

// Quando um quadro é deletado, a função recalcula tudo
// para manter essa sequência contínua.
```

## Compatibilidade

- ✅ Funciona com qualquer número de colunas
- ✅ Funciona com qualquer largura de painel
- ✅ Não afeta zoom/pan do canvas
- ✅ Não quebra o autosave
- ✅ Usa mesma lógica da função `criarQuadro()`

## Teste rápido

1. Crie 3 quadros
2. Delete o quadro do meio
3. Os quadros 1 e 3 devem ficar juntos, sem buraco
4. O espaçamento de 32px entre eles é mantido

---

Se preferir, pode colocar a chamada em outro lugar, mas o local ideal é logo após `quadroExcluindo.remove()`, para reorganizar imediatamente.
