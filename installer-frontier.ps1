[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$Start
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = (Resolve-Path $PSScriptRoot).Path
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Backup = Join-Path $Root ("backups\frontier-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

function Step([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Require-Success([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

Step "Sauvegarde des donnees locales"
New-Item -ItemType Directory -Force -Path $Backup | Out-Null
if (Test-Path (Join-Path $Root ".env")) {
    Copy-Item (Join-Path $Root ".env") (Join-Path $Backup ".env") -Force
}
if (Test-Path (Join-Path $Root "data")) {
    Copy-Item (Join-Path $Root "data") (Join-Path $Backup "data") -Recurse -Force
}
Write-Host "Sauvegarde : $Backup" -ForegroundColor DarkGray

Step "Verification de Python"
$SystemPython = Get-Command python -ErrorAction SilentlyContinue
if (-not $SystemPython) {
    throw "Python 3.11 ou superieur est requis."
}
$VersionOk = & python -c "import sys; print(int(sys.version_info >= (3,11)))"
if ($VersionOk.Trim() -ne "1") {
    throw "La version de Python doit etre 3.11 ou superieure."
}

Step "Environnement Python isole"
if (-not (Test-Path $Python)) {
    & python -m venv $Venv
    Require-Success "La creation de l'environnement Python a echoue."
}
& $Python -m pip install --upgrade pip
Require-Success "La mise a jour de pip a echoue."
& $Python -m pip install -r (Join-Path $Root "requirements.txt")
Require-Success "L'installation des dependances a echoue."

Step "Controle des fichiers sensibles"
$TrackedSecrets = git ls-files ".env" "data/*.db" "data/*.sqlite" "*token*" "*secret*" 2>$null
if ($TrackedSecrets) {
    throw "Un fichier sensible semble suivi par Git : $($TrackedSecrets -join ', ')"
}

if (-not $SkipTests) {
    Step "Compilation Python"
    & $Python -m compileall -q app tests
    Require-Success "La compilation Python a echoue."

    $Node = Get-Command node -ErrorAction SilentlyContinue
    if ($Node) {
        Step "Validation JavaScript"
        & node --check (Join-Path $Root "app\web\static\app.js")
        Require-Success "app.js contient une erreur JavaScript."
        & node --check (Join-Path $Root "app\web\static\automation.js")
        Require-Success "automation.js contient une erreur JavaScript."
    } else {
        Write-Host "Node.js absent : controle JavaScript local ignore. La CI GitHub reste la reference." -ForegroundColor Yellow
    }

    Step "Tests automatises"
    & $Python -m pytest -q
    Require-Success "Les tests ont echoue. Aura Live Frontier ne sera pas lance."
}

Step "Installation terminee"
Write-Host "Lanceur : $Root\aura-frontier.bat" -ForegroundColor Green
Write-Host "Centre  : http://localhost:8787" -ForegroundColor Green
Write-Host "Studio  : http://localhost:8787/automation" -ForegroundColor Green
Write-Host "Reconnecte mairaiy et SANSAHD depuis le panneau pour les nouveaux droits Twitch." -ForegroundColor Yellow

if ($Start) {
    Start-Process -FilePath (Join-Path $Root "aura-frontier.bat")
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:8787/automation"
}
