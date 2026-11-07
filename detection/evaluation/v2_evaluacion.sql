-- =============================================================================
-- Ajuste v2: antes (v1) y después (v2), sobre las vistas por lotes de los patrones
-- =============================================================================
-- Compara tfg.p{1,2,3}_campanas (v1) con tfg.p{1,2,3}_campanas_v2 frente a la verdad conocida
-- (tfg.verdad_datasets). Las dos versiones se miden con la MISMA vista por lotes, así que la
-- diferencia se debe solo a los cambios v2. Límite: la vista por lotes de P2 y parte de P3 necesitan
-- tfg.events, que solo contiene el corpus de F3 y los datasets de FA (los atómicos se procesaron
-- sin volcar sus eventos). En los atómicos, P2 v1/v2 no se puede medir aquí.
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg --multiquery \
--     < detection/evaluation/v2_evaluacion.sql
-- =============================================================================

-- 1) Matriz por patrón y origen: v1 frente a v2 (evaluación automática, antes de revisión manual)
WITH
    camp AS (
        SELECT 'v1' AS version, 'P1' AS patron, dataset FROM tfg.p1_campanas
        UNION ALL SELECT 'v2', 'P1', dataset FROM tfg.p1_campanas_v2
        UNION ALL SELECT 'v1', 'P2', dataset FROM tfg.p2_campanas
        UNION ALL SELECT 'v2', 'P2', dataset FROM tfg.p2_campanas_v2
        UNION ALL SELECT 'v1', 'P3', dataset FROM tfg.p3_campanas
        UNION ALL SELECT 'v2', 'P3', dataset FROM tfg.p3_campanas_v2
    ),
    por_dataset AS (
        SELECT version, patron, dataset, count() AS n FROM camp GROUP BY version, patron, dataset
    ),
    verdad AS (SELECT * FROM tfg.verdad_datasets FINAL),
    rejilla AS (
        SELECT v.version, p.patron, d.dataset_id, d.origen,
               multiIf(p.patron = 'P1', d.p1_esperado, p.patron = 'P2', d.p2_esperado, d.p3_esperado) AS esperado
        FROM verdad AS d
        CROSS JOIN (SELECT arrayJoin(['P1', 'P2', 'P3']) AS patron) AS p
        CROSS JOIN (SELECT arrayJoin(['v1', 'v2']) AS version) AS v
    )
SELECT r.patron, r.origen, r.version,
       countIf(r.esperado = 1 AND c.n > 0)  AS VP,
       countIf(r.esperado = 0 AND c.n > 0)  AS FP,
       countIf(r.esperado = 1 AND c.n = 0)  AS FN,
       countIf(r.esperado = 0 AND c.n = 0)  AS VN,
       round(VP / greatest(VP + FP, 1), 3)  AS precision,
       round(VP / greatest(VP + FN, 1), 3)  AS exhaustividad,
       sum(c.n)                             AS campanas
FROM rejilla AS r
LEFT JOIN por_dataset AS c ON c.version = r.version AND c.patron = r.patron AND c.dataset = r.dataset_id
WHERE r.origen IN ('corpus', 'atomico', 'fa')
GROUP BY r.patron, r.origen, r.version
ORDER BY r.patron, r.origen, r.version
FORMAT PrettyCompactMonoBlock;

-- 2) Campañas que cambian entre v1 y v2 (para revisarlas una a una)
SELECT * FROM (
SELECT 'P1' AS patron, 'solo v1' AS cambio, dataset, host AS hosts, toString(inicio) AS inicio
FROM tfg.p1_campanas WHERE (dataset, host, inicio) NOT IN (SELECT dataset, host, inicio FROM tfg.p1_campanas_v2)
UNION ALL
SELECT 'P1', 'solo v2', dataset, host, toString(inicio)
FROM tfg.p1_campanas_v2 WHERE (dataset, host, inicio) NOT IN (SELECT dataset, host, inicio FROM tfg.p1_campanas)
UNION ALL
SELECT 'P2', 'solo v1', dataset, concat(host_origen, ' -> ', host_destino), toString(first_seen)
FROM tfg.p2_campanas WHERE campaign_id NOT IN (SELECT campaign_id FROM tfg.p2_campanas_v2)
UNION ALL
SELECT 'P2', 'solo v2', dataset, concat(host_origen, ' -> ', host_destino), toString(first_seen)
FROM tfg.p2_campanas_v2 WHERE campaign_id NOT IN (SELECT campaign_id FROM tfg.p2_campanas)
UNION ALL
SELECT 'P3', 'solo v1', dataset, host, toString(first_seen)
FROM tfg.p3_campanas WHERE campaign_id NOT IN (SELECT campaign_id FROM tfg.p3_campanas_v2)
UNION ALL
SELECT 'P3', 'solo v2', dataset, host, toString(first_seen)
FROM tfg.p3_campanas_v2 WHERE campaign_id NOT IN (SELECT campaign_id FROM tfg.p3_campanas)
)
ORDER BY patron, cambio, dataset
FORMAT PrettyCompactMonoBlock;
