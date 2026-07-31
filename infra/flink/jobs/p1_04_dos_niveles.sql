-- =============================================================================
-- P1 · correlacion jerarquica en dos niveles
-- =============================================================================
-- POR QUE DOS NIVELES (hallazgo del 31-07-2026, no una decision estetica):
--
-- Flink no admite cuantificadores voraces como ultimo elemento de un PATTERN
-- ("Greedy quantifiers are not allowed as the last element of a Pattern yet"),
-- y el cuantificador reluctante que si admite produce la coincidencia MINIMA.
-- Es decir: MATCH_RECOGNIZE no puede expresar "agrupa todas las evidencias
-- consecutivas hasta que se abra un hueco". Comprobado empiricamente: con
-- PATTERN (E+? C) salen 29 coincidencias de dos filas donde el oraculo ve 10
-- campanas.
--
-- La solucion es la correlacion jerarquica que ya contemplaba el roadmap:
--
--   NIVEL 1 (MATCH_RECOGNIZE) — detecta la TRANSICION: una evidencia seguida de
--       una alerta de acceso a credenciales dentro de la ventana. Es lo que un
--       CEP hace bien: reconocer una secuencia ordenada.
--   NIVEL 2 (agregacion por hueco) — agrupa transiciones consecutivas del mismo
--       host en una campana. Es lo que un CEP hace mal y una agregacion hace
--       trivialmente.
--
-- AFTER MATCH SKIP TO NEXT ROW en lugar de PAST LAST ROW: con PAST LAST ROW se
-- consumen las dos filas de cada transicion y las rachas impares pierden la
-- ultima evidencia. Permitiendo transiciones solapadas, el nivel 2 las funde.
--
-- Oraculo de referencia: vista tfg.p1_campanas en ClickHouse.
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
    'properties.group.id' = 'flink-p1-2n',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

WITH evidencia AS (
    SELECT
        tfg.dataset_id AS dataset,
        device.hostname AS host,
        ts, `time` AS t_ms, alert_id, event_hash, rule_title,
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

-- ---- NIVEL 1: la transicion, con MATCH_RECOGNIZE -------------------------
transiciones AS (
    SELECT * FROM evidencia
    MATCH_RECOGNIZE (
        PARTITION BY dataset, host
        ORDER BY ts
        MEASURES
            E.ts        AS t_ini,
            C.ts        AS t_fin,
            -- LAG no admite TIMESTAMP_LTZ: se arrastra el epoch en ms para el nivel 2
            E.t_ms      AS t_ini_ms,
            C.t_ms      AS t_fin_ms,
            E.lsass_i + C.lsass_i AS lsass,
            E.util_i  + C.util_i  AS util,
            E.fich_i  + C.fich_i  AS fich,
            E.limp_i  + C.limp_i  AS limp
        ONE ROW PER MATCH
        AFTER MATCH SKIP TO NEXT ROW
        PATTERN (E C)
        -- Transicion BIDIRECCIONAL: basta con que UNA de las dos filas sea de
        -- credenciales. Asi vale tanto "preparacion -> credenciales" como
        -- "credenciales -> limpieza". Exigir que fuera la segunda perdia
        -- apt29/NASHUA, donde el acceso remoto a LSASS por WinRM (03:09:31) va
        -- SEGUIDO -no precedido- de la limpieza del registro (03:14:21).
        DEFINE
            C AS (C.cred_i = 1 OR E.cred_i = 1)
             AND TIMESTAMPDIFF(SECOND, E.ts, C.ts) <= 600
    ) AS t
),

-- ---- NIVEL 2: agrupacion de transiciones en campanas ---------------------
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
    dataset, host, campana,
    MIN(t_ini) AS inicio,
    MAX(t_fin) AS fin,
    COUNT(*)   AS transiciones,
    -- OJO con la semantica de estos contadores: con SKIP TO NEXT ROW las
    -- transiciones se SOLAPAN, asi que una misma alerta participa en dos y se
    -- contaria dos veces. Como COUNT(DISTINCT ...) no esta permitido en
    -- MEASURES, no son "alertas con esa etapa" sino TRANSICIONES que la tocan.
    -- Para el recuento exacto por alerta hay que cruzar aguas abajo contra la
    -- evidencia usando el intervalo [inicio, fin] de la campana.
    SUM(lsass) AS trans_acceso_lsass,
    SUM(util)  AS trans_ejecucion_util,
    SUM(fich)  AS trans_fichero,
    SUM(limp)  AS trans_limpieza
FROM numeradas
GROUP BY dataset, host, campana
ORDER BY dataset, inicio;
