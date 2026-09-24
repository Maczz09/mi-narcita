#!/bin/sh
#
# Backup de las 11 BDs de NachoPps (plan 3.5).
#
# pg_dump por base a $BACKUP_DIR (comprimido) + retención por días. Pensado para
# correr como sidecar (ver servicio db-backup en docker-compose.prod.yml) o por
# cron. POSIX sh (compatible con postgres:16-alpine).
#
set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
PGUSER="${DB_USER:-nachopps}"
export PGPASSWORD="${DB_PASS:?DB_PASS requerido para los backups}"

mkdir -p "$BACKUP_DIR"
ts=$(date +%Y%m%d-%H%M%S)
fail=0

# pares "logical_db_name:host" (el host es el nombre de servicio del compose).
for pair in \
  reservas:db-reservas \
  mesas:db-mesas \
  pedidos:db-pedidos \
  cuentas:db-cuentas \
  inventario:db-inventario \
  caja:db-caja \
  reportes:db-reportes \
  identidad:db-identidad \
  notificaciones:db-notificaciones \
  facturacion:db-facturacion \
  compras:db-compras
do
  db="${pair%%:*}"
  host="${pair#*:}"
  out="$BACKUP_DIR/${db}_db-${ts}.sql.gz"
  if [ -e "$out" ]; then
    echo "FALLO backup ${db}_db: ya existe $out"
    fail=1
    continue
  fi
  plain="$BACKUP_DIR/.${db}_db-${ts}.sql.part"
  compressed="$BACKUP_DIR/.${db}_db-${ts}.sql.gz.part"
  # POSIX pipelines return gzip's exit code, not pg_dump's. Dump to a private
  # temporary file first so a failed pg_dump cannot become a "successful" gzip.
  if pg_dump -h "$host" -U "$PGUSER" -d "${db}_db" -f "$plain" \
    && gzip -c "$plain" > "$compressed" \
    && gzip -t "$compressed" \
    && mv "$compressed" "$out"; then
    echo "OK   backup ${db}_db -> $out ($(wc -c < "$out") bytes)"
  else
    echo "FALLO backup ${db}_db"
    rm -f "$compressed"
    fail=1
  fi
  rm -f "$plain"
done

# Retención
if [ "${APPLY_RETENTION:-true}" = "true" ]; then
  find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  echo "Retención aplicada: backups > ${RETENTION_DAYS} días eliminados"
else
  echo 'Retención omitida para respaldo previo al despliegue'
fi

exit "$fail"
