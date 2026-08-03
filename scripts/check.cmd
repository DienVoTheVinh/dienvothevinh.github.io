@echo off
setlocal
set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%PYTHON_EXE%" "%~dp0check_workspace.py" --node "%NODE_EXE%"
