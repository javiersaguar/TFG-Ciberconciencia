-- Prueba: ¿funciona el modo batch sobre la fuente Kafka acotada?
-- Si funciona, la validacion de P1 es mucho mas simple (salida final, sin
-- changelog) y desaparecen los problemas de watermark. Si MATCH_RECOGNIZE no
-- esta soportado en batch, lo sabremos aqui y no a mitad del patron.
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
    'properties.group.id' = 'flink-p1-batch',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- 1) Recuento limpio por dataset (comparar con el oraculo)
SELECT tfg.dataset_id AS dataset,
       COUNT(*) AS alertas_topic,
       COUNT(DISTINCT alert_id) AS alert_ids_unicos
FROM det_alerts
GROUP BY tfg.dataset_id
ORDER BY alertas_topic DESC;

-- 2) ¿Esta soportado MATCH_RECOGNIZE en batch? Patron minimo: dos alertas de
--    credenciales seguidas en el mismo host.
SELECT *
FROM (
    SELECT device.hostname AS host, ts, alert_id, attack.technique_ids AS tecnicas
    FROM det_alerts
    WHERE tfg.dataset_id = 'LSASS_campaign_04'
)
MATCH_RECOGNIZE (
    PARTITION BY host
    ORDER BY ts
    MEASURES FIRST(A.ts) AS inicio, LAST(A.ts) AS fin, COUNT(A.alert_id) AS n
    ONE ROW PER MATCH
    AFTER MATCH SKIP PAST LAST ROW
    PATTERN (A{2,})
    DEFINE A AS EXISTS (SELECT 1 FROM UNNEST(A.tecnicas) AS t(x) WHERE x LIKE 'T1003%')
) AS m;
