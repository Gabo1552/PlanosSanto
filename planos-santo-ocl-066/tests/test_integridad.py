from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('integrity', ROOT / 'scripts' / 'verify_integrity.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class BaselineTests(unittest.TestCase):
    def test_integridad_y_nueve_modelos(self):
        result = checker.check()
        self.assertEqual(result['skp'], 9)
        self.assertEqual(result['version'], '0.6.6')

    def test_nueve_columnas(self):
        self.assertEqual(len(checker.check()['contrato']), 9)

    def test_abrir_rbz_no_es_prueba_sketchup(self):
        self.assertIn('No se ejecutó SketchUp', Path(ROOT / 'scripts' / 'verify_integrity.py').read_text())


if __name__ == '__main__':
    unittest.main()
