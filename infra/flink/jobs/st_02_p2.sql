-- =============================================================================
-- Streaming · P2 — el patron en modo STREAMING, frente al mismo en batch
-- =============================================================================
-- Mismo objetivo que st_01_p1.sql, para P2. Prerrequisito: det.p2_flujo publicado
-- EN ORDEN DE TIEMPO (p2_02_flujo.sql desde el 26-10).
--
-- En streaming, el segundo nivel de P2 son DOS ventanas de sesion de 5 min (300 s;
-- Flink no admite INTERVAL '300' SECONDS: el campo de segundos es de 2 cifras):
--   * sobre las ARISTAS de cada par origen -> destino: la campana (mismo criterio
--     que batch: aristas del mismo par separadas <= 300 s);
--   * sobre las TRANSICIONES del nivel 1 en cada destino: la puerta (una campana
--     exige al menos una transicion).
-- Se cruzan por solape de intervalos.
--
-- VALIDADO el 26-10-2026: 13 transiciones y la campana SCRANTON -> NASHUA
-- (03:09:23.801 -> 03:17:59.493, 17 aristas, 13 transiciones), igual que en batch.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/st_02_p2.sql
-- =============================================================================

-- Nivel 1 con atributo de tiempo (MATCH_ROWTIME). Mismo patron que `transiciones`.
CREATE TEMPORARY VIEW transiciones_p2_rt AS
SELECT *
FROM (
    SELECT dataset, destino, CONCAT(dataset, '|', destino) AS clave, ts, `time` AS t_ms, tipo, origen
    FROM p2_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, destino, clave
    ORDER BY ts
    MEASURES
        CASE WHEN X.tipo = 'arista' THEN X.origen ELSE Y.origen END AS origen,
        CASE WHEN X.tipo = 'arista' THEN X.t_ms   ELSE Y.t_ms   END AS arista_ms,
        MATCH_ROWTIME()                                             AS rt
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (X Y)
    DEFINE
        Y AS ((X.tipo = 'arista' AND Y.tipo = 'evidencia')
           OR (X.tipo = 'evidencia' AND Y.tipo = 'arista'))
         AND Y.t_ms - X.t_ms <= 300000
) AS m;

-- -----------------------------------------------------------------------------
-- S1. STREAMING: transiciones del nivel 1 (esperado: 13, todas SCRANTON -> NASHUA)
-- -----------------------------------------------------------------------------
SET 'execution.runtime-mode' = 'streaming';

SELECT destino, origen, TO_TIMESTAMP_LTZ(arista_ms, 3) AS arista, rt
FROM transiciones_p2_rt
WHERE dataset = 'SDWIN-200501225525';

-- -----------------------------------------------------------------------------
-- S2. STREAMING: campanas (sesion de aristas) con su puerta (sesion de
--     transiciones). Esperado: 1 campana, 17 aristas, 03:09:23.801 -> 03:17:59.493
--     en aristas, 13 transiciones.
-- -----------------------------------------------------------------------------
-- Dos rarezas de Flink 2.2 encontradas aqui (26-10), y como se esquivan:
--   1. Una ventana de sesion sobre una VISTA de una tabla cuyo tiempo es una
--      columna calculada (`ts AS TO_TIMESTAMP_LTZ(...)`) rompe con "Conversion to
--      relational algebra failed to preserve datatypes" (la vista guarda `ts` como
--      TIMESTAMP_LTZ normal y se espera *ROWTIME*). -> La ventana va sobre la TABLA.
--   2. Una VISTA que contiene una ventana de sesion con PARTITION BY de VARIAS
--      columnas se crea, DESCRIBE la ensena bien, pero al consultarla falla con
--      "Column 'tipo' not found in any table": Flink no sabe re-expandir su texto.
--      -> Las ventanas van como SUBCONSULTAS de una sola sentencia, no como vistas.
--   Sobre la salida de MATCH_RECOGNIZE (transiciones) no hay problema.
-- `tipo` va en la particion para que aristas y evidencias no compartan sesion.
-- Cada campana se va ACTUALIZANDO (-U/+U) al llegar aristas y transiciones: la
-- version que vale es la ultima.
SELECT a.dataset, a.origen, a.destino,
       TO_TIMESTAMP_LTZ(a.a_ini, 3) AS primera_arista,
       TO_TIMESTAMP_LTZ(a.a_fin, 3) AS ultima_arista,
       a.n_aristas, t.transiciones
FROM (
    SELECT dataset, origen, destino,
           MIN(`time`) AS a_ini, MAX(`time`) AS a_fin, COUNT(*) AS n_aristas
    FROM TABLE(SESSION(TABLE p2_flujo PARTITION BY (dataset, tipo, origen, destino),
                       DESCRIPTOR(ts), INTERVAL '5' MINUTE))
    WHERE tipo = 'arista'
    GROUP BY dataset, tipo, origen, destino, window_start, window_end
) AS a
JOIN (
    SELECT dataset, destino, origen,
           MIN(arista_ms) AS t_ini, MAX(arista_ms) AS t_fin, COUNT(*) AS transiciones
    FROM TABLE(SESSION(TABLE transiciones_p2_rt PARTITION BY clave, DESCRIPTOR(rt), INTERVAL '5' MINUTE))
    GROUP BY clave, dataset, destino, origen, window_start, window_end
) AS t
  ON t.dataset = a.dataset AND t.destino = a.destino AND t.origen = a.origen
 AND t.t_ini <= a.a_fin AND t.t_fin >= a.a_ini;

-- -----------------------------------------------------------------------------
-- B1. BATCH, lo validado (campanas_p2): debe salir lo mismo.
-- -----------------------------------------------------------------------------
SET 'execution.runtime-mode' = 'batch';

SELECT dataset, origen, destino,
       TO_TIMESTAMP_LTZ(inicio, 3) AS primera_arista,
       n_aristas, transiciones
FROM campanas_p2;
