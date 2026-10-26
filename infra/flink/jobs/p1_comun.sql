-- =============================================================================
-- P1 · definiciones comunes (fichero de INICIO del cliente SQL, opcion -i)
-- =============================================================================
-- Misma estructura que P2 (p2_comun.sql), desde el 26-10-2026:
--
--   p1_06_flujo.sql     det.alerts -> det.p1_flujo   (evidencia SIN REPETIDOS)
--   p1_07_campanas.sql  comprobaciones contra el oraculo (tfg.p1_campanas)
--   p1_08_emision.sql   det.p1_flujo -> det.campaigns (esquema comun, OCSF)
--
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p1_comun.sql -f /opt/jobs/p1_0X_....sql
--
-- POR QUE UN FLUJO SIN REPETIDOS (hallazgo del 26-10): con seis detectores en
-- paralelo, det.alerts trae republicaciones de los cortes de confirmacion
-- (1.201 publicadas para 1.184 distintas el 25-10). p1_05 leia det.alerts tal
-- cual: una alerta de credenciales AISLADA publicada dos veces formaria una
-- "transicion" consigo misma (dos filas de credenciales a 0 s) y, con ella, una
-- campana falsa. El 31-07 no pasaba porque habia un solo detector. Quitar los
-- repetidos exige ROW_NUMBER, que hace perder a `ts` su condicion de atributo de
-- tiempo, y MATCH_RECOGNIZE la necesita: de ahi el topic intermedio, como en P2.
--
-- La logica del patron es la de p1_05_emision.sql (validada el 31-07 contra el
-- oraculo: las mismas 11 campanas), sin cambios.
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';
SET 'table.dml-sync' = 'true';

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
    'properties.group.id' = 'flink-p1-alertas',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- La evidencia de P1, una fila por alerta, con sus etapas precalculadas
-- (DEFINE no admite logica sobre arrays: leccion del 31-07).
CREATE TABLE p1_flujo (
    dataset     STRING,
    host        STRING,
    `time`      BIGINT,
    alert_id    STRING,
    regla       STRING,
    nivel       STRING,
    cred        INT,     -- T1003.*: acceso a credenciales (el ancla)
    limp        INT,     -- T1070.*: limpieza
    lsass       INT,     -- T1003 sobre acceso a proceso (Sysmon 10)
    util        INT,     -- T1003 sobre creacion de proceso (la herramienta)
    fich        INT,     -- T1003 sobre evento de fichero (el volcado a disco)
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.p1_flujo',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p1-flujo',
    'key.format' = 'raw',
    'key.fields' = 'host',
    'value.format' = 'json',
    'value.fields-include' = 'ALL',
    'value.json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- La salida, en el esquema comun (docs/esquema-campana.md). Igual que en P2.
CREATE TABLE det_campaigns (
    clave      STRING,
    documento  STRING
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.campaigns',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-campanas-p1',
    'key.format' = 'raw',
    'key.fields' = 'clave',
    'value.format' = 'raw',
    'value.fields-include' = 'EXCEPT_KEY',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Alertas sin repetidos (alert_id es determinista: sha1 del evento + regla)
CREATE TEMPORARY VIEW alertas_unicas AS
SELECT dataset, host, t_ms, alert_id, rule_title, rule_level, tipo,
       tecnicas, tecnicas_arr, tacticas_arr
FROM (
    SELECT tfg.dataset_id                         AS dataset,
           device.hostname                        AS host,
           `time`                                 AS t_ms,
           alert_id,
           rule_title,
           rule_level,
           source_event.type_name                 AS tipo,
           ARRAY_JOIN(attack.technique_ids, ',')  AS tecnicas,
           attack.technique_ids                   AS tecnicas_arr,
           attack.tactic_ids                      AS tacticas_arr,
           ROW_NUMBER() OVER (PARTITION BY alert_id ORDER BY detected_at) AS rn
    FROM det_alerts
)
WHERE rn = 1;

-- =============================================================================
-- PATRON Y CAMPANAS, sobre det.p1_flujo (escrito por p1_06_flujo.sql)
-- =============================================================================

-- NIVEL 1 · transicion entre dos evidencias consecutivas del mismo host, a
-- <= 10 min, siendo AL MENOS UNA de credenciales. Bidireccional (31-07): vale
-- "preparacion -> credenciales" y "credenciales -> limpieza" (caso NASHUA).
-- TIMESTAMPDIFF en segundos, como p1_05 (lo validado contra el oraculo).
CREATE TEMPORARY VIEW transiciones_p1 AS
SELECT *
FROM (
    SELECT dataset, host, ts, `time` AS t_ms, cred
    FROM p1_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, host
    ORDER BY ts
    MEASURES
        E.t_ms AS t_ini_ms,
        C.t_ms AS t_fin_ms
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (E C)
    DEFINE
        C AS (C.cred = 1 OR E.cred = 1)
         AND TIMESTAMPDIFF(SECOND, E.ts, C.ts) <= 600
) AS t;

-- NIVEL 2 · transiciones del mismo host separadas <= 10 min forman una campana.
-- LAG sobre epoch-ms: LAG no acepta TIMESTAMP_LTZ.
CREATE TEMPORARY VIEW transiciones_marcadas_p1 AS
SELECT *,
       CASE WHEN LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms) IS NULL
              OR (t_ini_ms - LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms)) > 600000
            THEN 1 ELSE 0 END AS abre
FROM transiciones_p1;

CREATE TEMPORARY VIEW transiciones_campana_p1 AS
SELECT *,
       SUM(abre) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana
FROM transiciones_marcadas_p1;

-- La campana se acota a su EVIDENCIA (de la primera a la ultima transicion), no
-- a +-10 min alrededor de las anclas como el oraculo: diferencia de definicion
-- decidida el 31-07, no un error.
CREATE TEMPORARY VIEW campanas_base_p1 AS
SELECT dataset, host, campana,
       MIN(t_ini_ms) AS inicio,
       MAX(t_fin_ms) AS fin,
       COUNT(*)      AS transiciones
FROM transiciones_campana_p1
GROUP BY dataset, host, campana;

-- La evidencia de cada campana, una vez cada alerta (los contadores de p1_05
-- contaban TRANSICIONES que tocaban una etapa; estos cuentan ALERTAS).
CREATE TEMPORARY VIEW evidencia_p1 AS
SELECT c.dataset, c.host, c.campana, f.alert_id, f.`time` AS t_ms,
       f.cred, f.limp, f.lsass, f.util, f.fich
FROM campanas_base_p1 AS c
JOIN p1_flujo AS f
  ON f.dataset = c.dataset AND f.host = c.host
WHERE f.`time` BETWEEN c.inicio AND c.fin;

CREATE TEMPORARY VIEW evidencia_campana_p1 AS
SELECT dataset, host, campana,
       COUNT(*)   AS evidencias,
       SUM(cred)  AS ev_credenciales,
       SUM(lsass) AS ev_acceso_lsass,
       SUM(util)  AS ev_ejecucion_herramienta,
       SUM(fich)  AS ev_volcado_a_disco,
       SUM(limp)  AS ev_limpieza
FROM evidencia_p1
GROUP BY dataset, host, campana;

-- Todas las alertas del host dentro de la campana (para la reduccion de alertas)
CREATE TEMPORARY VIEW alertas_ventana_p1 AS
SELECT c.dataset, c.host, c.campana, COUNT(*) AS alertas_en_ventana
FROM campanas_base_p1 AS c
JOIN alertas_unicas AS a
  ON a.dataset = c.dataset AND a.host = c.host
WHERE a.t_ms BETWEEN c.inicio AND c.fin
GROUP BY c.dataset, c.host, c.campana;

-- Las campanas, con la identidad comun: md5(dataset | P1 | host | inicio en ms)
-- y la confianza descompuesta con los pesos del oraculo (p1_05).
CREATE TEMPORARY VIEW campanas_p1 AS
SELECT
    LOWER(MD5(CONCAT(c.dataset, '|P1|', c.host, '|', CAST(c.inicio AS STRING)))) AS campaign_id,
    c.dataset, c.host, c.campana, c.inicio, c.fin, c.transiciones,
    e.evidencias, e.ev_credenciales, e.ev_acceso_lsass, e.ev_ejecucion_herramienta,
    e.ev_volcado_a_disco, e.ev_limpieza,
    w.alertas_en_ventana,
    LEAST(1.0,
          0.40
        + CASE WHEN e.ev_acceso_lsass > 0          THEN 0.25 ELSE 0.0 END
        + CASE WHEN e.ev_volcado_a_disco > 0       THEN 0.20 ELSE 0.0 END
        + CASE WHEN e.ev_ejecucion_herramienta > 0 THEN 0.10 ELSE 0.0 END
        + CASE WHEN e.ev_limpieza > 0              THEN 0.15 ELSE 0.0 END) AS confianza
FROM campanas_base_p1 AS c
JOIN evidencia_campana_p1 AS e
  ON e.dataset = c.dataset AND e.host = c.host AND e.campana = c.campana
JOIN alertas_ventana_p1 AS w
  ON w.dataset = c.dataset AND w.host = c.host AND w.campana = c.campana;
