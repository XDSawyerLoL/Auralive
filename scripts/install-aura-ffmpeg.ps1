param(
  [string]$Destination = "dist\AuraLive\ffmpeg"
)

$ErrorActionPreference = "Stop"

$url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-19-13-11/ffmpeg-N-126655-gbfac54a03b-win64-gpl-shared.zip"
$expectedSha256 = "4d5e5bdc6d811d87ef48d80c48e65e1eb3c6589ed73182d817f077f33d221985"
$zip = Join-Path $env:RUNNER_TEMP "aura-ffmpeg.zip"
$extract = Join-Path $env:RUNNER_TEMP "aura-ffmpeg"

Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expectedSha256) {
  throw "FFmpeg SHA256 inattendu: $actual"
}

if (Test-Path $extract) {
  Remove-Item $extract -Recurse -Force
}
Expand-Archive -Path $zip -DestinationPath $extract -Force

$ffmpegExe = Get-ChildItem $extract -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
if (-not $ffmpegExe) {
  throw "ffmpeg.exe absent de l'archive verifiee."
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Copy-Item (Join-Path $ffmpegExe.Directory.FullName "*") $Destination -Recurse -Force

$bundled = Join-Path $Destination "ffmpeg.exe"
$filters = & $bundled -hide_banner -filters 2>&1 | Out-String
if ($filters -notmatch "\bgfxcapture\b") {
  throw "Le FFmpeg embarque ne contient pas Windows Graphics Capture (gfxcapture)."
}

Write-Host "FFmpeg Aura verifie: SHA256 OK, gfxcapture present."
