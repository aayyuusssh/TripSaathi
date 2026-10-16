param([ValidateSet('install','setup','dev','check','build','verify')][string]$Action='dev')
$ErrorActionPreference='Stop'
$tripProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $tripProjectRoot
$tripNode = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $tripNode)) { $tripNode = (Get-Command node.exe).Source }
$env:PATH = (Split-Path -Parent $tripNode) + ';' + $env:PATH
$tripPreload = (Join-Path $PSScriptRoot 'windows-realpath.cjs').Replace('\', '/')
$env:NODE_OPTIONS = '--require="' + $tripPreload + '"'
$tripPnpm = Join-Path $tripProjectRoot '.tools\node_modules\pnpm\bin\pnpm.cjs'
if (-not (Test-Path -LiteralPath $tripPnpm)) {
  & npm.cmd install --prefix .tools pnpm@10.32.1 --cache .npm-cache --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Local package manager installation failed' }
}
$env:PATH = (Join-Path $tripProjectRoot '.tools\node_modules\.bin') + ';' + $env:PATH
function Invoke-TripPnpm { & $tripNode $tripPnpm @args; if ($LASTEXITCODE -ne 0) { throw ('Command failed: pnpm ' + ($args -join ' ')) } }
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
switch ($Action) {
  'install' { Invoke-TripPnpm install; Invoke-TripPnpm db:generate }
  'setup' {
    Invoke-TripPnpm install
    & docker compose up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Open Docker Desktop and wait for its Linux engine, then run setup again.' }
    Invoke-TripPnpm db:generate
    Invoke-TripPnpm db:deploy
    Invoke-TripPnpm build:packages
  }
  'dev' { Invoke-TripPnpm dev }
  'check' { Invoke-TripPnpm build:packages; Invoke-TripPnpm test; Invoke-TripPnpm typecheck }
  'build' { Invoke-TripPnpm build }
  'verify' { Invoke-TripPnpm test; Invoke-TripPnpm typecheck; Invoke-TripPnpm build; Invoke-TripPnpm verify:local }
}
