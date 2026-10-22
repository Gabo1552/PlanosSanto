#!/usr/bin/env bash
set -euo pipefail
ROOT="planos-santo-loop-ux-082"
MAX="${1:-6}"
if ! [[ "$MAX" =~ ^[1-9][0-9]*$ ]] || (( MAX > 10 )); then echo "Ciclos por corrida: 1..10" >&2; exit 2; fi
[[ -f "$ROOT/PROMPT_CODEX.md" ]] || { echo "Ejecutar desde la raíz del proyecto que contiene $ROOT/" >&2; exit 2; }
command -v codex >/dev/null || { echo 'Codex CLI no disponible. Usá INSTRUCCION_CLOUD.md desde interfaz Codex.' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'Python3 requerido para el control de estado.' >&2; exit 2; }
mkdir -p "$ROOT/runs"
NEXT="$(python3 - "$ROOT/ESTADO.json" <<'PYREAD'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf8'))
if s['state'] not in ('CONTINUAR','CANDIDATA_PARA_VALIDAR','NECESITA_SKETCHUP','BLOQUEADO'): raise SystemExit('Estado inválido')
if s['state']!='CONTINUAR': raise SystemExit('El loop se detuvo por estado '+s['state']+'; revisá PROGRESO.md y resolvé antes de reanudar.')
print(s['last_cycle']+1)
PYREAD
)"
for (( i=NEXT; i<NEXT+MAX; i++ )); do
 OUT="$ROOT/runs/cycle_${i}_output.txt"
 PROMPT="$ROOT/runs/cycle_${i}_prompt.txt"
 cat > "$PROMPT" <<EOF
Ejecutá el ciclo $i del loop de UX de Planos Santo sobre el código MÁS RECIENTE del repositorio.
Leé $ROOT/PROMPT_CODEX.md, BACKLOG.md, CRITERIOS.md, SEGURIDAD.md, DISENO_UX.md y CATALOGO_SKM.md.
Respetá materiales privados, esquema persistente y pruebas. Implementá código real.
Registrá avances en $ROOT/PROGRESO.md.
Obligatorio: actualizá $ROOT/ESTADO.json con last_cycle=$i y state=CONTINUAR o CANDIDATA_PARA_VALIDAR o NECESITA_SKETCHUP o BLOQUEADO.
No reportes pruebas nativas sin acceso real a SketchUp.
EOF
 echo "Ciclo $i"
 codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message "$OUT" - < "$PROMPT"
 STATUS="$(python3 - "$ROOT/ESTADO.json" "$i" <<'PYVALID'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf8'));cycle=int(sys.argv[2]);state=s.get('state')
if s.get('last_cycle')!=cycle:raise SystemExit('No se actualizó ESTADO.json last_cycle; detener para revisión.')
if state not in ('CONTINUAR','CANDIDATA_PARA_VALIDAR','NECESITA_SKETCHUP','BLOQUEADO'):raise SystemExit('Estado inválido')
print(state)
PYVALID
)"
 echo "Estado $STATUS"
 if [[ "$STATUS" != 'CONTINUAR' ]]; then echo "Fin del loop: $STATUS"; exit 0; fi
done
echo 'Se alcanzó el máximo de ciclos de esta corrida; revisá PROGRESO.md.'
