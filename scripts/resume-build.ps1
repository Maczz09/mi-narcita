$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

Write-Host "`n   Construyendo Kong..." -NoNewline
$buildOutput = docker compose -f infra/docker-compose.yml --profile all build kong 2>&1
$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Red
    exit 1
}

# 5. Levantar stack
Write-Host "`n[5/6] Levantando stack..." -ForegroundColor Yellow
$upOutput = docker compose -f infra/docker-compose.yml --profile all up -d --wait --wait-timeout 120 2>&1
$upExit = $LASTEXITCODE
$upOutput | Where-Object { $_ -match "Error|error|failed|FAIL" } | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
if ($upExit -ne 0) {
    Write-Host "   ADVERTENCIA: docker compose up retornó $upExit — verificando contenedores..." -ForegroundColor Yellow
    docker compose -f infra/docker-compose.yml --profile all ps 2>&1
}
Write-Host "   Stack levantado (exit: $upExit)" -ForegroundColor Green

# Aplicar schemas de Prisma desde el host
Write-Host "`n   Aplicando schemas de Prisma..." -ForegroundColor Yellow
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
$dbPorts = @{
    "servicio-identidad" = "5439"
    "servicio-mesas" = "5433"
    "servicio-pedidos" = "5434"
    "servicio-cuentas" = "5435"
    "servicio-reservas" = "5441"
    "servicio-inventario" = "5436"
    "servicio-notificaciones" = "5440"
    "servicio-caja" = "5437"
    "servicio-reportes" = "5438"
    "servicio-facturacion" = "5442"
}

foreach ($svc in $services) {
    $port = $dbPorts[$svc]
    $dbName = $svc -replace "servicio-", ""
    Write-Host "    $svc..." -NoNewline
    $env:DATABASE_URL = "postgresql://nachopps:secret@localhost:$port/$($dbName)_db?schema=public"
    Push-Location apps/$svc
    npx prisma db push --accept-data-loss 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green }
    else { Write-Host " FAIL" -ForegroundColor Red }
    Pop-Location
}

Write-Host "`n   Sembrando usuario admin..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgresql://nachopps:secret@localhost:5439/identidad_db?schema=public"
Push-Location apps/servicio-identidad
node "..\..\scripts\seed-admin.js" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "   Seed admin falló" -ForegroundColor Red }
Pop-Location
Write-Host "   Seed completado" -ForegroundColor Green

Write-Host "`n[6/6] Ejecutando población y pruebas..." -ForegroundColor Yellow
Write-Host "`n   >>> POBLACIÓN <<<" -ForegroundColor Cyan
npx tsx scripts/poblar-datos.ts
if ($LASTEXITCODE -ne 0) { Write-Host "Población falló" -ForegroundColor Red; exit 1 }

Write-Host "`n   >>> PRUEBAS DE INTEGRACIÓN <<<" -ForegroundColor Cyan
npx tsx scripts/pruebas-integracion.ts
