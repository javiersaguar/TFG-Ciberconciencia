-- =============================================================================
-- P1 · emision de campanas a det.campaigns
-- =============================================================================
-- SUSTITUIDO el 26-10-2026 por p1_comun.sql + p1_06_flujo.sql + p1_08_emision.sql:
-- este fichero emitia un esquema propio (contadores trans_*, sin stages[]) y leia
-- det.alerts CON republicaciones. Se conserva como historia de la validacion del
-- 31-07; no volver a ejecutarlo contra det.campaigns.
-- -----------------------------------------------------------------------------
-- Cierra el circuito: norm.events -> det.alerts -> det.campaigns.
--
-- El esquema del roadmap contempla un array stages[] con los alert_id de la
-- evidencia de cada etapa. No se emite todavia: recogerlos exige ALL ROWS PER
-- MATCH y un agregado posterior, y con SKIP TO NEXT ROW las transiciones se
-- solapan, asi que habria que deduplicar. Se emite la campana con su ventana,
-- sus contadores y su confianza descompuesta, y stages[] queda pendiente.
--
-- Prerrequisito:
--   docker exec redpanda rpk topic create det.campaigns -p 3
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
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
    'properties.group.id' = 'flink-p1-emision',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Clave de particion = hostname, igual que el resto de topics del contrato.
CREATE TABLE det_campaigns (
    campaign_id   STRING,
    pattern_id    STRING,
    dataset_id    STRING,
    device_hostname STRING,
    first_seen    BIGINT,
    last_seen     BIGINT,
    duration_s    BIGINT,
    n_transiciones BIGINT,
    trans_acceso_lsass   INT,
    trans_ejecucion_util INT,
    trans_fichero        INT,
    trans_limpieza       INT,
    confidence    DOUBLE
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.campaigns',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'key.format' = 'raw',
    'key.fields' = 'device_hostname',
    'value.format' = 'json',
    'value.fields-include' = 'ALL'
);

INSERT INTO det_campaigns
WITH evidencia AS (
    SELECT
        tfg.dataset_id AS dataset,
        device.hostname AS host,
        ts, `time` AS t_ms,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
             THEN 1 ELSE 0 END AS cred_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1070%'
             THEN 1 ELSE 0 END AS limp_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%Open%'
             THEN 1 ELSE 0 END AS lsass_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%Launch%'
             THEN 1 ELSE 0 END AS util_i,
        CASE WHEN ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
              AND source_event.type_name LIKE '%File System%'
             THEN 1 ELSE 0 END AS fich_i
    FROM det_alerts
    WHERE ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1003%'
       OR ARRAY_JOIN(attack.technique_ids, ',') LIKE '%T1070%'
),
transiciones AS (
    SELECT * FROM evidencia
    MATCH_RECOGNIZE (
        PARTITION BY dataset, host
        ORDER BY ts
        MEASURES
            E.t_ms AS t_ini_ms, C.t_ms AS t_fin_ms,
            E.lsass_i + C.lsass_i AS lsass,
            E.util_i  + C.util_i  AS util,
            E.fich_i  + C.fich_i  AS fich,
            E.limp_i  + C.limp_i  AS limp
        ONE ROW PER MATCH
        AFTER MATCH SKIP TO NEXT ROW
        PATTERN (E C)
        -- Transicion BIDIRECCIONAL: basta con que UNA de las dos filas sea de
        -- credenciales, para que valga tanto "preparacion -> credenciales" como
        -- "credenciales -> limpieza" (caso apt29/NASHUA).
        DEFINE C AS (C.cred_i = 1 OR E.cred_i = 1)
                AND TIMESTAMPDIFF(SECOND, E.ts, C.ts) <= 600
    ) AS t
),
marcadas AS (
    SELECT *,
           CASE WHEN LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms) IS NULL
                  OR (t_ini_ms - LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms)) > 600000
                THEN 1 ELSE 0 END AS abre
    FROM transiciones
),
numeradas AS (
    SELECT *,
           SUM(abre) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana
    FROM marcadas
)
SELECT
    MD5(CONCAT(dataset, '|', host, '|', CAST(MIN(t_ini_ms) AS STRING))) AS campaign_id,
    'P1'                       AS pattern_id,
    dataset                    AS dataset_id,
    host                       AS device_hostname,
    MIN(t_ini_ms)              AS first_seen,
    MAX(t_fin_ms)              AS last_seen,
    (MAX(t_fin_ms) - MIN(t_ini_ms)) / 1000 AS duration_s,
    COUNT(*)                   AS n_transiciones,
    CAST(SUM(lsass) AS INT)    AS trans_acceso_lsass,
    CAST(SUM(util)  AS INT)    AS trans_ejecucion_util,
    CAST(SUM(fich)  AS INT)    AS trans_fichero,
    CAST(SUM(limp)  AS INT)    AS trans_limpieza,
    -- Confianza descompuesta, mismos pesos que el oraculo en batch
    LEAST(1.0,
          0.40
        + CASE WHEN SUM(lsass) > 0 THEN 0.25 ELSE 0.0 END
        + CASE WHEN SUM(fich)  > 0 THEN 0.20 ELSE 0.0 END
        + CASE WHEN SUM(util)  > 0 THEN 0.10 ELSE 0.0 END
        + CASE WHEN SUM(limp)  > 0 THEN 0.15 ELSE 0.0 END
    )                          AS confidence
FROM numeradas
GROUP BY dataset, host, campana;
