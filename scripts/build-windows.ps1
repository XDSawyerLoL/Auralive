param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$BuildId = "AuraLive-2.5-Windows-NaturalMairaiy-2026-09-05"
$KokoroModelUrl = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
$KokoroVoicesUrl = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

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
    --collect-all "kokoro_onnx" `
    --collect-all "misaki" `
    --collect-all "espeakng_loader" `
    --collect-all "soundfile" `
    --collect-all "onnxruntime" `
    --collect-all "language_tags" `
    --collect-all "csvw" `
    --collect-all "segments" `
    --collect-submodules "phonemizer" `
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
# Le package demarre directement en Ollama + Kokoro, sans ancienne configuration ni cle Gemini.
Copy-Item ".env.example" "dist\AuraLive\.env" -Force
Copy-Item "README.md" "dist\AuraLive\README.md" -Force
Copy-Item "LISEZ-MOI.txt" "dist\AuraLive\LISEZ-MOI.txt" -Force
New-Item -ItemType Directory -Force -Path "dist\AuraLive\data\media" | Out-Null
$KokoroDir = "dist\AuraLive\data\voices\kokoro"
New-Item -ItemType Directory -Force -Path $KokoroDir | Out-Null

function Download-CheckedFile {
    param(
        [string]$Url,
        [string]$Destination,
        [long]$MinimumBytes
    )
    if (Test-Path $Destination) {
        $existingSize = (Get-Item $Destination).Length
        if ($existingSize -ge $MinimumBytes) {
            Write-Host "Actif Kokoro deja present: $Destination ($existingSize octets)"
            return
        }
        Remove-Item $Destination -Force
    }
    $partial = "$Destination.part"
    if (Test-Path $partial) { Remove-Item $partial -Force }
    Write-Host "Telechargement Kokoro: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
    $size = (Get-Item $partial).Length
    if ($size -lt $MinimumBytes) {
        Remove-Item $partial -Force
        throw "Actif Kokoro incomplet: $Destination ($size octets)"
    }
    Move-Item $partial $Destination -Force
}

Download-CheckedFile `
    -Url $KokoroModelUrl `
    -Destination "$KokoroDir\kokoro-v1.0.onnx" `
    -MinimumBytes 250000000
Download-CheckedFile `
    -Url $KokoroVoicesUrl `
    -Destination "$KokoroDir\voices-v1.0.bin" `
    -MinimumBytes 10000000

Set-Content "dist\AuraLive\BUILD-ID.txt" -Value $BuildId -Encoding ascii

@"
AURA LIVE - APPLICATION WINDOWS
Build: $BuildId

1. Double-clique AuraLive.exe.
2. Aura Live demarre son moteur local puis ouvre une fenetre d'application dediee via Microsoft Edge ou Google Chrome.
3. Mairaiy utilise Kokoro local avec la voix ff_siwis comme voix principale.
4. Les conversations vocales directes avec Sansa utilisent le modele local de qualite configure (gemma3:12b par defaut) et ignorent le bruit du chat Twitch.

Aucune cle Gemini n'est necessaire pour la voix principale.
Le fichier .env livre avec l'application est deja configure en Ollama + Kokoro.
Si Ollama est installe et gemma3:12b disponible, la conversation IA fonctionne aussi sans API payante.

Gemini/Aoede reste un secours optionnel : ajoute une cle dans AI_API_KEY ou TTS_API_KEY uniquement si tu veux l'utiliser.
Piper reste le dernier secours local si Kokoro et Gemini sont indisponibles.
Aucune bascule aleatoire vers les voix Windows ou navigateur n'est autorisee par defaut.

Cette version conserve le bootloader console PyInstaller avec console masquee et de vrais flux stdout/stderr pour Uvicorn.
Tes donnees sont conservees dans le dossier data place a cote de l'application.
Les overlays OBS restent disponibles sur http://localhost:8787/overlay et les autres URL Aura habituelles.
En cas de probleme, envoie AuraLive-startup.log et BUILD-ID.txt.
"@ | Set-Content "dist\AuraLive\DEMARRAGE.txt" -Encoding UTF8

Write-Host "Build pret : dist\AuraLive\AuraLive.exe ($BuildId)" -ForegroundColor Green
