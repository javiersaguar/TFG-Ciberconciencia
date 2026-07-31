-- =============================================================================
-- P1 · MATCH_RECOGNIZE — robo de credenciales
-- =============================================================================
-- Oraculo de referencia: vista tfg.p1_campanas en ClickHouse
-- (detection/patterns/p1_credential_theft.sql). Esta consulta debe reproducirla.
--
-- Decisiones de implementacion:
--
--   * La entrada se FILTRA a la evidencia (credenciales o limpieza) antes del
--     MATCH_RECOGNIZE. El patron exige filas contiguas dentro de la particion, y
--     en apt29 entre el acceso a LSASS y la limpieza hay decenas de alertas sin
--     relacion. Filtrar coincide ademas con la semantica acordada: la campana ES
--     su evidencia, y la absorcion de alertas es una metrica derivada.
--
--   * Agrupacion por HUECO entre evidencias consecutivas (<= 10 min), no por
--     duracion total del match. Reproduce el criterio del oraculo. Se usa
--     LAST(E.ts, 1) -desplazamiento 1- porque LAST(E.ts) incluiria la propia
--     fila que se esta intentando encajar y el hueco seria siempre 0.
--
--   * Los indicadores de etapa se precalculan como enteros en la proyeccion:
--     DEFINE y MEASURES no admiten subconsultas correlacionadas sobre arrays
--     ("no SELECT scope"), leccion del primer intento.
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
    'properties.group.id' = 'flink-p1-match',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

SELECT *
FROM (
    SELECT
        tfg.dataset_id                                   AS dataset,
        device.hostname                                  AS host,
        ts,
        alert_id,
        event_hash,
        rule_title,
        -- Etapas precalculadas (mismos criterios que el oraculo en batch)
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
             THEN 1 ELSE 0 END                           AS cred_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1070%'
             THEN 1 ELSE 0 END                           AS limp_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%Open%'
             THEN 1 ELSE 0 END                           AS lsass_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%Launch%'
             THEN 1 ELSE 0 END                           AS util_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%File System%'
             THEN 1 ELSE 0 END                           AS fich_i
    FROM det_alerts
    WHERE ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
       OR ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1070%'
) AS evidencia
MATCH_RECOGNIZE (
    PARTITION BY dataset, host
    ORDER BY ts
    MEASURES
        FIRST(E.ts)                AS inicio_evidencia,
        LAST(C.ts)                 AS fin,
        -- COUNT(DISTINCT ...) no esta permitido en MEASURES ("DISTINCT/ALL not
        -- allowed"): el recuento de eventos distintos, que en el oraculo separa
        -- una accion que dispara varias reglas de varias acciones, hay que
        -- calcularlo aguas abajo.
        COUNT(*)                   AS n_evidencia,
        COUNT(C.alert_id)          AS n_credencial,
        SUM(E.lsass_i) + SUM(C.lsass_i) AS ev_acceso_lsass,
        SUM(E.util_i)  + SUM(C.util_i)  AS ev_ejecucion_util,
        SUM(E.fich_i)  + SUM(C.fich_i)  AS ev_fichero,
        SUM(E.limp_i)  + SUM(C.limp_i)  AS ev_limpieza
    ONE ROW PER MATCH
    AFTER MATCH SKIP PAST LAST ROW
    -- Flink no admite cuantificadores voraces como ultimo elemento: el patron
    -- debe terminar en variable simple. Se reformula como "racha de evidencia
    -- que termina en una alerta de credenciales", que ademas expresa mejor una
    -- SECUENCIA -que es lo propio de un patron CEP- que un simple agrupamiento.
    PATTERN (E+? C)
    DEFINE
        E AS LAST(E.ts, 1) IS NULL
          OR TIMESTAMPDIFF(SECOND, LAST(E.ts, 1), E.ts) <= 600,
        C AS C.cred_i = 1
          AND TIMESTAMPDIFF(SECOND, LAST(E.ts), C.ts) <= 600
) AS m;
