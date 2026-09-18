#!/usr/bin/env python3
"""Prova que a troca não mudou o desenho: resolve os tokens de volta
para os literais e compara regra a regra com o arquivo anterior."""
import io
import re
import sys

VALOR = {
    'display': '30px', 'display-lh': '38px',
    'title': '24px', 'title-lh': '32px',
    'heading': '18px', 'heading-lh': '28px',
    'body-lg': '16px', 'body-lg-lh': '24px',
    'body': '14px', 'body-lh': '20px',
    'body-sm': '13px', 'body-sm-lh': '20px',
    'caption': '12px', 'caption-lh': '18px',
    'overline': '11px', 'overline-lh': '16px',
}


def resolver(v: str) -> str:
    m = re.fullmatch(r'var\(--type-([a-z-]+)\)', v.strip())
    return VALOR[m.group(1)] if m else v.strip()


def pares(caminho: str):
    css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>',
                               io.open(caminho, encoding='utf-8').read(), re.S))
    saida = []
    for m in re.finditer(r'\{([^{}]*)\}', css):
        corpo = m.group(1)
        fs = re.search(r'font-size:\s*([^;}\n]+)', corpo)
        lh = re.search(r'line-height:\s*([^;}\n]+)', corpo)
        if fs or lh:
            saida.append((resolver(fs.group(1)) if fs else None,
                          resolver(lh.group(1)) if lh else None))
    return saida


antes, depois = pares(sys.argv[1]), pares(sys.argv[2])

print('regras com tipografia — antes: %d | depois: %d' % (len(antes), len(depois)))
if antes == depois:
    print('IDÊNTICAS: os valores resolvidos são exatamente os mesmos.')
else:
    print('DIFERENÇAS:')
    for i, (a, b) in enumerate(zip(antes, depois)):
        if a != b:
            print('  regra %d: %s -> %s' % (i, a, b))
    if len(antes) != len(depois):
        print('  contagem divergiu')
