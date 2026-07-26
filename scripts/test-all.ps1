$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$Python = ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Lance d'abord .\reparer-installation.ps1" }
& $Python -m compileall -q app tests
& $Python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw "Les tests Aura ont échoué." }
Write-Host "Aura Live : compilation et tests validés." -ForegroundColor Green
