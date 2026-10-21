"""Reproducible private-data-free handoff for native SketchUp validation."""
from pathlib import Path
import hashlib
import json
import zipfile
import os

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
VERSION = json.loads((ROOT / 'sketchup_offline/version.json').read_text())['version']
TAG = VERSION.replace('.', '')
KIND = os.environ.get('PLANOS_VALIDATION_KIND', 'paint')
assert KIND in {'paint', 'toolbar', 'ux', 'photo', 'flows', 'immediate'}, 'Unknown validation package kind'
PREFIX = {'toolbar':'toolbar', 'ux':'ux', 'paint':'pintado','photo':'fotos','flows':'flujos','immediate':'immediate'}[KIND]
DOCS = ROOT / ('docs/hotfix-pintura-087' if KIND=='immediate' else f'docs/loop-{PREFIX}-{TAG}')
STATE = json.loads((ART / f'validacion-{PREFIX}-{TAG}.json').read_text())
assert STATE['version'] == VERSION and STATE['verifyExitCode'] == 0
assert STATE['nativeSketchupExecuted'] is False

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def put(z, name, data):
    info = zipfile.ZipInfo(name, (2026, 10, 19, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 0
    info.external_attr = 0x20
    z.writestr(info, data)

candidate = ART / f'PlanosSanto-{VERSION}-candidata.rbz'
rbz = ART / f'PlanosSanto-{VERSION}.rbz'
assert sha(rbz) == STATE['rbzSha256']
candidate.write_bytes(rbz.read_bytes())
(ART / (candidate.name + '.sha256')).write_text(sha(candidate) + '  ' + candidate.name + '\n')
# Explicit source allowlist, never the entire workspace or uploaded reference package.
dirs = ['app', 'components', 'lib', 'native', 'public', 'scripts', 'sketchup', 'sketchup_offline', 'tests',
        'docs/loop-a4', 'docs/loop-a4-071', 'docs/loop-a4-072', 'docs/loop-a4-073',
        'planos-santo-ocl-066/scripts', 'planos-santo-loop-068/scripts', str(DOCS.relative_to(ROOT))]
if KIND == 'toolbar': dirs.append('planos-santo-loop-toolbar-082')
if KIND == 'ux': dirs.append('planos-santo-loop-ux-082')
if KIND == 'photo': dirs.append('planos-santo-loop-experiencia-084')
if KIND == 'flows': dirs.append('planos-santo-loop-ux-085')
files = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts',
         'eslint.config.mjs', 'playwright.config.ts', 'playwright.offline.config.ts', 'vitest.config.ts', '.gitignore']
paths = {p for d in dirs for p in (ROOT/d).rglob('*') if p.is_file()}
paths.update(ROOT/p for p in files if (ROOT/p).is_file())
excluded = {'build', '__pycache__', 'private', 'referencias_privadas', 'runs', 'evidencia_local', 'node_modules', '.next', '.git'}
paths = sorted(p for p in paths if not p.is_symlink() and not (set(p.relative_to(ROOT).parts) & excluded)
               and p.suffix.lower() not in {'.skp', '.rbz', '.zip', '.pyc', '.skm'}
               and not (KIND=='flows' and p.relative_to(ROOT).as_posix().startswith('planos-santo-loop-ux-085/ux/'))
               and not (KIND=='photo' and p.relative_to(ROOT).as_posix().startswith('planos-santo-loop-experiencia-084/ux/'))
               and not p.name.startswith('.env') and p.name not in {'inventario_materiales.json','inventario_materiales.csv'})
source_zip = ART/f'PlanosSanto-{VERSION}-fuentes-pruebas.zip'
legacy_fixture = ART/'PlanosSanto-0.5.3.rbz' if KIND in {'toolbar','ux','photo','flows','immediate'} else None
if legacy_fixture:
    # Frozen public product fixture required by warm_update_test, never a model.
    with zipfile.ZipFile(legacy_fixture) as fixture:
        assert fixture.testzip() is None
        assert not any(n.lower().endswith(('.skp','.skm')) for n in fixture.namelist())
with zipfile.ZipFile(source_zip, 'w') as z:
    for p in paths:
        put(z, p.relative_to(ROOT).as_posix(), p.read_bytes())
    if legacy_fixture:
        put(z, 'artifacts/PlanosSanto-0.5.3.rbz', legacy_fixture.read_bytes())
entries = {p.name:p for p in DOCS.iterdir() if p.is_file() and p.suffix in {'.md', '.rb', '.json'}}
entries['VALIDACION_LOCAL_POSTERIOR.md'] = DOCS/'VALIDACION_LOCAL_POSTERIOR.md'
entries['PROGRESO.md'] = DOCS/'PROGRESO.md'
for name in [candidate.name, candidate.name+'.sha256', source_zip.name, f'verify-{PREFIX}-{TAG}.log',
             f'validacion-{PREFIX}-{TAG}.json', f'{PREFIX}-{TAG}-changed-files.json', f'demo-a4-{TAG}.json', f'rbz-{PREFIX}-{TAG}.json',
             'A4-DEMO17-exterior-SINTETICO.pdf', 'A4-DEMO17-interior-SINTETICO.pdf', 'A4-DEMO17-both-SINTETICO.pdf']:
    entries[name] = ART/name
preview = ART/f'Pintura-Inteligente-{TAG}-SINTETICA.png'
if preview.is_file(): entries[preview.name] = preview
if KIND == 'toolbar':
    for name in [f'Barra-Rapida-{TAG}-Paleta-SINTETICA.png', f'Barra-Rapida-{TAG}-Iconos-ORIGINALES.png', f'toolbar-{TAG}-ui-targeted.log', f'toolbar-{TAG}-payload-diff.json', f'toolbar-{TAG}-reproduccion-fuentes.log']:
        path = ART/name
        if path.is_file(): entries[name] = path
    loop = ROOT/'planos-santo-loop-toolbar-082'
    for name in ['PROGRESO.md','BACKLOG.md','ESTADO.json','CRITERIOS_ACEPTACION.md','CONTRATO_DE_SEGURIDAD.md']:
        entries['loop-entrada/'+name] = loop/name
if KIND == 'ux':
    for path in sorted(ART.glob(f'ux-{TAG}-*')):
        if path.is_file() and path.suffix in {'.png','.json','.html','.log'}:
            entries[path.name] = path
    loop = ROOT/'planos-santo-loop-ux-082'
    for name in ['PROGRESO.md','BACKLOG.md','ESTADO.json','CRITERIOS.md','SEGURIDAD.md','VALIDACION_DOT_LOCAL.md']:
        entries['loop-entrada/'+name] = loop/name
if KIND == 'photo':
    for path in sorted(ART.glob(f'fotos-{TAG}-*')):
        if path.is_file() and path.suffix in {'.png','.json','.html','.log'}:
            entries[path.name] = path
    loop = ROOT/'planos-santo-loop-experiencia-084'
    for name in ['PROGRESO.md','BACKLOG.md','ESTADO.json','ACEPTACION.md','SEGURIDAD.md','VALIDACION_DOT_LOCAL.md']:
        entries['loop-entrada/'+name] = loop/name
if KIND == 'flows':
    for path in sorted(ART.glob(f'flujos-{TAG}-*')):
        if path.is_file() and path.suffix in {'.png','.json','.html','.log','.pdf'}:
            entries[path.name] = path
    loop=ROOT/'planos-santo-loop-ux-085'
    for name in ['PROGRESO.md','BACKLOG.md','ESTADO.json','ACEPTACION_Y_PRUEBAS.md','SEGURIDAD.md','VALIDACION_DOT_LOCAL.md']:
        entries['loop-entrada/'+name] = loop/name
if KIND == 'immediate':
    for path in sorted(ART.glob(f'immediate-{TAG}-*')):
        if path.is_file() and path.suffix in {'.png','.json','.html','.log','.pdf'}:
            entries[path.name] = path
for extra in [f'preferencias-{TAG}-reproduccion.log',f'verify-{PREFIX}-{TAG}-inicial.log']:
    if (ART/extra).is_file(): entries[extra] = ART/extra
assert all(p.is_file() for p in entries.values())
readme = f'''Planos Santo {VERSION} — CANDIDATA; PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026.
Instalar el RBZ, no este ZIP; cerrar todas las ventanas de SketchUp antes de actualizar.
Leer VALIDACION_LOCAL_POSTERIOR.md e IMPLEMENTACION_LISTA.md. No cargar parches del runner histórico.
Los PDF son demostraciones sintéticas, no resultados nativos ni modelos de clientes.
El ZIP de fuentes incluye artifacts/PlanosSanto-0.5.3.rbz SOLO como fixture de warm_update_test; no instalar esa versión antigua.
Fuentes y pruebas incluidas; npm ci, npm run verify. Requiere Node24, Ruby3.2+, Python3, Chromium y Poppler.
No se incluyen SKP privados, biblioteca comercial del taller ni texturas SKM privadas.
La nube no instaló la candidata en Windows. La aprobación visual y nativa corresponde a Codex local/Dot.
'''
suffix = {'toolbar':'Barra-Rapida','ux':'UIUX','paint':'Pintado','photo':'Fotos-Pintura','flows':'Flujos-Rapidos','immediate':'Pintura-Inmediata'}[KIND]
target = ART/f'PlanosSanto-{VERSION}-Validacion-Local-{suffix}.zip'
with zipfile.ZipFile(target, 'w') as z:
    put(z, 'LEER_PRIMERO.txt', readme.encode())
    put(z, 'SHA256SUMS.txt', ''.join(f'{sha(p)}  {name}\n' for name,p in sorted(entries.items())).encode())
    for name,p in sorted(entries.items()):
        put(z, name, p.read_bytes())
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert not any(n.lower().endswith(('.skp', '.skm')) for n in z.namelist())
    for name,p in entries.items():
        assert hashlib.sha256(z.read(name)).hexdigest() == sha(p)
print(json.dumps({'file':str(target.relative_to(ROOT)), 'sha256':sha(target), 'bytes':target.stat().st_size,
                  'sourceFiles':len(paths)+(1 if legacy_fixture else 0), 'nativeSketchupExecuted':False}, indent=2))
