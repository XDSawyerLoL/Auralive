param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$BuildId = "AuraLive-2.5-Windows-FastVoiceOAuth-LITE-2026-09-05"

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
    throw "La compilation Windows Aura Live Lite a echoue."
}

Copy-Item ".env.example" "dist\AuraLive\.env.example" -Force
Copy-Item ".env.example" "dist\AuraLive\.env" -Force
Copy-Item "README.md" "dist\AuraLive\README.md" -Force
Copy-Item "LISEZ-MOI.txt" "dist\AuraLive\LISEZ-MOI.txt" -Force
New-Item -ItemType Directory -Force -Path "dist\AuraLive\data\media" | Out-Null
New-Item -ItemType Directory -Force -Path "dist\AuraLive\data\voices\kokoro" | Out-Null

# Le build Lite n'embarque volontairement pas les gros fichiers Kokoro.
# LocalKokoroVoice les telecharge automatiquement au premier lancement.
$envPath = "dist\AuraLive\.env"
$envText = Get-Content $envPath -Raw
if ($envText -match '(?m)^MAIRAIY_KOKORO_AUTO_DOWNLOAD=') {
    $envText = [regex]::Replace($envText, '(?m)^MAIRAIY_KOKORO_AUTO_DOWNLOAD=.*$', 'MAIRAIY_KOKORO_AUTO_DOWNLOAD=true')
} else {
    $envText += "`r`nMAIRAIY_KOKORO_AUTO_DOWNLOAD=true`r`n"
}
Set-Content $envPath -Value $envText -Encoding UTF8

Set-Content "dist\AuraLive\BUILD-ID.txt" -Value $BuildId -Encoding ascii

@"
AURA LIVE - WINDOWS LITE
Build: $BuildId

1. Double-clique AuraLive.exe.
2. Au premier usage de la voix, Aura Live telecharge automatiquement les fichiers Kokoro dans data\voices\kokoro.
3. Ensuite la voix fonctionne localement comme dans le build complet.
4. La connexion Twitch s'ouvre dans ton navigateur Windows normal.
5. Tester la voix ne depend pas d'OBS.
6. Le Voice Control utilise le chemin court gemma3:12b -> Kokoro.

Aucune cle Gemini n'est necessaire pour Kokoro.
Ollama + gemma3:12b restent necessaires pour la conversation IA locale de qualite.
Ne ferme pas Aura Live pendant le premier telechargement Kokoro.
"@ | Set-Content "dist\AuraLive\DEMARRAGE-LITE.txt" -Encoding UTF8

Write-Host "Build Lite pret : dist\AuraLive\AuraLive.exe ($BuildId)" -ForegroundColor Green
