param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$BuildId = "AuraLive-2.5-Windows-ConsoleBoot-2026-09-05"

& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements-desktop.txt
& $Python -m pip install "pyinstaller==6.22.2"

if (Test-Path "build\AuraLive") { Remove-Item -Recurse -Force "build\AuraLive" }
if (Test-Path "dist\AuraLive") { Remove-Item -Recurse -Force "dist\AuraLive" }

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --console `
    --hide-console hide-early `
    --onedir `
    --name "AuraLive" `
    --paths "." `
    --hidden-import "uvicorn.logging" `
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
Set-Content "dist\AuraLive\BUILD-ID.txt" -Value $BuildId -Encoding ascii

@"
AURA LIVE - APPLICATION WINDOWS
Build: $BuildId

1. Copie ton fichier .env existant dans ce dossier, a cote de AuraLive.exe.
2. Double-clique AuraLive.exe.
3. Aura Live demarre son moteur local puis ouvre une fenetre d'application dediee via Microsoft Edge ou Google Chrome.

Cette version utilise le bootloader console PyInstaller avec console masquee, et non plus le mode --windowed.
Cela conserve de vrais flux stdout/stderr pour Uvicorn et le logging Windows.

Tes donnees sont conservees dans le dossier data place a cote de l'application.
Les overlays OBS restent disponibles sur http://localhost:8787/overlay et les autres URL Aura habituelles.
En cas de probleme, envoie AuraLive-startup.log et BUILD-ID.txt.
"@ | Set-Content "dist\AuraLive\DEMARRAGE.txt" -Encoding UTF8

Write-Host "Build pret : dist\AuraLive\AuraLive.exe ($BuildId)" -ForegroundColor Green
