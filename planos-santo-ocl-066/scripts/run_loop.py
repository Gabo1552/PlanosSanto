#!/usr/bin/env python3
"""Ejecutor seguro de ciclos Codex en el repositorio Planos Santo.

No borra ni sincroniza código, no publica nada, limita el número de ciclos y
requiere aceptación humana explícita para certificar SketchUp/proveedor.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

LOOP_DIR = Path(__file__).resolve().parent.parent
PROJECT = LOOP_DIR.parent
RUNS = LOOP_DIR / 'runs'
APPROVAL_DEFAULT = Path.home() / '.planos-santo' / 'validacion-ocl-066.aprobada'
APPROVAL_TEXT = 'APROBADO PLANOS SANTO 2026 OCL 066'
ALLOWED_STATES = {'working', 'needs_user', 'blocked', 'done'}
FIELDS = ('state', 'phase', 'summary', 'changed_files', 'tests', 'next_step', 'manual_checks')


def verify_report(path: Path) -> dict:
    report = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(report, dict) or set(report) != set(FIELDS):
        raise ValueError('Informe JSON incompleto o con claves no previstas')
    if report['state'] not in ALLOWED_STATES:
        raise ValueError('Estado desconocido')
    for key in ('phase', 'summary', 'next_step'):
        if not isinstance(report[key], str) or not report[key].strip():
            raise ValueError(f'{key} debe ser un texto no vacío')
    for key in ('changed_files', 'tests', 'manual_checks'):
        if not isinstance(report[key], list) or any(not isinstance(item, str) for item in report[key]):
            raise ValueError(f'{key} debe ser lista de textos')
    if report['state'] == 'working' and not (report['changed_files'] or report['tests']):
        raise ValueError('Ciclo sin avance comprobable: no repetir automáticamente')
    return report


def run_command(args: list[str], cwd: Path = PROJECT) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def preflight(check_only: bool = False) -> None:
    for filename in ('LOOP_PROMPT.md', 'TAREAS.md', 'PROGRESO.md', 'codex-output.schema.json'):
        if not (LOOP_DIR / filename).is_file():
            raise RuntimeError('Falta archivo de control: ' + filename)
    for executable in ('git',):
        if shutil.which(executable) is None:
            raise RuntimeError(f'No se encuentra {executable}')
    result = subprocess.run(['git', '-C', str(PROJECT), 'rev-parse', '--is-inside-work-tree'],
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f'{PROJECT} no parece ser un repositorio Git: usar el proyecto existente y crear respaldo')
    for folder in ('referencias_privadas', 'baseline', 'runs'):
        path = f'{LOOP_DIR.name}/{folder}'
        existing = subprocess.run(['git', '-C', str(PROJECT), 'ls-files', '--', path],
                                  capture_output=True, text=True, check=True)
        if existing.stdout.strip():
            raise RuntimeError(f'ALERTA: {path} está rastreado por Git. Dejar datos privados fuera del repositorio público.')
    git_dir = subprocess.run(['git', '-C', str(PROJECT), 'rev-parse', '--absolute-git-dir'],
                             capture_output=True, text=True, check=True).stdout.strip()
    exclude = Path(git_dir) / 'info' / 'exclude'
    exclude.parent.mkdir(parents=True, exist_ok=True)
    original = exclude.read_text(encoding='utf-8') if exclude.exists() else ''
    exclusion = [f'/{LOOP_DIR.name}/{name}/' for name in ('referencias_privadas', 'baseline', 'runs')]
    missing = [p for p in exclusion if p not in original.splitlines()]
    if missing:
        with exclude.open('a', encoding='utf-8') as file:
            if original and not original.endswith('\n'):
                file.write('\n')
            file.write('\n'.join(missing) + '\n')
    run_command([sys.executable, str(LOOP_DIR / 'scripts' / 'verify_integrity.py')])
    run_command([sys.executable, '-m', 'unittest', 'discover', '-s', str(LOOP_DIR / 'tests'), '-q'])
    if not check_only and not shutil.which(os.environ.get('CODEX_BIN', 'codex')):
        raise RuntimeError('No se encuentra Codex CLI. Iniciar sesión/instalar o usar el prompt manualmente.')


def approval_exists() -> bool:
    candidate = Path(os.environ.get('PLANOSSANTO_APPROVAL_FILE', str(APPROVAL_DEFAULT))).expanduser().resolve()
    # Codex solo puede editar el workspace; una autorización dentro del repositorio NO es externa.
    if candidate == PROJECT or PROJECT in candidate.parents:
        return False
    return candidate.is_file() and candidate.read_text(encoding='utf-8').strip() == APPROVAL_TEXT


def verification_finish() -> None:
    run_command([sys.executable, str(LOOP_DIR / 'scripts' / 'verify_integrity.py')])
    run_command([sys.executable, '-m', 'unittest', 'discover', '-s', str(LOOP_DIR / 'tests'), '-q'])
    package_json = PROJECT / 'package.json'
    if package_json.is_file():
        package = json.loads(package_json.read_text(encoding='utf-8'))
        scripts = package.get('scripts', {})
        if 'verify' in scripts:
            if shutil.which('npm') is None:
                raise RuntimeError('Hay npm run verify pero falta npm en PATH')
            run_command(['npm', 'run', 'verify'])
    if not approval_exists():
        raise PermissionError('Pruebas automáticas OK pero falta la aceptación real de Windows/SketchUp y maderera. Ver VALIDACION_WINDOWS.md')


def run_cycle(n: int, limit: int, args: argparse.Namespace, session: str) -> dict:
    RUNS.mkdir(parents=True, exist_ok=True)
    result_file = RUNS / f'{session}-ciclo-{n:03d}.json'
    log_file = RUNS / f'{session}-ciclo-{n:03d}.log'
    prompt_text = (LOOP_DIR / 'LOOP_PROMPT.md').read_text(encoding='utf-8')
    prompt_text += (f'\n\nCICLO {n}/{limit}: Leé TAREAS.md, PROGRESO.md y runs/latest.json si existe. '
                    'Hacé UNA tarea verificable en el repositorio; actualizá PROGRESO.md, ejecutá pruebas '
                    'y respondé SOLO JSON válido según schema. Si falta prueba SketchUp/proveedor, needs_user.\n')
    cmd = [os.environ.get('CODEX_BIN', 'codex'), 'exec', '-C', str(PROJECT), '--sandbox', 'workspace-write',
           '--config', f'model_reasoning_effort={args.effort}', '--output-schema', str(LOOP_DIR / 'codex-output.schema.json'),
           '--output-last-message', str(result_file)]
    if args.model:
        cmd.extend(['--model', args.model])
    cmd.append('-')
    print(f'\n--- Ciclo {n}/{limit} ---', flush=True)
    with log_file.open('w', encoding='utf-8') as log:
        with subprocess.Popen(cmd, cwd=PROJECT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, encoding='utf-8', errors='replace') as child:
            assert child.stdin and child.stdout
            child.stdin.write(prompt_text)
            child.stdin.close()
            for line in child.stdout:
                print(line, end='', flush=True)
                log.write(line)
            exit_status = child.wait()
    if exit_status:
        raise RuntimeError(f'Codex devolvió exit {exit_status}; revisar {log_file}')
    if not result_file.is_file() or result_file.stat().st_size == 0:
        raise RuntimeError(f'Codex no escribió el JSON esperado: {result_file}')
    data = verify_report(result_file)
    (RUNS / 'latest.json').write_text(result_file.read_text(encoding='utf-8'), encoding='utf-8')
    print(f"Ciclo {n} | {data['phase']} | {data['state']} | siguiente: {data['next_step']}", flush=True)
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('cycles', nargs='?', type=int, default=6)
    parser.add_argument('--check', action='store_true', help='Solo comprobar referencias y pruebas del paquete')
    parser.add_argument('--model', default=os.environ.get('CODEX_MODEL', ''))
    parser.add_argument('--effort', choices=('low', 'medium', 'high', 'xhigh'),
                        default=os.environ.get('CODEX_REASONING_EFFORT', 'high'))
    args = parser.parse_args()
    if not 1 <= args.cycles <= 12:
        parser.error('cycles debe estar entre 1 y 12')
    try:
        preflight(check_only=args.check)
        if args.check:
            print('Preflight OK. No se ejecutó Codex ni SketchUp.')
            return 0
        session = dt.datetime.now().strftime('%Y%m%d-%H%M%S') + f'-{os.getpid()}'
        for n in range(1, args.cycles + 1):
            result = run_cycle(n, args.cycles, args, session)
            if result['state'] == 'working':
                continue
            if result['state'] == 'blocked':
                print('BLOQUEADO. Consultar PROGRESO.md y runs/latest.json.')
                return 4
            if result['state'] == 'needs_user':
                print('PENDIENTE DE OPERADOR. Consultar VALIDACION_WINDOWS.md.')
                return 3
            if result['state'] == 'done':
                verification_finish()
                print('Alcance con tests y validación manual: aprobado.')
                return 0
        print('Límite de ciclos alcanzado. Podés volver a ejecutarlo para continuar.')
        return 2
    except PermissionError as e:
        print(f'PENDIENTE: {e}', file=sys.stderr)
        return 3
    except (RuntimeError, ValueError, subprocess.CalledProcessError, OSError) as e:
        print(f'ERROR: {e}', file=sys.stderr)
        return 5


if __name__ == '__main__':
    raise SystemExit(main())
