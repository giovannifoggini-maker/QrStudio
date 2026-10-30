@echo off
setlocal
cd /d "%~dp0"
title QR Studio - Package Tests
set FAIL=0

echo.
echo ===============================================
echo QR Studio by FogLabs - verifica pre-pubblicazione
echo ===============================================
echo.

where py >nul 2>&1
if not errorlevel 1 (
  py -3.13 tests\static-smoke.py
  if errorlevel 1 set FAIL=1
  py -3.13 tests\local-server-smoke.py
  if errorlevel 1 set FAIL=1
  py -3.13 tests\qr-decode-smoke.py
  if errorlevel 1 set FAIL=1
  py -3.13 tests\scanner-workflow-smoke.py
  if errorlevel 1 set FAIL=1
  py -3.13 tests\performance-smoke.py
  if errorlevel 1 set FAIL=1
  goto :node_tests
)

where python >nul 2>&1
if not errorlevel 1 (
  python tests\static-smoke.py
  if errorlevel 1 set FAIL=1
  python tests\local-server-smoke.py
  if errorlevel 1 set FAIL=1
  python tests\qr-decode-smoke.py
  if errorlevel 1 set FAIL=1
  python tests\scanner-workflow-smoke.py
  if errorlevel 1 set FAIL=1
  python tests\performance-smoke.py
  if errorlevel 1 set FAIL=1
  goto :node_tests
)

echo ERRORE: Python non trovato. Impossibile eseguire i test.
set FAIL=1

:node_tests
where node >nul 2>&1
if not errorlevel 1 (
  node --check site\app.js
  if errorlevel 1 set FAIL=1
  node --check site\lib\qr-engine.js
  if errorlevel 1 set FAIL=1
  node --check site\sw.js
  if errorlevel 1 set FAIL=1
  node tests\qr-engine-smoke.mjs
  if errorlevel 1 set FAIL=1
) else (
  echo Node.js non trovato: test JavaScript saltati, ma non serve per usare QR Studio.
)

echo.
if "%FAIL%"=="0" (
  echo ESITO: test completati senza errori bloccanti.
) else (
  echo ESITO: uno o piu test sono falliti. Leggi il risultato qui sopra.
)
echo.
pause
if "%FAIL%"=="0" (endlocal & exit /b 0) else (endlocal & exit /b 1)
