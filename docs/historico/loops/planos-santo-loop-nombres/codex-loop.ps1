param(
  [ValidateRange(1, 50)][int]$MaxCycles = 6,
  [string]$Model = '',
  [ValidateSet('medium', 'high', 'xhigh')][string]$ReasoningEffort = 'high'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$loopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = [System.IO.Path]::GetFullPath((Join-Path $loopDir '..'))
$runDir = Join-Path $loopDir 'runs'
$promptPath = Join-Path $loopDir 'LOOP_PROMPT.md'
$schemaPath = Join-Path $loopDir 'codex-output.schema.json'
$manualPath = Join-Path $loopDir 'VALIDACION_SKETCHUP.md'
foreach ($cmd in @('codex', 'git', 'node')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Falta $cmd en PATH" }
}
& git -C $projectDir rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { throw 'Se necesita el repositorio Git de Planos Santo' }
foreach ($p in @($promptPath, $schemaPath, $manualPath)) {
  if (-not (Test-Path $p)) { throw "Falta $p" }
}
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$session = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID
$promptBase = Get-Content -Raw -Encoding UTF8 $promptPath
Write-Host "Loop SOLO nombres / proyecto: $projectDir / máximo $MaxCycles ciclos"
for ($i = 1; $i -le $MaxCycles; $i++) {
  $id = '{0:000}' -f $i
  $reportPath = Join-Path $runDir "$session-ciclo-$id.json"
  $logPath = Join-Path $runDir "$session-ciclo-$id.log"
  $latestPath = Join-Path $runDir 'latest.json'
  $cyclePrompt = "$promptBase`n`nCICLO $i/$MaxCycles. Revisá TAREAS.md, PROGRESO.md y runs/latest.json de planos-santo-loop-nombres. Si runs/verification_failed.txt existe, corregilo primero. RESPONDÉ SOLO JSON.`n"
  $argsCLI = @('--ask-for-approval','never','exec','-C',$projectDir,'--sandbox','workspace-write','--config',"model_reasoning_effort=$ReasoningEffort",'--output-schema',$schemaPath,'--output-last-message',$reportPath)
  if (-not [string]::IsNullOrWhiteSpace($Model)) { $argsCLI += @('--model',$Model) }
  elseif (-not [string]::IsNullOrWhiteSpace($env:CODEX_MODEL)) { $argsCLI += @('--model',$env:CODEX_MODEL) }
  $argsCLI += '-'
  Write-Host "=== Ciclo $i/$MaxCycles ==="
  $cyclePrompt | & codex @argsCLI 2>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { Write-Error "Codex falló ($exitCode): $logPath"; exit 5 }
  if (-not (Test-Path $reportPath)) { Write-Error "Sin reporte: $reportPath"; exit 6 }
  try {
    $report = Get-Content -Raw -Encoding UTF8 $reportPath | ConvertFrom-Json
    if (-not ($report.state -in @('working','needs_user','blocked','done'))) { throw 'Estado no reconocido' }
  } catch { Write-Error "Reporte inválido: $_"; exit 6 }
  Copy-Item $reportPath $latestPath -Force
  Write-Host "Estado: $($report.state) / Próximo: $($report.next_step)"
  if ($report.state -eq 'working') { continue }
  if ($report.state -eq 'needs_user') { Write-Warning "Prueba humana: $manualPath"; exit 3 }
  if ($report.state -eq 'blocked') { Write-Warning 'Bloqueo; ver PROGRESO.md'; exit 4 }
  $packagePath = Join-Path $projectDir 'package.json'
  if (Test-Path $packagePath) {
    $pkg = Get-Content -Raw -Encoding UTF8 $packagePath | ConvertFrom-Json
    if ($null -ne $pkg.scripts -and $pkg.scripts.PSObject.Properties.Name -contains 'verify') {
      if (-not (Get-Command 'npm' -ErrorAction SilentlyContinue)) { Write-Warning 'Falta npm'; exit 3 }
      Push-Location $projectDir
      try { & npm run verify; $testExit = $LASTEXITCODE } finally { Pop-Location }
      if ($testExit -ne 0) {
        'Falló npm run verify; corregir antes de cerrar' | Set-Content -Encoding UTF8 (Join-Path $runDir 'verification_failed.txt')
        Write-Warning 'Verificación fallida; continuar en siguiente ciclo'; continue
      }
      if (Test-Path (Join-Path $runDir 'verification_failed.txt')) { Remove-Item (Join-Path $runDir 'verification_failed.txt') }
    }
  }
  $manualText = Get-Content -Raw -Encoding UTF8 $manualPath
  if ($manualText -notmatch '(?m)^Estado:[ \t]*APROBADO_POR_OPERADOR[ \t]*$') {
    Write-Warning 'Falta aprobación manual de SketchUp 2026. NO terminado.'; exit 3
  }
  Write-Host 'Validaciones aprobadas: loop finalizado'; exit 0
}
Write-Warning "Se llegó al máximo de $MaxCycles ciclos; ejecutar de nuevo para continuar"
exit 2
