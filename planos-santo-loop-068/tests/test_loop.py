import importlib.util, json, os, pathlib, shutil, subprocess, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('loop',ROOT/'scripts/run_loop.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class LoopTest(unittest.TestCase):
    def test_check_json(self):
        ok={'cycle':1,'status':'CONTINUE','summary':'ok','changedFiles':[],'tests':[],'blockers':[],'nextAction':'next','userAction':'','needsSketchupValidation':True}
        self.assertEqual(module.check_response(ok,1)['status'],'CONTINUE')
        with self.assertRaises(ValueError):module.check_response(ok,2)
    def test_dryrun(self):
        p=subprocess.run([sys.executable,str(ROOT/'scripts/run_loop.py'),'--dry-run','--max-cycles','2'],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('NO se ejecutó Codex',p.stdout)
    def test_manual_gate_default_closed(self):
        self.assertFalse((ROOT/'manual/validacion_usuario.json').exists())
        self.assertFalse(module.manual_ok())
