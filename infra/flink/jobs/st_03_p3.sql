-- =============================================================================
-- Streaming · P3 — el patron en modo STREAMING, frente al mismo en batch
-- =============================================================================
-- Mismo metodo que st_01_p1.sql: nivel 1 con MATCH_ROWTIME() y nivel 2 con una
-- ventana de sesion de 10 min, escrita como subconsulta (no vista: ver las rarezas
-- de Flink 2.2 en st_02_p2.sql). Prerrequisito: det.p3_flujo EN ORDEN DE TIEMPO
-- (p3_01_flujo.sql).
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p3_comun.sql -f /opt/jobs/st_03_p3.sql
-- =============================================================================

CREATE TEMPORARY VIEW transiciones_p3_rt AS
SELECT *
FROM (
    SELECT dataset, host, CONCAT(dataset, '|', host) AS clave, ts, `time` AS t_ms, etapa
    FROM p3_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, host, clave
    ORDER BY ts
    MEASURES
        X.t_ms AS t_ini_ms,
        Y.t_ms AS t_fin_ms,
        CASE WHEN X.etapa <> 'escalada' OR Y.etapa <> 'escalada' THEN 1 ELSE 0 END AS con_otra,
        MATCH_ROWTIME() AS rt
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (X Y)
    DEFINE
        Y AS (X.etapa = 'escalada' OR Y.etapa = 'escalada')
         AND TIMESTAMPDIFF(SECOND, X.ts, Y.ts) <= 600
) AS t;

-- S1. STREAMING: campanas por ventana de sesion; cada una se ACTUALIZA (-U/+U)
--     al llegar transiciones, y vale su ultima version. Solo las que tienen otra
--     etapa ademas de la escalada (la puerta del nivel 2).
SET 'execution.runtime-mode' = 'streaming';

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(MIN(t_ini_ms), 3) AS inicio,
       TO_TIMESTAMP_LTZ(MAX(t_fin_ms), 3) AS fin,
       COUNT(*)                           AS transiciones,
       SUM(con_otra)                      AS con_otra
FROM TABLE(SESSION(TABLE transiciones_p3_rt PARTITION BY clave, DESCRIPTOR(rt), INTERVAL '10' MINUTE))
GROUP BY clave, dataset, host, window_start, window_end
HAVING SUM(con_otra) >= 1;

-- B1. BATCH, lo validado (campanas_p3): debe salir lo mismo.
SET 'execution.runtime-mode' = 'batch';

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(inicio, 3) AS inicio,
       TO_TIMESTAMP_LTZ(fin, 3)    AS fin,
       transiciones
FROM campanas_p3
ORDER BY dataset, inicio;
