from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('pedido_validator', ROOT / 'scripts' / 'validar_pedido_txt.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

LINE = '1\t700\t450\tM01 - Lateral izquierdo\t0\t1\t0\t0\t0'


class ContratoMadereraTests(unittest.TestCase):
    def test_columnas_exactas(self):
        self.assertEqual(len(validator.CAMPOS), 9)
        self.assertEqual(tuple(validator.CAMPOS), ('cant','base','altura','detalle','rota','canto_arr','canto_aba','canto_izq','canto_der'))

    def test_fila_valida(self):
        self.assertEqual(validator.validar_filas(LINE), [])

    def test_usa_ocho_tabs(self):
        self.assertEqual(LINE.count('\t'), 8)

    def test_dos_filas(self):
        self.assertEqual(validator.validar_filas(LINE+'\n'+LINE.replace('1\t700', '2\t764.5', 1)), [])

    def test_cantidad_debe_ser_entero_positivo(self):
        for value in ('0', '-1', '1.5', ''):
            with self.subTest(value=value):
                self.assertTrue(validator.validar_filas(LINE.replace('1\t700', value+'\t700', 1)))

    def test_medidas_decimal(self):
        self.assertEqual(validator.validar_filas(LINE.replace('700\t450', '700.5\t450.25')), [])

    def test_medidas_invalidas(self):
        for value in ('0', '-3', 'abc', 'nan', 'Inf', '700,5', ''):
            with self.subTest(value=value):
                self.assertTrue(validator.validar_filas(LINE.replace('700', value, 1)))

    def test_rotacion(self):
        self.assertEqual(validator.validar_filas(LINE.replace('\t0\t1\t0\t0\t0', '\t1\t1\t0\t0\t0')), [])
        self.assertTrue(validator.validar_filas(LINE.replace('\t0\t1\t0\t0\t0', '\t2\t1\t0\t0\t0')))

    def test_cantos_tres_roles(self):
        self.assertEqual(validator.validar_filas(LINE.replace('\t1\t0\t0\t0', '\t2\t1\t0\t2')), [])
        self.assertTrue(validator.validar_filas(LINE.replace('\t1\t0\t0\t0', '\t3\t0\t0\t0')))

    def test_sin_columna_espesor(self):
        self.assertTrue(validator.validar_filas(LINE + '\t18'))

    def test_no_encabezado(self):
        header = '\t'.join(validator.CAMPOS)
        self.assertTrue(validator.validar_filas(header))

    def test_no_filas_vacias(self):
        self.assertTrue(validator.validar_filas(LINE + '\n\n' + LINE))

    def test_no_bom(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'a.txt'
            path.write_bytes(b'\xef\xbb\xbf' + LINE.encode('utf-8'))
            self.assertTrue(validator.validar_archivo(path))

    def test_utf8_sin_bom(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'a.txt'
            path.write_bytes(LINE.encode('utf-8'))
            self.assertEqual(validator.validar_archivo(path), [])

    def test_contrato_importado(self):
        c = json.loads((ROOT / 'referencias_privadas' / 'datos' / 'contrato_exportacion_maderera.json').read_text())
        self.assertEqual(tuple(c['columnas_orden']), tuple(validator.CAMPOS))

    def test_ejemplo(self):
        self.assertEqual(validator.validar_archivo(ROOT / 'fixtures' / 'pedido_ejemplo.txt'), [])


if __name__ == '__main__':
    unittest.main()
