param([int]$MaxCycles=6)
$ErrorActionPreference='Stop'
$root='planos-santo-loop-ux-082'
if ($MaxCycles -lt 1 -or $MaxCycles -gt 10) { throw 'Ciclos por corrida: 1..10' }
if (-not (Test-Path "$root/PROMPT_CODEX.md")) { throw "Ejecutar desde la raíz con $root/" }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'No se encontró Codex CLI. Usá INSTRUCCION_CLOUD.md en la interfaz.' }
$s=Get-Content "$root/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if ($s.state -ne 'CONTINUAR') { throw "Loop detenido: $($s.state), revisá PROGRESO.md" }
New-Item -ItemType Directory -Force -Path "$root/runs" | Out-Null
$start=[int]$s.last_cycle+1
for ($i=$start; $i -lt $start+$MaxCycles; $i++) {
 $prompt=@"
Ejecutá ciclo $i del loop UI/UX de Planos Santo. Leé los documentos en $root, en particular PROMPT_CODEX.md, BACKLOG.md, CRITERIOS.md, SEGURIDAD.md, DISENO_UX.md y CATALOGO_SKM.md.
Implementá en el código actual; no uses referencia RBZ para reemplazar avances posteriores.
Registrá avances en PROGRESO.md y actualizá ESTADO.json last_cycle=$i y state=CONTINUAR, CANDIDATA_PARA_VALIDAR, NECESITA_SKETCHUP o BLOQUEADO. No declares validación SketchUp sin ejecutarla.
"@
 $pf="$root/runs/cycle_${i}_prompt.txt"; $of="$root/runs/cycle_${i}_output.txt"
 $prompt | Set-Content -Path $pf -Encoding UTF8
 Get-Content $pf -Raw -Encoding UTF8 | codex exec --sandbox workspace-write --skip-git-repo-check --output-last-message $of -
 if ($LASTEXITCODE -ne 0) { throw "Codex falló en ciclo $i" }
 $s=Get-Content "$root/ESTADO.json" -Raw -Encoding UTF8 | ConvertFrom-Json
 if ($s.last_cycle -ne $i) { throw "Codex no actualizó last_cycle=$i" }
 if ($s.state -notin @('CONTINUAR','CANDIDATA_PARA_VALIDAR','NECESITA_SKETCHUP','BLOQUEADO')) { throw 'Estado no reconocido' }
 Write-Host "Ciclo $i estado: $($s.state)"
 if ($s.state -ne 'CONTINUAR') { return }
}
Write-Host 'Máximo de ciclos alcanzado; revisar avances.'
