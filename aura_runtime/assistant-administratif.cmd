@echo off
setlocal
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
 echo [AURA] Python 3.12 ou plus est requis.
 pause
 exit /b 2
)

echo [AURA] Assistant administratif LOCAL - aucun compte ni API payante.
echo [AURA] Choisis un dossier contenant uniquement les documents que tu autorises.
set /p "AURA_ROOT=Dossier a examiner : "
if not defined AURA_ROOT (
 echo [AURA] Aucun dossier selectionne. Aucun fichier lu.
 pause
 exit /b 1
)

if not exist "%AURA_ROOT%\" (
 echo [AURA] Dossier inexistant.
 pause
 exit /b 1
)
python -m aura_runtime.admin_chat --root "%AURA_ROOT%"
if errorlevel 1 (
 echo [AURA] Echec: verifier Python et les dependances Runtime.
 pause
 exit /b 1
)
pause
