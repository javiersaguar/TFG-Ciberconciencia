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
    # TimeCreated es el campo comun y coherente entre canales (Sysmon y Security).
    # No usar UtcTime: en estos datasets viene desfasado respecto a TimeCreated,
    # lo que desincroniza el orden entre fuentes y romperia la correlacion CEP.
    ts = (parse_ts(event.get("TimeCreated"))
          or parse_ts(event.get("@timestamp"))
          or parse_ts(event.get("UtcTime")))
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
        },
        "unmapped": {},
    }