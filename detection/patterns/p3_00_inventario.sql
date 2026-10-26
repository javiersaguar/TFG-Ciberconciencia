-- =============================================================================
-- P3 · paso 0 — Inventario de materia prima (solo lectura)
-- =============================================================================
-- P3 (ROADMAP F3.1): descubrimiento y escalada. El roadmap lo escribio como
-- "rafaga de reconocimiento -> privilegios especiales -> persistencia"; el plan de
-- apt29 day1 lo hace en otro orden: escalada (3.B, bypass de UAC) -> descubrimiento
-- (4.A-4.C) -> persistencia (5.A servicio, 5.B claves Run). Antes de disenar el
-- patron hay que ver que evidencia hay DE VERDAD de cada etapa, y donde:
--
--   * las alertas solo cuentan 2 de `discovery` en todo el dia (03:19:17, SCRANTON),
--     mientras el plan hace descubrimiento en 4.B y 4.C: etapa CIEGA para Sigma;
--   * `persistence` tiene 322 alertas en SCRANTON: hay que ver cuanto es ruido.
--
-- Es la "decision abierta" de F3.2 (fuente de las etapas: solo alertas o hibrido
-- con senales de norm.events), que el roadmap pedia tomar con el inventario delante.
--
-- Uso:
--   docker exec -i clickhouse clickhouse-client --user tfg --password tfg \
--     --multiquery --format PrettyCompactMonoBlock < detection/patterns/p3_00_inventario.sql
-- =============================================================================

-- I1. Alertas de las tres tacticas, por dataset y host: cuantas, cuando y que reglas
SELECT 'I1 alertas por tactica' AS consulta;
SELECT dataset_id, device_hostname AS host, tactica,
       count()                         AS alertas,
       min(time)                       AS primera,
       max(time)                       AS ultima,
       uniqExact(rule_title)           AS reglas,
       topK(3)(rule_title)             AS reglas_principales
FROM tfg.alerts FINAL
ARRAY JOIN tactic_ids AS tactica
WHERE tactica IN ('discovery', 'privilege-escalation', 'persistence')
GROUP BY dataset_id, host, tactica
ORDER BY dataset_id, host, primera;

-- I2. apt29 day1: las reglas de persistencia y escalada, una a una (que es ruido)
SELECT 'I2 reglas de persistencia y escalada en apt29 day1' AS consulta;
SELECT device_hostname AS host,
       arrayStringConcat(arrayFilter(t -> t IN ('persistence', 'privilege-escalation', 'discovery'), tactic_ids), ',') AS tacticas,
       rule_title,
       groupUniqArrayArray(technique_ids) AS tecnicas,
       count()   AS alertas,
       min(time) AS primera,
       max(time) AS ultima
FROM tfg.alerts FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND hasAny(tactic_ids, ['persistence', 'privilege-escalation', 'discovery'])
GROUP BY host, tacticas, rule_title
ORDER BY host, primera;

-- I3. apt29 day1: comandos de descubrimiento lanzados como proceso (Sysmon 1 / 4688),
--     que Sigma no convierte en alerta. Clase OCSF 1007 = Process Activity.
SELECT 'I3 procesos de descubrimiento en apt29 day1' AS consulta;
SELECT device_hostname AS host,
       lower(JSONExtractString(raw, 'process', 'name')) AS binario,
       count()   AS lanzamientos,
       min(time) AS primero,
       max(time) AS ultimo,
       any(substring(JSONExtractString(raw, 'process', 'cmd_line'), 1, 120)) AS ejemplo
FROM tfg.events FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND class_uid = 1007
  AND lower(JSONExtractString(raw, 'process', 'name')) IN (
        'whoami.exe', 'systeminfo.exe', 'tasklist.exe', 'net.exe', 'net1.exe',
        'ipconfig.exe', 'hostname.exe', 'quser.exe', 'qwinsta.exe', 'query.exe',
        'nltest.exe', 'netstat.exe', 'arp.exe', 'route.exe', 'nslookup.exe',
        'wmic.exe', 'sc.exe', 'dsquery.exe', 'klist.exe', 'cmdkey.exe')
GROUP BY host, binario
ORDER BY host, primero;

-- I4. apt29 day1: descubrimiento hecho DESDE PowerShell (4104/4103/800, clase
--     OCSF 1009 = Script Activity). El plan de apt29 descubre con PowerShell
--     (4.B Process Discovery, 4.C File/Dir, Owner/User, System Info).
SELECT 'I4 descubrimiento en PowerShell en apt29 day1' AS consulta;
WITH ['get-process', 'get-wmiobject', 'get-ciminstance', 'win32_operatingsystem',
      'win32_computersystem', 'win32_process', 'get-childitem', 'get-localuser',
      'get-localgroup', 'get-netipaddress', 'get-netadapter', '$env:username',
      '$env:computername', 'whoami', 'get-addomain', 'get-aduser', 'get-netuser',
      'get-netcomputer', 'get-domain', 'get-hotfix'] AS claves
SELECT device_hostname AS host,
       count()   AS bloques,
       min(time) AS primero,
       max(time) AS ultimo,
       groupUniqArrayArray(arrayFilter(k -> position(lower(JSONExtractString(raw, 'script', 'script_content')), k) > 0, claves)) AS indicadores
FROM tfg.events FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND class_uid = 1009
  AND multiSearchAny(lower(JSONExtractString(raw, 'script', 'script_content')), claves)
GROUP BY host
ORDER BY host;

-- I5. apt29 day1: el descubrimiento de I3 + I4 minuto a minuto en SCRANTON y NASHUA,
--     para ver si hay "rafaga" y donde cae respecto a la escalada (02:58) y a la
--     persistencia (5.A/5.B).
SELECT 'I5 descubrimiento por minuto en apt29 day1' AS consulta;
WITH ['get-process', 'get-wmiobject', 'get-ciminstance', 'win32_operatingsystem',
      'win32_computersystem', 'win32_process', 'get-childitem', 'get-localuser',
      'get-localgroup', 'get-netipaddress', 'get-netadapter', '$env:username',
      '$env:computername', 'whoami', 'get-addomain', 'get-aduser', 'get-netuser',
      'get-netcomputer', 'get-domain', 'get-hotfix'] AS claves
SELECT device_hostname AS host,
       toStartOfMinute(time) AS minuto,
       countIf(class_uid = 1007) AS procesos,
       countIf(class_uid = 1009) AS bloques_ps
FROM tfg.events FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND device_hostname IN ('SCRANTON.dmevals.local', 'NASHUA.dmevals.local')
  AND (
        (class_uid = 1007 AND lower(JSONExtractString(raw, 'process', 'name')) IN (
            'whoami.exe', 'systeminfo.exe', 'tasklist.exe', 'net.exe', 'net1.exe',
            'ipconfig.exe', 'hostname.exe', 'quser.exe', 'qwinsta.exe', 'query.exe',
            'nltest.exe', 'netstat.exe', 'arp.exe', 'route.exe', 'nslookup.exe',
            'wmic.exe', 'sc.exe', 'dsquery.exe', 'klist.exe', 'cmdkey.exe'))
     OR (class_uid = 1009 AND multiSearchAny(lower(JSONExtractString(raw, 'script', 'script_content')), claves))
      )
GROUP BY host, minuto
ORDER BY host, minuto;

-- I6. Privilegios especiales (Security 4672, "Authorize Session"): el "privilegios
--     especiales" del roadmap. Cuantos hay y cuantos con SeDebugPrivilege, por host.
SELECT 'I6 privilegios especiales (4672)' AS consulta;
SELECT dataset_id, device_hostname AS host,
       count() AS eventos_4672,
       countIf(JSONExtractBool(raw, 'tfg', 'signal_special_privileges')) AS con_sedebug,
       min(time) AS primero,
       max(time) AS ultimo
FROM tfg.events FINAL
WHERE source_event_id = 4672
GROUP BY dataset_id, host
ORDER BY dataset_id, host;
