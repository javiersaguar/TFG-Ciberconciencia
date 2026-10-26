-- =============================================================================
-- P3 — Descubrimiento y escalada · version en BATCH sobre ClickHouse (ORACULO)
-- =============================================================================
-- Mismo papel que p1_credential_theft.sql y p2_lateral_movement.sql: fijar el
-- resultado esperado sobre el corpus antes de llevar el patron a Flink.
--
-- DECISIONES (26-10-2026, tomadas con el inventario delante: p3_00_inventario.sql
-- y p3_01_detalle.sql):
--
--   * ETAPAS POR TECNICA, NO POR TACTICA. La tactica de una alerta engana:
--     T1547.001 (claves Run) figura en ATT&CK como persistencia Y escalada, asi
--     que "Internet Explorer Autorun Keys Modification" contaba como escalada.
--       escalada        T1548 (abuso de elevacion, UAC), T1134 (tokens: getsystem),
--                       T1055 (inyeccion), T1068 (explotacion para escalar)
--       descubrimiento  T1087 T1033 T1082 T1016 T1069 T1018 T1057 T1083 T1049
--                       T1007 T1012 T1135 T1201 T1615
--       persistencia    T1547 T1543 T1053 T1546 T1037 T1136
--     Las reglas sin tecnica no son etapa de nada: asi sale sola la que mas
--     dispara del dia, "Potential Binary Or Script Dropper Via PowerShell" (292
--     de las 322 alertas de persistencia de SCRANTON, sin tecnica asignada).
--
--   * LA ESCALADA ES EL ANCLA (Javier): una campana exige escalada y, ademas,
--     descubrimiento o persistencia en el mismo host. Mismo papel que el acceso a
--     credenciales en P1. El reconocimiento rutinario sin escalada no dispara.
--
--   * DESCUBRIMIENTO HIBRIDO (Javier): alertas Sigma de descubrimiento MAS bloques
--     de PowerShell (clase OCSF 1009) con cmdlets de descubrimiento, de tfg.events.
--     En apt29 day1 Sigma no ve el descubrimiento del atacante (2 alertas en todo el
--     dia, y son del agente de Azure); PowerShell si: Invoke-Discovery a las
--     03:04:03, get-process a las 03:01, Invoke-Command NASHUA a las 03:09:23.
--     Es la decision "hibrida" pendiente en el ROADMAP desde el 31-07.
--     Palabras clave solo de descubrimiento con significado: fuera get-childitem
--     (manejo de ficheros), get-wmiobject y get-ciminstance a secas (los usa todo,
--     y 'Set-Alias gcim' es la carga del modulo CimCmdlets).
--
--   * LISTA DE AJUSTE MEDIDA (Javier). Exclusiones explicitas, cada una con su
--     prueba, aplicadas igual a todo el corpus y visibles en tfg.p3_evidencia
--     (columna `excluida`) para medir su efecto en el paso de falsos positivos:
--       A1 "Internet Explorer Autorun Keys Modification" escrita por Explorer.EXE:
--          es Windows al iniciar sesion (28-64 s tras empezar cada captura LSASS,
--          siempre Explorer.EXE; p3_01 D2).
--     MEDIDA el 26-10 (p3_02 C3): A1 quita 28 evidencias (4 en cada uno de 7
--     datasets, siempre en el primer minuto de la captura). Hubo una A2 (procesos
--     de los agentes de Azure, que lanzan route/ipconfig/arp y reconfiguran su
--     servicio a las 03:19-03:22 en SCRANTON, p3_01 D1) y se QUITO: no se aplicaba
--     a nada, porque lo que lanza Azure nunca llega a ser evidencia de P3. Una
--     exclusion que no quita nada es ajuste especulativo; la lista solo lleva lo
--     que se puede demostrar.
--     El ruido de monitorizacion de NEWYORK (Get-ADDomain cada 15 min) NO se
--     excluye: no lleva escalada, asi que no dispara; es la prueba de que la
--     secuencia filtra lo que cada senal sola no puede.
--
--   * ORDEN: no se exige, se mide (como P1 y P2). El plan de apt29 hace escalada
--     -> descubrimiento -> persistencia; el roadmap lo escribio al reves. La
--     columna `orden` ensena el observado.
--
--   * VENTANA: 10 min, la de P1. Anclas (escaladas) del mismo host separadas
--     <= 10 min forman una campana, que absorbe el descubrimiento y la persistencia
--     en [primera escalada - 10 min, ultima + 10 min]. Calibracion inicial, a
--     revisar con mas casos.
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery < detection/patterns/p3_discovery_escalation.sql
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format PrettyCompactMonoBlock < detection/patterns/p3_02_comprobar.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Toda la evidencia candidata, con su etapa y, si se excluye, el motivo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tfg.p3_evidencia AS
WITH
    ['get-process', 'win32_operatingsystem', 'win32_computersystem', 'win32_process',
     '$env:username', '$env:computername', 'whoami', 'get-localuser', 'get-localgroup',
     'get-netipaddress', 'get-netadapter', 'get-aduser', 'get-adcomputer', 'get-addomain',
     'get-netuser', 'get-netcomputer', 'get-netdomain', 'get-hotfix', 'systeminfo',
     'net user', 'net group', 'net localgroup', 'nltest']           AS claves_descubrimiento,
    alertas AS (
        SELECT dataset_id, device_hostname, time, alert_id, rule_title, rule_level,
               technique_ids, lower(actor_process_name) AS proceso,
               arrayFilter(x -> x != '', [
                   if(arrayExists(t -> match(t, '^T(1548|1134|1055|1068)'), technique_ids), 'escalada', ''),
                   if(arrayExists(t -> match(t, '^T(1087|1033|1082|1016|1069|1018|1057|1083|1049|1007|1012|1135|1201|1615)'), technique_ids), 'descubrimiento', ''),
                   if(arrayExists(t -> match(t, '^T(1547|1543|1053|1546|1037|1136)'), technique_ids), 'persistencia', '')
               ]) AS etapas
        FROM tfg.alerts FINAL
    )
SELECT
    dataset_id                                AS dataset,
    device_hostname                           AS host,
    time,
    etapa,
    'alerta'                                  AS fuente,
    alert_id                                  AS id,
    rule_title                                AS detalle,
    rule_level                                AS nivel,
    technique_ids                             AS tecnicas,
    proceso,
    if(rule_title = 'Internet Explorer Autorun Keys Modification' AND proceso = 'explorer.exe',
       'A1 Explorer al iniciar sesion', '')  AS excluida
FROM alertas
ARRAY JOIN etapas AS etapa

UNION ALL

-- Descubrimiento desde PowerShell (4104/4103/800 -> Script Activity, clase 1009)
SELECT
    dataset_id,
    device_hostname,
    time,
    'descubrimiento',
    'evento_ps',
    concat(device_hostname, '|', source_channel, '|', toString(record_number)),
    arrayStringConcat(arrayFilter(k -> position(lower(JSONExtractString(raw, 'script', 'script_content')), k) > 0,
                                  claves_descubrimiento), ','),
    '',
    [],
    lower(actor_process_name),
    ''
FROM tfg.events FINAL
WHERE class_uid = 1009
  AND multiSearchAny(lower(JSONExtractString(raw, 'script', 'script_content')), claves_descubrimiento);

-- -----------------------------------------------------------------------------
-- Campanas: escaladas como ancla, mas descubrimiento o persistencia alrededor
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tfg.p3_campanas AS
WITH
    600 AS ventana_seg,
    ev AS (SELECT * FROM tfg.p3_evidencia WHERE excluida = ''),
    -- las anclas, agrupadas por hueco (mismo mecanismo que P1 y P2)
    anclas AS (
        SELECT dataset, host, time,
               if(dateDiff('second',
                           lagInFrame(time) OVER (PARTITION BY dataset, host ORDER BY time
                                                  ROWS BETWEEN 1 PRECEDING AND CURRENT ROW),
                           time) <= ventana_seg, 0, 1) AS abre
        FROM ev
        WHERE etapa = 'escalada'
    ),
    anclas_num AS (
        SELECT *, sum(abre) OVER (PARTITION BY dataset, host ORDER BY time
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana
        FROM anclas
    ),
    nucleos AS (
        SELECT dataset, host, campana, min(time) AS ancla_ini, max(time) AS ancla_fin, count() AS anclas
        FROM anclas_num
        GROUP BY dataset, host, campana
    )
SELECT
    lower(hex(MD5(concat(n.dataset, '|P3|', n.host, '|', toString(toUnixTimestamp64Milli(min(e.time))))))) AS campaign_id,
    n.dataset                                                AS dataset,
    n.host                                                   AS host,
    n.campana                                                AS campana,
    min(e.time)                                              AS first_seen,
    max(e.time)                                              AS last_seen,
    dateDiff('second', first_seen, last_seen)                AS duration_s,
    any(n.anclas)                                            AS anclas,
    countIf(e.etapa = 'escalada')                            AS ev_escalada,
    countIf(e.etapa = 'descubrimiento' AND e.fuente = 'alerta')    AS ev_descubrimiento_alerta,
    countIf(e.etapa = 'descubrimiento' AND e.fuente = 'evento_ps') AS ev_descubrimiento_ps,
    countIf(e.etapa = 'persistencia')                        AS ev_persistencia,
    minIf(e.time, e.etapa = 'escalada')                      AS primera_escalada,
    minIf(e.time, e.etapa = 'descubrimiento')                AS primer_descubrimiento,
    minIf(e.time, e.etapa = 'persistencia')                  AS primera_persistencia,
    -- el orden observado de las etapas (por su primera evidencia)
    arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1,
        arrayFilter(x -> x.1 > toDateTime64('1971-01-01', 3), [
            (minIf(e.time, e.etapa = 'escalada'), 'escalada'),
            (minIf(e.time, e.etapa = 'descubrimiento'), 'descubrimiento'),
            (minIf(e.time, e.etapa = 'persistencia'), 'persistencia')]))), ' -> ') AS orden,
    groupUniqArrayIf(e.detalle, e.fuente = 'alerta')        AS reglas,
    groupUniqArrayIf(e.detalle, e.fuente = 'evento_ps')     AS indicadores_ps,
    groupUniqArrayIf(e.id, e.fuente = 'alerta')             AS ids_alertas,
    -- Confianza descompuesta (calibracion inicial, a revisar en F6):
    --   escalada (el ancla) 0,40 + descubrimiento 0,25 + persistencia 0,25
    --   + 0,10 si el descubrimiento lo confirma una regla Sigma (no solo palabras
    --   clave en PowerShell).
    least(1.0, 0.40
        + if(countIf(e.etapa = 'descubrimiento') > 0, 0.25, 0.0)
        + if(countIf(e.etapa = 'persistencia') > 0, 0.25, 0.0)
        + if(countIf(e.etapa = 'descubrimiento' AND e.fuente = 'alerta') > 0, 0.10, 0.0)) AS confidence
FROM nucleos AS n
INNER JOIN ev AS e
        ON e.dataset = n.dataset AND e.host = n.host
WHERE e.time >= n.ancla_ini - toIntervalSecond(ventana_seg)
  AND e.time <= n.ancla_fin + toIntervalSecond(ventana_seg)
GROUP BY n.dataset, n.host, n.campana
-- el ancla sola no es campana: hace falta descubrimiento o persistencia
HAVING countIf(e.etapa IN ('descubrimiento', 'persistencia')) >= 1
ORDER BY dataset, first_seen;
