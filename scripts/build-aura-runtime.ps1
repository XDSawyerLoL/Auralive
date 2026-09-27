param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

& $Python -m pip install -r aura_runtime/requirements.txt
& $Python -m pip install "pyinstaller==6.22.2"

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

if (-not (Test-Path "dist\AuraRuntime\AuraRuntime.exe")) {
  throw "AuraRuntime.exe absent du package."
}

Copy-Item "aura_runtime\README.md" "dist\AuraRuntime\README.md" -Force
Copy-Item "aura_runtime\requirements.txt" "dist\AuraRuntime\requirements.txt" -Force

$check = & "dist\AuraRuntime\AuraRuntime.exe" --check
if ($LASTEXITCODE -ne 0) {
  throw "AuraRuntime.exe --check a échoué."
}
if ($check -notmatch '"component": "aura-runtime"') {
  throw "Diagnostic AuraRuntime.exe invalide: $check"
}
if ($check -notmatch '"studio_required": false') {
  throw "AuraRuntime.exe dépend encore de Quantic Studio: $check"
}

Write-Host "AURA Runtime standalone prêt : dist\AuraRuntime\AuraRuntime.exe" -ForegroundColor Green
