#!/usr/bin/env python3
"""Liga a escala tipográfica numa página: troca literais por var(--type-*).

Regra de segurança: só troca quando o valor está EXATAMENTE na escala, e
só troca `line-height` quando ele forma, com o `font-size` da mesma regra,
um par previsto pela escala. Par fora da escala fica como está e é
relatado — inventar um par aqui mudaria o desenho da página, que é
justamente o que esta troca não pode fazer.
"""
import io
import re
import sys

# tamanho -> (nome, entrelinha da escala)
ESCALA = {
    '30px': ('display',  '38px'),
    '24px': ('title',    '32px'),
    '18px': ('heading',  '28px'),
    '16px': ('body-lg',  '24px'),
    '14px': ('body',     '20px'),
    '13px': ('body-sm',  '20px'),
    '12px': ('caption',  '18px'),
    '11px': ('overline', '16px'),
}

caminho = sys.argv[1]
texto = io.open(caminho, encoding='utf-8').read()

estilos = list(re.finditer(r'<style[^>]*>(.*?)</style>', texto, re.S))
assert estilos, 'sem bloco <style>'

trocas_fs = trocas_lh = 0
pares_fora = []
tamanhos_fora = []


def na_regra(corpo: str) -> str:
    """Substitui dentro de UM bloco de declarações."""
    global trocas_fs, trocas_lh

    mfs = re.search(r'font-size:\s*([^;}\n]+)', corpo)
    mlh = re.search(r'line-height:\s*([^;}\n]+)', corpo)
    if not mfs:
        return corpo

    fs = mfs.group(1).strip()
    if fs not in ESCALA:
        if fs.endswith('px') and 'var(' not in fs:
            tamanhos_fora.append(fs)
        return corpo

    nome, lh_esperada = ESCALA[fs]
    corpo = corpo[:mfs.start(1)] + 'var(--type-%s)' % nome + corpo[mfs.end(1):]
    trocas_fs += 1

    # o line-height mudou de posição depois da troca acima
    mlh = re.search(r'line-height:\s*([^;}\n]+)', corpo)
    if not mlh:
        return corpo

    lh = mlh.group(1).strip()
    if lh == lh_esperada:
        corpo = corpo[:mlh.start(1)] + 'var(--type-%s-lh)' % nome + corpo[mlh.end(1):]
        trocas_lh += 1
    elif lh.endswith('px'):
        pares_fora.append((fs, lh))

    return corpo


def varrer(css: str) -> str:
    """Percorre só os blocos mais internos (assim @media não atrapalha)."""
    saida = []
    i = 0
    for m in re.finditer(r'\{([^{}]*)\}', css):
        saida.append(css[i:m.start()])
        saida.append('{' + na_regra(m.group(1)) + '}')
        i = m.end()
    saida.append(css[i:])
    return ''.join(saida)


novo = texto
for m in reversed(estilos):
    novo = novo[:m.start(1)] + varrer(m.group(1)) + novo[m.end(1):]

io.open(caminho, 'w', encoding='utf-8').write(novo)

print('font-size  trocados: %d' % trocas_fs)
print('line-height trocados: %d' % trocas_lh)
print('tamanhos fora da escala (mantidos): %s' % (sorted(set(tamanhos_fora)) or 'nenhum'))
print('pares fora da escala (entrelinha mantida): %s' % (sorted(set(pares_fora)) or 'nenhum'))
