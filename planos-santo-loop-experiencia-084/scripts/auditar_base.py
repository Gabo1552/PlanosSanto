#!/usr/bin/env python3
"""Sólo auditoría estática de la referencia 0.8.4 y los 35 SKM, sin SketchUp."""
from pathlib import Path
import json,zipfile,hashlib,sys
ROOT=Path(__file__).resolve().parent.parent
rbz=ROOT/'referencias_privadas'/'PlanosSanto-0.8.4-candidata.rbz'
skmz=ROOT/'referencias_privadas'/'OpenCutList.zip'
assert rbz.is_file() and skmz.is_file(), 'Falta activo privado requerido'
with zipfile.ZipFile(rbz) as z:
    mf=json.loads(z.read('planos_santo/manifest.json'))
    assert mf['version']=='0.8.4',f"La referencia no es 0.8.4: {mf['version']}"
    for name,h in mf['files'].items():
        assert hashlib.sha256(z.read(name)).hexdigest()==h, f'hash incorrecto: {name}'
    names=set(z.namelist())
    for required in ['planos_santo/quick_toolbar.rb','planos_santo/material_library.rb','planos_santo/skm_import.rb','planos_santo/smart_paint.rb','planos_santo/ui/app.css']:
        assert required in names,required
    offline=z.read('planos_santo/offline.rb').decode()
    toolbar=z.read('planos_santo/quick_toolbar.rb').decode()
    actions=['materials','sheet','edge','remove_edge','sample','furniture','order','guides']
    assert all("'"+x+"'" in toolbar for x in actions), 'Acción de barra faltante'
    assert 'skm_preview' in offline and 'smart_tool_start' in offline
    photo_picker=any(x in offline for x in ('material_photo_pick','image_material_create','crear_material_foto'))
    manifest=len(mf['files'])
with zipfile.ZipFile(skmz) as z:
    mats=[i for i in z.infolist() if i.filename.lower().endswith('.skm') and not i.is_dir()]
    assert len(mats)==35,f'Se esperaban 35 SKM, hay {len(mats)}'
result={'reference_version':'0.8.4','reference_files':manifest,'skm_materials':len(mats),'smart_paint_present':True,'toolbar_actions':actions,'direct_photo_picker_detected':photo_picker,'sketchup_native_tests':'NO EJECUTADOS'}
print(json.dumps(result,ensure_ascii=False,indent=2))
