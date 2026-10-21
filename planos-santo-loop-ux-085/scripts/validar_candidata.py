#!/usr/bin/env python3
"""Checks integrity and high-level regression of a *produced* RBZ; static only."""
import hashlib,json,sys,zipfile
from pathlib import Path
NECESSARY=['planos_santo.rb','planos_santo/offline.rb','planos_santo/names.rb',
 'planos_santo/photo_material.rb','planos_santo/material_policy.rb',
 'planos_santo/guide_store.rb','planos_santo/supplier_order.rb',
 'planos_santo/smart_paint_tool.rb','planos_santo/quick_toolbar.rb',
 'planos_santo/ui/app.js','planos_santo/ui/app.css']
def main():
 if len(sys.argv)!=2:print('Uso: python scripts/validar_candidata.py /ruta/nueva-candidata.rbz');return 2
 p=Path(sys.argv[1]);errs=[]
 if not p.is_file():print('Archivo no encontrado:',p);return 2
 with zipfile.ZipFile(p) as z:
  names=set(z.namelist())
  missing=[name for name in NECESSARY if name not in names]
  if missing:errs.extend('Falta: '+name for name in missing)
  if 'planos_santo/manifest.json' not in names:errs.append('Falta manifest.json')
  else:
   manifest=json.loads(z.read('planos_santo/manifest.json'))
   for name,digest in manifest.get('files',{}).items():
    if name not in names:errs.append('Falta archivo manifestado: '+name)
    elif hashlib.sha256(z.read(name)).hexdigest()!=digest:errs.append('Hash inválido: '+name)
   print('Versión reportada:',manifest.get('version'),'hashes esperados:',len(manifest.get('files',{})))
  if all(name in names for name in ('planos_santo/offline.rb','planos_santo/quick_toolbar.rb')):
   offline=z.read('planos_santo/offline.rb').decode('utf-8',errors='replace')
   toolbar=z.read('planos_santo/quick_toolbar.rb').decode('utf-8',errors='replace')
   for k,t in [('PDF',"when 'pdf'"),('Renombrado','names_apply'),('Pintado','smart_tool_start'),('Fotos','material_photo_create'),('Maderera','order_export')]:
    if t not in offline:errs.append(f'Regresión o refactor no documentado: {k}')
   if 'UI::Toolbar' not in toolbar:errs.append('No se encontró barra SketchUp')
 print('ERRORES:',len(errs));print('\n'.join(errs) if errs else 'Integridad estática OK. Faltan pruebas nativas y visuales.')
 return 1 if errs else 0
if __name__=='__main__':sys.exit(main())
