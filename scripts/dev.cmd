@echo off
setlocal
set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
"%PYTHON_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo Python 3 was not found.
  exit /b 1
)
"%PYTHON_EXE%" "%~dp0dev_server.py" %*
