param([ValidateRange(1,30)][int]$MaxCycles=6,[switch]$DryRun)
$ErrorActionPreference='Stop'
$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
$script=Join-Path $dir 'scripts\run_loop.py'
$argsCLI=@($script,'--max-cycles',"$MaxCycles")
if($DryRun){$argsCLI+='--dry-run'}
if(Get-Command py -ErrorAction SilentlyContinue){& py -3 @argsCLI}
elseif(Get-Command python -ErrorAction SilentlyContinue){& python @argsCLI}
else{throw 'Instalá Python 3'}
exit $LASTEXITCODE
