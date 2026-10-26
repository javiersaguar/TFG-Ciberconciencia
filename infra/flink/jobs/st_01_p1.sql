-- =============================================================================
-- Streaming · P1 — el patron en modo STREAMING, frente al mismo en batch
-- =============================================================================
-- Revalidacion pendiente desde el 31-07: hasta ahora P1 se ha ejecutado en modo
-- batch sobre una fuente acotada, que lo lee todo y luego ordena. En streaming el
-- tiempo lo marca la marca de agua (WATERMARK ts - 30 s): MATCH_RECOGNIZE emite
-- cuando la marca de agua pasa, los registros tardios se DESCARTAN y el segundo
-- nivel no puede "ver todo el corpus de golpe".
--
-- Prerrequisito: det.p1_flujo publicado EN ORDEN DE TIEMPO (p1_06_flujo.sql desde
-- el 26-10; comprobar con st_00_desorden.sql que no queda ningun tardio).
--
-- NIVEL 2 EN STREAMING = VENTANA DE SESION. La agrupacion por hueco de batch
-- (LAG + SUM OVER sobre todo el corpus) tiene un equivalente nativo en streaming:
-- SESSION(..., INTERVAL '10' MINUTES), que cierra la campana cuando pasan 10 min
-- sin transiciones y la emite una sola vez. Su tiempo es MATCH_ROWTIME(): la hora
-- de la ULTIMA fila de cada transicion. Matiz: batch mide el hueco desde el
-- INICIO de la transicion siguiente; la sesion, desde su FIN. Solo podria
-- separar dos campanas que batch une si entre ellas hubiera evidencia suelta; se
-- comprueba aqui con el corpus.
--
-- VALIDADO el 26-10-2026: las 11 campanas salen IDENTICAS en streaming y en batch
-- (mismos inicio, fin y transiciones; 52 en total). Ninguna evidencia descartada
-- por tardia, con el flujo publicado en orden de tiempo.
-- Observado: la ventana de sesion NO emite la campana una sola vez al cerrarse,
-- sino que la ACTUALIZA (-U/+U) con cada transicion nueva. Para detectar es
-- mejor (la campana existe desde la primera transicion), pero el destino de una
-- emision en streaming tendra que admitir actualizaciones (upsert por campana).
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p1_comun.sql -f /opt/jobs/st_01_p1.sql
-- =============================================================================

-- El nivel 1 con su hora de evento como atributo de tiempo (MATCH_ROWTIME), para
-- poder encadenar una ventana. Mismo patron que transiciones_p1 (p1_comun.sql).
CREATE TEMPORARY VIEW transiciones_p1_rt AS
SELECT *
FROM (
    SELECT dataset, host, CONCAT(dataset, '|', host) AS clave, ts, `time` AS t_ms, cred
    FROM p1_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, host, clave
    ORDER BY ts
    MEASURES
        E.t_ms           AS t_ini_ms,
        C.t_ms           AS t_fin_ms,
        MATCH_ROWTIME()  AS rt
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (E C)
    DEFINE
        C AS (C.cred = 1 OR E.cred = 1)
         AND TIMESTAMPDIFF(SECOND, E.ts, C.ts) <= 600
) AS t;

-- -----------------------------------------------------------------------------
-- S1. STREAMING: campanas por ventana de sesion de 10 min
-- -----------------------------------------------------------------------------
SET 'execution.runtime-mode' = 'streaming';

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(MIN(t_ini_ms), 3) AS inicio,
       TO_TIMESTAMP_LTZ(MAX(t_fin_ms), 3) AS fin,
       COUNT(*)                           AS transiciones
FROM TABLE(SESSION(TABLE transiciones_p1_rt PARTITION BY clave, DESCRIPTOR(rt), INTERVAL '10' MINUTES))
GROUP BY clave, dataset, host, window_start, window_end;

-- -----------------------------------------------------------------------------
-- B1. BATCH, lo validado (campanas_base_p1): debe salir lo mismo, fila a fila.
--     Esperado: 11 campanas, 52 transiciones en total.
-- -----------------------------------------------------------------------------
SET 'execution.runtime-mode' = 'batch';

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(inicio, 3) AS inicio,
       TO_TIMESTAMP_LTZ(fin, 3)    AS fin,
       transiciones
FROM campanas_base_p1
ORDER BY dataset, inicio;
