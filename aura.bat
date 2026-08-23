@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\run.ps1"
if errorlevel 1 pause
