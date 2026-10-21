#!/usr/bin/env python3
"""Chequea sólo el CONTRATO SINTÁCTICO; no garantiza aceptación del proveedor."""
import argparse, re, sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

COLS=('cant','base','altura','detalle','rota','canto_arr','canto_aba','canto_izq','canto_der')
DECIMAL=re.compile(r'^(?:\d+)(?:\.\d{1,3})?$')

class FormatoError(ValueError):pass

def validate(raw:bytes):
    if not raw: raise FormatoError('Archivo vacío')
    if raw.startswith(b'\xef\xbb\xbf'): raise FormatoError('BOM no confirmado para este formato')
    try:text=raw.decode('utf-8')
    except UnicodeDecodeError as e:raise FormatoError('No se pudo decodificar como UTF-8: '+str(e))
    lines=text.splitlines()
    if any(not ln for ln in lines):raise FormatoError('Líneas vacías')
    result=[]
    for n,line in enumerate(lines,1):
        cols=line.split('\t')
        if len(cols)!=9:raise FormatoError(f'Línea {n}: se esperaban nueve columnas, hay {len(cols)}')
        cant,base,altura,detalle,rota,*edges=cols
        if not re.fullmatch(r'[1-9]\d*',cant):raise FormatoError(f'Línea {n}: cantidad inválida')
        for v,k in ((base,'base'),(altura,'altura')):
            if not DECIMAL.fullmatch(v) or Decimal(v)<=0:raise FormatoError(f'Línea {n}: {k} no es mm decimal positivo (máx 3 decimales)')
        if not detalle.strip() or any(ch in detalle for ch in ('\r','\n','\t')):raise FormatoError(f'Línea {n}: detalle inválido')
        if rota not in ('0','1'):raise FormatoError(f'Línea {n}: rota inválido')
        if any(e not in ('0','1','2') for e in edges):raise FormatoError(f'Línea {n}: cantos fuera de 0/1/2')
        result.append(cols)
    return result

if __name__=='__main__':
    pa=argparse.ArgumentParser(description='Validador sintáctico de pedido de maderera')
    pa.add_argument('archivo')
    args=pa.parse_args()
    try:
        rows=validate(Path(args.archivo).read_bytes())
        print(f'OK: {len(rows)} filas, 9 columnas, TAB, medidas mm; aprobación de proveedor pendiente.')
    except (OSError,FormatoError) as ex:
        print('ERROR:',ex,file=sys.stderr);sys.exit(2)
