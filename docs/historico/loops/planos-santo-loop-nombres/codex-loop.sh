#!/usr/bin/env bash
set -euo pipefail

MAX_CYCLES="${1:-6}"
MODEL="${2:-${CODEX_MODEL:-}}"
EFFORT="${3:-${CODEX_REASONING_EFFORT:-high}}"
if ! [[ "$MAX_CYCLES" =~ ^[1-9][0-9]*$ ]] || (( MAX_CYCLES > 50 )); then
  echo 'MaxCycles debe estar entre 1 y 50' >&2; exit 1
fi
case "$EFFORT" in medium|high|xhigh) ;; *) echo 'Razonamiento inválido (medium, high, xhigh)' >&2; exit 1 ;; esac

LOOP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$LOOP_DIR/.." && pwd)"
RUN_DIR="$LOOP_DIR/runs"
PROMPT="$LOOP_DIR/LOOP_PROMPT.md"
SCHEMA="$LOOP_DIR/codex-output.schema.json"
MANUAL="$LOOP_DIR/VALIDACION_SKETCHUP.md"
for cmd in codex git node; do command -v "$cmd" >/dev/null || { echo "Falta $cmd en PATH" >&2; exit 1; }; done
git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo 'Requiere repositorio Git PlanosSanto' >&2; exit 1; }
[[ -f "$PROMPT" && -f "$SCHEMA" && -f "$MANUAL" ]] || { echo 'Faltan instrucciones del loop' >&2; exit 1; }
mkdir -p "$RUN_DIR"
SESSION="$(date +%Y%m%d-%H%M%S)-$$"

echo "Loop SOLO nombres / proyecto: $PROJECT_DIR / máximo $MAX_CYCLES ciclos"
for ((i=1;i<=MAX_CYCLES;i++)); do
  id="$(printf '%03d' "$i")"
  report="$RUN_DIR/$SESSION-ciclo-$id.json"
  log="$RUN_DIR/$SESSION-ciclo-$id.log"
  args=(--ask-for-approval never exec -C "$PROJECT_DIR" --sandbox workspace-write --config "model_reasoning_effort=$EFFORT" --output-schema "$SCHEMA" --output-last-message "$report")
  if [[ -n "$MODEL" ]]; then args+=(--model "$MODEL"); fi
  args+=(-)
  echo "=== Ciclo $i / $MAX_CYCLES ==="
  set +e
  {
    cat "$PROMPT"
    printf '\n\nCICLO %s/%s. Revisá PROGRESO.md, TAREAS.md y runs/latest.json de planos-santo-loop-nombres. Si runs/verification_failed.txt existe, solucioná ese error primero. RESPONDÉ SOLO JSON.\n' "$i" "$MAX_CYCLES"
  } | codex "${args[@]}" 2>&1 | tee "$log"
  status=${PIPESTATUS[1]}
  set -e
  if (( status != 0 )); then echo "Codex falló ($status); consultá $log" >&2; exit 5; fi
  [[ -s "$report" ]] || { echo "Falta reporte: $report" >&2; exit 6; }
  state="$(node -e 'let d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!["working","needs_user","blocked","done"].includes(d.state))process.exit(2);process.stdout.write(d.state)' "$report")" || { echo 'Reporte inválido' >&2; exit 6; }
  cp "$report" "$RUN_DIR/latest.json"
  echo "Estado: $state"
  case "$state" in
    working) continue ;;
    needs_user) echo "Es necesaria una prueba manual. Revisá $MANUAL y runs/latest.json"; exit 3 ;;
    blocked) echo "Bloqueo técnico. Revisá PROGRESO.md y runs/latest.json"; exit 4 ;;
    done)
      if [[ -f "$PROJECT_DIR/package.json" ]] && node -e 'let p=require(process.argv[1]);process.exit(p.scripts&&p.scripts.verify?0:1)' "$PROJECT_DIR/package.json"; then
        command -v npm >/dev/null || { echo 'Falta npm para verificar' >&2; exit 3; }
        if ! (cd "$PROJECT_DIR" && npm run verify); then
          echo 'Falló npm run verify; solucionar antes de cerrar' > "$RUN_DIR/verification_failed.txt"
          echo 'Verificación fallida' >&2
          continue
        fi
        rm -f "$RUN_DIR/verification_failed.txt"
      fi
      if ! grep -Eq '^Estado:[[:space:]]*APROBADO_POR_OPERADOR[[:space:]]*$' "$MANUAL"; then
        echo 'No hay aprobación manual en SketchUp: no puede declararse terminado' >&2
        exit 3
      fi
      echo 'Loop terminado, verificaciones automáticas y aprobación manual presentes'; exit 0 ;;
  esac
done
echo "Alcanzado el límite de $MAX_CYCLES ciclos; ejecutá otra vez para continuar" >&2
exit 2
