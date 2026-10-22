param([ValidateRange(1,8)][int]$MaxCycles=6)
$ErrorActionPreference='Stop'
$LoopDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot=Split-Path -Parent $LoopDir
Set-Location $ProjectRoot
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Codex CLI no está instalado. Usá INSTRUCCION_CLOUD.md.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python no está instalado.' }
python "$LoopDir/scripts/verificar_paquete.py" | Out-Null
New-Item -ItemType Directory -Path "$LoopDir/runs" -Force | Out-Null
for ($i=0; $i -lt $MaxCycles; $i++) {
  $state=Get-Content "$LoopDir/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($state.state -ne 'CONTINUAR') { throw "Loop detenido en estado $($state.state): revisar PROGRESO.md" }
  $next=[int]$state.last_cycle+1
  $prompt="Ejecutá SOLO el ciclo $next del loop de UX Planos Santo. Leé $LoopDir/PROMPT_CODEX.md, BACKLOG.md, CONTRATO_IMAGEN_MATERIAL.md, DISENO_UX.md, ACEPTACION.md y SEGURIDAD.md. Usá código fuente MÁS RECIENTE, no sobrescribas cambios posteriores a 0.8.4. Implementá código, pruebas y registrá PROGRESO.md. Actualizá ESTADO.json con last_cycle=$next y state CONTINUAR/NECESITA_SKETCHUP/CANDIDATA_PARA_VALIDAR/BLOQUEADO. No afirmes pruebas SketchUp nativas desde la nube ni subas activos privados a GitHub. No ejecutes el loop desde dentro del ciclo."
  $path="$LoopDir/runs/cycle_${next}_prompt.txt"
  $out="$LoopDir/runs/cycle_${next}_output.txt"
  [IO.File]::WriteAllText($path,$prompt,[Text.Encoding]::UTF8)
  Get-Content $path -Raw -Encoding UTF8 | & codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message $out -
  if ($LASTEXITCODE -ne 0) { throw 'Codex devolvió error. Se detuvo el loop.' }
  $state=Get-Content "$LoopDir/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$state.last_cycle -ne $next) { throw "Codex no actualizó last_cycle=$next. Revisar." }
  if ($state.state -notin @('CONTINUAR','NECESITA_SKETCHUP','CANDIDATA_PARA_VALIDAR','BLOQUEADO')) { throw 'Estado inválido' }
  if ($state.state -ne 'CONTINUAR') { Write-Host "Loop detenido: $($state.state)";break }
}
