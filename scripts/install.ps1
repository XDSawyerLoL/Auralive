$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$RepairScript = Join-Path $ProjectRoot "reparer-installation.ps1"

if (Test-Path $RepairScript) {
    & $RepairScript
    exit $LASTEXITCODE
}

throw "Le fichier reparer-installation.ps1 est absent à la racine du projet."
