@echo off
rem MAX EDITOR: parar la app en Windows (ComfyUI y el LLM siguen como estaban).
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
"app\.venv\Scripts\python.exe" "app\instalacion\arrancar_windows.py" --parar
timeout /t 5 >nul
