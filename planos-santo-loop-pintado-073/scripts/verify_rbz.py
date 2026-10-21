#!/usr/bin/env python3
"""Auditoría offline de estructura, hashes y sintaxis de una extensión RBZ."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

MANIFEST = 'planos_santo/manifest.json'
BASELINE_VERSION = (0, 7, 3)
MAX_MEMBERS = 500
MAX_TOTAL_UNCOMPRESSED = 100 * 1024 * 1024


class PackageError(Exception):
    pass


def parse_version(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise PackageError(f'Versión inválida: {value!r}')
    return tuple(map(int, value.split('.')))


def analyze(path: Path, *, min_version=None, baseline_paths=None, check_syntax=True):
    path = Path(path)
    if not path.is_file():
        raise PackageError(f'No existe: {path}')
    if path.suffix.lower() != '.rbz':
        raise PackageError('El paquete debe ser .rbz')
    try:
        archive = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as e:
        raise PackageError(f'Archivo RBZ inválido: {e}') from e

    with archive as z:
        entries = z.infolist()
        if len(entries) > MAX_MEMBERS:
            raise PackageError('Demasiados miembros en RBZ')
        paths = [e.filename for e in entries]
        if len(paths) != len(set(paths)):
            raise PackageError('Entradas duplicadas en el RBZ')
        total = 0
        for entry in entries:
            p = PurePosixPath(entry.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in entry.filename or entry.filename.startswith('/'):
                raise PackageError(f'Ruta no segura: {entry.filename}')
            if len(p.parts) > 12 or len(entry.filename) > 250:
                raise PackageError('Ruta del paquete demasiado profunda/larga')
            if ((entry.external_attr >> 16) & 0o170000) == stat.S_IFLNK:
                raise PackageError('Un RBZ no debe contener enlaces simbólicos')
            if entry.flag_bits & 0x1:
                raise PackageError('Un RBZ no debe estar cifrado')
            total += entry.file_size
        if total > MAX_TOTAL_UNCOMPRESSED:
            raise PackageError('RBZ supera el límite descomprimido')
        if z.testzip() is not None:
            raise PackageError('CRC incorrecto dentro de RBZ')
        if MANIFEST not in paths:
            raise PackageError(f'Falta {MANIFEST}')
        try:
            manifest = json.loads(z.read(MANIFEST))
        except (ValueError, UnicodeDecodeError) as e:
            raise PackageError(f'Manifiesto inválido: {e}') from e
        mapping = manifest.get('files')
        if not isinstance(mapping, dict) or not mapping:
            raise PackageError('Manifiesto sin inventario válido')
        if not isinstance(manifest.get('name'), str) or manifest['name'] != 'Planos Santo':
            raise PackageError('Nombre de extensión inesperado')
        version = parse_version(manifest.get('version'))
        if min_version is not None and version <= tuple(min_version):
            raise PackageError('El RBZ candidato debe tener versión posterior a la base')
        expected = set(mapping)
        actual = {e.filename for e in entries if not e.is_dir()} - {MANIFEST}
        if expected != actual:
            raise PackageError(f'Inventario inconsistente. Faltan: {sorted(expected-actual)}. Extra: {sorted(actual-expected)}')
        if baseline_paths is not None:
            missing = set(baseline_paths) - expected
            if missing:
                raise PackageError(f'Faltan archivos base: {sorted(missing)}')
        for name, digest in mapping.items():
            if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
                raise PackageError(f'Hash inválido en manifiesto: {name}')
            actual_hash = hashlib.sha256(z.read(name)).hexdigest()
            if actual_hash != digest:
                raise PackageError(f'Hash no coincide: {name}')
        syntax_results = []
        if check_syntax:
            executables = {'rb': shutil.which('ruby'), 'js': shutil.which('node')}
            with tempfile.TemporaryDirectory(prefix='ps-rbz-test-') as tmp:
                for name in sorted(mapping):
                    suffix = Path(name).suffix.lower().lstrip('.')
                    executable = executables.get(suffix)
                    if executable is None:
                        continue
                    file_path = Path(tmp) / Path(name).name
                    file_path.write_bytes(z.read(name))
                    command = [executable, '-c', str(file_path)] if suffix == 'rb' else [executable, '--check', str(file_path)]
                    try:
                        result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
                    except subprocess.TimeoutExpired as e:
                        raise PackageError(f'Timeout de sintaxis: {name}') from e
                    if result.returncode != 0:
                        raise PackageError(f'Error de sintaxis {name}: {result.stderr.strip() or result.stdout.strip()}')
                    syntax_results.append(name)
        return {
            'path': str(path),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'version': manifest['version'],
            'members': len(mapping),
            'syntax_checked': len(syntax_results),
            'syntax_skipped': check_syntax and (shutil.which('ruby') is None or shutil.which('node') is None),
            'files': sorted(mapping),
        }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Validación estática de Planos Santo RBZ')
    parser.add_argument('rbz', type=Path)
    parser.add_argument('--baseline', type=Path, help='Exigir todos los archivos del RBZ base')
    parser.add_argument('--candidate', action='store_true', help='Exigir versión > 0.7.3')
    parser.add_argument('--no-syntax', action='store_true')
    args = parser.parse_args(argv)
    try:
        base_paths = None
        if args.baseline:
            baseline = analyze(args.baseline, check_syntax=False)
            base_paths = baseline['files']
        result = analyze(args.rbz, min_version=BASELINE_VERSION if args.candidate else None,
                         baseline_paths=base_paths, check_syntax=not args.no_syntax)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except PackageError as e:
        print(f'RBZ RECHAZADO: {e}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
