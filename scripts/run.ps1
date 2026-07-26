$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Aura n'est pas encore installée. Lancement de la réparation..." -ForegroundColor Yellow
    & (Join-Path $ProjectRoot "reparer-installation.ps1")
}

if (-not (Test-Path $VenvPython)) {
    throw "Python virtuel introuvable après installation."
}

Write-Host "Aura Live 2.0 — lancement du noyau historique et d'Automation Studio" -ForegroundColor Cyan
& $VenvPython -m app.main_v2
if ($LASTEXITCODE -ne 0) {
    throw "Aura s'est arrêtée avec le code $LASTEXITCODE."
}
