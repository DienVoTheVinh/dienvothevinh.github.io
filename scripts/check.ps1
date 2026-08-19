$ErrorActionPreference = 'Stop'
$pythonExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
  $python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue
  if (-not $python) { throw 'Python 3 not found.' }
  $pythonExe = $python.Source
}
$nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
  $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js not found.' }
  $nodeExe = $node.Source
}
& $pythonExe (Join-Path $PSScriptRoot 'check_workspace.py') --node $nodeExe
exit $LASTEXITCODE
