"""Package verified 0.8.28 and synthetic evidence; never private source models."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[2]
version = json.loads((root / 'sketchup_offline/version.json').read_text())['version']
assert version == '0.8.28'
results = json.loads((root / 'docs/validacion-0828/RESULTADOS.json').read_text())
assert results['verificationPassed'] and not results['nativeSketchupExecuted']
source = root / f'artifacts/PlanosSanto-{version}.rbz'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == results['rbzSha256']
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    manifest = json.loads(z.read('planos_santo/manifest.json'))
    assert manifest['version'] == version
    assert len(manifest['files']) == 91
    for name, expected in manifest['files'].items():
        assert hashlib.sha256(z.read(name)).hexdigest() == expected
    assert not any(n.lower().endswith(('.skp', '.skm', '.jpg', '.jpeg')) for n in z.namelist())
target = root / f'dist/PlanosSanto-{version}-candidata.rbz'
shutil.copyfile(source, target)
target.with_suffix('.rbz.sha256').write_text(f'{digest}  {target.name}\n')
files = [target, target.with_suffix('.rbz.sha256'),
         *sorted(p for p in (root / 'docs/validacion-0828').rglob('*') if p.is_file()),
         root / 'docs/validacion-0811/verificar_0811_sketchup.rb']
package = root / f'dist/PlanosSanto-{version}-Validacion-Local.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in files:
        assert path.is_file() and path.suffix in {'.rbz', '.sha256', '.md', '.json', '.mjs', '.py', '.rb', '.png', '.pdf'}
        z.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
package.with_suffix('.zip.sha256').write_text(f'{hashlib.sha256(package.read_bytes()).hexdigest()}  {package.name}\n')
print(target.name, digest, package.name, sep='\n')
