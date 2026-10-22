#!/usr/bin/env python3
"""Offline read-only inspection of the uploaded RBZ baseline; not a SketchUp test."""
from __future__ import annotations
import hashlib,json,sys,zipfile
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
SRC=BASE/'referencias_privadas/PlanosSanto-0.8.5-candidata.rbz'
REFS=BASE/'REFERENCIAS_SHA256.json'
REQUIRED=['planos_santo.rb','planos_santo/offline.rb','planos_santo/names.rb',
 'planos_santo/guide_store.rb','planos_santo/supplier_order.rb',
 'planos_santo/smart_paint.rb','planos_santo/smart_paint_tool.rb',
 'planos_santo/photo_material.rb','planos_santo/material_policy.rb',
 'planos_santo/quick_toolbar.rb','planos_santo/ui/app.js','planos_santo/ui/app.css']
def sha_bytes(data):return hashlib.sha256(data).hexdigest()
def main():
 errors=[]
 try: sources=json.loads(REFS.read_text(encoding='utf-8'))
 except Exception as e:raise SystemExit(f'No se puede leer el inventario: {e}')
 for name,rec in sources.items():
  path=BASE/'referencias_privadas'/name
  if not path.is_file() or path.stat().st_size!=rec['bytes'] or sha_bytes(path.read_bytes())!=rec['sha256']:
   errors.append(f'Referencia alterada o ausente: {name}')
 if not SRC.is_file():raise SystemExit('\n'.join(errors)+f'\nNo existe {SRC}')
 with zipfile.ZipFile(SRC) as z:
  names=set(z.namelist())
  missing=[k for k in REQUIRED if k not in names]
  if missing:errors.append('Faltan módulos: '+', '.join(missing))
  obj=json.loads(z.read('planos_santo/manifest.json').decode('utf-8'))
  if obj.get('version')!='0.8.5':errors.append('Versión de referencia inesperada')
  counts={'files':0,'hashes_ok':0,'ruby':0,'icons':0}
  for fname,expected in obj['files'].items():
   counts['files']+=1
   if fname not in names:
    errors.append(f'Falta en RBZ {fname}');continue
   if sha_bytes(z.read(fname)) != expected:
    errors.append(f'Hash inválido {fname}');continue
   counts['hashes_ok']+=1
   if fname.endswith('.rb'):counts['ruby']+=1
   if '/icons/' in fname:counts['icons']+=1
  offline=z.read('planos_santo/offline.rb').decode('utf-8')
  checks={
   'foto_nativa': 'material_photo_create' in offline and 'photo_material' in offline,
   'barra_rapida': 'def quick_action(action)' in offline,
   'ventana_grande': 'width: 1440, height: 920' in offline,
   'reutilizar_nombre': 'names_apply' in offline,
   'pdf': "when 'pdf'" in offline,
   'ultimo_material': 'smart_settings' in offline,
  }
  for k,passed in checks.items():
   if not passed:errors.append(f'Punto de referencia inesperado: {k}')
 print(json.dumps({'base':'0.8.5','validation':'ESTATICA, NO SKETCHUP',
  'inventory':counts,'features_readonly':checks,'errors':errors},indent=2,ensure_ascii=False))
 return 1 if errors else 0
if __name__=='__main__':sys.exit(main())
