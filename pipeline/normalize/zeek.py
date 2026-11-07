"""Zeek JSON conn/dns a OCSF 1.5.0, sin modificar los mapeadores Windows."""
from decimal import Decimal, InvalidOperation
import hashlib
import ipaddress
import json

from pipeline.normalize.ocsf_common import OCSF_VERSION


def epoch_ms(value):
    try:
        stamp = Decimal(str(value)) * 1000
        if not stamp.is_finite() or stamp < 0:
            raise ValueError("ts Zeek no finito o negativo")
        return int(stamp)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("ts Zeek ausente o inválido") from exc


def endpoint(event, side):
    ip = str(ipaddress.ip_address(str(event.get(f"id_{side}_h", ""))))
    port = event.get(f"id_{side}_p")
    if port is not None:
        port = int(port)
        if not 0 <= port <= 65535:
            raise ValueError("Puerto Zeek fuera de rango")
    return {"ip": ip, "port": port}


def normalize_zeek(event, dataset_id=None, ordinal=None):
    stream = event.get("@stream")
    if stream not in ("conn", "dns"):
        raise ValueError(f"Tipo Zeek no soportado: {stream!r}")
    host = event.get("Hostname")
    if not isinstance(host, str) or not host:
        raise ValueError("Falta etiqueta de captura Hostname")
    source = {k: v for k, v in event.items() if not k.startswith("_tfg_") and k != "Hostname"}
    canonical = json.dumps(source, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    identity = hashlib.sha256(canonical.encode()).hexdigest()
    stamp = epoch_ms(event.get("ts"))
    class_uid = 4001 if stream == "conn" else 4003
    # conn es un informe de tráfico, no un evento Open al primer paquete.
    activity_id = 6 if stream == "conn" or "rcode" in event or "answers" in event else 1
    result = {
        "class_uid": class_uid, "category_uid": 4, "activity_id": activity_id,
        "type_uid": class_uid * 100 + activity_id,
        "type_name": ("Network Activity" if stream == "conn" else "DNS Activity")
                     + (": Traffic" if activity_id == 6 else ": Query"),
        "time": stamp, "severity_id": 1,
        "metadata": {"version": OCSF_VERSION, "product": {"name": "Zeek", "vendor_name": "Zeek"},
                     "profiles": ["network"]},
        "device": {"hostname": host, "type_id": 0},
        "src_endpoint": endpoint(event, "orig"), "dst_endpoint": endpoint(event, "resp"),
        "connection_info": {"protocol_name": event.get("proto"), "direction_id": 0},
        "tfg": {"dataset_id": dataset_id, "source_channel": f"zeek.{stream}",
                "source_event_id": 0, "source_uid": event.get("uid"),
                "record_number": int(identity[:15], 16), "time_source": "zeek.ts",
                "capture_label": host},
        # Se conserva el registro íntegro: campos nuevos no desaparecen.
        "unmapped": {"zeek": source, "source_ref": event.get("_tfg_source_ref", {})},
    }
    if stream == "conn":
        if event.get("duration") is not None:
            result["duration"] = epoch_ms(event["duration"])
            result["start_time"] = stamp
            result["end_time"] = stamp + result["duration"]
        traffic = {}
        for raw, target in (("orig_bytes", "bytes_out"), ("resp_bytes", "bytes_in"),
                            ("orig_pkts", "packets_out"), ("resp_pkts", "packets_in"),
                            ("missed_bytes", "bytes_missed")):
            if raw in event:
                value = int(event[raw])
                if value < 0:
                    raise ValueError(f"Contador negativo: {raw}")
                traffic[target] = value
        result["traffic"] = traffic
    else:
        if event.get("query"):
            result["query"] = {"hostname": event["query"], "type": event.get("qtype_name"),
                               "class": event.get("qclass_name")}
        result["query_time"] = stamp
        if event.get("rcode") is not None:
            code = int(event["rcode"])
            result["rcode_id"] = code if code in set(range(12)) | set(range(16, 26)) else 99
        if event.get("rcode_name"):
            result["rcode"] = event["rcode_name"]
        answers = event.get("answers", [])
        ttls = event.get("TTLs", [])
        if not isinstance(answers, list) or not isinstance(ttls, list):
            raise ValueError("answers/TTLs deben ser listas")
        # Zeek puede mezclar CNAME/A sin tipo por respuesta: no se inventa.
        result["answers"] = [{"rdata": answer, **({"ttl": int(ttls[i])} if i < len(ttls) else {})}
                             for i, answer in enumerate(answers)]
    return result
