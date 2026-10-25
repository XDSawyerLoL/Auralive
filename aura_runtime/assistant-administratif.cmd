@echo off
setlocal
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
 echo [AURA] Python 3.12 ou plus est requis.
 pause
 exit /b 2
)

echo [AURA] Assistant administratif prive - local, gratuit, aucune API.
python -m aura_runtime.admin_desktop
if errorlevel 1 (
 echo [AURA] Interface graphique non disponible.
 echo [AURA] Solution de secours : mode texte.
 set /p "AURA_ROOT=Dossier que tu autorises a AURA : "
 if not defined AURA_ROOT exit /b 1
 if not exist "%AURA_ROOT%\" exit /b 1
 python -m aura_runtime.admin_chat --root "%AURA_ROOT%"
 if errorlevel 1 (
  echo [AURA] Assistant local indisponible : verifier aiohttp et les dependances Python.
  pause
  exit /b 1
 )
)
exit /b 0
