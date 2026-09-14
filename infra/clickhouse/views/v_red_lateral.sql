-- =============================================================================
-- Vistas de apoyo para la visualizacion del movimiento lateral
-- =============================================================================
-- Extraen de tfg.events la misma arista dirigida que usa P2
-- (detection/patterns/p2_lateral_movement.sql), pero sin exigir evidencia de
-- ejecucion en el destino: aqui interesa DIBUJAR la red, no decidir si hay
-- campana. Se separan en una vista para no repetir el CTE en cada panel de
-- Grafana y para que el dashboard no lleve logica escondida.
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery < infra/clickhouse/views/v_red_lateral.sql
-- =============================================================================

-- Mapa IP -> host, derivado de los propios datos. En un registro SALIENTE
-- (direction_id = 2) la IP de origen es por definicion la del host que lo
-- emite. La cara entrante NO sirve: un host puede registrar una conexion
-- saliente con Initiated=false y entonces dst_ip es el host remoto (medido el
-- 09-09-2026: 70 votos espurios de NEWYORK sobre la IP de SCRANTON).
-- OJO CON EL SOMBREADO DE ALIAS (ya nos mordio en p2_lateral_movement.sql):
-- escribir `max(votos) AS votos` bautiza el agregado con el nombre de la
-- columna de origen, y entonces el `votos` de argMax(h, votos) resuelve al
-- agregado en vez de a la columna. ClickHouse lo rechaza como agregacion
-- anidada (ILLEGAL_AGGREGATION). Por eso los agregados llevan nombre propio en
-- la subconsulta y se renombran fuera.
CREATE OR REPLACE VIEW tfg.v_mapa_ip AS
SELECT dataset_id, ip, host_top AS host, votos_top AS votos
FROM (
    SELECT dataset_id, ip,
           argMax(h, votos) AS host_top,
           max(votos)       AS votos_top
    FROM (
        SELECT dataset_id, src_ip AS ip, device_hostname AS h, count() AS votos
        -- FINAL: las vistas son logica de analisis y no deben depender de si
        -- ClickHouse ya ha fusionado los duplicados. Sin el, tras volcar el
        -- corpus dos veces esta vista dio 65 conexiones laterales en vez de 39.
        FROM tfg.events FINAL
        WHERE source_event_id = 3 AND direction_id = 2 AND src_ip IS NOT NULL
          -- Fuera las direcciones que NO identifican a una maquina de la red.
          -- Sin esto, `::1` recibe votos de todos los hosts, argMax se lo
          -- adjudica al que mas trafico local genera -el controlador de
          -- dominio- y el bucle local de cualquier maquina se convierte en una
          -- arista falsa hacia el DC. Medido: aparecian 2 conexiones WinRM
          -- SCRANTON -> NEWYORK que en realidad eran SCRANTON contra si mismo.
          -- El ifNull es obligatorio: isIPAddressInRange exige String NO
          -- nullable y IPv6NumToString propaga el Nullable de la columna.
          AND src_ip != toIPv6('::1')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(src_ip), '^::ffff:', ''), '::'), '127.0.0.0/8')
          AND NOT isIPAddressInRange(ifNull(IPv6NumToString(src_ip), '::'), 'fe80::/10')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(src_ip), '^::ffff:', ''), '::'), '169.254.0.0/16')
          AND NOT isIPAddressInRange(ifNull(replaceRegexpOne(IPv6NumToString(src_ip), '^::ffff:', ''), '::'), '224.0.0.0/4')
        GROUP BY dataset_id, ip, h
    )
    GROUP BY dataset_id, ip
)
WHERE votos_top >= 3;

-- Aristas dirigidas host -> host en puertos de administracion remota.
--   135 RPC/DCOM · 139/445 SMB · 3389 RDP · 5900 VNC · 5985/5986 WinRM · 22 SSH
CREATE OR REPLACE VIEW tfg.v_aristas_lateral AS
SELECT
    e.dataset_id                                   AS dataset,
    e.device_hostname                              AS origen,
    m.host                                         AS destino,
    e.dst_port                                     AS puerto,
    multiIf(e.dst_port IN (5985, 5986), 'WinRM',
            e.dst_port IN (139, 445),   'SMB',
            e.dst_port = 135,           'RPC/DCOM',
            e.dst_port = 3389,          'RDP',
            e.dst_port = 5900,          'VNC',
            e.dst_port = 22,            'SSH',
            'otro')                                AS servicio,
    e.actor_process_name                           AS proceso,
    e.actor_user_name                              AS usuario,
    e.time                                         AS momento
FROM tfg.events AS e FINAL
INNER JOIN tfg.v_mapa_ip AS m
        ON m.dataset_id = e.dataset_id AND m.ip = e.dst_ip
WHERE e.source_event_id = 3
  AND e.direction_id = 2
  AND e.dst_port IN (135, 139, 445, 3389, 5900, 5985, 5986, 22)
  AND m.host != e.device_hostname
  -- Y por si el mapa resolviera igualmente una direccion local: una conexion
  -- cuyo origen y destino son la misma IP nunca es movimiento lateral.
  AND e.src_ip != e.dst_ip;
