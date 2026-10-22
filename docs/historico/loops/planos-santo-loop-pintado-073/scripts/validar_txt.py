#!/usr/bin/env python3
"""Validador básico de sintaxis del TXT de la maderera (NO valida aceptación del proveedor)."""
from __future__ import annotations
import argparse
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys

COLUMNS = ['cant','base','altura','detalle','rota','canto_arr','canto_aba','canto_izq','canto_der']

class TxtError(ValueError):
    pass


def validate_text(content: str, *, allow_header: bool = False):
    lines = content.splitlines()
    if not lines:
        raise TxtError('TXT vacío')
    validated = []
    for index, line in enumerate(lines, 1):
        if not line.strip():
            raise TxtError(f'Línea {index}: vacía')
        cells = line.split('\t')
        if allow_header and index == 1 and cells == COLUMNS:
            continue
        if len(cells) != 9:
            raise TxtError(f'Línea {index}: se necesitan exactamente nueve columnas separadas por TAB')
        if cells == COLUMNS:
            raise TxtError('Encabezado no habilitado: verificar si la maderera lo acepta')
        try:
            n = int(cells[0])
            if n <= 0 or str(n) != cells[0]:
                raise ValueError
        except ValueError:
            raise TxtError(f'Línea {index}: cantidad no válida')
        for pos in (1, 2):
            if not cells[pos] or ',' in cells[pos]:
                raise TxtError(f'Línea {index}: medida vacía o separador decimal no confirmado')
            try:
                value = Decimal(cells[pos])
            except InvalidOperation as e:
                raise TxtError(f'Línea {index}: medida inválida') from e
            if not value.is_finite() or not (0 < value <= 100000):
                raise TxtError(f'Línea {index}: medida fuera de rango')
        if not cells[3].strip() or len(cells[3]) > 160:
            raise TxtError(f'Línea {index}: detalle vacío o muy largo')
        if cells[4] not in ('0', '1'):
            raise TxtError(f'Línea {index}: rota debe ser 0 o 1')
        if any(v not in ('0','1','2') for v in cells[5:]):
            raise TxtError(f'Línea {index}: códigos de canto inválidos')
        validated.append(cells)
    if not validated:
        raise TxtError('No hay piezas')
    return {'rows': len(validated), 'pieces': sum(int(row[0]) for row in validated)}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('file',type=Path)
    parser.add_argument('--allow-header',action='store_true')
    args=parser.parse_args(argv)
    try:
        result=validate_text(args.file.read_text(encoding='utf-8-sig'),allow_header=args.allow_header)
    except (TxtError,OSError,UnicodeError) as e:
        print(f'RECHAZADO: {e}',file=sys.stderr)
        return 1
    print(f'VÁLIDO SINTÁCTICAMENTE: {result["rows"]} filas / {result["pieces"]} piezas; no implica aceptación del proveedor.')
    return 0


if __name__=='__main__':
    sys.exit(main())
