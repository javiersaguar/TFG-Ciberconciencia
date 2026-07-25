"""Sink: norm.events -> ClickHouse (tabla tfg.events).

Consume eventos OCSF normalizados, extrae los campos a columnas y los
inserta por lotes en ClickHouse conservando el evento completo en 'raw'.
"""
import argparse
import json
import signal

import clickhouse_connect
from confluent_kafka import Consumer, KafkaException

from datetime import datetime, timezone

RUNNING = True


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--topic", default="norm.events")
    p.add_argument("--group-id", default="ch-sink-v1")
    p.add_argument("--ch-host", default="localhost")
    p.add_argument("--ch-port", type=int, default=8123)
    p.add_argument("--batch-size", type=int, default=500)
    p.add_argument("--from-beginning", action="store_true")
    p.add_argument("--idle-exit", type=float, default=0)
    return p.parse_args()


COLUMNS = [
    "time", "class_uid", "class_name", "activity_id", "category_uid",
    "type_uid", "severity_id", "device_hostname",
    "actor_process_name", "actor_process_pid", "actor_user_name",
    "target_process_name", "target_process_pid", "file_path",
    "dst_ip", "dst_port",
    "signal_lsass_access", "signal_suspicious_access", "signal_dump_module",
    "signal_dump_file", "signal_log_cleared", "signal_remote_logon",
    "dataset_id", "source_channel", "source_event_id", "raw",
]


def to_row(e):
    """Aplana un evento OCSF a una fila de la tabla (orden = COLUMNS)."""
    actor = e.get("actor", {}) or {}
    actor_proc = actor.get("process", {}) or {}
    actor_user = actor.get("user", {}) or {}
    proc = e.get("process", {}) or {}
    file = e.get("file", {}) or {}
    dst = e.get("dst_endpoint", {}) or {}
    tfg = e.get("tfg", {}) or {}

    ts_ms = e.get("time") or 0
    return [
        datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc),
        e.get("class_uid") or 0,
        e.get("type_name", "") or "",
        e.get("activity_id") or 0,
        e.get("category_uid") or 0,
        e.get("type_uid") or 0,
        e.get("severity_id") or 0,
        (e.get("device", {}) or {}).get("hostname") or "",
        actor_proc.get("name") or "",
        actor_proc.get("pid"),
        actor_user.get("name") or "",
        proc.get("name") or "",
        proc.get("pid"),
        (file.get("path") or proc.get("file", {}).get("path")) or "",
        dst.get("ip"),
        dst.get("port"),
        bool(tfg.get("signal_lsass_access")),
        bool(tfg.get("signal_suspicious_access")),
        bool(tfg.get("signal_dump_module")),
        bool(tfg.get("signal_dump_file")),
        bool(tfg.get("signal_log_cleared")),
        bool(tfg.get("signal_remote_logon")),
        tfg.get("dataset_id") or "",
        tfg.get("source_channel") or "",
        tfg.get("source_event_id") or 0,
        json.dumps(e, ensure_ascii=False),
    ]


def main():
    args = parse_args()

    ch = clickhouse_connect.get_client(
        host=args.ch_host, port=args.ch_port, username="tfg", password="tfg", database="tfg"
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
    print(f"Volcando {args.topic} -> ClickHouse tfg.events (Ctrl+C para parar)")

    def flush():
        nonlocal batch
        if batch:
            ch.insert("events", batch, column_names=COLUMNS)
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
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"[WARN] evento omitido: {exc}")
        if len(batch) >= args.batch_size:
            flush()
            print(f"  ... {total} insertados")

    flush()
    consumer.close()
    print(f"\nTotal insertado: {total}")


if __name__ == "__main__":
    main()