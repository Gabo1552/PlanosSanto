"""Private-data-free source, tests and native-validation handoff for Hito 1 fixes."""
from pathlib import Path
import hashlib, io, json, zipfile
ROOT = Path(__file__).resolve().parents[1]
ART = ROOT/'artifacts'; DIST=ROOT/'dist'; DOCS=ROOT/'docs/hito1-correcciones-089'
version=json.loads((ROOT/'sketchup_offline/version.json').read_text())['version']
assert version=='0.8.9'
state=json.loads((DOCS/'RESULTADO.json').read_text())
assert state['verificationPassed'] and not state['productionApproved'] and not state['nativeSketchupExecuted']
def sha(data):return hashlib.sha256(data).hexdigest()
def put(z,name,data):
    entry=zipfile.ZipInfo(name,(2026,10,21,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.create_system=0;entry.external_attr=0x20;z.writestr(entry,data)
def audit(data,depth=0):
    assert depth<=3
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        for name in z.namelist():
            p=Path(name);assert not p.is_absolute() and '..' not in p.parts
            assert not set(p.parts)&{'private','referencias_privadas','referencias','runs','evidencia_local','node_modules','.git','.next'}
            assert p.suffix.lower() not in {'.skp','.skm'}
            if p.suffix.lower() in {'.zip','.rbz'}:audit(z.read(name),depth+1)
rbz=ART/f'PlanosSanto-{version}.rbz';assert sha(rbz.read_bytes())==state['rbzSha256'];audit(rbz.read_bytes())
DIST.mkdir(exist_ok=True)
candidate=DIST/f'PlanosSanto-{version}-candidata.rbz';candidate.write_bytes(rbz.read_bytes())
checksum=candidate.with_suffix('.rbz.sha256');checksum.write_text(sha(candidate.read_bytes())+'  '+candidate.name+'\n')
files={}
allowed={'app','components','lib','native','public','scripts','sketchup','sketchup_offline','tests','docs','.claude'}
root_files={'README.md','.gitignore','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','eslint.config.mjs','playwright.config.ts','playwright.offline.config.ts','vitest.config.ts'}
source_dirs=sorted(allowed)+['planos-santo-ocl-066/scripts','planos-santo-loop-068/scripts']
paths=[str(path.relative_to(ROOT)) for folder in source_dirs for path in (ROOT/folder).rglob('*') if path.is_file()]
paths+=sorted(root_files)
for name in sorted(set(paths)):
    if not name:continue
    p=Path(name);local=ROOT/p
    if not local.is_file() or local.is_symlink():continue
    if p.parts[0] not in allowed and name not in root_files and not name.startswith(('planos-santo-ocl-066/scripts/','planos-santo-loop-068/scripts/')):continue
    if set(p.parts)&{'private','referencias_privadas','referencias','runs','evidencia_local','node_modules','build','__pycache__'}:continue
    if p.suffix.lower() in {'.skp','.skm','.rbz','.zip','.pyc'} or p.name.startswith('.env'):continue
    files[name]=local.read_bytes()
# Public historical product fixture for warm_update_test; never install it.
files['artifacts/PlanosSanto-0.5.3.rbz']=(ART/'PlanosSanto-0.5.3.rbz').read_bytes()
source=ART/f'PlanosSanto-{version}-fuentes-pruebas.zip'
with zipfile.ZipFile(source,'w') as z:
    for name,data in sorted(files.items()):put(z,name,data)
audit(source.read_bytes())
entries={candidate.name:candidate.read_bytes(),checksum.name:checksum.read_bytes(),source.name:source.read_bytes()}
for path in DOCS.rglob('*'):
    if path.is_file():entries[path.relative_to(DOCS).as_posix()]=path.read_bytes()
for path in ART.glob('hito1-089-*'):
    if path.is_file() and path.suffix in {'.log','.json','.png','.pdf'} and path.name!='hito1-089-paquete.json':entries['evidencias/'+path.name]=path.read_bytes()
entries['LEER_PRIMERO.txt']=('Planos Santo0.8.9 — CANDIDATA, CORRECCIONES HITO1. NO HITO2.\nInstalar RBZ tras cerrar TODAS las ventanas de SketchUp, no el ZIP.\nLeer VALIDACION_LOCAL.md. No cargar parches ni runner088 sobre la candidata.\nEVIDENCIA_LOCAL_088.md es INFORME TEXTUAL RECIBIDO, no binarios locales.\nPruebas/capturas/perfiles nube usan dobles y datos sintéticos. No SketchUp.\nFuentes: npm ci; npm run build:offline; npm run test:offline:ruby; npm run typecheck; npm run lint; npm run test; npm run test:offline:ui.\nNode24, Ruby3.2+, Python3, Chromium/Poppler. Fixture0.5.3 solo para warm_update_test, NO instalar.\nSin modelos, fotos ni biblioteca comercial privados. Producción NO aprobada.\n').encode()
entries['SHA256SUMS.txt']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
target=DIST/f'PlanosSanto-{version}-Validacion-Local-Hito1-Correcciones.zip'
with zipfile.ZipFile(target,'w') as z:
    for name,data in sorted(entries.items()):put(z,name,data)
audit(target.read_bytes())
print(json.dumps({'file':str(target.relative_to(ROOT)),'sha256':sha(target.read_bytes()),'bytes':target.stat().st_size,'sourceFiles':len(files),'rbzSha256':sha(rbz.read_bytes()),'nativeSketchupExecuted':False,'productionApproved':False},indent=2))
