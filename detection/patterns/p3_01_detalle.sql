-- =============================================================================
-- P3 · paso 1 — Detalle de la evidencia candidata (solo lectura)
-- =============================================================================
-- El inventario (p3_00_inventario.sql, 26-10-2026) dejo cuatro dudas que hay que
-- cerrar ANTES de definir las etapas de P3:
--
--   D1. La rafaga de route/ipconfig/arp (03:19-03:20) y los 30 `sc.exe config
--       RdAgent` en SCRANTON: ¿atacante o el agente de Azure (RdAgent es el
--       servicio del agente de VM de Azure, que lanza esos comandos)? Lo dice el
--       proceso padre.
--   D2. `Internet Explorer Autorun Keys Modification` salta en el PRIMER segundo de
--       cinco capturas LSASS y en NASHUA: ¿ruido del arranque de la captura? Lo
--       dicen el proceso y la clave tocada (matched_fields).
--   D3. Que tecnicas llevan las reglas de escalada y descubrimiento de las capturas
--       LSASS (Meterpreter getsystem, whoami, systeminfo, cuentas locales): de eso
--       depende definir las etapas POR TECNICA y no por tactica.
--   D4. Los bloques de PowerShell con descubrimiento: ¿son del atacante en
--       SCRANTON? ¿y los 32 de NEWYORK (Get-ADDomain/Get-ADUser), que el plan del
--       dia 1 no ataca? Se ven el proceso, el usuario y el principio del script.
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format PrettyCompactMonoBlock < detection/patterns/p3_01_detalle.sql
-- =============================================================================

-- D1. Padres de los comandos de red y de sc.exe en SCRANTON
SELECT 'D1 padre de route/ipconfig/arp/sc en SCRANTON' AS consulta;
SELECT lower(JSONExtractString(raw, 'process', 'name'))                         AS binario,
       lower(JSONExtractString(raw, 'process', 'parent_process', 'name'))       AS padre,
       substring(JSONExtractString(raw, 'process', 'parent_process', 'cmd_line'), 1, 90) AS cmd_padre,
       JSONExtractString(raw, 'actor', 'user', 'name')                          AS usuario,
       count()   AS lanzamientos,
       min(time) AS primero,
       max(time) AS ultimo
FROM tfg.events FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND device_hostname = 'SCRANTON.dmevals.local'
  AND class_uid = 1007
  AND lower(JSONExtractString(raw, 'process', 'name')) IN ('route.exe', 'ipconfig.exe', 'arp.exe', 'sc.exe')
GROUP BY binario, padre, cmd_padre, usuario
ORDER BY primero;

-- D2. Internet Explorer Autorun Keys Modification: quien escribe que, y cuando
--     respecto al principio de cada captura
SELECT 'D2 IE Autorun Keys: proceso y clave' AS consulta;
SELECT a.dataset_id, a.device_hostname AS host,
       a.actor_process_name AS proceso,
       substring(JSONExtractString(a.matched_fields, 'reg_key.path'), 1, 110) AS clave,
       count()     AS alertas,
       min(a.time) AS primera,
       dateDiff('second', any(p.inicio), min(a.time)) AS seg_desde_inicio_captura
FROM tfg.alerts AS a FINAL
JOIN (SELECT dataset_id, min(time) AS inicio FROM tfg.events FINAL GROUP BY dataset_id) AS p
  ON p.dataset_id = a.dataset_id
WHERE a.rule_title = 'Internet Explorer Autorun Keys Modification'
GROUP BY a.dataset_id, host, proceso, clave
ORDER BY a.dataset_id, primera;

-- D2b. Por si la clave no viene con ese nombre: las claves que traen matched_fields
SELECT 'D2b claves de matched_fields en esa regla' AS consulta;
SELECT DISTINCT arrayJoin(JSONExtractKeys(matched_fields)) AS clave_matched
FROM tfg.alerts FINAL
WHERE rule_title = 'Internet Explorer Autorun Keys Modification';

-- D3. Tecnicas de cada regla con tactica de escalada o descubrimiento (todo el corpus)
SELECT 'D3 tecnicas de las reglas de escalada y descubrimiento' AS consulta;
SELECT rule_title,
       groupUniqArrayArray(technique_ids) AS tecnicas,
       groupUniqArrayArray(tactic_ids)    AS tacticas,
       count()                            AS alertas,
       uniqExact(dataset_id)              AS datasets
FROM tfg.alerts FINAL
WHERE hasAny(tactic_ids, ['privilege-escalation', 'discovery'])
GROUP BY rule_title
ORDER BY datasets DESC, alertas DESC;

-- D4. PowerShell con descubrimiento: proceso, usuario y principio del script
SELECT 'D4 PowerShell con descubrimiento: quien y que' AS consulta;
WITH ['get-process', 'get-wmiobject', 'get-ciminstance', 'win32_operatingsystem',
      'win32_computersystem', 'win32_process', 'get-childitem', 'get-localuser',
      'get-localgroup', '$env:username', '$env:computername', 'whoami',
      'get-addomain', 'get-aduser', 'get-netuser', 'get-netcomputer'] AS claves
SELECT device_hostname AS host,
       time,
       JSONExtractString(raw, 'actor', 'user', 'name') AS usuario,
       actor_process_name AS proceso,
       arrayFilter(k -> position(lower(JSONExtractString(raw, 'script', 'script_content')), k) > 0, claves) AS indicadores,
       replaceRegexpAll(substring(JSONExtractString(raw, 'script', 'script_content'), 1, 110), '\\s+', ' ') AS inicio_script
FROM tfg.events FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND class_uid = 1009
  AND multiSearchAny(lower(JSONExtractString(raw, 'script', 'script_content')), claves)
ORDER BY host, time
LIMIT 70;
