[CmdletBinding()]
param(
    [string]$LegacySource = "C:\Users\valen\Desktop\AuraLive",
    [switch]$ImportLegacy,
    [switch]$SkipTests,
    [switch]$Start
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = (Resolve-Path $PSScriptRoot).Path
$Venv = Join-Path $Root ".venv-v2"
$Python = Join-Path $Venv "Scripts\python.exe"

function Step([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

Step "Vérification de Python"
$systemPython = Get-Command python -ErrorAction SilentlyContinue
if (-not $systemPython) {
    throw "Python 3.11 ou supérieur est requis."
}
$version = & python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
Write-Host "Python $version"

if ($ImportLegacy) {
    Step "Import sécurisé de la V1.2"
    & (Join-Path $Root "scripts\import-v1.2.ps1") -Source $LegacySource -Repository $Root
}

Step "Création de l'environnement isolé"
if (-not (Test-Path $Python)) {
    & python -m venv $Venv
}
& $Python -m pip install --upgrade pip
& $Python -m pip install -e "$Root[dev]"

if (-not $SkipTests) {
    Step "Tests de non-régression"
    Push-Location $Root
    try {
        & $Python -m pytest -q
        if ($LASTEXITCODE -ne 0) { throw "Les tests ont échoué. Aura Live 2 ne sera pas lancé." }
    }
    finally {
        Pop-Location
    }
}

$Launcher = Join-Path $Root "aura-live-2.bat"
@"
@echo off
cd /d "$Root"
"$Python" -m auralive
pause
"@ | Set-Content -LiteralPath $Launcher -Encoding ASCII

Step "Installation terminée"
Write-Host "Lanceur : $Launcher" -ForegroundColor Green
Write-Host "Panneau : http://localhost:8787" -ForegroundColor Green
Write-Host "Les secrets restent dans le .env de ton installation locale et ne sont jamais copiés dans GitHub." -ForegroundColor DarkGray

if ($Start) {
    Start-Process -FilePath $Launcher
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8787"
}
