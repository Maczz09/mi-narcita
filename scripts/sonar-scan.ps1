<#
.SYNOPSIS
  Ejecuta sonar-scanner (vía Docker) contra el SonarQube local.
.EXAMPLE
  pwsh scripts/sonar-scan.ps1 -Token squ_xxxxxxxx
  pwsh scripts/sonar-scan.ps1 -Token squ_xxxxxxxx -WithCoverage
#>
param(
  [string]$Token,
  [string]$HostUrl = 'http://host.docker.internal:9000',
  [switch]$WithCoverage
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if ($WithCoverage) {
  Write-Host '── Generando cobertura (nx run-many -t test --coverage)…'
  Push-Location $root
  try { npm exec nx run-many -- -t test --coverage --exclude=@org/source --passWithNoTests }
  finally { Pop-Location }
}

Write-Host "── Lanzando sonar-scanner contra $HostUrl…"
docker run --rm `
  -e SONAR_HOST_URL=$HostUrl `
  -v "${root}:/usr/src" `
  sonarsource/sonar-scanner-cli:latest

if ($LASTEXITCODE -ne 0) {
  Write-Error "sonar-scanner terminó con código $LASTEXITCODE (¿quality gate fallido?)"
}
