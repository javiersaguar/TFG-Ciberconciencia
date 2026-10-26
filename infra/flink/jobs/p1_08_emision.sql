-- =============================================================================
-- P1 · paso 8 — Emision de las campanas a det.campaigns (esquema comun, OCSF)
-- =============================================================================
-- Igual que p2_04_emision.sql, con las etapas de P1. Sustituye a p1_05: aquel
-- emitia un esquema propio (contadores trans_*, sin stages[]) y leia det.alerts
-- con repetidos. El esquema esta en docs/esquema-campana.md; COMO se construye el
-- JSON (y por que asi), en la cabecera de p2_04_emision.sql.
--
-- Prerrequisito: det.campaigns creado sin caducidad (ver p2_04). P1 y P2 escriben
-- en el mismo topic. OJO: repetir este INSERT duplica los mensajes de P1.
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p1_comun.sql -f /opt/jobs/p1_08_emision.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Evidencia de cada campana, con lo que de cada alerta pide el hallazgo
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW ev_p1 AS
SELECT c.campaign_id, v.alert_id, v.t_ms, v.cred, v.limp, v.lsass, v.util, v.fich,
       a.rule_title, a.rule_level, a.tecnicas_arr, a.tacticas_arr
FROM campanas_p1 AS c
JOIN evidencia_p1 AS v
  ON v.dataset = c.dataset AND v.host = c.host AND v.campana = c.campana
JOIN alertas_unicas AS a
  ON a.alert_id = v.alert_id;

CREATE TEMPORARY VIEW tec_p1 AS
SELECT e.campaign_id, e.cred, e.limp, x.tec
FROM ev_p1 AS e
CROSS JOIN UNNEST(e.tecnicas_arr) AS x (tec);

-- -----------------------------------------------------------------------------
-- Etapas. Una alerta de credenciales va a UNA de las cuatro etapas de T1003
-- (segun el tipo de evento); la limpieza es aparte, y una alerta podria probar
-- las dos.
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW etapa_filas_p1 AS
SELECT campaign_id,
       CASE WHEN lsass = 1 THEN CAST('acceso_lsass' AS STRING)
            WHEN util  = 1 THEN CAST('ejecucion_herramienta' AS STRING)
            WHEN fich  = 1 THEN CAST('volcado_a_disco' AS STRING)
            ELSE CAST('credenciales' AS STRING) END AS etapa,
       t_ms, alert_id AS uid
FROM ev_p1
WHERE cred = 1
UNION ALL
SELECT campaign_id, CAST('limpieza' AS STRING), t_ms, alert_id
FROM ev_p1
WHERE limp = 1;

CREATE TEMPORARY VIEW etapas_agg_p1 AS
SELECT campaign_id, etapa,
       MIN(t_ms) AS primero, MAX(t_ms) AS ultimo, COUNT(*) AS n,
       CONCAT('[', LISTAGG(JSON_STRING(uid), ','), ']') AS evidencia_json
FROM etapa_filas_p1
GROUP BY campaign_id, etapa;

-- Orden: por el segundo de la primera evidencia y, dentro del mismo segundo, por
-- el orden logico de P1 (herramienta -> acceso a LSASS -> volcado ->
-- credenciales -> limpieza). Regla del esquema comun (26-10).
CREATE TEMPORARY VIEW etapas_orden_p1 AS
SELECT campaign_id, etapa, primero, ultimo, n, evidencia_json,
       ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY segundo, rango, primero) AS orden
FROM (
    SELECT g.*,
           CAST(FLOOR(g.primero / 1000.0) AS BIGINT) AS segundo,
           CASE g.etapa WHEN 'ejecucion_herramienta' THEN 1 WHEN 'acceso_lsass' THEN 2
                        WHEN 'volcado_a_disco' THEN 3 WHEN 'credenciales' THEN 4
                        WHEN 'limpieza' THEN 5 ELSE 9 END AS rango
    FROM etapas_agg_p1 AS g
);

-- Tecnicas de cada etapa: T1003.* en las de credenciales, T1070.* en limpieza
CREATE TEMPORARY VIEW tec_etapa_p1 AS
SELECT f.campaign_id, f.etapa, CONCAT('[', LISTAGG(JSON_STRING(f.tec), ','), ']') AS tecnicas_json
FROM (
    SELECT DISTINCT e.campaign_id, e.etapa, t.tec
    FROM etapa_filas_p1 AS e
    JOIN ev_p1 AS v ON v.campaign_id = e.campaign_id AND v.alert_id = e.uid
    CROSS JOIN UNNEST(v.tecnicas_arr) AS t (tec)
    WHERE (e.etapa = 'limpieza' AND t.tec LIKE 'T1070%')
       OR (e.etapa <> 'limpieza' AND t.tec LIKE 'T1003%')
) AS f
GROUP BY f.campaign_id, f.etapa;

CREATE TEMPORARY VIEW etapas_json_p1 AS
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
FROM etapas_orden_p1 AS o
LEFT JOIN tec_etapa_p1 AS t
  ON t.campaign_id = o.campaign_id AND t.etapa = o.etapa
GROUP BY o.campaign_id;

-- -----------------------------------------------------------------------------
-- finding_info: related_events, attacks y tacticas
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW relacionados_p1 AS
SELECT campaign_id,
       COUNT(*) AS n_rel,
       MAX(CASE LOWER(rule_level) WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                                  WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END) AS severidad,
       CONCAT('[', LISTAGG(JSON_OBJECT(
           'uid' VALUE alert_id, 'type' VALUE 'alert', 'title' VALUE rule_title,
           'first_seen_time' VALUE t_ms, 'severity' VALUE rule_level), ','), ']') AS rel_json
FROM ev_p1
GROUP BY campaign_id;

CREATE TEMPORARY VIEW ataques_p1 AS
SELECT campaign_id,
       CONCAT('[', LISTAGG(
           CASE WHEN tec LIKE '%.%'
                THEN JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE SPLIT_INDEX(tec, '.', 0)),
                                 'sub_technique' VALUE JSON_OBJECT('uid' VALUE tec))
                ELSE JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE tec))
           END, ','), ']') AS attacks_json
FROM (SELECT DISTINCT campaign_id, tec FROM tec_p1)
GROUP BY campaign_id;

CREATE TEMPORARY VIEW tacticas_p1 AS
SELECT campaign_id, CONCAT('[', LISTAGG(JSON_STRING(tac), ','), ']') AS tacticas_json
FROM (
    SELECT DISTINCT e.campaign_id, x.tac
    FROM ev_p1 AS e
    CROSS JOIN UNNEST(e.tacticas_arr) AS x (tac)
)
GROUP BY campaign_id;

-- -----------------------------------------------------------------------------
-- Factores de confianza (solo los presentes; pesos de p1_05) y cabeceras
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW factores_p1 AS
SELECT c.*,
       CONCAT('Robo de credenciales en ', c.host) AS titulo,
       CONCAT('{"secuencia":0.40',
              CASE WHEN c.ev_acceso_lsass > 0          THEN CAST(',"acceso_lsass":0.25' AS STRING)          ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_volcado_a_disco > 0       THEN CAST(',"volcado_a_disco":0.20' AS STRING)       ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_ejecucion_herramienta > 0 THEN CAST(',"ejecucion_herramienta":0.10' AS STRING) ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_limpieza > 0              THEN CAST(',"limpieza":0.15' AS STRING)              ELSE CAST('' AS STRING) END,
              '}') AS factores_json
FROM campanas_p1 AS c;

CREATE TEMPORARY VIEW piezas_p1 AS
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
           'analytic' VALUE JSON_OBJECT('uid' VALUE 'P1', 'name' VALUE 'P1_credential_theft',
                                        'type_id' VALUE 1, 'type' VALUE 'Rule'),
           'first_seen_time' VALUE c.inicio,
           'last_seen_time' VALUE c.fin,
           'related_events_count' VALUE r.n_rel
       ) AS fi_cab,
       JSON_OBJECT(
           'pattern_id' VALUE 'P1',
           'dataset_id' VALUE c.dataset,
           'devices' VALUE JSON_ARRAY(JSON_OBJECT('hostname' VALUE c.host, 'role' VALUE 'host')),
           'metrics' VALUE JSON_OBJECT(
               'transiciones' VALUE c.transiciones,
               'evidencias' VALUE c.evidencias,
               'alertas_en_ventana' VALUE c.alertas_en_ventana)
       ) AS tfg_cab,
       r.rel_json,
       COALESCE(a.attacks_json, CAST('[]' AS STRING))    AS attacks_json,
       COALESCE(t.tacticas_json, CAST('[]' AS STRING))   AS tacticas_json,
       e.stages_json,
       c.factores_json
FROM factores_p1 AS c
JOIN relacionados_p1 AS r ON r.campaign_id = c.campaign_id
JOIN etapas_json_p1  AS e ON e.campaign_id = c.campaign_id
LEFT JOIN ataques_p1  AS a ON a.campaign_id = c.campaign_id
LEFT JOIN tacticas_p1 AS t ON t.campaign_id = c.campaign_id;

CREATE TEMPORARY VIEW documentos_p1 AS
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
FROM piezas_p1;

INSERT INTO det_campaigns
SELECT clave, documento FROM documentos_p1;

-- Comprobacion de lo emitido: campanas_comprobar.sql (solo lee, repetible).
