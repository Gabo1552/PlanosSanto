#!/usr/bin/env bash
# Planos Santo - ciclos Codex acotados, sin sandbox irrestricto.
set -euo pipefail

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then CHECK_ONLY=1; shift; fi
MAX_CYCLES="${1:-6}"
MODEL="${2:-${CODEX_MODEL:-}}"
EFFORT="${3:-${CODEX_REASONING_EFFORT:-high}}"
if ! [[ "$MAX_CYCLES" =~ ^[1-9][0-9]*$ ]] || (( MAX_CYCLES > 12 )); then
  echo 'MAX_CYCLES debe estar entre 1 y 12.' >&2; exit 2
fi
case "$EFFORT" in low|medium|high|xhigh) ;; *) echo 'Effort inválido' >&2; exit 2 ;; esac

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$LOOP_DIR/.." && pwd)"
RUN_DIR="$LOOP_DIR/runs"
PROMPT="$LOOP_DIR/LOOP_PROMPT.md"
SCHEMA="$LOOP_DIR/codex-output.schema.json"
APPROVAL="$HOME/.planos-santo/aprobacion-sketchup2026.txt"

for tool in codex git python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "No encuentro $tool en PATH." >&2; exit 4; }
done
if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "El proyecto no está bajo Git ($PROJECT_DIR). Crear una copia/rama antes de correr." >&2; exit 4
fi
[[ -s "$PROMPT" && -s "$SCHEMA" ]] || { echo 'Falta prompt/schema del loop' >&2; exit 4; }

# Refuerzo local de exclusión de modelos de clientes y reportes (no toca Git tracked).
GIT_DIR="$(git -C "$PROJECT_DIR" rev-parse --absolute-git-dir)"
EXCLUDE="$GIT_DIR/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")" "$RUN_DIR"
touch "$EXCLUDE"
for pattern in '/planos-santo-arranque/referencias_privadas/' '/planos-santo-arranque/runs/'; do
  if ! grep -Fxq "$pattern" "$EXCLUDE"; then printf '%s\n' "$pattern" >> "$EXCLUDE"; fi
done
if [[ -n "$(git -C "$PROJECT_DIR" ls-files -- 'planos-santo-arranque/referencias_privadas/')" ]]; then
  echo 'ALERTA: el corpus ya parece versionado. Detenete y revisá Git.' >&2; exit 4
fi

python3 "$LOOP_DIR/scripts/verificar_corpus.py"
python3 -m unittest discover -s "$LOOP_DIR/tests" -q
if [[ "$CHECK_ONLY" == '1' ]]; then
  printf 'Chequeos iniciales OK. Proyecto: %s\n' "$PROJECT_DIR"
  exit 0
fi

SESSION="$(date +%Y%m%d-%H%M%S)-$$"
echo "PLANOS SANTO :: $PROJECT_DIR :: máximo $MAX_CYCLES ciclos :: sandbox workspace-write"
if [[ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]]; then
  echo 'Aviso: hay cambios Git previos. Confirmá que tenés respaldo; no se hará reset ni commit forzado.'
fi

for ((n=1;n<=MAX_CYCLES;n++)); do
  number="$(printf '%03d' "$n")"
  report="$RUN_DIR/${SESSION}-ciclo-${number}.json"
  log="$RUN_DIR/${SESSION}-ciclo-${number}.log"
  args=(exec -C "$PROJECT_DIR" --sandbox workspace-write --config "model_reasoning_effort=$EFFORT" \
        --output-schema "$SCHEMA" --output-last-message "$report")
  [[ -n "$MODEL" ]] && args+=(--model "$MODEL")
  args+=(-)
  echo "----- Ciclo $n / $MAX_CYCLES -----"
  set +e
  {
    cat "$PROMPT"
    printf '\nCICLO %d/%d. Leé planos-santo-arranque/TAREAS.md y PROGRESO.md. Si hay runs/latest.json, revisalo. Ejecutá UNA tarea acotada, probala, registrá avances. Si requiere SketchUp de escritorio o proveedor, state=needs_user. El output final SOLO JSON válido.\n' "$n" "$MAX_CYCLES"
  } | codex "${args[@]}" 2>&1 | tee "$log"
  codex_status=${PIPESTATUS[1]}
  set -e
  if (( codex_status != 0 )); then echo "Codex falló (exit $codex_status). Log: $log" >&2; exit 5; fi
  [[ -s "$report" ]] || { echo "Falta reporte $report" >&2; exit 5; }
  state="$(python3 - "$report" <<'PY'
import json,sys
p=sys.argv[1]
with open(p,encoding='utf-8') as f: d=json.load(f)
required=['state','phase','summary','changed_files','tests','next_step','manual_checks']
if any(k not in d for k in required): raise ValueError('Falta un campo del informe')
if d['state'] not in ('working','needs_user','blocked','done'): raise ValueError('Estado inválido')
for k in ('changed_files','tests','manual_checks'):
    if not isinstance(d[k],list): raise ValueError('Lista inválida')
print(d['state'])
PY
  )" || { echo 'El informe JSON no cumple el contrato.' >&2; exit 5; }
  cp "$report" "$RUN_DIR/latest.json"
  echo "Estado: $state. Reporte: $report"
  case "$state" in
    working) continue ;;
    needs_user) echo 'PARADA: se necesita una prueba manual en SketchUp / maderera. Consultá VALIDACION_SKETCHUP.md'; exit 3 ;;
    blocked) echo 'PARADA: bloqueo técnico. Consultá PROGRESO.md y runs/latest.json'; exit 4 ;;
    done)
      python3 "$LOOP_DIR/scripts/verificar_corpus.py" || exit 5
      python3 -m unittest discover -s "$LOOP_DIR/tests" -q || { echo 'Tests fallan; no terminamos' >&2; exit 5; }
      if [[ -f "$PROJECT_DIR/package.json" ]] && command -v node >/dev/null 2>&1 \
          && node -e 'let p=require(process.argv[1]);process.exit(p.scripts&&p.scripts.verify?0:1)' "$PROJECT_DIR/package.json"; then
        command -v npm >/dev/null 2>&1 || { echo 'Falta npm, no puedo verificar la web anterior.' >&2; exit 3; }
        (cd "$PROJECT_DIR" && npm run verify) || { echo 'Falló npm run verify, no terminó.' >&2; exit 5; }
      fi
      if [[ ! -f "$APPROVAL" ]] || [[ "$(tr -d '\r\n' < "$APPROVAL")" != 'APROBADO PLANOS SANTO 2026' ]]; then
        echo "Codex completó sus checks, pero falta aprobación externa en $APPROVAL" >&2; exit 3
      fi
      echo 'Aprobación externa y tests disponibles OK. Revisá VALIDACION_SKETCHUP.md antes de publicar.'
      exit 0 ;;
  esac
done
echo 'Se alcanzó el límite de ciclos. Volvé a ejecutar el mismo comando para continuar.' >&2
exit 2
