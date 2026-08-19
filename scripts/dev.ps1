param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$pythonExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
  $python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue
  if (-not $python) { throw 'Python 3 was not found. Install Python or use the bundled Codex workspace runtime.' }
  $pythonExe = $python.Source
}
& $pythonExe (Join-Path $PSScriptRoot 'dev_server.py') --port $Port
