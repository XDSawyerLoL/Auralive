@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONDONTWRITEBYTECODE=1

set "AURA_PYTHON="
if exist ".venv\Scripts\python.exe" set "AURA_PYTHON=.venv\Scripts\python.exe"
if not defined AURA_PYTHON if exist ".venv-v2\Scripts\python.exe" set "AURA_PYTHON=.venv-v2\Scripts\python.exe"
if not defined AURA_PYTHON for %%P in (python.exe) do set "AURA_PYTHON=%%~$PATH:P"

if not defined AURA_PYTHON (
  echo [ERREUR] Python est introuvable.
  echo Lance d'abord installer-frontier.ps1 depuis PowerShell.
  pause
  exit /b 1
)

echo ====================================================
echo  AURA LIVE 2 - FRONTIER
echo  Panneau : http://localhost:8787
echo  Studio  : http://localhost:8787/automation
echo ====================================================
echo.

"%AURA_PYTHON%" -m app.main_v2
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERREUR] Aura Live s'est arrete avec le code %EXIT_CODE%.
  echo Consulte les lignes ci-dessus avant de fermer cette fenetre.
  pause
)
exit /b %EXIT_CODE%
