"""Utilidades comunes para el mapeo de eventos a OCSF."""
from datetime import datetime, timezone

OCSF_VERSION = "1.5.0"

# Categorías OCSF
CAT_SYSTEM = 1
CAT_IAM = 3
CAT_NETWORK = 4

# Clases que usaremos (class_uid)
CLASS_FILE_SYSTEM = 1001
CLASS_MEMORY = 1004
CLASS_MODULE = 1005
CLASS_SCHEDULED_JOB = 1006
CLASS_PROCESS = 1007
CLASS_EVENT_LOG = 1008
CLASS_SCRIPT = 1009
CLASS_ACCOUNT_CHANGE = 3001
CLASS_AUTHENTICATION = 3002
CLASS_AUTHORIZE = 3003
CLASS_GROUP_MGMT = 3006
CLASS_NETWORK = 4001
CLASS_DNS = 4003


def parse_ts(raw):
    """Convierte los formatos de fecha de estos datasets a epoch-ms (UTC)."""
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except (ValueError, TypeError):
            continue
    return None


def _desfase_colector_ms(event):
    """Desfase horario del colector, derivado del PROPIO evento.

    `@timestamp` viene en UTC y `EventReceivedTime` en la hora local de la
    maquina que recogio el evento, de modo que su diferencia ES el desfase de
    esa zona. Al derivarlo evento a evento no hace falta tabla de zonas ni una
    pasada previa sobre el dataset, y se adapta solo al horario de verano y a
    capturas hechas en otro huso.

    Medido sobre apt29 day1: +4,00 h EXACTAS en los 196.081 eventos, sin una
    sola excepcion.
    """
    ts = parse_ts(event.get("@timestamp"))
    recibido = parse_ts(event.get("EventReceivedTime"))
    if ts is None or recibido is None:
        return None
    # Al cuarto de hora mas cercano: cubre los husos a :30 y :45 y absorbe de
    # paso el desfase de subsegundo entre ambos campos (EventReceivedTime tiene
    # resolucion de segundo y @timestamp de milisegundo).
    return round((ts - recibido) / 900_000) * 900_000


def event_time(event):
    """Instante en que OCURRIO el evento, en epoch-ms UTC, y de donde sale.

    Devuelve (epoch_ms, origen). El orden es por fiabilidad decreciente y NO es
    arbitrario: cada eslabon se eligio midiendo, no suponiendo.

      1. `TimeCreated` — hora del evento en UTC, explicita. La traen todos los
         datasets menos apt29 (verificado: 100 % en el atomico y en las 7
         campanas LSASS).

      2. `UtcTime` — la hora que registra Sysmon, en UTC y con milisegundos.
         Solo se llega aqui si NO hay TimeCreated, y eso hoy solo pasa en apt29.
         La distincion importa: en las campanas LSASS `UtcTime` va **19 horas**
         desviado respecto a `TimeCreated` (reloj mal configurado en aquella VM),
         asi que usarlo por delante de TimeCreated seria desastroso. Verificado
         que fuera de apt29 no existe ni un evento con UtcTime y sin TimeCreated.

      3. `EventTime` + desfase — hora local de escritura en el log, con
         resolucion de segundo, corregida de zona con `_desfase_colector_ms`.
         Es la unica opcion para los eventos de Security y PowerShell de apt29,
         que no traen UtcTime. Validado contra UtcTime en los 143.883 eventos de
         apt29 day1 donde ambos existen: mediana **-0,4 s** y el **94 % dentro
         de un segundo**. Queda una cola del 4,9 % que se desvia mas de 5 s
         (maximo 27 s), que es el retardo entre que Sysmon registra el evento y
         el log lo escribe.

      4. `@timestamp` — ULTIMO RECURSO, y hay que saber lo que se acepta al
         llegar aqui: coincide con `EventReceivedTime`, es decir, la hora a la
         que el colector RECIBIO el evento, no aquella en que ocurrio. Medido en
         apt29 day1 frente a UtcTime: mediana 6,2 s, p95 74,9 s, maximo 101,2 s
         y desviacion 26,7 s. Lo grave de ese ultimo numero es que los eventos
         se REORDENAN entre si, asi que no es un desfase constante que se pueda
         restar despues. Hasta el 09-09-2026 este era el eslabon que se usaba de
         hecho para todo apt29, porque `@timestamp` iba por delante de `UtcTime`
         en la cadena y apt29 no trae `TimeCreated`.
    """
    ts = parse_ts(event.get("TimeCreated"))
    if ts is not None:
        return ts, "TimeCreated"

    ts = parse_ts(event.get("UtcTime"))
    if ts is not None:
        return ts, "UtcTime"

    ts = parse_ts(event.get("EventTime"))
    desfase = _desfase_colector_ms(event)
    if ts is not None and desfase is not None:
        return ts + desfase, "EventTime+tz"

    return parse_ts(event.get("@timestamp")), "@timestamp"


def _to_record_number(event):
    """Numero de registro del evento en su log de origen; 0 si no viene."""
    raw = event.get("RecordNumber")
    if raw is None:
        raw = event.get("EventRecordID")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def base_event(event, class_uid, category_uid, activity_id=0):
    """Construye el esqueleto OCSF común a todos los eventos."""
    # Ver event_time(): la cadena va por fiabilidad decreciente y esta medida.
    # La version anterior ponia @timestamp por delante de UtcTime, con lo que
    # todo apt29 -que no trae TimeCreated- acababa fechado con la hora de
    # RECOGIDA del colector en vez de con la del evento.
    ts, origen_ts = event_time(event)
    return {
        "class_uid": class_uid,
        "category_uid": category_uid,
        "activity_id": activity_id,
        "type_uid": class_uid * 100 + activity_id,
        "time": ts,
        "severity_id": 1,  # Informational por defecto; se eleva en detección
        "metadata": {
            "version": OCSF_VERSION,
            "product": {"name": "tfg-ciberconciencia", "vendor_name": "TFG"},
            "profiles": ["host"],
        },
        "device": {
            "hostname": event.get("Hostname") or event.get("Computer"),
            "type_id": 0,
        },
        # Extensión propia: trazabilidad a la verdad conocida
        "tfg": {
            "dataset_id": None,  # se rellena desde la cabecera Kafka en el job
            # En minusculas siempre: el dataset trae el mismo canal con dos
            # grafias ("Security" 28.627 veces y "security" 12.375 en apt29
            # day1), de modo que un filtro por el valor exacto se dejaria fuera
            # un tercio de los eventos sin avisar. registry.py ya normaliza asi
            # para buscar el mapeador; guardarlo tal cual propagaba la
            # inconsistencia. Verificado que no introduce colisiones de
            # identidad: 196.081 eventos, 196.081 ternas distintas con y sin
            # normalizar la grafia.
            "source_channel": (event.get("Channel") or "").lower() or None,
            "source_event_id": event.get("EventID"),
            # Identidad del evento en su origen. El numero de registro es unico
            # dentro de (host, canal), asi que la terna identifica el evento sin
            # ambiguedad y permite deduplicar recargas igual que event_hash hace
            # con las alertas. Sin el, dos eventos distintos del mismo host, hora
            # y contenido normalizan al mismo JSON y son indistinguibles.
            # RecordNumber es el nombre en estos datasets; EventRecordID es el
            # que usan otros exportadores de Sysmon.
            "record_number": _to_record_number(event),
            # De donde sale la marca de tiempo. Permite medir que fraccion del
            # corpus tiene hora exacta y cual va reconstruida, en vez de tener
            # que fiarse de que todas valen lo mismo.
            "time_source": origen_ts,
        },
        "unmapped": {},
    }