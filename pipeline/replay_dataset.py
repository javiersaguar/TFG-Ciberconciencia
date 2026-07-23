"""
Replay de datasets de seguridad (OTRF Security-Datasets) hacia Redpanda.

Lee un fichero JSON Lines de eventos y los publica en un topic, opcionalmente
respetando el ritmo temporal original de los eventos.

Uso:
    python pipeline/replay_dataset.py --file <ruta.json> --topic raw.host.windows
"""

import argparse
import json
import sys
import time
from datetime import datetime

from confluent_kafka import Producer

# Campos candidatos donde estos datasets guardan la marca de tiempo
TIMESTAMP_FIELDS = ("TimeCreated", "@timestamp", "UtcTime", "EventTime")


def parse_args():
    p = argparse.ArgumentParser(description="Replay de eventos hacia Redpanda")
    p.add_argument("--file", required=True, help="Fichero JSON Lines de entrada")
    p.add_argument("--topic", default="raw.host.windows", help="Topic destino")
    p.add_argument("--brokers", default="localhost:9092", help="Broker Kafka/Redpanda")
    p.add_argument("--dataset-id", default="unknown",
                   help="ID del dataset (p. ej. SDWIN-201018195009), va como cabecera")
    p.add_argument("--speed", type=float, default=0.0,
                   help="Factor de velocidad temporal: 0 = a máxima velocidad, "
                        "1 = tiempo real, 10 = 10x más rápido")
    p.add_argument("--limit", type=int, default=0, help="Máximo de eventos (0 = todos)")
    return p.parse_args()


def extract_timestamp(event):
    """Devuelve el timestamp del evento en epoch-ms, o None si no se puede."""
    for field in TIMESTAMP_FIELDS:
        raw = event.get(field)
        if not raw:
            continue
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d %H:%M:%S"):
            try:
                return int(datetime.strptime(raw, fmt).timestamp() * 1000)
            except (ValueError, TypeError):
                continue
    return None


def build_key(event):
    """Clave de particionado: el host. Garantiza orden por máquina."""
    host = event.get("Hostname") or event.get("Computer") or "unknown"
    return str(host).encode("utf-8")


def delivery_report(err, msg):
    if err is not None:
        print(f"[ERROR] Fallo al entregar: {err}", file=sys.stderr)


def main():
    args = parse_args()

    producer = Producer({
        "bootstrap.servers": args.brokers,
        "linger.ms": 50,
        "compression.type": "snappy",
        "enable.idempotence": True,
    })

    sent = 0
    skipped = 0
    prev_ts = None
    started = time.time()

    with open(args.file, "r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                print(f"[WARN] Linea {line_no} no es JSON valido, se omite", file=sys.stderr)
                continue

            ts = extract_timestamp(event)

            # Reproducir el ritmo temporal original si se pide
            if args.speed > 0 and ts is not None and prev_ts is not None:
                delta = (ts - prev_ts) / 1000.0 / args.speed
                if 0 < delta < 60:          # ignora saltos absurdos
                    time.sleep(delta)
            if ts is not None:
                prev_ts = ts

            producer.produce(
                topic=args.topic,
                key=build_key(event),
                value=json.dumps(event).encode("utf-8"),
                timestamp=ts if ts is not None else 0,
                headers={
                    "dataset_id": args.dataset_id,
                    "source": "otrf-security-datasets",
                },
                on_delivery=delivery_report,
            )
            sent += 1

            if sent % 1000 == 0:
                producer.poll(0)
                print(f"  ... {sent} eventos enviados")

            if args.limit and sent >= args.limit:
                break

    producer.flush()
    elapsed = time.time() - started

    print(f"\nReplay completado")
    print(f"  Topic          : {args.topic}")
    print(f"  Eventos        : {sent}")
    print(f"  Omitidos       : {skipped}")
    print(f"  Tiempo         : {elapsed:.2f}s")
    if elapsed > 0:
        print(f"  Throughput     : {sent / elapsed:.0f} ev/s")


if __name__ == "__main__":
    main()