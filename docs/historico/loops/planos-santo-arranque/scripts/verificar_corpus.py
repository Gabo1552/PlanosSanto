#!/usr/bin/env python3
"""Valida en modo lectura los 9 archivos SKP privados y sus hashes de referencia."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parents[1] / "referencias_privadas"


def validate(base: Path = BASE) -> tuple[bool, str]:
    index = base / "datos" / "indice_proyectos.json"
    if not index.is_file():
        return False, "Falta índice del corpus de modelos"
    try:
        rows = json.loads(index.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return False, f"Índice ilegible: {type(exc).__name__}"
    if not isinstance(rows, list) or len(rows) != 9:
        return False, "Se esperaban exactamente nueve SKP en el índice"
    visited = set()
    total_bytes = 0
    for row in rows:
        filename = row.get("archivo")
        if not isinstance(filename, str) or filename in visited or filename in ("", ".", ".."):
            return False, "Nombre o ruta duplicada/inválida en el índice"
        if Path(filename).name != filename or "/" in filename or "\\" in filename:
            return False, "El índice contiene una ruta no permitida"
        visited.add(filename)
        path = base / "modelos" / filename
        if not path.is_file():
            return False, "Faltan archivos SKP del corpus"
        size = path.stat().st_size
        if size != row.get("bytes"):
            return False, "El tamaño de un SKP no coincide con el manifiesto"
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != row.get("sha256"):
            return False, "Hash SHA256 de un SKP incorrecto"
        total_bytes += size
    return True, f"OK: {len(rows)} SKP comprobados; {total_bytes:,} bytes; sin lectura geométrica."


if __name__ == "__main__":
    good, report = validate()
    print(report)
    sys.exit(0 if good else 2)
