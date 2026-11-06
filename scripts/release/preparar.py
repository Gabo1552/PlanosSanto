"""Prepara la entrega de una versión ya verificada: RESULTADOS.json, RBZ reproducible, paquete y dist.

Uso: python3 scripts/release/preparar.py 0.8.31 --logs artifacts/bateria [--nota "..."] [--check clave=PASS]

Antes de correrlo:
  - la batería (scripts/release/bateria.sh) pasó entera y sus logs están en --logs;
  - docs/validacion-XXXX/CAMBIOS.md y VALIDACION_LOCAL.md ya están escritos;
  - dist/README.md ya tiene la entrada «# Entrega X.Y.Z» arriba de todo.
Hace: RESULTADOS.json con los conteos de los logs, dos builds con el mismo SHA, empaquetar.py
copiado de la versión anterior, el paquete en dist/, git rm de las versiones de dist que no
sean las dos últimas, la entrada vieja de dist/README.md y la línea «Candidata actual» de README.md.
No toca git más allá del git rm, no hace commit ni push.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = re.compile(r'^(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors', re.M)


def die(message: str) -> None:
    print(f'ERROR: {message}', file=sys.stderr)
    sys.exit(1)


def key(version: str) -> tuple[int, ...]:
    return tuple(int(p) for p in version.split('.'))


def docs_dir(version: str) -> Path:
    return ROOT / 'docs' / f"validacion-{version.replace('.', '')}"


def log(logs: Path, name: str) -> str:
    path = logs / f'{name}.log'
    if not path.is_file():
        die(f'falta el log {path}: corré scripts/release/bateria.sh primero')
    return path.read_text(errors='replace')


def ruby_totals(text: str, name: str) -> dict:
    rows = [tuple(map(int, m)) for m in RUNS.findall(text)]
    if not rows:
        die(f'{name}: no hay resúmenes de Minitest en el log')
    runs, asserts, failures, errors = (sum(r[i] for r in rows) for i in range(4))
    if failures or errors:
        die(f'{name}: {failures} fallas y {errors} errores')
    return {'runs': runs, 'assertions': asserts, 'failures': 0, 'errors': 0}


def playwright_totals(text: str, name: str) -> dict:
    if re.search(r'^\s*\d+ failed', text, re.M):
        die(f'{name}: hay pruebas fallidas')
    passed = re.findall(r'^\s*(\d+) passed', text, re.M)
    if not passed:
        die(f'{name}: no encontré «N passed»')
    return {'tests': int(passed[-1]), 'passed': int(passed[-1])}


def vitest_totals(text: str) -> dict:
    if re.search(r'Tests\s+.*\d+ failed', text):
        die('vitest: hay pruebas fallidas')
    m = re.search(r'Tests\s+(\d+) passed \((\d+)\)', text)
    if not m or m.group(1) != m.group(2):
        die('vitest: no encontré «Tests N passed (N)»')
    return {'tests': int(m.group(2)), 'passed': int(m.group(1))}


def build_sha(version: str) -> str:
    rbz = ROOT / f'artifacts/PlanosSanto-{version}.rbz'
    shas = []
    for _ in range(2):
        subprocess.run(['npm', 'run', '-s', 'build:offline'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
        shas.append(hashlib.sha256(rbz.read_bytes()).hexdigest())
    if shas[0] != shas[1]:
        die(f'el RBZ no es reproducible: {shas[0]} != {shas[1]}')
    return shas[0]


def dist_versions() -> list[str]:
    found = {m.group(1) for p in (ROOT / 'dist').glob('PlanosSanto-*-candidata.rbz')
             if (m := re.match(r'PlanosSanto-(\d+\.\d+\.\d+)-candidata\.rbz$', p.name))}
    return sorted(found, key=key)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('version')
    ap.add_argument('--logs', type=Path, default=ROOT / 'artifacts/bateria')
    ap.add_argument('--nota', action='append', default=[])
    ap.add_argument('--check', action='append', default=[], help='chequeo extra clave=VALOR')
    a = ap.parse_args()
    version = a.version
    if json.loads((ROOT / 'sketchup_offline/version.json').read_text())['version'] != version:
        die('version.json no coincide: corré scripts/release/bump-version.mjs primero')
    previous = [v for v in dist_versions() if key(v) < key(version)]
    if not previous:
        die('no hay una candidata anterior en dist/')
    prev = previous[-1]
    target = docs_dir(version)
    for doc in ('CAMBIOS.md', 'VALIDACION_LOCAL.md'):
        if not (target / doc).is_file():
            die(f'falta {target / doc}: escribilo antes de preparar')
    dist_readme = ROOT / 'dist/README.md'
    if not dist_readme.read_text().startswith(f'# Entrega {version} '):
        die(f'dist/README.md tiene que empezar con «# Entrega {version} — …»')

    logs = a.logs.resolve()
    for name in ('tsc', 'eslint', 'ruby27check', 'nextbuild'):
        log(logs, name)
    checks: dict = {
        'typecheck': 'PASS', 'lint': 'PASS', 'buildOffline': 'PASS', 'buildReproducible': 'PASS',
        'vitest': vitest_totals(log(logs, 'vitest')),
        'ruby33': ruby_totals(log(logs, 'ruby'), 'ruby'),
        'ruby27': ruby_totals(log(logs, 'ruby27suite'), 'ruby27suite'),
        'rubyExporter': ruby_totals(log(logs, 'rubyexporter'), 'rubyexporter'),
        'checkRuby27': 'PASS',
        'playwrightOfflineChromium141': playwright_totals(log(logs, 'playwright'), 'playwright'),
        'nextBuild': 'PASS',
        'playwrightWeb': playwright_totals(log(logs, 'web'), 'web'),
    }
    for extra in a.check:
        name, _, value = extra.partition('=')
        checks[name] = value or 'PASS'

    sha = build_sha(version)
    results = {
        'version': version, 'date': datetime.date.today().isoformat(), 'verificationPassed': True,
        'nativeSketchupExecuted': False, 'sketchup2022Executed': False, 'productionParityApproved': False,
        'rbzSha256': sha, 'checks': checks,
        'notes': a.nota or ['Pruebas con dobles de la API de SketchUp, no ejecución nativa.'],
    }
    (target / 'RESULTADOS.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')

    prev_doc, new_doc = docs_dir(prev).name, target.name
    packer = (docs_dir(prev) / 'empaquetar.py').read_text()
    if prev not in packer or prev_doc not in packer:
        die(f'{prev_doc}/empaquetar.py no tiene la versión {prev}')
    (target / 'empaquetar.py').write_text(packer.replace(prev_doc, new_doc).replace(prev, version))
    subprocess.run([sys.executable, '-I', str(target / 'empaquetar.py')], cwd=ROOT, check=True)

    keep = {version, prev}
    old = [p for p in (ROOT / 'dist').glob('PlanosSanto-*')
           if (m := re.match(r'PlanosSanto-(\d+\.\d+\.\d+)-', p.name)) and m.group(1) not in keep]
    if old:
        subprocess.run(['git', 'rm', '-q', *[str(p.relative_to(ROOT)) for p in old]], cwd=ROOT, check=True)
    dropped = sorted({re.match(r'PlanosSanto-(\d+\.\d+\.\d+)-', p.name).group(1) for p in old}, key=key)

    text = dist_readme.read_text()
    parts = text.split('\n---\n\n')
    kept = [p for p in parts if not any(p.startswith(f'# Entrega {v} ') for v in dropped)]
    text = '\n---\n\n'.join(kept)
    if dropped:
        text = re.sub(r'(candidatas 0\.8\.7 a )\d+\.\d+\.\d+', rf'\g<1>{dropped[-1]}', text)
    dist_readme.write_text(text)

    readme = ROOT / 'README.md'
    body = readme.read_text()
    line = re.compile(r'\*\*Candidata actual (\d+\.\d+\.\d+):\*\* \[RBZ\]\(dist/PlanosSanto-\1-candidata\.rbz\) · '
                      r'\[SHA256\]\(dist/PlanosSanto-\1-candidata\.rbz\.sha256\) · '
                      r'\[paquete de validación local\]\(dist/PlanosSanto-\1-Validacion-Local\.zip\) · '
                      r'\[qué cambió\]\(docs/(validacion-\d+)/CAMBIOS\.md\)')
    m = line.search(body)
    if not m:
        die('README.md: no encontré la línea «Candidata actual»')
    if m.group(1) != version:
        new = (f'**Candidata actual {version}:** [RBZ](dist/PlanosSanto-{version}-candidata.rbz) · '
               f'[SHA256](dist/PlanosSanto-{version}-candidata.rbz.sha256) · '
               f'[paquete de validación local](dist/PlanosSanto-{version}-Validacion-Local.zip) · '
               f'[qué cambió](docs/{new_doc}/CAMBIOS.md) · [{m.group(1)}](docs/{m.group(2)}/CAMBIOS.md)')
        readme.write_text(body[:m.start()] + new + body[m.end():])

    print(json.dumps({'version': version, 'rbzSha256': sha, 'previous': prev, 'removedFromDist': dropped,
                      'pendiente': 'escribir la frase de README.md sobre esta versión'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
