#!/usr/bin/env python3
"""Tests the executor with a fake codex in a temporary workspace. Never contacts Codex."""
import tempfile,shutil,subprocess,os,sys,json
from pathlib import Path
SOURCE=Path(__file__).resolve().parents[1]
def test(status_after):
 with tempfile.TemporaryDirectory(prefix='ps085-runner-') as temp:
  root=Path(temp)/'project'; loop=root/SOURCE.name
  shutil.copytree(SOURCE,loop,ignore=shutil.ignore_patterns('runs','*.tmp'))
  fake=root/'fakebin';fake.mkdir()
  f=fake/'codex'
  f.write_text('#!/bin/sh\n'
    'python3 -c "import json, pathlib; p=pathlib.Path(\'planos-santo-loop-ux-085/ESTADO.json\');s=json.loads(p.read_text());s[\'last_cycle\']+=1;s[\'state\']=\''+status_after+'\';p.write_text(json.dumps(s))"\n'
    'cat >/dev/null\n'
    'echo "simulación: sin código ni tests reales"\n',encoding='utf-8')
  f.chmod(0o755)
  env=os.environ.copy();env['PATH']=str(fake)+':'+env['PATH']
  result=subprocess.run(['bash',str(loop/'codex-loop.sh'),'3'],cwd=root,env=env,capture_output=True,text=True,timeout=30)
  if result.returncode!=0:raise AssertionError(result.stdout+'\n'+result.stderr)
  st=json.loads((loop/'ESTADO.json').read_text(encoding='utf-8'))
  assert st['last_cycle']==(3 if status_after=='CONTINUAR' else 1),(st,result.stdout)
  assert st['state']==status_after,st
  assert len(list((loop/'runs').glob('cycle_*_prompt.txt')))==st['last_cycle']
  print('OK',status_after,'ciclos:',st['last_cycle'])

if __name__=='__main__':
 for v in ('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO'):test(v)
 print('4 casos aprobados en entorno simulado, NO ejecución de Codex real')
