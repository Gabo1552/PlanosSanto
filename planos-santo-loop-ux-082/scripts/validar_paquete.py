#!/usr/bin/env python3
"""Verifica las referencias locales (sin instalar SketchUp ni aprobar materiales)."""
import hashlib, json, sys
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
base=Path(__file__).resolve().parents[1]
ref=base/'referencias_privadas'
data=json.loads((base/'inventario_materiales.json').read_text(encoding='utf-8'))
assert data['total_skm']==35
assert len(data['materiales'])==35
assert len({x['archivo'] for x in data['materiales']})==35
assert sum(x['candidato_tipo_por_nombre']=='canto' for x in data['materiales'])==12
with ZipFile(ref/'OpenCutList.zip') as z:
  for item in data['materiales']:
    blob=z.read(item['archivo']);assert hashlib.sha256(blob).hexdigest()==item['sha256']
    with ZipFile(BytesIO(blob)) as skm:
      ET.fromstring(skm.read('document.xml'))
      assert item['contiene_miniatura']==('doc_thumbnail.png' in skm.namelist())
      assert not item['aprobado_para_produccion']
with ZipFile(ref/'PlanosSanto-0.8.2-candidata.rbz') as z:
 assert 'planos_santo/offline.rb' in z.namelist()
 assert 'planos_santo/catalog_store.rb' in z.namelist()
 assert 'planos_santo/smart_paint_tool.rb' in z.namelist()
assert len(list(ref.glob('image(20261020-*.png')))==3
print('OK: 35 SKM, 12 cantos candidatos, 0 aprobados, 3 capturas, RBZ 0.8.2, hashes y XML SKM.')
