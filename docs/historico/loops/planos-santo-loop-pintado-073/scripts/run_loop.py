#!/usr/bin/env python3
"""Ejecutor opcional de ciclos no interactivos Codex CLI; cloud UI usa INSTRUCCION_CLOUD.md."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_rbz import analyze, PackageError, BASELINE_VERSION

STATES = {'working', 'needs_input', 'blocked', 'ready_for_sketchup'}
REQUIRED_REPORT_FIELDS = {'state','summary','next_step','changed_files','tests','artifact_path','blockers'}


def validate_report(data):
    if not isinstance(data,dict) or set(data)!=REQUIRED_REPORT_FIELDS:
        raise ValueError('Reporte con campos faltantes o inesperados')
    if data['state'] not in STATES:
        raise ValueError('Estado de ciclo no reconocido')
    if any(not isinstance(data[f],str) for f in ('summary','next_step')):
        raise ValueError('Texto de ciclo inválido')
    for f in ('changed_files','tests','blockers'):
        if not isinstance(data[f],list) or any(not isinstance(x,str) for x in data[f]):
            raise ValueError(f'Campo {f} inválido')
    if data['artifact_path'] is not None and not isinstance(data['artifact_path'],str):
        raise ValueError('artifact_path debe ser ruta o null')
    return data


def candidate_path(root:Path, value:str):
    if not value or not value.endswith('.rbz'):
        raise ValueError('El estado ready_for_sketchup exige artifact_path a un RBZ')
    p=Path(value)
    if p.is_absolute() or '..' in p.parts:
        raise ValueError('Ruta de candidata no permitida')
    target=(root/p).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('RBZ fuera del repositorio')
    return target


def run(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--max-cycles',type=int,default=6)
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--project-dir',type=Path)
    parser.add_argument('--model',default=os.environ.get('CODEX_MODEL',''))
    parser.add_argument('--reasoning',choices=['medium','high','xhigh'],default='high')
    parser.add_argument('--timeout-minutes',type=int,default=40)
    args=parser.parse_args(argv)
    if not 1<=args.max_cycles<=30 or not 1<=args.timeout_minutes<=120:
        parser.error('Máximo 1–30 ciclos y timeout de 1–120 minutos')
    loop_dir=Path(__file__).resolve().parent.parent
    root=(args.project_dir or loop_dir.parent).resolve()
    if not root.is_dir():
        print('Falta la carpeta del proyecto',file=sys.stderr);return 5
    ref=loop_dir/'referencias'/'PlanosSanto-0.7.3.rbz'
    try:
        baseline=analyze(ref,check_syntax=False)
        if baseline['version']!='0.7.3':
            raise PackageError('La referencia no es 0.7.3')
    except PackageError as exc:
        print(f'La referencia está dañada: {exc}',file=sys.stderr);return 5
    if args.dry_run:
        print(f'PRECHECK OK: {baseline["version"]}; {baseline["members"]} archivos, {baseline["sha256"]}')
        print('La opción dry-run no ejecuta Codex ni modifica fuentes.')
        return 0
    codex=os.environ.get('CODEX_EXECUTABLE','codex')
    if not (shutil.which(codex) or Path(codex).is_file()):
        print('No está disponible Codex CLI. En Codex nube usá INSTRUCCION_CLOUD.md.',file=sys.stderr)
        return 5
    if not (loop_dir/'PROMPT_CODEX.md').is_file() or not (loop_dir/'SCHEMA_RESPONSE.json').is_file():
        print('Faltan documentos de ejecución',file=sys.stderr);return 5
    git_check=subprocess.run(['git','-C',str(root),'rev-parse','--is-inside-work-tree'],capture_output=True,text=True) if shutil.which('git') else None
    if git_check is None or git_check.returncode!=0:
        print('AVISO: No hay Git detectado; Codex debe realizar un respaldo antes de escribir.',file=sys.stderr)
    run_dir=loop_dir/'runs'
    run_dir.mkdir(exist_ok=True)
    session=dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    base_prompt=(loop_dir/'PROMPT_CODEX.md').read_text(encoding='utf-8')
    for cycle in range(1,args.max_cycles+1):
        cycle_id=f'{session}-ciclo-{cycle:03d}'
        report_path=run_dir/f'{cycle_id}.json'
        log_path=run_dir/f'{cycle_id}.log'
        latest=run_dir/'latest.json'
        prompt=base_prompt+f'''\n\nCICLO {cycle}/{args.max_cycles}. Revisá TAREAS.md, PROGRESO.md, el último JSON de runs/latest.json si existe, y cualquier error del ciclo anterior. Elegí el pendiente prioritario, implementalo, ejecutá pruebas automatizadas y registrá resultados. Si estás listo para validación nativa, empaquetá la candidata RBZ con manifiesto íntegro y guardá tu informe en planos-santo-loop-pintado-073/reports/IMPLEMENTACION_LISTA.md. Declarar ready_for_sketchup NO es aprobar SketchUp. Emití solo JSON conforme al esquema.\n'''
        cmd=[codex,'exec','-C',str(root),'--sandbox','workspace-write','--ask-for-approval','never','--config',f'model_reasoning_effort={args.reasoning}','--output-schema',str(loop_dir/'SCHEMA_RESPONSE.json'),'--output-last-message',str(report_path)]
        if args.model:
            cmd.extend(['--model',args.model])
        cmd.append('-')
        print(f'== Ciclo {cycle}/{args.max_cycles} ==',flush=True)
        try:
            completed=subprocess.run(cmd,input=prompt,text=True,capture_output=True,timeout=args.timeout_minutes*60,check=False,cwd=root)
        except subprocess.TimeoutExpired as e:
            log_path.write_text((str(e.stdout or '')+'\n'+str(e.stderr or ''))[:200000],encoding='utf-8',errors='replace')
            print(f'Ciclo excedió {args.timeout_minutes} minutos: {log_path}',file=sys.stderr)
            return 4
        log_path.write_text((completed.stdout+'\n'+completed.stderr)[-250000:],encoding='utf-8')
        if completed.returncode!=0:
            print(f'Codex devolvió {completed.returncode}: {log_path}',file=sys.stderr)
            return 5
        if not report_path.is_file():
            print(f'Falta reporte JSON: {log_path}',file=sys.stderr)
            return 5
        try:
            status=validate_report(json.loads(report_path.read_text(encoding='utf-8')))
        except (json.JSONDecodeError,ValueError) as e:
            print(f'Reporte inválido: {e}',file=sys.stderr)
            return 5
        latest.write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'{status["state"]}: {status["summary"]}',flush=True)
        if status['state']=='working':
            continue
        if status['state']=='needs_input':
            print('Se requiere información o aprobación del usuario, revisá runs/latest.json.')
            return 3
        if status['state']=='blocked':
            print('Bloqueo técnico; revisá PROGRESO.md y runs/latest.json.')
            return 4
        try:
            target=candidate_path(root,status['artifact_path'])
            analyzed=analyze(target,min_version=BASELINE_VERSION,baseline_paths=baseline['files'],check_syntax=True)
            evidence=loop_dir/'reports'/'IMPLEMENTACION_LISTA.md'
            if not evidence.is_file() or len(evidence.read_text(encoding='utf-8').strip())<100:
                raise ValueError('Falta informe de implementación y pruebas (mínimo 100 caracteres)')
        except (ValueError,PackageError,OSError) as e:
            print(f'Candidata no verificable: {e}. Registrar corrección en próximo ciclo.',file=sys.stderr)
            (run_dir/'verification_failed.txt').write_text(str(e),encoding='utf-8')
            continue
        (run_dir/'verification_failed.txt').unlink(missing_ok=True)
        print(f'LISTO PARA VALIDAR en SketchUp, NO APROBADO PARA PRODUCCIÓN: {analyzed["version"]} / {target}')
        return 0
    print(f'Se completaron {args.max_cycles} ciclos sin candidata verificable. Reanudar el loop más adelante.')
    return 2


if __name__=='__main__':
    sys.exit(run())
