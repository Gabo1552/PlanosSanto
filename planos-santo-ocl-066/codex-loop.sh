#!/usr/bin/env bash
set -euo pipefail
LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null; then echo 'Falta Python 3' >&2; exit 5; fi
exec python3 "$LOOP_DIR/scripts/run_loop.py" "$@"
