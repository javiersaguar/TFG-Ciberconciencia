-- =============================================================================
-- Migracion 2026-09-11 — identidad de evento y origen del tiempo
-- =============================================================================
-- Por que hace falta rehacer las tablas y no basta un ALTER:
--
--   1. En ClickHouse NO se cambia el motor de una tabla existente. `tfg.events`
--      es MergeTree plano y debe pasar a ReplacingMergeTree con la identidad
--      del evento como clave de ordenacion.
--
--   2. Las filas ya cargadas no tienen con que deduplicarse: `record_number`
--      vale 0 en todas (la columna se anadio despues), y `src_ip`/`direction_id`
--      llegaron aun mas tarde. Convertirlas en sitio las colapsaria mal.
--
--   3. El origen de la marca de tiempo cambia (ver ocsf_common.event_time): todo
--      apt29 estaba fechado con la hora de RECOGIDA del colector, con hasta
--      101 s de desfase y sigma de 26,7 s. Al corregirlo cambia `time` y, con el,
--      el JSON normalizado -> `event_hash` -> `alert_id`. Por eso hay que
--      rehacer TAMBIEN tfg.alerts: dejar las viejas mezclaria dos identidades
--      distintas del mismo evento.
--
-- Las tablas viejas NO se borran: se apartan con _legacy. Conservan los ~1,22 M
-- de eventos atomicos con los que se entreno ML-1 y los ~100 datasets que no
-- forman parte del corpus reproducible de F3. Migrarlos es decision aparte.
--
-- REVERSIBLE. Para deshacer:
--   DROP TABLE tfg.events; DROP TABLE tfg.alerts;
--   RENAME TABLE tfg.events_legacy TO tfg.events, tfg.alerts_legacy TO tfg.alerts;
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery < infra/clickhouse/migrations/2026-09-11_identidad_y_tiempo.sql
-- =============================================================================

RENAME TABLE tfg.events TO tfg.events_legacy, tfg.alerts TO tfg.alerts_legacy;
CREATE TABLE tfg.events
(
    -- Identificacion temporal y de clase
    time            DateTime64(3)   CODEC(Delta, ZSTD),
    class_uid       UInt32,
    class_name      LowCardinality(String),
    activity_id     UInt8,
    category_uid    UInt8,
    type_uid        UInt32,
    severity_id     UInt8,

    -- Dispositivo
    device_hostname LowCardinality(String),

    -- Actor (quien realiza la accion)
    actor_process_name  String,
    actor_process_pid   Nullable(UInt32),
    actor_user_name     String,

    -- Objetivo (proceso/fichero/red sobre el que se actua)
    target_process_name String,
    target_process_pid  Nullable(UInt32),
    file_path           String,
    -- Extremos de red. IPv6 cubre tambien IPv4 (mapped).
    -- El ORIGEN es imprescindible para el movimiento lateral (P2): sin el no se
    -- puede expresar "SCRANTON inicio una conexion hacia NASHUA", que es de lo
    -- que trata el patron. Antes solo se guardaba el destino y la direccion
    -- habia que sacarla del JSON de `raw` en cada consulta.
    src_ip              Nullable(IPv6),
    src_port            Nullable(UInt16),
    dst_ip              Nullable(IPv6),
    dst_port            Nullable(UInt16),
    -- OCSF connection_info.direction_id: 1 = entrante, 2 = saliente, 0 = n/a.
    -- Cada conexion se registra DOS veces, en el host que la inicia (2) y en el
    -- que la recibe (1); quedarse con las salientes evita contar la arista dos
    -- veces, y cruzarlas permite confirmarla desde ambos extremos.
    direction_id        UInt8 DEFAULT 0,

    -- Señales de deteccion precalculadas (tfg.signal_*)
    signal_lsass_access      Bool DEFAULT false,
    signal_suspicious_access Bool DEFAULT false,
    signal_dump_module       Bool DEFAULT false,
    signal_dump_file         Bool DEFAULT false,
    signal_log_cleared       Bool DEFAULT false,
    signal_remote_logon      Bool DEFAULT false,

    -- Trazabilidad a la verdad conocida
    dataset_id       LowCardinality(String),
    source_channel   LowCardinality(String),
    source_event_id  UInt32,

    -- Identidad del evento en su log de origen (RecordNumber / EventRecordID).
    -- Unico dentro de (device_hostname, source_channel): la terna identifica el
    -- evento y es lo que permite deduplicar recargas. 0 = la fuente no lo trae.
    record_number    UInt64 DEFAULT 0,

    -- Evento OCSF completo (flexibilidad total)
    raw              String CODEC(ZSTD)
)
-- ReplacingMergeTree sobre la IDENTIDAD del evento, no sobre (host, time).
-- La clave de ordenacion ES la identidad: `record_number` es unico dentro de
-- (device_hostname, source_channel), y el dataset_id delante separa capturas.
-- Verificado sobre apt29 day1: 194.829 eventos, 194.829 ternas distintas, cero
-- colisiones. Con esto una recarga sobreescribe en vez de duplicar, igual que
-- ya ocurre en tfg.alerts con alert_id.
--
-- OJO: la deduplicacion ocurre en las FUSIONES, no en la insercion. Para
-- garantia inmediata, consultar con FINAL u `OPTIMIZE TABLE tfg.events FINAL`.
--
-- LIMITE CONOCIDO: si una fuente no trajera RecordNumber ni EventRecordID,
-- record_number valdria 0 en todos sus eventos y la clave los colapsaria en uno
-- por (dataset, host, canal). Por eso la carga debe verificarse siempre con
--   SELECT dataset_id, count() FROM tfg.events GROUP BY dataset_id
-- contra el numero de lineas del fichero de origen.
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (dataset_id, device_hostname, source_channel, record_number)
SETTINGS index_granularity = 8192;CREATE TABLE tfg.alerts
(
    -- Identificacion y tiempo
    --
    -- alert_id es DETERMINISTA: sha1(event_hash | rule_id). Reprocesar el mismo
    -- evento produce el mismo identificador, de modo que ReplacingMergeTree
    -- puede deduplicar sin colapsar alertas legitimas. Sin esto, dos eventos
    -- distintos del mismo milisegundo en el mismo host y por la misma regla
    -- serian indistinguibles entre si y de un duplicado por reprocesado.
    alert_id        String,
    -- Identidad del evento de origen: permite saber si dos alertas proceden del
    -- MISMO evento (una sola accion que dispara varias reglas) o de eventos
    -- distintos. Lo necesita el CEP para no contar una accion como dos etapas.
    event_hash      String,
    time            DateTime64(3)   CODEC(Delta, ZSTD),
    detected_at     DateTime64(3)   CODEC(Delta, ZSTD),

    -- Regla que ha disparado
    rule_id         String,
    rule_title      LowCardinality(String),
    rule_level      LowCardinality(String),
    rule_status     LowCardinality(String),

    -- Mapeo ATT&CK (varias por alerta)
    technique_ids   Array(LowCardinality(String)),
    tactic_ids      Array(LowCardinality(String)),

    -- Contexto
    device_hostname LowCardinality(String),
    actor_user_name String,
    actor_process_name String,

    -- Evento de origen
    src_class_uid   UInt32,
    src_type_uid    UInt32,
    src_type_name   LowCardinality(String),
    src_channel     LowCardinality(String),
    src_event_id    UInt32,

    -- Explicabilidad: que condiciones concretas dispararon la deteccion
    matched_fields  String CODEC(ZSTD),

    -- Trazabilidad
    dataset_id      LowCardinality(String),
    detector        LowCardinality(String),

    raw             String CODEC(ZSTD)
)
-- ReplacingMergeTree(detected_at): ante filas con el mismo ORDER BY, conserva la
-- de mayor detected_at (la deteccion mas reciente). Como alert_id es unico por
-- (evento, regla), la tupla de ordenacion identifica la alerta sin ambiguedad.
-- OJO: la deduplicacion ocurre en las fusiones, no en la insercion. Para
-- garantia inmediata, `OPTIMIZE TABLE tfg.alerts FINAL` o consultar con FINAL.
ENGINE = ReplacingMergeTree(detected_at)
PARTITION BY toYYYYMM(time)
ORDER BY (device_hostname, time, alert_id)
SETTINGS index_granularity = 8192;