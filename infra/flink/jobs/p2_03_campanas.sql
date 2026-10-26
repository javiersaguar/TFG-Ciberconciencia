-- =============================================================================
-- P2 · paso 3 — MATCH_RECOGNIZE y campanas de movimiento lateral
-- =============================================================================
-- Lee det.p2_flujo (paso 2) y reproduce la vista tfg.p2_campanas del oraculo.
-- Misma correlacion en DOS NIVELES que P1 (p1_04_dos_niveles.sql), por la misma
-- razon: MATCH_RECOGNIZE en Flink no puede expresar "agrupa hasta que se abra un
-- hueco" (no admite cuantificadores voraces al final del patron).
--
--   NIVEL 1 · MATCH_RECOGNIZE, por host de destino: la TRANSICION entre una
--     arista y una evidencia de ejecucion consecutivas, a <= 300 s. Es la
--     secuencia multi-etapa propiamente dicha: "alguien se conecta a este host
--     por un puerto de movimiento lateral, y en este host se ejecuta algo
--     remoto". BIDIRECCIONAL, como en P1 (decision del 25-10): vale en los dos
--     ordenes. Flink no admite alternativas en PATTERN ("A luego B, o B luego
--     A"), y exigir el orden obligaria a conocer la resolucion de cada hora
--     (las de Security/PowerShell van al segundo), que det.alerts no trae.
--   NIVEL 2 · agregacion por hueco: las aristas del mismo par origen -> destino
--     separadas <= 300 s forman una campana (el mismo criterio que el oraculo).
--     Una campana EXIGE al menos una transicion del nivel 1: es la condicion
--     que en el oraculo hace el HAVING evidencia_p2 >= 1.
--
-- EL ORDEN SE MIDE, NO SE EXIGE: por cada evidencia, si la precede una arista
-- de la campana (<= 300 s) y con que retraso. Medido el 25-10 en ClickHouse:
-- 7 de 8 evidencias van detras de su conexion (de 14 ms a 1,0 s); la octava
-- tiene hora de resolucion de segundo (03:09:23.000) y cae en el mismo segundo
-- que la primera arista (03:09:23.801).
--
-- RESULTADO ESPERADO en apt29 day1 (oraculo, revalidado el 25-10):
--   1 campana SCRANTON -> NASHUA, mismo campaign_id que el oraculo,
--   first_seen 03:09:23.801, last_seen 03:17:59.493, 516 s,
--   17 aristas (135, 445, 5985), confirmada por ambos extremos,
--   115 alertas absorbidas, 8 evidencias (remota 4, servicio 4, credenciales 1:
--   el acceso remoto a LSASS por WinRM es T1021 y T1003 a la vez), confianza 1,0.
--   Nuevo respecto al oraculo: 13 transiciones; 7 evidencias tras su arista,
--   retraso maximo 1.004 ms.
--
-- VALIDADO el 26-10-2026: todo lo anterior, exacto (campaign_id 07c1426c...edfdc).
--   Las 13 transiciones son las previstas: 6 empiezan por la arista y 7 por la
--   evidencia. OJO con leer estas ultimas como "orden inverso": tres de ellas
--   (63, 74 y 197 s) emparejan la evidencia de una tanda de PsExec con la arista
--   de la tanda SIGUIENTE. Caben en la ventana y no estorban, porque el nivel 1
--   solo decide SI hay campana; pero por eso la senal de orden fiable es la de
--   por evidencia (evidencias_tras_arista, retraso_max_ms), no el recuento de
--   transiciones. Acortar la ventana de proximidad (la evidencia llega en < 2 s)
--   las eliminaria, a costa de dejar de reproducir el oraculo.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/p2_03_campanas.sql
-- =============================================================================

-- Las vistas del patron y de las campanas (transiciones, sesiones, campanas_p2...)
-- estan en p2_comun.sql desde el 26-10, para que la emision (p2_04) parta
-- exactamente de lo mismo que se ha validado aqui.

-- =============================================================================
-- COMPROBACIONES
-- =============================================================================

-- C1. Nivel 1 en apt29 day1: 13 transiciones en NASHUA, todas con origen
--     SCRANTON (7 empiezan por la evidencia, 6 por la arista; la secuencia
--     arista/evidencia esta en la bitacora del 25-10).
SELECT destino, origen, TO_TIMESTAMP_LTZ(t_ini_ms, 3) AS inicio,
       TO_TIMESTAMP_LTZ(t_fin_ms, 3) AS fin, arista_primero
FROM transiciones
WHERE dataset = 'SDWIN-200501225525'
ORDER BY t_ini_ms;

-- C2. Las campanas, columna a columna contra tfg.p2_campanas.
--     duration_s se calcula sobre segundos ENTEROS (corte de segundo), como
--     dateDiff('second') de ClickHouse: 03:17:59 - 03:09:23 = 516, aunque la
--     diferencia exacta sea 515,692 s (va aparte, en duration_ms).
SELECT
    campaign_id, dataset, origen, destino,
    TO_TIMESTAMP_LTZ(inicio, 3)                                       AS first_seen,
    TO_TIMESTAMP_LTZ(fin, 3)                                          AS last_seen,
    CAST(FLOOR(fin / 1000.0) AS BIGINT) - CAST(FLOOR(inicio / 1000.0) AS BIGINT) AS duration_s,
    fin - inicio                                                      AS duration_ms,
    n_aristas AS aristas, puertos, bilateral, proceso_interactivo,
    transiciones, alertas_absorbidas,
    evidencia_p2, ev_ejecucion_remota, ev_servicio, ev_credenciales,
    evidencias_tras_arista, retraso_max_ms,
    -- Confianza descompuesta, mismos pesos que el oraculo
    LEAST(1.0,
          0.30
        + CASE WHEN bilateral = 1               THEN 0.15 ELSE 0.0 END
        + CASE WHEN proceso_interactivo = 1     THEN 0.10 ELSE 0.0 END
        + CASE WHEN ev_ejecucion_remota > 0     THEN 0.20 ELSE 0.0 END
        + CASE WHEN ev_servicio > 0             THEN 0.15 ELSE 0.0 END
        + CASE WHEN ev_credenciales > 0         THEN 0.10 ELSE 0.0 END) AS confidence
FROM campanas_p2
ORDER BY dataset, inicio;
