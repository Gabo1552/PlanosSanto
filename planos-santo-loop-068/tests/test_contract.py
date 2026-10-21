import importlib.util, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('validador',ROOT/'scripts/validar_txt_maderera.py')
validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)

class ContractTest(unittest.TestCase):
    def test_fixture(self):
        self.assertEqual(len(validator.validate((ROOT/'fixtures/ejemplo_sintetico.txt').read_bytes())),2)
    def test_cols(self):
        valid=b'1\t700\t450\tM01 - Lateral\t0\t1\t0\t0\t2\n'
        for v in [valid.replace(b'\t0\t1\t0\t0\t2',b'\t0\t1\t0\t2'),valid+b'\n',b'cant\tbase\taltura\tdetalle\trota\tcanto_arr\tcanto_aba\tcanto_izq\tcanto_der\n',valid.replace(b'\t700\t',b'\t-1\t'),valid.replace(b'\t700\t',b'\t700.1234\t'),valid.replace(b'\t0\t1\t0\t0\t2',b'\t3\t1\t0\t0\t2'),valid.replace(b'\t0\t1\t0\t0\t2',b'\t0\t1\t0\t0\t3'),b'\xef\xbb\xbf'+valid]:
            with self.subTest(data=v[:30]):self.assertRaises(validator.FormatoError,validator.validate,v)
    def test_valid_edges_and_decimals(self):
        self.assertEqual(len(validator.validate(b'2\t700.125\t450.5\tPieza 2\t1\t0\t1\t2\t0\r\n')),1)
