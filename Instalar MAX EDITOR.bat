@echo off
rem MAX EDITOR: instalar en Windows con doble clic (app\instalacion\instalar_windows.py). Mismas opciones que app/instalar.sh.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "app\instalacion\instalar_windows.py" %*
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python "app\instalacion\instalar_windows.py" %*
  goto fin
)
where uv >nul 2>nul
if %errorlevel%==0 (
  uv run --no-project --python 3.12 python "app\instalacion\instalar_windows.py" %*
  goto fin
)
echo Falta Python 3.10 o mas nuevo. Instalalo con: winget install Python.Python.3.12
echo Python 3.10 or newer is missing. Install it with: winget install Python.Python.3.12
:fin
echo.
pause
