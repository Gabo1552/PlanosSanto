param([int]$MaxCycles=6,[switch]$DryRun,[switch]$ResumeAfterUser)
$ErrorActionPreference='Stop'
$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
$script=Join-Path $dir 'scripts\run_loop.py'
$arguments=@($script, '--max-cycles', "$MaxCycles")
if ($DryRun) { $arguments+= '--dry-run' }
if ($ResumeAfterUser) { $arguments+= '--resume-after-user' }
if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 @arguments }
elseif (Get-Command python -ErrorAction SilentlyContinue) { & python @arguments }
else { Write-Error 'Instalá Python 3'; exit 5 }
exit $LASTEXITCODE
