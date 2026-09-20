param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$BuildId = "QuanticStudio-2.7.3-Windows-Native-LITE-2026-09-20"

& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements-desktop.txt
& $Python -m pip install "pyinstaller==6.22.2"\n& $Python -m pip install "pillow>=10,<12"\n& $Python scripts\\generate-studio-icon.py

if (Test-Path "build\QuanticStudio") { Remove-Item -Recurse -Force "build\QuanticStudio" }
if (Test-Path "dist\QuanticStudio") { Remove-Item -Recurse -Force "dist\QuanticStudio" }

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --console `
    --hide-console hide-early `
    --onedir `
    --name "QuanticStudio" `\n    --icon "build-assets\\quantic-studio.ico" `
    --paths "." `
    --hidden-import "uvicorn.logging" `
    --collect-all "piper" `
    --collect-all "kokoro_onnx" `
    --collect-all "misaki" `
    --collect-all "espeakng_loader" `
    --collect-all "soundfile" `
    --collect-all "pyaudiowpatch" `
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
    throw "La compilation Windows Quantic Studio Lite a echoue."
}

Copy-Item ".env.example" "dist\QuanticStudio\.env.example" -Force
Copy-Item ".env.example" "dist\QuanticStudio\.env" -Force
Copy-Item "README.md" "dist\QuanticStudio\README.md" -Force
Copy-Item "LISEZ-MOI.txt" "dist\QuanticStudio\LISEZ-MOI.txt" -Force
New-Item -ItemType Directory -Force -Path "dist\QuanticStudio\data\media" | Out-Null
New-Item -ItemType Directory -Force -Path "dist\QuanticStudio\data\voices\kokoro" | Out-Null

# Le build Lite n'embarque volontairement pas les gros fichiers Kokoro.
# LocalKokoroVoice les telecharge automatiquement au premier lancement.
$envPath = "dist\QuanticStudio\.env"
$envText = Get-Content $envPath -Raw
if ($envText -match '(?m)^MAIRAIY_KOKORO_AUTO_DOWNLOAD=') {
    $envText = [regex]::Replace($envText, '(?m)^MAIRAIY_KOKORO_AUTO_DOWNLOAD=.*$', 'MAIRAIY_KOKORO_AUTO_DOWNLOAD=true')
} else {
    $envText += "`r`nMAIRAIY_KOKORO_AUTO_DOWNLOAD=true`r`n"
}
Set-Content $envPath -Value $envText -Encoding UTF8

Set-Content "dist\QuanticStudio\BUILD-ID.txt" -Value $BuildId -Encoding ascii

@"
QUANTIC STUDIO - WINDOWS LITE
Build: $BuildId

1. Double-clique QuanticStudio.exe.
2. Au premier usage de la voix, Quantic Studio telecharge automatiquement les fichiers Kokoro dans data\voices\kokoro.
3. Ensuite la voix fonctionne localement comme dans le build complet.
4. La connexion Twitch s'ouvre dans ton navigateur Windows normal.
5. Aura Native Broadcast + FFmpeg/gfxcapture sont inclus comme dans le build complet.
6. Le son PC/jeu utilise WASAPI loopback, sans cable audio virtuel.
7. Tester la voix ne depend pas d'OBS.
8. Le Voice Control utilise le chemin court gemma3:12b -> Kokoro.

Aucune cle Gemini n'est necessaire pour Kokoro.
Ollama + gemma3:12b restent necessaires pour la conversation IA locale de qualite.
Ne ferme pas Quantic Studio pendant le premier telechargement Kokoro.
"@ | Set-Content "dist\QuanticStudio\DEMARRAGE-LITE.txt" -Encoding UTF8

Write-Host "Build Lite pret : dist\QuanticStudio\QuanticStudio.exe ($BuildId)" -ForegroundColor Green
