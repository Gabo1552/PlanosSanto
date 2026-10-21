import importlib.util, pathlib, unittest, json, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('check',ROOT/'scripts/verificar_entradas.py')
verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)
class IntegrityTest(unittest.TestCase):
    def test_baseline_and_corpus(self):self.assertTrue(verify.check())
    def test_manifest_version(self):
        with zipfile.ZipFile(ROOT/'referencias/PlanosSanto-0.6.8.rbz') as z:
            self.assertEqual(json.loads(z.read('planos_santo/manifest.json'))['version'],'0.6.8')
    def test_no_skps_outside_private(self):
        self.assertFalse(any(ROOT.glob('*.skp')))
