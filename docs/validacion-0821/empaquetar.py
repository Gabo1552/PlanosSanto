"""Paquete reproducible de la candidata 0.8.21 y su validación pública; no incluye modelos ni materiales privados."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[2]
version = json.loads((root / 'sketchup_offline/version.json').read_text())['version']
assert version == '0.8.21', 'Este paquete corresponde a la entrega 0.8.21.'
result = json.loads((root / 'docs/validacion-0821/RESULTADOS.json').read_text())
assert result['verificationPassed'] and not result['nativeSketchupExecuted'] and not result['productionApproved']
source = root / f'artifacts/PlanosSanto-{version}.rbz'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == result['rbzSha256']
with zipfile.ZipFile(source) as archive:
    assert archive.testzip() is None
    manifest = json.loads(archive.read('planos_santo/manifest.json'))
    assert manifest['version'] == version
    for name, expected in manifest['files'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == expected
    assert not any(name.lower().endswith(('.skp', '.skm')) for name in archive.namelist())
target = root / f'dist/PlanosSanto-{version}-candidata.rbz'
shutil.copyfile(source, target)
target.with_suffix('.rbz.sha256').write_text(f'{digest}  {target.name}\n')
files = [target, target.with_suffix('.rbz.sha256'),
         *sorted((root / 'docs/validacion-0821').glob('*')),
         *sorted((root / 'artifacts/validacion-0821').glob('*.log')),
         root / 'docs/validacion-0811/verificar_0811_sketchup.rb',
         root / 'sketchup_offline/test/order_pdf_fixture.rb',
         root / 'tests/pdf-txt-edge-contract.test.ts', root / 'tests/front-autohide.test.ts',
         root / 'artifacts/PlanosSanto-0.8.21-DEMO-cantos.pdf', root / 'artifacts/PlanosSanto-0.8.21-DEMO-cantos.txt', root / 'artifacts/PlanosSanto-0.8.21-DEMO-cantos.png']
files = sorted(file for file in files if file.is_file())
assert all(file.suffix.lower() in {'.rbz', '.sha256', '.md', '.json', '.py', '.ts', '.rb', '.pdf', '.txt', '.png', '.log'} for file in files)
package = root / f'dist/PlanosSanto-{version}-Validacion-Local.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 10, 23, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
print(json.dumps({'rbz': target.name, 'rbzSha256': digest, 'package': package.name,
                  'packageSha256': hashlib.sha256(package.read_bytes()).hexdigest(), 'files': len(files)}))
