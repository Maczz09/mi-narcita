#!/usr/bin/env bash
# Local deterministic check: all 11 databases are archived, and a pg_dump
# failure cannot be reported as a successful compressed backup.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd -P)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/backup-eval.XXXXXX")
case "$test_dir" in
  "${TMPDIR:-/tmp}"/backup-eval.*) ;;
  *) echo 'Unsafe test directory' >&2; exit 1 ;;
esac
cleanup() {
  rm -f "$test_dir/bin/pg_dump" "$test_dir"/*.log "$test_dir"/ok/*.sql.gz "$test_dir"/failed/*.sql.gz
  rmdir "$test_dir/bin" "$test_dir/ok" "$test_dir/failed" "$test_dir"
}
trap cleanup EXIT
mkdir "$test_dir/bin" "$test_dir/ok" "$test_dir/failed"

printf '%s\n' '#!/bin/sh' \
  'while [ "$#" -gt 0 ]; do' \
  '  case "$1" in' \
  '    -d) db="$2"; shift 2 ;;' \
  '    -f) out="$2"; shift 2 ;;' \
  '    *) shift ;;' \
  '  esac' \
  'done' \
  'printf "backup %s\n" "$db" > "$out"' \
  '[ "${FAIL_DB:-}" != "$db" ]' > "$test_dir/bin/pg_dump"
chmod +x "$test_dir/bin/pg_dump"

export PATH="$test_dir/bin:$PATH" DB_USER=test DB_PASS=test APPLY_RETENTION=false
BACKUP_DIR="$test_dir/ok" sh "$repo/scripts/backup-postgres.sh" > "$test_dir/ok.log"
for db in reservas mesas pedidos cuentas inventario caja reportes identidad notificaciones facturacion compras; do
  file=$(find "$test_dir/ok" -name "${db}_db-*.sql.gz" -print)
  [ -n "$file" ] || { echo "Missing $db backup" >&2; exit 1; }
  gzip -t "$file"
  gzip -dc "$file" | grep -q "backup ${db}_db"
done
[ "$(find "$test_dir/ok" -name '*.sql.gz' -print | wc -l)" -eq 11 ]

if FAIL_DB=compras_db BACKUP_DIR="$test_dir/failed" sh "$repo/scripts/backup-postgres.sh" > "$test_dir/failed.log"; then
  echo 'A failed pg_dump returned success' >&2
  exit 1
fi
[ "$(find "$test_dir/failed" -name '*.sql.gz' -print | wc -l)" -eq 10 ]
[ -z "$(find "$test_dir/failed" -name 'compras_db-*.sql.gz' -print)" ]
grep -q 'FALLO backup compras_db' "$test_dir/failed.log"

echo 'Backup eval: 11 valid archives; failed dump rejected without partial archive.'
