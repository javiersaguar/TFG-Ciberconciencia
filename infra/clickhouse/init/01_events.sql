CREATE TABLE IF NOT EXISTS tfg.events
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
SETTINGS index_granularity = 8192;