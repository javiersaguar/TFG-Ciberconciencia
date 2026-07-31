-- =============================================================================
-- P1 — Metricas de evaluacion
-- =============================================================================
-- Requiere la vista tfg.p1_campanas (detection/patterns/p1_credential_theft.sql).
--
-- Ojo al comparar con la linea base de F2 (741 -> 87, 88,3 % con agrupacion
-- ingenua por regla+host+ventana): aquella agrupaba TODAS las alertas del
-- corpus, mientras que P1 solo agrupa alrededor de anclas de credenciales. La
-- cifra comparable saldra cuando P1-P4 esten los cuatro en marcha. Mezclarlas
-- ahora seria comparar peras con manzanas.
-- =============================================================================

-- 1) Cobertura: DoD 2 de F3 exige que P1 detecte las 7 variantes de LSASS_campaign
SELECT
    'cobertura' AS metrica,
    countIf(campanas > 0)  AS variantes_detectadas,
    count()                AS variantes_totales,
    groupArrayIf(dataset, campanas = 0) AS fallos
FROM (
    SELECT d.dataset AS dataset, countIf(c.dataset != '') AS campanas
    FROM (SELECT DISTINCT dataset_id AS dataset FROM tfg.alerts
          WHERE dataset_id LIKE 'LSASS_campaign%') AS d
    LEFT JOIN (SELECT dataset, campana FROM tfg.p1_campanas) AS c
           ON c.dataset = d.dataset
    GROUP BY d.dataset
);

-- 2) Reduccion de alertas dentro del alcance de P1, por dataset
SELECT
    dataset,
    count()                        AS campanas,
    sum(alertas_absorbidas)        AS n_absorbidas,
    sum(evidencia_p1)              AS n_evidencia,
    round(1 - count() / sum(alertas_absorbidas), 3) AS ratio_reduccion,
    round(avg(confianza), 2)       AS confianza_media,
    round(avg(duracion_min), 1)    AS duracion_media_min
FROM tfg.p1_campanas
GROUP BY dataset
ORDER BY dataset;

-- 3) Total agregado
SELECT
    'TOTAL' AS dataset,
    count()                 AS campanas,
    sum(alertas_absorbidas) AS n_absorbidas,
    round(1 - count() / sum(alertas_absorbidas), 3) AS ratio_reduccion
FROM tfg.p1_campanas;

-- 4) Falsos positivos: campanas cuya unica evidencia es el ancla, sin ninguna
--    etapa de refuerzo. Son las candidatas a revision manual.
SELECT
    'campanas_sin_refuerzo' AS metrica,
    countIf(ev_acceso_lsass = 0 AND ev_fichero = 0
            AND ev_ejecucion_util = 0 AND ev_limpieza = 0) AS n,
    count() AS total
FROM tfg.p1_campanas;
