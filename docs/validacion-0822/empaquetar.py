"""Package only the candidate, public validation docs/tests and synthetic evidence."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[2]
version = json.loads((root / 'sketchup_offline/version.json').read_text())['version']
assert version == '0.8.22'
result = json.loads((root / 'docs/validacion-0822/RESULTADOS.json').read_text())
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
    assert not any(name.lower().endswith(('.skp', '.skm', '.jpg', '.jpeg')) for name in archive.namelist())
target = root / f'dist/PlanosSanto-{version}-candidata.rbz'
shutil.copyfile(source, target)
target.with_suffix('.rbz.sha256').write_text(f'{digest}  {target.name}\n')
files = [target, target.with_suffix('.rbz.sha256'),
         *sorted((root / 'docs/validacion-0822').rglob('*')),
         *sorted((root / 'artifacts/validacion-0822').glob('*.log')),
         root / 'docs/validacion-0811/verificar_0811_sketchup.rb',
         root / 'tests/experto-optimizer.test.ts', root / 'tests/sheet-optimizer.test.ts',
         root / 'tests/general-optimizer-invariants.test.ts',
         root / 'tests/fixtures/experto/reference.json', root / 'tests/fixtures/general-reference-cases.ts',
         root / 'tests/offline/maderera-placas.spec.ts', root / 'tests/offline/optimizer-material-navigation.spec.ts',
         root / 'sketchup_offline/test/maderera_placas_test.rb',
         root / 'scripts/generate-experto-reference.py', root / 'scripts/compare-general-ocl.ts',
         root / 'scripts/compare-general-ocl.rb']
files = sorted(set(file for file in files if file.is_file()))
assert all(file.suffix.lower() in {'.rbz', '.sha256', '.md', '.json', '.py', '.ts', '.rb', '.png', '.log'} for file in files)
package = root / f'dist/PlanosSanto-{version}-Validacion-Local.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 10, 24, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
print(json.dumps({'rbz': target.name, 'rbzSha256': digest, 'package': package.name,
                  'packageSha256': hashlib.sha256(package.read_bytes()).hexdigest(), 'files': len(files)}))
