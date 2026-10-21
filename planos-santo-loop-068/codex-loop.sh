#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then echo 'Falta Python 3' >&2; exit 5; fi
exec python3 "$HERE/scripts/run_loop.py" "$@"
