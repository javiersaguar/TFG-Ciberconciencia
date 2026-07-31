-- =============================================================================
-- P1 · paso 0 — Tabla Flink sobre det.alerts y comprobacion de lectura
-- =============================================================================
-- Objetivo de este fichero: validar UNICAMENTE que Flink parsea bien el topic.
-- El patron va aparte, para no depurar a la vez el esquema y la semantica del
-- CEP. Si esto no da las cifras del oraculo, no tiene sentido seguir.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh -f /opt/jobs/p1_00_tabla.sql
-- =============================================================================

-- scan.bounded.mode=latest-offset hace que la fuente TERMINE al llegar al final
-- del topic. Con un corpus finito esto evita de raiz el problema clasico del CEP
-- sobre datos historicos: el watermark nunca avanza lo suficiente para cerrar la
-- ultima ventana y no se emite nada. Al acabar la fuente, Flink empuja el
-- watermark al maximo y las coincidencias pendientes se completan.
SET 'execution.runtime-mode' = 'streaming';
SET 'table.exec.source.idle-timeout' = '30 s';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';

DROP TABLE IF EXISTS det_alerts;

CREATE TABLE det_alerts (
    alert_id     STRING,
    event_hash   STRING,
    -- El evento trae el tiempo como epoch en milisegundos (entero), no como
    -- cadena ISO: hay que declararlo BIGINT y derivar la columna de tiempo.
    `time`       BIGINT,
    detected_at  BIGINT,

    rule_id      STRING,
    rule_title   STRING,
    rule_level   STRING,
    rule_status  STRING,

    -- Tecnicas y tacticas son ARRAYS, no escalares. Y las tacticas llevan
    -- NOMBRE ('execution', 'defense-evasion'), no identificadores TAxxxx.
    attack       ROW<technique_ids ARRAY<STRING>, tactic_ids ARRAY<STRING>>,

    device       ROW<hostname STRING>,
    -- actor es plano: user_name / process_name, no actor.user.name
    actor        ROW<user_name STRING, process_name STRING>,

    source_event ROW<class_uid INT, type_uid INT, type_name STRING,
                     channel STRING, event_id INT>,

    -- Claves reales: rutas OCSF (file.path, unmapped.GrantedAccess,
    -- unmapped.CallTrace, process.cmd_line), NO nombres de campo Sigma.
    matched_fields MAP<STRING, STRING>,

    tfg          ROW<dataset_id STRING, detector STRING>,

    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.alerts',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p1',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Comprobacion 1: cuenta total por dataset.
-- Debe coincidir con el oraculo: 1.168 alertas en 9 datasets, apt29 con 738.
SELECT tfg.dataset_id AS dataset, COUNT(*) AS alertas
FROM det_alerts
GROUP BY tfg.dataset_id;
