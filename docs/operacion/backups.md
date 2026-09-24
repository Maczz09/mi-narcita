# Backups de las BDs (plan 3.5)

## Qué hace

El servicio `db-backup` (en `infra/docker-compose.prod.yml`) corre
`scripts/backup-postgres.sh` cada 24h: hace `pg_dump` de las 11 bases
(`reservas`, `mesas`, `pedidos`, `cuentas`, `inventario`, `caja`, `reportes`,
`identidad`, `notificaciones`, `facturacion`, `compras`), las comprime en `nachopps-backups:/backups` y
purga las que superan `BACKUP_RETENTION_DAYS` (default 7).
Cada volcado se verifica con `gzip -t` antes de publicarse como `.sql.gz`.

Variables: `DB_USER`, `DB_PASS` (obligatoria), `BACKUP_RETENTION_DAYS`.

> El volumen `nachopps-backups` vive en el host. Para durabilidad real,
> sincronízalo a almacenamiento externo (S3/GCS) con un job aparte, o monta un
> bind a un punto de montaje de red.

## Ejecutar un backup manual

```sh
docker compose -f infra/docker-compose.prod.yml exec -e APPLY_RETENTION=false db-backup sh /usr/local/bin/backup.sh
# o desde un host con psql-tools y acceso a las BDs:
DB_PASS=... APPLY_RETENTION=false BACKUP_DIR=./backups sh scripts/backup-postgres.sh
```

## Restaurar una base

```sh
# 1. Localizar el dump deseado
docker compose -f infra/docker-compose.prod.yml exec db-backup ls -1 /backups

# 2. Restaurar (ejemplo: pedidos). Detén el servicio que la usa primero.
docker compose -f infra/docker-compose.prod.yml stop servicio-pedidos

gunzip -c /backups/pedidos_db-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose -f infra/docker-compose.prod.yml exec -T db-pedidos \
      psql -U "$DB_USER" -d pedidos_db

docker compose -f infra/docker-compose.prod.yml start servicio-pedidos
```

Para una restauración limpia, recrear la BD antes de aplicar el dump
(`DROP DATABASE` / `CREATE DATABASE`) si el dump no incluye `--clean`.

## Verificación periódica

- Confirmar que aparecen 11 `.sql.gz` nuevos por día en `/backups`.
- Probar una restauración en un entorno de staging al menos una vez por trimestre
  (un backup no probado no es un backup).
