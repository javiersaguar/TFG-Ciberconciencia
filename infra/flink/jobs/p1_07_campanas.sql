-- =============================================================================
-- P1 · paso 7 — Campanas de robo de credenciales, contra el oraculo
-- =============================================================================
-- Las vistas (transiciones_p1, campanas_p1...) estan en p1_comun.sql. Esto solo
-- comprueba.
--
-- ESPERADO (reconciliacion del 31-07 y revalidacion del 15-09): las MISMAS 11
-- campanas que el oraculo tfg.p1_campanas: una por cada LSASS_campaign_01..07,
-- apt29 SCRANTON x2, apt29 NASHUA x1 y el atomico SDWIN-201018195009 x1.
-- Coinciden en QUE campanas hay, no en su extension: el oraculo absorbe +-10 min
-- alrededor de las anclas y Flink acota a su evidencia (SCRANTON: 02:56-03:14 en
-- el oraculo, ~03:00-03:05 aqui). Por eso alertas_en_ventana no es comparable con
-- las alertas_absorbidas del oraculo.
--
-- Cotejar con:
--   docker exec clickhouse clickhouse-client --user tfg --password tfg --query \
--     "SELECT dataset, host, inicio, fin, evidencia_p1, ev_acceso_lsass,
--      ev_ejecucion_util, ev_fichero, ev_limpieza, confianza
--      FROM tfg.p1_campanas ORDER BY dataset, inicio FORMAT PrettyCompactMonoBlock"
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p1_comun.sql -f /opt/jobs/p1_07_campanas.sql
-- =============================================================================

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(inicio, 3) AS inicio,
       TO_TIMESTAMP_LTZ(fin, 3)    AS fin,
       transiciones, evidencias,
       ev_credenciales, ev_acceso_lsass, ev_ejecucion_herramienta, ev_volcado_a_disco, ev_limpieza,
       alertas_en_ventana,
       confianza,
       campaign_id
FROM campanas_p1
ORDER BY dataset, inicio;
