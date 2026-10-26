-- =============================================================================
-- P2 · paso 1 — Mapa IP -> host, controlador de dominio y aristas, en Flink
-- =============================================================================
-- Reproduce los pasos 1 a 3 del oraculo (detection/patterns/p2_lateral_movement.sql)
-- ANTES del patron: si las aristas no salen iguales, no tiene sentido seguir.
--
-- Todo se deriva de los propios datos, sin configuracion externa:
--   * Mapa IP -> host: SOLO conexiones salientes (si yo inicie la conexion, la IP
--     de origen es la mia, por construccion). Ver el oraculo para por que la cara
--     entrante no es fiable (NEWYORK aportaba 70 votos espurios).
--   * Controlador de dominio: el host que recibe LDAP/Kerberos de 2+ hosts.
--   * Arista: conexion saliente en puerto de movimiento lateral hacia otro host
--     del mapa que no sea el controlador, confirmada si el destino registra la
--     misma conexion entrante (misma IP:puerto, <= 5 s).
--
-- En produccion el mapa IP -> host saldria de un inventario (CMDB, DHCP); aqui se
-- calcula en el propio job, en modo batch, para que el resultado sea comparable
-- al milisegundo con el oraculo (decision del 25-10-2026).
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh -f /opt/jobs/p2_01_aristas.sql
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';

CREATE TABLE norm_events (
    class_uid        INT,
    `time`           BIGINT,
    device           ROW<hostname STRING>,
    src_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    dst_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    connection_info  ROW<protocol_name STRING, direction_id INT>,
    actor            ROW<`user` ROW<name STRING>, process ROW<name STRING, pid INT>>,
    tfg              ROW<dataset_id STRING, source_channel STRING, source_event_id INT,
                         record_number BIGINT, time_source STRING>,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'norm.events',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p2-aristas',
    'format' = 'json',
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- -----------------------------------------------------------------------------
-- Conexiones de red (Sysmon EID 3), con las IP normalizadas
-- -----------------------------------------------------------------------------
-- El prefijo v4-mapped (::ffff:10.0.1.4) se quita para comparar IPv4 en texto.
-- `es_maquina`: la IP identifica a una maquina de la red (no loopback,
-- link-local ni multicast). Mismos descartes que el oraculo.
CREATE TEMPORARY VIEW red AS
SELECT
    tfg.dataset_id                                       AS dataset,
    device.hostname                                      AS host,
    ts,
    connection_info.direction_id                         AS sentido,
    REGEXP_REPLACE(src_endpoint.ip, '^::ffff:', '')      AS ip_origen,
    REGEXP_REPLACE(dst_endpoint.ip, '^::ffff:', '')      AS ip_destino,
    dst_endpoint.port                                    AS puerto,
    actor.process.name                                   AS proceso,
    -- identidad del evento en su origen (host + numero de registro)
    CONCAT(device.hostname, '|', CAST(tfg.record_number AS STRING)) AS uid
FROM norm_events
WHERE class_uid = 4001 AND tfg.source_event_id = 3;

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
-- Flink no tiene argMax: Top-1 con ROW_NUMBER, que en batch es una ordenacion.
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
-- `hacia_dc` se conserva como columna (en vez de filtrar ya) para poder comprobar
-- las dos cifras del oraculo: 39 aristas con el DC y 17 sin el.
CREATE TEMPORARY VIEW salientes_lateral AS
SELECT r.dataset, r.host AS origen, m.host AS destino, r.ts, r.puerto, r.proceso,
       r.ip_origen, r.ip_destino, r.uid,
       CASE WHEN dc.host IS NULL THEN 0 ELSE 1 END AS hacia_dc
FROM red AS r
JOIN mapa_ip_host AS m ON m.dataset = r.dataset AND m.ip = r.ip_destino
LEFT JOIN controladores AS dc ON dc.dataset = r.dataset AND dc.host = m.host
WHERE r.sentido = 2
  -- 135 RPC/DCOM · 139/445 SMB · 3389 RDP · 5900 VNC · 5985/5986 WinRM · 22 SSH
  AND r.puerto IN (135, 139, 445, 3389, 5900, 5985, 5986, 22)
  AND m.host <> r.host;

-- Confirmacion bilateral: el destino registra la misma conexion como entrante.
CREATE TEMPORARY VIEW aristas AS
SELECT s.dataset, s.origen, s.destino, s.ts, s.puerto, s.proceso, s.uid, s.hacia_dc,
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
GROUP BY s.dataset, s.origen, s.destino, s.ts, s.puerto, s.proceso, s.uid, s.hacia_dc;

-- =============================================================================
-- COMPROBACIONES (contra el oraculo)
-- =============================================================================

-- C1. Mapa de apt29 day1. Oraculo (09-09): SCRANTON 10.0.1.4 (126 votos),
--     NASHUA 10.0.1.6 (408), NEWYORK 10.0.0.4 (80), UTICA 10.0.1.5 (16).
SELECT ip, host, votos
FROM mapa_ip_host
WHERE dataset = 'SDWIN-200501225525'
ORDER BY ip;

-- C2. Controladores de dominio por dataset. Oraculo: NEWYORK en apt29 day1.
SELECT dataset, host FROM controladores ORDER BY dataset;

-- C3. Aristas por par y puerto, con y sin el controlador.
--     Oraculo en apt29 day1: 39 aristas con el DC; 17 sin el, todas
--     SCRANTON -> NASHUA (5985 x4, 445 x8, 135 x5).
SELECT dataset, origen, destino, puerto, hacia_dc,
       COUNT(*) AS aristas, SUM(confirmada) AS confirmadas
FROM aristas
GROUP BY dataset, origen, destino, puerto, hacia_dc
ORDER BY dataset, hacia_dc, origen, destino, puerto;
