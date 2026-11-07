#!/usr/bin/env bash
# Carga FA aislada, autorizada por Javier el 2026-11-07.
# --plan imprime; --execute requiere un lote explícito y ejecuta los controles.
# Nunca borra/recrea topics F3 ni reintenta una carga existente automáticamente.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--execute" ]]; then
  shift
  exec .venv/bin/python -I detection/evaluation/fa_execute.py "$@"
fi

RUN_ID="fa-day2-20261107"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) shift ;;
    --run-id) [[ $# -gt 1 ]] || exit 2; RUN_ID="$2"; shift 2 ;;
    *) echo "Uso: bash scripts/load_fa_corpus.sh --plan [--run-id fa-day2-AAAAMMDD]" >&2; exit 2 ;;
  esac
done
[[ "$RUN_ID" =~ ^fa-day2-[a-z0-9-]+$ ]] || { echo "run-id inválido" >&2; exit 2; }

PY=(.venv/bin/python -I -c 'import pathlib,runpy,sys; sys.path.insert(0,str(pathlib.Path.cwd().resolve())); runpy.run_module(sys.argv.pop(1),run_name="__main__")')
RAW="raw.fa.$RUN_ID.host.windows"
NORM="norm.fa.$RUN_ID.events"
ALERTS="det.fa.$RUN_ID.alerts"
DLQ_NORM="dlq.fa.$RUN_ID.normalize"
DLQ_DETECT="dlq.fa.$RUN_ID.detect"
SOURCE="data/samples/apt29/day2/apt29_evals_day2_manual_2020-05-02035409.json"

emit() { printf '%q ' "$@"; printf '\n'; }
echo '# PLAN; no se ejecuta ninguno de los comandos siguientes.'
echo '# 1. Foto inicial (solo SELECT; una única vez antes de la primera carga).'
emit timeout 540s python3 -I detection/evaluation/fa_snapshot.py capture --output data/fa/foto-f3-antes.json
echo '# 2. Topics EXCLUSIVOS de esta pasada; no borrar ni reutilizar topics previos.'
emit docker exec redpanda rpk topic create "$RAW" -p 3 -c retention.ms=-1
emit docker exec redpanda rpk topic create "$NORM" -p 6 -c retention.ms=-1
emit docker exec redpanda rpk topic create "$ALERTS" -p 3 -c retention.ms=-1
emit docker exec redpanda rpk topic create "$DLQ_NORM" -p 1 -c retention.ms=-1
emit docker exec redpanda rpk topic create "$DLQ_DETECT" -p 1 -c retention.ms=-1
emit docker exec redpanda rpk topic create "det.fa.$RUN_ID.campaigns" -p 3 -c retention.ms=-1
emit docker exec redpanda rpk topic create "det.fa.$RUN_ID.p1_flujo" -p 3 -c retention.ms=-1
emit docker exec redpanda rpk topic create "det.fa.$RUN_ID.p2_flujo" -p 3 -c retention.ms=-1
emit docker exec redpanda rpk topic create "det.fa.$RUN_ID.p3_flujo" -p 3 -c retention.ms=-1
echo '# 3. Solo day2: normalizar/detectar/volcar desde topics propios, nunca desde F3.'
emit timeout 540s "${PY[@]}" pipeline.replay_dataset --file "$SOURCE" --dataset-id SDWIN-200502035409 --topic "$RAW"
emit timeout 540s "${PY[@]}" pipeline.jobs.normalize_job --source-topic "$RAW" --sink-topic "$NORM" --dlq-topic "$DLQ_NORM" --group-id "$RUN_ID-normalizer" --from-beginning --idle-exit 20
emit timeout 540s "${PY[@]}" pipeline.jobs.detect_job --source-topic "$NORM" --sink-topic "$ALERTS" --dlq-topic "$DLQ_DETECT" --group-id "$RUN_ID-detector" --from-beginning --idle-exit 45
emit timeout 540s "${PY[@]}" pipeline.jobs.sink_clickhouse --topic "$NORM" --group-id "$RUN_ID-events" --from-beginning --idle-exit 20 --ch-host 127.0.0.1
emit timeout 540s "${PY[@]}" pipeline.jobs.sink_alerts --topic "$ALERTS" --group-id "$RUN_ID-alerts" --from-beginning --idle-exit 20 --ch-host 127.0.0.1
echo '# 4. Comprobar F3 inmediatamente después de esta carga.'
emit timeout 540s python3 -I detection/evaluation/fa_snapshot.py capture-after --before data/fa/foto-f3-antes.json --output "data/fa/foto-f3-despues-$RUN_ID.json"
emit python3 -I detection/evaluation/fa_snapshot.py compare --before data/fa/foto-f3-antes.json --after "data/fa/foto-f3-despues-$RUN_ID.json"
echo '# PENDIENTES antes de ejecutar pasos 2–4:'
echo '# - revisión de pérdidas/errores de entrega y estado de consumidores activos;'
echo '# - verdad day2 aprobada, carga de su fila y medición viva de DLQ;'
echo '# - generación y revisión de SQL CEP con fuente/destino FA por los tres patrones;'
echo '# - aprobación individual de comandos. Este plan NO cierra T1.'
echo '# CEP derivado de la pasada preparada: data/fa/20261107-day2-plan/COMMANDS.md.'
echo '# Sus seis SQL Client van después de detección y usan los cuatro topics adicionales.'
echo '# Si cambias --run-id, regenera el plan CEP con ese run-id en un directorio nuevo.'
echo '# No ejecutar más de una vez un replay ni reutilizar grupos para otra pasada.'
