param([ValidateRange(1,8)][int]$MaxCycles=6,[switch]$DryRun)
$ErrorActionPreference='Stop'
$LoopDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot=Split-Path -Parent $LoopDir
Set-Location $ProjectRoot
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Requiere Python para comprobar el estado.' }
& python "$LoopDir/scripts/auditar_base.py" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'La referencia 0.8.5 no pasó integridad.' }
if ($DryRun) { Write-Host "Prueba seca correcta. Sin ejecutar Codex. Máximo $MaxCycles ciclos.";exit 0 }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Falta Codex CLI; seguí INSTRUCCION_CLOUD.md en la interfaz.' }
New-Item -ItemType Directory -Path "$LoopDir/runs" -Force | Out-Null
for ($i=0; $i -lt $MaxCycles; $i++) {
  $state=Get-Content "$LoopDir/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($state.state -ne 'CONTINUAR') { throw "Detenido: $($state.state). Revisar PROGRESO.md" }
  $next=[int]$state.last_cycle+1
  $prompt="Realizá SOLO el ciclo $next del loop UX Planos Santo 0.8.5. Leé $LoopDir/PROMPT_CODEX.md, AUDITORIA_085.md, BACKLOG.md, CONTRATO_PINTURA_RAPIDA.md, UX_NOMBRES.md, UX_PLANOS_A4.md, BARRA_E_ICONOS.md, ACEPTACION_Y_PRUEBAS.md y SEGURIDAD.md. Usá el código MÁS RECIENTE; no reemplaces con RBZ. Implementá código+pruebas, documentá evidencia, actualizá PROGRESO.md y ESTADO.json last_cycle=$next con CONTINUAR/NECESITA_SKETCHUP/CANDIDATA_PARA_VALIDAR/BLOQUEADO. No reportes pruebas reales de SketchUp desde nube ni ejecutes loops anidados."
  $p="$LoopDir/runs/cycle_${next}_prompt.txt"; $out="$LoopDir/runs/cycle_${next}_output.txt"
  [System.IO.File]::WriteAllText($p,$prompt,[System.Text.UTF8Encoding]::new($false))
  Get-Content $p -Raw -Encoding UTF8 | & codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message $out -
  if ($LASTEXITCODE -ne 0) { throw 'Codex devolvió error; revisar salida antes de reintentar.' }
  $state=Get-Content "$LoopDir/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$state.last_cycle -ne $next) { throw "Codex no actualizó last_cycle=$next" }
  if ($state.state -notin @('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO')) { throw 'Estado inválido' }
  Write-Host "Ciclo $next : $($state.state)"
  if ($state.state -ne 'CONTINUAR') { break }
}
