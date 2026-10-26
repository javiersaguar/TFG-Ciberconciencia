-- =============================================================================
-- P1 · paso 6 — Evidencia sin repetidos: det.alerts -> det.p1_flujo
-- =============================================================================
-- Publica la evidencia de P1 (credenciales T1003.* y limpieza T1070.*) una vez
-- por alert_id y con sus etapas precalculadas. Por que hace falta: cabecera de
-- p1_comun.sql (las republicaciones de det.alerts fabricarian transiciones).
--
-- Prerrequisito (una vez; sin caducidad, como el resto del corpus):
--   docker exec redpanda rpk topic create det.p1_flujo -p 3 -c retention.ms=-1
-- OJO: repetir este INSERT duplica el topic. Para repetirlo, borrarlo y crearlo.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p1_comun.sql -f /opt/jobs/p1_06_flujo.sql
-- =============================================================================

-- Mismos criterios de etapa que p1_05 (validados el 31-07). La etapa sale del
-- tipo del evento que disparo la regla: acceso a proceso (Open), creacion de
-- proceso (Launch) o fichero (File System).
INSERT INTO p1_flujo
SELECT dataset, host, t_ms, alert_id, rule_title, rule_level,
       CASE WHEN tecnicas LIKE '%T1003%' THEN 1 ELSE 0 END,
       CASE WHEN tecnicas LIKE '%T1070%' THEN 1 ELSE 0 END,
       CASE WHEN tecnicas LIKE '%T1003%' AND tipo LIKE '%Open%'        THEN 1 ELSE 0 END,
       CASE WHEN tecnicas LIKE '%T1003%' AND tipo LIKE '%Launch%'      THEN 1 ELSE 0 END,
       CASE WHEN tecnicas LIKE '%T1003%' AND tipo LIKE '%File System%' THEN 1 ELSE 0 END
FROM alertas_unicas
WHERE tecnicas LIKE '%T1003%' OR tecnicas LIKE '%T1070%';

-- Comprobacion: lo publicado por dataset. filas = ids en todas (sin repetidos).
-- Cotejar con ClickHouse:
--   SELECT dataset_id, count() FROM tfg.alerts FINAL
--   WHERE arrayExists(t -> t LIKE 'T1003%' OR t LIKE 'T1070%', technique_ids)
--   GROUP BY dataset_id ORDER BY dataset_id;
SELECT dataset, COUNT(*) AS filas, COUNT(DISTINCT alert_id) AS ids,
       SUM(cred) AS credenciales, SUM(limp) AS limpieza,
       SUM(lsass) AS acceso_lsass, SUM(util) AS herramienta, SUM(fich) AS volcado
FROM p1_flujo
GROUP BY dataset
ORDER BY dataset;
