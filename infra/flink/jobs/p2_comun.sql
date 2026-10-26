-- =============================================================================
-- P2 · definiciones comunes (fichero de INICIO del cliente SQL, opcion -i)
-- =============================================================================
-- Tablas y vistas que comparten los pasos de P2, para no copiarlas en cada
-- fichero (y que una correccion, como la del loopback del 26-10, llegue a todos):
--
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/p2_0X_....sql
--
-- Contenido:
--   * norm_events  -> conexiones de red (Sysmon EID 3): las ARISTAS.
--   * det_alerts   -> alertas Sigma: la EVIDENCIA de ejecucion en el destino.
--   * p2_flujo     -> topic det.p2_flujo: aristas + evidencia por host de destino,
--                     ya deduplicadas. Lo escribe p2_02 y lo lee el patron (p2_03).
--   * vistas: red, mapa_ip_host, controladores, aristas, alertas_unicas, evidencias.
--
-- Oraculo: detection/patterns/p2_lateral_movement.sql (vista tfg.p2_campanas).
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';
-- Que cada INSERT termine antes de seguir con la siguiente sentencia del fichero
SET 'table.dml-sync' = 'true';

-- -----------------------------------------------------------------------------
-- Fuentes
-- -----------------------------------------------------------------------------
-- Solo los campos que P2 usa. Los eventos de otras clases no traen src_endpoint
-- ni connection_info: quedan a NULL y los filtra cada vista.
CREATE TABLE norm_events (
    class_uid        INT,
    `time`           BIGINT,
    device           ROW<hostname STRING>,
    src_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    dst_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    -- direction_id: 2 = saliente (Initiated=true), 1 = entrante (sysmon.py)
    connection_info  ROW<protocol_name STRING, direction_id INT>,
    -- `user` es palabra reservada en Flink SQL
    actor            ROW<`user` ROW<name STRING>, process ROW<name STRING, pid INT>>,
    tfg              ROW<dataset_id STRING, source_channel STRING, source_event_id INT,
                         record_number BIGINT, time_source STRING>,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'norm.events',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p2-eventos',
    'format' = 'json',
    -- Sin descartes silenciosos: si un evento no encaja, el job falla y se ve
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Mismo esquema que P1 (p1_00_tabla.sql).
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
    'properties.group.id' = 'flink-p2-alertas',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- -----------------------------------------------------------------------------
-- det.p2_flujo: lo que ve el patron, por host de destino
-- -----------------------------------------------------------------------------
-- POR QUE UN TOPIC INTERMEDIO (26-10-2026): MATCH_RECOGNIZE ordena por un
-- atributo de tiempo, y Flink lo pierde al pasar por agregaciones y joins, que
-- es justo lo que hace falta para construir las aristas (mapa IP -> host, DC,
-- confirmacion bilateral). Publicar el resultado en un topic y releerlo con su
-- WATERMARK devuelve al patron una fuente con tiempo de evento, como la de P1.
-- Es ademas la arquitectura de produccion: un job de enriquecimiento continuo
-- (aristas) y otro de CEP (patron), desacoplados por el bus.
--
-- Clave de particion = host de destino: el patron particiona por el y asi
-- conserva el orden de cada destino.
-- tipo = 'arista' (origen, puerto, proceso, confirmada) | 'evidencia' (regla y
-- etapas). Una misma tabla sirve para escribir (p2_02) y leer (p2_03).
CREATE TABLE p2_flujo (
    dataset     STRING,
    destino     STRING,
    `time`      BIGINT,
    tipo        STRING,
    origen      STRING,
    puerto      INT,
    proceso     STRING,
    confirmada  INT,
    id          STRING,
    regla       STRING,
    remota      INT,
    servicio    INT,
    cred        INT,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'det.p2_flujo',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p2-flujo',
    'key.format' = 'raw',
    'key.fields' = 'destino',
    'value.format' = 'json',
    'value.fields-include' = 'ALL',
    'value.json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- -----------------------------------------------------------------------------
-- Conexiones de red (Sysmon EID 3), con las IP normalizadas
-- -----------------------------------------------------------------------------
-- Las IP se comparan como TEXTO, asi que se normalizan las dos grafias que
-- cambian sin cambiar la direccion:
--   * el prefijo v4-mapped (::ffff:10.0.1.4 -> 10.0.1.4);
--   * el loopback IPv6 SIN ABREVIAR, que es como lo escribe Sysmon
--     ('0:0:0:0:0:0:0:1' -> '::1'). Medido el 26-10: sin esto, el mapa asignaba
--     esa direccion a NEWYORK con 41 votos y fabricaba 2 aristas falsas
--     SCRANTON -> NEWYORK:5985 (WinRM local de SCRANTON), sin confirmar por
--     NEWYORK. El oraculo no lo sufre porque ClickHouse parsea la IP (toIPv6)
--     y las dos grafias son el mismo valor.
CREATE TEMPORARY VIEW red AS
SELECT
    tfg.dataset_id                                       AS dataset,
    device.hostname                                      AS host,
    ts,
    `time`                                               AS t_ms,
    connection_info.direction_id                         AS sentido,
    REGEXP_REPLACE(REGEXP_REPLACE(src_endpoint.ip, '^::ffff:', ''), '^0:0:0:0:0:0:0:1$', '::1') AS ip_origen,
    REGEXP_REPLACE(REGEXP_REPLACE(dst_endpoint.ip, '^::ffff:', ''), '^0:0:0:0:0:0:0:1$', '::1') AS ip_destino,
    dst_endpoint.port                                    AS puerto,
    actor.process.name                                   AS proceso,
    -- identidad del evento en su origen (host + numero de registro)
    CONCAT(device.hostname, '|', CAST(tfg.record_number AS STRING)) AS uid
FROM norm_events
WHERE class_uid = 4001 AND tfg.source_event_id = 3;

-- Salientes cuya IP de origen identifica a una maquina de la red (no loopback,
-- link-local ni multicast). Mismos descartes que el oraculo.
CREATE TEMPORARY VIEW salientes_maquina AS
SELECT *
FROM red
WHERE sentido = 2
  AND ip_origen IS NOT NULL
  AND ip_origen <> '::1'
  AND ip_origen NOT LIKE '127.%'
  AND LOWER(ip_origen) NOT LIKE 'fe80:%'
  AND ip_origen NOT LIKE '169.254.%'
  -- multicast 224.0.0.0/4: primer octeto entre 224 y 239 (TRY_CAST da NULL en IPv6)
  AND COALESCE(TRY_CAST(SPLIT_INDEX(ip_origen, '.', 0) AS INT), 0) NOT BETWEEN 224 AND 239;

-- -----------------------------------------------------------------------------
-- 1) Mapa IP -> host: el host que mas veces sale con esa IP (minimo 3 votos)
-- -----------------------------------------------------------------------------
-- Solo SALIENTES: si yo inicie la conexion, la IP de origen es la mia, por
-- construccion (la cara entrante no es fiable: ver el oraculo). Flink no tiene
-- argMax: Top-1 con ROW_NUMBER. En produccion este mapa saldria de un inventario
-- (CMDB, DHCP); aqui se calcula en el job para comparar al milisegundo.
CREATE TEMPORARY VIEW mapa_ip_host AS
SELECT dataset, ip, host, votos
FROM (
    SELECT dataset, ip, host, votos,
           ROW_NUMBER() OVER (PARTITION BY dataset, ip ORDER BY votos DESC) AS rn
    FROM (
        SELECT dataset, ip_origen AS ip, host, COUNT(*) AS votos
        FROM salientes_maquina
        GROUP BY dataset, ip_origen, host
    )
)
WHERE rn = 1 AND votos >= 3;

-- -----------------------------------------------------------------------------
-- 2) Controlador de dominio: recibe LDAP/Kerberos de dos o mas hosts
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW controladores AS
SELECT r.dataset AS dataset, m.host AS host
FROM red AS r
JOIN mapa_ip_host AS m ON m.dataset = r.dataset AND m.ip = r.ip_destino
WHERE r.sentido = 2
  AND r.puerto IN (88, 389, 636, 3268, 3269)
  AND m.host <> r.host
GROUP BY r.dataset, m.host
HAVING COUNT(DISTINCT r.host) >= 2;

-- -----------------------------------------------------------------------------
-- 3) Aristas: salientes en puerto de movimiento lateral hacia otro host del mapa
-- -----------------------------------------------------------------------------
-- `hacia_dc` se conserva como columna para poder comprobar las dos cifras del
-- oraculo (39 con el DC, 17 sin el). El patron solo usa hacia_dc = 0.
CREATE TEMPORARY VIEW salientes_lateral AS
SELECT r.dataset, r.host AS origen, m.host AS destino, r.ts, r.t_ms, r.puerto, r.proceso,
       r.ip_origen, r.ip_destino, r.uid,
       CASE WHEN dc.host IS NULL THEN 0 ELSE 1 END AS hacia_dc
FROM red AS r
JOIN mapa_ip_host AS m ON m.dataset = r.dataset AND m.ip = r.ip_destino
LEFT JOIN controladores AS dc ON dc.dataset = r.dataset AND dc.host = m.host
WHERE r.sentido = 2
  -- 135 RPC/DCOM · 139/445 SMB · 3389 RDP · 5900 VNC · 5985/5986 WinRM · 22 SSH
  AND r.puerto IN (135, 139, 445, 3389, 5900, 5985, 5986, 22)
  AND m.host <> r.host
  -- el loopback nunca es otra maquina, aunque el mapa lo hubiera resuelto
  AND r.ip_destino IS NOT NULL
  AND r.ip_destino <> '::1'
  AND r.ip_destino NOT LIKE '127.%';

-- Confirmacion bilateral: el destino registra la misma conexion como entrante.
CREATE TEMPORARY VIEW aristas AS
SELECT s.dataset, s.origen, s.destino, s.ts, s.t_ms, s.puerto, s.proceso, s.uid, s.hacia_dc,
       MAX(CASE WHEN e.host IS NOT NULL
                 AND ABS(TIMESTAMPDIFF(SECOND, s.ts, e.ts)) <= 5 THEN 1 ELSE 0 END) AS confirmada
FROM salientes_lateral AS s
LEFT JOIN red AS e
       ON  e.dataset    = s.dataset
       AND e.sentido    = 1
       AND e.host       = s.destino
       AND e.ip_origen  = s.ip_origen
       AND e.ip_destino = s.ip_destino
       AND e.puerto     = s.puerto
GROUP BY s.dataset, s.origen, s.destino, s.ts, s.t_ms, s.puerto, s.proceso, s.uid, s.hacia_dc;

-- -----------------------------------------------------------------------------
-- 4) Evidencia de ejecucion en el destino, deduplicada
-- -----------------------------------------------------------------------------
-- det.alerts trae republicaciones de los cortes de confirmacion de offsets
-- (25-10: 1.201 publicadas para 1.184 distintas). ClickHouse las absorbe con
-- ReplacingMergeTree; aqui hay que quitarlas a mano o una alerta contaria dos
-- veces. alert_id es determinista (sha1 del evento + regla).
CREATE TEMPORARY VIEW alertas_unicas AS
SELECT dataset, host, t_ms, alert_id, rule_title, tecnicas
FROM (
    SELECT tfg.dataset_id                         AS dataset,
           device.hostname                        AS host,
           `time`                                 AS t_ms,
           alert_id,
           rule_title,
           ARRAY_JOIN(attack.technique_ids, ',')  AS tecnicas,
           ROW_NUMBER() OVER (PARTITION BY alert_id ORDER BY detected_at) AS rn
    FROM det_alerts
)
WHERE rn = 1;

-- Etapas del destino por tecnica OBSERVADA en la alerta (mismo criterio que el
-- oraculo): ejecucion remota T1021.*, servicio T1569.002 y credenciales T1003.*
-- (costura con P1). T1570 no se usa: es el mapeo amplio de una regla, no
-- evidencia observada de transferencia.
CREATE TEMPORARY VIEW evidencias AS
SELECT dataset, host, t_ms, alert_id, rule_title,
       CASE WHEN tecnicas LIKE '%T1021%'     THEN 1 ELSE 0 END AS remota,
       CASE WHEN tecnicas LIKE '%T1569.002%' THEN 1 ELSE 0 END AS servicio,
       CASE WHEN tecnicas LIKE '%T1003%'     THEN 1 ELSE 0 END AS cred
FROM alertas_unicas
WHERE tecnicas LIKE '%T1021%' OR tecnicas LIKE '%T1569.002%' OR tecnicas LIKE '%T1003%';
