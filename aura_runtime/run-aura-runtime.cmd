@echo off
setlocal
cd /d %~dp0\..

where python >nul 2>nul
if errorlevel 1 (
  echo [AURA] Python 3.12+ est requis.
  echo Installe Python puis relance ce fichier.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
  echo [AURA] Configuration creee: .env
  echo Renseigne AURA_CLOUD_BASE_URL et AURA_CLOUD_TOKEN puis relance.
  start "" notepad ".env"
  pause
  exit /b 1
)

python -c "import aiohttp, browser_use, crawl4ai" >nul 2>nul
if errorlevel 1 (
  echo [AURA] Installation des capacites Runtime, Browser Use et Crawl4AI...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [AURA] Installation Python impossible.
    pause
    exit /b 1
  )
  echo [AURA] Installation de Chromium pour Browser Use...
  python -m browser_use install
  if errorlevel 1 (
    echo [AURA] Chromium n'a pas pu etre installe automatiquement.
    echo [AURA] Le Runtime peut demarrer mais browser.task restera indisponible.
  )
)

where ollama >nul 2>nul
if errorlevel 1 (
  echo [AURA] Ollama n'est pas detecte. Le Runtime peut demarrer, mais aucune inference locale ne sera disponible.
)

echo [AURA] Demarrage du Runtime autonome...
python -m aura_runtime
if errorlevel 1 (
  echo.
  echo [AURA] Le Runtime s'est arrete avec une erreur.
  pause
)
