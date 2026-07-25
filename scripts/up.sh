#!/usr/bin/env bash
# Levanta la infraestructura del TFG segun el perfil indicado.
# Uso: ./scripts/up.sh [core|stream|store|obs|all]   (por defecto: all)
set -euo pipefail

cd "$(dirname "$0")/../infra"

PROFILE="${1:-all}"

case "$PROFILE" in
  core)   PROFILES=(--profile core) ;;
  stream) PROFILES=(--profile core --profile stream) ;;
  store)  PROFILES=(--profile core --profile stream --profile store) ;;
  obs)    PROFILES=(--profile core --profile observability) ;;
  all)    PROFILES=(--profile core --profile stream --profile store --profile observability) ;;
  *) echo "Perfil desconocido: $PROFILE (usa core|stream|store|obs|all)"; exit 1 ;;
esac

echo "Levantando infraestructura (perfil: $PROFILE)..."
docker compose "${PROFILES[@]}" up -d

echo ""
echo "Esperando a que los servicios esten sanos..."
sleep 5
docker compose "${PROFILES[@]}" ps

echo ""
echo "Interfaces web:"
echo "  Redpanda Console : http://localhost:8080"
[[ "$PROFILE" == "stream" || "$PROFILE" == "store" || "$PROFILE" == "all" ]] && \
  echo "  Flink Dashboard  : http://localhost:8081"
[[ "$PROFILE" == "store"  || "$PROFILE" == "all" ]] && \
  echo "  ClickHouse HTTP  : http://localhost:8123"
[[ "$PROFILE" == "obs"    || "$PROFILE" == "all" ]] && {
  echo "  Grafana          : http://localhost:3001  (admin/admin)"
  echo "  Prometheus       : http://localhost:9090"
}
exit 0