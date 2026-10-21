#!/usr/bin/env python3
"""Loop seguro y finito sobre Codex CLI. No ejecuta Windows ni SketchUp."""
from pathlib import Path
import argparse, json, os, shutil, subprocess, sys, time

ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parent
SYS=sys.executable
STATUSES={'CONTINUE','NEEDS_USER','BLOCKED','DONE'}
MANUAL_KEYS=('sketchup2026Windows','furnitureAndNamesValidated','edgesAndOrientationValidated','supplierTestAccepted','pdfA3RegressionValidated')

def manual_ok():
    p=ROOT/'manual'/'validacion_usuario.json'
    if not p.is_file():return False
    try:
        x=json.loads(p.read_text(encoding='utf-8'))
        return (isinstance(x.get('reviewedBy'),str) and bool(x['reviewedBy'].strip())
            and isinstance(x.get('date'),str) and bool(x['date'].strip())
            and all(x.get(k) is True for k in MANUAL_KEYS))
    except (ValueError,KeyError):return False

def check_response(result,cycle):
    if not isinstance(result,dict):raise ValueError('Respuesta no es JSON objeto')
    for key in ('cycle','status','summary','changedFiles','tests','blockers','nextAction','userAction','needsSketchupValidation'):
        if key not in result: raise ValueError(f'Respuesta sin {key}')
    if result['cycle']!=cycle or result['status'] not in STATUSES:raise ValueError('Ciclo/status inválido')
    if not isinstance(result['changedFiles'],list) or not isinstance(result['tests'],list) or not isinstance(result['blockers'],list):
        raise ValueError('Listas de progreso inválidas')
    if any(not isinstance(t,dict) or t.get('result') not in ('PASS','FAIL','NOT_RUN') for t in result['tests']):
        raise ValueError('Pruebas con estructura inválida')
    if not isinstance(result['needsSketchupValidation'],bool):raise ValueError('needsSketchupValidation inválido')
    return result

def count_existing(state):
    numbers=[]
    for x in (state/'cycles').glob('cycle-*.json'):
        try:numbers.append(int(x.stem.split('-')[-1]))
        except ValueError:pass
    return max(numbers,default=0)

def prompt_for(cycle):
    description=(ROOT/'PROMPT_CODEX.md').read_text(encoding='utf-8')
    return (description+'\n\n'+f"## Ciclo actual: {cycle}\n"
      f"La ejecución es en {PROJECT}. Leé y actualizá `planos-santo-loop-068/PROGRESO.md`.\n"
      'Usá primero TAREAS.md y el código presente. Una sola etapa verificable por ciclo. '
      'No edites `manual/validacion_usuario.json`, archivos dentro de `referencias/`, '
      'ni el original .rbz. Las salidas finales deben cumplir exactamente `SCHEMA_RESPONSE.json`. '
      'Nunca marques DONE sin haber validado SketchUp 2026 Windows, los cantos 2D y la carga de TXT en la maderera por una persona. '
      'Si precisás al operador, devolvé NEEDS_USER con la prueba concreta. '
      f'Indicá `cycle: {cycle}`.\n')

def ensure_git():
    try:
        p=subprocess.run(['git','rev-parse','--show-toplevel'],cwd=PROJECT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=10)
    except (OSError,subprocess.TimeoutExpired):return False
    return p.returncode==0

def main():
    pa=argparse.ArgumentParser(description='Loop de Codex para Planos Santo 0.6.8')
    pa.add_argument('cycles',type=int,nargs='?',help='Cantidad de ciclos (alias posicional)')
    pa.add_argument('--max-cycles',type=int,default=None)
    pa.add_argument('--dry-run',action='store_true')
    pa.add_argument('--resume-after-user',action='store_true',help='Reanuda tras completar una validación humana')
    args=pa.parse_args()
    limit=args.max_cycles if args.max_cycles is not None else args.cycles if args.cycles is not None else 6
    if not 1<=limit<=20:pa.error('Ciclos permitidos: 1-20')
    if args.dry_run:
        print('Proyecto:',PROJECT)
        print('Baseline:',ROOT/'referencias/PlanosSanto-0.6.8.rbz')
        print('Comando: codex exec --sandbox workspace-write --output-schema <schema> -o <salida> -')
        print('Límite:',limit,'ciclos; NO se ejecutó Codex.')
        return 0
    if not ensure_git():
        print('ERROR: el proyecto debe ser repositorio Git. Revisá los archivos y, si corresponde, ejecutá git init en la raíz.',file=sys.stderr)
        return 4
    verifier=subprocess.run([SYS,str(ROOT/'scripts/verificar_entradas.py')],cwd=PROJECT)
    if verifier.returncode:return 5
    cli=os.environ.get('PLANOS_SANTO_CODEX_BIN') or shutil.which('codex')
    if not cli:
        print('ERROR: falta Codex CLI o sesión de terminal; instalalo e iniciá sesión.',file=sys.stderr)
        return 6
    state=ROOT/'state'; (state/'logs').mkdir(parents=True,exist_ok=True);(state/'cycles').mkdir(parents=True,exist_ok=True)
    lock=state/'loop.lock'
    try:
        # O_EXCL impide loops paralelos. Si se corta bruscamente, eliminar manualmente tras verificar que no queda otro proceso.
        fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:f.write(f'pid={os.getpid()}\n')
    except FileExistsError:
        print('ERROR: hay otro loop o quedó un lock. Verificá antes de borrar state/loop.lock.',file=sys.stderr)
        return 7
    try:
        initial=count_existing(state)
        if initial:
            last_file=state/'cycles'/f'cycle-{initial}.json'
            try:last=json.loads(last_file.read_text(encoding='utf-8'))
            except (OSError,ValueError):
                print('ERROR: último ciclo ilegible; corregí el estado antes de continuar.',file=sys.stderr);return 9
            if last.get('status')=='DONE':
                if manual_ok() and not last.get('needsSketchupValidation',True):
                    print('Último ciclo finalizado, con validaciones manuales registradas. Revisá la evidencia.');return 0
                print('El último ciclo declaró DONE, pero queda validación real pendiente. No se reinicia.');return 11
            if last.get('status') in ('NEEDS_USER','BLOCKED') and not args.resume_after_user:
                print('Hay una validación humana o bloqueo pendiente del último ciclo:')
                print(last.get('userAction') or '; '.join(last.get('blockers',[])))
                print('Tras resolverla, repetí con --resume-after-user.');return 13
        for cycle in range(initial+1,initial+limit+1):
            dest=state/'cycles'/f'cycle-{cycle}.json'
            stdout_path=state/'logs'/f'cycle-{cycle}.stdout.log'
            stderr_path=state/'logs'/f'cycle-{cycle}.stderr.log'
            cmd=[str(cli),'exec','--sandbox','workspace-write','--output-schema',str(ROOT/'SCHEMA_RESPONSE.json'),
                '--output-last-message',str(dest),'-']
            print(f'\nCICLO {cycle}: ejecutando Codex (sandbox workspace-write)...',flush=True)
            with stdout_path.open('wb') as out, stderr_path.open('wb') as err:
                p=subprocess.run(cmd,cwd=PROJECT,input=prompt_for(cycle).encode('utf-8'),stdout=out,stderr=err)
            if p.returncode!=0:
                print(f'ERROR: Codex retornó {p.returncode}. Revisá {stderr_path.relative_to(PROJECT)}.',file=sys.stderr)
                return 8
            try:result=check_response(json.loads(dest.read_text(encoding='utf-8')),cycle)
            except (OSError,ValueError) as ex:
                dest.rename(dest.with_suffix('.invalid')) if dest.exists() else None
                print('ERROR: Codex no devolvió estado JSON válido:',str(ex),file=sys.stderr)
                return 9
            print('Estado:',result['status'],'|',result['summary'][:200],flush=True)
            status=result['status']
            if status=='CONTINUE':continue
            if status=='NEEDS_USER':
                print('NECESITA OPERADOR:',result['userAction'])
                return 0
            if status=='BLOCKED':
                print('BLOQUEO:', '; '.join(result['blockers']))
                return 10
            if status=='DONE':
                if not manual_ok():
                    print('VALIDACIÓN REAL PENDIENTE: no se acepta DONE hasta completar manual/validacion_usuario.json.')
                    return 11
                if result.get('needsSketchupValidation'):
                    print('Codex declara que aún falta validación de SketchUp. No aprobado.')
                    return 12
                print('Cierre aceptado por el ejecutor; revisar igualmente PR, tests y evidencia real.')
                return 0
        print(f'Se alcanzó el límite de {limit} ciclos. Podés reanudar después de revisar PROGRESO.md.')
        return 0
    finally:
        try:lock.unlink()
        except FileNotFoundError:pass

if __name__=='__main__':sys.exit(main())
