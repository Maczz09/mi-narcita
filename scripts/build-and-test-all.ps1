# ═══════════════════════════════════════════════════════
# Build All Docker Services + PWA + Stress Tests
# ═══════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$infraDir = Join-Path $root "infra"
$logDir = Join-Path $root "logs"
$stressDir = Join-Path $root "stress-tests"
$reportDir = Join-Path $stressDir "reports"

if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
if (!(Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

$services = @(
  "servicio-identidad",
  "servicio-mesas",
  "servicio-pedidos",
  "servicio-cuentas",
  "servicio-reservas",
  "servicio-inventario",
  "servicio-notificaciones",
  "servicio-caja",
  "servicio-reportes",
  "servicio-facturacion"
)

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PHASE 1: Docker Build (all services)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($svc in $services) {
  $img = "infra-$svc"
  Write-Host ">>> Building $img ..." -ForegroundColor Yellow
  $logFile = Join-Path $logDir "build-$svc.log"
  
  docker build --build-arg APP_NAME=$svc -t $img -f Dockerfile . 2>&1 | Tee-Object -FilePath $logFile
  
  if ($LASTEXITCODE -eq 0) {
    Write-Host "    OK: $img" -ForegroundColor Green
  } else {
    Write-Host "    FAILED: $img — check $logFile" -ForegroundColor Red
  }
  Write-Host ""
}

# Also build Kong
Write-Host ">>> Building infra-kong ..." -ForegroundColor Yellow
Push-Location (Join-Path $infraDir "kong")
docker build -t infra-kong . 2>&1 | Tee-Object -FilePath (Join-Path $logDir "build-kong.log")
Pop-Location

# Build PWA
Write-Host ">>> Building infra-pwa-cliente ..." -ForegroundColor Yellow
docker build -t infra-pwa-cliente -f apps/pwa-cliente/Dockerfile . 2>&1 | Tee-Object -FilePath (Join-Path $logDir "build-pwa-cliente.log")

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PHASE 2: Docker Compose Up" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $infraDir

# Stop any running containers first
docker compose --profile all down --remove-orphans 2>&1 | Out-Null

# Start infrastructure + services
Write-Host "Starting infrastructure (databases + rabbitmq)..." -ForegroundColor Yellow
docker compose --profile infra up -d 2>&1 | Tee-Object -FilePath (Join-Path $logDir "compose-infra.log")

Write-Host "Waiting 15s for databases to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "Starting microservices..." -ForegroundColor Yellow
$serviceArgs = $services | ForEach-Object { $_ }
docker compose --profile all up -d $serviceArgs pwa-cliente 2>&1 | Tee-Object -FilePath (Join-Path $logDir "compose-services.log")

Write-Host "Waiting 30s for services to start and run migrations..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check health
Write-Host ""
Write-Host "Checking service health..." -ForegroundColor Yellow
$endpoints = @(
  @{ Name = "identidad";  Url = "http://localhost:3001/api" },
  @{ Name = "mesas";      Url = "http://localhost:3002/api" },
  @{ Name = "pedidos";    Url = "http://localhost:3004/api" },
  @{ Name = "cuentas";    Url = "http://localhost:3005/api" },
  @{ Name = "reservas";   Url = "http://localhost:3006/api" },
  @{ Name = "inventario"; Url = "http://localhost:3007/api" },
  @{ Name = "notificaciones"; Url = "http://localhost:3008/api" },
  @{ Name = "caja";       Url = "http://localhost:3009/api/health" },
  @{ Name = "reportes";   Url = "http://localhost:3010/api" },
  @{ Name = "facturacion"; Url = "http://localhost:3011/api" }
)

$healthy = 0
$unhealthy = 0
foreach ($ep in $endpoints) {
  try {
    $r = Invoke-WebRequest -Uri $ep.Url -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✓ $($ep.Name) — $($r.StatusCode)" -ForegroundColor Green
    $healthy++
  } catch {
    Write-Host "  ✗ $($ep.Name) — UNREACHABLE" -ForegroundColor Red
    $unhealthy++
  }
}

Write-Host ""
Write-Host "Health: $healthy/$($healthy + $unhealthy) services up" -ForegroundColor $(if ($unhealthy -eq 0) { "Green" } else { "Yellow" })

Pop-Location

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PHASE 3: Seed Test Data" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $root
npx tsx scripts/poblar-datos.ts 2>&1 | Tee-Object -FilePath (Join-Path $logDir "poblar-datos.log")
Pop-Location

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PHASE 4: Stress & Concurrency Tests" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $root
node stress-tests/run-all-stress-tests.js 2>&1 | Tee-Object -FilePath (Join-Path $logDir "stress-tests.log")
Pop-Location

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PHASE 5: Collect Docker Logs" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $infraDir
foreach ($svc in $services) {
  $container = "nachopps-$svc"
  $logfile = Join-Path $logDir "container-$svc.log"
  docker logs $container 2>&1 | Out-File -FilePath $logfile -Encoding utf8
  Write-Host "  Saved logs: $logfile" -ForegroundColor Gray
}
Pop-Location

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ALL PHASES COMPLETE" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Logs:     $logDir" -ForegroundColor Gray
Write-Host "Reports:  $reportDir" -ForegroundColor Gray
Write-Host ""
