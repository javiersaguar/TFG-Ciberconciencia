CREATE TABLE IF NOT EXISTS tfg.alerts
(
    -- Identificacion y tiempo
    alert_id        String,
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
ENGINE = MergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (device_hostname, time, rule_title)
SETTINGS index_granularity = 8192;