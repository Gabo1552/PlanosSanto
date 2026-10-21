#!/usr/bin/env bash
set -euo pipefail
# Ejecutar desde la raíz del proyecto de Planos Santo (no desde la carpeta loop).
MAX_CYCLES="${1:-6}"
if ! [[ "$MAX_CYCLES" =~ ^[1-9][0-9]*$ ]] || (( MAX_CYCLES > 12 )); then
  echo "Usá un número de ciclos de 1 a 12." >&2; exit 2
fi
BASE="planos-santo-loop-toolbar-082"
[[ -f "$BASE/PROMPT_CODEX.md" ]] || { echo "Ejecutá desde la raíz del proyecto con $BASE/ adentro." >&2; exit 2; }
command -v codex >/dev/null || { echo "No está instalado Codex CLI; usá INSTRUCCION_PARA_CLOUD.md en la UI de Codex." >&2; exit 2; }
command -v python3 >/dev/null || { echo "Se requiere Python 3 para leer los estados." >&2; exit 2; }
mkdir -p "$BASE/runs"
for (( i=1; i<=MAX_CYCLES; i++ )); do
  OUT="$BASE/runs/cycle_${i}_final.txt"
  PROMPT="$BASE/runs/cycle_${i}_prompt.txt"
  {
    echo "Realizá el ciclo $i de desarrollo del loop de barra de herramientas de Planos Santo."
    echo "Leé $BASE/PROMPT_CODEX.md, $BASE/BACKLOG.md, $BASE/CRITERIOS_ACEPTACION.md y $BASE/CONTRATO_DE_SEGURIDAD.md."
    echo "Este ciclo debe actualizar $BASE/PROGRESO.md y escribir en $BASE/ESTADO.json last_cycle=$i con el estado explícito."
    echo "Trabajá solo en el repositorio actual; no uses el RBZ de referencia para reemplazar código más reciente."
    echo "No declares prueba nativa de SketchUp sin ejecutarla realmente."
    echo "SeguÍ la siguiente tarea que esté sin marcar y probá cuanto sea posible."
  } > "$PROMPT"
  echo "Ciclo $i/$MAX_CYCLES"
  codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message "$OUT" - < "$PROMPT"
  state=$(python3 - "$BASE/ESTADO.json" "$i" <<'PYREAD'
import sys,json
p=sys.argv[1];cycle=int(sys.argv[2])
with open(p,encoding='utf-8') as f:s=json.load(f)
if s.get('last_cycle')!=cycle: raise SystemExit(f'Codex no actualizó last_cycle={cycle}; revisá el ciclo y detenelo.')
state=s.get('state')
if state not in ('CONTINUAR','CANDIDATA_PARA_VALIDAR','NECESITA_SKETCHUP','BLOQUEADO'):
 raise SystemExit('Estado no reconocido. Revisar ESTADO.json.')
print(state)
PYREAD
)
  echo "Estado: $state"
  [[ "$state" == 'CONTINUAR' ]] || { echo "Loop detenido; revisar $BASE/ESTADO.json y $BASE/PROGRESO.md"; exit 0; }
done
echo "Se alcanzó el máximo de ciclos. No implica finalización."
