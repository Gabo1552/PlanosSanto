param(
  [ValidateRange(1, 12)][int]$MaxCycles = 6,
  [string]$Model = '',
  [ValidateSet('low','medium','high','xhigh')][string]$ReasoningEffort = 'high',
  [switch]$CheckOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$loopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = [IO.Path]::GetFullPath((Join-Path $loopDir '..'))
$runDir = Join-Path $loopDir 'runs'
$promptPath = Join-Path $loopDir 'LOOP_PROMPT.md'
$schemaPath = Join-Path $loopDir 'codex-output.schema.json'
$approvalPath = Join-Path $HOME '.planos-santo\aprobacion-sketchup2026.txt'
foreach ($tool in @('codex','git')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool en PATH" }
}
$py = 'python'
$pyPrefix = @()
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  if (Get-Command py -ErrorAction SilentlyContinue) { $py = 'py'; $pyPrefix = @('-3') }
  else { throw 'Falta Python 3 (python o py -3)' }
}
& git -C $projectDir rev-parse --is-inside-work-tree 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Se necesita un repositorio Git: protegé el proyecto con una copia/rama antes de continuar' }
if (-not (Test-Path $promptPath) -or -not (Test-Path $schemaPath)) { throw 'Faltan instrucciones del loop' }
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$gitDir = (& git -C $projectDir rev-parse --absolute-git-dir | Out-String).Trim()
$excludePath = Join-Path $gitDir 'info\exclude'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $excludePath) | Out-Null
if (-not (Test-Path $excludePath)) { New-Item -ItemType File -Path $excludePath | Out-Null }
foreach ($pattern in @('/planos-santo-arranque/referencias_privadas/','/planos-santo-arranque/runs/')) {
  if (-not (Select-String -Path $excludePath -Pattern $pattern -SimpleMatch -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $excludePath -Value $pattern -Encoding UTF8
  }
}
& $py @pyPrefix (Join-Path $loopDir 'scripts\verificar_corpus.py')
if ($LASTEXITCODE -ne 0) { throw 'Los modelos del corpus no pasaron los hashes de referencia' }
& $py @pyPrefix -m unittest discover -s (Join-Path $loopDir 'tests') -q
if ($LASTEXITCODE -ne 0) { throw 'Fallaron tests de contrato TXT' }
if ($CheckOnly) { Write-Host "Chequeos iniciales OK: $projectDir"; exit 0 }

$session = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID
$promptBase = Get-Content -Raw -Encoding UTF8 $promptPath
Write-Host "PLANOS SANTO :: $projectDir :: máximo $MaxCycles ciclos :: sandbox workspace-write"
for ($i = 1; $i -le $MaxCycles; $i++) {
  $number = '{0:000}' -f $i
  $reportPath = Join-Path $runDir "$session-ciclo-$number.json"
  $logPath = Join-Path $runDir "$session-ciclo-$number.log"
  $cyclePrompt = "$promptBase`n`nCICLO $i/$MaxCycles. Leé TAREAS.md y PROGRESO.md en planos-santo-arranque. Elegí UNA tarea implementable, hacé tests y registrá. Si requiere SketchUp Windows/maderera, state=needs_user. Respuesta final SOLO JSON válido."
  $cliArgs = @('exec','-C',$projectDir,'--sandbox','workspace-write','--config',"model_reasoning_effort=$ReasoningEffort",'--output-schema',$schemaPath,'--output-last-message',$reportPath)
  if (-not [string]::IsNullOrWhiteSpace($Model)) { $cliArgs += @('--model',$Model) }
  elseif (-not [string]::IsNullOrWhiteSpace($env:CODEX_MODEL)) { $cliArgs += @('--model',$env:CODEX_MODEL) }
  $cliArgs += '-'
  Write-Host "---- Ciclo $i / $MaxCycles ----"
  $cyclePrompt | & codex @cliArgs 2>&1 | Tee-Object -FilePath $logPath
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "Codex falló ($code). Ver $logPath" }
  if (-not (Test-Path $reportPath)) { throw "No se generó informe del ciclo: $reportPath" }
  try { $report = Get-Content -Raw -Encoding UTF8 $reportPath | ConvertFrom-Json }
  catch { throw "No se pudo leer el JSON final: $_" }
  if ($report.state -notin @('working','needs_user','blocked','done')) { throw 'Informe state inválido' }
  Copy-Item -Force $reportPath (Join-Path $runDir 'latest.json')
  Write-Host "Estado: $($report.state) / Siguiente: $($report.next_step)"
  if ($report.state -eq 'working') { continue }
  if ($report.state -eq 'needs_user') { Write-Warning 'Falta validación en SketchUp o maderera. Ver VALIDACION_SKETCHUP.md'; exit 3 }
  if ($report.state -eq 'blocked') { Write-Warning 'Bloqueo técnico; ver PROGRESO.md'; exit 4 }
  & $py @pyPrefix (Join-Path $loopDir 'scripts\verificar_corpus.py')
  if ($LASTEXITCODE -ne 0) { throw 'Falla verificación del corpus' }
  & $py @pyPrefix -m unittest discover -s (Join-Path $loopDir 'tests') -q
  if ($LASTEXITCODE -ne 0) { throw 'Tests del TXT fallaron' }
  $packageJson = Join-Path $projectDir 'package.json'
  if (Test-Path $packageJson) {
    $pkg = Get-Content -Raw -Encoding UTF8 $packageJson | ConvertFrom-Json
    if ($null -ne $pkg.scripts -and $pkg.scripts.PSObject.Properties.Name -contains 'verify') {
      if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Falta npm para ejecutar verify' }
      Push-Location $projectDir
      try { & npm run verify; $code = $LASTEXITCODE } finally { Pop-Location }
      if ($code -ne 0) { throw 'Regresión en npm run verify' }
    }
  }
  if (-not (Test-Path $approvalPath) -or (Get-Content -Raw $approvalPath).Trim() -ne 'APROBADO PLANOS SANTO 2026') {
    Write-Warning "Codex completó automatizados, pero falta aprobación externa en $approvalPath"
    exit 3
  }
  Write-Host 'Tests automáticos y aprobación externa OK; revisá evidencia antes de publicar.'
  exit 0
}
Write-Warning "Se alcanzó el máximo de $MaxCycles ciclos. Repetí el comando para continuar."
exit 2
