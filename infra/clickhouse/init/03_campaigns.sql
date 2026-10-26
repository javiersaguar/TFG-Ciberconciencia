-- Campañas multi-etapa (salida del Pilar A, CEP en Flink), una fila por campaña.
-- Esquema: docs/esquema-campana.md. El documento completo es un hallazgo OCSF
-- «Detection Finding» (clase 2004) y se guarda tal cual en `documento`; las demás
-- columnas son las que se consultan a menudo, extraídas por pipeline/jobs/sink_campaigns.py.
--
-- En una instalación nueva se crea solo (init). En una existente:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     < infra/clickhouse/init/03_campaigns.sql
CREATE TABLE IF NOT EXISTS tfg.campaigns
(
    -- Identidad determinista: md5(dataset | patrón | clave | inicio en ms).
    -- Reprocesar el corpus da el mismo campaign_id y la tabla sobrescribe.
    campaign_id          String,
    pattern_id           LowCardinality(String),
    dataset_id           LowCardinality(String),
    title                String,

    first_seen           DateTime64(3),
    last_seen            DateTime64(3),
    duration_ms          UInt64,

    -- Gravedad de lo observado (máximo rule_level de la evidencia) y confianza
    -- 0-100 (suma de los factores de tfg.confidence_factors)
    severity_id          UInt8,
    confidence_score     UInt8,

    devices              Array(String),
    technique_ids        Array(LowCardinality(String)),
    tactic_names         Array(LowCardinality(String)),
    -- Nombres de las etapas en su orden (la etapa completa está en `documento`)
    stages               Array(LowCardinality(String)),

    related_events_count UInt32,
    related_event_uids   Array(String),

    -- Versión para ReplacingMergeTree: ante el mismo campaign_id se queda la
    -- última volcada.
    ingested_at          DateTime64(3),

    documento            String CODEC(ZSTD)
)
-- OJO: la deduplicación ocurre en las fusiones, no en la inserción. Para garantía
-- inmediata, consultar con FINAL u `OPTIMIZE TABLE tfg.campaigns FINAL`.
ENGINE = ReplacingMergeTree(ingested_at)
ORDER BY (pattern_id, dataset_id, campaign_id);
