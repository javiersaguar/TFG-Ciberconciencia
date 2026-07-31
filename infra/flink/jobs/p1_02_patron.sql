-- =============================================================================
-- P1 · paso 2 — El patron, incremental
-- =============================================================================
-- Leccion del paso 1: DEFINE no admite subconsultas correlacionadas
-- ("no SELECT scope"), asi que toda la logica sobre arrays se PRECALCULA en la
-- proyeccion y DEFINE se queda con expresiones simples sobre columnas.
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';

CREATE TABLE det_alerts (
    alert_id     STRING,
    event_hash   STRING,
    `time`       BIGINT,
    detected_at  BIGINT,
    rule_id      STRING,
    rule_title   STRING,
    rule_level   STRING,
    rule_status  STRING,
    attack       ROW<technique_ids ARRAY<STRING>, tactic_ids ARRAY<STRING>>,
    device       ROW<hostname STRING>,
    actor        ROW<user_name STRING, process_name STRING>,
    source_event ROW<class_uid INT, type_uid INT, type_name STRING,
                     channel STRING, event_id INT>,
    matched_fields MAP<STRING, STRING>,
    tfg          ROW<dataset_id STRING, detector STRING>,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.alerts',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p1-patron',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Comprobacion previa: ¿existe ARRAY_JOIN y sirve para el prefijo de tecnica?
-- Si esto falla, la alternativa es CAST(... AS STRING) LIKE '%T1003%'.
SELECT rule_title,
       ARRAY_JOIN(attack.technique_ids, ',') AS tecnicas,
       ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%' AS es_credencial
FROM det_alerts
WHERE tfg.dataset_id = 'LSASS_campaign_04'
LIMIT 5;
