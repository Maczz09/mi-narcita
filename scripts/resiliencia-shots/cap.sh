#!/usr/bin/env bash
# Captura estándar de un servicio "de impacto directo".
# Uso: cap.sh <container> <slug> <navA> [navB|-] [moduleWaitMs]
# Hace: stop -> snapshot(down) -> shoot Inicio + navA [+ navB] -> logs -> start -> wait healthy
set -u
C="${1:?container}"; SLUG="${2:?slug}"; NAVA="${3:?navA}"; NAVB="${4:--}"; W="${5:-9000}"
R=docs/informe-resiliencia/raw

echo "=== STOP $C ==="; docker stop "$C" >/dev/null; sleep 3
bash scripts/resiliencia-shots/snap.sh "${SLUG}_down" >/dev/null; echo "snap ${SLUG}_down ok"
node scripts/resiliencia-shots/shoot.mjs "$R/${SLUG}_01_inicio" Inicio - 4000 2>&1 | tail -1
node scripts/resiliencia-shots/shoot.mjs "$R/${SLUG}_02" "$NAVA" - "$W" 2>&1 | tail -1
[ "$NAVB" != "-" ] && node scripts/resiliencia-shots/shoot.mjs "$R/${SLUG}_03" "$NAVB" - "$W" 2>&1 | tail -1
docker logs "$C" --tail 15 > "$R/${SLUG}.svc.log" 2>&1 || true
echo "=== START $C ==="; docker start "$C" >/dev/null
for i in $(seq 1 40); do S=$(docker inspect -f '{{.State.Health.Status}}' "$C" 2>/dev/null); [ "$S" = "healthy" ] && { echo "$C healthy"; break; }; sleep 3; done
