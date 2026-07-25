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
    dst_ip              Nullable(IPv4),
    dst_port            Nullable(UInt16),

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

    -- Evento OCSF completo (flexibilidad total)
    raw              String CODEC(ZSTD)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (device_hostname, time)
SETTINGS index_granularity = 8192;