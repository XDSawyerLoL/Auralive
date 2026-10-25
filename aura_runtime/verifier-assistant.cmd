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
echo [AURA] Verification du module PDF facultatif.
python -c "import pypdf" >nul 2>nul
if errorlevel 1 (
 echo [NON CERTIFIE] Le paquet gratuit pypdf n'est pas installe.
 echo [AURA] Les 22 tests principaux ont ete lances ; 9 tests PDF restent non verifies.
 pause
 exit /b 1
)
echo [AURA] Test de 9 extractions et refus sur des PDF TEMPORAIRES.
python -m aura_runtime.pdf_benchmark
if errorlevel 1 (
 echo [ECHEC] Les tests PDF n'ont pas tous reussi.
 pause
 exit /b 1
)
echo [AURA] 31/31 controles attendus sur fichiers temporaires.
echo [AURA] Ne valide pas le fonctionnement graphique ou le Cloud de production.
pause
exit /b 0
