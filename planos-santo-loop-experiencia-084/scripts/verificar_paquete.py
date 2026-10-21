#!/usr/bin/env python3
from pathlib import Path
import json,subprocess,sys
ROOT=Path(__file__).resolve().parent.parent
required=['README.md','PROMPT_CODEX.md','BACKLOG.md','CONTRATO_IMAGEN_MATERIAL.md','REFERENCIAS_OPENCUTLIST.md','ACEPTACION.md','ESTADO.json','INSTRUCCION_CLOUD.md','VALIDACION_DOT_LOCAL.md','ux/PROTOTIPO.html']
for name in required:assert (ROOT/name).is_file(),name
state=json.loads((ROOT/'ESTADO.json').read_text(encoding='utf-8'))
assert state['state'] in ('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO')
assert isinstance(state['last_cycle'],int) and state['last_cycle']>=0
subprocess.run([sys.executable,str(ROOT/'scripts/auditar_base.py')],check=True)
print('Paquete OK; ningún test nativo de SketchUp ejecutado.')
