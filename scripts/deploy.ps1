# Deploys the last commit to the Raspberry Pi.
#   .\scripts\deploy.ps1                      # the last commit
#   .\scripts\deploy.ps1 -Overlay <folder>    # the last commit + the files of <folder> copied on top
# The overlay is for files that must not live in git, such as a docker-compose.override.yml.
# Needs the "weather-pi" host in ~/.ssh/config (see README).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
param(
  [string]$Overlay = ''
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (git status --porcelain) {
  Write-Warning 'There are uncommitted changes. Only the last commit is deployed.'
}

$tmp = Join-Path $env:TEMP 'weather-deploy.tar.gz'
if ($Overlay -eq '') {
  git archive --format=tar.gz -o $tmp HEAD
} else {
  if (-not (Test-Path $Overlay -PathType Container)) { throw "Overlay folder not found: $Overlay" }
  $stage = Join-Path $env:TEMP 'weather-deploy-stage'
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory $stage | Out-Null
  $plain = Join-Path $env:TEMP 'weather-deploy.tar'
  git archive --format=tar -o $plain HEAD
  tar -xf $plain -C $stage
  Remove-Item $plain
  Copy-Item (Join-Path $Overlay '*') $stage -Recurse -Force
  $files = Get-ChildItem $Overlay -Recurse -File | ForEach-Object { $_.FullName.Substring($Overlay.TrimEnd('\').Length + 1) }
  Write-Host ">> deploying HEAD + $($files -join ', ')"
  tar -czf $tmp -C $stage .
  Remove-Item $stage -Recurse -Force
}
# Windows PowerShell corrupts binary data in native pipes, so feed the archive through cmd.
cmd /c "ssh weather-pi deploy < `"$tmp`""
$code = $LASTEXITCODE
Remove-Item $tmp -ErrorAction SilentlyContinue
if ($code -eq 0) {
  Write-Host 'Deploy OK: http://ninblack-pi.local:8081' -ForegroundColor Green
} else {
  Write-Host "Deploy FAILED (exit $code)" -ForegroundColor Red
}
exit $code
