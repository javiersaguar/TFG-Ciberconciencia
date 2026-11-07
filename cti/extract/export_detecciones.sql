-- Exportación de lo detectado en APT29 para la evaluación extrínseca de ML-2 (F4.3, pasos 6b y 6c).
-- Solo lectura. Una fila JSON por línea con un campo `tipo`:
--   alerta_tecnica  alertas por técnica y dataset (con reglas distintas);
--   campana         campañas detectadas, con sus técnicas y hosts.
-- day2 (SDWIN-200502035409) solo aparece si ya está cargado.
--
-- Uso (desde la raíz del repo):
--   mkdir -p data/ml2/detecciones && docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format JSONEachRow < cti/extract/export_detecciones.sql > data/ml2/detecciones/apt29.jsonl

SELECT
    'alerta_tecnica'        AS tipo,
    dataset_id,
    tecnica,
    count()                 AS alertas,
    uniqExact(rule_id)      AS reglas,
    groupUniqArray(10)(rule_title) AS ejemplos_regla
FROM tfg.alerts FINAL
ARRAY JOIN technique_ids AS tecnica
WHERE dataset_id IN ('SDWIN-200501225525', 'SDWIN-200502035409')
GROUP BY dataset_id, tecnica
ORDER BY dataset_id, alertas DESC;

SELECT
    'campana'               AS tipo,
    campaign_id,
    pattern_id,
    dataset_id,
    title,
    first_seen,
    last_seen,
    confidence_score,
    devices,
    technique_ids,
    tactic_names,
    related_events_count
FROM tfg.campaigns FINAL
WHERE dataset_id IN ('SDWIN-200501225525', 'SDWIN-200502035409')
ORDER BY dataset_id, pattern_id, first_seen;
