# Esquema común de campaña

Fecha: 26-10-2026. Decisión de Javier tomada ese mismo día.

Una **campaña** es la salida del Pilar A: varias alertas y eventos que el CEP reconoce como
**un mismo ataque en varias etapas**. Todos los patrones (P1, P2 y los que vengan) la emiten
con el **mismo esquema**. Ese esquema es lo que consumen el grafo de ataque (F5), la
priorización (F6), la API y el portal.

## Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Formato | **Hallazgo OCSF 1.5.0 «Detection Finding»** (`class_uid` 2004), con extensión `tfg.*` | El esquema canónico del proyecto es OCSF; sería incoherente inventar uno justo en la salida. Va en el estándar todo lo que el estándar tiene, y en la extensión documentada lo que no (el orden de las etapas, los factores de confianza y las métricas de cada patrón). |
| Etapa | **Etapa lógica del patrón**, con sus alertas como evidencia | El grafo y el portal necesitan pocas etapas con significado («ejecución remota», «servicio»), no una por alerta. |
| Destino | Topic **`det.campaigns`** (sin caducidad) y tabla **`tfg.campaigns`** en ClickHouse | Como las alertas: el bus para lo que viene detrás, y la tabla para consultar y para compararla con el oráculo. |

## Identidad

```
campaign_id = md5(dataset_id | pattern_id | clave | first_seen_ms)
```

- `clave` es el host en P1 y `origen->destino` en P2.
- `first_seen_ms` es el epoch en milisegundos del inicio de la campaña.
- Es determinista: reprocesar el corpus produce los mismos identificadores, y la tabla
  (ReplacingMergeTree) sobrescribe en lugar de duplicar.
- P2 ya usaba exactamente esta fórmula, así que sus identificadores no cambian
  (`07c1426c17179d180b24073e097edfdc`).
- La de P1 en Flink era distinta (`md5(dataset|host|ms)`), y ningún consumidor dependía de
  ella todavía.

## Campos

### Del estándar OCSF (Detection Finding)

| Campo | Valor | Notas |
|---|---|---|
| `class_uid` · `category_uid` · `activity_id` · `type_uid` | 2004 · 2 · 1 (Create) · 200401 | Más sus nombres (`class_name`, …) |
| `time` | = `end_time` | Determinista: no se usa la hora de emisión, para que reprocesar dé el mismo documento |
| `start_time` · `end_time` · `duration` | epoch ms · epoch ms · ms | Inicio y fin de la campaña (ver «Extensión» abajo) |
| `severity_id` | Máximo `rule_level` de su evidencia | critical 5 · high 4 · medium 3 · low 2 · resto 1. Es la gravedad de lo **observado**; priorizar es tarea de F6 |
| `confidence_score` · `confidence_id` | 0–100 · 1/2/3 | Suma de los factores de `tfg.confidence_factors` × 100. `confidence_id`: < 50 Baja, < 80 Media, resto Alta |
| `is_alert` | `true` | |
| `message` | El título | |
| `metadata.version` · `metadata.product` | `1.5.0` · `tfg-ciberconciencia` | Igual que los eventos normalizados |
| `resources[]` | `{name, type: "device"}` por host | |
| `finding_info.uid` | `campaign_id` | |
| `finding_info.title` | P. ej. «Movimiento lateral SCRANTON → NASHUA» | |
| `finding_info.types` | `["campaign"]` | |
| `finding_info.analytic` | `{uid: "P2", name: "P2_lateral_movement", type_id: 1, type: "Rule"}` | |
| `finding_info.first_seen_time` · `last_seen_time` | = `start_time` · `end_time` | |
| `finding_info.attacks[]` | Técnicas observadas en la evidencia, distintas | `{technique: {uid}, sub_technique: {uid}}`. **Sin táctica**: las alertas traen técnicas y tácticas en listas separadas, sin emparejar, y emparejarlas sería inventar. Las tácticas van en `tfg.tactic_names` |
| `finding_info.related_events[]` | Las **alertas** de evidencia | `{uid: alert_id, type: "alert", title: regla, first_seen_time, severity}` |
| `finding_info.related_events_count` | Su número | |

### Extensión `tfg`

| Campo | Contenido |
|---|---|
| `pattern_id` · `dataset_id` | `P1`, `P2`… · el dataset de origen |
| `devices[]` | `{hostname, role}`: `role` es `host` en P1 y `origen`/`destino` en P2 |
| `tactic_names[]` | Tácticas de la evidencia, por **nombre** (`credential-access`), nunca `TAxxxx` |
| `stages[]` | `{order, name, first_seen_time, last_seen_time, count, technique_ids[], evidence_uids[]}`. `order` es lo que OCSF no tiene (`related_events` no lleva orden). Se calcula con la regla de abajo |
| `confidence_factors` | `{factor: peso}`: solo los factores **presentes**. Su suma es la confianza. Nunca un número opaco |
| `metrics` | Lo propio de cada patrón (aristas, transiciones, alertas en la ventana…) |

## Orden de las etapas

Decidido el 26-10-2026. Se ordena **por el segundo** de la primera evidencia de cada etapa y,
**dentro del mismo segundo, por el orden lógico del patrón**.

El motivo es la resolución de las horas. Las de Sysmon van al milisegundo, pero las de
Security y PowerShell se reconstruyen con resolución de segundo (`tfg.time_source`), así que
dentro de un mismo segundo el reloj no sirve para ordenar. Sin esta regla, la sesión WinRM de
las 03:09:23.000 colocaba la ejecución remota de P2 **antes** que la conexión de las
03:09:23.801 que la origina. Las alertas no llevan la resolución de su hora. La alternativa
exacta era añadírsela, lo que obligaba a repetir la detección, y no compensaba.

Orden lógico de cada patrón: el de la tabla de abajo, de arriba abajo.

## Etapas por patrón

Una alerta puede probar **dos** etapas a la vez (el acceso remoto a LSASS por WinRM es T1021 y
T1003 a la vez). Entonces aparece en las dos. `related_events` la lista una sola vez.

| Patrón | Etapa (`name`) | Evidencia |
|---|---|---|
| **P1** robo de credenciales | `ejecucion_herramienta` | T1003.* sobre un evento de creación de proceso |
| | `acceso_lsass` | T1003.* sobre un acceso a proceso (Sysmon 10) |
| | `volcado_a_disco` | T1003.* sobre un evento de fichero |
| | `credenciales` | El resto de T1003.* |
| | `limpieza` | T1070.* |
| **P2** movimiento lateral | `conexion_lateral` | Las **aristas**: conexiones de red, no alertas. `evidence_uids` son identidades de evento (`host|registro`) |
| | `ejecucion_remota` | T1021.* en el destino |
| | `servicio` | T1569.002 en el destino |
| | `credenciales` | T1003.* en el destino (la costura con P1) |

## Extensión temporal

- **P2:** desde la primera arista hasta la última arista o la última evidencia, lo que ocurra
  después. Es lo mismo que el oráculo.
- **P1 en Flink:** de la primera a la última **transición**, es decir, acotada a su evidencia.
  El oráculo en batch absorbe en cambio ±10 min alrededor de las anclas. Por eso el número de
  alertas absorbidas no coincide: es una diferencia de definición conocida desde el 31-07, no
  un error. La de Flink es la que se emite.

## Ejemplo (P2, apt29 day1, abreviado)

```json
{
  "class_uid": 2004, "class_name": "Detection Finding", "category_uid": 2, "category_name": "Findings",
  "activity_id": 1, "activity_name": "Create", "type_uid": 200401, "type_name": "Detection Finding: Create",
  "time": 1588389479493, "start_time": 1588388963801, "end_time": 1588389479493, "duration": 515692,
  "severity_id": 4, "confidence_score": 100, "confidence_id": 3, "is_alert": true,
  "message": "Movimiento lateral SCRANTON.dmevals.local -> NASHUA.dmevals.local",
  "metadata": {"version": "1.5.0", "product": {"name": "tfg-ciberconciencia", "vendor_name": "TFG"}},
  "resources": [{"name": "SCRANTON.dmevals.local", "type": "device"}, {"name": "NASHUA.dmevals.local", "type": "device"}],
  "finding_info": {
    "uid": "07c1426c17179d180b24073e097edfdc",
    "title": "Movimiento lateral SCRANTON.dmevals.local -> NASHUA.dmevals.local",
    "types": ["campaign"],
    "analytic": {"uid": "P2", "name": "P2_lateral_movement", "type_id": 1, "type": "Rule"},
    "first_seen_time": 1588388963801, "last_seen_time": 1588389479493,
    "attacks": [{"technique": {"uid": "T1021"}, "sub_technique": {"uid": "T1021.006"}}],
    "related_events": [{"uid": "…", "type": "alert", "title": "PsExec Service File Creation", "first_seen_time": 1588389078864, "severity": "high"}],
    "related_events_count": 8
  },
  "tfg": {
    "pattern_id": "P2", "dataset_id": "SDWIN-200501225525",
    "devices": [{"hostname": "SCRANTON.dmevals.local", "role": "origen"}, {"hostname": "NASHUA.dmevals.local", "role": "destino"}],
    "tactic_names": ["lateral-movement", "execution", "credential-access"],
    "stages": [{"order": 1, "name": "conexion_lateral", "first_seen_time": 1588388963801, "last_seen_time": 1588389479493, "count": 17, "technique_ids": [], "evidence_uids": ["…"]}],
    "confidence_factors": {"arista": 0.30, "bilateral": 0.15, "proceso_interactivo": 0.10, "ejecucion_remota": 0.20, "servicio": 0.15, "credenciales": 0.10},
    "metrics": {"aristas": 17, "puertos": "135,445,5985", "transiciones": 13, "alertas_absorbidas": 115, "evidencias_tras_arista": 7, "retraso_max_ms": 1004}
  }
}
```

## Piezas

| Pieza | Fichero |
|---|---|
| Emisión de P1 | `infra/flink/jobs/p1_06_emision.sql` |
| Emisión de P2 | `infra/flink/jobs/p2_04_emision.sql` |
| Tabla | `infra/clickhouse/init/03_campaigns.sql` |
| Volcado y validación | `pipeline/jobs/sink_campaigns.py`, con su test |
