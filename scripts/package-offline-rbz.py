"""Package the local editor, preserving the legacy 0.3 archive and sources."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
build = root / 'sketchup_offline/build'
manifest = json.loads((build / 'planos_santo/manifest.json').read_text())
files = sorted([*manifest['files'], 'planos_santo/manifest.json'])
for name, digest in manifest['files'].items():
    path = build / name
    assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest
expected_files = {
    'planos_santo.rb',
    *('planos_santo/' + name for name in (
        'bootstrap.rb', 'offline.rb', 'p1_diagnostics.rb', 'release.rb',
        'ocl_reader.rb', 'catalog_store.rb', 'material_resolver.rb',
        'material_library.rb', 'photo_material.rb', 'material_policy.rb', 'native_paint.rb', 'paint_materials.rb', 'ocl_attributes.rb', 'smart_paint.rb', 'smart_paint_tool.rb', 'material_sample_tool.rb', 'quick_toolbar.rb', 'bounded_zip.rb', 'skm_import.rb', 'piece_highlight_tool.rb', 'supplier_order.rb',
        'workshop.rb', 'names.rb', 'session.rb', 'guide_store.rb', 'exporter.rb',
        'ui/index.html', 'ui/app.js', 'ui/app.css', 'ui/palette.html', 'ui/palette.js', 'ui/palette.css', 'icon-24.png', 'icon-32.png',
        'THIRD_PARTY_LICENSES.txt', 'manifest.json',
    )),
}
expected_files.update(f'planos_santo/icons/{action}-{size}.png' for action in ('sheet','edge','remove_edge','sample','furniture','order','guides','materials','main') for size in (24,32))
expected_files.update(f'planos_santo/cursors/paint-{key}.png' for key in ('piece','edge','remove','blocked'))
assert len(files) == 59 and set(files) == expected_files
assert all(not f.endswith(('.skp', '.jsonl')) for f in files)
assert manifest['version'] == json.loads((root / 'sketchup_offline/version.json').read_text())['version']
assert manifest['validation'] == 'PENDIENTE de ejecución y aceptación del operador en SketchUp 2026'
assert manifest['serverRequired'] is False
target = root / f"artifacts/PlanosSanto-{manifest['version']}.rbz"
# Include parent directories before their children for extractors that do not
# create missing parents. Use DOS attributes for the Windows target.
directories = sorted({str(parent) + '/' for name in files for parent in Path(name).parents if str(parent) != '.'}, key=lambda name: (name.count('/'), name))
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in directories:
        info = zipfile.ZipInfo(name, (2026, 10, 15, 0, 0, 0))
        info.create_system = 0
        info.external_attr = 0x10
        archive.writestr(info, b'')
    for name in files:
        info = zipfile.ZipInfo(name, (2026, 10, 15, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 0
        info.external_attr = 0x20
        archive.writestr(info, (build / name).read_bytes())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None and archive.namelist() == directories + files
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.rbz.sha256').write_text(f'{digest}  {target.name}\n')
print(f'{target.name}: {target.stat().st_size} bytes; SHA256 {digest}; {len(files)} archivos, {len(directories)} carpetas; ZIP CRC OK')
