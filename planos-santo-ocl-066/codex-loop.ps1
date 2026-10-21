param(
    [ValidateRange(1,12)] [int]$MaxCycles = 6,
    [switch]$Check,
    [string]$Model = "",
    [ValidateSet("low","medium","high","xhigh")] [string]$Effort = "high"
)
$ErrorActionPreference = "Stop"
$Runner = Join-Path $PSScriptRoot "scripts\run_loop.py"
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCmd) { $PythonExe = "python"; $pyArgs = @() }
else {
    $Launcher = Get-Command py -ErrorAction SilentlyContinue
    if (-not $Launcher) { throw "Necesitás Python 3 para ejecutar el loop" }
    $PythonExe = "py"; $pyArgs = @("-3")
}
$arguments = @($Runner, "$MaxCycles", "--effort", $Effort)
if ($Check) { $arguments += "--check" }
if ($Model) { $arguments += @("--model", $Model) }
& $PythonExe @pyArgs @arguments
exit $LASTEXITCODE
