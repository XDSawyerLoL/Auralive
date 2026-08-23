param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements-desktop.txt
& $Python -m pip install "pyinstaller==6.22.0"

if (Test-Path "build\AuraLive") { Remove-Item -Recurse -Force "build\AuraLive" }
if (Test-Path "dist\AuraLive") { Remove-Item -Recurse -Force "dist\AuraLive" }

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --windowed `
    --onedir `
    --name "AuraLive" `
    --paths "." `
    --collect-all "piper" `
    --collect-submodules "uvicorn" `
    --collect-submodules "aiohttp" `
    --collect-submodules "websockets" `
    --add-data "app/web;app/web" `
    --add-data "config;config" `
    "app/desktop.py"

if ($LASTEXITCODE -ne 0) {
    throw "La compilation Windows Aura Live a echoue."
}

Copy-Item ".env.example" "dist\AuraLive\.env.example" -Force
Copy-Item "README.md" "dist\AuraLive\README.md" -Force
Copy-Item "LISEZ-MOI.txt" "dist\AuraLive\LISEZ-MOI.txt" -Force
New-Item -ItemType Directory -Force -Path "dist\AuraLive\data\media" | Out-Null

@"
AURA LIVE - APPLICATION WINDOWS

1. Copie ton fichier .env existant dans ce dossier, a cote de AuraLive.exe.
2. Double-clique AuraLive.exe.
3. Aura Live demarre son moteur local puis ouvre une fenetre d'application dediee via Microsoft Edge ou Google Chrome.

Aucun onglet de navigateur classique n'est necessaire.
Tes donnees sont conservees dans le dossier data place a cote de l'application.
Les overlays OBS restent disponibles sur http://localhost:8787/overlay et les autres URL Aura habituelles.
"@ | Set-Content "dist\AuraLive\DEMARRAGE.txt" -Encoding UTF8

Write-Host "Build pret : dist\AuraLive\AuraLive.exe" -ForegroundColor Green
