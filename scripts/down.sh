#!/usr/bin/env bash
# Levanta la infraestructura del TFG segun el perfil indicado.
# Uso: ./scripts/up.sh [core|stream|store|all]   (por defecto: all)
set -euo pipefail

cd "$(dirname "$0")/../infra"

PROFILE="${1:-all}"

case "$PROFILE" in
  core)   PROFILES=(--profile core) ;;
  stream) PROFILES=(--profile core --profile stream) ;;
  store)  PROFILES=(--profile core --profile stream --profile store) ;;
  all)    PROFILES=(--profile core --profile stream --profile store) ;;
  *) echo "Perfil desconocido: $PROFILE (usa core|stream|store|all)"; exit 1 ;;
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
echo "  Flink Dashboard  : http://localhost:8081"
echo "  ClickHouse HTTP  : http://localhost:8123"