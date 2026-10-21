#!/usr/bin/env python3
"""Chequeo offline del corpus (9 SKP) y RBZ 0.6.8; no ejecuta SketchUp."""
from pathlib import Path
import sys, json, hashlib, zipfile

ROOT=Path(__file__).resolve().parents[1]

def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def check():
    index=json.loads((ROOT/'referencias'/'INDEX.json').read_text(encoding='utf-8'))
    base=ROOT/'referencias'/index['baseline']['archivo']
    assert base.is_file() and sha256(base)==index['baseline']['sha256'], 'Falta RBZ o hash incorrecto'
    with zipfile.ZipFile(base) as z:
        assert z.testzip() is None, 'ZIP RBZ corrupto'
        manifest=json.loads(z.read('planos_santo/manifest.json'))
        assert manifest['version']=='0.6.8', 'Versión baseline inesperada'
        for name, digest in manifest['files'].items():
            assert hashlib.sha256(z.read(name)).hexdigest()==digest, 'Archivo RBZ alterado: '+name
    models=index['models']
    assert len(models)==9 and len(set(m['nombre'] for m in models))==9, 'El corpus debe tener nueve archivos únicos'
    for m in models:
        p=ROOT/'referencias'/'privado'/'modelos'/m['nombre']
        assert p.is_file() and p.stat().st_size==m['bytes'] and sha256(p)==m['sha256'], 'Modelo faltante o modificado: '+m['nombre']
    print('OK: RBZ 0.6.8 y 9 SKP coinciden con la integridad registrada.')
    return True

if __name__=='__main__':
    try:check()
    except (AssertionError,OSError,KeyError,ValueError,zipfile.BadZipFile) as e:
        print('ERROR DE INTEGRIDAD:',str(e),file=sys.stderr);sys.exit(2)
