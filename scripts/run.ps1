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

    # Sous Windows PowerShell 5.1, un module absent écrit son traceback sur stderr.
    # Avec ErrorActionPreference=Stop, ce stderr devient une NativeCommandError avant
    # que le script puisse lire $LASTEXITCODE et lancer la réparation. On neutralise
    # donc uniquement ce test attendu, puis on restaure immédiatement le comportement strict.
    $previousPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = "Continue"
        $null = & $PythonPath -c "import fastapi, uvicorn, aiohttp, dotenv, websockets, multipart, PIL" 2>&1
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 1
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    return ($exitCode -eq 0)
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "Aura n'est pas encore installée. Lancement de la réparation..." -ForegroundColor Yellow
    & (Join-Path $ProjectRoot "reparer-installation.ps1")
}

if (-not (Test-Path $VenvPython)) {
    throw "Python virtuel introuvable après installation."
}

# Après un git pull/reset, requirements.txt peut avoir changé alors que .venv existe
# toujours. Aura vérifie donc le hash et les imports indispensables avant chaque
# lancement, puis ne relance pip que lorsqu'une réparation est réellement utile.
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
    Write-Host "Mise à jour des dépendances Aura Live..." -ForegroundColor Yellow
    & $VenvPython -m pip install -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "La mise à jour des dépendances a échoué. Vérifie la connexion Internet puis relance .\aura.bat."
    }

    if (-not (Test-AuraPythonImports -PythonPath $VenvPython)) {
        throw "Les dépendances sont toujours incomplètes après réparation. Lance .\reparer-installation.ps1."
    }

    if ($CurrentRequirementsHash) {
        Set-Content -Path $RequirementsStamp -Value $CurrentRequirementsHash -Encoding ascii
    }
    Write-Host "Dépendances prêtes." -ForegroundColor Green
}

Write-Host "Aura Live 2.2 — lancement du noyau, de la coanimation et de la perception live" -ForegroundColor Cyan
& $VenvPython -m app.main_v2
if ($LASTEXITCODE -ne 0) {
    throw "Aura s'est arrêtée avec le code $LASTEXITCODE."
}
