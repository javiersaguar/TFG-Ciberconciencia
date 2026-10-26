"""Sink: det.campaigns -> ClickHouse (tabla tfg.campaigns).

Cada mensaje es una campaña en el esquema común (docs/esquema-campana.md): un
hallazgo OCSF «Detection Finding» con extensión tfg.*. Flink lo construye uniendo
fragmentos JSON, así que aquí se VALIDA antes de guardarlo. Un documento que no
cumple el esquema detiene el volcado con el motivo: las campañas son pocas y cada
una importa, así que no se descarta ninguna en silencio.
"""
import argparse
import json
import signal
from datetime import datetime, timezone

RUNNING = True

COLUMNS = [
    "campaign_id", "pattern_id", "dataset_id", "title",
    "first_seen", "last_seen", "duration_ms",
    "severity_id", "confidence_score",
    "devices", "technique_ids", "tactic_names", "stages",
    "related_events_count", "related_event_uids",
    "ingested_at", "documento",
]


class CampanaInvalida(ValueError):
    """El documento no cumple el esquema común de campaña."""


def _exigir(condicion, motivo):
    if not condicion:
        raise CampanaInvalida(motivo)


def validar(doc):
    """Comprueba lo que el esquema promete. Devuelve el documento o lanza CampanaInvalida."""
    _exigir(isinstance(doc, dict), "el documento no es un objeto JSON")
    _exigir(doc.get("class_uid") == 2004, f"class_uid {doc.get('class_uid')!r}, se esperaba 2004 (Detection Finding)")
    _exigir(doc.get("type_uid") == 200401, f"type_uid {doc.get('type_uid')!r}, se esperaba 200401")
    fi = doc.get("finding_info")
    _exigir(isinstance(fi, dict), "falta finding_info")
    _exigir(isinstance(fi.get("uid"), str) and len(fi["uid"]) == 32, "finding_info.uid no es un md5 de 32 caracteres")
    for campo in ("start_time", "end_time", "time"):
        _exigir(isinstance(doc.get(campo), int), f"{campo} no es un epoch en ms")
    _exigir(doc["start_time"] <= doc["end_time"], "start_time posterior a end_time")
    _exigir(doc.get("duration") == doc["end_time"] - doc["start_time"], "duration no es end_time - start_time")
    _exigir(doc.get("severity_id") in (1, 2, 3, 4, 5), f"severity_id {doc.get('severity_id')!r} fuera de 1..5")
    score = doc.get("confidence_score")
    _exigir(isinstance(score, int) and 0 <= score <= 100, f"confidence_score {score!r} fuera de 0..100")

    tfg = doc.get("tfg")
    _exigir(isinstance(tfg, dict), "falta la extensión tfg")
    _exigir(bool(tfg.get("pattern_id")) and bool(tfg.get("dataset_id")), "faltan tfg.pattern_id o tfg.dataset_id")
    factores = tfg.get("confidence_factors")
    _exigir(isinstance(factores, dict) and factores, "faltan tfg.confidence_factors")
    # La confianza nunca es un número opaco: tiene que ser la suma de sus factores
    # (acotada a 1). Tolerancia de un punto por el redondeo a entero.
    suma = min(1.0, sum(float(v) for v in factores.values()))
    _exigir(abs(round(suma * 100) - score) <= 1, f"confidence_score {score} no es la suma de los factores ({suma:.2f})")

    etapas = tfg.get("stages")
    _exigir(isinstance(etapas, list) and etapas, "faltan tfg.stages")
    ordenes = [e.get("order") for e in etapas]
    _exigir(sorted(ordenes) == list(range(1, len(etapas) + 1)), f"los órdenes de las etapas no son 1..n: {ordenes}")
    for e in etapas:
        _exigir(bool(e.get("name")), "una etapa sin nombre")
        _exigir(isinstance(e.get("evidence_uids"), list) and e["evidence_uids"], f"la etapa {e.get('name')} no tiene evidencia")
        _exigir(e.get("count") == len(e["evidence_uids"]), f"la etapa {e.get('name')}: count no coincide con su evidencia")

    relacionados = fi.get("related_events") or []
    _exigir(fi.get("related_events_count") == len(relacionados), "related_events_count no coincide con related_events")
    uids = [r.get("uid") for r in relacionados]
    _exigir(len(uids) == len(set(uids)), "related_events repite una alerta")
    return doc


def _ts(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)


def a_fila(doc, ahora=None):
    """Documento validado -> fila de tfg.campaigns, en el orden de COLUMNS."""
    validar(doc)
    fi = doc["finding_info"]
    tfg = doc["tfg"]
    tecnicas = sorted({
        (a.get("sub_technique") or {}).get("uid") or (a.get("technique") or {}).get("uid")
        for a in fi.get("attacks") or []
    } - {None})
    etapas = sorted(tfg["stages"], key=lambda e: e["order"])
    return [
        fi["uid"],
        tfg["pattern_id"],
        tfg["dataset_id"],
        fi.get("title") or "",
        _ts(doc["start_time"]),
        _ts(doc["end_time"]),
        doc["duration"],
        doc["severity_id"],
        doc["confidence_score"],
        [d.get("hostname") for d in tfg.get("devices") or [] if d.get("hostname")],
        tecnicas,
        sorted(set(tfg.get("tactic_names") or [])),
        [e["name"] for e in etapas],
        fi["related_events_count"],
        [r["uid"] for r in fi.get("related_events") or []],
        ahora or datetime.now(tz=timezone.utc),
        json.dumps(doc, ensure_ascii=False, sort_keys=True),
    ]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--topic", default="det.campaigns")
    p.add_argument("--group-id", default="ch-campaigns-v1")
    p.add_argument("--ch-host", default="127.0.0.1")
    p.add_argument("--ch-port", type=int, default=8123)
    p.add_argument("--from-beginning", action="store_true")
    p.add_argument("--idle-exit", type=float, default=0)
    return p.parse_args()


def main():
    # Importaciones aquí para que el test de validar()/a_fila() no necesite Kafka ni ClickHouse
    import clickhouse_connect
    from confluent_kafka import Consumer, KafkaException

    args = parse_args()
    ch = clickhouse_connect.get_client(
        host=args.ch_host, port=args.ch_port,
        username="tfg", password="tfg", database="tfg",
    )
    consumer = Consumer({
        "bootstrap.servers": args.brokers,
        "group.id": args.group_id,
        "auto.offset.reset": "earliest" if args.from_beginning else "latest",
        "enable.auto.commit": False,
    })
    consumer.subscribe([args.topic])

    def stop(*_):
        global RUNNING
        RUNNING = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    print(f"Volcando {args.topic} -> ClickHouse tfg.campaigns")
    lote, total, idle, por_patron = [], 0, 0.0, {}

    def volcar():
        nonlocal lote
        if lote:
            ch.insert("campaigns", lote, column_names=COLUMNS)
            consumer.commit(asynchronous=False)
            lote = []

    while RUNNING:
        msg = consumer.poll(1.0)
        if msg is None:
            idle += 1.0
            volcar()
            if args.idle_exit and idle >= args.idle_exit:
                print(f"\nSin mensajes durante {idle:.0f}s, saliendo.")
                break
            continue
        if msg.error():
            raise KafkaException(msg.error())
        idle = 0.0
        texto = msg.value().decode("utf-8")
        try:
            fila = a_fila(json.loads(texto))
        except (json.JSONDecodeError, CampanaInvalida) as exc:
            # Sin descartes silenciosos: se para con el motivo y el mensaje, y el
            # offset queda sin confirmar para poder repetir tras corregir.
            volcar()
            raise SystemExit(f"Campaña inválida en {msg.topic()}[{msg.partition()}]@{msg.offset()}: {exc}\n{texto[:500]}")
        lote.append(fila)
        total += 1
        por_patron[fila[1]] = por_patron.get(fila[1], 0) + 1

    volcar()
    consumer.close()
    print(f"\nTotal insertado: {total}  " + "  ".join(f"{p}: {n}" for p, n in sorted(por_patron.items())))


if __name__ == "__main__":
    main()
