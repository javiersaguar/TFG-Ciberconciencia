-- =============================================================================
-- P3 · paso 1 — Evidencia por etapa: alertas + PowerShell -> det.p3_flujo
-- =============================================================================
-- Una fila por (evidencia, etapa): una alerta que prueba dos etapas sale dos
-- veces. Alertas sin repetidos (alert_id), lista de ajuste A1 aplicada, y todo EN
-- ORDEN DE TIEMPO DE EVENTO (lo que necesita el modo streaming: st_00_desorden).
--
-- Prerrequisito (sin caducidad, como el resto del corpus):
--   docker exec redpanda rpk topic create det.p3_flujo -p 3 -c retention.ms=-1
-- OJO: repetir este INSERT duplica el topic. Para repetirlo, borrarlo y crearlo.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p3_comun.sql -f /opt/jobs/p3_01_flujo.sql
-- =============================================================================

INSERT INTO p3_flujo
SELECT dataset, host, t_ms, etapa, fuente, id, detalle, nivel
FROM (
    SELECT dataset, host, t_ms, CAST('escalada' AS STRING) AS etapa, CAST('alerta' AS STRING) AS fuente,
           alert_id AS id, rule_title AS detalle, rule_level AS nivel
    FROM evidencia_alertas WHERE m_escalada = 1
    UNION ALL
    SELECT dataset, host, t_ms, CAST('descubrimiento' AS STRING), CAST('alerta' AS STRING),
           alert_id, rule_title, rule_level
    FROM evidencia_alertas WHERE m_descubrimiento = 1
    UNION ALL
    SELECT dataset, host, t_ms, CAST('persistencia' AS STRING), CAST('alerta' AS STRING),
           alert_id, rule_title, rule_level
    FROM evidencia_alertas WHERE m_persistencia = 1
    UNION ALL
    SELECT dataset, host, t_ms, CAST('descubrimiento' AS STRING), CAST('evento_ps' AS STRING),
           id, detalle, CAST('' AS STRING)
    FROM evidencia_ps
)
ORDER BY t_ms;

-- Comprobacion: lo publicado por dataset, etapa y fuente. Debe coincidir con la
-- evidencia NO excluida del oraculo:
--   SELECT dataset, etapa, fuente, count() FROM tfg.p3_evidencia
--   WHERE excluida = '' GROUP BY dataset, etapa, fuente ORDER BY dataset, etapa, fuente;
SELECT dataset, etapa, fuente, COUNT(*) AS filas, COUNT(DISTINCT id) AS ids
FROM p3_flujo
GROUP BY dataset, etapa, fuente
ORDER BY dataset, etapa, fuente;
