#!/usr/bin/env python3
"""Validador estrictamente sintáctico del TXT tabulado para la maderera.

NO valida la orientación física del canto ni que el archivo sea aceptado por
el proveedor. Debe ejecutarse una prueba manual en la página de la maderera.
"""
from __future__ import annotations
import argparse
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys

CAMPOS = (
    "cant", "base", "altura", "detalle", "rota",
    "canto_arr", "canto_aba", "canto_izq", "canto_der"
)


def validar_filas(texto: str) -> list[str]:
    """Devuelve lista de errores. No inventa datos faltantes ni reordena cantos."""
    errores: list[str] = []
    if "\x00" in texto:
        errores.append("Archivo binario o nulos presentes")
    filas = texto.splitlines()
    if not filas:
        return ["Archivo sin filas"]
    if len(filas) == 1 and not filas[0].strip():
        return ["Archivo vacío"]
    for n, fila in enumerate(filas, 1):
        if not fila.strip():
            errores.append(f"Línea {n}: fila vacía")
            continue
        campos = fila.split("\t")
        if len(campos) != 9:
            errores.append(f"Línea {n}: se requieren 9 campos separados por 8 TAB, hay {len(campos)}")
            continue
        cant, base, altura, detalle, rota, *cantos = campos
        if not cant.isdecimal() or int(cant or 0) < 1:
            errores.append(f"Línea {n}: cant debe ser entero >= 1")
        for label, dato in (("base", base), ("altura", altura)):
            try:
                # Punto decimal provisional; no se asume que el proveedor admita coma.
                if "," in dato or dato.strip() != dato or not dato:
                    raise ValueError
                valor = Decimal(dato)
                if not valor.is_finite() or valor <= 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                errores.append(f"Línea {n}: {label} debe ser mm decimal positivo (punto decimal provisional)")
        if not detalle.strip() or "\r" in detalle or "\n" in detalle:
            errores.append(f"Línea {n}: detalle vacío o inválido")
        if rota not in ("0", "1"):
            errores.append(f"Línea {n}: rota solo admite 0 o 1")
        for campo, valor in zip(CAMPOS[5:], cantos):
            if valor not in ("0", "1", "2"):
                errores.append(f"Línea {n}: {campo} solo admite 0/1/2")
    return errores


def validar_archivo(archivo: Path) -> list[str]:
    try:
        data = archivo.read_bytes()
    except OSError as exc:
        return [f"No se pudo leer el archivo: {type(exc).__name__}"]
    # Codificación provisional y sin encabezado (pendiente de prueba proveedor).
    if data.startswith(b"\xef\xbb\xbf"):
        return ["Archivo con BOM UTF-8: usar UTF-8 sin BOM por defecto"]
    try:
        texto = data.decode("utf-8")
    except UnicodeDecodeError:
        return ["Codificación distinta de UTF-8 (provisional)"]
    return validar_filas(texto)


def main() -> int:
    parser = argparse.ArgumentParser(description="Revisar estructura de TXT tabulado para proveedor")
    parser.add_argument("archivo", type=Path)
    args = parser.parse_args()
    errores = validar_archivo(args.archivo)
    if errores:
        for err in errores:
            print("ERROR:", err, file=sys.stderr)
        return 2
    print("OK: estructura TXT de 9 columnas, campos y tipos válidos (NO verifica cantos físicos ni aceptación web).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
