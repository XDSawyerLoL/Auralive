param(
    [string]$Version = "2.7.2",
    [string]$SourceDir = "dist\\AuraLive"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$isccCandidates = @(
    "${env:ProgramFiles(x86)}\\Inno Setup 6\\ISCC.exe",
    "$env:ProgramFiles\\Inno Setup 6\\ISCC.exe"
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    $resolved = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($resolved) { $iscc = $resolved.Source }
}
if (-not $iscc) { throw "Inno Setup 6 est introuvable. Installe Inno Setup ou ajoute ISCC.exe au PATH." }

if (-not (Test-Path "$SourceDir\\AuraLive.exe")) { throw "Le package Aura Live est absent : $SourceDir\\AuraLive.exe" }

New-Item -ItemType Directory -Force "release" | Out-Null
& $iscc "/DMyAppVersion=$Version" "/DSourceDir=$SourceDir" "installer\\AuraLive.iss"
if ($LASTEXITCODE -ne 0) { throw "La construction de l installateur Aura Live a echoue." }

$installer = "release\\AuraLive-Setup-$Version.exe"
if (-not (Test-Path $installer)) { throw "Installateur absent : $installer" }
if ((Get-Item $installer).Length -lt 1000000) { throw "Installateur anormalement petit." }
Write-Host "Installateur pret : $installer" -ForegroundColor Green