@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
 echo [AURA] Python 3.12 ou plus est requis.
 pause
 exit /b 2
)

echo [AURA] Assistant administratif prive - local, gratuit, aucune API.
python -c "import pypdf" >nul 2>nul
if errorlevel 1 (
 echo [AURA] Le module PDF gratuit pypdf n'est pas installe.
 echo [AURA] L'assistant de base fonctionne sans ce module.
 set /p "INSTALL_PDF=Installer pypdf gratuitement pour lire des PDF [O/N] ? "
 if /I "!INSTALL_PDF!"=="O" (
  python -m pip install --disable-pip-version-check "pypdf>=5,<7"
  if errorlevel 1 echo [AURA] Installation PDF non reussie. Fonction PDF indisponible.
 )
)

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
