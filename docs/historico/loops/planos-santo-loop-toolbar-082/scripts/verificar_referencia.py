#!/usr/bin/env python3
"""Audita SOLO la estructura/hash de la versión de referencia; NO valida SketchUp."""
from pathlib import Path
import zipfile,hashlib,json,sys
p=Path(__file__).resolve().parent.parent/'referencia'/'PlanosSanto-0.8.2-candidata.rbz'
if len(sys.argv)>1:p=Path(sys.argv[1])
with zipfile.ZipFile(p) as z:
    files=set(z.namelist())
    m=json.loads(z.read('planos_santo/manifest.json'))
    assert m['version']=='0.8.2',m['version']
    for name,sha in m['files'].items():
        assert name in files,f'falta {name}'
        digest=hashlib.sha256(z.read(name)).hexdigest()
        assert sha==digest,f'hash incorrecto {name}'
    ruby=[n for n in files if n.endswith('.rb')]
    assert len(ruby)>=15,len(ruby)
    offline=z.read('planos_santo/offline.rb').decode('utf-8')
    assert "UI::Toolbar.new('Planos Santo')" in offline
    assert "@offline_toolbar.add_item(command)" in offline
    for feature in ('smart_tool_start','smart_palette_compact','smart_tool_stop','paint_apply'):
        assert feature in offline,feature
    print(f'PASS: RBZ {m["version"]}; {len(m["files"])} hashes verificados; {len(ruby)} Ruby; toolbar actual de un botón confirmada. No valida SketchUp.')
