-- =============================================================================
-- P2 · paso 1 — Mapa IP -> host, controlador de dominio y aristas, en Flink
-- =============================================================================
-- Reproduce los pasos 1 a 3 del oraculo (detection/patterns/p2_lateral_movement.sql)
-- ANTES del patron: si las aristas no salen iguales, no tiene sentido seguir.
-- Las vistas estan en p2_comun.sql (red, mapa_ip_host, controladores, aristas).
--
-- VALIDADO el 26-10-2026, tras corregir el loopback IPv6 sin abreviar:
--   C1  4 IP en apt29 day1 (10.0.0.4 NEWYORK 80, 10.0.1.4 SCRANTON 126,
--       10.0.1.5 UTICA 16, 10.0.1.6 NASHUA 408), sin rivales.
--   C2  NEWYORK es el controlador de dominio.
--   C3  39 aristas: 22 hacia el DC y 17 SCRANTON -> NASHUA (135 x5, 445 x8,
--       5985 x4), las 17 confirmadas por NASHUA. Igual que el oraculo.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/p2_01_aristas.sql
-- =============================================================================

-- C1. Mapa de apt29 day1. Oraculo (09-09): SCRANTON 10.0.1.4 (126 votos),
--     NASHUA 10.0.1.6 (408), NEWYORK 10.0.0.4 (80), UTICA 10.0.1.5 (16).
SELECT ip, host, votos
FROM mapa_ip_host
WHERE dataset = 'SDWIN-200501225525'
ORDER BY ip;

-- C2. Controladores de dominio por dataset. Oraculo: NEWYORK en apt29 day1.
SELECT dataset, host FROM controladores ORDER BY dataset;

-- C3. Aristas por par y puerto, con y sin el controlador.
--     Oraculo en apt29 day1: 39 aristas con el DC; 17 sin el, todas
--     SCRANTON -> NASHUA (5985 x4, 445 x8, 135 x5).
SELECT dataset, origen, destino, puerto, hacia_dc,
       COUNT(*) AS aristas, SUM(confirmada) AS confirmadas
FROM aristas
GROUP BY dataset, origen, destino, puerto, hacia_dc
ORDER BY dataset, hacia_dc, origen, destino, puerto;
