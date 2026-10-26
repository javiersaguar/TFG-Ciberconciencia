-- =============================================================================
-- P3 · definiciones comunes (fichero de INICIO del cliente SQL, opcion -i)
-- =============================================================================
-- P3, descubrimiento y escalada, en Flink. Misma estructura que P1 y P2:
--
--   p3_01_flujo.sql     alertas + PowerShell -> det.p3_flujo (evidencia por etapa,
--                       sin repetidos, EN ORDEN DE TIEMPO)
--   p3_02_campanas.sql  comprobaciones contra el oraculo (tfg.p3_campanas)
--   p3_03_emision.sql   det.p3_flujo -> det.campaigns (esquema comun, OCSF)
--   st_03_p3.sql        el patron en streaming frente a batch
--
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p3_comun.sql -f /opt/jobs/p3_0X_....sql
--
-- Oraculo y decisiones (26-10-2026): detection/patterns/p3_discovery_escalation.sql.
-- En resumen: etapas por TECNICA; la escalada es el ANCLA; descubrimiento HIBRIDO
-- (alertas Sigma + bloques de PowerShell de norm.events); lista de exclusiones
-- medida (A1: IE Autorun escrita por Explorer al iniciar sesion).
--
-- Primer patron que mezcla en una misma etapa ALERTAS y EVENTOS: el
-- descubrimiento del atacante en apt29 solo se ve en PowerShell.
--
-- Diferencia de definicion con el oraculo, la misma que en P1: la campana de
-- Flink se acota a su EVIDENCIA (de la primera a la ultima transicion), y el
-- oraculo absorbe +-10 min alrededor de las escaladas. En SCRANTON el oraculo
-- llega hasta las 03:09:29 (el Invoke-Command contra NASHUA) y Flink hasta la
-- ultima evidencia encadenada (~03:06:47).
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
    'properties.group.id' = 'flink-p3-alertas',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Solo lo que P3 necesita de los eventos: los bloques de PowerShell (clase 1009)
CREATE TABLE norm_events (
    class_uid   INT,
    `time`      BIGINT,
    device      ROW<hostname STRING>,
    actor       ROW<process ROW<name STRING>>,
    script      ROW<script_content STRING>,
    tfg         ROW<dataset_id STRING, source_channel STRING, record_number BIGINT>,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'norm.events',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p3-eventos',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- La evidencia de P3, una fila por (evidencia, etapa). fuente = 'alerta' | 'evento_ps'.
CREATE TABLE p3_flujo (
    dataset   STRING,
    host      STRING,
    `time`    BIGINT,
    etapa     STRING,
    fuente    STRING,
    id        STRING,
    detalle   STRING,
    nivel     STRING,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.p3_flujo',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p3-flujo',
    'key.format' = 'raw',
    'key.fields' = 'host',
    'value.format' = 'json',
    'value.fields-include' = 'ALL',
    'value.json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

CREATE TABLE det_campaigns (
    clave      STRING,
    documento  STRING
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.campaigns',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-campanas-p3',
    'key.format' = 'raw',
    'key.fields' = 'clave',
    'value.format' = 'raw',
    'value.fields-include' = 'EXCEPT_KEY',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- -----------------------------------------------------------------------------
-- Evidencia (lo que escribe p3_01 en det.p3_flujo)
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW alertas_unicas AS
SELECT dataset, host, t_ms, alert_id, rule_title, rule_level, proceso,
       tecnicas, tecnicas_arr, tacticas_arr
FROM (
    SELECT tfg.dataset_id                         AS dataset,
           device.hostname                        AS host,
           `time`                                 AS t_ms,
           alert_id,
           rule_title,
           rule_level,
           LOWER(actor.process_name)              AS proceso,
           ARRAY_JOIN(attack.technique_ids, ',')  AS tecnicas,
           attack.technique_ids                   AS tecnicas_arr,
           attack.tactic_ids                      AS tacticas_arr,
           ROW_NUMBER() OVER (PARTITION BY alert_id ORDER BY detected_at) AS rn
    FROM det_alerts
)
WHERE rn = 1;

-- Etapas por TECNICA (la tactica engana: T1547.001 figura como escalada y
-- persistencia). Mismas familias que el oraculo. Lista de ajuste A1 aplicada.
CREATE TEMPORARY VIEW evidencia_alertas AS
SELECT dataset, host, t_ms, alert_id, rule_title, rule_level,
       CASE WHEN REGEXP(tecnicas, '(^|,)T(1548|1134|1055|1068)') THEN 1 ELSE 0 END AS m_escalada,
       CASE WHEN REGEXP(tecnicas, '(^|,)T(1087|1033|1082|1016|1069|1018|1057|1083|1049|1007|1012|1135|1201|1615)') THEN 1 ELSE 0 END AS m_descubrimiento,
       CASE WHEN REGEXP(tecnicas, '(^|,)T(1547|1543|1053|1546|1037|1136)') THEN 1 ELSE 0 END AS m_persistencia
FROM alertas_unicas
WHERE tecnicas IS NOT NULL
  -- A1: IE Autorun escrita por Explorer al iniciar sesion (medido: 28 evidencias,
  -- 4 en cada uno de 7 datasets, siempre en el primer minuto de la captura)
  AND NOT (rule_title = 'Internet Explorer Autorun Keys Modification' AND proceso = 'explorer.exe');

-- Descubrimiento desde PowerShell. POSITION y no LIKE: '_' es comodin en LIKE y
-- aparece en las claves (win32_operatingsystem). Mismas claves que el oraculo.
CREATE TEMPORARY VIEW evidencia_ps AS
SELECT dataset, host, t_ms, id, detalle
FROM (
    SELECT dataset, host, t_ms, id,
           CONCAT_WS(',',
               CASE WHEN POSITION('get-process'           IN c) > 0 THEN 'get-process' END,
               CASE WHEN POSITION('win32_operatingsystem' IN c) > 0 THEN 'win32_operatingsystem' END,
               CASE WHEN POSITION('win32_computersystem'  IN c) > 0 THEN 'win32_computersystem' END,
               CASE WHEN POSITION('win32_process'         IN c) > 0 THEN 'win32_process' END,
               CASE WHEN POSITION('$env:username'         IN c) > 0 THEN '$env:username' END,
               CASE WHEN POSITION('$env:computername'     IN c) > 0 THEN '$env:computername' END,
               CASE WHEN POSITION('whoami'                IN c) > 0 THEN 'whoami' END,
               CASE WHEN POSITION('get-localuser'         IN c) > 0 THEN 'get-localuser' END,
               CASE WHEN POSITION('get-localgroup'        IN c) > 0 THEN 'get-localgroup' END,
               CASE WHEN POSITION('get-netipaddress'      IN c) > 0 THEN 'get-netipaddress' END,
               CASE WHEN POSITION('get-netadapter'        IN c) > 0 THEN 'get-netadapter' END,
               CASE WHEN POSITION('get-aduser'            IN c) > 0 THEN 'get-aduser' END,
               CASE WHEN POSITION('get-adcomputer'        IN c) > 0 THEN 'get-adcomputer' END,
               CASE WHEN POSITION('get-addomain'          IN c) > 0 THEN 'get-addomain' END,
               CASE WHEN POSITION('get-netuser'           IN c) > 0 THEN 'get-netuser' END,
               CASE WHEN POSITION('get-netcomputer'       IN c) > 0 THEN 'get-netcomputer' END,
               CASE WHEN POSITION('get-netdomain'         IN c) > 0 THEN 'get-netdomain' END,
               CASE WHEN POSITION('get-hotfix'            IN c) > 0 THEN 'get-hotfix' END,
               CASE WHEN POSITION('systeminfo'            IN c) > 0 THEN 'systeminfo' END,
               CASE WHEN POSITION('net user'              IN c) > 0 THEN 'net user' END,
               CASE WHEN POSITION('net group'             IN c) > 0 THEN 'net group' END,
               CASE WHEN POSITION('net localgroup'        IN c) > 0 THEN 'net localgroup' END,
               CASE WHEN POSITION('nltest'                IN c) > 0 THEN 'nltest' END
           ) AS detalle
    FROM (
        SELECT tfg.dataset_id AS dataset, device.hostname AS host, `time` AS t_ms,
               CONCAT(device.hostname, '|', tfg.source_channel, '|', CAST(tfg.record_number AS STRING)) AS id,
               LOWER(script.script_content) AS c
        FROM norm_events
        WHERE class_uid = 1009 AND script.script_content IS NOT NULL
    )
)
WHERE CHAR_LENGTH(COALESCE(detalle, '')) > 0;

-- =============================================================================
-- PATRON Y CAMPANAS, sobre det.p3_flujo (escrito por p3_01_flujo.sql)
-- =============================================================================

-- NIVEL 1 · transicion entre dos evidencias consecutivas del mismo host, a
-- <= 10 min, siendo AL MENOS UNA de escalada (el ancla), como P1 con las
-- credenciales. Bidireccional: el orden se mide, no se exige. Las parejas
-- escalada-escalada tambien son transicion (asi la campana cubre todas las
-- escaladas encadenadas); la exigencia de otra etapa va en el nivel 2.
CREATE TEMPORARY VIEW transiciones_p3 AS
SELECT *
FROM (
    SELECT dataset, host, ts, `time` AS t_ms, etapa
    FROM p3_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, host
    ORDER BY ts
    MEASURES
        X.t_ms AS t_ini_ms,
        Y.t_ms AS t_fin_ms,
        CASE WHEN X.etapa <> 'escalada' OR Y.etapa <> 'escalada' THEN 1 ELSE 0 END AS con_otra
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (X Y)
    DEFINE
        Y AS (X.etapa = 'escalada' OR Y.etapa = 'escalada')
         AND TIMESTAMPDIFF(SECOND, X.ts, Y.ts) <= 600
) AS t;

-- NIVEL 2 · transiciones del mismo host separadas <= 10 min forman una campana
CREATE TEMPORARY VIEW transiciones_campana_p3 AS
SELECT *,
       SUM(abre) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana
FROM (
    SELECT *,
           CASE WHEN LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms) IS NULL
                  OR (t_ini_ms - LAG(t_fin_ms) OVER (PARTITION BY dataset, host ORDER BY t_ini_ms)) > 600000
                THEN 1 ELSE 0 END AS abre
    FROM transiciones_p3
);

-- La campana exige al menos una transicion que no sea escalada-escalada: el ancla
-- con descubrimiento o persistencia (el HAVING del oraculo).
CREATE TEMPORARY VIEW campanas_base_p3 AS
SELECT dataset, host, campana,
       MIN(t_ini_ms) AS inicio,
       MAX(t_fin_ms) AS fin,
       COUNT(*)      AS transiciones,
       SUM(con_otra) AS transiciones_con_otra
FROM transiciones_campana_p3
GROUP BY dataset, host, campana
HAVING SUM(con_otra) >= 1;

-- La evidencia de cada campana, una vez por (evidencia, etapa)
CREATE TEMPORARY VIEW evidencia_p3 AS
SELECT c.dataset, c.host, c.campana, f.id, f.`time` AS t_ms, f.etapa, f.fuente, f.detalle, f.nivel
FROM campanas_base_p3 AS c
JOIN p3_flujo AS f
  ON f.dataset = c.dataset AND f.host = c.host
WHERE f.`time` BETWEEN c.inicio AND c.fin;

CREATE TEMPORARY VIEW campanas_p3 AS
SELECT
    LOWER(MD5(CONCAT(c.dataset, '|P3|', c.host, '|', CAST(c.inicio AS STRING)))) AS campaign_id,
    c.dataset, c.host, c.campana, c.inicio, c.fin, c.transiciones,
    e.ev_escalada, e.ev_descubrimiento_alerta, e.ev_descubrimiento_ps, e.ev_persistencia,
    e.primera_escalada, e.primer_descubrimiento, e.primera_persistencia,
    -- Confianza descompuesta (mismos pesos que el oraculo): escalada 0,40 +
    -- descubrimiento 0,25 + persistencia 0,25 + 0,10 si Sigma confirma el descubrimiento
    LEAST(1.0, 0.40
        + CASE WHEN e.ev_descubrimiento_alerta + e.ev_descubrimiento_ps > 0 THEN 0.25 ELSE 0.0 END
        + CASE WHEN e.ev_persistencia > 0 THEN 0.25 ELSE 0.0 END
        + CASE WHEN e.ev_descubrimiento_alerta > 0 THEN 0.10 ELSE 0.0 END) AS confianza
FROM campanas_base_p3 AS c
JOIN (
    SELECT dataset, host, campana,
           SUM(CASE WHEN etapa = 'escalada' THEN 1 ELSE 0 END)                                AS ev_escalada,
           SUM(CASE WHEN etapa = 'descubrimiento' AND fuente = 'alerta' THEN 1 ELSE 0 END)    AS ev_descubrimiento_alerta,
           SUM(CASE WHEN etapa = 'descubrimiento' AND fuente = 'evento_ps' THEN 1 ELSE 0 END) AS ev_descubrimiento_ps,
           SUM(CASE WHEN etapa = 'persistencia' THEN 1 ELSE 0 END)                            AS ev_persistencia,
           MIN(CASE WHEN etapa = 'escalada' THEN t_ms END)                                    AS primera_escalada,
           MIN(CASE WHEN etapa = 'descubrimiento' THEN t_ms END)                              AS primer_descubrimiento,
           MIN(CASE WHEN etapa = 'persistencia' THEN t_ms END)                                AS primera_persistencia
    FROM evidencia_p3
    GROUP BY dataset, host, campana
) AS e
  ON e.dataset = c.dataset AND e.host = c.host AND e.campana = c.campana;
