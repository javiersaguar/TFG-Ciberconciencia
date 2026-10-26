-- =============================================================================
-- Streaming · paso 0 — ¿Llegan los eventos en orden de tiempo de evento?
-- =============================================================================
-- Antes de revalidar P1 y P2 en modo STREAMING hay que medir esto: en streaming,
-- un registro cuya hora es anterior a la marca de agua de su particion (lo maximo
-- visto - 30 s) es TARDIO, y MATCH_RECOGNIZE y las ventanas lo DESCARTAN sin
-- avisar. En batch no importaba: se lee todo y se ordena.
--
-- Los topics de los flujos (det.p1_flujo, det.p2_flujo) los escribieron trabajos
-- en batch, en el orden en que salieron las filas, y en cada particion conviven
-- datasets de 2020 (apt29) y de 2023 (LSASS): un evento de 2020 detras de uno de
-- 2023 llegaria "tarde" por anos. Si no se mide antes, una campana perdida en
-- streaming no se podria atribuir ni al patron ni al orden de llegada.
--
-- Mide, por topic y particion, en el orden en que se leen (offset):
--   desordenados  hora anterior al maximo ya visto en la particion
--   tardios_30s   ... por mas de 30 s: los que la marca de agua (WATERMARK ts - 30 s)
--                 dejaria fuera
--   retraso_max   el peor caso, en segundos
-- Aproximado por arriba: la marca de agua real se emite cada 200 ms y no tras
-- cada registro, asi que es algo mas permisiva que este calculo.
--
-- Solo lee (modo batch). Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh -f /opt/jobs/st_00_desorden.sql
-- =============================================================================
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';
SET 'parallelism.default' = '1';

-- Cada topic con lo minimo: la hora, el dataset y la posicion (particion, offset)
CREATE TABLE md_alertas (
    `time` BIGINT,
    tfg    ROW<dataset_id STRING>,
    part   INT    METADATA FROM 'partition' VIRTUAL,
    off    BIGINT METADATA FROM 'offset' VIRTUAL
) WITH (
    'connector' = 'kafka', 'topic' = 'det.alerts',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-st-desorden',
    'format' = 'json', 'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset', 'scan.bounded.mode' = 'latest-offset'
);

CREATE TABLE md_p1 (
    dataset STRING,
    `time`  BIGINT,
    part    INT    METADATA FROM 'partition' VIRTUAL,
    off     BIGINT METADATA FROM 'offset' VIRTUAL
) WITH (
    'connector' = 'kafka', 'topic' = 'det.p1_flujo',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-st-desorden',
    'format' = 'json', 'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset', 'scan.bounded.mode' = 'latest-offset'
);

CREATE TABLE md_p2 (
    dataset STRING,
    `time`  BIGINT,
    part    INT    METADATA FROM 'partition' VIRTUAL,
    off     BIGINT METADATA FROM 'offset' VIRTUAL
) WITH (
    'connector' = 'kafka', 'topic' = 'det.p2_flujo',
    'properties.bootstrap.servers' = 'redpanda:29092',
    'properties.group.id' = 'flink-st-desorden',
    'format' = 'json', 'json.ignore-parse-errors' = 'false',
    'scan.startup.mode' = 'earliest-offset', 'scan.bounded.mode' = 'latest-offset'
);

CREATE TEMPORARY VIEW lectura AS
SELECT CAST('det.alerts' AS STRING) AS topic, part, off, tfg.dataset_id AS dataset, `time` FROM md_alertas
UNION ALL
SELECT CAST('det.p1_flujo' AS STRING), part, off, dataset, `time` FROM md_p1
UNION ALL
SELECT CAST('det.p2_flujo' AS STRING), part, off, dataset, `time` FROM md_p2;

-- Maximo visto hasta cada registro (incluido): si la hora del registro es menor,
-- ha llegado detras de otro posterior; la diferencia es su retraso.
CREATE TEMPORARY VIEW retrasos AS
SELECT topic, part, off, dataset, `time`,
       MAX(`time`) OVER (PARTITION BY topic, part ORDER BY off
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - `time` AS retraso_ms
FROM lectura;

-- R1. Por topic y particion
SELECT topic, part,
       COUNT(*)                                               AS mensajes,
       SUM(CASE WHEN retraso_ms > 0     THEN 1 ELSE 0 END)    AS desordenados,
       SUM(CASE WHEN retraso_ms > 30000 THEN 1 ELSE 0 END)    AS tardios_30s,
       MAX(retraso_ms) / 1000                                 AS retraso_max_s
FROM retrasos
GROUP BY topic, part
ORDER BY topic, part;

-- R2. Los tardios, por dataset: que se perderia y de donde
SELECT topic, dataset,
       COUNT(*)                                               AS mensajes,
       SUM(CASE WHEN retraso_ms > 30000 THEN 1 ELSE 0 END)    AS tardios_30s
FROM retrasos
GROUP BY topic, dataset
ORDER BY topic, dataset;

-- R3. El desorden REAL, como si cada dataset llegara solo (anadido el 26-10).
--     R1 mezcla dos fenomenos: (a) datasets de anos distintos en la misma
--     particion (retrasos de ANOS: artefacto de reproducir capturas historicas a
--     la vez, que en produccion no existe) y (b) el desorden dentro de un mismo
--     dataset, que viene de los detectores en paralelo y SI existiria en
--     produccion. Esto mide solo (b): el maximo se calcula por particion Y dataset.
--     Las columnas por umbral dicen que margen de marca de agua haria falta.
CREATE TEMPORARY VIEW retrasos_dataset AS
SELECT topic, part, dataset,
       MAX(`time`) OVER (PARTITION BY topic, part, dataset ORDER BY off
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - `time` AS retraso_ms
FROM lectura;

SELECT topic, dataset,
       COUNT(*)                                                  AS mensajes,
       SUM(CASE WHEN retraso_ms > 0      THEN 1 ELSE 0 END)      AS desordenados,
       SUM(CASE WHEN retraso_ms > 30000  THEN 1 ELSE 0 END)      AS mas_30s,
       SUM(CASE WHEN retraso_ms > 120000 THEN 1 ELSE 0 END)      AS mas_2min,
       SUM(CASE WHEN retraso_ms > 300000 THEN 1 ELSE 0 END)      AS mas_5min,
       MAX(retraso_ms)                                           AS retraso_max_ms
FROM retrasos_dataset
GROUP BY topic, dataset
ORDER BY topic, dataset;
