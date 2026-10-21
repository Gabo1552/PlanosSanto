from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from validar_txt import validate_text, TxtError, COLUMNS

class TxtTests(unittest.TestCase):
    ok='2\t764\t450\tM01 - Estante\t1\t1\t0\t2\t0\n1\t700.5\t450\tM02 - Costado derecho\t0\t0\t0\t1\t1\n'

    def test_valid_export(self):
        self.assertEqual(validate_text(self.ok),{'rows':2,'pieces':3})

    def test_tab_required(self):
        with self.assertRaises(TxtError):validate_text(self.ok.replace('\t',','))

    def test_reject_incorrect_side_count(self):
        with self.assertRaises(TxtError):validate_text('1\t200\t100\tLateral\t1\t0\t0\t1\n')

    def test_reject_undefined_edge_role(self):
        with self.assertRaises(TxtError):validate_text('1\t200\t100\tLateral\t1\t0\t0\t3\t0')

    def test_reject_undefined_rotate(self):
        with self.assertRaises(TxtError):validate_text('1\t200\t100\tLateral\t2\t0\t0\t1\t0')

    def test_reject_bad_dimension(self):
        for value in ('0','-1','abc','NaN','250,5'):
            with self.subTest(value=value):
                with self.assertRaises(TxtError):validate_text(f'1\t{value}\t100\tLateral\t1\t0\t0\t1\t0')

    def test_empty_name_rejected(self):
        with self.assertRaises(TxtError):validate_text('1\t200\t100\t\t1\t0\t0\t1\t0')

    def test_header_requires_explicit_setting(self):
        content='\t'.join(COLUMNS)+'\n'+self.ok
        with self.assertRaises(TxtError):validate_text(content)
        self.assertEqual(validate_text(content,allow_header=True)['rows'],2)

    def test_accents_accepted(self):
        self.assertEqual(validate_text('1\t1200\t600\tM03 - División cajón\t0\t2\t2\t0\t0')['pieces'],1)

if __name__=='__main__':unittest.main()
