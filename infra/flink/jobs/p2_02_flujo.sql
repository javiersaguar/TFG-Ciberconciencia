-- =============================================================================
-- P2 · paso 2 — Enriquecimiento: aristas + evidencia al topic det.p2_flujo
-- =============================================================================
-- Publica, por host de destino, lo que el patron necesita ver junto y en orden:
--   * las ARISTAS de movimiento lateral (sin las que van al controlador de
--     dominio), con su origen, puerto, proceso y confirmacion bilateral;
--   * la EVIDENCIA de ejecucion (T1021.*, T1569.002, T1003.*), deduplicada.
-- Por que un topic y no una vista: ver la cabecera de p2_flujo en p2_comun.sql.
--
-- Prerrequisito (una vez; sin caducidad, como el resto del corpus):
--   docker exec redpanda rpk topic create det.p2_flujo -p 3 -c retention.ms=-1
--
-- OJO: volver a ejecutar este INSERT DUPLICA el contenido del topic. Para
-- repetirlo, borrar y crear el topic antes:
--   docker exec redpanda rpk topic delete det.p2_flujo
--   docker exec redpanda rpk topic create det.p2_flujo -p 3 -c retention.ms=-1
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/p2_02_flujo.sql
-- =============================================================================

-- Los literales de `tipo` van como STRING: en un UNION, 'arista' (CHAR(6)) y
-- 'evidencia' (CHAR(9)) se unificarian a CHAR(9) y 'arista' llevaria espacios
-- al final, con lo que `tipo = 'arista'` dejaria de cumplirse en el patron.
INSERT INTO p2_flujo
SELECT dataset, destino, t_ms, CAST('arista' AS STRING), origen, puerto, proceso,
       confirmada, uid, CAST(NULL AS STRING), 0, 0, 0
FROM aristas
WHERE hacia_dc = 0
UNION ALL
SELECT dataset, host, t_ms, CAST('evidencia' AS STRING), CAST(NULL AS STRING),
       CAST(NULL AS INT), CAST(NULL AS STRING), 0, alert_id, rule_title,
       remota, servicio, cred
FROM evidencias;

-- Comprobacion: lo publicado, por dataset y tipo.
--   aristas: 17, todas en apt29 day1 (las campanas LSASS son de un solo equipo).
--   evidencias: las mismas que en ClickHouse, por dataset:
--     SELECT dataset_id, count() FROM tfg.alerts FINAL
--     WHERE arrayExists(t -> t LIKE 'T1021%' OR t = 'T1569.002' OR t LIKE 'T1003%',
--                       technique_ids)
--     GROUP BY dataset_id ORDER BY dataset_id;
--   filas = ids en todas: si no, la deduplicacion no ha funcionado.
SELECT dataset, tipo, COUNT(*) AS filas, COUNT(DISTINCT id) AS ids
FROM p2_flujo
GROUP BY dataset, tipo
ORDER BY dataset, tipo;
