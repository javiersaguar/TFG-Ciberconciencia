-- =============================================================================
-- P2 · paso 4 — Emision de las campanas a det.campaigns (esquema comun, OCSF)
-- =============================================================================
-- Publica cada campana de campanas_p2 (p2_comun.sql, validada en p2_03) como un
-- hallazgo OCSF 1.5.0 «Detection Finding» con extension tfg.*. El esquema esta en
-- docs/esquema-campana.md. pipeline/jobs/sink_campaigns.py lo valida y lo vuelca a
-- tfg.campaigns.
--
-- COMO SE CONSTRUYE EL JSON (y por que asi):
--   * JSON_OBJECT/JSON_ARRAY anidan otro objeto JSON solo si se llama DENTRO de
--     la misma expresion; si el objeto llega de una subconsulta (como columna),
--     Flink lo inserta como TEXTO entrecomillado. Las etapas y las listas
--     necesitan dos niveles de agregacion, asi que:
--       - los objetos sin listas se construyen con JSON_OBJECT (escalares y
--         objetos anidados en la misma llamada);
--       - las listas se encadenan con LISTAGG(..., ',') entre '[' y ']';
--       - el documento final se compone con CONCAT, quitando la '}' final de
--         cada cabecera JSON_OBJECT y anadiendo las listas como fragmentos.
--     Las cadenas sueltas pasan por JSON_STRING, que las escapa.
--   * Los literales de texto van como CAST(... AS STRING): en un CASE o un UNION,
--     literales de distinta longitud se unifican a CHAR(n) y se rellenan con
--     espacios.
--   El sink valida cada documento (JSON bien formado, clase 2004, confianza =
--   suma de factores, etapas 1..n con su evidencia...) y se detiene si alguno no
--   cumple, asi que un error aqui no llega a la tabla en silencio.
--
-- Prerrequisito: el topic, sin caducidad (recrearlo si ya existia):
--   docker exec redpanda rpk topic delete det.campaigns
--   docker exec redpanda rpk topic create det.campaigns -p 3 -c retention.ms=-1
-- OJO: repetir este INSERT duplica los mensajes del topic (la tabla de ClickHouse
-- los absorbe por campaign_id, pero la comprobacion de abajo los veria).
--
-- Uso:
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/p2_04_emision.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Evidencia de cada campana, con lo que de cada alerta pide el hallazgo
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW ev_p2 AS
SELECT c.campaign_id, v.id AS alert_id, v.t_ms, v.remota, v.servicio, v.cred,
       a.rule_title, a.rule_level, a.tecnicas_arr, a.tacticas_arr
FROM campanas_p2 AS c
JOIN evidencia_en_sesion AS v
  ON v.dataset = c.dataset AND v.origen = c.origen AND v.destino = c.destino AND v.sesion = c.sesion
JOIN alertas_unicas AS a
  ON a.alert_id = v.id;

-- Una fila por tecnica observada en la evidencia
CREATE TEMPORARY VIEW tec_p2 AS
SELECT e.campaign_id, e.remota, e.servicio, e.cred, x.tec
FROM ev_p2 AS e
CROSS JOIN UNNEST(e.tecnicas_arr) AS x (tec);

-- -----------------------------------------------------------------------------
-- Etapas: conexion_lateral (las aristas) + ejecucion_remota, servicio y
-- credenciales (alertas en el destino). Una alerta puede probar dos etapas.
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW etapa_filas_p2 AS
SELECT c.campaign_id, CAST('conexion_lateral' AS STRING) AS etapa, a.t_ms, a.id AS uid
FROM campanas_p2 AS c
JOIN aristas_sesion AS a
  ON a.dataset = c.dataset AND a.origen = c.origen AND a.destino = c.destino AND a.sesion = c.sesion
UNION ALL
SELECT campaign_id, CAST('ejecucion_remota' AS STRING), t_ms, alert_id FROM ev_p2 WHERE remota = 1
UNION ALL
SELECT campaign_id, CAST('servicio' AS STRING), t_ms, alert_id FROM ev_p2 WHERE servicio = 1
UNION ALL
SELECT campaign_id, CAST('credenciales' AS STRING), t_ms, alert_id FROM ev_p2 WHERE cred = 1;

CREATE TEMPORARY VIEW etapas_agg_p2 AS
SELECT campaign_id, etapa,
       MIN(t_ms) AS primero, MAX(t_ms) AS ultimo, COUNT(*) AS n,
       CONCAT('[', LISTAGG(JSON_STRING(uid), ','), ']') AS evidencia_json
FROM etapa_filas_p2
GROUP BY campaign_id, etapa;

-- El orden de cada etapa (lo que OCSF no trae), regla del esquema comun (26-10):
-- por el SEGUNDO de su primera evidencia y, dentro del mismo segundo, por el
-- orden logico del patron. Las horas de Security/PowerShell se reconstruyen con
-- resolucion de segundo, asi que dentro de un segundo el reloj no ordena: sin
-- esta regla, la sesion WinRM de las 03:09:23.000 ponia la ejecucion remota
-- ANTES que la conexion de las 03:09:23.801 que la origina.
-- Orden logico de P2: conexion -> ejecucion remota -> servicio -> credenciales.
CREATE TEMPORARY VIEW etapas_orden_p2 AS
SELECT campaign_id, etapa, primero, ultimo, n, evidencia_json,
       ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY segundo, rango, primero) AS orden
FROM (
    SELECT g.*,
           CAST(FLOOR(g.primero / 1000.0) AS BIGINT) AS segundo,
           CASE g.etapa WHEN 'conexion_lateral' THEN 1 WHEN 'ejecucion_remota' THEN 2
                        WHEN 'servicio' THEN 3 WHEN 'credenciales' THEN 4 ELSE 9 END AS rango
    FROM etapas_agg_p2 AS g
);

-- Tecnicas de cada etapa, solo las de su familia (ejecucion remota: T1021.*...)
CREATE TEMPORARY VIEW tec_etapa_p2 AS
SELECT campaign_id, etapa, CONCAT('[', LISTAGG(JSON_STRING(tec), ','), ']') AS tecnicas_json
FROM (
    SELECT DISTINCT campaign_id, CAST('ejecucion_remota' AS STRING) AS etapa, tec
    FROM tec_p2 WHERE remota = 1 AND tec LIKE 'T1021%'
    UNION ALL
    SELECT DISTINCT campaign_id, CAST('servicio' AS STRING), tec
    FROM tec_p2 WHERE servicio = 1 AND tec = 'T1569.002'
    UNION ALL
    SELECT DISTINCT campaign_id, CAST('credenciales' AS STRING), tec
    FROM tec_p2 WHERE cred = 1 AND tec LIKE 'T1003%'
)
GROUP BY campaign_id, etapa;

CREATE TEMPORARY VIEW etapas_json_p2 AS
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
FROM etapas_orden_p2 AS o
LEFT JOIN tec_etapa_p2 AS t
  ON t.campaign_id = o.campaign_id AND t.etapa = o.etapa
GROUP BY o.campaign_id;

-- -----------------------------------------------------------------------------
-- finding_info: related_events (las alertas), attacks (tecnicas) y tacticas
-- -----------------------------------------------------------------------------
-- severity_id = maximo rule_level de la evidencia: la gravedad de lo OBSERVADO.
CREATE TEMPORARY VIEW relacionados_p2 AS
SELECT campaign_id,
       COUNT(*) AS n_rel,
       MAX(CASE LOWER(rule_level) WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                                  WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END) AS severidad,
       CONCAT('[', LISTAGG(JSON_OBJECT(
           'uid' VALUE alert_id, 'type' VALUE 'alert', 'title' VALUE rule_title,
           'first_seen_time' VALUE t_ms, 'severity' VALUE rule_level), ','), ']') AS rel_json
FROM ev_p2
GROUP BY campaign_id;

-- attacks[]: tecnica y, si la hay, subtecnica. SIN tactica: las alertas traen
-- tecnicas y tacticas en listas separadas, sin emparejar (van en tactic_names).
CREATE TEMPORARY VIEW ataques_p2 AS
SELECT campaign_id,
       CONCAT('[', LISTAGG(
           CASE WHEN tec LIKE '%.%'
                THEN JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE SPLIT_INDEX(tec, '.', 0)),
                                 'sub_technique' VALUE JSON_OBJECT('uid' VALUE tec))
                ELSE JSON_OBJECT('technique' VALUE JSON_OBJECT('uid' VALUE tec))
           END, ','), ']') AS attacks_json
FROM (SELECT DISTINCT campaign_id, tec FROM tec_p2)
GROUP BY campaign_id;

CREATE TEMPORARY VIEW tacticas_p2 AS
SELECT campaign_id, CONCAT('[', LISTAGG(JSON_STRING(tac), ','), ']') AS tacticas_json
FROM (
    SELECT DISTINCT e.campaign_id, x.tac
    FROM ev_p2 AS e
    CROSS JOIN UNNEST(e.tacticas_arr) AS x (tac)
)
GROUP BY campaign_id;

-- -----------------------------------------------------------------------------
-- Confianza descompuesta (mismos pesos que el oraculo) y cabeceras
-- -----------------------------------------------------------------------------
CREATE TEMPORARY VIEW confianza_p2 AS
SELECT c.*,
       CONCAT('Movimiento lateral ', c.origen, ' -> ', c.destino) AS titulo,
       LEAST(1.0,
             0.30
           + CASE WHEN c.bilateral = 1           THEN 0.15 ELSE 0.0 END
           + CASE WHEN c.proceso_interactivo = 1 THEN 0.10 ELSE 0.0 END
           + CASE WHEN c.ev_ejecucion_remota > 0 THEN 0.20 ELSE 0.0 END
           + CASE WHEN c.ev_servicio > 0         THEN 0.15 ELSE 0.0 END
           + CASE WHEN c.ev_credenciales > 0     THEN 0.10 ELSE 0.0 END) AS confianza,
       -- solo los factores PRESENTES; su suma es la confianza
       CONCAT('{"arista":0.30',
              CASE WHEN c.bilateral = 1           THEN CAST(',"bilateral":0.15' AS STRING)           ELSE CAST('' AS STRING) END,
              CASE WHEN c.proceso_interactivo = 1 THEN CAST(',"proceso_interactivo":0.10' AS STRING) ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_ejecucion_remota > 0 THEN CAST(',"ejecucion_remota":0.20' AS STRING)    ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_servicio > 0         THEN CAST(',"servicio":0.15' AS STRING)            ELSE CAST('' AS STRING) END,
              CASE WHEN c.ev_credenciales > 0     THEN CAST(',"credenciales":0.10' AS STRING)        ELSE CAST('' AS STRING) END,
              '}') AS factores_json
FROM campanas_p2 AS c;

CREATE TEMPORARY VIEW piezas_p2 AS
SELECT c.campaign_id,
       c.destino AS clave,
       -- Cabecera del hallazgo: solo escalares y objetos construidos aqui mismo
       JSON_OBJECT(
           'class_uid' VALUE 2004, 'class_name' VALUE 'Detection Finding',
           'category_uid' VALUE 2, 'category_name' VALUE 'Findings',
           'activity_id' VALUE 1, 'activity_name' VALUE 'Create',
           'type_uid' VALUE CAST(200401 AS BIGINT), 'type_name' VALUE 'Detection Finding: Create',
           -- time = fin de la campana, no la hora de emision: reprocesar da el mismo documento
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
           'resources' VALUE JSON_ARRAY(JSON_OBJECT('name' VALUE c.origen, 'type' VALUE 'device'),
                                        JSON_OBJECT('name' VALUE c.destino, 'type' VALUE 'device'))
       ) AS cab,
       JSON_OBJECT(
           'uid' VALUE c.campaign_id,
           'title' VALUE c.titulo,
           'types' VALUE JSON_ARRAY('campaign'),
           'analytic' VALUE JSON_OBJECT('uid' VALUE 'P2', 'name' VALUE 'P2_lateral_movement',
                                        'type_id' VALUE 1, 'type' VALUE 'Rule'),
           'first_seen_time' VALUE c.inicio,
           'last_seen_time' VALUE c.fin,
           'related_events_count' VALUE r.n_rel
       ) AS fi_cab,
       JSON_OBJECT(
           'pattern_id' VALUE 'P2',
           'dataset_id' VALUE c.dataset,
           'devices' VALUE JSON_ARRAY(JSON_OBJECT('hostname' VALUE c.origen, 'role' VALUE 'origen'),
                                      JSON_OBJECT('hostname' VALUE c.destino, 'role' VALUE 'destino')),
           'metrics' VALUE JSON_OBJECT(
               'aristas' VALUE c.n_aristas,
               'puertos' VALUE c.puertos,
               'bilateral' VALUE c.bilateral,
               'proceso_interactivo' VALUE c.proceso_interactivo,
               'transiciones' VALUE c.transiciones,
               'alertas_absorbidas' VALUE c.alertas_absorbidas,
               'evidencias' VALUE c.evidencia_p2,
               'evidencias_tras_arista' VALUE c.evidencias_tras_arista,
               'retraso_max_ms' VALUE c.retraso_max_ms)
       ) AS tfg_cab,
       r.rel_json,
       COALESCE(a.attacks_json, CAST('[]' AS STRING))    AS attacks_json,
       COALESCE(t.tacticas_json, CAST('[]' AS STRING))   AS tacticas_json,
       e.stages_json,
       c.factores_json
FROM confianza_p2 AS c
JOIN relacionados_p2 AS r ON r.campaign_id = c.campaign_id
JOIN etapas_json_p2  AS e ON e.campaign_id = c.campaign_id
LEFT JOIN ataques_p2  AS a ON a.campaign_id = c.campaign_id
LEFT JOIN tacticas_p2 AS t ON t.campaign_id = c.campaign_id;

-- El documento: cada cabecera sin su '}' final, mas sus listas, mas el cierre.
CREATE TEMPORARY VIEW documentos_p2 AS
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
FROM piezas_p2;

-- -----------------------------------------------------------------------------
-- Emision
-- -----------------------------------------------------------------------------
INSERT INTO det_campaigns
SELECT clave, documento FROM documentos_p2;

-- La comprobacion de lo emitido va aparte (campanas_comprobar.sql), para poder
-- repetirla sin volver a emitir: repetir este fichero duplica el topic.
