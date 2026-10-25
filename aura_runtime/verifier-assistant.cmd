@echo off
setlocal
cd /d "%~dp0.."
where python >nul 2>nul
if errorlevel 1 (
 echo [AURA] Python non trouve. Aucun test lance.
 pause
 exit /b 2
)
echo [AURA] Verification de la syntaxe de tous les modules Python.
python -m compileall -q aura_runtime
if errorlevel 1 (
 echo [ECHEC] Certains modules Python n'ont pas pu etre compiles.
 pause
 exit /b 1
)
echo [AURA] Verification de l'import du guichet graphique.
python -c "import aura_runtime.admin_desktop"
if errorlevel 1 (
 echo [ECHEC] La fenetre administrative ne peut pas demarrer.
 pause
 exit /b 1
)
echo [AURA] Test de l'operateur sur fichiers TEMPORAIRES seulement.
python -m aura_runtime.personal_benchmark
if errorlevel 1 (
 echo [ECHEC] Sauvegardes, fichiers ou autorisations incorrectes.
 pause
 exit /b 1
)
echo [AURA] Test de 15 missions en francais sur fichiers TEMPORAIRES.
python -m aura_runtime.admin_benchmark
if errorlevel 1 (
 echo [ECHEC] Compréhension ou execution administrative non validee.
 pause
 exit /b 1
)
echo [AURA] 2 suites de benchmarks locaux terminees sans API ni cout.
pause
exit /b 0
