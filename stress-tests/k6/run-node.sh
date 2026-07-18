#!/usr/bin/env bash
# Wrapper de nodo para carga distribuida k6 (T-21). Cada nodo corre el mismo
# escenario del sistema etiquetado con su NODE_ID; opcionalmente empuja sus
# métricas al Prometheus del stack vía remote-write para consolidarlas.
#
# Requeridas: NODE_ID, BASE_URL.
# Opcional:   K6_PROMETHEUS_RW_SERVER_URL (activa la salida remote-write).
#
# Uso:
#   NODE_ID=1 BASE_URL=http://localhost:8000 bash stress-tests/k6/run-node.sh
#   NODE_ID=2 BASE_URL=http://localhost:8000 \
#     K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
#     bash stress-tests/k6/run-node.sh
#
# Roles por nodo, presupuesto de rate-limit y la aclaración sobre el circuit
# breaker: ver stress-tests/run-distributed.md.
set -euo pipefail

: "${NODE_ID:?define NODE_ID (id único del nodo, p. ej. 1)}"
: "${BASE_URL:?define BASE_URL (p. ej. http://localhost:8000)}"

SCENARIO="stress-tests/k6/scenarios/sistema.js"

args=(run --tag "node=${NODE_ID}" -e "BASE_URL=${BASE_URL}")
# Salida opcional a Prometheus (consolida las series de todos los nodos con el
# label node="<id>"). Requiere k6 con el output experimental-prometheus-rw.
if [[ -n "${K6_PROMETHEUS_RW_SERVER_URL:-}" ]]; then
  args+=(-o experimental-prometheus-rw)
fi
args+=("${SCENARIO}")

echo "▶ k6 nodo ${NODE_ID} contra ${BASE_URL}${K6_PROMETHEUS_RW_SERVER_URL:+ (remote-write → ${K6_PROMETHEUS_RW_SERVER_URL})}"
exec k6 "${args[@]}"
