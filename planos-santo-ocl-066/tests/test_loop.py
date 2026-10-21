from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('runner', ROOT / 'scripts' / 'run_loop.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def report(state='working', changes=None, tests=None):
    return {'state': state, 'phase': 'P0', 'summary': 'Comprobación local',
            'changed_files': changes if changes is not None else ['PROGRESO.md'],
            'tests': tests if tests is not None else ['ruby -c'],
            'next_step': 'Seguir con P1', 'manual_checks': []}


class LoopContractTests(unittest.TestCase):
    def parse(self, value):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'r.json'
            path.write_text(json.dumps(value), encoding='utf-8')
            return runner.verify_report(path)

    def test_valid_working(self):
        self.assertEqual(self.parse(report())['state'], 'working')

    def test_valid_needs_user(self):
        self.assertEqual(self.parse(report('needs_user'))['state'], 'needs_user')

    def test_valid_blocked(self):
        self.assertEqual(self.parse(report('blocked'))['state'], 'blocked')

    def test_valid_done(self):
        self.assertEqual(self.parse(report('done'))['state'], 'done')

    def test_no_extras(self):
        data = report(); data['fake'] = True
        with self.assertRaises(ValueError): self.parse(data)

    def test_no_invented_state(self):
        with self.assertRaises(ValueError): self.parse(report('published'))

    def test_no_empty_cycle(self):
        with self.assertRaises(ValueError): self.parse(report(changes=[], tests=[]))

    def test_approval_cannot_be_repo_internal(self):
        # This checks path protection by the runner; acceptance must live outside the workspace.
        import os
        key = 'PLANOSSANTO_APPROVAL_FILE'
        original = os.environ.get(key)
        try:
            os.environ[key] = str(ROOT / 'PROGRESO.md')
            self.assertFalse(runner.approval_exists())
        finally:
            if original is None: os.environ.pop(key, None)
            else: os.environ[key] = original


if __name__ == '__main__':
    unittest.main()
