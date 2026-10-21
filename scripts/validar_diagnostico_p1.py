#!/usr/bin/env python3
"""Read-only validation of local P1 observations. Never certifies fabrication data."""
import json
import math
from pathlib import Path
import sys

MAX_BYTES = 30 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def vector(value, length):
    require(isinstance(value, list) and len(value) == length, 'Vector/matriz inválido')
    require(all(type(n) in (int, float) and math.isfinite(n) for n in value), 'Número no finito/inválido')


def unique_ids(rows):
    require(isinstance(rows, list), 'Se esperaba una lista')
    keys = [row['id'] for row in rows]
    require(all(isinstance(key, str) and key for key in keys), 'ID vacío/inválido')
    require(len(keys) == len(set(keys)), 'Identificadores repetidos')
    return set(keys)


def validate(data):
    require(data['schema'] == 'planos-santo.diagnostic.v1', 'Contrato de diagnóstico desconocido')
    require(type(data['complete']) is bool and data['production_ready'] is False, 'Estado inválido')
    require(data['units']['positions'] == 'mm' and data['units']['matrix_translation'] == 'mm', 'Unidades incorrectas')
    require(data['units']['matrix_basis'] == 'dimensionless' and data['units']['matrix_order'] == 'column_major', 'Convención matricial incorrecta')
    materials = unique_ids(data['materials'])
    definition_ids = unique_ids(data['definitions'])
    paths = {}
    for instance in data['instances']:
        path = instance['path']
        require(isinstance(path, list) and path and all(isinstance(p, str) and p for p in path), 'Ruta de instancia inválida')
        key = tuple(path)
        require(key not in paths and instance['parent_path'] == path[:-1] and instance['persistent_id'] == path[-1], 'Identidad física/parentesco inválido')
        require(instance['definition_id'] in definition_ids, 'Definición ausente')
        for field in ('local_transform', 'world_transform'):
            vector(instance[field], 16)
        for field in ('material_id', 'inherited_material_id', 'effective_material_id'):
            require(instance[field] is None or instance[field] in materials, 'Material de instancia ausente')
        if instance['axis_lengths_mm'] is not None:
            vector(instance['axis_lengths_mm'], 3)
            require(all(n >= 0 for n in instance['axis_lengths_mm']), 'Dimensiones negativas')
        require(instance['edge_mapping_confirmed'] is False, 'Cantos confirmados sin validación nativa')
        paths[key] = instance
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for key, instance in paths.items():
        require(len(key) == 1 or key[:-1] in paths, 'Ancestro ausente')
        parent = paths[key[:-1]]['world_transform'] if len(key) > 1 else identity
        local = instance['local_transform']
        expected = [sum(parent[k*4 + i % 4] * local[(i//4)*4 + k] for k in range(4)) for i in range(16)]
        require(all(math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-6) for a, b in zip(expected, instance['world_transform'])), 'Transformación mundial incoherente')
    for geometry in [data['root_geometry']] + [d['geometry'] for d in data['definitions']]:
        if geometry is None:
            require(not data['complete'], 'Geometría ausente en recorrido completo')
            continue
        face_ids = unique_ids(geometry['faces'])
        edge_ids = unique_ids(geometry['edges'])
        for face in geometry['faces']:
            vertices = face['vertices_mm']
            for point in vertices:
                vector(point, 3)
            for triangle in face['triangles']:
                require(isinstance(triangle, list) and len(triangle) == 3 and all(type(i) is int and 0 <= i < len(vertices) for i in triangle), 'Triángulo inválido')
            require(set(face['edge_ids']) <= edge_ids, 'Arista de cara ausente')
            for loop in face['loops']:
                require(type(loop['outer']) is bool, 'Loop inválido')
                for point in loop['vertices_mm']:
                    vector(point, 3)
            for field in ('front_material_id', 'back_material_id'):
                require(face[field] is None or face[field] in materials, 'Material de cara ausente')
        for edge in geometry['edges']:
            vector(edge['start_mm'], 3)
            vector(edge['end_mm'], 3)
            require(set(edge['face_ids']) <= face_ids, 'Cara adyacente ausente')
            require(edge['material_id'] is None or edge['material_id'] in materials, 'Material de arista ausente')
    return {'schema': data['schema'], 'complete': data['complete'], 'instances': len(paths),
            'definitions': len(definition_ids), 'materials_used': len(materials),
            'production_ready': False, 'native_measurements_verified': False}


def main():
    try:
        require(len(sys.argv) == 2, 'Uso: python3 scripts/validar_diagnostico_p1.py informe.json')
        source = Path(sys.argv[1])
        require(source.stat().st_size <= MAX_BYTES, 'Archivo demasiado grande')
        result = validate(json.loads(source.read_text(encoding='utf-8-sig')))
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['complete'] else 2
    except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError):
        print('Diagnóstico no válido o ilegible. No se modificó ningún archivo.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
