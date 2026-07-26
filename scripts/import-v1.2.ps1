[CmdletBinding()]
param(
    [string]$Source = "C:\Users\valen\Desktop\AuraLive",
    [string]$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$Commit,
    [switch]$Push
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host "`n[Aura Live] $Message" -ForegroundColor Cyan
}

function Test-IsExcluded([string]$RelativePath) {
    $normalized = $RelativePath.Replace("/", "\")
    $parts = $normalized.Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)
    $excludedDirectories = @(
        ".git", ".venv", "venv", "env", "__pycache__", ".pytest_cache",
        "node_modules", "data", "logs", "cache", ".mypy_cache", ".ruff_cache"
    )
    if ($parts | Where-Object { $excludedDirectories -contains $_ }) { return $true }

    $name = [System.IO.Path]::GetFileName($normalized)
    $excludedFiles = @(".env", ".env.local", "aura_live.db", "tokens.json", "oauth.json")
    if ($excludedFiles -contains $name) { return $true }
    if ($name -match "\.(db|sqlite|sqlite3|log|pyc|pyo)$") { return $true }
    if ($name -match "(?i)(secret|token|credential).*(json|txt|yaml|yml)$") { return $true }
    return $false
}

function Test-IsProtected([string]$RelativePath) {
    $normalized = $RelativePath.Replace("/", "\")
    $top = $normalized.Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)[0]
    return $top -in @(".git", ".github", "auralive", "docs", "scripts") -or
        $normalized -in @("README.md", "pyproject.toml", ".gitignore")
}

function Test-ContainsSecret([string]$Path) {
    $allowedExtensions = @(".py", ".js", ".ts", ".html", ".css", ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ps1", ".bat")
    if ([System.IO.Path]::GetExtension($Path) -notin $allowedExtensions) { return $false }
    if ((Get-Item $Path).Length -gt 2MB) { return $false }
    $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $false }
    $patterns = @(
        '(?im)^\s*(TWITCH_CLIENT_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|OBS_PASSWORD|DISCORD_TOKEN)\s*=\s*(?!change-me|your-|example|<)[^\s#]{8,}',
        '(?i)oauth:[a-z0-9]{20,}',
        '(?i)sk-[a-z0-9_-]{20,}'
    )
    foreach ($pattern in $patterns) {
        if ($content -match $pattern) { return $true }
    }
    return $false
}

Write-Step "Validation des chemins"
if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Installation Aura Live introuvable : $Source"
}
if (-not (Test-Path -LiteralPath (Join-Path $Repository ".git") -PathType Container)) {
    throw "Le dossier cible n'est pas un dépôt Git : $Repository"
}

$sourceRoot = (Resolve-Path $Source).Path.TrimEnd("\")
$repoRoot = (Resolve-Path $Repository).Path.TrimEnd("\")
$legacyBackup = Join-Path $repoRoot "legacy_v1_2_backup"
$manifest = New-Object System.Collections.Generic.List[object]

Write-Step "Inventaire de la V1.2 sans secrets ni données locales"
$files = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -Force
$copyable = foreach ($file in $files) {
    $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart("\")
    if (Test-IsExcluded $relative) { continue }
    if (Test-ContainsSecret $file.FullName) {
        throw "Secret potentiel détecté dans $relative. Déplace la valeur dans .env avant l'import."
    }
    [PSCustomObject]@{ File = $file; Relative = $relative }
}

Write-Step "Copie contrôlée de $($copyable.Count) fichiers"
foreach ($entry in $copyable) {
    if (Test-IsProtected $entry.Relative) {
        $destination = Join-Path $legacyBackup $entry.Relative
        $mode = "legacy-backup"
    } else {
        $destination = Join-Path $repoRoot $entry.Relative
        $mode = "root"
    }
    $parent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -LiteralPath $entry.File.FullName -Destination $destination -Force
    $manifest.Add([PSCustomObject]@{
        source = $entry.Relative.Replace("\", "/")
        destination = $destination.Substring($repoRoot.Length).TrimStart("\").Replace("\", "/")
        mode = $mode
        size = $entry.File.Length
    })
}

$manifestPath = Join-Path $repoRoot "docs\V1_2_IMPORT_MANIFEST.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Step "Contrôle Git"
Push-Location $repoRoot
try {
    git status --short
    if ($LASTEXITCODE -ne 0) { throw "Git status a échoué." }

    if ($Commit) {
        git add --all
        git diff --cached --check
        if ($LASTEXITCODE -ne 0) { throw "Le contrôle du diff a échoué." }
        $changes = git diff --cached --name-only
        if ($changes) {
            git commit -m "Migre la base fonctionnelle Aura Live 1.2"
            if ($LASTEXITCODE -ne 0) { throw "Le commit a échoué." }
        } else {
            Write-Host "Aucun changement à committer." -ForegroundColor Yellow
        }
    }
    if ($Push) {
        git push origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "Le push GitHub a échoué." }
    }
}
finally {
    Pop-Location
}

Write-Host "`nImport terminé sans copier .env, les jetons OAuth, la base locale ou les mots de passe." -ForegroundColor Green
Write-Host "Manifeste : $manifestPath" -ForegroundColor DarkGray
