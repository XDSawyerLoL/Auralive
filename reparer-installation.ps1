[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "=== Réparation et installation Aura Live ===" -ForegroundColor Cyan

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "La commande '$FilePath $($Arguments -join ' ')' a échoué (code $LASTEXITCODE)."
    }
}

function Get-WorkingPython {
    $candidates = @()

    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        $candidates += [PSCustomObject]@{
            Command = $py.Source
            Prefix  = @("-3")
        }
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        $candidates += [PSCustomObject]@{
            Command = $python.Source
            Prefix  = @()
        }
    }

    $commonPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python313\python.exe",
        "$env:ProgramFiles\Python311\python.exe"
    )

    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $candidates += [PSCustomObject]@{
                Command = $path
                Prefix  = @()
            }
        }
    }

    foreach ($candidate in $candidates) {
        try {
            $output = & $candidate.Command @($candidate.Prefix) --version 2>&1
            if ($LASTEXITCODE -eq 0 -and "$output" -match "Python 3\.(1[1-9]|[2-9][0-9])") {
                return $candidate
            }
        } catch {
            # Le faux alias Microsoft Store est ignoré.
        }
    }

    return $null
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

$pythonInfo = Get-WorkingPython

if (-not $pythonInfo) {
    Write-Host "Aucun vrai Python détecté. Installation de Python 3.12..." -ForegroundColor Yellow

    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw @"
Winget est indisponible.
Installe Python 3.12 depuis python.org, coche « Add python.exe to PATH »,
puis relance ce fichier.
"@
    }

    Invoke-NativeChecked $winget.Source install `
        --exact `
        --id Python.Python.3.12 `
        --scope user `
        --accept-package-agreements `
        --accept-source-agreements `
        --silent

    Refresh-Path
    Start-Sleep -Seconds 2
    $pythonInfo = Get-WorkingPython
}

if (-not $pythonInfo) {
    throw @"
Python a été installé, mais cette fenêtre PowerShell ne le retrouve pas encore.
Ferme PowerShell, rouvre-le dans le dossier AuraLive, puis relance :
.\reparer-installation.ps1
"@
}

$pythonCommand = $pythonInfo.Command
$pythonPrefix = @($pythonInfo.Prefix)

$version = & $pythonCommand @pythonPrefix --version 2>&1
Write-Host "Python détecté : $version" -ForegroundColor Green

if (Test-Path ".venv") {
    $venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "Environnement virtuel incomplet supprimé." -ForegroundColor Yellow
        Remove-Item ".venv" -Recurse -Force
    }
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Création de l'environnement virtuel..." -ForegroundColor Cyan
    Invoke-NativeChecked $pythonCommand @pythonPrefix -m venv ".venv"
}

$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "La création de .venv a échoué."
}

Write-Host "Installation des dépendances..." -ForegroundColor Cyan
Invoke-NativeChecked $venvPython -m pip install --upgrade pip
Invoke-NativeChecked $venvPython -m pip install -r "requirements.txt"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Le fichier .env a été créé." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Installation terminée ===" -ForegroundColor Green
Write-Host "Étape suivante : ouvre le fichier .env et ajoute les identifiants Twitch."
Write-Host "Puis lance : .\aura.bat"
