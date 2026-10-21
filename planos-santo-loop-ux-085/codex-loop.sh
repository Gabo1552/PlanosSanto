#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"
cd "$PROJECT_ROOT"
MAX="${1:-6}"
if ! [[ "$MAX" =~ ^[1-9][0-9]*$ ]] || (( MAX>8 ));then echo 'Ciclos: 1 a 8' >&2;exit 2;fi
command -v python3 >/dev/null || { echo 'Requiere Python3 para comprobar estado.' >&2; exit 2; }
python3 "$DIR/scripts/auditar_base.py" >/dev/null
if [[ "${2:-}" == '--dry-run' ]];then
  echo "Prueba seca: referencia 0.8.5 íntegra, Codex NO se ejecutó. Máximo $MAX ciclos."
  exit 0
fi
command -v codex >/dev/null || { echo 'Falta Codex CLI; leer INSTRUCCION_CLOUD.md en la interfaz.' >&2; exit 2; }
mkdir -p "$DIR/runs"
for ((n=0;n<MAX;n++)); do
  NEXT=$(python3 - "$DIR/ESTADO.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8'))
if s['state']!='CONTINUAR':raise SystemExit('Detenido en '+str(s['state'])+'. Revisar PROGRESO.md.')
print(s['last_cycle']+1)
PY
  )
  PROMPT="$DIR/runs/cycle_${NEXT}_prompt.txt"
  OUT="$DIR/runs/cycle_${NEXT}_output.txt"
  cat > "$PROMPT" <<EOF
Realizá SOLO el ciclo $NEXT del loop UX 0.8.5 de Planos Santo. Usá el código MÁS RECIENTE del repositorio. Leé $DIR/PROMPT_CODEX.md, AUDITORIA_085.md, BACKLOG.md, CONTRATO_PINTURA_RAPIDA.md, UX_NOMBRES.md, UX_PLANOS_A4.md, BARRA_E_ICONOS.md, ACEPTACION_Y_PRUEBAS.md, SEGURIDAD.md.
Prioridad absoluta: pintura real en 1-2 acciones, paleta compacta, sin ventana gigante ni bypass de seguridad. Luego nombres, editor A4, barra/iconos.
Implementá código + tests + evidencia concreta; actualizá $DIR/PROGRESO.md y $DIR/ESTADO.json con last_cycle=$NEXT y state CONTINUAR, NECESITA_SKETCHUP, CANDIDATA_PARA_VALIDAR o BLOQUEADO.
No dupliques el loop dentro del ciclo. No reemplacés el proyecto por la RBZ de referencia, no subas assets privados ni afirmes pruebas de SketchUp desde nube.
EOF
  echo "Codex: ciclo $NEXT"
  codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message "$OUT" - < "$PROMPT"
  STATUS=$(python3 - "$DIR/ESTADO.json" "$NEXT" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8')); n=int(sys.argv[2])
if s['last_cycle']!=n:raise SystemExit(f'Codex no actualizó last_cycle={n}; inspeccionar antes de reintentar')
if s['state'] not in ('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO'):
 raise SystemExit('Estado inválido')
print(s['state'])
PY
  )
  echo "Estado: $STATUS"
  if [[ "$STATUS" != CONTINUAR ]];then echo "Detenido: $STATUS; ver PROGRESO.md";exit 0;fi
done
echo 'Ciclos completados. Revisá estado; no implica aceptación.'
