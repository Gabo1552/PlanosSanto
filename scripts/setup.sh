#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_TELEMETRY_DISABLED=1
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/workspace/.npm-cache}"
node -e 'const v=Number(process.versions.node.split(".")[0]);if(v<22){throw new Error("Se necesita Node.js 22 o superior; verificado con Node 24.")}'
npm ci --no-audit --no-fund
python3 scripts/prepare-ruby.py
if [ -x "${CHROMIUM_PATH:-/usr/bin/chromium}" ]; then
  "${CHROMIUM_PATH:-/usr/bin/chromium}" --version
else
  node --input-type=module -e 'import { chromium } from "playwright";import { accessSync,constants } from "node:fs";accessSync(chromium.executablePath(),constants.X_OK)'
fi
command -v pdftotext >/dev/null || { echo 'Falta Poppler (pdftotext), necesario para verificar el PDF.' >&2; exit 1; }
npm run build
