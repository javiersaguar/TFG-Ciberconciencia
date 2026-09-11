"""Job de normalizacion: raw.host.windows -> norm.events (+ DLQ).

Consume eventos crudos de Windows, los normaliza a OCSF con el despachador
y publica el resultado. Los eventos sin mapeador van a la cola de rechazos.
"""
import argparse
import json
import signal
import sys

from confluent_kafka import Consumer, Producer, KafkaException

from pipeline.normalize.registry import normalize, UnmappedEvent

RUNNING = True


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--source-topic", default="raw.host.windows")
    p.add_argument("--sink-topic", default="norm.events")
    p.add_argument("--dlq-topic", default="dlq.normalize")
    p.add_argument("--group-id", default="normalizer-v1")
    p.add_argument("--from-beginning", action="store_true")
    p.add_argument("--idle-exit", type=float, default=0,
                   help="Segundos sin mensajes tras los que salir (0 = no salir)")
    return p.parse_args()


def header_value(headers, key):
    for k, v in (headers or []):
        if k == key:
            return v.decode("utf-8") if isinstance(v, bytes) else v
    return None


def main():
    args = parse_args()

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

    stats = {"in": 0, "ok": 0, "dlq": 0}
    idle = 0.0

    def stop(*_):
        global RUNNING
        RUNNING = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    print(f"Normalizando {args.source_topic} -> {args.sink_topic} (Ctrl+C para parar)")

    while RUNNING:
        msg = consumer.poll(1.0)
        if msg is None:
            idle += 1.0
            if args.idle_exit and idle >= args.idle_exit:
                print(f"\nSin mensajes durante {idle:.0f}s, saliendo.")
                break
            continue
        if msg.error():
            raise KafkaException(msg.error())

        idle = 0.0
        stats["in"] += 1
        dataset_id = header_value(msg.headers(), "dataset_id")
        ordinal = header_value(msg.headers(), "line_no")

        try:
            raw = json.loads(msg.value().decode("utf-8"))
            ocsf = normalize(raw, dataset_id=dataset_id, ordinal=ordinal)
        except (UnmappedEvent, json.JSONDecodeError, ValueError) as exc:
            producer.produce(
                topic=args.dlq_topic,
                key=msg.key(),
                value=msg.value(),
                headers={"error": str(exc)[:200], "stage": "normalize"},
            )
            stats["dlq"] += 1
        else:
            producer.produce(
                topic=args.sink_topic,
                key=(ocsf.get("device", {}).get("hostname") or "unknown").encode("utf-8"),
                value=json.dumps(ocsf, ensure_ascii=False).encode("utf-8"),
                timestamp=ocsf.get("time") or 0,
                headers={
                    "dataset_id": dataset_id or "",
                    "class_uid": str(ocsf["class_uid"]),
                },
            )
            stats["ok"] += 1

        if stats["in"] % 500 == 0:
            producer.poll(0)
            consumer.commit(asynchronous=True)
            print(f"  ... {stats['in']} procesados")

    producer.flush()
    consumer.commit(asynchronous=False)
    consumer.close()

    cobertura = stats["ok"] / stats["in"] * 100 if stats["in"] else 0
    print("\nResumen")
    print(f"  Consumidos : {stats['in']}")
    print(f"  Normalizados: {stats['ok']}")
    print(f"  A DLQ       : {stats['dlq']}")
    print(f"  Cobertura   : {cobertura:.1f} %")


if __name__ == "__main__":
    main()