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

-- -----------------------------------------------------------------------------
-- NIVEL 1 · transiciones arista <-> evidencia (MATCH_RECOGNIZE)
-- -----------------------------------------------------------------------------
-- p2_flujo es una fuente con WATERMARK: `ts` llega como atributo de tiempo,
-- que es lo que exige el ORDER BY del patron. La subconsulta solo proyecta, y
-- una proyeccion lo conserva.
--
-- AFTER MATCH SKIP TO NEXT ROW: las transiciones se solapan (A E A cuenta dos
-- veces la E). No se cuentan evidencias aqui, solo transiciones: las evidencias
-- de la campana se cuentan en el nivel 2, una vez cada una.
CREATE TEMPORARY VIEW transiciones AS
SELECT *
FROM (
    SELECT dataset, destino, ts, `time` AS t_ms, tipo, origen
    FROM p2_flujo
)
MATCH_RECOGNIZE (
    PARTITION BY dataset, destino
    ORDER BY ts
    MEASURES
        X.t_ms                                                           AS t_ini_ms,
        Y.t_ms                                                           AS t_fin_ms,
        CASE WHEN X.tipo = 'arista' THEN X.origen ELSE Y.origen END      AS origen,
        CASE WHEN X.tipo = 'arista' THEN X.t_ms   ELSE Y.t_ms   END      AS arista_ms,
        CASE WHEN X.tipo = 'arista' THEN 1 ELSE 0 END                    AS arista_primero
    ONE ROW PER MATCH
    AFTER MATCH SKIP TO NEXT ROW
    PATTERN (X Y)
    DEFINE
        Y AS ((X.tipo = 'arista' AND Y.tipo = 'evidencia')
           OR (X.tipo = 'evidencia' AND Y.tipo = 'arista'))
         AND Y.t_ms - X.t_ms <= 300000
) AS m;

-- -----------------------------------------------------------------------------
-- NIVEL 2 · campanas: aristas del mismo par separadas <= 300 s
-- -----------------------------------------------------------------------------
-- LAG sobre epoch-ms y no sobre `ts`: LAG no acepta TIMESTAMP_LTZ (leccion de P1).
CREATE TEMPORARY VIEW aristas_marcadas AS
SELECT dataset, origen, destino, `time` AS t_ms, puerto, proceso, confirmada,
       CASE WHEN LAG(`time`) OVER (PARTITION BY dataset, origen, destino ORDER BY `time`) IS NULL
              OR `time` - LAG(`time`) OVER (PARTITION BY dataset, origen, destino ORDER BY `time`) > 300000
            THEN 1 ELSE 0 END AS abre
FROM p2_flujo
WHERE tipo = 'arista';

CREATE TEMPORARY VIEW aristas_sesion AS
SELECT *,
       SUM(abre) OVER (PARTITION BY dataset, origen, destino ORDER BY t_ms
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sesion
FROM aristas_marcadas;

CREATE TEMPORARY VIEW sesiones AS
SELECT dataset, origen, destino, sesion,
       MIN(t_ms)               AS a_ini,
       MAX(t_ms)               AS a_fin,
       COUNT(*)                AS n_aristas,
       COUNT(DISTINCT puerto)  AS n_puertos,
       MAX(confirmada)         AS bilateral,
       -- la abre un proceso que no es del sistema (powershell.exe, PsExec64.exe):
       -- senal observada, no etiqueta. 'System' abre las 445 del SMB del kernel.
       MAX(CASE WHEN LOWER(COALESCE(proceso, '')) IN ('system', '', 'svchost.exe', 'lsass.exe')
                THEN 0 ELSE 1 END) AS proceso_interactivo
FROM aristas_sesion
GROUP BY dataset, origen, destino, sesion;

CREATE TEMPORARY VIEW puertos_sesion AS
SELECT dataset, origen, destino, sesion, LISTAGG(CAST(puerto AS STRING), ',') AS puertos
FROM (SELECT DISTINCT dataset, origen, destino, sesion, puerto FROM aristas_sesion)
GROUP BY dataset, origen, destino, sesion;

-- Transiciones del nivel 1 cuya arista cae en la campana: la PUERTA del nivel 2.
CREATE TEMPORARY VIEW transiciones_sesion AS
SELECT s.dataset, s.origen, s.destino, s.sesion, COUNT(*) AS transiciones
FROM sesiones AS s
JOIN transiciones AS t
  ON t.dataset = s.dataset AND t.origen = s.origen AND t.destino = s.destino
WHERE t.arista_ms BETWEEN s.a_ini AND s.a_fin
GROUP BY s.dataset, s.origen, s.destino, s.sesion;

-- Evidencia en el destino dentro de [primera arista - 300 s, ultima + 300 s]:
-- la misma ventana simetrica que el oraculo. Cada evidencia una vez.
CREATE TEMPORARY VIEW evidencia_en_sesion AS
SELECT s.dataset, s.origen, s.destino, s.sesion,
       e.id, e.`time` AS t_ms, e.remota, e.servicio, e.cred
FROM sesiones AS s
JOIN p2_flujo AS e
  ON e.dataset = s.dataset AND e.destino = s.destino
WHERE e.tipo = 'evidencia'
  AND e.`time` BETWEEN s.a_ini - 300000 AND s.a_fin + 300000;

-- El orden, medido: retraso desde la arista de la campana mas cercana ANTERIOR
-- a cada evidencia (NULL si ninguna la precede dentro de la ventana).
CREATE TEMPORARY VIEW orden_evidencia AS
SELECT v.dataset, v.origen, v.destino, v.sesion, v.id,
       MIN(CASE WHEN v.t_ms >= a.t_ms AND v.t_ms - a.t_ms <= 300000
                THEN v.t_ms - a.t_ms END) AS retraso_ms
FROM evidencia_en_sesion AS v
JOIN aristas_sesion AS a
  ON a.dataset = v.dataset AND a.origen = v.origen
 AND a.destino = v.destino AND a.sesion = v.sesion
GROUP BY v.dataset, v.origen, v.destino, v.sesion, v.id;

CREATE TEMPORARY VIEW evidencia_sesion AS
SELECT v.dataset, v.origen, v.destino, v.sesion,
       COUNT(*)            AS evidencia_p2,
       SUM(v.remota)       AS ev_ejecucion_remota,
       SUM(v.servicio)     AS ev_servicio,
       SUM(v.cred)         AS ev_credenciales,
       MAX(v.t_ms)         AS ev_fin,
       SUM(CASE WHEN o.retraso_ms IS NOT NULL THEN 1 ELSE 0 END) AS evidencias_tras_arista,
       MAX(o.retraso_ms)   AS retraso_max_ms
FROM evidencia_en_sesion AS v
JOIN orden_evidencia AS o
  ON o.dataset = v.dataset AND o.origen = v.origen AND o.destino = v.destino
 AND o.sesion = v.sesion AND o.id = v.id
GROUP BY v.dataset, v.origen, v.destino, v.sesion;

-- Todas las alertas del destino en la ventana (no solo la evidencia): la
-- metrica alertas_absorbidas del oraculo, para la reduccion de alertas.
CREATE TEMPORARY VIEW absorbidas_sesion AS
SELECT s.dataset, s.origen, s.destino, s.sesion, COUNT(*) AS alertas_absorbidas
FROM sesiones AS s
JOIN alertas_unicas AS a
  ON a.dataset = s.dataset AND a.host = s.destino
WHERE a.t_ms BETWEEN s.a_ini - 300000 AND s.a_fin + 300000
GROUP BY s.dataset, s.origen, s.destino, s.sesion;

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
    LOWER(MD5(CONCAT(s.dataset, '|P2|', s.origen, '->', s.destino, '|',
                     CAST(s.a_ini AS STRING))))                       AS campaign_id,
    s.dataset, s.origen, s.destino,
    TO_TIMESTAMP_LTZ(s.a_ini, 3)                                      AS first_seen,
    TO_TIMESTAMP_LTZ(GREATEST(s.a_fin, ev.ev_fin), 3)                 AS last_seen,
    CAST(FLOOR(GREATEST(s.a_fin, ev.ev_fin) / 1000.0) AS BIGINT)
      - CAST(FLOOR(s.a_ini / 1000.0) AS BIGINT)                       AS duration_s,
    GREATEST(s.a_fin, ev.ev_fin) - s.a_ini                            AS duration_ms,
    s.n_aristas AS aristas, p.puertos, s.bilateral, s.proceso_interactivo,
    t.transiciones,
    ab.alertas_absorbidas,
    ev.evidencia_p2, ev.ev_ejecucion_remota, ev.ev_servicio, ev.ev_credenciales,
    ev.evidencias_tras_arista, ev.retraso_max_ms,
    -- Confianza descompuesta, mismos pesos que el oraculo
    LEAST(1.0,
          0.30
        + CASE WHEN s.bilateral = 1               THEN 0.15 ELSE 0.0 END
        + CASE WHEN s.proceso_interactivo = 1     THEN 0.10 ELSE 0.0 END
        + CASE WHEN ev.ev_ejecucion_remota > 0    THEN 0.20 ELSE 0.0 END
        + CASE WHEN ev.ev_servicio > 0            THEN 0.15 ELSE 0.0 END
        + CASE WHEN ev.ev_credenciales > 0        THEN 0.10 ELSE 0.0 END) AS confidence
FROM sesiones AS s
-- sin transicion del nivel 1 no hay campana
JOIN transiciones_sesion AS t
  ON t.dataset = s.dataset AND t.origen = s.origen AND t.destino = s.destino AND t.sesion = s.sesion
JOIN evidencia_sesion AS ev
  ON ev.dataset = s.dataset AND ev.origen = s.origen AND ev.destino = s.destino AND ev.sesion = s.sesion
JOIN puertos_sesion AS p
  ON p.dataset = s.dataset AND p.origen = s.origen AND p.destino = s.destino AND p.sesion = s.sesion
JOIN absorbidas_sesion AS ab
  ON ab.dataset = s.dataset AND ab.origen = s.origen AND ab.destino = s.destino AND ab.sesion = s.sesion
ORDER BY s.dataset, s.a_ini;
