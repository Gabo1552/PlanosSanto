from __future__ import annotations
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from verify_rbz import analyze, PackageError, parse_version, BASELINE_VERSION

BASE = Path(__file__).resolve().parents[1] / 'referencias' / 'PlanosSanto-0.7.3.rbz'


def make_candidate(dest: Path, *, version: str = '0.7.4', delete=None, inject=None, corrupt=None):
    with zipfile.ZipFile(BASE) as z:
        content = {i.filename: z.read(i.filename) for i in z.infolist() if not i.is_dir()}
    manifest = json.loads(content['planos_santo/manifest.json'])
    manifest['version'] = version
    if delete:
        del content[delete]
        del manifest['files'][delete]
    if inject:
        content[inject[0]] = inject[1]
        # when malicious injection tested, omit from manifest intentionally
    content['planos_santo/manifest.json'] = json.dumps(manifest).encode()
    if corrupt:
        content[corrupt] += b'CHANGED'
    with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as out:
        for name, data in content.items():
            out.writestr(name, data)


class PackageTests(unittest.TestCase):
    def test_original_package_integrity_and_version(self):
        result=analyze(BASE, check_syntax=False)
        self.assertEqual(result['version'],'0.7.3')
        self.assertEqual(result['members'],19)
        self.assertEqual(len(result['sha256']),64)

    def test_reject_old_candidate(self):
        with self.assertRaises(PackageError):
            analyze(BASE,min_version=BASELINE_VERSION,check_syntax=False)

    def test_accept_reversioned_candidate_with_same_inventory(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.rbz'
            make_candidate(p)
            base=analyze(BASE,check_syntax=False)
            result=analyze(p,min_version=BASELINE_VERSION,baseline_paths=base['files'],check_syntax=False)
            self.assertEqual(result['version'],'0.7.4')

    def test_reject_tampered_file(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.rbz'
            make_candidate(p, corrupt='planos_santo/release.rb')
            with self.assertRaisesRegex(PackageError,'Hash no coincide'):
                analyze(p,check_syntax=False)

    def test_reject_missing_baseline_file(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.rbz'
            make_candidate(p,delete='planos_santo/guide_store.rb')
            old=analyze(BASE,check_syntax=False)
            with self.assertRaisesRegex(PackageError,'Faltan archivos base'):
                analyze(p,baseline_paths=old['files'],check_syntax=False)

    def test_reject_unknown_extra(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.rbz'
            make_candidate(p,inject=('planos_santo/unknown.rb',b'# hello'))
            with self.assertRaisesRegex(PackageError,'Inventario inconsistente'):
                analyze(p,check_syntax=False)

    def test_reject_zip_slip(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.rbz'
            make_candidate(p,inject=('../danger.rb',b'bad'))
            with self.assertRaisesRegex(PackageError,'Ruta no segura'):
                analyze(p,check_syntax=False)

    def test_version_validation(self):
        self.assertEqual(parse_version('0.7.4'),(0,7,4))
        for invalid in ('v0.7.4','0.7.4-beta','0.7',None):
            with self.subTest(invalid=invalid):
                with self.assertRaises(PackageError):parse_version(invalid)

if __name__=='__main__':unittest.main()
