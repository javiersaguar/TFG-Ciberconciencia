-- =============================================================================
-- P2 · paso 0 — Tabla Flink sobre norm.events (conexiones de red) y comprobacion
-- =============================================================================
-- Mismo criterio que p1_00_tabla.sql: validar UNICAMENTE que Flink lee bien el
-- topic antes de escribir el patron, para no depurar a la vez el esquema y la
-- semantica del CEP.
--
-- Por que P2 necesita norm.events y P1 no: la arista del movimiento lateral es
-- una conexion de red (Sysmon EID 3, clase OCSF 4001) y las conexiones NO
-- generan alerta. Si P2 leyera solo det.alerts, la arista no existiria. La
-- evidencia de ejecucion en el destino si sale de det.alerts (paso siguiente).
--
-- Oraculo: detection/patterns/p2_lateral_movement.sql (vista tfg.p2_campanas).
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh -f /opt/jobs/p2_00_tabla.sql
-- =============================================================================

-- Modo batch sobre la fuente Kafka acotada (scan.bounded.mode = latest-offset):
-- el truco validado con P1 el 31-07. Salida final en vez de changelog y sin el
-- problema del watermark que no avanza sobre datos historicos.
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';

-- Solo se declaran los campos que P2 usa. Los eventos de otras clases (procesos,
-- ficheros, registro...) no traen src_endpoint ni connection_info: Flink los
-- deja a NULL, y el WHERE de cada consulta se queda con las conexiones.
CREATE TABLE norm_events (
    class_uid        INT,
    -- epoch en milisegundos UTC: la hora del EVENTO (corregida el 11-09), no la
    -- de recogida. Resolucion de ms en Sysmon; de segundo en Security/PowerShell
    -- reconstruidas (tfg.time_source lo dice).
    `time`           BIGINT,
    device           ROW<hostname STRING>,
    src_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    dst_endpoint     ROW<ip STRING, port INT, hostname STRING>,
    -- direction_id: 2 = saliente (Initiated=true), 1 = entrante (sysmon.py)
    connection_info  ROW<protocol_name STRING, direction_id INT>,
    -- `user` es palabra reservada en Flink SQL: va entre comillas invertidas
    actor            ROW<`user` ROW<name STRING>, process ROW<name STRING, pid INT>>,
    tfg              ROW<dataset_id STRING, source_channel STRING, source_event_id INT,
                         record_number BIGINT, time_source STRING>,
    ts AS TO_TIMESTAMP_LTZ(`time`, 3),
    WATERMARK FOR ts AS ts - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'norm.events',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-p2-tabla',
    'format' = 'json',
    -- Sin descartes silenciosos: si un evento no encaja en el esquema, el job
    -- falla y se ve, en vez de saltarselo.
    'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset',
    'scan.bounded.mode' = 'latest-offset'
);

-- Comprobacion 1: conexiones de red por dataset y sentido.
-- Debe coincidir con la consulta equivalente en ClickHouse (tfg.events FINAL).
SELECT tfg.dataset_id                  AS dataset,
       connection_info.direction_id    AS sentido,
       COUNT(*)                        AS conexiones
FROM norm_events
WHERE class_uid = 4001 AND tfg.source_event_id = 3
GROUP BY tfg.dataset_id, connection_info.direction_id;

-- Comprobacion 2: las aristas del salto que P2 tiene que encontrar.
-- Debe dar 17 filas: SCRANTON -> NASHUA (10.0.1.6), 5985 x4, 445 x8, 135 x5,
-- las mismas horas que la medicion del 25-10 en ClickHouse. La IP va escrita a
-- mano SOLO en esta comprobacion: en el patron saldra del mapa IP -> host
-- derivado de los propios datos, como en el oraculo.
SELECT ts, device.hostname AS origen, dst_endpoint.port AS puerto,
       actor.process.name AS proceso
FROM norm_events
WHERE class_uid = 4001
  AND tfg.source_event_id = 3
  AND tfg.dataset_id = 'SDWIN-200501225525'
  AND connection_info.direction_id = 2
  AND device.hostname LIKE 'SCRANTON%'
  AND dst_endpoint.ip = '10.0.1.6'
  AND dst_endpoint.port IN (135, 445, 5985)
ORDER BY ts;
