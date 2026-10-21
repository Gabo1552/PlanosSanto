"""Build a local handoff from the verified candidate. No SKP/private corpus included."""
from pathlib import Path
import hashlib, json, zipfile
root = Path(__file__).resolve().parents[1]
artifacts = root / 'artifacts'
version = json.loads((root / 'sketchup_offline/version.json').read_text())['version']
tag = version.replace('.', '')
status = json.loads((artifacts / f'validacion-a4-{tag}.json').read_text())
assert status['verification']['verifyExitCode'] == 0 and status['release']['version'] == version
docs = root / (f'docs/loop-a4-{tag}' if (root / f'docs/loop-a4-{tag}').is_dir() else 'docs/loop-a4')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def put(z, name, data):
    info = zipfile.ZipInfo(name, (2026, 10, 19, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0x20
    info.create_system = 0
    z.writestr(info, data)
source_dirs = ['app','components','lib','native','public','scripts','sketchup','sketchup_offline','tests','docs/loop-a4','docs/loop-a4-071','docs/loop-a4-072','docs/loop-a4-073']
source_files = ['package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','eslint.config.mjs','playwright.config.ts','playwright.offline.config.ts','vitest.config.ts','README.md','.gitignore','CODEX_STATUS.json']
sources = {p for d in source_dirs for p in (root / d).rglob('*') if p.is_file()}
sources.update(root / p for p in source_files if (root / p).is_file())
def allowed(p):
    rel = p.relative_to(root)
    return not p.is_symlink() and not any(s in rel.parts for s in ['build','__pycache__','private','node_modules','.next','.git']) and p.suffix.lower() not in ['.skp','.rbz','.zip','.pyc']
sources = sorted([p for p in sources if allowed(p)])
source_zip = artifacts / f'PlanosSanto-{version}-fuentes-pruebas.zip'
with zipfile.ZipFile(source_zip, 'w') as z:
    for p in sources: put(z, p.relative_to(root).as_posix(), p.read_bytes())
entries = {p.name:p for p in docs.iterdir() if p.is_file()}
for name in [f'PlanosSanto-{version}.rbz',f'PlanosSanto-{version}.rbz.sha256',source_zip.name,'A4-DEMO17-exterior-SINTETICO.pdf','A4-DEMO17-interior-SINTETICO.pdf','A4-DEMO17-both-SINTETICO.pdf','A4-DEMO17-both-SINTETICO.png','A4-exterior-SINTETICO.pdf',f'validacion-a4-{tag}.json', ('verify-a4-070-clean.log' if version=='0.7.0' else f'verify-a4-{tag}.log'),'a4-changed-files.json',f'demo-a4-{tag}.json']:
    entries[name] = artifacts / name
for name,p in entries.items(): assert p.is_file(), f'Falta evidencia: {name}'
readme = f'''Planos Santo {version} — CANDIDATA A4, no aceptación nativa.
Instalar el RBZ (no este ZIP). Cerrar todas las ventanas y reiniciar SketchUp.
Leer CODEX_LOCAL.md y CONTRATO_VISTAS.md. No ejecutar runners que parchean fuentes.
PDF de17piezas: sintéticos, NO son el BM17 real. A4-exterior-SINTETICO.pdf muestra flecha y nota.
El código y las pruebas están en fuentes-pruebas.zip; npm ci y npm run verify en un entorno de desarrollo con Node24, Ruby3.2+, Python3, Chromium y Poppler. La verificación completa se ejecutó en Linux; para SketchUp Windows usar CODEX_LOCAL.md.
No se incluyen modelos SKP privados ni datos de clientes. Algunos scripts de replay real requieren los privados originales y no forman parte del verify sintético.
La instalación, BM17 real, impresión y Undo nativo siguen pendientes.
'''
checksums = '\n'.join(f'{sha(p)}  {name}' for name,p in sorted(entries.items()))+'\n'
target = artifacts / f'PlanosSanto-{version}-Validacion-Local-A4.zip'
with zipfile.ZipFile(target, 'w') as z:
    put(z, 'LEER_PRIMERO.txt', readme.encode())
    put(z, 'SHA256SUMS.txt', checksums.encode())
    for name,p in sorted(entries.items()): put(z,name,p.read_bytes())
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert not any(n.lower().endswith('.skp') for n in z.namelist())
    for name,p in entries.items(): assert hashlib.sha256(z.read(name)).hexdigest() == sha(p)
print(json.dumps({'file':str(target.relative_to(root)),'bytes':target.stat().st_size,'sha256':sha(target),'sourceFiles':len(sources),'containsPrivateSkp':False,'sketchupAcceptance':False},indent=2))
