from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
import run_loop

LOOP=SCRIPTS.parent


def make_status(state,artifact=None):
    return {'state':state,'summary':'Se completó la tarea','next_step':'Continuar','changed_files':[],
            'tests':['Prueba simulada, NO nativa'],'artifact_path':artifact,'blockers':[]}

class LoopTests(unittest.TestCase):
    def test_schema_states(self):
        for s in run_loop.STATES:
            self.assertEqual(run_loop.validate_report(make_status(s))['state'],s)
        with self.assertRaises(ValueError):run_loop.validate_report({'state':'done'})

    def test_candidate_path_blocks_traversal(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for item in ('../evil.rbz','/etc/pwd.rbz','bad.txt'):
                with self.subTest(item=item):
                    with self.assertRaises(ValueError):run_loop.candidate_path(root,item)

    def test_dry_run_without_codex(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(run_loop.run(['--dry-run','--project-dir',d]),0)

    def test_simulated_ready_for_sketchup_requires_package_and_report(self):
        # Simulate a completed loop. The RBZ is only a fixture to exercise
        # the packaging gate; this does NOT validate native painting.
        from test_package import make_candidate
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            candidate=root/'dist'/'PlanosSanto-0.7.4-candidata.rbz'
            candidate.parent.mkdir()
            make_candidate(candidate)
            report=LOOP/'reports'/'IMPLEMENTACION_LISTA.md'
            previous=report.read_bytes() if report.exists() else None
            report.write_text('Pruebas automáticas simuladas para el ejecutor; aún pendiente SketchUp 2026.\n' * 3,encoding='utf-8')
            def fake_run(cmd,**kwargs):
                if str(cmd[0])=='git':return subprocess.CompletedProcess(cmd,0,'true','')
                if '--output-last-message' in cmd:
                    out=Path(cmd[cmd.index('--output-last-message')+1])
                    out.parent.mkdir(parents=True,exist_ok=True)
                    out.write_text(json.dumps(make_status('ready_for_sketchup','dist/PlanosSanto-0.7.4-candidata.rbz')),encoding='utf-8')
                return subprocess.CompletedProcess(cmd,0,'mock','')
            runs=LOOP/'runs'
            old_files=set(runs.glob('*')) if runs.exists() else set()
            try:
                with patch.object(run_loop.shutil,'which',side_effect=lambda name: sys.executable if name in ('git',sys.executable) else None),\
                     patch.object(run_loop.subprocess,'run',side_effect=fake_run),\
                     patch.dict(os.environ,{'CODEX_EXECUTABLE':sys.executable}):
                    code=run_loop.run(['--max-cycles','1','--project-dir',d])
                self.assertEqual(code,0)
            finally:
                if previous is None: report.unlink(missing_ok=True)
                else: report.write_bytes(previous)
                for file in set(runs.glob('*'))-old_files:file.unlink()

    def test_simulated_two_cycles_stop_on_user_needed(self):
        with tempfile.TemporaryDirectory() as d:
            states=iter(['working','needs_input'])
            def fake_run(cmd,**kwargs):
                if str(cmd[0])=='git':return subprocess.CompletedProcess(cmd,0,'true','')
                out=Path(cmd[cmd.index('--output-last-message')+1]);out.parent.mkdir(parents=True,exist_ok=True)
                out.write_text(json.dumps(make_status(next(states))),encoding='utf-8')
                return subprocess.CompletedProcess(cmd,0,'fake codex','')
            runs=LOOP/'runs'
            old_files=set(runs.glob('*')) if runs.exists() else set()
            with patch.object(run_loop.shutil,'which',side_effect=lambda name: sys.executable if name in ('git',sys.executable) else None),\
                 patch.object(run_loop.subprocess,'run',side_effect=fake_run),\
                 patch.dict(os.environ,{'CODEX_EXECUTABLE':sys.executable}):
                code=run_loop.run(['--max-cycles','3','--project-dir',d])
            self.assertEqual(code,3)
            self.assertEqual(json.loads((runs/'latest.json').read_text())['state'],'needs_input')
            for file in set(runs.glob('*'))-old_files:file.unlink()

if __name__=='__main__':unittest.main()
