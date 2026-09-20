$ErrorActionPreference = "Stop"

Write-Host "=== Quantic Live - Build Windows ===" -ForegroundColor Cyan

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust/Cargo n'est pas installé. Installe Rust via rustup puis relance ce script."
}

cargo build --release

$exe = Join-Path $PSScriptRoot "..\target\release\quantic-live.exe"
if (-not (Test-Path $exe)) {
    throw "Compilation terminée mais l'EXE est introuvable: $exe"
}

Write-Host "OK: $exe" -ForegroundColor Green
