-- =============================================================================
-- Cierre de F3 (06-11-2026): ratio de reducción de alertas y falsos positivos
-- =============================================================================
-- Decisiones de Javier (06-11-2026):
--   * Una campaña absorbe SOLO SU EVIDENCIA (lo que emite Flink), no el contexto
--     de ±10 min del oráculo. Las alertas que ninguna campaña recoge siguen ahí
--     para el analista y cuentan como «sueltas».
--   * Falsos positivos sobre el corpus de F3 y las 113 capturas atómicas de host
--     de OTRF, juzgando cada campaña contra la verdad conocida de su dataset
--     (tfg.verdad_datasets, generada por detection/evaluation/verdad_conocida.py).
--
-- Definiciones:
--   reducción sobre la evidencia = 1 - campañas / alertas de evidencia
--       (cuánto comprime el CEP lo que SÍ reconoce como ataque)
--   reducción global             = 1 - (campañas + alertas sueltas) / alertas
--       (cuánto baja el volumen total que tiene que mirar el analista)
--   Línea base B1 (solo Sigma, sin correlación): reducción 0, todas las alertas.
--
--   Por patrón y dataset: VP = esperado y dispara; FP = no esperado y dispara;
--   FN = esperado y no dispara; VN = ni esperado ni dispara.
--   tasa de falsas alarmas = FP / (FP + VN), por dataset.
--   Un FP aquí es un CANDIDATO: se revisa a mano con la consulta 4 antes de darlo
--   por tal (un metadato puede no listar actividad real de la captura).
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format PrettyCompactMonoBlock < detection/evaluation/f3_cierre.sql
-- =============================================================================

-- 1. Reducción de alertas por grupo de datasets (corpus de F3 / atómicos) y total
WITH
    cubiertas AS (
        SELECT DISTINCT uid
        FROM tfg.campaigns FINAL
        ARRAY JOIN related_event_uids AS uid
    ),
    por_ds AS (
        SELECT dataset_id,
               count()                                          AS alertas,
               countIf(alert_id IN (SELECT uid FROM cubiertas)) AS evidencia
        FROM tfg.alerts FINAL
        GROUP BY dataset_id
    ),
    camp AS (
        SELECT dataset_id, count() AS campanas
        FROM tfg.campaigns FINAL
        GROUP BY dataset_id
    )
SELECT
    if(v.origen = '', 'sin verdad', v.origen)                                AS grupo,
    count()                                                                  AS datasets,
    sum(p.alertas)                                                           AS alertas,
    sum(p.evidencia)                                                         AS alertas_evidencia,
    sum(c.campanas)                                                          AS campanas,
    sum(p.alertas) - sum(p.evidencia)                                        AS alertas_sueltas,
    round(1 - sum(c.campanas) / nullIf(sum(p.evidencia), 0), 3)              AS reduccion_evidencia,
    round(1 - (sum(c.campanas) + sum(p.alertas) - sum(p.evidencia))
              / sum(p.alertas), 3)                                           AS reduccion_global
FROM por_ds AS p
LEFT JOIN camp AS c ON c.dataset_id = p.dataset_id
LEFT JOIN tfg.verdad_datasets AS v ON v.dataset_id = p.dataset_id
GROUP BY grupo WITH TOTALS
ORDER BY grupo;

-- 2. Reducción por patrón. P3 también trae eventos de PowerShell como evidencia
--    (no son alertas): se cuentan aparte y no entran en la ratio.
WITH alertas AS (SELECT alert_id FROM tfg.alerts FINAL)
SELECT
    pattern_id                                                       AS patron,
    uniqExact(campaign_id)                                           AS campanas,
    uniqExactIf(uid, uid IN (SELECT alert_id FROM alertas))          AS alertas_evidencia,
    uniqExactIf(uid, uid NOT IN (SELECT alert_id FROM alertas))      AS eventos_no_alerta,
    round(alertas_evidencia / campanas, 1)                           AS alertas_por_campana,
    round(1 - campanas / nullIf(alertas_evidencia, 0), 3)            AS reduccion_evidencia
FROM tfg.campaigns FINAL
ARRAY JOIN related_event_uids AS uid
GROUP BY patron
ORDER BY patron;

-- 3. Falsos positivos: matriz de confusión por patrón y grupo, a nivel de dataset
WITH
    camp AS (
        SELECT dataset_id, pattern_id, count() AS n
        FROM tfg.campaigns FINAL
        GROUP BY dataset_id, pattern_id
    ),
    univ AS (
        SELECT dataset_id, origen, patron, esperado
        FROM tfg.verdad_datasets FINAL
        ARRAY JOIN ['P1', 'P2', 'P3']                        AS patron,
                   [p1_esperado, p2_esperado, p3_esperado]   AS esperado
    )
SELECT
    u.patron                                              AS patron,
    u.origen                                              AS grupo,
    countIf(u.esperado = 1 AND c.n > 0)                   AS VP,
    countIf(u.esperado = 0 AND c.n > 0)                   AS FP,
    countIf(u.esperado = 1 AND c.n = 0)                   AS FN,
    countIf(u.esperado = 0 AND c.n = 0)                   AS VN,
    sumIf(c.n, u.esperado = 0)                            AS campanas_en_FP,
    round(FP / nullIf(FP + VN, 0), 3)                     AS tasa_falsas_alarmas,
    round(VP / nullIf(VP + FP, 0), 3)                     AS precision_datasets
FROM univ AS u
LEFT JOIN camp AS c ON c.dataset_id = u.dataset_id AND c.pattern_id = u.patron
GROUP BY patron, grupo WITH TOTALS
ORDER BY patron, grupo;

-- 4. Campañas candidatas a falso positivo, para revisarlas una a una
SELECT
    c.pattern_id            AS patron,
    c.dataset_id            AS dataset,
    v.titulo                AS captura,
    v.verdad                AS verdad,
    v.tecnicas              AS tecnicas_verdad,
    c.technique_ids         AS tecnicas_campana,
    c.stages                AS etapas,
    c.related_events_count  AS evidencias,
    c.confidence_score      AS confianza,
    c.duration_ms           AS duracion_ms,
    c.campaign_id           AS campaign_id
FROM tfg.campaigns AS c FINAL
INNER JOIN tfg.verdad_datasets AS v ON v.dataset_id = c.dataset_id
WHERE (c.pattern_id = 'P1' AND v.p1_esperado = 0)
   OR (c.pattern_id = 'P2' AND v.p2_esperado = 0)
   OR (c.pattern_id = 'P3' AND v.p3_esperado = 0)
ORDER BY patron, dataset;

-- 5. Esperados que no disparan (informativo: una captura atómica de una sola
--    técnica no tiene por qué formar una campaña multi-etapa)
WITH camp AS (
    SELECT dataset_id, groupUniqArray(pattern_id) AS patrones
    FROM tfg.campaigns FINAL
    GROUP BY dataset_id
)
SELECT
    v.origen    AS grupo,
    v.dataset_id AS dataset,
    v.titulo    AS captura,
    arrayFilter(p -> NOT has(c.patrones, p),
        arrayConcat(if(v.p1_esperado = 1, ['P1'], []),
                    if(v.p2_esperado = 1, ['P2'], []),
                    if(v.p3_esperado = 1, ['P3'], [])))   AS faltan
FROM tfg.verdad_datasets AS v FINAL
LEFT JOIN camp AS c ON c.dataset_id = v.dataset_id
WHERE length(faltan) > 0
ORDER BY grupo, dataset;

-- 6. Comprobación: campañas o alertas de datasets SIN verdad conocida (debe salir vacío)
SELECT 'campaña' AS tipo, dataset_id, count() AS n
FROM tfg.campaigns FINAL
WHERE dataset_id NOT IN (SELECT dataset_id FROM tfg.verdad_datasets)
GROUP BY dataset_id
UNION ALL
SELECT 'alerta', dataset_id, count()
FROM tfg.alerts FINAL
WHERE dataset_id NOT IN (SELECT dataset_id FROM tfg.verdad_datasets)
GROUP BY dataset_id;
