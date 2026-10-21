#!/usr/bin/env python3
"""Local evidence helper; requires pypdf. Does not claim visual acceptance."""
import argparse, json
from pathlib import Path
from pypdf import PdfReader
parser = argparse.ArgumentParser()
parser.add_argument('pdf', type=Path)
parser.add_argument('--pages', type=int, required=True)
parser.add_argument('--contains', action='append', default=[])
args = parser.parse_args()
r = PdfReader(args.pdf)
assert len(r.pages) == args.pages, 'Cantidad de páginas distinta de la aprobada'
texts = []
for page in r.pages:
    w, h = float(page.mediabox.width)*25.4/72, float(page.mediabox.height)*25.4/72
    assert abs(w-297)<0.01 and abs(h-210)<0.01, f'No es A4 horizontal: {w}x{h}'
    texts.append(page.extract_text())
text = '\n'.join(texts)
for value in args.contains:
    assert value in text, f'Falta texto esperado: {value}'
print(json.dumps({'file': str(args.pdf), 'pages': len(r.pages), 'size_mm': [297,210], 'expected_text_present': True, 'visual_acceptance': False}, ensure_ascii=False, indent=2))
