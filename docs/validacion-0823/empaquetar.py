"""Package public candidate and synthetic verification evidence only."""
from pathlib import Path
import hashlib, json, shutil, zipfile
root = Path(__file__).resolve().parents[2]
version = json.loads((root / 'sketchup_offline/version.json').read_text())['version']
assert version == '0.8.23'
results = json.loads((root / 'docs/validacion-0823/RESULTADOS.json').read_text())
assert results['verificationPassed'] and not results['productionApproved'] and not results['nativeSketchupExecuted']
source = root / f'artifacts/PlanosSanto-{version}.rbz'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert results['rbzSha256'] == digest
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    manifest = json.loads(z.read('planos_santo/manifest.json'))
    assert manifest['version'] == version
    for name, expected in manifest['files'].items():
        assert hashlib.sha256(z.read(name)).hexdigest() == expected
    assert not any(name.lower().endswith(('.skp', '.skm', '.jpg', '.jpeg')) for name in z.namelist())
target = root / f'dist/PlanosSanto-{version}-candidata.rbz'
shutil.copyfile(source, target)
target.with_suffix('.rbz.sha256').write_text(f'{digest}  {target.name}\n')
files = [target, target.with_suffix('.rbz.sha256'),
         *sorted((root / 'docs/validacion-0823').rglob('*')),
         root / 'docs/validacion-0811/verificar_0811_sketchup.rb',
         root / 'sketchup_offline/test/model_material_catalog_test.rb',
         root / 'sketchup_offline/test/controller_model_material_test.rb',
         root / 'tests/offline/model-material-ficha.spec.ts',
         root / 'tests/offline/cutlist-model-material.spec.ts']
files = sorted(set(file for file in files if file.is_file()))
package = root / f'dist/PlanosSanto-{version}-Validacion-Local.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in files:
        assert file.suffix in {'.rbz', '.sha256', '.md', '.json', '.py', '.rb', '.ts', '.png'}
        z.write(file, file.relative_to(root).as_posix())
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
package.with_suffix('.zip.sha256').write_text(f'{hashlib.sha256(package.read_bytes()).hexdigest()}  {package.name}\n')
print(target, digest, package, sep='\n')
