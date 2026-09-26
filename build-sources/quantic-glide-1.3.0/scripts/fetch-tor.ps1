$ErrorActionPreference = 'Stop'
$Version = '15.0.23'
$FileName = "tor-expert-bundle-windows-x86_64-$Version.tar.gz"
$Sources = @(
  "https://dist.torproject.org/torbrowser/$Version",
  "https://archive.torproject.org/tor-package-archive/torbrowser/$Version"
)
$Root = Split-Path -Parent $PSScriptRoot
$Vendor = Join-Path $Root 'vendor\tor'
$Archive = Join-Path $env:TEMP $FileName

function Get-QuanticSha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToUpperInvariant()
  }
  finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

function Get-VerifiedTorArchive {
  $errors = @()
  foreach ($BaseUrl in $Sources) {
    $ChecksumsUrl = "$BaseUrl/sha256sums-signed-build.txt"
    $Url = "$BaseUrl/$FileName"
    try {
      Write-Host "Quantic Veil: verification de la source Tor officielle $BaseUrl ..."
      $Manifest = (Invoke-WebRequest -Uri $ChecksumsUrl -UseBasicParsing).Content
      $Escaped = [Regex]::Escape($FileName)
      $Match = [Regex]::Match($Manifest, "(?im)^([a-f0-9]{64})\s+\*?$Escaped\s*$")
      if (-not $Match.Success) { throw "Empreinte SHA-256 officielle introuvable pour $FileName." }
      $ExpectedSha256 = $Match.Groups[1].Value.ToUpperInvariant()

      Remove-Item $Archive -Force -ErrorAction SilentlyContinue
      Invoke-WebRequest -Uri $Url -OutFile $Archive -UseBasicParsing
      $Actual = Get-QuanticSha256 $Archive
      if ($Actual -ne $ExpectedSha256) {
        throw "SHA-256 invalide. Attendu: $ExpectedSha256 Recu: $Actual"
      }

      Write-Host "Archive Tor $Version authentifiee depuis $BaseUrl ($ExpectedSha256)."
      return $ExpectedSha256
    }
    catch {
      Remove-Item $Archive -Force -ErrorAction SilentlyContinue
      $detail = $_.Exception.Message
      $errors += "$BaseUrl => $detail"
      Write-Warning "Source Tor indisponible ou invalide: $BaseUrl. Essai de la source officielle suivante."
    }
  }

  throw "Impossible de recuperer le Tor Expert Bundle $Version depuis les sources officielles. $($errors -join ' | ')"
}

Write-Host "Quantic Veil: telechargement du Tor Expert Bundle officiel $Version..."
$ExpectedSha256 = Get-VerifiedTorArchive

New-Item -ItemType Directory -Force -Path $Vendor | Out-Null
Get-ChildItem $Vendor -Force | Where-Object { $_.Name -ne 'README.txt' } | Remove-Item -Recurse -Force
Write-Host "Extraction du bundle Tor verifie ($ExpectedSha256)..."
tar -xzf $Archive -C $Vendor
Remove-Item $Archive -Force
$Tor = Get-ChildItem $Vendor -Recurse -Filter tor.exe | Select-Object -First 1
if (-not $Tor) { throw 'tor.exe introuvable apres extraction.' }
Write-Host "Quantic Veil pret: $($Tor.FullName)"
