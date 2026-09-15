-- =============================================================================
-- P1 — Robo de credenciales · version en BATCH sobre ClickHouse
-- =============================================================================
-- Esta consulta es el ORACULO de la version en streaming (MATCH_RECOGNIZE de
-- F3.2): define el resultado esperado sobre un corpus fijo, de modo que al
-- portar el patron a Flink la pregunta sea "por que no sale lo que ya se que
-- hay", en lugar de depurar a la vez la logica del patron y la semantica de
-- watermarks y particiones.
--
-- DISENO (decisiones tomadas con datos el 30-07-2026, ver docs/scenarios/apt29-day1.md):
--
--   * Ancla = familia T1003.*, NO la subtecnica T1003.001. Medido sobre las 7
--     variantes de LSASS_campaign: la subtecnica exacta cubre 6 de 7 y falla con
--     Mimikatz logonpasswords, porque Meterpreter lo ejecuta dentro de su propio
--     proceso y no hay acceso externo a lsass.exe que Sysmon 10 registre.
--
--   * Las etapas NO se separan por tecnica. En apt29 el mejor precursor -el
--     volcado a disco de la herramienta- viene etiquetado tambien con T1003.*,
--     asi que una condicion del tipo "precursor != T1003.001" eliminaria la
--     mejor evidencia. Se separan por TIPO DE EVIDENCIA (claves de matched_fields).
--
--   * Ventana = 10 min, el doble del nucleo observado en apt29 (volcado de la
--     herramienta -> acceso a LSASS = 4 min 47 s). Ver la limitacion documentada
--     en el escenario: la campana entera dura 26 min, asi que ventanas de 20-30
--     min dejarian de discriminar. Es un artefacto de las evaluaciones de MITRE.
--
--   * event_hash distingue alertas del MISMO evento (una accion que dispara
--     varias reglas) de alertas de eventos distintos. Sin el, el caso comsvcs
--     -donde acceso y volcado son el mismo evento- contaria como dos etapas.
--
-- Se define como VISTA para que sea reutilizable: las metricas de P1 y, mas
-- adelante, la comparacion contra la version en streaming, consultan
-- `tfg.p1_campanas` en lugar de repetir esta logica.
--
-- Uso:
--   docker compose -f infra/docker-compose.yml exec -T clickhouse \
--     clickhouse-client --multiquery < detection/patterns/p1_credential_theft.sql
--   SELECT * EXCEPT (reglas_del_ancla, ids_absorbidos) FROM tfg.p1_campanas ORDER BY dataset, inicio;
-- =============================================================================

CREATE OR REPLACE VIEW tfg.p1_campanas AS
WITH
    -- Parametros del patron
    600 AS ventana_seg,          -- 10 minutos

    -- FINAL fuerza la deduplicacion de ReplacingMergeTree en la propia consulta.
    -- Con el volumen del corpus es despreciable, y garantiza que las cifras no
    -- dependan de si las fusiones en segundo plano ya han ocurrido.
    base AS (
        SELECT alert_id, event_hash, time, rule_id, rule_title, rule_level,
               technique_ids, tactic_ids, device_hostname, actor_user_name, src_type_name,
               matched_fields, dataset_id
        FROM tfg.alerts FINAL
    ),

    -- 1) Anclas: cualquier evidencia de acceso a credenciales
    anclas AS (
        SELECT * FROM base
        WHERE arrayExists(t -> t LIKE 'T1003%', technique_ids)
    ),

    -- 2) Anclas consecutivas separadas mas de la ventana abren campana nueva.
    --    Esto es el equivalente en batch de AFTER MATCH SKIP PAST LAST ROW: dos
    --    volcados distanciados en el tiempo son dos campanas, no una.
    anclas_marcadas AS (
        SELECT *,
               if(dateDiff('second',
                           lagInFrame(time) OVER (PARTITION BY dataset_id, device_hostname
                                                  ORDER BY time
                                                  ROWS BETWEEN 1 PRECEDING AND CURRENT ROW),
                           time) <= ventana_seg, 0, 1) AS abre_campana
        FROM anclas
    ),
    anclas_campana AS (
        SELECT *,
               sum(abre_campana) OVER (PARTITION BY dataset_id, device_hostname
                                       ORDER BY time
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana_seq
        FROM anclas_marcadas
    ),

    -- 3) Una fila por campana candidata
    campanas AS (
        SELECT dataset_id, device_hostname, campana_seq,
               min(time)               AS ancla_primera,
               max(time)               AS ancla_ultima,
               count()                 AS n_anclas,
               uniqExact(event_hash)   AS n_eventos_ancla,
               groupUniqArray(rule_title) AS reglas_ancla
        FROM anclas_campana
        GROUP BY dataset_id, device_hostname, campana_seq
    )

-- 4) Se recoge toda la evidencia del host dentro de la ventana y se clasifica
--    por etapas. El rango temporal va en el WHERE porque ClickHouse solo admite
--    igualdades en la condicion de JOIN.
SELECT
    c.dataset_id                                   AS dataset,
    c.device_hostname                              AS host,
    c.campana_seq                                  AS campana,
    min(b.time)                                    AS inicio,
    max(b.time)                                    AS fin,
    round(dateDiff('second', min(b.time), max(b.time)) / 60, 1) AS duracion_min,

    -- DOS cifras distintas, y hay que no confundirlas:
    --   evidencia_p1        = alertas que instancian de verdad las etapas de P1
    --   alertas_absorbidas  = todas las del host en la ventana, que la campana
    --                         se lleva por delante. Es la que da el ratio de
    --                         reduccion, pero P1 NO afirma que todas sean robo
    --                         de credenciales: son contexto absorbido.
    count()                                        AS alertas_absorbidas,
    uniqExact(b.event_hash)                        AS eventos_distintos,
    -- Identificadores de las alertas absorbidas. Hacen falta para contar
    -- alertas DISTINTAS entre campanas: dos campanas del mismo host pueden estar
    -- separadas (sus anclas distan mas de la ventana) y aun asi SOLAPARSE, porque
    -- cada una absorbe +-10 min alrededor de sus anclas. Medido el 15-09-2026 en
    -- apt29: las dos campanas de SCRANTON comparten 22 alertas (03:10:22 a
    -- 03:14:42), y sumar `alertas_absorbidas` daba 1.186 en un corpus que solo
    -- tiene 1.184. Las metricas cuentan con uniqExactArray sobre esta columna.
    -- Las campanas NO se modifican: siguen reconciliadas con la version en Flink.
    groupUniqArray(b.alert_id)                     AS ids_absorbidos,
    c.n_anclas                                     AS anclas,

    -- Etapas. Se reconocen por el TIPO DE EVENTO DE ORIGEN y se restringen a
    -- alertas de credenciales: sin esa restriccion, en apt29 las 292 alertas del
    -- dropper de PowerShell (descompresion de SysinternalsSuite) satisfacian la
    -- etapa "volcado a fichero" sin tener relacion alguna con credenciales.
    countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
            AND position(b.src_type_name, 'Open') > 0)            AS ev_acceso_lsass,
    countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
            AND position(b.src_type_name, 'Launch') > 0)          AS ev_ejecucion_util,
    countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
            AND position(b.src_type_name, 'File System') > 0)     AS ev_fichero,
    countIf(arrayExists(t -> t LIKE 'T1070%', b.technique_ids))   AS ev_limpieza,

    countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
            OR arrayExists(t -> t LIKE 'T1070%', b.technique_ids)) AS evidencia_p1,

    -- Confianza: descompuesta y explicable, nunca un numero opaco.
    -- Base por tener ancla + contexto, y un incremento por cada etapa de
    -- refuerzo realmente observada.
    least(1.0,
          0.40
        + if(countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
                     AND position(b.src_type_name, 'Open') > 0) > 0, 0.25, 0.0)
        + if(countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
                     AND position(b.src_type_name, 'File System') > 0) > 0, 0.20, 0.0)
        + if(countIf(arrayExists(t -> t LIKE 'T1003%', b.technique_ids)
                     AND position(b.src_type_name, 'Launch') > 0) > 0, 0.10, 0.0)
        + if(countIf(arrayExists(t -> t LIKE 'T1070%', b.technique_ids)) > 0, 0.15, 0.0)
    )                                              AS confianza,

    c.reglas_ancla                                 AS reglas_del_ancla
FROM campanas AS c
INNER JOIN base AS b
        ON b.dataset_id = c.dataset_id
       AND b.device_hostname = c.device_hostname
WHERE b.time >= c.ancla_primera - toIntervalSecond(ventana_seg)
  AND b.time <= c.ancla_ultima  + toIntervalSecond(ventana_seg)
GROUP BY c.dataset_id, c.device_hostname, c.campana_seq,
         c.ancla_primera, c.ancla_ultima, c.n_anclas, c.n_eventos_ancla, c.reglas_ancla
-- Requisito de campana: al menos DOS evidencias, sean ancla o refuerzo.
--
-- La version anterior exigia "contexto mas alla de las anclas"
-- (eventos_distintos > n_eventos_ancla), y eso penalizaba justo los casos mas
-- limpios: en una captura atomica el dataset ES solo la tecnica, sin ruido
-- alrededor, asi que no hay contexto y la campana se descartaba pese a ser una
-- deteccion correcta. Detectado el 31-07 al comparar con la version en Flink,
-- que exige dos filas de evidencia -PATTERN (E C)- y si la encontraba. Es un
-- caso de la version en streaming corrigiendo a la de referencia, no al reves.
HAVING evidencia_p1 >= 2
ORDER BY dataset, inicio;
