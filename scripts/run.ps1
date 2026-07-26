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

& $VenvPython -c "import fastapi, uvicorn, aiohttp, dotenv, websockets, multipart, PIL" *> $null
$ImportsReady = ($LASTEXITCODE -eq 0)
$RequirementsChanged = (-not $CurrentRequirementsHash) -or ($CurrentRequirementsHash -ne $InstalledRequirementsHash)

if ($RequirementsChanged -or -not $ImportsReady) {
    Write-Host "Mise à jour des dépendances Aura Live..." -ForegroundColor Yellow
    & $VenvPython -m pip install -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "La mise à jour des dépendances a échoué. Vérifie la connexion Internet puis relance .\aura.bat."
    }

    & $VenvPython -c "import fastapi, uvicorn, aiohttp, dotenv, websockets, multipart, PIL" *> $null
    if ($LASTEXITCODE -ne 0) {
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
