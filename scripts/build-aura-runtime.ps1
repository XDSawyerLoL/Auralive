param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

& $Python -m pip install -r aura_runtime/requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Impossible d'installer les dépendances AURA Runtime." }

& $Python -m pip install "pyinstaller==6.22.2"
if ($LASTEXITCODE -ne 0) { throw "Impossible d'installer PyInstaller." }

if (Test-Path "dist\AuraRuntime") {
  Remove-Item -Recurse -Force "dist\AuraRuntime"
}

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --name "AuraRuntime" `
  --collect-submodules "aiohttp" `
  "aura_runtime/entrypoint.py"

if ($LASTEXITCODE -ne 0) { throw "La construction de AuraRuntime.exe a échoué." }
if (-not (Test-Path "dist\AuraRuntime\AuraRuntime.exe")) {
  throw "AuraRuntime.exe absent du package."
}

Copy-Item "aura_runtime\README.md" "dist\AuraRuntime\README.md" -Force
Copy-Item "aura_runtime\requirements.txt" "dist\AuraRuntime\requirements.txt" -Force
Copy-Item "aura_runtime\.env.example" "dist\AuraRuntime\.env.example" -Force

$raw = & "dist\AuraRuntime\AuraRuntime.exe" --check
if ($LASTEXITCODE -ne 0) { throw "AuraRuntime.exe --check a échoué." }
$payload = $raw | ConvertFrom-Json
if ($payload.ok -ne $true) { throw "Diagnostic AuraRuntime.exe invalide." }
if ($payload.component -ne "aura-runtime") { throw "Composant inattendu: $($payload.component)" }
if ($payload.studio_required -ne $false) { throw "AuraRuntime.exe dépend encore de Quantic Studio." }
if (-not ($payload.job_kinds -contains "compute")) { throw "Capacité compute absente." }

Write-Host "AURA Runtime standalone prêt : dist\AuraRuntime\AuraRuntime.exe" -ForegroundColor Green
