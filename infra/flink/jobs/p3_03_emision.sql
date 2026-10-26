-- =============================================================================
-- P3 · paso 3 — Emision de las campanas a det.campaigns (esquema comun, OCSF)
-- =============================================================================
-- Igual que p1_08_emision.sql y p2_04_emision.sql, con las etapas de P3. COMO se
-- construye el JSON (y por que asi): cabecera de p2_04_emision.sql.
--
-- Novedad de P3: related_events mezcla ALERTAS (type 'alert') y EVENTOS de
-- PowerShell (type 'event'), porque el descubrimiento es hibrido. Los eventos no
-- llevan tecnica: attacks[] y tactic_names salen solo de las alertas.
--
-- Prerrequisito: det.campaigns sin caducidad (ver p2_04). OJO: repetir este
-- INSERT duplica los mensajes de P3 en el topic.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p3_comun.sql -f /opt/jobs/p3_03_emision.sql
-- =============================================================================

CREATE TEMPORARY VIEW ev_p3 AS
SELECT c.campaign_id, c.host, v.id, v.t_ms, v.etapa, v.fuente, v.detalle, v.nivel
FROM campanas_p3 AS c
JOIN evidencia_p3 AS v
  ON v.dataset = c.dataset AND v.host = c.host AND v.campana = c.campana;

-- Las tecnicas y tacticas de las ALERTAS de cada campana (los eventos no traen)
CREATE TEMPORARY VIEW tec_p3 AS
SELECT DISTINCT e.campaign_id, e.etapa, x.tec
FROM ev_p3 AS e
JOIN alertas_unicas AS a ON a.alert_id = e.id
CROSS JOIN UNNEST(a.tecnicas_arr) AS x (tec)
WHERE e.fuente = 'alerta';

-- -----------------------------------------------------------------------------
-- Etapas: escalada, descubrimiento, persistencia
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW etapas_agg_p3 AS
SELECT campaign_id, etapa,
       MIN(t_ms) AS primero, MAX(t_ms) AS ultimo, COUNT(*) AS n,
       CONCAT('[', LISTAGG(JSON_STRING(id), ','), ']') AS evidencia_json
FROM ev_p3
GROUP BY campaign_id, etapa;

-- Orden: por el segundo de la primera evidencia y, dentro del mismo segundo, por
-- el orden logico de P3, el observado en el plan de apt29 (escalada ->
-- descubrimiento -> persistencia). Regla del esquema comun (26-10).
CREATE TEMPORARY VIEW etapas_orden_p3 AS
SELECT campaign_id, etapa, primero, ultimo, n, evidencia_json,
       ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY segundo, rango, primero) AS orden
FROM (
    SELECT g.*,
           CAST(FLOOR(g.primero / 1000.0) AS BIGINT) AS segundo,
           CASE g.etapa WHEN 'escalada' THEN 1 WHEN 'descubrimiento' THEN 2
                        WHEN 'persistencia' THEN 3 ELSE 9 END AS rango
    FROM etapas_agg_p3 AS g
);

-- Tecnicas de cada etapa, solo las de su familia
CREATE TEMPORARY VIEW tec_etapa_p3 AS
SELECT campaign_id, etapa, CONCAT('[', LISTAGG(JSON_STRING(tec), ','), ']') AS tecnicas_json
FROM tec_p3
WHERE (etapa = 'escalada'       AND REGEXP(tec, '^T(1548|1134|1055|1068)'))
   OR (etapa = 'descubrimiento' AND REGEXP(tec, '^T(1087|1033|1082|1016|1069|1018|1057|1083|1049|1007|1012|1135|1201|1615)'))
   OR (etapa = 'persistencia'   AND REGEXP(tec, '^T(1547|1543|1053|1546|1037|1136)'))
GROUP BY campaign_id, etapa;

CREATE TEMPORARY VIEW etapas_json_p3 AS
SELECT o.campaign_id,
       CONCAT('[', LISTAGG(CONCAT(
           '{"order":', CAST(o.orden AS STRING),
           ',"name":', JSON_STRING(o.etapa),
           ',"first_seen_time":', CAST(o.primero AS STRING),
           ',"last_seen_time":', CAST(o.ultimo AS STRING),
           ',"count":', CAST(o.n AS STRING),
           ',"technique_ids":', COALESCE(t.tecnicas_json, CAST('[]' AS STRING)),
           ',"evidence_uids":', o.evidencia_json,
           '}'), ','), ']') AS stages_json
FROM etapas_orden_p3 AS o
LEFT JOIN tec_etapa_p3 AS t
  ON t.campaign_id = o.campaign_id AND t.etapa = o.etapa
GROUP BY o.campaign_id;

-- -----------------------------------------------------------------------------
-- finding_info: related_events (alertas Y eventos, una vez cada uno), attacks,
-- tacticas
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW relacionados_p3 AS
SELECT campaign_id,
       COUNT(*) AS n_rel,
       MAX(CASE LOWER(nivel) WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                             WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END) AS severidad,
       CONCAT('[', LISTAGG(JSON_OBJECT(
           'uid' VALUE id,
           'type' VALUE CASE WHEN fuente = 'alerta' THEN CAST('alert' AS STRING) ELSE CAST('event' AS STRING) END,
           'title' VALUE detalle,
           'first_seen_time' VALUE t_ms,
           'severity' VALUE nivel), ','), ']') AS rel_json
FROM (SELECT DISTINCT campaign_id, id, fuente, t_ms, detalle, nivel FROM ev_p3)
GROUP BY campaign_id;

CREATE TEMPORARY VIEW ataques_p3 AS
SELECT campaign_id,
       CONCAT('[', LISTAGG(
           CASE WHEN tec LIKE '%.%'
                THEN JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE SPLIT_INDEX(tec, '.', 0)),
                                 'sub_technique' VALUE JSON_OBJECT('uid' VALUE tec))
                ELSE JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE tec))
           END, ','), ']') AS attacks_json
FROM (SELECT DISTINCT campaign_id, tec FROM tec_p3)
GROUP BY campaign_id;

CREATE TEMPORARY VIEW tacticas_p3 AS
SELECT campaign_id, CONCAT('[', LISTAGG(JSON_STRING(tac), ','), ']') AS tacticas_json
FROM (
    SELECT DISTINCT e.campaign_id, x.tac
    FROM ev_p3 AS e
    JOIN alertas_unicas AS a ON a.alert_id = e.id
    CROSS JOIN UNNEST(a.tacticas_arr) AS x (tac)
    WHERE e.fuente = 'alerta'
)
GROUP BY campaign_id;

-- -----------------------------------------------------------------------------
-- Factores de confianza (solo los presentes) y cabeceras
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW factores_p3 AS
SELECT c.*,
       CONCAT('Escalada de privilegios en ', c.host) AS titulo,
       CONCAT('{"escalada":0.40',
              CASE WHEN c.ev_descubrimiento_alerta + c.ev_descubrimiento_ps > 0
                   THEN CAST(',"descubrimiento":0.25' AS STRING) ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_persistencia > 0
                   THEN CAST(',"persistencia":0.25' AS STRING) ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_descubrimiento_alerta > 0
                   THEN CAST(',"descubrimiento_sigma":0.10' AS STRING) ELSE CAST('' AS STRING) END,
              '}') AS factores_json
FROM campanas_p3 AS c;

CREATE TEMPORARY VIEW piezas_p3 AS
SELECT c.campaign_id,
       c.host AS clave,
       JSON_OBJECT(
           'class_uid' VALUE 2004, 'class_name' VALUE 'Detection Finding',
           'category_uid' VALUE 2, 'category_name' VALUE 'Findings',
           'activity_id' VALUE 1, 'activity_name' VALUE 'Create',
           'type_uid' VALUE CAST(200401 AS BIGINT), 'type_name' VALUE 'Detection Finding: Create',
           'time' VALUE c.fin, 'start_time' VALUE c.inicio, 'end_time' VALUE c.fin,
           'duration' VALUE c.fin - c.inicio,
           'severity_id' VALUE r.severidad,
           'confidence_score' VALUE CAST(ROUND(c.confianza * 100, 0) AS INT),
           'confidence_id' VALUE CASE WHEN c.confianza < 0.5 THEN 1 WHEN c.confianza < 0.8 THEN 2 ELSE 3 END,
           'is_alert' VALUE TRUE,
           'message' VALUE c.titulo,
           'metadata' VALUE JSON_OBJECT('version' VALUE '1.5.0',
                                        'product' VALUE JSON_OBJECT('name' VALUE 'tfg-ciberconciencia',
                                                                    'vendor_name' VALUE 'TFG')),
           'resources' VALUE JSON_ARRAY(JSON_OBJECT('name' VALUE c.host, 'type' VALUE 'device'))
       ) AS cab,
       JSON_OBJECT(
           'uid' VALUE c.campaign_id,
           'title' VALUE c.titulo,
           'types' VALUE JSON_ARRAY('campaign'),
           'analytic' VALUE JSON_OBJECT('uid' VALUE 'P3', 'name' VALUE 'P3_discovery_escalation',
                                        'type_id' VALUE 1, 'type' VALUE 'Rule'),
           'first_seen_time' VALUE c.inicio,
           'last_seen_time' VALUE c.fin,
           'related_events_count' VALUE r.n_rel
       ) AS fi_cab,
       JSON_OBJECT(
           'pattern_id' VALUE 'P3',
           'dataset_id' VALUE c.dataset,
           'devices' VALUE JSON_ARRAY(JSON_OBJECT('hostname' VALUE c.host, 'role' VALUE 'host')),
           'metrics' VALUE JSON_OBJECT(
               'transiciones' VALUE c.transiciones,
               'ev_escalada' VALUE c.ev_escalada,
               'ev_descubrimiento_alerta' VALUE c.ev_descubrimiento_alerta,
               'ev_descubrimiento_ps' VALUE c.ev_descubrimiento_ps,
               'ev_persistencia' VALUE c.ev_persistencia)
       ) AS tfg_cab,
       r.rel_json,
       COALESCE(a.attacks_json, CAST('[]' AS STRING))    AS attacks_json,
       COALESCE(t.tacticas_json, CAST('[]' AS STRING))   AS tacticas_json,
       e.stages_json,
       c.factores_json
FROM factores_p3 AS c
JOIN relacionados_p3 AS r ON r.campaign_id = c.campaign_id
JOIN etapas_json_p3  AS e ON e.campaign_id = c.campaign_id
LEFT JOIN ataques_p3  AS a ON a.campaign_id = c.campaign_id
LEFT JOIN tacticas_p3 AS t ON t.campaign_id = c.campaign_id;

CREATE TEMPORARY VIEW documentos_p3 AS
SELECT clave,
       CONCAT(
           SUBSTRING(cab FROM 1 FOR CHAR_LENGTH(cab) - 1),
           ',"finding_info":',
               SUBSTRING(fi_cab FROM 1 FOR CHAR_LENGTH(fi_cab) - 1),
               ',"attacks":', attacks_json,
               ',"related_events":', rel_json,
           '}',
           ',"tfg":',
               SUBSTRING(tfg_cab FROM 1 FOR CHAR_LENGTH(tfg_cab) - 1),
               ',"tactic_names":', tacticas_json,
               ',"stages":', stages_json,
               ',"confidence_factors":', factores_json,
           '}',
           '}') AS documento
FROM piezas_p3;

INSERT INTO det_campaigns
SELECT clave, documento FROM documentos_p3;

-- Comprobacion de lo emitido: campanas_comprobar.sql (solo lee, repetible).
