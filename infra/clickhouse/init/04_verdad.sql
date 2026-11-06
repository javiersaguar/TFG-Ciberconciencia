-- Verdad conocida por dataset (cierre de F3, 06-11-2026): qué patrones DEBERÍAN
-- disparar en cada dataset del corpus y en cada captura atómica de OTRF.
-- Se genera con detection/evaluation/verdad_conocida.py -> verdad_datasets.csv
-- y se carga (o recarga) con:
--   docker exec clickhouse clickhouse-client --user tfg --password tfg --query "TRUNCATE TABLE tfg.verdad_datasets"
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --query "INSERT INTO tfg.verdad_datasets FORMAT CSVWithNames" < detection/evaluation/verdad_datasets.csv
CREATE TABLE IF NOT EXISTS tfg.verdad_datasets
(
    dataset_id   String,
    origen       LowCardinality(String),   -- corpus | atomico
    titulo       String,
    tecnicas     String,                   -- separadas por |
    tacticas     String,                   -- separadas por |
    verdad       LowCardinality(String),   -- completa | parcial (atómico sin ficha)
    p1_esperado  UInt8,
    p2_esperado  UInt8,
    p3_esperado  UInt8
)
ENGINE = ReplacingMergeTree
ORDER BY dataset_id;
