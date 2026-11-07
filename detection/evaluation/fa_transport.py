"""Transporte FA comprobado: replay sin descartes y auditoría de topics propios.

Ejecutar desde el worktree con .venv/bin/python -I. No altera topics F3.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as target:
        json.dump(value, target, ensure_ascii=False, indent=2)
        target.write("\n")


def validate_topic(topic):
    if not (topic.startswith(("raw.fa.", "norm.fa.", "det.fa.", "dlq.fa.")) or topic == "raw.net.zeek"):
        raise ValueError(f"Topic fuera del espacio autorizado FA: {topic}")


def audit(topics):
    from confluent_kafka import Consumer, TopicPartition
    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": "fa-readonly-audit",
                         "enable.auto.commit": False, "allow.auto.create.topics": False})
    result = {}
    try:
        metadata = consumer.list_topics(timeout=15)
        for topic in topics:
            validate_topic(topic)
            info = metadata.topics.get(topic)
            if info is None or info.error:
                raise RuntimeError(f"Topic ausente o inválido: {topic}")
            partitions = []
            for partition in sorted(info.partitions):
                low, high = consumer.get_watermark_offsets(TopicPartition(topic, partition), timeout=15, cached=False)
                partitions.append({"partition": partition, "low": low, "high": high, "records": high - low})
                if low != 0:
                    raise RuntimeError(f"Retención/recorte inesperado en {topic}[{partition}]")
            result[topic] = {"records": sum(p["records"] for p in partitions), "partitions": partitions}
    finally:
        consumer.close()
    return result


def replay(args):
    from confluent_kafka import Producer
    validate_topic(args.topic)
    if args.report.exists():
        raise ValueError("Informe ya existente: no se repite un replay automáticamente")
    before = audit([args.topic])
    if before[args.topic]["records"] and not args.append:
        raise ValueError("El topic debe estar vacío; no se duplica una carga previa")
    delivered, failures = 0, []

    def callback(error, message):
        nonlocal delivered
        if error is not None:
            failures.append(str(error))
        else:
            delivered += 1

    producer = Producer({"bootstrap.servers": "localhost:9092", "enable.idempotence": True,
                         "compression.type": "snappy", "linger.ms": 20,
                         "message.timeout.ms": 60000})
    opener = gzip.open if args.file.suffix == ".gz" else open
    sent, digest, started = 0, hashlib.sha256(), time.monotonic()
    exception = None
    ordinal = 0
    remaining = 0
    after = None
    try:
        with opener(args.file, "rb") as source:
            for ordinal, line in enumerate(source, 1):
                digest.update(line)
                if not line.strip():
                    raise ValueError(f"Línea vacía inesperada: {ordinal}")
                event = json.loads(line)
                if not isinstance(event, dict):
                    raise ValueError(f"Registro no objeto: {ordinal}")
                host = event.get("Hostname") or event.get("Computer") or event.get("_fa_host") or event.get("host")
                if not isinstance(host, str) or not host:
                    raise ValueError(f"Registro sin clave de host/sensor: {ordinal}")
                while True:
                    if failures:
                        raise RuntimeError(f"Error de entrega Kafka: {failures[:3]}")
                    try:
                        producer.produce(args.topic, key=host.encode(), value=line.rstrip(b"\r\n"),
                                         headers={"dataset_id": args.dataset_id, "line_no": str(ordinal),
                                                  "source": args.source}, on_delivery=callback)
                        break
                    except BufferError:
                        producer.poll(0.2)
                sent += 1
                if sent % 1000 == 0:
                    producer.poll(0)
                if sent % 50000 == 0:
                    print(f"Replay {args.dataset_id}: {sent} enviados", flush=True)
    except Exception as exc:
        exception = exc
    finally:
        try:
            remaining = producer.flush(90)
            after = audit([args.topic])
        except Exception as exc:
            exception = exception or exc
            failures.append(f"Error al cerrar/auditar: {type(exc).__name__}: {exc}")
    report = {"dataset_id": args.dataset_id, "source": str(args.file), "topic": args.topic,
              "sent": sent, "delivered": delivered, "delivery_failures": failures,
              "remaining": remaining, "source_uncompressed_sha256": digest.hexdigest(),
              "after": after, "last_source_line": ordinal,
              "exception": None if exception is None else f"{type(exception).__name__}: {exception}",
              "duration_seconds": round(time.monotonic() - started, 3)}
    save(args.report, report)
    if exception or failures or remaining or delivered != sent or after is None or after[args.topic]["records"] - before[args.topic]["records"] != sent:
        raise RuntimeError("Replay incompleto: detener sin reintentar; consultar el informe") from exception
    if args.expected and sent != args.expected:
        raise RuntimeError("La cardinalidad no coincide con el manifiesto")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("replay")
    command.add_argument("--file", type=Path, required=True)
    command.add_argument("--topic", required=True)
    command.add_argument("--dataset-id", required=True)
    command.add_argument("--source", required=True)
    command.add_argument("--expected", type=int, default=0)
    command.add_argument("--report", type=Path, required=True)
    command.add_argument("--append", action="store_true", help="Añadir otro dataset del mismo lote, comprobando el incremento")
    command = sub.add_parser("audit")
    command.add_argument("--topics", nargs="+", required=True)
    command.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "replay":
        replay(args)
    else:
        result = audit(args.topics)
        save(args.report, result)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
