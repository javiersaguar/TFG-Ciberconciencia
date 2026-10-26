-- =============================================================================
-- P3 · paso 2 — Comprobacion del oraculo (solo lectura)
-- =============================================================================
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format PrettyCompactMonoBlock < detection/patterns/p3_02_comprobar.sql
-- =============================================================================

-- C1. Las campanas P3 de todo el corpus.
--     Prevision: apt29 SCRANTON (UAC 02:58 + carpeta de inicio 03:04 + Invoke-
--     Discovery 03:04) y las LSASS con escalada real (getsystem: 2 de 7). Ninguna en
--     NEWYORK (monitorizacion sin escalada) ni en NASHUA.
SELECT 'C1 campanas P3' AS consulta;
SELECT dataset, host, first_seen, last_seen, duration_s, anclas,
       ev_escalada, ev_descubrimiento_alerta, ev_descubrimiento_ps, ev_persistencia,
       orden, confidence
FROM tfg.p3_campanas
ORDER BY dataset, first_seen;

-- C2. Que evidencia entra en cada campana: reglas e indicadores
SELECT 'C2 reglas e indicadores por campana' AS consulta;
SELECT dataset, host, campana, reglas, indicadores_ps
FROM tfg.p3_campanas
ORDER BY dataset, first_seen;

-- C3. La lista de ajuste, MEDIDA: que quita cada exclusion, por dataset y etapa
SELECT 'C3 efecto de la lista de ajuste' AS consulta;
SELECT excluida AS motivo, dataset, etapa, count() AS evidencias,
       min(time) AS primera, max(time) AS ultima, groupUniqArray(detalle) AS detalles
FROM tfg.p3_evidencia
WHERE excluida != ''
GROUP BY motivo, dataset, etapa
ORDER BY motivo, dataset, etapa;

-- C4. La evidencia de apt29 SCRANTON, en orden (la verdad conocida: 3.B escalada
--     -> 4.x descubrimiento -> 5.x persistencia). Incluye lo excluido, marcado.
SELECT 'C4 linea temporal de SCRANTON' AS consulta;
SELECT time, etapa, fuente, substring(detalle, 1, 70) AS detalle, tecnicas, proceso, excluida
FROM tfg.p3_evidencia
WHERE dataset = 'SDWIN-200501225525' AND host = 'SCRANTON.dmevals.local'
ORDER BY time;

-- C5. Los hosts con escalada pero SIN campana (ancla sola), y los que tienen
--     descubrimiento o persistencia pero ninguna escalada: lo que P3 deja fuera
SELECT 'C5 lo que P3 deja fuera' AS consulta;
SELECT dataset, host,
       countIf(etapa = 'escalada')       AS escalada,
       countIf(etapa = 'descubrimiento') AS descubrimiento,
       countIf(etapa = 'persistencia')   AS persistencia,
       (dataset, host) IN (SELECT dataset, host FROM tfg.p3_campanas) AS con_campana
FROM tfg.p3_evidencia
WHERE excluida = ''
GROUP BY dataset, host
ORDER BY dataset, host;
