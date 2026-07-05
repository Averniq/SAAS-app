$ErrorActionPreference = "Stop"

$runtime = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$nodeDirectory = Join-Path $runtime "node\bin"
$binaryDirectory = Join-Path $runtime "bin"
$pnpm = Join-Path $binaryDirectory "pnpm.cmd"

if (-not (Test-Path -LiteralPath $pnpm)) {
  throw "Codex pnpm runtime was not found at $pnpm"
}

Set-Location -LiteralPath $PSScriptRoot
$env:CI = "true"
$env:Path = "$nodeDirectory;$binaryDirectory;$env:Path"

Write-Host "Building Aveniq..." -ForegroundColor Cyan
& $pnpm run build
if ($LASTEXITCODE -ne 0) {
  throw "Aveniq build failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Aveniq is ready at http://localhost:4175" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop the app." -ForegroundColor DarkGray
& (Join-Path $nodeDirectory "node.exe") ".\scripts\serve.mjs"
