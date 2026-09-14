#!/usr/bin/env bash
# Carga reproducible del corpus de F3 (Pilar A, deteccion multi-etapa).
#
# Recrea los topics del pipeline y reproduce un conjunto FIJO de datasets, de
# forma que el estado de partida de la fase sea siempre el mismo y las cifras
# de la evaluacion (F7) se puedan reproducir con un solo comando.
#
# Motivo: hasta ahora los topics acumulaban pasadas superpuestas de dias
# distintos y los grupos de consumo tenian offsets solo en algunas particiones,
# de modo que parte de los datos nunca llegaba a procesarse.
#
# Uso:
#   ./scripts/load_f3_corpus.sh                 # todo: topics + replay + proceso
#   ./scripts/load_f3_corpus.sh --solo-replay   # no procesa, solo publica en raw
#   ./scripts/load_f3_corpus.sh --sin-topics    # no recrea los topics
#   ./scripts/load_f3_corpus.sh --con-eventos   # ademas vuelca a tfg.events (ojo)
#   DETECT_INSTANCIAS=3 ./scripts/load_f3_corpus.sh    # detecta en paralelo
set -euo pipefail

cd "$(dirname "$0")/.."

PY="${PY:-.venv/bin/python}"
BASE="data/Security-Datasets/datasets/compound"
SUFIJO="${SUFIJO:-f3}"                       # grupos de consumo nuevos, sin herencia
DETECT_INSTANCIAS="${DETECT_INSTANCIAS:-1}"  # norm.events tiene 6 particiones

RECREAR_TOPICS=1
PROCESAR=1
CON_EVENTOS=0    # volcar norm.events a tfg.events: OFF por defecto, ver abajo
for arg in "$@"; do
  case "$arg" in
    --sin-topics)   RECREAR_TOPICS=0 ;;
    --solo-replay)  PROCESAR=0 ;;
    --con-eventos)  CON_EVENTOS=1 ;;
    *) echo "Opcion desconocida: $arg"; exit 1 ;;
  esac
done

# --- Corpus de F3 -----------------------------------------------------------
# dataset_id|ruta del fichero JSON Lines
#
# apt29 day1 conserva su identificador original (SDWIN-200501225525) para que
# las cifras sigan siendo comparables con las de F2 ya documentadas.
# Las 7 campanas LSASS usan identificadores legibles: son la prueba de
# generalizacion de P1 (siete herramientas distintas, una misma tecnica).
# day2 (1,7 GB) queda fuera de esta pasada; se anade de forma deliberada.
CORPUS=(
  "SDWIN-200501225525|data/samples/apt29/apt29_evals_day1_manual_2020-05-01225525.json"
  "SDWIN-201018195009|data/samples/psh_lsass_memory_dump_comsvcs_2020-10-18T19500924.json"
  "LSASS_campaign_01|$BASE/LSASS_campaign_01/metasploit_logonpasswords_lsass_memory_dump.json"
  "LSASS_campaign_02|$BASE/LSASS_campaign_02/metasploit_procdump_lsass_memory_dump.json"
  "LSASS_campaign_03|$BASE/LSASS_campaign_03/metasploit_comsvcs_lsass_memory_dump.json"
  "LSASS_campaign_04|$BASE/LSASS_campaign_04/metasploit_out-minidump_lsass_memory_dump.json"
  "LSASS_campaign_05|$BASE/LSASS_campaign_05/metasploit_sharpdump_lsass_memory_dump.json"
  "LSASS_campaign_06|$BASE/LSASS_campaign_06/metasploit_outflank-dumpert_lsass_memory_dump.json"
  "LSASS_campaign_07|$BASE/LSASS_campaign_07/metasploit_nanodump_lsass_memory_dump.json"
)

# --- Comprobaciones previas -------------------------------------------------
faltan=0
for entrada in "${CORPUS[@]}"; do
  fichero="${entrada#*|}"
  if [[ ! -f "$fichero" ]]; then echo "FALTA: $fichero"; faltan=1; fi
done
[[ $faltan -eq 1 ]] && { echo "Extrae los ficheros que faltan antes de seguir."; exit 1; }

docker exec redpanda rpk cluster health >/dev/null 2>&1 \
  || { echo "Redpanda no responde. Levanta la infraestructura: ./scripts/up.sh store"; exit 1; }

# --- Topics -----------------------------------------------------------------
# Contrato de particiones del roadmap: raw 3, norm 6, det 3, dlq 1.
if [[ $RECREAR_TOPICS -eq 1 ]]; then
  echo "== Recreando topics del pipeline (los datos previos se descartan) =="
  for t in raw.host.windows norm.events det.alerts dlq.normalize dlq.detect; do
    docker exec redpanda rpk topic delete "$t" >/dev/null 2>&1 || true
  done
  sleep 2
  docker exec redpanda rpk topic create raw.host.windows -p 3
  docker exec redpanda rpk topic create norm.events      -p 6
  docker exec redpanda rpk topic create det.alerts       -p 3
  docker exec redpanda rpk topic create dlq.normalize    -p 1
  docker exec redpanda rpk topic create dlq.detect       -p 1
  echo ""
fi

# --- Replay -----------------------------------------------------------------
echo "== Reproduciendo el corpus hacia raw.host.windows =="
for entrada in "${CORPUS[@]}"; do
  dataset_id="${entrada%%|*}"
  fichero="${entrada#*|}"
  echo "-- $dataset_id"
  $PY -m pipeline.replay_dataset --file "$fichero" --dataset-id "$dataset_id" \
    | tail -4
done
echo ""

[[ $PROCESAR -eq 0 ]] && { echo "Replay terminado (--solo-replay)."; exit 0; }

# --- Procesado --------------------------------------------------------------
# Grupos de consumo NUEVOS y --from-beginning: los topics acaban de recrearse,
# asi que leer desde el principio es exactamente el corpus y nada mas.
echo "== Normalizando raw.host.windows -> norm.events =="
$PY -m pipeline.jobs.normalize_job --group-id "normalizer-$SUFIJO" \
  --from-beginning --idle-exit 20

echo ""
echo "== Detectando norm.events -> det.alerts  ($DETECT_INSTANCIAS instancia/s) =="
if [[ "$DETECT_INSTANCIAS" -gt 1 ]]; then
  pids=()
  for i in $(seq 1 "$DETECT_INSTANCIAS"); do
    $PY -m pipeline.jobs.detect_job --group-id "detector-$SUFIJO" \
      --from-beginning --idle-exit 45 > "/tmp/detect-$SUFIJO-$i.log" 2>&1 &
    pids+=($!)
  done
  echo "   Instancias lanzadas: ${pids[*]}  (registro en /tmp/detect-$SUFIJO-*.log)"
  wait "${pids[@]}"
  grep -h "Alertas" "/tmp/detect-$SUFIJO"-*.log || true
else
  $PY -m pipeline.jobs.detect_job --group-id "detector-$SUFIJO" \
    --from-beginning --idle-exit 45
fi

echo ""
echo "== Volcando alertas a ClickHouse =="
# No hace falta vaciar tfg.alerts: desde el 31-07 el alert_id es determinista
# (sha1 del evento normalizado + regla) y la tabla es ReplacingMergeTree, asi que
# re-ejecutar esta carga sobreescribe en lugar de duplicar. Consultar con FINAL
# -o ejecutar OPTIMIZE TABLE tfg.alerts FINAL- para forzar la deduplicacion.
$PY -m pipeline.jobs.sink_alerts --group-id "ch-alerts-$SUFIJO" \
  --from-beginning --idle-exit 20 --ch-host 127.0.0.1

# El volcado de eventos normalizados va detras de --con-eventos. Hasta el
# 11-09-2026 era peligroso activarlo: tfg.events guardaba tambien los 1,22 M
# eventos atomicos con los que se entreno ML-1 y el sink no era idempotente,
# de modo que volcar dos veces duplicaba apt29. Tras la migracion
# (infra/clickhouse/migrations/2026-09-11_identidad_y_tiempo.sql) ya no es asi:
# esos eventos estan en tfg.events_legacy, y tfg.events es ReplacingMergeTree
# sobre la identidad del evento, asi que volcar dos veces SOBRESCRIBE.
# Se conserva la opcion por coste (son ~530.000 eventos), no por riesgo.
if [[ $CON_EVENTOS -eq 1 ]]; then
  echo ""
  echo "== Volcando eventos normalizados a ClickHouse =="
  $PY -m pipeline.jobs.sink_clickhouse --group-id "ch-sink-$SUFIJO" \
    --from-beginning --idle-exit 20 --ch-host 127.0.0.1
fi

# --- Fusion final --------------------------------------------------------------
# tfg.events y tfg.alerts son ReplacingMergeTree: la deduplicacion ocurre en las
# FUSIONES, que ClickHouse hace en segundo plano y cuando le parece. Hasta que
# ocurren, un count() sin FINAL cuenta los duplicados. Medido el 14-09-2026 tras
# volcar el corpus dos veces: 784.823 filas sin FINAL frente a 530.401 con FINAL,
# y la vista de movimiento lateral daba 65 conexiones en vez de 39. Los paneles
# de Grafana consultan sin FINAL, asi que estaban contando un 48 % de mas.
# Forzar la fusion al terminar deja los recuentos exactos sin tener que poner
# FINAL en cada consulta. Es seguro: solo elimina duplicados exactos por identidad.
echo ""
echo "== Fusionando duplicados (OPTIMIZE ... FINAL) =="
for tabla in tfg.events tfg.alerts; do
  docker exec clickhouse clickhouse-client --user tfg --password tfg \
    --query "OPTIMIZE TABLE $tabla FINAL"
  echo "   $tabla: $(docker exec clickhouse clickhouse-client --user tfg --password tfg \
    --query "SELECT count() FROM $tabla") filas"
done

echo ""
echo "Carga completada. Comprueba el resultado con:"
echo "  docker exec clickhouse clickhouse-client --user tfg --password tfg --query \\"
echo "    \"SELECT dataset_id, count() FROM tfg.alerts GROUP BY dataset_id ORDER BY 2 DESC\""
