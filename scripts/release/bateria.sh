#!/usr/bin/env bash
# Batería completa de una versión. Uso: bash scripts/release/bateria.sh [carpeta-de-logs]
# El build va antes de vitest: algunas pruebas leen el bundle recién generado.
# Sale con 1 si falla algún paso; los logs quedan en la carpeta (por defecto artifacts/bateria).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="${1:-$ROOT/artifacts/bateria}"
mkdir -p "$LOGS"
cd "$ROOT"
export LANG=C.UTF-8
failed=0
step() {
  local name=$1; shift
  if "$@" >"$LOGS/$name.log" 2>&1; then echo "$name PASS"; else echo "$name FAIL ($LOGS/$name.log)"; failed=1; fi
}
step tsc npx tsc --noEmit
step eslint npx eslint sketchup_offline/ui tests lib app components
step build npm run build:offline
step vitest npx vitest run
step ruby npm run test:offline:ruby
step ruby27check npm run check:ruby27
step ruby27suite npm run test:offline:ruby27
step rubyexporter npm run test:ruby
step playwright npx playwright test --config playwright.offline.config.ts --reporter=line
step nextbuild npx next build
step web npx playwright test --config playwright.config.ts --reporter=line
echo "logs: $LOGS"
exit $failed
