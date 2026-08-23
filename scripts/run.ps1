param(
    [switch]$Headless
)

$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$RequirementsPath = Join-Path $ProjectRoot "requirements.txt"
$RequirementsStamp = Join-Path $ProjectRoot ".venv\requirements.sha256"

function Test-AuraPythonImports {
    param(
        [Parameter(Mandatory = $true)][string]$PythonPath
    )

    $previousPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = "Continue"
        $null = & $PythonPath -c "import fastapi, uvicorn, aiohttp, dotenv, websockets, multipart, PIL, piper" 2>&1
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 1
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    return ($exitCode -eq 0)
}

# Keep this launcher strictly ASCII. Windows PowerShell 5.1 can misread UTF-8
# without a BOM and turn an em dash into a smart quote that breaks parsing.
if (-not (Test-Path $VenvPython)) {
    Write-Host "Aura n'est pas encore installee. Lancement de la reparation..." -ForegroundColor Yellow
    & (Join-Path $ProjectRoot "reparer-installation.ps1")
}

if (-not (Test-Path $VenvPython)) {
    throw "Python virtuel introuvable apres installation."
}

$CurrentRequirementsHash = ""
if (Test-Path $RequirementsPath) {
    $CurrentRequirementsHash = (Get-FileHash $RequirementsPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

$InstalledRequirementsHash = ""
if (Test-Path $RequirementsStamp) {
    $InstalledRequirementsHash = (Get-Content $RequirementsStamp -Raw).Trim().ToLowerInvariant()
}

$ImportsReady = Test-AuraPythonImports -PythonPath $VenvPython
$RequirementsChanged = (-not $CurrentRequirementsHash) -or ($CurrentRequirementsHash -ne $InstalledRequirementsHash)

if ($RequirementsChanged -or -not $ImportsReady) {
    Write-Host "Mise a jour des dependances Aura Live..." -ForegroundColor Yellow
    & $VenvPython -m pip install -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "La mise a jour des dependances a echoue. Verifie la connexion Internet puis relance .\aura.bat."
    }

    if (-not (Test-AuraPythonImports -PythonPath $VenvPython)) {
        throw "Les dependances sont toujours incompletes apres reparation. Lance .\reparer-installation.ps1."
    }

    if ($CurrentRequirementsHash) {
        Set-Content -Path $RequirementsStamp -Value $CurrentRequirementsHash -Encoding ascii
    }
    Write-Host "Dependances pretes." -ForegroundColor Green
}

$LocalVoiceEnabled = $true
if ($env:MAIRAIY_LOCAL_VOICE_ENABLED) {
    $LocalVoiceEnabled = $env:MAIRAIY_LOCAL_VOICE_ENABLED.ToLowerInvariant() -notin @("0", "false", "no", "non", "off")
}
$LocalVoiceAutoDownload = $true
if ($env:MAIRAIY_LOCAL_VOICE_AUTO_DOWNLOAD) {
    $LocalVoiceAutoDownload = $env:MAIRAIY_LOCAL_VOICE_AUTO_DOWNLOAD.ToLowerInvariant() -notin @("0", "false", "no", "non", "off")
}
$LocalVoiceName = if ($env:MAIRAIY_LOCAL_VOICE) { $env:MAIRAIY_LOCAL_VOICE } else { "fr_FR-siwis-medium" }
$LocalVoiceDirValue = if ($env:MAIRAIY_LOCAL_VOICE_DIR) { $env:MAIRAIY_LOCAL_VOICE_DIR } else { "data\voices\piper" }
$LocalVoiceDir = if ([System.IO.Path]::IsPathRooted($LocalVoiceDirValue)) {
    $LocalVoiceDirValue
} else {
    Join-Path $ProjectRoot $LocalVoiceDirValue
}
$LocalVoiceModel = Join-Path $LocalVoiceDir ($LocalVoiceName + ".onnx")
$LocalVoiceConfig = $LocalVoiceModel + ".json"

if ($LocalVoiceEnabled -and $LocalVoiceAutoDownload -and -not $LocalVoiceName.EndsWith(".onnx") -and ((-not (Test-Path $LocalVoiceModel)) -or (-not (Test-Path $LocalVoiceConfig)))) {
    Write-Host "Installation de la voix locale fixe de Mairaiy (une seule fois, environ 65 Mo)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $LocalVoiceDir | Out-Null
    $previousPreference = $ErrorActionPreference
    $downloadExitCode = 1
    try {
        $ErrorActionPreference = "Continue"
        & $VenvPython -m piper.download_voices --data-dir $LocalVoiceDir $LocalVoiceName
        $downloadExitCode = $LASTEXITCODE
    } catch {
        $downloadExitCode = 1
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($downloadExitCode -ne 0 -or -not (Test-Path $LocalVoiceModel) -or -not (Test-Path $LocalVoiceConfig)) {
        Write-Warning "La voix locale n'a pas pu etre installee. Gemini restera le seul moteur vocal disponible."
    } else {
        Write-Host "Voix locale Mairaiy prete." -ForegroundColor Green
    }
}

$AuraHost = if ($env:AURA_HOST) { $env:AURA_HOST } else { "127.0.0.1" }
$AuraPort = if ($env:AURA_PORT) { $env:AURA_PORT } else { "8787" }
$AuraLogLevel = if ($env:LOG_LEVEL) { $env:LOG_LEVEL.ToLowerInvariant() } else { "info" }

if ($Headless) {
    Write-Host "Aura Live 2.5 - mode serveur avec secours local fixe" -ForegroundColor Cyan
    & $VenvPython -m uvicorn app.main_v3:app --host $AuraHost --port $AuraPort --log-level $AuraLogLevel
} else {
    Write-Host "Aura Live 2.5 - application Windows" -ForegroundColor Cyan
    & $VenvPython -m app.desktop
}

if ($LASTEXITCODE -ne 0) {
    throw "Aura s'est arretee avec le code $LASTEXITCODE."
}
