@echo off
setlocal
cd /d "%~dp0"
title QR Studio by FogLabs v1.2.0 - Local Test

echo.
echo   QR STUDIO by FogLabs v1.2.0 - Avvio locale
echo   Nessuna libreria aggiuntiva richiesta.
echo.

where py >nul 2>&1
if not errorlevel 1 (
  py -3.13 -c "import sys" >nul 2>&1
  if not errorlevel 1 (
    py -3.13 "%~dp0run_local.py"
    goto :done
  )
)

where python >nul 2>&1
if not errorlevel 1 (
  python "%~dp0run_local.py"
  goto :done
)

echo ERRORE: Python non trovato. Installa Python 3.13 o avvia run_local.py con Python.
pause
:done
echo.
echo QR Studio chiuso.
pause
endlocal
