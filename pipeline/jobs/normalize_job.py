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


def clave_particion(ocsf):
    """Clave de particion de norm.events: la IDENTIDAD del evento.

    Hasta el 14-09-2026 se particionaba por `device.hostname`. Con los pocos
    hosts distintos del corpus de F3 eso concentraba los mensajes en muy pocas
    particiones, y encima las dos claves mas grandes -MKT01, que suma cuatro
    campanas LSASS, y SCRANTON en apt29- colisionaban en la misma: 350.118 de
    530.401 mensajes (66 %) en la particion 1. Como una particion solo la
    consume una instancia, el paralelismo de la deteccion era decorativo: la
    carga del 11-09 no termino.

    Particionar por host no protegia nada que se usara. Los dos consumidores de
    norm.events no dependen del orden: `detect_job` evalua reglas Sigma evento
    a evento sin estado, y `sink_clickhouse` inserta en una tabla que deduplica.
    Flink NO lee este topic: lee `det.alerts`, cuya clave construye `detect_job`
    por su cuenta, y ademas impone su propio orden (PARTITION BY dataset, host
    + ORDER BY ts con marca de agua).

    La identidad del evento es la eleccion natural:
      - DETERMINISTA: el mismo evento cae siempre en la misma particion, asi que
        una recarga reproduce el reparto exacto.
      - UNIFORME por cardinalidad, no por suerte: ~530.000 valores distintos en
        vez de 12, sin claves indivisibles que marquen un minimo de tiempo.
      - Es la misma identidad que la clave de ordenacion de tfg.events.

    Simulado en ClickHouse con CRC32 % 6 -validado antes reproduciendo al
    evento el reparto real de la clave por host-: 87.948 a 88.629 mensajes por
    particion, todas entre el 16,6 y el 16,7 %.

    Los valores por defecto (`or ""`, `or 0`) son deliberadamente los MISMOS que
    usa `sink_clickhouse.to_row` al rellenar esas columnas: es lo que hace que la
    cadena coincida byte a byte con la simulada.
    """
    tfg = ocsf.get("tfg", {}) or {}
    host = (ocsf.get("device", {}) or {}).get("hostname") or ""
    return "|".join((
        tfg.get("dataset_id") or "",
        host,
        tfg.get("source_channel") or "",
        str(tfg.get("record_number") or 0),
    )).encode("utf-8")


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
                key=clave_particion(ocsf),
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