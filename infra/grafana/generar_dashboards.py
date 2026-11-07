"""Genera los cuadros de mando de Grafana que leen ClickHouse (2, 3, 5 y 6) y añade al 1 la
cobertura de normalización medida en el bus.

Por qué un generador: los cuadros comparten filtros (origen del dataset y dataset) y la forma
de las consultas. Escribirlos a mano en JSON repetía cada consulta y ya se habían quedado
atrás: el 2 y el 3 miraban un único día de 2020 y la cobertura estaba escrita a mano.

Reglas comunes:
  - todas las consultas usan FINAL (las tablas son ReplacingMergeTree y deduplican al fusionar);
  - los filtros `origen` (corpus, atomico, fa, fa_red, fa_benigno; tabla tfg.verdad_datasets) y
    `dataset` se aplican en todos los paneles de ClickHouse;
  - el rango de tiempo solo afecta a las series temporales; las cifras son del dataset entero.

Uso (desde la raíz del repo): python3 infra/grafana/generar_dashboards.py
Grafana relee la carpeta cada 30 s (provisioning/dashboards).
"""
import json
from pathlib import Path

DIR = Path(__file__).parent / "dashboards"
CH = {"type": "grafana-clickhouse-datasource", "uid": "clickhouse-tfg"}
PROM = {"type": "prometheus", "uid": "PBFA97CFB590B2093"}
F = "dataset_id IN (${dataset:singlequote})"          # filtro de dataset
TIEMPO = {"from": "now-8y", "to": "now"}


# ------------------------------------------------------------------ piezas
def sql(q, ref="A", fmt=1):
    return {"refId": ref, "rawSql": " ".join(q.split()), "format": fmt, "queryType": "table",
            "editorType": "sql", "datasource": CH}


def panel(tipo, titulo, x, y, w, h, targets, ds=CH, desc=None, **extra):
    p = {"type": tipo, "title": titulo, "datasource": ds, "gridPos": {"x": x, "y": y, "w": w, "h": h},
         "targets": targets if isinstance(targets, list) else [targets]}
    if desc:
        p["description"] = desc
    p.update(extra)
    return p


def stat(titulo, q, x, y, w=4, h=4, desc=None, unidad=None, decimales=None):
    defaults = {"color": {"mode": "thresholds"},
                "thresholds": {"mode": "absolute", "steps": [{"color": "blue", "value": None}]}}
    if unidad:
        defaults["unit"] = unidad
    if decimales is not None:
        defaults["decimals"] = decimales
    return panel("stat", titulo, x, y, w, h, sql(q), desc=desc,
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                          "colorMode": "value", "graphMode": "none", "textMode": "value"},
                 fieldConfig={"defaults": defaults, "overrides": []})


def tabla(titulo, q, x, y, w, h, desc=None):
    return panel("table", titulo, x, y, w, h, sql(q), desc=desc,
                 options={"showHeader": True, "cellHeight": "sm"},
                 fieldConfig={"defaults": {"custom": {"filterable": True}}, "overrides": []})


def barras(titulo, q, x, y, w, h, desc=None, horizontal=True):
    return panel("barchart", titulo, x, y, w, h, sql(q), desc=desc,
                 options={"orientation": "horizontal" if horizontal else "vertical",
                          "showValue": "auto", "legend": {"showLegend": False}, "xTickLabelRotation": 0})


def fila(titulo, y):
    return {"type": "row", "title": titulo, "collapsed": False, "gridPos": {"x": 0, "y": y, "w": 24, "h": 1},
            "panels": []}


def texto(contenido, x, y, w, h, titulo=""):
    return {"type": "text", "title": titulo, "gridPos": {"x": x, "y": y, "w": w, "h": h},
            "options": {"mode": "markdown", "content": contenido}}


def variables():
    return {"list": [
        {"name": "origen", "label": "Origen", "type": "query", "datasource": CH, "multi": True,
         "includeAll": True, "current": {"text": ["All"], "value": ["$__all"]}, "refresh": 1, "sort": 1,
         "query": "SELECT DISTINCT origen FROM tfg.verdad_datasets FINAL ORDER BY origen",
         "definition": "SELECT DISTINCT origen FROM tfg.verdad_datasets FINAL ORDER BY origen"},
        {"name": "dataset", "label": "Dataset", "type": "query", "datasource": CH, "multi": True,
         "includeAll": True, "current": {"text": ["All"], "value": ["$__all"]}, "refresh": 2, "sort": 1,
         "query": "SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen IN (${origen:singlequote}) ORDER BY dataset_id",
         "definition": "SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen IN (${origen:singlequote}) ORDER BY dataset_id"},
    ]}


def cuadro(uid, titulo, etiquetas, paneles, refresh="1m"):
    return {"uid": uid, "title": titulo, "tags": ["tfg"] + etiquetas, "timezone": "utc", "refresh": refresh,
            "time": TIEMPO, "schemaVersion": 39, "version": 2, "editable": True,
            "templating": variables(), "panels": paneles}


# ------------------------------------------------------------------ 2 · seguridad
def seguridad():
    p = [fila("Resumen (filtros: origen y dataset)", 0)]
    p += [stat("Eventos normalizados", f"SELECT count() FROM tfg.events FINAL WHERE {F}", 0, 1),
          stat("Hosts", f"SELECT uniqExact(device_hostname) FROM tfg.events FINAL WHERE {F}", 4, 1),
          stat("Alertas Sigma distintas", f"SELECT count() FROM tfg.alerts FINAL WHERE {F}", 8, 1),
          stat("Campañas multi-etapa", f"SELECT count() FROM tfg.campaigns FINAL WHERE {F}", 12, 1),
          stat("Datasets con eventos", f"SELECT uniqExact(dataset_id) FROM tfg.events FINAL WHERE {F}", 16, 1),
          stat("Técnicas ATT&CK detectadas",
               f"SELECT uniqExact(t) FROM tfg.alerts FINAL ARRAY JOIN technique_ids AS t WHERE {F}", 20, 1)]
    p.append(fila("Detección", 5))
    p += [barras("Alertas por técnica (top 15)",
                 f"SELECT t AS tecnica, count() AS alertas FROM tfg.alerts FINAL ARRAY JOIN technique_ids AS t "
                 f"WHERE {F} GROUP BY t ORDER BY alertas DESC LIMIT 15", 0, 6, 8, 10),
          tabla("Reglas que más disparan",
                f"SELECT rule_title AS regla, rule_level AS nivel, count() AS alertas, uniqExact(device_hostname) AS hosts, "
                f"uniqExact(dataset_id) AS datasets FROM tfg.alerts FINAL WHERE {F} "
                f"GROUP BY regla, nivel ORDER BY alertas DESC LIMIT 25", 8, 6, 16, 10,
                desc="Las reglas que disparan en muchos datasets distintos son las candidatas a ruido (ver revisión de falsos positivos de F3).")]
    p.append(fila("Campañas", 16))
    p += [tabla("Campañas detectadas (más recientes primero)",
                f"SELECT first_seen AS inicio, dataset_id AS dataset, pattern_id AS patron, arrayStringConcat(devices, ', ') AS hosts, "
                f"arrayStringConcat(stages, ' → ') AS etapas, confidence_score AS confianza, related_events_count AS evidencias, "
                f"arrayStringConcat(technique_ids, ', ') AS tecnicas FROM tfg.campaigns FINAL WHERE {F} ORDER BY first_seen DESC",
                0, 17, 24, 9)]
    p.append(fila("Señales y eventos", 26))
    p += [barras("Señales precalculadas en la normalización",
                 f"SELECT s.1 AS senal, s.2 AS n FROM (SELECT arrayJoin([('Acceso a LSASS', countIf(signal_lsass_access)), "
                 f"('Acceso sospechoso', countIf(signal_suspicious_access)), ('DLL de volcado', countIf(signal_dump_module)), "
                 f"('Volcado a disco', countIf(signal_dump_file)), ('Borrado de logs', countIf(signal_log_cleared)), "
                 f"('Logon remoto', countIf(signal_remote_logon))]) AS s FROM tfg.events FINAL WHERE {F}) ORDER BY n DESC",
                 0, 27, 8, 8),
          panel("piechart", "Eventos por clase OCSF", 8, 27, 8, 8,
                sql(f"SELECT class_name AS clase, count() AS n FROM tfg.events FINAL WHERE {F} GROUP BY clase ORDER BY n DESC"),
                options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
                         "pieType": "donut", "legend": {"displayMode": "table", "placement": "right", "values": ["value"]}}),
          barras("Top procesos actores",
                 f"SELECT actor_process_name AS proceso, count() AS n FROM tfg.events FINAL WHERE {F} AND actor_process_name != '' "
                 f"GROUP BY proceso ORDER BY n DESC LIMIT 12", 16, 27, 8, 8),
          panel("timeseries", "Actividad en el tiempo por clase (usa el rango de tiempo)", 0, 35, 24, 8,
                sql(f"SELECT toStartOfInterval(time, INTERVAL $__interval_s second) AS t, class_name, count() AS n "
                    f"FROM tfg.events FINAL WHERE {F} AND $__timeFilter(time) GROUP BY t, class_name ORDER BY t"),
                fieldConfig={"defaults": {"custom": {"fillOpacity": 40, "lineWidth": 1, "stacking": {"mode": "normal"},
                                                     "showPoints": "never", "drawStyle": "bars"}}, "overrides": []})]
    return cuadro("tfg-security-overview", "2 · Panel de seguridad", ["seguridad", "ocsf"], p)


# ------------------------------------------------------------------ 3 · calidad
def calidad():
    cob_global = ('100 * sum(redpanda_kafka_max_offset{redpanda_topic=~"norm\\\\..*events"}) / '
                  '(sum(redpanda_kafka_max_offset{redpanda_topic=~"norm\\\\..*events"}) + '
                  'sum(redpanda_kafka_max_offset{redpanda_topic=~"dlq\\\\..*normalize"}))')
    p = [fila("Cobertura de normalización (medida en el bus de eventos)", 0)]
    p += [panel("gauge", "Cobertura OCSF global (%)", 0, 1, 6, 6,
                {"refId": "A", "expr": cob_global, "instant": True, "datasource": PROM}, ds=PROM,
                desc="Eventos normalizados / (normalizados + rechazados a la DLQ), sumando todos los topics del bus. "
                     "Los rechazos son tipos de evento sin mapeador, siempre con su motivo.",
                fieldConfig={"defaults": {"unit": "percent", "min": 0, "max": 100, "decimals": 2,
                                          "thresholds": {"mode": "absolute", "steps": [
                                              {"color": "red", "value": None}, {"color": "orange", "value": 90},
                                              {"color": "green", "value": 98}]}}, "overrides": []}),
          panel("table", "Mensajes por topic de normalización y de rechazo", 6, 1, 18, 6,
                {"refId": "A", "expr": 'sum by (redpanda_topic) (redpanda_kafka_max_offset{redpanda_topic=~"(norm|dlq)\\\\..*(events|normalize)"})',
                 "instant": True, "format": "table", "datasource": PROM}, ds=PROM,
                desc="Cada pasada de carga (F3 y las de FA) tiene sus propios topics: así se ve la cobertura de cada una.",
                transformations=[{"id": "organize", "options": {"excludeByName": {"Time": True},
                                                                "renameByName": {"redpanda_topic": "topic", "Value": "mensajes"}}}],
                options={"showHeader": True, "sortBy": [{"displayName": "topic"}]})]
    p.append(fila("Datasets (filtros: origen y dataset)", 7))
    p += [tabla("Datasets cargados, con su verdad conocida y resultados",
                f"SELECT v.dataset_id AS dataset, v.origen, v.titulo, v.verdad, e.eventos, e.hosts, e.primer_evento, e.ultimo_evento, "
                f"a.alertas, c.campanas FROM (SELECT * FROM tfg.verdad_datasets FINAL WHERE {F}) AS v "
                f"LEFT JOIN (SELECT dataset_id, count() AS eventos, uniqExact(device_hostname) AS hosts, min(time) AS primer_evento, "
                f"max(time) AS ultimo_evento FROM tfg.events FINAL WHERE {F} GROUP BY dataset_id) AS e ON e.dataset_id = v.dataset_id "
                f"LEFT JOIN (SELECT dataset_id, count() AS alertas FROM tfg.alerts FINAL WHERE {F} GROUP BY dataset_id) AS a ON a.dataset_id = v.dataset_id "
                f"LEFT JOIN (SELECT dataset_id, count() AS campanas FROM tfg.campaigns FINAL WHERE {F} GROUP BY dataset_id) AS c ON c.dataset_id = v.dataset_id "
                f"ORDER BY v.origen, e.eventos DESC SETTINGS join_use_nulls = 1", 0, 8, 24, 10,
                desc="Sin eventos puede significar dos cosas: los atómicos de OTRF se procesan sin volcar sus eventos a tfg.events "
                     "(solo alertas y campañas, por espacio), y el segundo host de COMISET solo trae canales sin mapeador.")]
    p.append(fila("Distribución por fuente", 18))
    p += [tabla("Cobertura por canal y EventID",
                f"SELECT source_channel AS canal, source_event_id AS event_id, class_name AS clase_ocsf, count() AS eventos, "
                f"uniqExact(dataset_id) AS datasets FROM tfg.events FINAL WHERE {F} GROUP BY canal, event_id, clase_ocsf ORDER BY eventos DESC",
                0, 19, 14, 10),
          barras("Eventos por canal de origen",
                 f"SELECT source_channel AS canal, count() AS n FROM tfg.events FINAL WHERE {F} GROUP BY canal ORDER BY n DESC",
                 14, 19, 10, 10)]
    p.append(fila("Calidad de los datos", 29))
    p += [stat("Eventos sin tiempo válido", f"SELECT countIf(toUnixTimestamp(time) = 0) FROM tfg.events FINAL WHERE {F}", 0, 30),
          stat("Eventos sin proceso actor", f"SELECT countIf(actor_process_name = '') FROM tfg.events FINAL WHERE {F}", 4, 30),
          stat("Tipos de evento distintos", f"SELECT uniqExact(concat(source_channel, '/', toString(source_event_id))) FROM tfg.events FINAL WHERE {F}", 8, 30),
          stat("Eventos sin número de registro", f"SELECT countIf(record_number = 0) FROM tfg.events FINAL WHERE {F}", 12, 30,
               desc="Sin número de registro de origen, la identidad del evento se apoya en el ordinal de la línea."),
          stat("Tamaño medio del evento", f"SELECT round(avg(length(raw))) FROM tfg.events FINAL WHERE {F}", 16, 30, unidad="decbytes"),
          stat("Rango temporal cubierto", f"SELECT dateDiff('second', min(time), max(time)) FROM tfg.events FINAL WHERE {F}", 20, 30, unidad="s"),
          tabla("Rango temporal por canal (sincronización entre fuentes)",
                f"SELECT source_channel AS canal, min(time) AS primero, max(time) AS ultimo, count() AS eventos "
                f"FROM tfg.events FINAL WHERE {F} GROUP BY canal ORDER BY primero", 0, 34, 24, 8)]
    return cuadro("tfg-data-quality", "3 · Cobertura y calidad de datos", ["calidad", "ocsf"], p)


# ------------------------------------------------------------------ 5 · Pilar A
def campanas():
    esperado = ("multiIf(c.pattern_id = 'P1', v.p1_esperado, c.pattern_id = 'P2', v.p2_esperado, "
                "c.pattern_id = 'P3', v.p3_esperado, 0)")
    p = [texto("**Pilar A.** Las alertas Sigma se agrupan en campañas con tres patrones en Flink (`MATCH_RECOGNIZE`): "
               "**P1** robo de credenciales, **P2** movimiento lateral y **P3** escalada con descubrimiento o persistencia. "
               "La *precisión automática* cuenta como acierto la campaña cuyo patrón espera la verdad conocida del dataset, "
               "**antes de la revisión manual**. Cifras revisadas a mano: F3 0,69 (55 campañas); APT29 day2 0,80 (5 campañas).",
               0, 0, 24, 3)]
    p.append(fila("Resumen (filtros: origen y dataset)", 3))
    p += [stat("Alertas distintas", f"SELECT count() FROM tfg.alerts FINAL WHERE {F}", 0, 4),
          stat("Campañas", f"SELECT count() FROM tfg.campaigns FINAL WHERE {F}", 4, 4),
          stat("Reducción global (alertas → campañas)",
               f"SELECT 1 - (SELECT count() FROM tfg.campaigns FINAL WHERE {F}) / greatest((SELECT count() FROM tfg.alerts FINAL WHERE {F}), 1)",
               8, 4, unidad="percentunit", decimales=1,
               desc="1 − campañas / alertas. La reducción sobre la evidencia de campaña (0,859 en F3) se mide en f3_cierre.sql."),
          stat("Precisión automática",
               f"SELECT avg({esperado}) FROM tfg.campaigns AS c FINAL LEFT JOIN (SELECT * FROM tfg.verdad_datasets FINAL) AS v "
               f"ON v.dataset_id = c.dataset_id WHERE c.{F}", 12, 4, unidad="percentunit", decimales=2),
          stat("Datasets con alguna campaña", f"SELECT uniqExact(dataset_id) FROM tfg.campaigns FINAL WHERE {F}", 16, 4),
          stat("Confianza media", f"SELECT avg(confidence_score) FROM tfg.campaigns FINAL WHERE {F}", 20, 4, decimales=0)]
    p.append(fila("Esperado frente a detectado", 8))
    p += [tabla("Por dataset: campañas esperadas (verdad) y detectadas",
                f"SELECT v.dataset_id AS dataset, v.origen, v.p1_esperado AS P1_esp, countIf(c.pattern_id = 'P1') AS P1_det, "
                f"v.p2_esperado AS P2_esp, countIf(c.pattern_id = 'P2') AS P2_det, v.p3_esperado AS P3_esp, countIf(c.pattern_id = 'P3') AS P3_det, "
                f"multiIf((v.p1_esperado AND countIf(c.pattern_id = 'P1') = 0) OR (v.p2_esperado AND countIf(c.pattern_id = 'P2') = 0) "
                f"OR (v.p3_esperado AND countIf(c.pattern_id = 'P3') = 0), 'falta alguna', "
                f"(NOT v.p1_esperado AND countIf(c.pattern_id = 'P1') > 0) OR (NOT v.p2_esperado AND countIf(c.pattern_id = 'P2') > 0) "
                f"OR (NOT v.p3_esperado AND countIf(c.pattern_id = 'P3') > 0), 'sobra alguna', 'cuadra') AS lectura "
                f"FROM (SELECT * FROM tfg.verdad_datasets FINAL WHERE {F}) AS v "
                f"LEFT JOIN (SELECT * FROM tfg.campaigns FINAL WHERE {F}) AS c ON c.dataset_id = v.dataset_id "
                f"GROUP BY v.dataset_id, v.origen, v.p1_esperado, v.p2_esperado, v.p3_esperado "
                f"HAVING P1_esp + P2_esp + P3_esp + P1_det + P2_det + P3_det > 0 ORDER BY lectura = 'cuadra', lectura, dataset",
                0, 9, 24, 10,
                desc="«sobra alguna» son candidatas a falso positivo; «falta alguna», a falso negativo. Hay que revisarlas a mano: "
                     "en F3, parte de las «sobrantes» eran ataques reales que la ficha del dataset no listaba.")]
    p.append(fila("Campañas", 19))
    p += [barras("Campañas por patrón",
                 f"SELECT pattern_id AS patron, count() AS campanas FROM tfg.campaigns FINAL WHERE {F} GROUP BY patron ORDER BY patron",
                 0, 20, 6, 8, horizontal=False),
          barras("Confianza de las campañas",
                 f"SELECT concat(pattern_id, ' · ', toString(confidence_score)) AS patron_confianza, count() AS campanas "
                 f"FROM tfg.campaigns FINAL WHERE {F} GROUP BY pattern_id, confidence_score ORDER BY pattern_id, confidence_score",
                 6, 20, 8, 8),
          barras("Técnicas en campañas",
                 f"SELECT t AS tecnica, count() AS campanas FROM tfg.campaigns FINAL ARRAY JOIN technique_ids AS t WHERE {F} "
                 f"GROUP BY t ORDER BY campanas DESC LIMIT 15", 14, 20, 10, 8),
          tabla("Detalle de campañas",
                f"SELECT dataset_id AS dataset, pattern_id AS patron, first_seen AS inicio, round(duration_ms / 1000, 1) AS duracion_s, "
                f"arrayStringConcat(devices, ', ') AS hosts, arrayStringConcat(stages, ' → ') AS etapas, confidence_score AS confianza, "
                f"related_events_count AS evidencias, arrayStringConcat(technique_ids, ', ') AS tecnicas, title AS titulo "
                f"FROM tfg.campaigns FINAL WHERE {F} ORDER BY dataset, inicio", 0, 28, 24, 10)]
    return cuadro("tfg-campaigns", "5 · Campañas multi-etapa (Pilar A)", ["pilar-a", "cep"], p)


# ------------------------------------------------------------------ 6 · validación externa
def validacion():
    FA = "dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE startsWith(origen, 'fa'))"
    p = [texto("**Ampliación del corpus (FA, 07-11-2026).** Tres conjuntos externos recorren F1–F3 con sus propios topics, "
               "sin alterar F3 (la foto antes y después de cada carga coincide). **APT29 day2**: validación de los patrones "
               "con otra jornada de ataque. **Zeek**: red de APT29; sus logs son de *otra ejecución* de la emulación (25–51 h "
               "antes y sin puertos en común), así que sirven para topología, no para confirmar aristas de P2. "
               "**COMISET**: actividad normal de una red universitaria para medir falsas alarmas; el piloto solo cubre "
               "~6 minutos de un host.", 0, 0, 24, 3)]
    p.append(fila("Resumen por origen", 4))
    p += [tabla("Volumen y resultados por origen del dataset",
                "SELECT v.origen, count() AS datasets, sum(e.eventos) AS eventos, sum(a.alertas) AS alertas, sum(c.campanas) AS campanas "
                "FROM (SELECT * FROM tfg.verdad_datasets FINAL) AS v "
                "LEFT JOIN (SELECT dataset_id, count() AS eventos FROM tfg.events FINAL GROUP BY dataset_id) AS e ON e.dataset_id = v.dataset_id "
                "LEFT JOIN (SELECT dataset_id, count() AS alertas FROM tfg.alerts FINAL GROUP BY dataset_id) AS a ON a.dataset_id = v.dataset_id "
                "LEFT JOIN (SELECT dataset_id, count() AS campanas FROM tfg.campaigns FINAL GROUP BY dataset_id) AS c ON c.dataset_id = v.dataset_id "
                "GROUP BY v.origen ORDER BY v.origen", 0, 5, 12, 7),
          tabla("Datasets de FA",
                f"SELECT v.dataset_id AS dataset, v.origen, v.verdad, count(e.time) AS eventos, min(e.time) AS desde, max(e.time) AS hasta, "
                f"round(dateDiff('second', min(e.time), max(e.time)) / 3600, 3) AS horas_observadas "
                f"FROM (SELECT * FROM tfg.verdad_datasets FINAL WHERE startsWith(origen, 'fa')) AS v "
                f"LEFT JOIN (SELECT dataset_id, time FROM tfg.events FINAL WHERE {FA}) AS e ON e.dataset_id = v.dataset_id "
                f"GROUP BY dataset, v.origen, v.verdad ORDER BY dataset SETTINGS join_use_nulls = 1", 12, 5, 12, 7)]
    p.append(fila("Falsas alarmas sobre actividad normal (COMISET)", 12))
    p += [stat("Alertas en actividad normal",
               "SELECT count() FROM tfg.alerts FINAL WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_benigno')",
               0, 13),
          stat("Campañas en actividad normal",
               "SELECT count() FROM tfg.campaigns FINAL WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_benigno')",
               4, 13, desc="Toda campaña aquí es una falsa alarma."),
          stat("Alertas por host-hora observada",
               "SELECT (SELECT count() FROM tfg.alerts FINAL WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_benigno')) "
               "/ (SELECT sum(h) FROM (SELECT dateDiff('second', min(time), max(time)) / 3600 AS h FROM tfg.events FINAL "
               "WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_benigno') GROUP BY dataset_id))",
               8, 13, decimales=1, desc="Denominador: horas realmente observadas por host. Con el piloto (~6 min) no es representativo."),
          tabla("Reglas que disparan sobre actividad normal",
                "SELECT dataset_id AS dataset, rule_title AS regla, rule_level AS nivel, count() AS alertas, "
                "arrayStringConcat(groupUniqArray(5)(actor_process_name), ', ') AS procesos FROM tfg.alerts FINAL "
                "WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_benigno') "
                "GROUP BY dataset, regla, nivel ORDER BY alertas DESC", 12, 13, 12, 8)]
    p.append(fila("Red (Zeek)", 21))
    p += [barras("Conexiones por puerto destino (top 15)",
                 "SELECT toString(dst_port) AS puerto, count() AS conexiones FROM tfg.events FINAL "
                 "WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_red') AND dst_port IS NOT NULL "
                 "GROUP BY puerto ORDER BY conexiones DESC LIMIT 15", 0, 22, 8, 9),
          tabla("Pares origen → destino más frecuentes",
                "SELECT dataset_id AS dataset, IPv6NumToString(src_ip) AS origen, IPv6NumToString(dst_ip) AS destino, dst_port AS puerto, "
                "class_name AS clase, count() AS registros FROM tfg.events FINAL "
                "WHERE dataset_id IN (SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE origen = 'fa_red') "
                "GROUP BY dataset, origen, destino, puerto, clase ORDER BY registros DESC LIMIT 30", 8, 22, 16, 9)]
    p.append(fila("APT29 day2", 31))
    p += [tabla("Campañas de day2 (revisadas: 4 verdaderas, 1 falsa por wininit/csrss → LSASS)",
                "SELECT pattern_id AS patron, first_seen AS inicio, arrayStringConcat(devices, ', ') AS hosts, "
                "arrayStringConcat(stages, ' → ') AS etapas, confidence_score AS confianza, arrayStringConcat(technique_ids, ', ') AS tecnicas "
                "FROM tfg.campaigns FINAL WHERE dataset_id = 'SDWIN-200502035409' ORDER BY inicio", 0, 32, 24, 7)]
    return cuadro("tfg-external-validation", "6 · Corpus ampliado y validación externa", ["fa", "validacion"], p)


# ------------------------------------------------------------------ 1 · salud: cobertura en el bus
def actualizar_salud():
    ruta = DIR / "01-pipeline-health.json"
    d = json.loads(ruta.read_text(encoding="utf-8"))
    if not any(p.get("title") == "Cobertura de normalización (global)" for p in d["panels"]):
        expr = ('100 * sum(redpanda_kafka_max_offset{redpanda_topic=~"norm\\\\..*events"}) / '
                '(sum(redpanda_kafka_max_offset{redpanda_topic=~"norm\\\\..*events"}) + '
                'sum(redpanda_kafka_max_offset{redpanda_topic=~"dlq\\\\..*normalize"}))')
        # se coloca junto a los indicadores del bus, desplazando el resto hacia abajo
        for p in d["panels"]:
            if p["gridPos"]["y"] >= 1:
                p["gridPos"]["y"] += 5
        d["panels"].insert(1, panel("stat", "Cobertura de normalización (global)", 0, 1, 6, 5,
                                    {"refId": "A", "expr": expr, "instant": True, "datasource": PROM}, ds=PROM,
                                    fieldConfig={"defaults": {"unit": "percent", "decimals": 2}, "overrides": []},
                                    options={"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value", "graphMode": "none"}))
        d["panels"].insert(2, panel("stat", "Mensajes en DLQ", 6, 1, 6, 5,
                                    {"refId": "A", "expr": 'sum(redpanda_kafka_max_offset{redpanda_topic=~"dlq\\\\..*"})',
                                     "instant": True, "datasource": PROM}, ds=PROM,
                                    options={"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value", "graphMode": "none"}))
        d["version"] = d.get("version", 1) + 1
        ruta.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    for nombre, d in (("02-security-overview.json", seguridad()), ("03-data-quality.json", calidad()),
                      ("05-campaigns.json", campanas()), ("06-external-validation.json", validacion())):
        (DIR / nombre).write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("escrito", nombre, len(d["panels"]), "paneles")
    actualizar_salud()


if __name__ == "__main__":
    main()
