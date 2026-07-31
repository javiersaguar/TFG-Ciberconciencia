CREATE TABLE IF NOT EXISTS tfg.alerts
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