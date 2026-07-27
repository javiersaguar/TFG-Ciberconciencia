"""Sink: det.alerts -> ClickHouse (tabla tfg.alerts)."""
import argparse
import json
import signal
from datetime import datetime, timezone

import clickhouse_connect
from confluent_kafka import Consumer, KafkaException

RUNNING = True

COLUMNS = [
    "alert_id", "time", "detected_at",
    "rule_id", "rule_title", "rule_level", "rule_status",
    "technique_ids", "tactic_ids",
    "device_hostname", "actor_user_name", "actor_process_name",
    "src_class_uid", "src_type_uid", "src_type_name", "src_channel", "src_event_id",
    "matched_fields", "dataset_id", "detector", "raw",
]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--topic", default="det.alerts")
    p.add_argument("--group-id", default="ch-alerts-v1")
    p.add_argument("--ch-host", default="127.0.0.1")
    p.add_argument("--ch-port", type=int, default=8123)
    p.add_argument("--batch-size", type=int, default=500)
    p.add_argument("--from-beginning", action="store_true")
    p.add_argument("--idle-exit", type=float, default=0)
    return p.parse_args()


def ts(ms):
    return datetime.fromtimestamp((ms or 0) / 1000.0, tz=timezone.utc)


def to_row(a):
    attack = a.get("attack") or {}
    device = a.get("device") or {}
    actor = a.get("actor") or {}
    src = a.get("source_event") or {}
    tfg = a.get("tfg") or {}
    return [
        a.get("alert_id") or "",
        ts(a.get("time")),
        ts(a.get("detected_at")),
        a.get("rule_id") or "",
        a.get("rule_title") or "",
        a.get("rule_level") or "",
        a.get("rule_status") or "",
        [t for t in (attack.get("technique_ids") or []) if t],
        [t for t in (attack.get("tactic_ids") or []) if t],
        device.get("hostname") or "",
        actor.get("user_name") or "",
        actor.get("process_name") or "",
        src.get("class_uid") or 0,
        src.get("type_uid") or 0,
        src.get("type_name") or "",
        src.get("channel") or "",
        src.get("event_id") or 0,
        json.dumps(a.get("matched_fields") or {}, ensure_ascii=False),
        tfg.get("dataset_id") or "",
        tfg.get("detector") or "",
        json.dumps(a, ensure_ascii=False),
    ]


def main():
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

    batch, total, idle = [], 0, 0.0
    print(f"Volcando {args.topic} -> ClickHouse tfg.alerts")

    def flush():
        nonlocal batch
        if batch:
            ch.insert("alerts", batch, column_names=COLUMNS)
            consumer.commit(asynchronous=False)
            batch = []

    while RUNNING:
        msg = consumer.poll(1.0)
        if msg is None:
            idle += 1.0
            flush()
            if args.idle_exit and idle >= args.idle_exit:
                print(f"\nSin mensajes durante {idle:.0f}s, saliendo.")
                break
            continue
        if msg.error():
            raise KafkaException(msg.error())
        idle = 0.0
        try:
            batch.append(to_row(json.loads(msg.value().decode("utf-8"))))
            total += 1
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            print(f"[WARN] alerta omitida: {exc}")
        if len(batch) >= args.batch_size:
            flush()
            print(f"  ... {total} insertadas")

    flush()
    consumer.close()
    print(f"\nTotal insertado: {total}")


if __name__ == "__main__":
    main()