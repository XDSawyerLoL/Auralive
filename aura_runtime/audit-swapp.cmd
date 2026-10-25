@echo off
setlocal
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
 echo [AURA] Python 3.12+ est requis pour l'audit local.
 echo Aucun telechargement automatique.
 pause
 exit /b 2
)

where node >nul 2>nul
if errorlevel 1 (
 echo [AURA] Node.js est requis pour verifier les captures.
 echo Aucun telechargement automatique.
 pause
 exit /b 2
)

echo [AURA] Audit SWAPP public, navigateur local, sans API payante.
python -m aura_runtime.browser_audit --routes / /actus /twitch
set "AUDIT_STATUS=%ERRORLEVEL%"
if not exist "aura-browser-reports\audit-report.json" (
 echo [AURA] Aucun rapport cree: verifier Playwright et le navigateur Chromium.
 echo Installation manuelle: python -m pip install -r aura_runtime/requirements.txt
 echo Puis: python -m playwright install chromium
 pause
 exit /b 1
)

echo [AURA] Controle independant des empreintes et des resultats.
node evaluation/aura-operations/verify.mjs aura-browser-reports/audit-report.json
set "VERIFY_STATUS=%ERRORLEVEL%"
echo.
echo [AURA] Rapport: aura-browser-reports\audit-report.json
echo [AURA] Captures: aura-browser-reports\
if not "%AUDIT_STATUS%"=="0" (
 echo [AURA] Certaines pages n'ont pas passe tous les controles.
 pause
 exit /b 1
)
if not "%VERIFY_STATUS%"=="0" (
 echo [AURA] Echec des preuves ou du controle de regression.
 pause
 exit /b 1
)
echo [AURA] Audit et preuves valides.
pause
exit /b 0
