#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null; then echo 'Se requiere Python 3' >&2; exit 5; fi
exec python3 "$DIR/scripts/run_loop.py" --max-cycles "${1:-6}" "${@:2}"
