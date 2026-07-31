"""Job de deteccion: norm.events -> det.alerts (+ DLQ).

Consume eventos OCSF normalizados, los evalua contra el conjunto de reglas
Sigma cargadas y publica una alerta por cada coincidencia.

El consumidor usa grupo de Kafka sin fijar particiones, de modo que varias
instancias del job pueden ejecutarse en paralelo repartiendose el trabajo.
"""
import argparse
import hashlib
import json
import signal
import time

from confluent_kafka import Consumer, Producer, KafkaException

from detection.loader import load_rules
from detection.evaluator import compile_rules, evaluate_all

RUNNING = True

# Categorias de reglas que se cargan por defecto: las que corresponden a los
# tipos de evento que el normalizador sabe producir.
DEFAULT_RULE_DIRS = [
    "process_creation", "process_access", "image_load", "file/file_event",
    "network_connection", "registry", "builtin",
]


def parse_args():
    p = argparse.ArgumentParser(description="Deteccion Sigma sobre eventos OCSF")
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--source-topic", default="norm.events")
    p.add_argument("--sink-topic", default="det.alerts")
    p.add_argument("--dlq-topic", default="dlq.detect")
    p.add_argument("--group-id", default="detector-v1")
    p.add_argument("--rules-base", default="data/sigma/rules/windows",
                   help="Directorio base del repositorio de reglas")
    p.add_argument("--rule-dirs", nargs="*", default=None,
                   help="Subdirectorios de reglas a cargar (por defecto, los soportados)")
    p.add_argument("--from-beginning", action="store_true")
    p.add_argument("--idle-exit", type=float, default=0,
                   help="Segundos sin mensajes tras los que salir (0 = no salir)")
    p.add_argument("--report-every", type=int, default=5000,
                   help="Cada cuantos eventos imprimir progreso")
    return p.parse_args()


def header_value(headers, key):
    for k, v in (headers or []):
        if k == key:
            return v.decode("utf-8") if isinstance(v, bytes) else v
    return None


def build_alert(compiled_rule, matched, event, dataset_id, event_hash):
    """Construye la alerta a partir de la regla que ha casado y el evento.

    El campo matched_fields es la semilla de la explicabilidad: indica que
    condiciones concretas dispararon la deteccion.

    El alert_id es **determinista**: se deriva del hash del evento de origen y
    del identificador de la regla. Volver a procesar el mismo evento produce el
    mismo identificador, lo que permite deduplicar en destino sin riesgo de
    colapsar alertas legitimas (dos eventos distintos del mismo milisegundo
    tienen hashes distintos). El event_hash se conserva ademas como columna
    propia: permite saber si dos alertas proceden del *mismo* evento, caso
    habitual cuando una sola accion dispara varias reglas.
    """
    s = compiled_rule.summary or {}
    rule_id = s.get("rule_id") or s.get("rule_title") or "sin-id"
    alert_id = hashlib.sha1(f"{event_hash}|{rule_id}".encode("utf-8")).hexdigest()
    device = (event.get("device") or {})
    actor = (event.get("actor") or {})
    actor_user = (actor.get("user") or {})
    actor_proc = (actor.get("process") or {})

    return {
        "alert_id": alert_id,
        "event_hash": event_hash,
        "time": event.get("time"),
        "detected_at": int(time.time() * 1000),

        "rule_id": s.get("rule_id"),
        "rule_title": s.get("rule_title"),
        "rule_level": s.get("rule_level", "medium"),
        "rule_status": s.get("rule_status"),

        "attack": {
            "technique_ids": s.get("techniques", []),
            "tactic_ids": s.get("tactics", []),
        },

        "device": {"hostname": device.get("hostname")},
        "actor": {
            "user_name": actor_user.get("name"),
            "process_name": actor_proc.get("name"),
        },

        "source_event": {
            "class_uid": event.get("class_uid"),
            "type_uid": event.get("type_uid"),
            "type_name": event.get("type_name"),
            "channel": (event.get("tfg") or {}).get("source_channel"),
            "event_id": (event.get("tfg") or {}).get("source_event_id"),
        },

        # Explicabilidad: que condiciones concretas casaron
        "matched_fields": {k: str(v)[:300] for k, v in matched.items()},

        "tfg": {
            "dataset_id": dataset_id,
            "detector": "sigma-evaluator",
        },
    }


def main():
    args = parse_args()

    # --- carga y compilacion de reglas ---
    dirs = args.rule_dirs if args.rule_dirs else DEFAULT_RULE_DIRS
    paths = [f"{args.rules_base}/{d}" for d in dirs]

    t0 = time.time()
    rules, errors = load_rules(paths)
    compiled = compile_rules(rules)
    t_load = time.time() - t0
    print(f"Reglas cargadas : {len(compiled)}  (errores: {len(errors)})  en {t_load:.1f}s")

    # --- Kafka ---
    consumer = Consumer({
        "bootstrap.servers": args.brokers,
        "group.id": args.group_id,
        "auto.offset.reset": "earliest" if args.from_beginning else "latest",
        "enable.auto.commit": False,
    })
    producer = Producer({
        "bootstrap.servers": args.brokers,
        "linger.ms": 50,
        "compression.type": "snappy",
        "enable.idempotence": True,
    })
    consumer.subscribe([args.source_topic])

    def stop(*_):
        global RUNNING
        RUNNING = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    stats = {"in": 0, "alerts": 0, "dlq": 0}
    idle = 0.0
    t_start = None

    print(f"Detectando {args.source_topic} -> {args.sink_topic} (Ctrl+C para parar)")

    while RUNNING:
        msg = consumer.poll(1.0)
        if msg is None:
            idle += 1.0
            producer.poll(0)
            if args.idle_exit and idle >= args.idle_exit:
                print(f"\nSin mensajes durante {idle:.0f}s, saliendo.")
                break
            continue
        if msg.error():
            raise KafkaException(msg.error())

        if t_start is None:
            t_start = time.time()
        idle = 0.0
        stats["in"] += 1
        dataset_id = header_value(msg.headers(), "dataset_id")

        try:
            payload = msg.value()
            # Hash del evento tal y como se publico: identidad estable del
            # evento de origen, independiente de offsets y de recargas.
            event_hash = hashlib.sha1(payload).hexdigest()
            event = json.loads(payload.decode("utf-8"))
            hits = evaluate_all(compiled, event)
        except Exception as exc:
            producer.produce(
                topic=args.dlq_topic,
                key=msg.key(),
                value=msg.value(),
                headers={"error": f"{type(exc).__name__}: {exc}"[:200], "stage": "detect"},
            )
            stats["dlq"] += 1
            continue

        for compiled_rule, matched in hits:
            alert = build_alert(compiled_rule, matched, event, dataset_id, event_hash)
            producer.produce(
                topic=args.sink_topic,
                key=(alert["device"]["hostname"] or "unknown").encode("utf-8"),
                value=json.dumps(alert, ensure_ascii=False).encode("utf-8"),
                timestamp=alert["time"] or 0,
                headers={
                    "rule_level": alert["rule_level"] or "",
                    "dataset_id": dataset_id or "",
                },
            )
            stats["alerts"] += 1

        if stats["in"] % args.report_every == 0:
            producer.poll(0)
            consumer.commit(asynchronous=True)
            dt = time.time() - t_start
            print(f"  ... {stats['in']} eventos, {stats['alerts']} alertas, "
                  f"{stats['in']/dt:.0f} ev/s")

    producer.flush()
    try:
        consumer.commit(asynchronous=False)
    except KafkaException:
        pass
    consumer.close()

    dt = (time.time() - t_start) if t_start else 0
    print("\nResumen")
    print(f"  Reglas activas : {len(compiled)}")
    print(f"  Eventos        : {stats['in']}")
    print(f"  Alertas        : {stats['alerts']}")
    print(f"  A DLQ          : {stats['dlq']}")
    if dt > 0:
        print(f"  Tiempo         : {dt:.1f}s")
        print(f"  Rendimiento    : {stats['in']/dt:.0f} eventos/s")
        print(f"  Evaluaciones/s : {stats['in']*len(compiled)/dt:,.0f}")


if __name__ == "__main__":
    main()