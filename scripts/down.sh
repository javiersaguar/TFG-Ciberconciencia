#!/usr/bin/env bash
# Para toda la infraestructura del TFG (conserva los datos en los volumenes).
set -euo pipefail
cd "$(dirname "$0")/../infra"
echo "Parando infraestructura..."
docker compose --profile core --profile stream --profile store --profile observability down
echo "Hecho. Los datos se conservan en los volumenes."