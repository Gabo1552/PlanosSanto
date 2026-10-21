#!/usr/bin/env python3
"""Verifica el baseline y las referencias privadas sin procesar modelos SketchUp."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_RBZ_SHA256 = '2b8d57bf8abf9623002e27ca2b93dc284ad78633cda2d83520a6b9a88da36eab'


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def check() -> dict:
    rbz = ROOT / 'baseline' / 'PlanosSanto-0.6.6.rbz'
    if not rbz.is_file() or sha256(rbz) != EXPECTED_RBZ_SHA256:
        raise ValueError('Baseline 0.6.6 faltante o modificado: restaurar copia original')
    with ZipFile(rbz) as z:
        manifest = json.loads(z.read('planos_santo/manifest.json'))
        if manifest.get('version') != '0.6.6':
            raise ValueError('Versión del baseline no coincide')
        files = manifest.get('files', {})
        for name, expected in files.items():
            if hashlib.sha256(z.read(name)).hexdigest() != expected:
                raise ValueError(f'Checksum interno inválido: {name}')
        required = {'planos_santo/names.rb', 'planos_santo/offline.rb',
                    'planos_santo/p1_diagnostics.rb', 'planos_santo/ui/app.js'}
        if not required.issubset(z.namelist()):
            raise ValueError('Faltan archivos de 0.6.6')
    files_index = ROOT / 'referencias_privadas' / 'datos' / 'indice_proyectos.json'
    items = json.loads(files_index.read_text(encoding='utf-8'))
    if len(items) != 9:
        raise ValueError('Se esperaban nueve modelos de referencia')
    total_names = 0
    for obj in items:
        path = ROOT / 'referencias_privadas' / 'modelos' / obj['archivo']
        if not path.is_file() or sha256(path) != obj['sha256'] or path.stat().st_size != obj['bytes']:
            raise ValueError(f'Modelo faltante o modificado: {obj["archivo"]}')
        total_names += obj.get('definiciones_nombres_detectados', 0)
    contract = json.loads((ROOT / 'referencias_privadas' / 'datos' / 'contrato_exportacion_maderera.json').read_text(encoding='utf-8'))
    if contract['columnas_orden'] != ['cant','base','altura','detalle','rota','canto_arr','canto_aba','canto_izq','canto_der']:
        raise ValueError('Formato del proveedor no coincide con el aportado')
    return {'version': '0.6.6', 'skp': len(items), 'definiciones_nombres': total_names,
            'archivos_baseline': len(files), 'contrato': contract['columnas_orden']}


def main() -> int:
    try:
        value = check()
        print(f"OK: baseline {value['version']}, {value['archivos_baseline']} archivos con hash, "
              f"{value['skp']} SKP íntegros, contrato TXT de 9 campos. No se ejecutó SketchUp.")
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        print(f'ERROR en integridad: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
