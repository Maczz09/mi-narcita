#!/usr/bin/env bash
# Snapshot de observabilidad para el informe de resiliencia.
# Uso: snap.sh <label>
# Escribe docs/informe-resiliencia/raw/<label>.snap.txt con:
#   - circuit_breaker_state y contadores de resiliencia (Prometheus API :9090)
#   - /health/dependencies de los 9 servicios (vía Kong :8000, con token)
set -u
LABEL="${1:?falta label}"
OUT="docs/informe-resiliencia/raw/${LABEL}.snap.txt"
TOKEN="$(cat /tmp/nacho_token.txt 2>/dev/null)"
PROM="http://localhost:9090/api/v1/query"

q() { curl -s "$PROM" --data-urlencode "query=$1" | python -c "
import json,sys
try: d=json.load(sys.stdin)['data']['result']
except Exception: d=[]
for r in d:
    m=r['metric']; lbl=m.get('breaker') or m.get('dependency') or m.get('modalidad') or m.get('queue') or ''
    print(f\"  {m.get('__name__','')}{('{'+lbl+'}') if lbl else ''} = {r['value'][1]}\")
"; }

{
  echo "# SNAPSHOT $LABEL — $(date -Iseconds)"
  echo "## circuit_breaker_state (0=CLOSED 0.5=HALF_OPEN 1=OPEN)"; q 'circuit_breaker_state'
  echo "## circuit_breaker_open_total"; q 'circuit_breaker_open_total'
  echo "## dependency_timeout_total"; q 'dependency_timeout_total'
  echo "## retry_attempts_total"; q 'retry_attempts_total'
  echo "## circuit_timeout_total"; q 'circuit_timeout_total'
  echo "## pedidos_rechazados_dependencia_total"; q 'pedidos_rechazados_dependencia_total'
  echo "## pedidos_rechazados_sin_stock_total"; q 'pedidos_rechazados_sin_stock_total'
  echo "## pagos_cierre_remoto_pendiente_total"; q 'pagos_cierre_remoto_pendiente_total'
  echo "## pagos_cierre_reconciliado_total"; q 'pagos_cierre_reconciliado_total'
  echo "## dlq_messages_total"; q 'dlq_messages_total'
  echo "## bulkhead_in_flight"; q 'bulkhead_in_flight'
  echo "## /health/dependencies por servicio (vía Kong)"
  for s in identidad mesas pedidos cuentas reservas inventario notificaciones caja reportes; do
    R=$(curl -s -m 6 "http://localhost:8000/v1/${s}/health/dependencies" -H "Authorization: Bearer $TOKEN")
    echo "  [$s] $(echo "$R" | python -c "import json,sys;d=json.load(sys.stdin);print(d.get('status'),'|',d.get('dependencies'))" 2>/dev/null || echo "$R" | head -c 120)"
  done
} > "$OUT"
cat "$OUT"
