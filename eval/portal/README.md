# Exportaciones para el portal (F8)

Datos **medidos** que el portal necesita y que no estaban en ningún fichero del repositorio. Salen de ClickHouse
(corpus reproducible de F3, tras la recarga del 11-09 y la detección del 14-09) y del catálogo oficial de MITRE
ATT&CK. Se generaron el **21-10-2026**. El portal no los lee directamente: `frontend/scripts/sincronizar-datos.mjs`
los copia a `frontend/src/api/datos/` con su huella.

Comprobación previa: `tfg.events FINAL` = **530.401** filas y `tfg.alerts FINAL` = **1.184**, las cifras documentadas.

| Fichero | Filas | Qué es | Comprobación |
|---|---:|---|---|
| `alertas-apt29-day1.jsonl` | 741 | Las alertas Sigma de APT29 day1, una a una (hora del evento, regla, nivel, técnicas, tácticas, host, usuario, proceso) | 741, la cifra documentada. Niveles: medium 413, high 263, low 55, informational 10 |
| `aristas-p2.jsonl` | 17 | Conexiones Sysmon EID 3 salientes hacia NASHUA (10.0.1.6) en 135/445/5985: las aristas de P2 | 5985 ×4, 445 ×8, 135 ×5; de 03:09:23.801 a 03:17:59.493, como en la bitácora (14-09) |
| `p1-campanas.jsonl` | 11 | Vista `tfg.p1_campanas` (oráculo de P1) con host, ventana, alertas absorbidas, etapas y confianza | 11 campañas; 7 de 7 variantes LSASS |
| `p2-campanas.jsonl` | 1 | Vista `tfg.p2_campanas` (oráculo de P2) | SCRANTON → NASHUA, 17 aristas, 516 s, confianza 1,0 |
| `tecnicas-observadas.jsonl` | 47 | Técnicas ATT&CK con al menos una alerta en el corpus **actual** (alertas, reglas y datasets por técnica) | Sustituye a la capa observada de `eval/attack-coverage/` (28-07, solo apt29 + atómico: 34 técnicas) |
| `attack-catalogo-v19.json` | 15 + 697 | Extracto de ATT&CK Enterprise **v19**: tácticas en orden de matriz y técnicas no revocadas ni obsoletas (nombre, tácticas, subtécnica, padre) | Contiene las 300 técnicas potenciales y las 47 observadas. Origen y SHA-256 dentro del fichero |

Hallazgos al generarlas:

- **Confianza de las campañas P1 de apt29** (antes no documentada): SCRANTON 02:56 = 0,85; NASHUA = 0,80;
  SCRANTON 03:10 = 0,65.
- **T1685 verificado** (pendiente desde el 27-07): existe en ATT&CK v19 como *Disable or Modify Tools*, táctica
  `defense-impairment`; T1685.001 es *Disable or Modify Windows Event Log*.
- La consulta 2 tal como estaba en `frontend/README.md` fallaba: el alias `dst_ip` de `IPv6NumToString(dst_ip)`
  sombreaba la columna en el `WHERE` (el mismo error de sombreado documentado el 11-09). Corregida abajo.

## Cómo se regeneran

Con ClickHouse levantado (`docker compose -f infra/docker-compose.yml --profile store up -d clickhouse`), desde la
raíz del repositorio:

```bash
CH="docker exec clickhouse clickhouse-client --user tfg --password tfg --query"

$CH "SELECT alert_id, event_hash, toString(time) AS hora, rule_title, rule_level, technique_ids, tactic_ids,
     device_hostname, actor_user_name, actor_process_name, src_event_id
     FROM tfg.alerts FINAL WHERE dataset_id = 'SDWIN-200501225525' ORDER BY time FORMAT JSONEachRow" \
  > eval/portal/alertas-apt29-day1.jsonl

$CH "SELECT toString(time) AS hora, device_hostname, actor_process_name, actor_user_name,
     IPv6NumToString(src_ip) AS ip_origen, IPv6NumToString(dst_ip) AS ip_destino, dst_port
     FROM tfg.events FINAL
     WHERE dataset_id = 'SDWIN-200501225525' AND source_event_id = 3 AND direction_id = 2
       AND dst_ip = toIPv6('10.0.1.6') AND dst_port IN (135, 445, 5985)
     ORDER BY time FORMAT JSONEachRow" > eval/portal/aristas-p2.jsonl

$CH "SELECT * EXCEPT (reglas_del_ancla, ids_absorbidos) FROM tfg.p1_campanas ORDER BY dataset, inicio
     FORMAT JSONEachRow" > eval/portal/p1-campanas.jsonl

$CH "SELECT * FROM tfg.p2_campanas ORDER BY dataset, first_seen FORMAT JSONEachRow" > eval/portal/p2-campanas.jsonl

$CH "SELECT t AS technique_id, count() AS alertas, uniqExact(rule_id) AS reglas, groupUniqArray(dataset_id) AS datasets
     FROM (SELECT arrayJoin(technique_ids) AS t, rule_id, dataset_id FROM tfg.alerts FINAL)
     GROUP BY t ORDER BY alertas DESC FORMAT JSONEachRow" > eval/portal/tecnicas-observadas.jsonl
```

El catálogo se extrajo de
`https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-19.0.json`
(52 MB, no se versiona) quedándose con las tácticas de la matriz Enterprise y los objetos `attack-pattern` sin
`revoked` ni `x_mitre_deprecated`. Se usa la v19 y no la v20 (publicada el 13-10-2026) porque es la que usan el
cargador de reglas y las capas Navigator del proyecto.
