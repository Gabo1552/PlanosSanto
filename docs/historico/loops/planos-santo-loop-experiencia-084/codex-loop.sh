#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"
cd "$PROJECT_ROOT"
MAX="${1:-6}"
if ! [[ "$MAX" =~ ^[1-9][0-9]*$ ]] || (( MAX>8 ));then echo 'Ciclos permitidos: 1 a 8' >&2;exit 2;fi
command -v codex >/dev/null || { echo 'Falta Codex CLI. Usá INSTRUCCION_CLOUD.md en la interfaz.' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'Falta python3 para comprobar estado.' >&2; exit 2; }
python3 "$DIR/scripts/verificar_paquete.py" >/dev/null
mkdir -p "$DIR/runs"
for (( iter=0;iter<MAX;iter++ ));do
  NEXT=$(python3 - "$DIR/ESTADO.json" <<'PY1'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8'))
if s['state']!='CONTINUAR':raise SystemExit('La tarea está en '+s['state']+'; revisá PROGRESO.md antes de reanudar.')
print(s['last_cycle']+1)
PY1
  )
  echo "Planos Santo UX: ciclo $NEXT"
  PROMPT="$DIR/runs/cycle_${NEXT}_prompt.txt"
  OUT="$DIR/runs/cycle_${NEXT}_output.txt"
  cat > "$PROMPT" <<EOF
Ejecutá un solo ciclo $NEXT del loop de UX Planos Santo con el código MÁS RECIENTE del repo y sin sobrescribir cambios. Leé $DIR/PROMPT_CODEX.md, BACKLOG.md, CONTRATO_IMAGEN_MATERIAL.md, DISENO_UX.md, ACEPTACION.md, SEGURIDAD.md y REFERENCIAS_OPENCUTLIST.md. Implementá código y pruebas, registrá evidencia real y cambiá $DIR/PROGRESO.md. Actualizá $DIR/ESTADO.json con last_cycle=$NEXT y state CONTINUAR, NECESITA_SKETCHUP, CANDIDATA_PARA_VALIDAR o BLOQUEADO. No reportes pruebas de SketchUp si trabajás en nube; no cargues assets privados a GitHub. No ejecutes este loop desde dentro de un ciclo.
EOF
  codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message "$OUT" - < "$PROMPT"
  STATUS=$(python3 - "$DIR/ESTADO.json" "$NEXT" <<'PY2'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8'));n=int(sys.argv[2])
if s['last_cycle']!=n:raise SystemExit('El estado no se actualizó al ciclo '+str(n))
assert s['state'] in ('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO')
print(s['state'])
PY2
  )
  echo "Estado: $STATUS"
  if [[ "$STATUS" != CONTINUAR ]];then echo "Loop detenido para revisión: $STATUS";exit 0;fi
done
echo 'Máximo de ciclos alcanzado. Revisá PROGRESO.md y reanudá manualmente si corresponde.'
