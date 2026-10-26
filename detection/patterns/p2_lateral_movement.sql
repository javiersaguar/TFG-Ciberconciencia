-- =============================================================================
-- P2 — Movimiento lateral · version en BATCH sobre ClickHouse (ORACULO)
-- =============================================================================
-- Mismo papel que p1_credential_theft.sql: fijar el resultado esperado sobre un
-- corpus fijo para que, al portar el patron a MATCH_RECOGNIZE, la pregunta sea
-- "por que no sale lo que ya se que hay".
--
-- DIFERENCIA ESTRUCTURAL CON P1
--   P1 vive dentro de un host y se alimenta SOLO de tfg.alerts.
--   P2 CRUZA HOSTS y necesita DOS fuentes:
--     (a) tfg.events  -> la arista host_origen -> host_destino. Sysmon EID 3.
--                        Estas conexiones NO generan alerta: si el patron se
--                        alimentara solo de det.alerts, la arista no existiria.
--     (b) tfg.alerts  -> la evidencia de EJECUCION en el destino
--                        (T1021.*, T1569.002, y T1003.* como costura con P1).
--
-- DECISIONES TOMADAS CON DATOS (08-09-2026, ver docs/scenarios/apt29-day1.md §3):
--
--   * La arista NO sale del logon 4624: en este dataset IpAddress/IpPort/
--     WorkstationName vienen a '-' (Kerberos intra-dominio) y ademas hay 1.164
--     en 25 min, ruido de fondo puro.
--
--   * La arista sale de Sysmon EID 3, que trae DestinationIp, DestinationPort,
--     Initiated y el Image del proceso que abre la conexion.
--
--   * El mapa host<->IP se DERIVA DE LOS DATOS, sin configuracion externa: cada
--     conexion se registra dos veces, en el origen con Initiated=true y en el
--     destino con Initiated=false. Solo se usa la primera cara: SourceIp de un
--     registro saliente ES la IP propia del emisor, por construccion. La cara
--     entrante NO sirve, porque un host puede registrar una conexion saliente
--     con Initiated=false y entonces DestinationIp es el host remoto.
--     Verificado sobre el fichero de origen (09-09-2026): con solo salientes el
--     mapa sale sin rivales -SCRANTON=10.0.1.4 (126-0), NASHUA=10.0.1.6 (408-0),
--     NEWYORK=10.0.0.4 (80-0), UTICA=10.0.1.5 (16-0)- mientras que combinando
--     ambas caras UTICA ganaba su propia IP por UN voto (19 contra 18 de
--     NEWYORK). Mismas 17 aristas con las dos reglas.
--
--   * El par (true,false) sirve ademas para CONFIRMAR la arista desde los dos
--     extremos. Las 17 aristas del salto estan confirmadas por NASHUA (medido
--     en Flink el 26-10, infra/flink/jobs/p2_01_aristas.sql).
--
--   * NO se exige orden "conexion -> proceso"; la restriccion es de PROXIMIDAD
--     (|dt| <= ventana). ACTUALIZADO el 25-10-2026: el motivo original ya no
--     vale. Se escribio el 08-09, cuando apt29 se fechaba con la hora de
--     RECOGIDA del WEC y la conexion salia DESPUES del proceso que la atiende.
--     Con la hora del evento (corregida el 11-09) el orden real es conexion ->
--     ejecucion: 7 de las 8 evidencias van de 14 ms a 1,0 s detras de su arista
--     (la 5985 de las 03:09:23.801 precede a wsmprovhost en 116 ms). La octava
--     (03:09:23.000) tiene hora de resolucion de SEGUNDO (Security/PowerShell) y
--     cae en el mismo segundo que la arista, asi que tampoco lo contradice.
--     Se mantiene la proximidad por dos razones: las horas de resolucion de
--     segundo no permiten ordenar dentro del segundo, y la version en Flink
--     (p2_03_campanas.sql) la reproduce con la transicion bidireccional de P1 y
--     MIDE el orden (evidencias_tras_arista, retraso_max_ms) en vez de exigirlo.
--
--   * T1570 NO se usa como etapa. Las alertas con esa etiqueta son "Rundll32
--     Execution Without Parameters": es el mapeo ATT&CK amplio de la regla, no
--     evidencia observada de transferencia. La transferencia real es la arista
--     SCRANTON -> NASHUA:445, y esa se ve en tfg.events, no en tfg.alerts.
--
--   * Ventana = 300 s, medida el 08-09 con horas de recogida y conservada para
--     que Flink reproduzca este oraculo. Con la hora del evento es muy holgada
--     para la proximidad arista <-> evidencia (la evidencia llega en < 2 s);
--     sigue teniendo sentido como hueco entre aristas. El nucleo del salto (WinRM -> SMB -> servicio) ocupa
--     1 min 53 s; el hueco maximo entre aristas consecutivas del salto real es
--     3 min 17 s, asi que 300 s mantiene el salto como UNA campana sin abarcar
--     la campana entera de 26 min (que dejaria de discriminar).
--
-- RESULTADO ESPERADO SOBRE apt29 day1 (contado sobre el fichero de origen):
--   1.229 eventos Sysmon 3 -> 39 aristas dirigidas entre hosts distintos en
--   puertos de movimiento lateral -> 17 tras descartar el controlador de
--   dominio, TODAS ellas SCRANTON -> NASHUA (5985 x4, 445 x8, 135 x5)
--   -> UNA campana P2.
--
-- Uso:
--   docker compose -f infra/docker-compose.yml exec -T clickhouse \
--     clickhouse-client --multiquery < detection/patterns/p2_lateral_movement.sql
--   SELECT * FROM tfg.p2_campanas ORDER BY dataset, first_seen;
-- =============================================================================

CREATE OR REPLACE VIEW tfg.p2_campanas AS
WITH
    -- Parametros del patron
    300 AS ventana_seg,      -- proximidad arista <-> evidencia en el destino
    300 AS hueco_seg,        -- aristas separadas mas de esto = campana nueva
      5 AS tol_par_seg,      -- tolerancia del par (true,false) de la misma conexion
      3 AS votos_min_ip,     -- votos minimos para aceptar una IP como propia de un host

    -- =====================================================================
    -- 0) DEDUPLICACION DEFENSIVA DE tfg.events
    -- =====================================================================
    -- ACTUALIZADO el 25-10-2026: lo que sigue describe la tabla ANTERIOR a la
    -- migracion del 11-09 (infra/clickhouse/migrations/2026-09-11_identidad_y_tiempo.sql).
    -- Hoy tfg.events es ReplacingMergeTree sobre la identidad del evento y el
    -- corpus esta una sola vez (530.401 filas con FINAL). La deduplicacion de
    -- abajo es ya redundante pero inocua, y se conserva como defensa.
    --
    -- tfg.events era MergeTree PLANO (infra/clickhouse/init/01_events.sql:49):
    -- no hay ReplacingMergeTree ni clave de deduplicacion, y apt29 day1 esta
    -- cargado SEIS veces. record_number NO sirve como identidad: vale 0 en todas
    -- las filas viejas (se anadio despues) y ademas el dataset SI trae
    -- RecordNumber (384740, 346370...), asi que una recarga posterior generaria
    -- filas con record_number real que NO colapsarian contra las de 0. Mezclar
    -- los dos criterios multiplicaria en vez de deduplicar.
    --
    -- Identidad usada: hash de la TUPLA SEMANTICA del evento de red. Para una
    -- conexion, (host, ms, ip:puerto origen, ip:puerto destino, sentido, pid) es
    -- unica por construccion: el puerto efimero de origen no se repite dentro
    -- del mismo milisegundo. No depende de record_number ni de que `raw` sea
    -- byte a byte identico (lo es hoy, porque raw = json.dumps determinista de
    -- la misma entrada, pero un cambio en el normalizador lo rompería).
    --
    -- Alternativa equivalente y mas corta: cityHash64(raw). Mismo criterio que
    -- ya inmuniza a tfg.alerts, donde event_hash = sha1(payload publicado)
    -- (detect_job.py:180) y alert_id = sha1(event_hash|rule_id) (detect_job.py:72).
    -- Se prefiere la tupla semantica porque es explicable en la memoria.
    --
    -- COMPROBACION (debe dar 6,0 en apt29 day1 y 1,0 en el resto):
    --   SELECT dataset_id, count() / uniqExact(event_uid)
    --   FROM (SELECT dataset_id, cityHash64(...) AS event_uid FROM tfg.events
    --         WHERE source_event_id = 3) GROUP BY dataset_id;
    red_cruda AS (
        SELECT
            dataset_id,
            device_hostname                                        AS host,
            time,
            actor_process_name                                     AS proceso,
            actor_process_pid                                      AS pid,
            -- El sentido NO esta en columna: activity_id vale 1 para todos los
            -- EID 3. Sale de connection_info.direction_id del OCSF completo
            -- (sysmon.py:145): 2 = Initiated true (saliente), 1 = entrante.
            JSONExtractInt(raw, 'connection_info', 'direction_id')  AS sentido,
            -- La IP de origen tampoco esta en columna: tfg.events solo persiste
            -- dst_ip/dst_port (01_events.sql:25-26). Sale de src_endpoint, que
            -- el mapeador si rellena (sysmon.py:133-137).
            -- OJO: en `raw` la IP viene SIN normalizar ('0:0:0:0:0:0:0:1'),
            -- porque clean_ip solo se aplica a dst (sink_clickhouse.py:82).
            toIPv6OrNull(JSONExtractString(raw, 'src_endpoint', 'ip'))  AS src_ip,
            toUInt16OrNull(JSONExtractRaw(raw, 'src_endpoint', 'port')) AS src_port,
            dst_ip,
            dst_port,
            cityHash64(
                dataset_id, device_hostname, source_channel,
                toUnixTimestamp64Milli(time),
                JSONExtractInt(raw, 'connection_info', 'direction_id'),
                JSONExtractString(raw, 'src_endpoint', 'ip'),
                JSONExtractRaw(raw, 'src_endpoint', 'port'),
                toString(dst_ip), toString(dst_port),
                actor_process_name, toString(actor_process_pid)
            ) AS event_uid
        FROM tfg.events
        -- class_uid 4001 = Network Activity. OJO: la columna `class_name` NO
        -- guarda el nombre de clase sino el type_name del OCSF
        -- (sink_clickhouse.py:70), asi que no se filtra por ella.
        WHERE source_event_id = 3
          AND class_uid = 4001
    ),
    -- LIMIT 1 BY es la deduplicacion idiomatica de ClickHouse: una fila por
    -- identidad, sin tener que agregar columna a columna.
    red AS (
        SELECT * FROM red_cruda ORDER BY time, event_uid LIMIT 1 BY event_uid
    ),

    -- =====================================================================
    -- 1) MAPA host <-> IP, derivado de los propios datos
    -- =====================================================================
    -- SOLO se cuentan los registros SALIENTES: si yo inicie la conexion, el
    -- origen soy yo, y eso es cierto por construccion. La regla simetrica para
    -- los entrantes ("dst_ip es mi IP") NO es fiable: un host puede registrar
    -- una conexion saliente con Initiated=false, y entonces dst_ip es el host
    -- REMOTO. Medido en apt29 day1: NEWYORK aportaba asi 70 votos espurios a
    -- 10.0.1.4 (SCRANTON) y 18 a 10.0.1.5 (UTICA), y UTICA ganaba su propia IP
    -- por UN voto (19 contra 18). Contando solo salientes el mapa queda sin
    -- rivales: SCRANTON 126-0, NASHUA 408-0, NEWYORK 80-0, UTICA 16-0, y las
    -- 17 aristas resultantes son exactamente las mismas.
    ip_propia AS (
        SELECT
            dataset_id, host,
            src_ip AS ip,
            count() AS votos
        FROM red
        WHERE sentido = 2
          AND ip IS NOT NULL
          -- Se descartan las direcciones que no identifican a una maquina en la
          -- red: loopback (::1 y 127.0.0.0/8, muy frecuentes aqui: ADWS y lsass
          -- hablan consigo mismos por ::1:389), link-local y multicast.
          AND ip != toIPv6('::1')
          -- OJO CON EL Nullable: `ip` es Nullable(IPv6), IPv6NumToString propaga
          -- ese Nullable, e isIPAddressInRange exige String NO nullable y aborta
          -- la consulta entera (ILLEGAL_TYPE_OF_ARGUMENT). El `ip IS NOT NULL`
          -- de arriba no basta: ClickHouse no estrecha el tipo por el WHERE.
          -- El ifNull fija un valor inocuo, y '::' no pertenece a ninguno de los
          -- rangos de abajo, asi que no altera el resultado del filtro.
          -- El replaceRegexpOne normaliza el prefijo v4-mapped
          -- (::ffff:10.0.1.4 -> 10.0.1.4) para poder comparar contra CIDR IPv4.
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(ip), '^::ffff:', ''), '::'), '127.0.0.0/8')
          AND NOT isIPAddressInRange(ifNull(IPv6NumToString(ip), '::'), 'fe80::/10')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(ip), '^::ffff:', ''), '::'), '169.254.0.0/16')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(ip), '^::ffff:', ''), '::'), '224.0.0.0/4')
        GROUP BY dataset_id, host, ip
    ),
    -- Una IP -> el host que mas votos aporta. Con la regla de arriba no hay
    -- rivales en apt29 day1, pero el argMax se conserva como red de seguridad
    -- para capturas con NAT, IPs reasignadas o interfaces compartidas.
    -- El mapa se particiona por dataset_id: cada captura es un laboratorio.
    -- OJO CON EL SOMBREADO DE ALIAS: escribir `max(votos) AS votos` bautiza el
    -- agregado con el mismo nombre que la columna de origen, y entonces el
    -- `votos` de argMax(host, votos) resuelve al agregado en vez de a la
    -- columna: ClickHouse lo rechaza como agregacion anidada
    -- (ILLEGAL_AGGREGATION). Lo mismo valdria para `AS host`. Por eso los
    -- agregados llevan nombres propios en la subconsulta y se renombran fuera.
    mapa_ip_host AS (
        SELECT dataset_id, ip, host_top AS host, votos_top AS votos
        FROM (
            SELECT dataset_id, ip,
                   argMax(host, votos) AS host_top,
                   max(votos)          AS votos_top
            FROM ip_propia
            GROUP BY dataset_id, ip
        )
        WHERE votos_top >= votos_min_ip
    ),

    -- =====================================================================
    -- 2) CONTROLADORES DE DOMINIO, tambien derivados de los datos
    -- =====================================================================
    -- El trafico hacia el DC (135/445 de Kerberos, DFS, GPO...) es ruido de
    -- fondo del dominio y haria encajar el patron con cualquier cosa. En lugar
    -- de codificar 'NEWYORK' a mano, se identifica al DC por su comportamiento:
    -- es el que recibe LDAP (389/636/3268/3269) o Kerberos (88) desde DOS O MAS
    -- hosts distintos. Comprobado: NEWYORK recibe 88 y 389 de SCRANTON, NASHUA
    -- y UTICA; ningun otro host recibe nada de eso.
    controladores AS (
        SELECT r.dataset_id AS dataset_id, m.host AS host
        FROM red AS r
        INNER JOIN mapa_ip_host AS m
                ON m.dataset_id = r.dataset_id AND m.ip = r.dst_ip
        WHERE r.sentido = 2
          AND r.dst_port IN (88, 389, 636, 3268, 3269)
          AND m.host != r.host
        GROUP BY r.dataset_id, m.host
        HAVING uniqExact(r.host) >= 2
    ),

    -- =====================================================================
    -- 3) ARISTAS DIRIGIDAS host_origen -> host_destino
    -- =====================================================================
    salientes AS (
        SELECT
            r.dataset_id                       AS dataset_id,
            r.host                             AS origen,
            m.host                             AS destino,
            r.time                             AS t,
            r.dst_port                         AS puerto,
            r.proceso                          AS proceso,
            r.src_ip                           AS ip_origen,
            r.dst_ip                           AS ip_destino,
            r.event_uid                        AS arista_uid
        FROM red AS r
        INNER JOIN mapa_ip_host AS m
                ON m.dataset_id = r.dataset_id AND m.ip = r.dst_ip
        -- ClickHouse 25.3 NO admite subconsultas correlacionadas: un
        -- `NOT IN (SELECT ... WHERE dataset_id = r.dataset_id)` aborta con
        -- UNSUPPORTED_METHOD ("correlated column"). El descarte del controlador
        -- de dominio se hace por tanto con LEFT JOIN + comprobacion de no-pareja
        -- (anti-join), que ademas evita reevaluar `controladores` fila a fila.
        LEFT JOIN controladores AS dc
               ON dc.dataset_id = r.dataset_id AND dc.host = m.host
        WHERE r.sentido = 2                    -- Initiated = true
          -- Puertos de movimiento lateral. Se enumeran explicitamente para que
          -- la memoria pueda justificar cada uno:
          --   135  RPC/DCOM   (PsExec, WMI, DCOM) — observado: PsExec64.exe
          --   139/445 SMB     (Admin$, PsExec, transferencia) — observado
          --   3389 RDP · 5900 VNC
          --   5985/5986 WinRM (T1021.006) — observado: powershell.exe
          --   22   SSH
          AND r.dst_port IN (135, 139, 445, 3389, 5900, 5985, 5986, 22)
          AND m.host != r.host                 -- descarta trafico a si mismo
          -- Descarta loopback y no enrutables aunque el mapa los hubiera resuelto
          AND r.dst_ip IS NOT NULL
          AND r.dst_ip != toIPv6('::1')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(r.dst_ip), '^::ffff:', ''), '::'), '127.0.0.0/8')
          -- Descarta el ruido hacia el controlador de dominio. En ClickHouse un
          -- LEFT JOIN sin pareja rellena con el valor POR DEFECTO y no con NULL
          -- (join_use_nulls=0), asi que la ausencia se comprueba contra '' —
          -- mismo idioma que el `e.destino != ''` de la confirmacion bilateral.
          AND dc.host = ''
    ),
    entrantes AS (
        SELECT dataset_id, host AS destino, time AS t, src_ip AS ip_origen,
               dst_ip AS ip_destino, dst_port AS puerto
        FROM red
        WHERE sentido = 1                      -- Initiated = false
    ),
    -- Confirmacion bilateral: la misma conexion vista desde el otro extremo.
    -- La condicion temporal va FUERA del ON porque ClickHouse solo admite
    -- igualdades en el JOIN (misma razon que en p1_credential_theft.sql:96).
    -- Se agrega por arista_uid para que el LEFT JOIN no multiplique filas.
    aristas AS (
        SELECT
            s.dataset_id, s.origen, s.destino, s.t, s.puerto, s.proceso, s.arista_uid,
            max(if(e.destino != '' AND abs(dateDiff('second', s.t, e.t)) <= tol_par_seg, 1, 0)) AS confirmada
        FROM salientes AS s
        LEFT JOIN entrantes AS e
               ON  e.dataset_id  = s.dataset_id
               AND e.destino     = s.destino
               AND e.ip_origen   = s.ip_origen
               AND e.ip_destino  = s.ip_destino
               AND e.puerto      = s.puerto
        GROUP BY s.dataset_id, s.origen, s.destino, s.t, s.puerto, s.proceso, s.arista_uid
    ),

    -- =====================================================================
    -- 4) SESIONIZACION: aristas consecutivas -> campana
    -- =====================================================================
    -- Identidad de campana = (dataset, origen, destino, numero de sesion).
    -- Mismo mecanismo que P1 (p1_credential_theft.sql:65-80), pero particionado
    -- por el PAR de hosts en vez de por un host: es lo que hace a P2 multi-host
    -- sin cambiar la maquinaria del nivel 2 de la version en Flink.
    aristas_marcadas AS (
        SELECT *,
               if(dateDiff('second',
                           lagInFrame(t) OVER (PARTITION BY dataset_id, origen, destino
                                               ORDER BY t
                                               ROWS BETWEEN 1 PRECEDING AND CURRENT ROW),
                           t) <= hueco_seg, 0, 1) AS abre_campana
        FROM aristas
    ),
    aristas_campana AS (
        SELECT *,
               sum(abre_campana) OVER (PARTITION BY dataset_id, origen, destino
                                       ORDER BY t
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS campana_seq
        FROM aristas_marcadas
    ),
    campanas AS (
        SELECT
            dataset_id, origen, destino, campana_seq,
            min(t)                     AS arista_primera,
            max(t)                     AS arista_ultima,
            count()                    AS n_aristas,
            uniqExact(puerto)          AS n_puertos,
            groupUniqArray(puerto)     AS puertos,
            groupUniqArray(proceso)    AS procesos,
            max(confirmada)            AS bilateral,
            -- Proceso iniciador NO de sistema: senal observada, no etiqueta.
            -- 'System' abre las conexiones 445 del propio SMB del kernel; que el
            -- salto lo abra powershell.exe o PsExec64.exe es lo interesante.
            maxIf(1, lower(proceso) NOT IN ('system', '', 'svchost.exe', 'lsass.exe')) AS proceso_interactivo
        FROM aristas_campana
        GROUP BY dataset_id, origen, destino, campana_seq
    ),

    -- =====================================================================
    -- 5) EVIDENCIA DE EJECUCION EN EL DESTINO
    -- =====================================================================
    -- FINAL por la misma razon que en P1: tfg.alerts es ReplacingMergeTree y la
    -- deduplicacion ocurre en las fusiones, no en la insercion
    -- (02_alerts.sql:49-53). Con FINAL las cifras no dependen de si las fusiones
    -- de fondo ya han ocurrido. Ademas inmuniza contra las seis cargas: al ser
    -- alert_id = sha1(event_hash|rule_id) determinista, las seis producen la
    -- MISMA fila y ReplacingMergeTree la colapsa. Por eso tfg.alerts no necesita
    -- la deduplicacion defensiva que si necesita tfg.events.
    alertas AS (
        SELECT alert_id, event_hash, time, rule_title, rule_level,
               technique_ids, device_hostname, actor_user_name, actor_process_name,
               src_type_name, dataset_id
        FROM tfg.alerts FINAL
    )

SELECT
    -- ---- Identidad y ventana ------------------------------------------------
    -- campaign_id determinista: mismo criterio que p1_05_emision.sql:129, pero
    -- la identidad incluye el PAR de hosts, porque una campana P2 es una arista.
    lower(hex(MD5(concat(c.dataset_id, '|P2|', c.origen, '->', c.destino, '|',
                         toString(toUnixTimestamp64Milli(c.arista_primera))))))  AS campaign_id,
    'P2'                                                    AS pattern_id,
    c.dataset_id                                            AS dataset,
    c.origen                                                AS host_origen,
    c.destino                                               AS host_destino,
    min(c.arista_primera)                                   AS first_seen,
    -- El fin es el ultimo de los dos: la ultima arista o la ultima EVIDENCIA en
    -- el destino, que puede ser posterior. (Con horas de recogida, PSEXESVC.exe
    -- aparecia 55 s despues de la conexion 445 que lo trajo; con la hora del
    -- evento son 56 ms. En apt29 day1 hoy manda la ultima arista.)
    --
    -- OJO: NO vale `max(a.time)` a secas. El join arrastra TODAS las alertas del
    -- destino que caen en la ventana -115 en apt29 day1, de las que solo 8 son
    -- evidencia- y entonces la duracion la acaba fijando ruido sin relacion.
    -- Medido el 08-09 (horas de recogida; hoy la ultima arista es 03:17:59.493
    -- y la ultima evidencia 03:14:42.672):
    -- con max(a.time) salian 795 s, con el final puesto por un
    -- `Internet Explorer Autorun Keys Modification` a las 03:22:42, cuando la
    -- ultima arista real es a las 03:18:01 y la ultima evidencia a las 03:14:44.
    -- La extension de una campana la fija SU evidencia, no lo que pase cerca.
    greatest(max(c.arista_ultima),
             maxIf(a.time, arrayExists(t -> t LIKE 'T1021%' OR t = 'T1569.002'
                                            OR t LIKE 'T1003%', a.technique_ids))) AS last_seen,
    dateDiff('second', first_seen, last_seen)               AS duration_s,

    -- ---- Alcance ------------------------------------------------------------
    [c.origen, c.destino]                                   AS devices,
    -- ACTUALIZADO el 25-10-2026: la deuda del mapeador que describe este
    -- comentario YA ESTA CORREGIDA (sysmon.py:147-158 rellena actor.user en el
    -- EID 3). Lo que sigue siendo cierto es que users[] sale solo de las alertas
    -- del destino, y que mezcla grafias ('pbeesly' y 'DMEVALS\pbeesly').
    -- Texto original:
    -- OJO / DEUDA CONOCIDA: los usuarios salen SOLO de las alertas del destino.
    -- map_sysmon_3 (pipeline/normalize/sysmon.py:147-153) construye actor con
    -- 'process' pero NO con 'user', asi que tfg.events.actor_user_name viene
    -- vacio para los eventos de red y se pierde el DMEVALS\pbeesly que si trae
    -- el campo User del EID 3. Arreglo de una linea en el mapeador; hasta
    -- entonces, users[] es incompleto por el lado del origen.
    arrayFilter(u -> u != '', groupUniqArray(a.actor_user_name)) AS users,

    -- ---- Evidencia ----------------------------------------------------------
    -- La arista es la ancla y NO produce alerta: es la razon de ser de la
    -- consulta a tfg.events. Se cuenta aparte de las alertas.
    any(c.n_aristas)                                        AS aristas,
    any(c.puertos)                                          AS puertos,
    any(c.procesos)                                         AS procesos_origen,
    any(c.bilateral)                                        AS arista_confirmada_por_ambos_extremos,

    count()                                                 AS alertas_absorbidas,
    uniqExact(a.event_hash)                                 AS eventos_distintos,

    -- Etapas del destino, por tecnica OBSERVADA en la alerta:
    countIf(arrayExists(t -> t LIKE 'T1021%',    a.technique_ids)) AS ev_ejecucion_remota,
    countIf(arrayExists(t -> t = 'T1569.002',    a.technique_ids)) AS ev_servicio,
    countIf(arrayExists(t -> t LIKE 'T1003%',    a.technique_ids)) AS ev_credenciales,
    countIf(arrayExists(t -> t LIKE 'T1021%' OR t = 'T1569.002'
                            OR t LIKE 'T1003%', a.technique_ids)) AS evidencia_p2,
    groupUniqArrayIf(a.rule_title,
        arrayExists(t -> t LIKE 'T1021%' OR t = 'T1569.002'
                        OR t LIKE 'T1003%', a.technique_ids))     AS reglas_evidencia,

    -- ---- Confianza descompuesta y explicable --------------------------------
    -- Mismo criterio que P1: nunca un numero opaco. Base por la arista + un
    -- incremento por cada refuerzo REALMENTE OBSERVADO.
    least(1.0,
          0.30                                                            -- arista dirigida en puerto de MovLat hacia un host que no es el DC
        + if(any(c.bilateral) = 1, 0.15, 0.0)                             -- vista desde los dos extremos
        + if(any(c.proceso_interactivo) = 1, 0.10, 0.0)                   -- la abre un proceso no-sistema
        + if(countIf(arrayExists(t -> t LIKE 'T1021%', a.technique_ids)) > 0, 0.20, 0.0)
        + if(countIf(arrayExists(t -> t = 'T1569.002', a.technique_ids)) > 0, 0.15, 0.0)
        + if(countIf(arrayExists(t -> t LIKE 'T1003%', a.technique_ids)) > 0, 0.10, 0.0)  -- costura con P1
    )                                                       AS confidence

FROM campanas AS c
INNER JOIN alertas AS a
        ON a.dataset_id      = c.dataset_id
       AND a.device_hostname = c.destino          -- evidencia EN EL DESTINO
-- Proximidad temporal SIMETRICA, no orden. El rango va en el WHERE porque el
-- JOIN de ClickHouse solo admite igualdades, y es simetrico porque el EID 3 se
-- reporta DESPUES del proceso que lo atiende (ver cabecera).
WHERE a.time >= c.arista_primera - toIntervalSecond(ventana_seg)
  AND a.time <= c.arista_ultima  + toIntervalSecond(ventana_seg)
GROUP BY c.dataset_id, c.origen, c.destino, c.campana_seq, c.arista_primera
-- Requisito de campana: la arista (ancla) MAS al menos una evidencia de
-- ejecucion observada en el destino.
--
-- Se escribe asi, y no como "mas evidencia que anclas", por la leccion de P1
-- (p1_credential_theft.sql:153-162): aquel HAVING exigia contexto MAS ALLA de
-- las anclas y penalizaba justo las capturas limpias, donde el dataset ES la
-- tecnica y no hay ruido alrededor. Aqui el umbral es absoluto: una arista y
-- una evidencia. No se exige T1570 -no hay evidencia observada de
-- transferencia, solo etiquetado de regla- ni se exige que las tres etapas del
-- destino esten presentes.
HAVING evidencia_p2 >= 1
ORDER BY dataset, first_seen;

-- =============================================================================
-- Variante LAXA (candidatas a revision manual, equivalente a la consulta 4 de
-- p1_metrics.sql): aristas de movimiento lateral SIN ninguna evidencia de
-- ejecucion en el destino. No son campanas, son avisos. Se deja como consulta
-- suelta y no como parte de la vista para no contaminar el ratio de reduccion.
--
--   SELECT dataset_id, origen, destino, n_aristas, puertos, procesos
--   FROM (... el CTE `campanas` ...) AS c
--   WHERE (c.dataset_id, c.destino) NOT IN (
--       SELECT dataset, host_destino FROM tfg.p2_campanas);
-- =============================================================================
