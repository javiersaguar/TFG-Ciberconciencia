-- =============================================================================
-- P3 · paso 2 — Campanas de descubrimiento y escalada, contra el oraculo
-- =============================================================================
-- Las vistas estan en p3_comun.sql. Esto solo comprueba.
--
-- ESPERADO: las MISMAS 3 campanas que tfg.p3_campanas (apt29 SCRANTON, LSASS_01,
-- LSASS_03), con la diferencia de extension conocida (Flink acota a la evidencia;
-- el oraculo absorbe +-10 min): en SCRANTON el oraculo cuenta 10 evidencias de
-- descubrimiento en PowerShell, hasta las 03:09:29, y Flink menos.
--
-- Cotejar con:
--   docker exec clickhouse clickhouse-client --user tfg --password tfg --query \
--     "SELECT dataset, host, first_seen, last_seen, ev_escalada, ev_descubrimiento_alerta,
--      ev_descubrimiento_ps, ev_persistencia, orden, confidence
--      FROM tfg.p3_campanas ORDER BY dataset, first_seen FORMAT PrettyCompactMonoBlock"
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p3_comun.sql -f /opt/jobs/p3_02_campanas.sql
-- =============================================================================

SELECT dataset, host,
       TO_TIMESTAMP_LTZ(inicio, 3) AS inicio,
       TO_TIMESTAMP_LTZ(fin, 3)    AS fin,
       transiciones,
       ev_escalada, ev_descubrimiento_alerta, ev_descubrimiento_ps, ev_persistencia,
       TO_TIMESTAMP_LTZ(primera_escalada, 3)      AS primera_escalada,
       TO_TIMESTAMP_LTZ(primer_descubrimiento, 3) AS primer_descubrimiento,
       TO_TIMESTAMP_LTZ(primera_persistencia, 3)  AS primera_persistencia,
       confianza
FROM campanas_p3
ORDER BY dataset, inicio;
