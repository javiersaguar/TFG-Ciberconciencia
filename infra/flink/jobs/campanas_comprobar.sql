-- =============================================================================
-- Comprobacion de det.campaigns: lo emitido, leido de vuelta (todos los patrones)
-- =============================================================================
-- Solo lee: se puede repetir cuantas veces haga falta. Usa la tabla det_campaigns
-- del fichero de inicio de cualquier patron (p1_comun.sql o p2_comun.sql).
--
--   docker exec -it flink-jobmanager ./bin/sql-client.sh \
--     -i /opt/jobs/p2_comun.sql -f /opt/jobs/campanas_comprobar.sql
--
-- LISTAGG no garantiza el orden de las listas: el orden de cada etapa es su
-- campo `order`, no su posicion. Se muestran orden y nombre de cada posicion.
--
-- Esperado para P2 (apt29 day1): 1 documento, JSON valido, campaign_id
-- 07c1426c17179d180b24073e097edfdc, confianza 100, 8 related_events, 4 etapas:
-- conexion_lateral (1), ejecucion_remota (2), credenciales (3), servicio (4).
-- (Sin la regla del segundo + orden logico, la ejecucion remota salia primera:
-- su primera evidencia es la sesion WinRM de las 03:09:23.000, con hora de
-- resolucion de segundo, 0,8 s antes de la primera arista, 03:09:23.801.)
-- =============================================================================

-- C1. Cuantos documentos hay por patron, y si son JSON valido.
--     Si `mensajes` supera a `campanas`, se ha emitido dos veces (el sink a
--     ClickHouse lo absorbe por campaign_id, pero conviene saberlo).
SELECT JSON_VALUE(documento, '$.tfg.pattern_id')                     AS patron,
       COUNT(*)                                                      AS mensajes,
       COUNT(DISTINCT JSON_VALUE(documento, '$.finding_info.uid'))   AS campanas,
       SUM(CASE WHEN documento IS JSON THEN 1 ELSE 0 END)            AS json_validos
FROM det_campaigns
GROUP BY JSON_VALUE(documento, '$.tfg.pattern_id');

-- C2. Cada campana: identidad, confianza, gravedad, evidencia y etapas.
SELECT JSON_VALUE(documento, '$.tfg.pattern_id')                     AS patron,
       JSON_VALUE(documento, '$.tfg.dataset_id')                     AS dataset,
       JSON_VALUE(documento, '$.finding_info.uid')                   AS campaign_id,
       JSON_VALUE(documento, '$.confidence_score')                   AS confianza,
       JSON_VALUE(documento, '$.severity_id')                        AS gravedad,
       JSON_VALUE(documento, '$.finding_info.related_events_count')  AS relacionados,
       CONCAT_WS(' | ',
           CONCAT(JSON_VALUE(documento, '$.tfg.stages[0].order'), ' ', JSON_VALUE(documento, '$.tfg.stages[0].name')),
           CONCAT(JSON_VALUE(documento, '$.tfg.stages[1].order'), ' ', JSON_VALUE(documento, '$.tfg.stages[1].name')),
           CONCAT(JSON_VALUE(documento, '$.tfg.stages[2].order'), ' ', JSON_VALUE(documento, '$.tfg.stages[2].name')),
           CONCAT(JSON_VALUE(documento, '$.tfg.stages[3].order'), ' ', JSON_VALUE(documento, '$.tfg.stages[3].name')),
           CONCAT(JSON_VALUE(documento, '$.tfg.stages[4].order'), ' ', JSON_VALUE(documento, '$.tfg.stages[4].name'))
       )                                                             AS etapas_por_posicion,
       CHAR_LENGTH(documento)                                        AS longitud
FROM det_campaigns
ORDER BY patron, dataset, campaign_id;
