param([ValidateRange(1,12)][int]$MaxCycles = 6)
$ErrorActionPreference = 'Stop'
$base = 'planos-santo-loop-toolbar-082'
if (-not (Test-Path "$base/PROMPT_CODEX.md")) { throw 'Ejecutá desde la raíz del proyecto con la carpeta del loop adentro.' }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Codex CLI no disponible; usá INSTRUCCION_PARA_CLOUD.md.' }
New-Item -ItemType Directory -Force -Path "$base/runs" | Out-Null
for ($i=1; $i -le $MaxCycles; $i++) {
  $out = "$base/runs/cycle_${i}_final.txt"
  $prompt = @"
Realizá el ciclo $i de desarrollo del loop de barra de herramientas de Planos Santo.
Leé $base/PROMPT_CODEX.md, $base/BACKLOG.md, $base/CRITERIOS_ACEPTACION.md y $base/CONTRATO_DE_SEGURIDAD.md.
Actualizá $base/PROGRESO.md y guardá $base/ESTADO.json con last_cycle=$i y un estado explícito.
Trabajá solo en el repositorio actual; no reemplaces código reciente con el RBZ de referencia.
No declares prueba nativa de SketchUp sin ejecutarla realmente.
Seguí la siguiente tarea sin marcar, implementá y probá.
"@
  Write-Host "Ciclo $i/$MaxCycles"
  $prompt | codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message $out -
  if ($LASTEXITCODE -ne 0) { throw "Codex terminó con código $LASTEXITCODE" }
  $status = Get-Content "$base/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($status.last_cycle -ne $i) { throw "Codex no actualizó last_cycle=$i; detener." }
  if ($status.state -notin @('CONTINUAR','CANDIDATA_PARA_VALIDAR','NECESITA_SKETCHUP','BLOQUEADO')) { throw 'Estado desconocido; detener.' }
  Write-Host "Estado: $($status.state)"
  if ($status.state -ne 'CONTINUAR') { Write-Host "Loop detenido; revisá $base/PROGRESO.md"; exit 0 }
}
Write-Host 'Límite de ciclos alcanzado. No implica trabajo terminado.'
