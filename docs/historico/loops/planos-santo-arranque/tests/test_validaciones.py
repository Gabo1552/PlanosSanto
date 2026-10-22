import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
spec = importlib.util.spec_from_file_location("pedido", SCRIPTS / "validar_pedido_txt.py")
pedido = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pedido
spec.loader.exec_module(pedido)


class PedidoMadereraTests(unittest.TestCase):
    def test_ejemplo_realiza_validacion_sintactica(self):
        archivo = Path(__file__).resolve().parents[1] / "fixtures" / "pedido_ejemplo.txt"
        self.assertEqual(pedido.validar_archivo(archivo), [])

    def test_faltan_columnas(self):
        self.assertTrue(any("9 campos" in e for e in pedido.validar_filas("1\t100\t200\tA\t0")))

    def test_izquierda_precede_derecha_en_contrato(self):
        self.assertEqual(pedido.CAMPOS[7:], ("canto_izq", "canto_der"))

    def test_canto_fuera_de_rango(self):
        errores = pedido.validar_filas("1\t100\t200\tA\t0\t0\t0\t3\t0")
        self.assertTrue(any("canto_izq" in e for e in errores))

    def test_cantidad_no_decimal(self):
        self.assertTrue(any("cant" in e for e in pedido.validar_filas("1.5\t100\t200\tA\t0\t0\t0\t0\t0")))

    def test_decimal_de_milimetros(self):
        self.assertEqual(pedido.validar_filas("2\t764.5\t450.25\tA\t0\t1\t0\t2\t0"), [])

    def test_nan_y_cero_bloqueados(self):
        for base in ("NaN", "Infinity", "0", "-20", "20,5"):
            with self.subTest(base=base):
                self.assertTrue(pedido.validar_filas(f"1\t{base}\t100\tA\t0\t0\t0\t0\t0"))

    def test_rotacion_no_valida(self):
        self.assertTrue(any("rota" in e for e in pedido.validar_filas("1\t100\t200\tA\t2\t0\t0\t0\t0")))

    def test_sin_encabezado(self):
        cabecera = "\t".join(pedido.CAMPOS)
        self.assertTrue(pedido.validar_filas(cabecera))

    def test_bom_no_permitido_por_defecto(self):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "ejemplo.txt"
            path.write_bytes(b"\xef\xbb\xbf" + b"1\t100\t200\tA\t0\t0\t0\t0\t0")
            self.assertTrue(any("BOM" in e for e in pedido.validar_archivo(path)))

    def test_vacio(self):
        self.assertTrue(pedido.validar_filas(""))


if __name__ == "__main__":
    unittest.main()
