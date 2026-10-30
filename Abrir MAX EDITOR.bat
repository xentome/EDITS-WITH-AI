@echo off
rem MAX EDITOR: abrir la app en Windows con doble clic (app\instalacion\arrancar_windows.py). ComfyUI tiene que estar abierto.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist "app\.venv\Scripts\python.exe" (
  echo Falta instalar: doble clic en "Instalar MAX EDITOR" primero.
  echo Not installed yet: double-click "Instalar MAX EDITOR" first.
  pause
  exit /b 1
)
"app\.venv\Scripts\python.exe" "app\instalacion\arrancar_windows.py" %*
if errorlevel 1 pause
timeout /t 5 >nul
