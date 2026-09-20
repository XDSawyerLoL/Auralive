param(
    [Parameter(Mandatory=$true)]
    [string[]]$Path,
    [switch]$Required
)

$ErrorActionPreference = "Stop"

$pfxBase64 = [Environment]::GetEnvironmentVariable("AURA_WINDOWS_SIGNING_PFX_BASE64")
$pfxPassword = [Environment]::GetEnvironmentVariable("AURA_WINDOWS_SIGNING_PFX_PASSWORD")

if ([string]::IsNullOrWhiteSpace($pfxBase64) -or [string]::IsNullOrWhiteSpace($pfxPassword)) {
    if ($Required) {
        throw "Certificat Authenticode absent : configure AURA_WINDOWS_SIGNING_PFX_BASE64 et AURA_WINDOWS_SIGNING_PFX_PASSWORD."
    }
    Write-Host "Signature Authenticode non configuree : binaires laisses non signes." -ForegroundColor Yellow
    exit 0
}

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\\Windows Kits\\10\\bin" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $signtool) { throw "signtool.exe est introuvable sur le runner Windows." }

$pfxPath = Join-Path $env:RUNNER_TEMP "aura-live-signing.pfx"
try {
    [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($pfxBase64))
    foreach ($item in $Path) {
        if (-not (Test-Path $item)) { throw "Fichier a signer introuvable : $item" }
        & $signtool.FullName sign /fd SHA256 /td SHA256 /tr "http://timestamp.digicert.com" /f $pfxPath /p $pfxPassword $item
        if ($LASTEXITCODE -ne 0) { throw "Signature Authenticode impossible : $item" }
        & $signtool.FullName verify /pa /v $item
        if ($LASTEXITCODE -ne 0) { throw "Verification Authenticode impossible : $item" }
    }
} finally {
    Remove-Item $pfxPath -Force -ErrorAction SilentlyContinue
}